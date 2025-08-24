const express = require('express');
const Joi = require('joi');
const AIPredictor = require('../services/AIPredictor');
const MLModels = require('../services/MLModels');
const { Match, Competition } = require('../models');
const logger = require('../config/logger');

const router = express.Router();
const aiPredictor = new AIPredictor();
const mlModels = new MLModels();

// Validation schemas
const trainModelsSchema = Joi.object({
  competitionId: Joi.number().integer().positive().required(),
  season: Joi.number().integer().min(2000).max(2030),
  modelTypes: Joi.array().items(Joi.string().valid('random_forest', 'neural_network')).default(['random_forest']),
  trainingOptions: Joi.object({
    randomForest: Joi.object({
      nEstimators: Joi.number().integer().min(10).max(500).default(100),
      maxDepth: Joi.number().integer().min(1).max(50).default(10),
      minSamplesSplit: Joi.number().integer().min(2).default(2),
      minSamplesLeaf: Joi.number().integer().min(1).default(1),
    }),
    neuralNetwork: Joi.object({
      layers: Joi.array().items(Joi.number().integer().positive()).default([64, 32, 16]),
      learningRate: Joi.number().positive().default(0.001),
      epochs: Joi.number().integer().positive().default(100),
      batchSize: Joi.number().integer().positive().default(32),
    }),
  }),
});

const predictMatchSchema = Joi.object({
  matchId: Joi.number().integer().positive().required(),
  modelName: Joi.string().optional(),
});

const bulkPredictSchema = Joi.object({
  matchIds: Joi.array().items(Joi.number().integer().positive()).min(1).max(100).required(),
  modelName: Joi.string().optional(),
});

const predictionHistorySchema = Joi.object({
  competitionId: Joi.number().integer().positive(),
  modelName: Joi.string(),
  limit: Joi.number().integer().min(1).max(1000).default(100),
  offset: Joi.number().integer().min(0).default(0),
  includeResults: Joi.boolean().default(true),
});

// POST /api/v1/predictions/train - Train models
router.post('/train', async (req, res, next) => {
  try {
    const { error, value } = trainModelsSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation Error',
          details: error.details,
        },
      });
    }

    const { competitionId, season, modelTypes, trainingOptions } = value;

    // Check if competition exists
    const competition = await Competition.findOne({
      where: { id: competitionId, isActive: true },
    });

    if (!competition) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Competition not found',
          details: 'The requested competition does not exist',
        },
      });
    }

    logger.info(`Training models for competition ${competition.name}`, {
      competitionId,
      season,
      modelTypes,
    });

    const startTime = Date.now();
    const results = await aiPredictor.trainModels(competitionId, {
      season,
      modelTypes,
      trainingOptions,
    });
    const duration = Date.now() - startTime;

    res.json({
      success: true,
      message: 'Model training completed',
      data: {
        competition: {
          id: competition.id,
          name: competition.name,
          code: competition.code,
        },
        results,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/predictions/predict - Single prediction
router.post('/predict', async (req, res, next) => {
  try {
    const { error, value } = predictMatchSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation Error',
          details: error.details,
        },
      });
    }

    const { matchId, modelName } = value;

    // Check if match exists and is scheduled
    const match = await Match.findByPk(matchId, {
      include: [
        { model: require('../models').Team, as: 'homeTeam' },
        { model: require('../models').Team, as: 'awayTeam' },
        { model: require('../models').Competition, as: 'competition' },
      ],
    });

    if (!match) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Match not found',
          details: 'The requested match does not exist',
        },
      });
    }

    if (match.status !== 'SCHEDULED') {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Match not available for prediction',
          details: `Match status is ${match.status}, only SCHEDULED matches can be predicted`,
        },
      });
    }

    const startTime = Date.now();
    const prediction = await aiPredictor.predictMatch(matchId, modelName);
    const duration = Date.now() - startTime;

    res.json({
      success: true,
      message: 'Prediction completed successfully',
      data: {
        match: {
          id: match.id,
          homeTeam: match.homeTeam.name,
          awayTeam: match.awayTeam.name,
          utcDate: match.utcDate,
          competition: match.competition.name,
        },
        prediction: {
          predictedWinner: prediction.prediction.predictedWinner,
          confidence: prediction.confidence,
          probabilities: {
            homeTeamWin: prediction.probabilities.HOME_TEAM,
            draw: prediction.probabilities.DRAW,
            awayTeamWin: prediction.probabilities.AWAY_TEAM,
          },
          model: prediction.model,
          timestamp: prediction.prediction.predictionTimestamp,
        },
        duration: `${duration}ms`,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/predictions/bulk - Multiple predictions
router.post('/bulk', async (req, res, next) => {
  try {
    const { error, value } = bulkPredictSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation Error',
          details: error.details,
        },
      });
    }

    const { matchIds, modelName } = value;

    logger.info(`Bulk prediction requested for ${matchIds.length} matches`);

    const startTime = Date.now();
    const results = await aiPredictor.predictBulk(matchIds, modelName);
    const duration = Date.now() - startTime;

    res.json({
      success: true,
      message: 'Bulk prediction completed',
      data: {
        ...results,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/predictions/upcoming/:competition - Upcoming matches
router.get('/upcoming/:competition', async (req, res, next) => {
  try {
    const schema = Joi.object({
      competition: Joi.number().integer().positive().required(),
    });

    const { error, value } = schema.validate(req.params);
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation Error',
          details: error.details,
        },
      });
    }

    const { competition } = value;
    const days = parseInt(req.query.days) || 7;

    // Check if competition exists
    const competitionData = await Competition.findOne({
      where: { id: competition, isActive: true },
    });

    if (!competitionData) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Competition not found',
          details: 'The requested competition does not exist',
        },
      });
    }

    const matches = await aiPredictor.getUpcomingMatches(competition, days);

    res.json({
      success: true,
      data: {
        competition: {
          id: competitionData.id,
          name: competitionData.name,
          code: competitionData.code,
        },
        upcomingMatches: matches.map(match => ({
          id: match.id,
          utcDate: match.utcDate,
          homeTeam: match.homeTeam.name,
          awayTeam: match.awayTeam.name,
          matchday: match.matchday,
          stage: match.stage,
          isPredicted: match.isPredicted,
          predictedWinner: match.predictedWinner,
          predictionConfidence: match.predictionConfidence,
        })),
        total: matches.length,
        days,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/predictions/history - Prediction history
router.get('/history', async (req, res, next) => {
  try {
    const { error, value } = predictionHistorySchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation Error',
          details: error.details,
        },
      });
    }

    const { competitionId, modelName, limit, offset, includeResults } = value;

    const history = await aiPredictor.getPredictionHistory({
      competitionId,
      modelName,
      limit,
      offset,
      includeResults,
    });

    res.json({
      success: true,
      data: {
        predictions: history.predictions.map(p => ({
          id: p.id,
          matchId: p.matchId,
          modelName: p.modelName,
          predictedWinner: p.predictedWinner,
          confidence: p.confidence,
          probabilities: {
            homeTeamWin: p.homeTeamWinProbability,
            draw: p.drawProbability,
            awayTeamWin: p.awayTeamWinProbability,
          },
          actualWinner: p.actualWinner,
          isCorrect: p.isCorrect,
          predictionTimestamp: p.predictionTimestamp,
          match: p.match ? {
            homeTeam: p.match.homeTeam.name,
            awayTeam: p.match.awayTeam.name,
            utcDate: p.match.utcDate,
            status: p.match.status,
            winner: p.match.winner,
            competition: p.match.competition.name,
          } : null,
        })),
        total: history.total,
        accuracy: history.accuracy,
        pagination: history.pagination,
        filters: {
          competitionId,
          modelName,
          includeResults,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/predictions/models - List available models
router.get('/models', async (req, res, next) => {
  try {
    const models = await mlModels.listModels();
    
    const modelDetails = await Promise.all(
      models.map(async (model) => {
        try {
          const modelData = await mlModels.loadModel(model.name);
          return {
            ...model,
            info: mlModels.getModelInfo(modelData),
          };
        } catch (error) {
          logger.warn(`Error loading model ${model.name}:`, error.message);
          return {
            ...model,
            info: { error: 'Failed to load model' },
          };
        }
      })
    );

    res.json({
      success: true,
      data: {
        models: modelDetails,
        total: models.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/predictions/performance/:modelName - Get model performance
router.get('/performance/:modelName', async (req, res, next) => {
  try {
    const schema = Joi.object({
      modelName: Joi.string().required(),
    });

    const { error, value } = schema.validate(req.params);
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation Error',
          details: error.details,
        },
      });
    }

    const { modelName } = value;

    const performance = await aiPredictor.getModelPerformance(modelName);

    res.json({
      success: true,
      data: performance,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/predictions/upcoming/:competition/predict - Predict upcoming matches
router.post('/upcoming/:competition/predict', async (req, res, next) => {
  try {
    const schema = Joi.object({
      competition: Joi.number().integer().positive().required(),
    });

    const { error, value } = schema.validate(req.params);
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation Error',
          details: error.details,
        },
      });
    }

    const { competition } = value;
    const days = parseInt(req.body.days) || 7;

    // Check if competition exists
    const competitionData = await Competition.findOne({
      where: { id: competition, isActive: true },
    });

    if (!competitionData) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Competition not found',
          details: 'The requested competition does not exist',
        },
      });
    }

    const startTime = Date.now();
    const results = await aiPredictor.predictUpcomingMatches(competition, days);
    const duration = Date.now() - startTime;

    res.json({
      success: true,
      message: 'Upcoming matches prediction completed',
      data: {
        ...results,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/predictions/cache/clear - Clear prediction cache
router.post('/cache/clear', async (req, res, next) => {
  try {
    aiPredictor.clearCache();
    
    res.json({
      success: true,
      message: 'Prediction cache cleared successfully',
      data: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
