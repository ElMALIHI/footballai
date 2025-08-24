const logger = require('../config/logger');
const FeatureEngineering = require('./FeatureEngineering');
const { Match, Prediction } = require('../models');
const { Op } = require('sequelize');
const fs = require('fs').promises;
const path = require('path');

class MLModels {
  constructor() {
    this.featureEngineering = new FeatureEngineering();
    this.models = new Map();
    this.modelPath = process.env.ML_MODEL_PATH || './models';
    this.trainingDataPath = process.env.ML_TRAINING_DATA_PATH || './data/training';
    
    // Ensure directories exist
    this.ensureDirectories();
  }

  /**
   * Ensure model and data directories exist
   */
  async ensureDirectories() {
    try {
      await fs.mkdir(this.modelPath, { recursive: true });
      await fs.mkdir(this.trainingDataPath, { recursive: true });
    } catch (error) {
      logger.error('Error creating directories:', error);
    }
  }

  /**
   * Train a Random Forest model
   */
  async trainRandomForest(trainingData, options = {}) {
    try {
      logger.info('Training Random Forest model...');
      
      const {
        nEstimators = 100,
        maxDepth = 10,
        minSamplesSplit = 2,
        minSamplesLeaf = 1,
        randomState = 42,
      } = options;

      // Prepare training data
      const { features, labels } = this.prepareTrainingData(trainingData);
      
      // Simple Random Forest implementation (in production, use a proper ML library)
      const model = {
        type: 'random_forest',
        nEstimators,
        maxDepth,
        minSamplesSplit,
        minSamplesLeaf,
        randomState,
        trees: [],
        featureNames: Object.keys(features[0] || {}),
        trainedAt: new Date().toISOString(),
        trainingSamples: features.length,
      };

      // Train multiple decision trees
      for (let i = 0; i < nEstimators; i++) {
        const tree = this.trainDecisionTree(features, labels, {
          maxDepth,
          minSamplesSplit,
          minSamplesLeaf,
          randomState: randomState + i,
        });
        model.trees.push(tree);
      }

      logger.info(`Random Forest trained with ${nEstimators} trees`);
      return model;
    } catch (error) {
      logger.error('Error training Random Forest:', error);
      throw error;
    }
  }

  /**
   * Train a single decision tree
   */
  trainDecisionTree(features, labels, options) {
    const { maxDepth, minSamplesSplit, minSamplesLeaf, randomState } = options;
    
    // Simple decision tree implementation
    const tree = {
      type: 'decision_tree',
      maxDepth,
      minSamplesSplit,
      minSamplesLeaf,
      nodes: this.buildTree(features, labels, 0, maxDepth, minSamplesSplit, minSamplesLeaf),
    };

    return tree;
  }

  /**
   * Build a decision tree recursively
   */
  buildTree(features, labels, depth, maxDepth, minSamplesSplit, minSamplesLeaf) {
    const nSamples = features.length;
    
    // Stop conditions
    if (depth >= maxDepth || nSamples < minSamplesSplit) {
      return this.createLeafNode(labels);
    }

    // Find best split
    const bestSplit = this.findBestSplit(features, labels);
    
    if (!bestSplit) {
      return this.createLeafNode(labels);
    }

    // Split data
    const leftFeatures = [];
    const leftLabels = [];
    const rightFeatures = [];
    const rightLabels = [];

    features.forEach((feature, index) => {
      if (feature[bestSplit.feature] <= bestSplit.threshold) {
        leftFeatures.push(feature);
        leftLabels.push(labels[index]);
      } else {
        rightFeatures.push(feature);
        rightLabels.push(labels[index]);
      }
    });

    // Check minimum samples per leaf
    if (leftFeatures.length < minSamplesLeaf || rightFeatures.length < minSamplesLeaf) {
      return this.createLeafNode(labels);
    }

    return {
      type: 'split',
      feature: bestSplit.feature,
      threshold: bestSplit.threshold,
      left: this.buildTree(leftFeatures, leftLabels, depth + 1, maxDepth, minSamplesSplit, minSamplesLeaf),
      right: this.buildTree(rightFeatures, rightLabels, depth + 1, maxDepth, minSamplesSplit, minSamplesLeaf),
    };
  }

  /**
   * Find the best split for a node
   */
  findBestSplit(features, labels) {
    const nFeatures = Object.keys(features[0] || {}).length;
    let bestSplit = null;
    let bestGini = Infinity;

    // Try each feature
    for (const featureName of Object.keys(features[0] || {})) {
      const featureValues = features.map(f => f[featureName]).filter(v => v !== null && v !== undefined);
      const uniqueValues = [...new Set(featureValues)].sort((a, b) => a - b);

      // Try each threshold
      for (let i = 0; i < uniqueValues.length - 1; i++) {
        const threshold = (uniqueValues[i] + uniqueValues[i + 1]) / 2;
        
        const leftLabels = [];
        const rightLabels = [];

        features.forEach((feature, index) => {
          if (feature[featureName] <= threshold) {
            leftLabels.push(labels[index]);
          } else {
            rightLabels.push(labels[index]);
          }
        });

        const gini = this.calculateGiniImpurity(leftLabels, rightLabels);
        
        if (gini < bestGini) {
          bestGini = gini;
          bestSplit = { feature: featureName, threshold };
        }
      }
    }

    return bestSplit;
  }

  /**
   * Calculate Gini impurity for a split
   */
  calculateGiniImpurity(leftLabels, rightLabels) {
    const leftGini = this.calculateNodeGini(leftLabels);
    const rightGini = this.calculateNodeGini(rightLabels);
    
    const leftWeight = leftLabels.length / (leftLabels.length + rightLabels.length);
    const rightWeight = rightLabels.length / (leftLabels.length + rightLabels.length);
    
    return leftWeight * leftGini + rightWeight * rightGini;
  }

  /**
   * Calculate Gini impurity for a single node
   */
  calculateNodeGini(labels) {
    if (labels.length === 0) return 0;
    
    const labelCounts = {};
    labels.forEach(label => {
      labelCounts[label] = (labelCounts[label] || 0) + 1;
    });
    
    let gini = 1;
    Object.values(labelCounts).forEach(count => {
      const probability = count / labels.length;
      gini -= probability * probability;
    });
    
    return gini;
  }

  /**
   * Create a leaf node
   */
  createLeafNode(labels) {
    const labelCounts = {};
    labels.forEach(label => {
      labelCounts[label] = (labelCounts[label] || 0) + 1;
    });
    
    const total = labels.length;
    const probabilities = {};
    
    Object.entries(labelCounts).forEach(([label, count]) => {
      probabilities[label] = count / total;
    });
    
    return {
      type: 'leaf',
      probabilities,
      prediction: Object.keys(probabilities).reduce((a, b) => 
        probabilities[a] > probabilities[b] ? a : b
      ),
    };
  }

  /**
   * Make prediction with Random Forest
   */
  async predictRandomForest(model, features) {
    try {
      const predictions = [];
      
      // Get predictions from all trees
      for (const tree of model.trees) {
        const prediction = this.predictTree(tree, features);
        predictions.push(prediction);
      }
      
      // Aggregate predictions (majority vote for classification)
      const predictionCounts = {};
      predictions.forEach(pred => {
        predictionCounts[pred] = (predictionCounts[pred] || 0) + 1;
      });
      
      const totalTrees = model.trees.length;
      const probabilities = {};
      
      Object.entries(predictionCounts).forEach(([label, count]) => {
        probabilities[label] = count / totalTrees;
      });
      
      const predictedLabel = Object.keys(probabilities).reduce((a, b) => 
        probabilities[a] > probabilities[b] ? a : b
      );
      
      return {
        prediction: predictedLabel,
        probabilities,
        confidence: probabilities[predictedLabel],
        modelType: 'random_forest',
      };
    } catch (error) {
      logger.error('Error making Random Forest prediction:', error);
      throw error;
    }
  }

  /**
   * Make prediction with a single tree
   */
  predictTree(node, features) {
    if (node.type === 'leaf') {
      return node.prediction;
    }
    
    const featureValue = features[node.feature];
    if (featureValue <= node.threshold) {
      return this.predictTree(node.left, features);
    } else {
      return this.predictTree(node.right, features);
    }
  }

  /**
   * Train a simple Neural Network (placeholder for TensorFlow.js)
   */
  async trainNeuralNetwork(trainingData, options = {}) {
    try {
      logger.info('Training Neural Network model...');
      
      // This is a placeholder - in production, use TensorFlow.js
      const model = {
        type: 'neural_network',
        layers: options.layers || [64, 32, 16],
        learningRate: options.learningRate || 0.001,
        epochs: options.epochs || 100,
        batchSize: options.batchSize || 32,
        trainedAt: new Date().toISOString(),
        trainingSamples: trainingData.length,
        status: 'placeholder', // Indicates this needs TensorFlow.js implementation
      };

      logger.info('Neural Network model created (TensorFlow.js implementation needed)');
      return model;
    } catch (error) {
      logger.error('Error training Neural Network:', error);
      throw error;
    }
  }

  /**
   * Prepare training data from match results
   */
  async prepareTrainingData(matches) {
    try {
      const features = [];
      const labels = [];

      for (const match of matches) {
        if (match.status === 'FINISHED' && match.winner) {
          try {
            const matchFeatures = await this.featureEngineering.generateMatchFeatures(match.id, true);
            const normalizedFeatures = this.featureEngineering.normalizeFeatures(matchFeatures);
            
            features.push(normalizedFeatures);
            labels.push(match.winner); // HOME_TEAM, AWAY_TEAM, or DRAW
          } catch (error) {
            logger.warn(`Skipping match ${match.id} due to feature generation error:`, error.message);
          }
        }
      }

      logger.info(`Prepared training data: ${features.length} samples`);
      return { features, labels };
    } catch (error) {
      logger.error('Error preparing training data:', error);
      throw error;
    }
  }

  /**
   * Get training data from database
   */
  async getTrainingData(options = {}) {
    const {
      season = null,
      competitionId = null,
      limit = 1000,
      daysBack = 365,
    } = options;

    try {
      const whereConditions = {
        status: 'FINISHED',
        utcDate: {
          [Op.gte]: new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000),
        },
      };

      if (season) whereConditions.season = season;
      if (competitionId) whereConditions.competitionId = competitionId;

      const matches = await Match.findAll({
        where: whereConditions,
        order: [['utcDate', 'DESC']],
        limit,
      });

      logger.info(`Retrieved ${matches.length} matches for training`);
      return matches;
    } catch (error) {
      logger.error('Error getting training data:', error);
      throw error;
    }
  }

  /**
   * Save model to file
   */
  async saveModel(model, modelName) {
    try {
      const modelFile = path.join(this.modelPath, `${modelName}.json`);
      await fs.writeFile(modelFile, JSON.stringify(model, null, 2));
      
      logger.info(`Model saved: ${modelFile}`);
      return modelFile;
    } catch (error) {
      logger.error('Error saving model:', error);
      throw error;
    }
  }

  /**
   * Load model from file
   */
  async loadModel(modelName) {
    try {
      const modelFile = path.join(this.modelPath, `${modelName}.json`);
      const modelData = await fs.readFile(modelFile, 'utf8');
      const model = JSON.parse(modelData);
      
      logger.info(`Model loaded: ${modelFile}`);
      return model;
    } catch (error) {
      logger.error('Error loading model:', error);
      throw error;
    }
  }

  /**
   * List available models
   */
  async listModels() {
    try {
      const files = await fs.readdir(this.modelPath);
      const models = [];
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const modelName = file.replace('.json', '');
          const modelFile = path.join(this.modelPath, file);
          const stats = await fs.stat(modelFile);
          
          models.push({
            name: modelName,
            file: file,
            size: stats.size,
            modified: stats.mtime,
          });
        }
      }
      
      return models;
    } catch (error) {
      logger.error('Error listing models:', error);
      return [];
    }
  }

  /**
   * Delete a model
   */
  async deleteModel(modelName) {
    try {
      const modelFile = path.join(this.modelPath, `${modelName}.json`);
      await fs.unlink(modelFile);
      
      logger.info(`Model deleted: ${modelFile}`);
      return true;
    } catch (error) {
      logger.error('Error deleting model:', error);
      throw error;
    }
  }

  /**
   * Evaluate model performance
   */
  async evaluateModel(model, testData) {
    try {
      const { features, labels } = await this.prepareTrainingData(testData);
      
      let correct = 0;
      const predictions = [];
      
      for (let i = 0; i < features.length; i++) {
        let prediction;
        
        if (model.type === 'random_forest') {
          prediction = await this.predictRandomForest(model, features[i]);
        } else if (model.type === 'neural_network') {
          // Placeholder for neural network prediction
          prediction = { prediction: 'HOME_TEAM', confidence: 0.5 };
        }
        
        predictions.push(prediction);
        
        if (prediction.prediction === labels[i]) {
          correct++;
        }
      }
      
      const accuracy = correct / features.length;
      
      // Calculate additional metrics
      const metrics = this.calculateMetrics(labels, predictions.map(p => p.prediction));
      
      return {
        accuracy,
        correct,
        total: features.length,
        metrics,
        predictions: predictions.slice(0, 10), // First 10 predictions for inspection
      };
    } catch (error) {
      logger.error('Error evaluating model:', error);
      throw error;
    }
  }

  /**
   * Calculate additional performance metrics
   */
  calculateMetrics(trueLabels, predictedLabels) {
    const labels = ['HOME_TEAM', 'AWAY_TEAM', 'DRAW'];
    const metrics = {};
    
    labels.forEach(label => {
      const truePositives = trueLabels.filter((trueLabel, index) => 
        trueLabel === label && predictedLabels[index] === label
      ).length;
      
      const falsePositives = predictedLabels.filter((predLabel, index) => 
        predLabel === label && trueLabels[index] !== label
      ).length;
      
      const falseNegatives = trueLabels.filter((trueLabel, index) => 
        trueLabel === label && predictedLabels[index] !== label
      ).length;
      
      const precision = (truePositives + falsePositives) > 0 ? 
        truePositives / (truePositives + falsePositives) : 0;
      
      const recall = (truePositives + falseNegatives) > 0 ? 
        truePositives / (truePositives + falseNegatives) : 0;
      
      const f1Score = (precision + recall) > 0 ? 
        2 * (precision * recall) / (precision + recall) : 0;
      
      metrics[label] = {
        precision,
        recall,
        f1Score,
        truePositives,
        falsePositives,
        falseNegatives,
      };
    });
    
    return metrics;
  }

  /**
   * Get model information
   */
  getModelInfo(model) {
    return {
      type: model.type,
      trainedAt: model.trainedAt,
      trainingSamples: model.trainingSamples,
      parameters: this.getModelParameters(model),
    };
  }

  /**
   * Get model parameters
   */
  getModelParameters(model) {
    if (model.type === 'random_forest') {
      return {
        nEstimators: model.nEstimators,
        maxDepth: model.maxDepth,
        minSamplesSplit: model.minSamplesSplit,
        minSamplesLeaf: model.minSamplesLeaf,
        randomState: model.randomState,
      };
    } else if (model.type === 'neural_network') {
      return {
        layers: model.layers,
        learningRate: model.learningRate,
        epochs: model.epochs,
        batchSize: model.batchSize,
      };
    }
    
    return {};
  }
}

module.exports = MLModels;
