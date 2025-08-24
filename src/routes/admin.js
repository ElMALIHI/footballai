const express = require('express');
const Joi = require('joi');
const BackgroundJobs = require('../services/BackgroundJobs');
const DataProcessor = require('../services/DataProcessor');
const ModelTrainer = require('../services/ModelTrainer');
const { Competition } = require('../models');
const logger = require('../config/logger');

const router = express.Router();

// Initialize services
const backgroundJobs = new BackgroundJobs();
const dataProcessor = new DataProcessor();
const modelTrainer = new ModelTrainer();

// Validation schemas
const jobNameSchema = Joi.object({
  jobName: Joi.string().valid('matchUpdates', 'standingsUpdates', 'dataCleanup', 'healthCheck', 'updateCompetitions', 'updateTeams', 'updateMatches').required(),
});

const setupDataSchema = Joi.object({
  includeTeams: Joi.boolean().default(true),
  includeMatches: Joi.boolean().default(true),
  daysBack: Joi.number().integer().min(1).max(365).default(30),
});

// GET /api/v1/admin/status - Get system status
router.get('/status', async (req, res, next) => {
  try {
    // Get background job status
    const jobStatus = backgroundJobs.getJobStatus();
    
    // Get health check
    const healthCheck = await backgroundJobs.performHealthCheck();
    
    // Get database stats
    const { sequelize } = require('../config/database');
    const { Competition, Team, Match, Prediction } = require('../models');
    
    const stats = {
      competitions: await Competition.count({ where: { isActive: true } }),
      teams: await Team.count({ where: { isActive: true } }),
      matches: await Match.count(),
      predictions: await Prediction.count(),
    };

    res.json({
      success: true,
      data: {
        system: {
          uptime: process.uptime(),
          nodeVersion: process.version,
          environment: process.env.NODE_ENV || 'development',
          timestamp: new Date().toISOString(),
        },
        backgroundJobs: jobStatus,
        health: healthCheck,
        database: {
          stats,
          connectionState: sequelize.connectionManager?.pool?.used || 0,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/admin/setup - Initialize system with data
router.post('/setup', async (req, res, next) => {
  try {
    const { error, value } = setupDataSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation Error',
          details: error.details,
        },
      });
    }

    const { includeTeams, includeMatches, daysBack } = value;

    logger.info('System setup initiated', { includeTeams, includeMatches, daysBack });

    const startTime = Date.now();
    const results = {};

    try {
      // Step 1: Process competitions
      logger.info('Step 1: Processing competitions...');
      results.competitions = await dataProcessor.processCompetitions();
      
      // Add delay to respect rate limits
      if (includeTeams || includeMatches) {
        logger.info('Waiting 10 seconds to respect API rate limits...');
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
      
      // Step 2: Process teams if requested
      if (includeTeams) {
        logger.info('Step 2: Processing teams...');
        const competitions = await Competition.findAll({ where: { isActive: true } });
        results.teams = { processed: 0, errors: 0 };
        
        for (const comp of competitions) {
          try {
            logger.info(`Processing teams for competition: ${comp.name}`);
            const teamResult = await dataProcessor.processTeams(comp.id);
            results.teams.processed += teamResult.processed;
            results.teams.errors += teamResult.errors;
            
            // Add delay between competitions to respect rate limits
            if (competitions.indexOf(comp) < competitions.length - 1) {
              logger.info('Waiting 6 seconds between competitions to respect API rate limits...');
              await new Promise(resolve => setTimeout(resolve, 6000));
            }
          } catch (error) {
            logger.error(`Error processing teams for competition ${comp.name}:`, error);
            results.teams.errors++;
          }
        }
      }

      // Add delay before processing matches
      if (includeMatches) {
        logger.info('Waiting 10 seconds before processing matches...');
        await new Promise(resolve => setTimeout(resolve, 10000));
      }

      // Step 3: Process matches if requested
      if (includeMatches) {
        logger.info('Step 3: Processing matches...');
        const competitions = await Competition.findAll({ where: { isActive: true } });
        results.matches = { processed: 0, errors: 0 };
        
        for (const comp of competitions) {
          try {
            logger.info(`Processing matches for competition: ${comp.name}`);
            const matchResult = await dataProcessor.processMatches(comp.id, daysBack);
            results.matches.processed += matchResult.processed;
            results.matches.errors += matchResult.errors;
            
            // Add delay between competitions to respect rate limits
            if (competitions.indexOf(comp) < competitions.length - 1) {
              logger.info('Waiting 6 seconds between competitions to respect API rate limits...');
              await new Promise(resolve => setTimeout(resolve, 6000));
            }
          } catch (error) {
            logger.error(`Error processing matches for competition ${comp.name}:`, error);
            results.matches.errors++;
          }
        }
      }

      const duration = Date.now() - startTime;

      logger.info('System setup completed successfully', results);

      res.json({
        success: true,
        message: 'System setup completed successfully',
        data: {
          ...results,
          duration: `${duration}ms`,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('System setup failed:', error);
      throw error;
    }
  } catch (error) {
    logger.error('System setup failed:', error);
    next(error);
  }
});

// POST /api/v1/admin/setup-free-tier - Optimized for free tier (10 req/min)
router.post('/setup-free-tier', async (req, res, next) => {
  try {
    const { error, value } = setupDataSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation Error',
          details: error.details,
        },
      });
    }

    const { includeTeams, includeMatches, daysBack } = value;

    logger.info('Free-tier optimized setup initiated', { includeTeams, includeMatches, daysBack });

    const startTime = Date.now();
    const results = {};

    try {
      // Step 1: Process competitions (1 request)
      logger.info('Step 1: Processing competitions (1 request)...');
      results.competitions = await dataProcessor.processCompetitions();
      
      // Wait 7 seconds to respect rate limit (10 req/min = 1 req every 6 seconds)
      if (includeTeams || includeMatches) {
        logger.info('Waiting 7 seconds to respect free tier rate limit (10 req/min)...');
        await new Promise(resolve => setTimeout(resolve, 7000));
      }
      
      // Step 2: Process teams if requested (1 request per competition)
      if (includeTeams) {
        logger.info('Step 2: Processing teams (free tier optimized)...');
        const competitions = await Competition.findAll({ where: { isActive: true } });
        results.teams = { processed: 0, errors: 0 };
        
        logger.info(`Found ${competitions.length} competitions to process teams for`);
        
        for (let i = 0; i < competitions.length; i++) {
          const comp = competitions[i];
          try {
            logger.info(`Processing teams for competition ${i + 1}/${competitions.length}: ${comp.name}`);
            const teamResult = await dataProcessor.processTeams(comp.id);
            results.teams.processed += teamResult.processed;
            results.teams.errors += teamResult.errors;
            
            // Wait 7 seconds between each competition (free tier: 10 req/min)
            if (i < competitions.length - 1) {
              logger.info(`Waiting 7 seconds before next competition (${i + 2}/${competitions.length})...`);
              await new Promise(resolve => setTimeout(resolve, 7000));
            }
          } catch (error) {
            logger.error(`Error processing teams for competition ${comp.name}:`, error);
            results.teams.errors++;
          }
        }
      }

      // Wait 7 seconds before matches
      if (includeMatches) {
        logger.info('Waiting 7 seconds before processing matches...');
        await new Promise(resolve => setTimeout(resolve, 7000));
      }

      // Step 3: Process matches if requested (1 request per competition)
      if (includeMatches) {
        logger.info('Step 3: Processing matches (free tier optimized)...');
        const competitions = await Competition.findAll({ where: { isActive: true } });
        results.matches = { processed: 0, errors: 0 };
        
        logger.info(`Found ${competitions.length} competitions to process matches for`);
        
        for (let i = 0; i < competitions.length; i++) {
          const comp = competitions[i];
          try {
            logger.info(`Processing matches for competition ${i + 1}/${competitions.length}: ${comp.name}`);
            const matchResult = await dataProcessor.processMatches(comp.id, daysBack);
            results.matches.processed += matchResult.processed;
            results.matches.errors += matchResult.errors;
            
            // Wait 7 seconds between each competition (free tier: 10 req/min)
            if (i < competitions.length - 1) {
              logger.info(`Waiting 7 seconds before next competition (${i + 2}/${competitions.length})...`);
              await new Promise(resolve => setTimeout(resolve, 7000));
            }
          } catch (error) {
            logger.error(`Error processing matches for competition ${comp.name}:`, error);
            results.matches.errors++;
          }
        }
      }

      const duration = Date.now() - startTime;

      logger.info('Free-tier optimized setup completed successfully', results);

      res.json({
        success: true,
        message: 'Free-tier optimized setup completed successfully',
        data: {
          ...results,
          duration: `${duration}ms`,
          estimatedRequests: 1 + (includeTeams ? competitions?.length || 0 : 0) + (includeMatches ? competitions?.length || 0 : 0),
          rateLimitRespected: true,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Free-tier optimized setup failed:', error);
      throw error;
    }
  } catch (error) {
    logger.error('Free-tier optimized setup failed:', error);
    next(error);
  }
});

// POST /api/v1/admin/setup-conservative - Initialize system with conservative rate limiting
router.post('/setup-conservative', async (req, res, next) => {
  try {
    const { error, value } = setupDataSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation Error',
          details: error.details,
        },
      });
    }

    const { includeTeams, includeMatches, daysBack } = value;

    logger.info('Conservative system setup initiated', { includeTeams, includeMatches, daysBack });

    const startTime = Date.now();
    const results = {};

    try {
      // Step 1: Process competitions only
      logger.info('Step 1: Processing competitions only...');
      results.competitions = await dataProcessor.processCompetitions();
      
      // Wait longer for conservative approach
      if (includeTeams || includeMatches) {
        logger.info('Waiting 30 seconds to respect API rate limits...');
        await new Promise(resolve => setTimeout(resolve, 30000));
      }
      
      // Step 2: Process teams if requested (one at a time with long delays)
      if (includeTeams) {
        logger.info('Step 2: Processing teams (conservative mode)...');
        const competitions = await Competition.findAll({ where: { isActive: true } });
        results.teams = { processed: 0, errors: 0 };
        
        for (const comp of competitions) {
          try {
            logger.info(`Processing teams for competition: ${comp.name}`);
            const teamResult = await dataProcessor.processTeams(comp.id);
            results.teams.processed += teamResult.processed;
            results.teams.errors += teamResult.errors;
            
            // Wait 12 seconds between each competition (conservative)
            if (competitions.indexOf(comp) < competitions.length - 1) {
              logger.info('Waiting 12 seconds between competitions (conservative mode)...');
              await new Promise(resolve => setTimeout(resolve, 12000));
            }
          } catch (error) {
            logger.error(`Error processing teams for competition ${comp.name}:`, error);
            results.teams.errors++;
          }
        }
      }

      // Wait even longer before matches
      if (includeMatches) {
        logger.info('Waiting 30 seconds before processing matches...');
        await new Promise(resolve => setTimeout(resolve, 30000));
      }

      // Step 3: Process matches if requested (conservative)
      if (includeMatches) {
        logger.info('Step 3: Processing matches (conservative mode)...');
        const competitions = await Competition.findAll({ where: { isActive: true } });
        results.matches = { processed: 0, errors: 0 };
        
        for (const comp of competitions) {
          try {
            logger.info(`Processing matches for competition: ${comp.name}`);
            const matchResult = await dataProcessor.processMatches(comp.id, daysBack);
            results.matches.processed += matchResult.processed;
            results.matches.errors += matchResult.errors;
            
            // Wait 12 seconds between each competition (conservative)
            if (competitions.indexOf(comp) < competitions.length - 1) {
              logger.info('Waiting 12 seconds between competitions (conservative mode)...');
              await new Promise(resolve => setTimeout(resolve, 12000));
            }
          } catch (error) {
            logger.error(`Error processing matches for competition ${comp.name}:`, error);
            results.matches.errors++;
          }
        }
      }

      const duration = Date.now() - startTime;

      logger.info('Conservative system setup completed successfully', results);

      res.json({
        success: true,
        message: 'Conservative system setup completed successfully',
        data: {
          ...results,
          duration: `${duration}ms`,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Conservative system setup failed:', error);
      throw error;
    }
  } catch (error) {
    logger.error('Conservative system setup failed:', error);
    next(error);
  }
});

// POST /api/v1/admin/jobs/:jobName/run - Manually run a background job
router.post('/jobs/:jobName/run', async (req, res, next) => {
  try {
    const { error, value } = jobNameSchema.validate(req.params);
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation Error',
          details: error.details,
        },
      });
    }

    const { jobName } = value;

    logger.info(`Manual job execution requested: ${jobName}`);
    
    const startTime = Date.now();
    const result = await backgroundJobs.runJob(jobName);
    const duration = Date.now() - startTime;

    res.json({
      success: true,
      message: `Job ${jobName} completed successfully`,
      data: {
        job: jobName,
        duration: `${duration}ms`,
        result,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error(`Manual job execution failed: ${req.params.jobName}`, error);
    next(error);
  }
});

// GET /api/v1/admin/health - Detailed health check
router.get('/health', async (req, res, next) => {
  try {
    const health = await backgroundJobs.performHealthCheck();
    
    const statusCode = (health.database && health.redis && health.externalAPI && health.backgroundJobs) ? 200 : 503;
    
    res.status(statusCode).json({
      success: statusCode === 200,
      data: {
        ...health,
        overall: statusCode === 200 ? 'healthy' : 'unhealthy',
      },
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      data: {
        overall: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString(),
      },
    });
  }
});

// POST /api/v1/admin/cache/clear - Clear Redis cache
router.post('/cache/clear', async (req, res, next) => {
  try {
    const { redis } = require('../config/redis');
    
    // Clear all cache keys (be careful in production)
    await redis.flushAll();
    
    logger.info('Redis cache cleared manually');
    
    res.json({
      success: true,
      message: 'Cache cleared successfully',
      data: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Failed to clear cache', error);
    next(error);
  }
});

// GET /api/v1/admin/logs - Get recent log entries (placeholder)
router.get('/logs', async (req, res, next) => {
  try {
    // This is a placeholder - in production you'd want to implement proper log retrieval
    // You could read from the log files or use a log aggregation service
    
    res.json({
      success: true,
      message: 'Log retrieval not implemented yet',
      data: {
        message: 'Check the server logs directly or implement log aggregation',
        logFiles: [
          'logs/combined.log',
          'logs/error.log',
        ],
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/admin/data/cleanup - Clean old data
router.post('/data/cleanup', async (req, res, next) => {
  try {
    const schema = Joi.object({
      daysToKeep: Joi.number().integer().min(30).max(3650).default(730), // 30 days to 10 years
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation Error',
          details: error.details,
        },
      });
    }

    const { daysToKeep } = value;

    logger.info(`Manual data cleanup requested: keeping ${daysToKeep} days`);

    const startTime = Date.now();
    const result = await dataProcessor.cleanOldData(daysToKeep);
    const duration = Date.now() - startTime;

    res.json({
      success: true,
      message: 'Data cleanup completed successfully',
      data: {
        ...result,
        daysToKeep,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Manual data cleanup failed', error);
    next(error);
  }
});

// AI Model Training Endpoints

// POST /api/v1/admin/ai/train - Train AI models
router.post('/ai/train', async (req, res, next) => {
  try {
    const schema = Joi.object({
      modelTypes: Joi.array().items(Joi.string().valid('random_forest', 'neural_network')).default(['random_forest']),
      crossValidationFolds: Joi.number().integer().min(2).max(10).default(5),
      hyperparameterTuning: Joi.boolean().default(true),
      testSize: Joi.number().min(0.1).max(0.5).default(0.2),
      randomState: Joi.number().integer().default(42),
      maxTrainingTime: Joi.number().integer().min(5).max(120).default(30), // minutes
      season: Joi.number().integer().min(2020).max(2030).optional(),
      competitionId: Joi.number().integer().optional(),
      daysBack: Joi.number().integer().min(90).max(1095).default(730), // 3 months to 3 years
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation Error',
          details: error.details,
        },
      });
    }

    const {
      modelTypes,
      crossValidationFolds,
      hyperparameterTuning,
      testSize,
      randomState,
      maxTrainingTime,
      season,
      competitionId,
      daysBack,
    } = value;

    logger.info('AI model training initiated', {
      modelTypes,
      crossValidationFolds,
      hyperparameterTuning,
      testSize,
      maxTrainingTime,
      season,
      competitionId,
      daysBack,
    });

    // Start training in background
    const trainingPromise = modelTrainer.trainModels({
      modelTypes,
      crossValidationFolds,
      hyperparameterTuning,
      testSize,
      randomState,
      maxTrainingTime: maxTrainingTime * 60 * 1000, // Convert to milliseconds
      trainingDataOptions: {
        season,
        competitionId,
        daysBack,
      },
    });

    // Wait for training to complete (or timeout)
    const result = await Promise.race([
      trainingPromise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Training timeout')), (maxTrainingTime + 5) * 60 * 1000)
      ),
    ]);

    logger.info('AI model training completed successfully');

    res.json({
      success: true,
      message: 'AI models trained successfully',
      data: {
        ...result,
        trainingOptions: {
          modelTypes,
          crossValidationFolds,
          hyperparameterTuning,
          testSize,
          maxTrainingTime,
          season,
          competitionId,
          daysBack,
        },
        timestamp: new Date().toISOString(),
      },
    });

  } catch (error) {
    logger.error('AI model training failed:', error);
    
    if (error.message === 'Training timeout') {
      res.status(408).json({
        success: false,
        error: {
          message: 'Training Timeout',
          details: `Training exceeded ${req.body.maxTrainingTime || 30} minutes`,
        },
      });
    } else {
      res.status(500).json({
        success: false,
        error: {
          message: 'Training Failed',
          details: error.message,
        },
      });
    }
  }
});

// GET /api/v1/admin/ai/models - List all trained models
router.get('/ai/models', async (req, res, next) => {
  try {
    const models = await modelTrainer.mlModels.listModels();
    const modelDetails = [];

    for (const model of models) {
      try {
        const modelData = await modelTrainer.mlModels.loadModel(model.name);
        modelDetails.push({
          ...model,
          modelInfo: modelTrainer.mlModels.getModelInfo(modelData),
        });
      } catch (error) {
        logger.warn(`Could not load model ${model.name}:`, error.message);
        modelDetails.push({
          ...model,
          modelInfo: null,
          error: error.message,
        });
      }
    }

    res.json({
      success: true,
      data: {
        models: modelDetails,
        total: models.length,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Error listing AI models:', error);
    next(error);
  }
});

// GET /api/v1/admin/ai/models/:modelName - Get specific model details
router.get('/ai/models/:modelName', async (req, res, next) => {
  try {
    const { modelName } = req.params;
    const model = await modelTrainer.mlModels.loadModel(modelName);
    const modelInfo = modelTrainer.mlModels.getModelInfo(model);

    res.json({
      success: true,
      data: {
        model,
        modelInfo,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error(`Error loading model ${req.params.modelName}:`, error);
    res.status(404).json({
      success: false,
      error: {
        message: 'Model Not Found',
        details: error.message,
      },
    });
  }
});

// DELETE /api/v1/admin/ai/models/:modelName - Delete a model
router.delete('/ai/models/:modelName', async (req, res, next) => {
  try {
    const { modelName } = req.params;
    await modelTrainer.mlModels.deleteModel(modelName);

    res.json({
      success: true,
      message: `Model ${modelName} deleted successfully`,
      data: {
        deletedModel: modelName,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error(`Error deleting model ${req.params.modelName}:`, error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Delete Failed',
        details: error.message,
      },
    });
  }
});

// POST /api/v1/admin/ai/evaluate/:modelName - Evaluate a specific model
router.post('/ai/evaluate/:modelName', async (req, res, next) => {
  try {
    const { modelName } = req.params;
    const schema = Joi.object({
      testSize: Joi.number().min(0.1).max(0.5).default(0.2),
      daysBack: Joi.number().integer().min(30).max(1095).default(365),
      competitionId: Joi.number().integer().optional(),
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation Error',
          details: error.details,
        },
      });
    }

    const { testSize, daysBack, competitionId } = value;

    // Load model
    const model = await modelTrainer.mlModels.loadModel(modelName);
    
    // Get test data
    const testData = await modelTrainer.getTrainingData({
      daysBack,
      competitionId,
      limit: 1000,
    });

    if (testData.length < 50) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Insufficient Test Data',
          details: `Need at least 50 matches for evaluation, got ${testData.length}`,
        },
      });
    }

    // Evaluate model
    const evaluation = await modelTrainer.mlModels.evaluateModel(model, testData);

    res.json({
      success: true,
      message: `Model ${modelName} evaluated successfully`,
      data: {
        modelName,
        evaluation,
        testDataStats: {
          totalMatches: testData.length,
          testSize,
          daysBack,
          competitionId,
        },
        timestamp: new Date().toISOString(),
      },
    });

  } catch (error) {
    logger.error(`Error evaluating model ${req.params.modelName}:`, error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Evaluation Failed',
        details: error.message,
      },
    });
  }
});

// GET /api/v1/admin/ai/training-stats - Get training statistics
router.get('/ai/training-stats', async (req, res, next) => {
  try {
    await modelTrainer.loadTrainingHistory();
    const stats = modelTrainer.getTrainingStats();
    const modelComparison = await modelTrainer.compareModels();

    res.json({
      success: true,
      data: {
        ...stats,
        modelComparison,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Error getting training stats:', error);
    next(error);
  }
});

// POST /api/v1/admin/ai/predict - Make predictions with trained models
router.post('/api/v1/admin/ai/predict', async (req, res, next) => {
  try {
    const schema = Joi.object({
      matchId: Joi.number().integer().required(),
      modelName: Joi.string().optional(),
      modelType: Joi.string().valid('random_forest', 'neural_network').optional(),
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation Error',
          details: error.details,
        },
      });
    }

    const { matchId, modelName, modelType } = value;

    // Generate features for the match
    const features = await modelTrainer.featureEngineering.generateMatchFeatures(matchId, true);
    const normalizedFeatures = modelTrainer.featureEngineering.normalizeFeatures(features);

    // Remove non-numeric features
    const numericFeatures = {};
    Object.entries(normalizedFeatures).forEach(([key, value]) => {
      if (typeof value === 'number' && !isNaN(value)) {
        numericFeatures[key] = value;
      }
    });

    let predictions = {};

    if (modelName) {
      // Use specific model
      const model = await modelTrainer.mlModels.loadModel(modelName);
      if (model.type === 'random_forest') {
        predictions[modelName] = await modelTrainer.mlModels.predictRandomForest(model, numericFeatures);
      } else {
        predictions[modelName] = { prediction: 'UNKNOWN', confidence: 0, note: 'Model type not supported for prediction' };
      }
    } else if (modelType) {
      // Use best model of specific type
      const models = await modelTrainer.mlModels.listModels();
      const typeModels = models.filter(m => m.name.includes(modelType));
      
      for (const model of typeModels) {
        try {
          const modelData = await modelTrainer.mlModels.loadModel(model.name);
          if (modelData.type === 'random_forest') {
            predictions[model.name] = await modelTrainer.mlModels.predictRandomForest(modelData, numericFeatures);
          }
        } catch (error) {
          logger.warn(`Could not use model ${model.name} for prediction:`, error.message);
        }
      }
    } else {
      // Use all available models
      const models = await modelTrainer.mlModels.listModels();
      
      for (const model of models) {
        try {
          const modelData = await modelTrainer.mlModels.loadModel(model.name);
          if (modelData.type === 'random_forest') {
            predictions[model.name] = await modelTrainer.mlModels.predictRandomForest(modelData, numericFeatures);
          }
        } catch (error) {
          logger.warn(`Could not use model ${model.name} for prediction:`, error.message);
        }
      }
    }

    res.json({
      success: true,
      message: 'Predictions generated successfully',
      data: {
        matchId,
        features: numericFeatures,
        predictions,
        timestamp: new Date().toISOString(),
      },
    });

  } catch (error) {
    logger.error('Error making predictions:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Prediction Failed',
        details: error.message,
      },
    });
  }
});

module.exports = router;
