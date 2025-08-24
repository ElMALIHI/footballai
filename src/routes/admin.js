const express = require('express');
const Joi = require('joi');
const BackgroundJobs = require('../services/BackgroundJobs');
const DataProcessor = require('../services/DataProcessor');
const { Competition } = require('../models');
const logger = require('../config/logger');

const router = express.Router();

// Initialize services
const backgroundJobs = new BackgroundJobs();
const dataProcessor = new DataProcessor();

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

module.exports = router;
