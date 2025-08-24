const express = require('express');
const Joi = require('joi');
const BackgroundJobs = require('../services/BackgroundJobs');
const DataProcessor = require('../services/DataProcessor');
const logger = require('../config/logger');

const router = express.Router();

// Initialize services
const backgroundJobs = new BackgroundJobs();
const dataProcessor = new DataProcessor();

// Validation schemas
const jobNameSchema = Joi.object({
  jobName: Joi.string().valid('matchUpdates', 'standingsUpdates', 'dataCleanup', 'healthCheck').required(),
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

// POST /api/v1/admin/setup - Initial data setup
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

    logger.info('Initial data setup requested', { includeTeams, includeMatches, daysBack });

    const startTime = Date.now();
    const result = await backgroundJobs.initialDataSetup();
    const duration = Date.now() - startTime;

    res.json({
      success: true,
      message: 'Initial data setup completed successfully',
      data: {
        ...result,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Initial data setup failed', error);
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
