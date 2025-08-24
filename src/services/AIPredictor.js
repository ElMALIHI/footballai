const logger = require('../config/logger');
const FeatureEngineering = require('./FeatureEngineering');
const MLModels = require('./MLModels');
const { Match, Prediction } = require('../models');
const { Op } = require('sequelize');

class AIPredictor {
  constructor() {
    this.featureEngineering = new FeatureEngineering();
    this.mlModels = new MLModels();
    this.models = new Map();
    this.predictionThreshold = parseFloat(process.env.ML_PREDICTION_THRESHOLD) || 0.6;
  }

  /**
   * Train models for a specific competition
   */
  async trainModels(competitionId, options = {}) {
    try {
      logger.info(`Training models for competition ${competitionId}...`);

      const {
        season = null,
        modelTypes = ['random_forest'],
        trainingOptions = {},
      } = options;

      // Get training data
      const trainingData = await this.mlModels.getTrainingData({
        competitionId,
        season,
        limit: 1000,
        daysBack: 730, // 2 years
      });

      if (trainingData.length < 50) {
        throw new Error(`Insufficient training data: ${trainingData.length} matches (minimum 50 required)`);
      }

      const results = {};

      // Train each model type
      for (const modelType of modelTypes) {
        try {
          let model;
          
          if (modelType === 'random_forest') {
            model = await this.mlModels.trainRandomForest(trainingData, {
              nEstimators: 100,
              maxDepth: 10,
              minSamplesSplit: 2,
              minSamplesLeaf: 1,
              ...trainingOptions.randomForest,
            });
          } else if (modelType === 'neural_network') {
            model = await this.mlModels.trainNeuralNetwork(trainingData, {
              layers: [64, 32, 16],
              learningRate: 0.001,
              epochs: 100,
              batchSize: 32,
              ...trainingOptions.neuralNetwork,
            });
          }

          if (model) {
            // Evaluate model
            const evaluation = await this.mlModels.evaluateModel(model, trainingData.slice(-100)); // Last 100 for testing
            
            // Save model
            const modelName = `${competitionId}_${modelType}_${Date.now()}`;
            await this.mlModels.saveModel(model, modelName);
            
            // Store model info
            this.models.set(modelName, {
              model,
              info: this.mlModels.getModelInfo(model),
              evaluation,
              competitionId,
              season,
            });

            results[modelType] = {
              modelName,
              evaluation,
              trainingSamples: trainingData.length,
            };

            logger.info(`Model ${modelType} trained successfully: ${evaluation.accuracy.toFixed(3)} accuracy`);
          }
        } catch (error) {
          logger.error(`Error training ${modelType} model:`, error);
          results[modelType] = { error: error.message };
        }
      }

      return results;
    } catch (error) {
      logger.error('Error training models:', error);
      throw error;
    }
  }

  /**
   * Make prediction for a specific match
   */
  async predictMatch(matchId, modelName = null) {
    try {
      logger.info(`Making prediction for match ${matchId}...`);

      // Get match data
      const match = await Match.findByPk(matchId, {
        include: [
          { model: require('../models').Team, as: 'homeTeam' },
          { model: require('../models').Team, as: 'awayTeam' },
          { model: require('../models').Competition, as: 'competition' },
        ],
      });

      if (!match) {
        throw new Error(`Match with ID ${matchId} not found`);
      }

      if (match.status !== 'SCHEDULED') {
        throw new Error(`Match is not scheduled for prediction (status: ${match.status})`);
      }

      // Generate features
      const features = await this.featureEngineering.generateMatchFeatures(matchId, true);
      const normalizedFeatures = this.featureEngineering.normalizeFeatures(features);

      // Get best model for this competition
      const bestModel = await this.getBestModel(match.competitionId, modelName);
      
      if (!bestModel) {
        throw new Error(`No trained model available for competition ${match.competitionId}`);
      }

      // Make prediction
      let prediction;
      if (bestModel.model.type === 'random_forest') {
        prediction = await this.mlModels.predictRandomForest(bestModel.model, normalizedFeatures);
      } else if (bestModel.model.type === 'neural_network') {
        // Placeholder for neural network prediction
        prediction = {
          prediction: 'HOME_TEAM',
          probabilities: { HOME_TEAM: 0.4, AWAY_TEAM: 0.35, DRAW: 0.25 },
          confidence: 0.4,
          modelType: 'neural_network',
        };
      }

      // Check confidence threshold
      if (prediction.confidence < this.predictionThreshold) {
        logger.warn(`Low confidence prediction (${prediction.confidence.toFixed(3)}) for match ${matchId}`);
      }

      // Store prediction in database
      const predictionRecord = await this.storePrediction(matchId, bestModel.modelName, prediction);

      // Update match with prediction
      await this.updateMatchPrediction(matchId, prediction);

      return {
        matchId,
        prediction: predictionRecord,
        model: bestModel.modelName,
        confidence: prediction.confidence,
        probabilities: prediction.probabilities,
      };
    } catch (error) {
      logger.error(`Error predicting match ${matchId}:`, error);
      throw error;
    }
  }

  /**
   * Make bulk predictions for multiple matches
   */
  async predictBulk(matchIds, modelName = null) {
    try {
      logger.info(`Making bulk predictions for ${matchIds.length} matches...`);

      const results = [];
      const errors = [];

      for (const matchId of matchIds) {
        try {
          const prediction = await this.predictMatch(matchId, modelName);
          results.push(prediction);
        } catch (error) {
          logger.error(`Error predicting match ${matchId}:`, error);
          errors.push({ matchId, error: error.message });
        }
      }

      return {
        successful: results.length,
        failed: errors.length,
        results,
        errors,
      };
    } catch (error) {
      logger.error('Error in bulk prediction:', error);
      throw error;
    }
  }

  /**
   * Get the best model for a competition
   */
  async getBestModel(competitionId, modelName = null) {
    try {
      if (modelName) {
        // Load specific model
        const model = await this.mlModels.loadModel(modelName);
        return {
          model,
          modelName,
          info: this.mlModels.getModelInfo(model),
        };
      }

      // Find best model for competition
      const availableModels = await this.mlModels.listModels();
      const competitionModels = availableModels.filter(m => 
        m.name.startsWith(`${competitionId}_`)
      );

      if (competitionModels.length === 0) {
        return null;
      }

      // Get the most recent model
      const bestModel = competitionModels.sort((a, b) => 
        new Date(b.modified) - new Date(a.modified)
      )[0];

      const model = await this.mlModels.loadModel(bestModel.name);
      return {
        model,
        modelName: bestModel.name,
        info: this.mlModels.getModelInfo(model),
      };
    } catch (error) {
      logger.error('Error getting best model:', error);
      return null;
    }
  }

  /**
   * Store prediction in database
   */
  async storePrediction(matchId, modelName, prediction) {
    try {
      const [predictionRecord, created] = await Prediction.findOrCreate({
        where: { matchId, modelName },
        defaults: {
          matchId,
          modelName,
          modelVersion: '1.0',
          homeTeamWinProbability: prediction.probabilities.HOME_TEAM || 0,
          drawProbability: prediction.probabilities.DRAW || 0,
          awayTeamWinProbability: prediction.probabilities.AWAY_TEAM || 0,
          predictedWinner: prediction.prediction,
          confidence: prediction.confidence,
          predictionTimestamp: new Date(),
        },
      });

      if (!created) {
        // Update existing prediction
        await predictionRecord.update({
          homeTeamWinProbability: prediction.probabilities.HOME_TEAM || 0,
          drawProbability: prediction.probabilities.DRAW || 0,
          awayTeamWinProbability: prediction.probabilities.AWAY_TEAM || 0,
          predictedWinner: prediction.prediction,
          confidence: prediction.confidence,
          predictionTimestamp: new Date(),
        });
      }

      return predictionRecord;
    } catch (error) {
      logger.error('Error storing prediction:', error);
      throw error;
    }
  }

  /**
   * Update match with prediction data
   */
  async updateMatchPrediction(matchId, prediction) {
    try {
      await Match.update({
        isPredicted: true,
        predictedWinner: prediction.prediction,
        homeTeamWinProbability: prediction.probabilities.HOME_TEAM || 0,
        drawProbability: prediction.probabilities.DRAW || 0,
        awayTeamWinProbability: prediction.probabilities.AWAY_TEAM || 0,
        predictionConfidence: prediction.confidence,
        predictionModel: 'AI_Predictor',
        predictionTimestamp: new Date(),
      }, {
        where: { id: matchId },
      });
    } catch (error) {
      logger.error('Error updating match prediction:', error);
      throw error;
    }
  }

  /**
   * Get upcoming matches for prediction
   */
  async getUpcomingMatches(competitionId = null, days = 7) {
    try {
      const whereConditions = {
        status: 'SCHEDULED',
        utcDate: {
          [Op.between]: [
            new Date(),
            new Date(Date.now() + days * 24 * 60 * 60 * 1000),
          ],
        },
        isPredicted: false,
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

      return matches;
    } catch (error) {
      logger.error('Error getting upcoming matches:', error);
      throw error;
    }
  }

  /**
   * Predict upcoming matches for a competition
   */
  async predictUpcomingMatches(competitionId, days = 7) {
    try {
      logger.info(`Predicting upcoming matches for competition ${competitionId}...`);

      const matches = await this.getUpcomingMatches(competitionId, days);
      
      if (matches.length === 0) {
        return { message: 'No upcoming matches to predict' };
      }

      const matchIds = matches.map(m => m.id);
      const results = await this.predictBulk(matchIds);

      return {
        competitionId,
        days,
        matchesFound: matches.length,
        predictions: results,
      };
    } catch (error) {
      logger.error('Error predicting upcoming matches:', error);
      throw error;
    }
  }

  /**
   * Get prediction history
   */
  async getPredictionHistory(options = {}) {
    const {
      competitionId = null,
      modelName = null,
      limit = 100,
      offset = 0,
      includeResults = true,
    } = options;

    try {
      const whereConditions = {};
      
      if (competitionId) {
        whereConditions['$match.competitionId$'] = competitionId;
      }
      
      if (modelName) {
        whereConditions.modelName = modelName;
      }

      const predictions = await Prediction.findAndCountAll({
        where: whereConditions,
        include: [
          {
            model: Match,
            as: 'match',
            include: [
              { model: require('../models').Team, as: 'homeTeam' },
              { model: require('../models').Team, as: 'awayTeam' },
              { model: require('../models').Competition, as: 'competition' },
            ],
          },
        ],
        order: [['predictionTimestamp', 'DESC']],
        limit,
        offset,
      });

      // Calculate accuracy if results are included
      let accuracy = null;
      if (includeResults) {
        const completedPredictions = predictions.rows.filter(p => 
          p.match && p.match.status === 'FINISHED' && p.match.winner
        );
        
        if (completedPredictions.length > 0) {
          const correct = completedPredictions.filter(p => 
            p.predictedWinner === p.match.winner
          ).length;
          
          accuracy = correct / completedPredictions.length;
        }
      }

      return {
        predictions: predictions.rows,
        total: predictions.count,
        accuracy,
        pagination: {
          limit,
          offset,
          pages: Math.ceil(predictions.count / limit),
          currentPage: Math.floor(offset / limit) + 1,
        },
      };
    } catch (error) {
      logger.error('Error getting prediction history:', error);
      throw error;
    }
  }

  /**
   * Update prediction accuracy after match completion
   */
  async updatePredictionAccuracy(matchId) {
    try {
      const match = await Match.findByPk(matchId);
      if (!match || match.status !== 'FINISHED' || !match.winner) {
        return null;
      }

      const predictions = await Prediction.findAll({
        where: { matchId },
      });

      for (const prediction of predictions) {
        const isCorrect = prediction.predictedWinner === match.winner;
        
        await prediction.update({
          actualWinner: match.winner,
          isCorrect,
          isProcessed: true,
        });
      }

      return {
        matchId,
        actualWinner: match.winner,
        predictionsUpdated: predictions.length,
      };
    } catch (error) {
      logger.error('Error updating prediction accuracy:', error);
      throw error;
    }
  }

  /**
   * Get model performance statistics
   */
  async getModelPerformance(modelName) {
    try {
      const predictions = await Prediction.findAll({
        where: { 
          modelName,
          isProcessed: true,
        },
        include: [
          {
            model: Match,
            as: 'match',
            where: { status: 'FINISHED' },
          },
        ],
      });

      if (predictions.length === 0) {
        return { message: 'No completed predictions found for this model' };
      }

      const correct = predictions.filter(p => p.isCorrect).length;
      const accuracy = correct / predictions.length;

      // Calculate confidence vs accuracy
      const confidenceRanges = [
        { min: 0.0, max: 0.5, label: '0.0-0.5' },
        { min: 0.5, max: 0.6, label: '0.5-0.6' },
        { min: 0.6, max: 0.7, label: '0.6-0.7' },
        { min: 0.7, max: 0.8, label: '0.7-0.8' },
        { min: 0.8, max: 1.0, label: '0.8-1.0' },
      ];

      const confidenceAnalysis = confidenceRanges.map(range => {
        const rangePredictions = predictions.filter(p => 
          p.confidence >= range.min && p.confidence < range.max
        );
        
        if (rangePredictions.length === 0) {
          return { range: range.label, count: 0, accuracy: 0 };
        }
        
        const rangeCorrect = rangePredictions.filter(p => p.isCorrect).length;
        return {
          range: range.label,
          count: rangePredictions.length,
          accuracy: rangeCorrect / rangePredictions.length,
        };
      });

      return {
        modelName,
        totalPredictions: predictions.length,
        accuracy,
        correct,
        incorrect: predictions.length - correct,
        confidenceAnalysis,
        averageConfidence: predictions.reduce((sum, p) => sum + p.confidence, 0) / predictions.length,
      };
    } catch (error) {
      logger.error('Error getting model performance:', error);
      throw error;
    }
  }

  /**
   * Clear feature cache
   */
  clearCache() {
    this.featureEngineering.clearCache();
    logger.info('AI Predictor cache cleared');
  }
}

module.exports = AIPredictor;
