const logger = require('../config/logger');
const MLModels = require('./MLModels');
const FeatureEngineering = require('./FeatureEngineering');
const { Match, Team, Competition } = require('../models');
const { Op } = require('sequelize');
const fs = require('fs').promises;
const path = require('path');

class ModelTrainer {
  constructor() {
    this.mlModels = new MLModels();
    this.featureEngineering = new FeatureEngineering();
    this.trainingHistory = [];
    this.bestModels = new Map();
  }

  /**
   * Train multiple models with cross-validation
   */
  async trainModels(options = {}) {
    const {
      modelTypes = ['random_forest', 'neural_network'],
      crossValidationFolds = 5,
      hyperparameterTuning = true,
      testSize = 0.2,
      randomState = 42,
      maxTrainingTime = 30 * 60 * 1000, // 30 minutes
    } = options;

    try {
      logger.info('Starting comprehensive model training...', options);

      const startTime = Date.now();
      const results = {};

      // Get training data
      const trainingData = await this.getTrainingData();
      
      if (trainingData.length < 100) {
        throw new Error(`Insufficient training data: ${trainingData.length} matches. Need at least 100 matches for reliable training.`);
      }

      logger.info(`Training with ${trainingData.length} matches`);

      // Split data for cross-validation
      const { trainData, testData } = this.splitData(trainingData, testSize, randomState);

      // Train each model type
      for (const modelType of modelTypes) {
        if (Date.now() - startTime > maxTrainingTime) {
          logger.warn('Training time limit reached, stopping...');
          break;
        }

        logger.info(`Training ${modelType} model...`);
        
        try {
          const modelResult = await this.trainModelType(
            modelType,
            trainData,
            testData,
            crossValidationFolds,
            hyperparameterTuning
          );
          
          results[modelType] = modelResult;
          
          // Save best model
          if (modelResult.bestModel) {
            await this.mlModels.saveModel(modelResult.bestModel, `${modelType}_best`);
            this.bestModels.set(modelType, modelResult.bestModel);
          }
          
        } catch (error) {
          logger.error(`Error training ${modelType} model:`, error);
          results[modelType] = {
            success: false,
            error: error.message,
          };
        }
      }

      const duration = Date.now() - startTime;
      
      // Save training history
      const trainingRecord = {
        timestamp: new Date().toISOString(),
        duration,
        options,
        results,
        dataStats: {
          totalMatches: trainingData.length,
          trainSize: trainData.length,
          testSize: testData.length,
        },
      };
      
      this.trainingHistory.push(trainingRecord);
      await this.saveTrainingHistory();

      logger.info('Model training completed', { duration, results });

      return {
        success: true,
        duration,
        results,
        bestModels: Object.fromEntries(this.bestModels),
        trainingRecord,
      };

    } catch (error) {
      logger.error('Model training failed:', error);
      throw error;
    }
  }

  /**
   * Train a specific model type with cross-validation
   */
  async trainModelType(modelType, trainData, testData, cvFolds, hyperparameterTuning) {
    const startTime = Date.now();
    
    if (modelType === 'random_forest') {
      return await this.trainRandomForestWithCV(trainData, testData, cvFolds, hyperparameterTuning);
    } else if (modelType === 'neural_network') {
      return await this.trainNeuralNetworkWithCV(trainData, testData, cvFolds, hyperparameterTuning);
    } else {
      throw new Error(`Unsupported model type: ${modelType}`);
    }
  }

  /**
   * Train Random Forest with cross-validation and hyperparameter tuning
   */
  async trainRandomForestWithCV(trainData, testData, cvFolds, hyperparameterTuning) {
    const hyperparameters = hyperparameterTuning ? [
      { nEstimators: 50, maxDepth: 5, minSamplesSplit: 2, minSamplesLeaf: 1 },
      { nEstimators: 100, maxDepth: 10, minSamplesSplit: 2, minSamplesLeaf: 1 },
      { nEstimators: 150, maxDepth: 15, minSamplesSplit: 3, minSamplesLeaf: 2 },
      { nEstimators: 200, maxDepth: 20, minSamplesSplit: 5, minSamplesLeaf: 3 },
      { nEstimators: 100, maxDepth: 8, minSamplesSplit: 4, minSamplesLeaf: 2 },
    ] : [
      { nEstimators: 100, maxDepth: 10, minSamplesSplit: 2, minSamplesLeaf: 1 }
    ];

    const cvResults = [];
    let bestModel = null;
    let bestScore = 0;

    // Cross-validation
    for (let fold = 0; fold < cvFolds; fold++) {
      logger.info(`Random Forest CV Fold ${fold + 1}/${cvFolds}`);
      
      const { cvTrainData, cvValData } = this.getCVFold(trainData, fold, cvFolds);
      
      for (const params of hyperparameters) {
        try {
          // Prepare features
          const { features: trainFeatures, labels: trainLabels } = await this.prepareFeatures(cvTrainData);
          const { features: valFeatures, labels: valLabels } = await this.prepareFeatures(cvValData);
          
          if (trainFeatures.length === 0 || valFeatures.length === 0) {
            logger.warn(`Skipping fold ${fold + 1} due to insufficient data`);
            continue;
          }

          // Train model
          const model = await this.mlModels.trainRandomForest(trainFeatures, params);
          
          // Evaluate
          const predictions = [];
          for (const features of valFeatures) {
            const prediction = await this.mlModels.predictRandomForest(model, features);
            predictions.push(prediction.prediction);
          }
          
          const accuracy = this.calculateAccuracy(valLabels, predictions);
          
          cvResults.push({
            fold: fold + 1,
            params,
            accuracy,
            trainSize: trainFeatures.length,
            valSize: valFeatures.length,
          });

          // Update best model
          if (accuracy > bestScore) {
            bestScore = accuracy;
            bestModel = model;
          }

        } catch (error) {
          logger.error(`Error in CV fold ${fold + 1} with params ${JSON.stringify(params)}:`, error);
        }
      }
    }

    // Final evaluation on test set
    let finalAccuracy = 0;
    if (bestModel) {
      const { features: testFeatures, labels: testLabels } = await this.prepareFeatures(testData);
      const predictions = [];
      
      for (const features of testFeatures) {
        const prediction = await this.mlModels.predictRandomForest(bestModel, features);
        predictions.push(prediction.prediction);
      }
      
      finalAccuracy = this.calculateAccuracy(testLabels, predictions);
    }

    const duration = Date.now() - startTime;

    return {
      success: true,
      modelType: 'random_forest',
      duration,
      crossValidation: {
        folds: cvFolds,
        results: cvResults,
        averageAccuracy: cvResults.reduce((sum, r) => sum + r.accuracy, 0) / cvResults.length,
      },
      bestModel: bestModel ? {
        ...bestModel,
        cvScore: bestScore,
        testScore: finalAccuracy,
      } : null,
      hyperparameters: hyperparameters,
      finalTestAccuracy: finalAccuracy,
    };
  }

  /**
   * Train Neural Network with cross-validation (placeholder for TensorFlow.js)
   */
  async trainNeuralNetworkWithCV(trainData, testData, cvFolds, hyperparameterTuning) {
    const hyperparameters = hyperparameterTuning ? [
      { layers: [64, 32], learningRate: 0.001, epochs: 50, batchSize: 16 },
      { layers: [128, 64, 32], learningRate: 0.0001, epochs: 100, batchSize: 32 },
      { layers: [256, 128, 64, 32], learningRate: 0.01, epochs: 75, batchSize: 64 },
    ] : [
      { layers: [64, 32], learningRate: 0.001, epochs: 100, batchSize: 32 }
    ];

    // Placeholder implementation - needs TensorFlow.js
    const duration = Date.now();
    
    return {
      success: true,
      modelType: 'neural_network',
      duration,
      crossValidation: {
        folds: cvFolds,
        results: [],
        averageAccuracy: 0,
      },
      bestModel: null,
      hyperparameters,
      finalTestAccuracy: 0,
      note: 'Neural Network training requires TensorFlow.js implementation',
    };
  }

  /**
   * Get training data from database
   */
  async getTrainingData(options = {}) {
    const {
      season = null,
      competitionId = null,
      limit = 5000,
      daysBack = 730, // 2 years
      minMatchesPerTeam = 10,
    } = options;

    try {
      const whereConditions = {
        status: 'FINISHED',
        utcDate: {
          [Op.gte]: new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000),
        },
        homeTeamScore: { [Op.ne]: null },
        awayTeamScore: { [Op.ne]: null },
      };

      if (season) whereConditions.season = season;
      if (competitionId) whereConditions.competitionId = competitionId;

      const matches = await Match.findAll({
        where: whereConditions,
        include: [
          { model: Team, as: 'homeTeam' },
          { model: Team, as: 'awayTeam' },
          { model: Competition, as: 'competition' },
        ],
        order: [['utcDate', 'DESC']],
        limit,
      });

      // Filter teams with sufficient matches
      const teamMatchCounts = new Map();
      matches.forEach(match => {
        teamMatchCounts.set(match.homeTeamId, (teamMatchCounts.get(match.homeTeamId) || 0) + 1);
        teamMatchCounts.set(match.awayTeamId, (teamMatchCounts.get(match.awayTeamId) || 0) + 1);
      });

      const filteredMatches = matches.filter(match => 
        teamMatchCounts.get(match.homeTeamId) >= minMatchesPerTeam &&
        teamMatchCounts.get(match.awayTeamId) >= minMatchesPerTeam
      );

      logger.info(`Retrieved ${filteredMatches.length} matches for training (filtered from ${matches.length})`);
      return filteredMatches;

    } catch (error) {
      logger.error('Error getting training data:', error);
      throw error;
    }
  }

  /**
   * Prepare features for training
   */
  async prepareFeatures(matches) {
    const features = [];
    const labels = [];

    for (const match of matches) {
      try {
        const matchFeatures = await this.featureEngineering.generateMatchFeatures(match.id, true);
        const normalizedFeatures = this.featureEngineering.normalizeFeatures(matchFeatures);
        
        // Remove non-numeric features
        const numericFeatures = {};
        Object.entries(normalizedFeatures).forEach(([key, value]) => {
          if (typeof value === 'number' && !isNaN(value)) {
            numericFeatures[key] = value;
          }
        });

        if (Object.keys(numericFeatures).length > 0) {
          features.push(numericFeatures);
          labels.push(match.winner || 'DRAW');
        }
      } catch (error) {
        logger.warn(`Skipping match ${match.id} due to feature generation error:`, error.message);
      }
    }

    return { features, labels };
  }

  /**
   * Split data into train and test sets
   */
  splitData(data, testSize, randomState) {
    const shuffled = [...data].sort(() => Math.random() - 0.5);
    const splitIndex = Math.floor(data.length * (1 - testSize));
    
    return {
      trainData: shuffled.slice(0, splitIndex),
      testData: shuffled.slice(splitIndex),
    };
  }

  /**
   * Get cross-validation fold
   */
  getCVFold(data, foldIndex, totalFolds) {
    const foldSize = Math.floor(data.length / totalFolds);
    const startIndex = foldIndex * foldSize;
    const endIndex = foldIndex === totalFolds - 1 ? data.length : (foldIndex + 1) * foldSize;
    
    const cvValData = data.slice(startIndex, endIndex);
    const cvTrainData = [
      ...data.slice(0, startIndex),
      ...data.slice(endIndex)
    ];
    
    return { cvTrainData, cvValData };
  }

  /**
   * Calculate accuracy
   */
  calculateAccuracy(trueLabels, predictedLabels) {
    if (trueLabels.length === 0) return 0;
    
    let correct = 0;
    for (let i = 0; i < trueLabels.length; i++) {
      if (trueLabels[i] === predictedLabels[i]) {
        correct++;
      }
    }
    
    return correct / trueLabels.length;
  }

  /**
   * Save training history
   */
  async saveTrainingHistory() {
    try {
      const historyFile = path.join(process.env.ML_MODEL_PATH || './models', 'training_history.json');
      await fs.writeFile(historyFile, JSON.stringify(this.trainingHistory, null, 2));
    } catch (error) {
      logger.error('Error saving training history:', error);
    }
  }

  /**
   * Load training history
   */
  async loadTrainingHistory() {
    try {
      const historyFile = path.join(process.env.ML_MODEL_PATH || './models', 'training_history.json');
      const data = await fs.readFile(historyFile, 'utf8');
      this.trainingHistory = JSON.parse(data);
      return this.trainingHistory;
    } catch (error) {
      logger.warn('No training history found, starting fresh');
      return [];
    }
  }

  /**
   * Get training statistics
   */
  getTrainingStats() {
    return {
      totalTrainingRuns: this.trainingHistory.length,
      lastTraining: this.trainingHistory[this.trainingHistory.length - 1] || null,
      bestModels: Object.fromEntries(this.bestModels),
      averageTrainingTime: this.trainingHistory.length > 0 
        ? this.trainingHistory.reduce((sum, r) => sum + r.duration, 0) / this.trainingHistory.length 
        : 0,
    };
  }

  /**
   * Compare models
   */
  async compareModels() {
    const models = await this.mlModels.listModels();
    const comparisons = [];

    for (const model of models) {
      try {
        const modelData = await this.mlModels.loadModel(model.name);
        comparisons.push({
          name: model.name,
          type: modelData.type,
          trainedAt: modelData.trainedAt,
          trainingSamples: modelData.trainingSamples,
          parameters: this.mlModels.getModelParameters(modelData),
          fileSize: model.size,
          modified: model.modified,
        });
      } catch (error) {
        logger.warn(`Could not load model ${model.name}:`, error.message);
      }
    }

    return comparisons;
  }
}

module.exports = ModelTrainer;
