const express = require('express');
const Joi = require('joi');
const BettingAnalyzer = require('../services/BettingAnalyzer');
const { Match, Competition } = require('../models');
const logger = require('../config/logger');

const router = express.Router();
const bettingAnalyzer = new BettingAnalyzer();

// Validation schemas
const analyzeOddsSchema = Joi.object({
  matchId: Joi.number().integer().positive().required(),
  odds: Joi.object({
    homeWin: Joi.number().positive(),
    draw: Joi.number().positive(),
    awayWin: Joi.number().positive(),
  }).optional(),
});

const bulkAnalyzeSchema = Joi.object({
  matchIds: Joi.array().items(Joi.number().integer().positive()).min(1).max(50).required(),
  oddsMap: Joi.object().pattern(
    Joi.number(),
    Joi.object({
      homeWin: Joi.number().positive(),
      draw: Joi.number().positive(),
      awayWin: Joi.number().positive(),
    })
  ).optional(),
});

const performanceSchema = Joi.object({
  days: Joi.number().integer().min(1).max(365).default(30),
  minConfidence: Joi.number().min(0).max(1).default(0.6),
  includeAllBets: Joi.boolean().default(false),
});

const trendsSchema = Joi.object({
  days: Joi.number().integer().min(1).max(365).default(90),
  competitionId: Joi.number().integer().positive(),
  outcome: Joi.string().valid('HOME_TEAM', 'AWAY_TEAM', 'DRAW'),
});

const valueBetsSchema = Joi.object({
  competitionId: Joi.number().integer().positive(),
  minValue: Joi.number().min(0).max(1).default(0.05),
  minConfidence: Joi.number().min(0).max(1).default(0.6),
  days: Joi.number().integer().min(1).max(30).default(7),
});

// POST /api/v1/betting/analyze - Analyze betting odds
router.post('/analyze', async (req, res, next) => {
  try {
    const { error, value } = analyzeOddsSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation Error',
          details: error.details,
        },
      });
    }

    const { matchId, odds } = value;

    // Check if match exists
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
          message: 'Match not available for betting analysis',
          details: 'Only scheduled matches can be analyzed for betting',
        },
      });
    }

    const startTime = Date.now();
    const analysis = await bettingAnalyzer.analyzeBettingOdds(matchId, odds);
    const duration = Date.now() - startTime;

    res.json({
      success: true,
      message: 'Betting analysis completed',
      data: {
        ...analysis,
        duration: `${duration}ms`,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/betting/bulk-analyze - Analyze multiple matches
router.post('/bulk-analyze', async (req, res, next) => {
  try {
    const { error, value } = bulkAnalyzeSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation Error',
          details: error.details,
        },
      });
    }

    const { matchIds, oddsMap } = value;

    logger.info(`Bulk betting analysis requested for ${matchIds.length} matches`);

    const startTime = Date.now();
    const results = await bettingAnalyzer.analyzeMultipleMatches(matchIds, oddsMap);
    const duration = Date.now() - startTime;

    res.json({
      success: true,
      message: 'Bulk betting analysis completed',
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

// GET /api/v1/betting/performance - Betting performance
router.get('/performance', async (req, res, next) => {
  try {
    const { error, value } = performanceSchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation Error',
          details: error.details,
        },
      });
    }

    const { days, minConfidence, includeAllBets } = value;

    const performance = await bettingAnalyzer.getBettingPerformance({
      days,
      minConfidence,
      includeAllBets,
    });

    res.json({
      success: true,
      data: performance,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/betting/trends - Betting trends
router.get('/trends', async (req, res, next) => {
  try {
    const { error, value } = trendsSchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation Error',
          details: error.details,
        },
      });
    }

    const { days, competitionId, outcome } = value;

    const trends = await bettingAnalyzer.getBettingTrends({
      days,
      competitionId,
      outcome,
    });

    res.json({
      success: true,
      data: {
        period: `${days} days`,
        competitionId,
        outcome,
        trends,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/betting/value-bets - Find value bets
router.get('/value-bets', async (req, res, next) => {
  try {
    const { error, value } = valueBetsSchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation Error',
          details: error.details,
        },
      });
    }

    const { competitionId, minValue, minConfidence, days } = value;

    // Get upcoming matches
    const whereConditions = {
      status: 'SCHEDULED',
      utcDate: {
        [require('sequelize').Op.between]: [
          new Date(),
          new Date(Date.now() + days * 24 * 60 * 60 * 1000),
        ],
      },
    };

    if (competitionId) {
      whereConditions.competitionId = competitionId;
    }

    const matches = await Match.findAll({
      where: whereConditions,
      include: [
        { model: require('../models').Team, as: 'homeTeam' },
        { model: require('../models').Team, as: 'awayTeam' },
        { model: require('../models').Competition, as: 'competition' },
      ],
      order: [['utcDate', 'ASC']],
    });

    if (matches.length === 0) {
      return res.json({
        success: true,
        data: {
          message: 'No upcoming matches found for value bet analysis',
          matches: [],
          valueBets: [],
        },
      });
    }

    const matchIds = matches.map(m => m.id);
    const results = await bettingAnalyzer.analyzeMultipleMatches(matchIds);

    // Filter for value bets based on criteria
    const valueBets = results.results.filter(result => {
      const bestValueBet = result.valueAnalysis.find(bet => bet.isValueBet);
      return bestValueBet && 
             bestValueBet.value >= minValue && 
             result.aiPrediction.confidence >= minConfidence;
    });

    res.json({
      success: true,
      data: {
        criteria: {
          competitionId,
          minValue,
          minConfidence,
          days,
        },
        totalMatches: matches.length,
        valueBetsFound: valueBets.length,
        valueBets: valueBets.map(bet => ({
          matchId: bet.matchId,
          homeTeam: bet.match.homeTeam,
          awayTeam: bet.match.awayTeam,
          utcDate: bet.match.utcDate,
          bestValueBet: bet.valueAnalysis.find(v => v.isValueBet),
          aiConfidence: bet.aiPrediction.confidence,
          recommendation: bet.recommendations.overallRecommendation,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/betting/odds/:matchId - Get odds for a match
router.get('/odds/:matchId', async (req, res, next) => {
  try {
    const schema = Joi.object({
      matchId: Joi.number().integer().positive().required(),
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

    const { matchId } = value;

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

    const odds = bettingAnalyzer.extractOddsFromMatch(match);

    if (!odds) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'No odds available',
          details: 'Betting odds are not available for this match',
        },
      });
    }

    const impliedProbabilities = bettingAnalyzer.calculateImpliedProbabilities(odds);

    res.json({
      success: true,
      data: {
        matchId,
        match: {
          homeTeam: match.homeTeam.name,
          awayTeam: match.awayTeam.name,
          utcDate: match.utcDate,
          competition: match.competition.name,
        },
        odds,
        impliedProbabilities,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/betting/kelly/:matchId - Get Kelly Criterion for a match
router.get('/kelly/:matchId', async (req, res, next) => {
  try {
    const schema = Joi.object({
      matchId: Joi.number().integer().positive().required(),
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

    const { matchId } = value;

    const analysis = await bettingAnalyzer.analyzeBettingOdds(matchId);

    res.json({
      success: true,
      data: {
        matchId,
        match: analysis.match,
        kellyRecommendations: analysis.kellyRecommendations,
        expectedValues: analysis.expectedValues,
        aiPrediction: analysis.aiPrediction,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/betting/update-odds/:matchId - Update odds for a match
router.post('/update-odds/:matchId', async (req, res, next) => {
  try {
    const schema = Joi.object({
      matchId: Joi.number().integer().positive().required(),
    });

    const oddsSchema = Joi.object({
      homeWin: Joi.number().positive().required(),
      draw: Joi.number().positive().required(),
      awayWin: Joi.number().positive().required(),
    });

    const { error: paramError, value: params } = schema.validate(req.params);
    if (paramError) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation Error',
          details: paramError.details,
        },
      });
    }

    const { error: bodyError, value: odds } = oddsSchema.validate(req.body);
    if (bodyError) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation Error',
          details: bodyError.details,
        },
      });
    }

    const { matchId } = params;

    const match = await Match.findByPk(matchId);
    if (!match) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Match not found',
          details: 'The requested match does not exist',
        },
      });
    }

    // Update odds
    await match.update({
      homeTeamWinOdds: odds.homeWin,
      drawOdds: odds.draw,
      awayTeamWinOdds: odds.awayWin,
    });

    res.json({
      success: true,
      message: 'Odds updated successfully',
      data: {
        matchId,
        odds,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
