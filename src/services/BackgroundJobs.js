const cron = require('node-cron');
const logger = require('../config/logger');
const DataProcessor = require('./DataProcessor');
const { Competition } = require('../models');

class BackgroundJobs {
  constructor() {
    this.dataProcessor = new DataProcessor();
    this.jobs = new Map();
    this.isRunning = false;
  }

  /**
   * Start all background jobs
   */
  start() {
    if (this.isRunning) {
      logger.warn('Background jobs are already running');
      return;
    }

    logger.info('Starting background jobs...');

    // Update match results every 6 hours
    this.scheduleMatchUpdates();
    
    // Update competition standings daily at 2 AM
    this.scheduleStandingsUpdates();
    
    // Clean up old data weekly on Sunday at 3 AM
    this.scheduleDataCleanup();
    
    // Health check every hour
    this.scheduleHealthCheck();

    this.isRunning = true;
    logger.info('All background jobs started successfully');
  }

  /**
   * Stop all background jobs
   */
  stop() {
    if (!this.isRunning) {
      logger.warn('Background jobs are not running');
      return;
    }

    logger.info('Stopping background jobs...');

    this.jobs.forEach((job, name) => {
      if (job && typeof job.destroy === 'function') {
        job.destroy();
        logger.debug(`Stopped job: ${name}`);
      }
    });

    this.jobs.clear();
    this.isRunning = false;
    logger.info('All background jobs stopped');
  }

  /**
   * Schedule match result updates
   * Runs every 6 hours to update ongoing and recent matches
   */
  scheduleMatchUpdates() {
    const cronExpression = process.env.CRON_UPDATE_MATCHES || '0 */6 * * *';
    
    const job = cron.schedule(cronExpression, async () => {
      try {
        logger.info('Starting scheduled match updates...');
        await this.updateRecentMatches();
        logger.info('Scheduled match updates completed');
      } catch (error) {
        logger.error('Error in scheduled match updates:', error);
      }
    }, {
      scheduled: false,
      timezone: 'UTC',
    });

    job.start();
    this.jobs.set('matchUpdates', job);
    logger.info(`Scheduled match updates: ${cronExpression}`);
  }

  /**
   * Schedule standings updates
   * Runs daily at 2 AM to update league standings
   */
  scheduleStandingsUpdates() {
    const cronExpression = process.env.CRON_UPDATE_STANDINGS || '0 2 * * *';
    
    const job = cron.schedule(cronExpression, async () => {
      try {
        logger.info('Starting scheduled standings updates...');
        await this.updateCompetitionStandings();
        logger.info('Scheduled standings updates completed');
      } catch (error) {
        logger.error('Error in scheduled standings updates:', error);
      }
    }, {
      scheduled: false,
      timezone: 'UTC',
    });

    job.start();
    this.jobs.set('standingsUpdates', job);
    logger.info(`Scheduled standings updates: ${cronExpression}`);
  }

  /**
   * Schedule data cleanup
   * Runs weekly on Sunday at 3 AM to clean old data
   */
  scheduleDataCleanup() {
    const cronExpression = process.env.CRON_CLEANUP_OLD_DATA || '0 3 * * 0';
    
    const job = cron.schedule(cronExpression, async () => {
      try {
        logger.info('Starting scheduled data cleanup...');
        await this.dataProcessor.cleanOldData();
        logger.info('Scheduled data cleanup completed');
      } catch (error) {
        logger.error('Error in scheduled data cleanup:', error);
      }
    }, {
      scheduled: false,
      timezone: 'UTC',
    });

    job.start();
    this.jobs.set('dataCleanup', job);
    logger.info(`Scheduled data cleanup: ${cronExpression}`);
  }

  /**
   * Schedule health check
   * Runs every hour to monitor system health
   */
  scheduleHealthCheck() {
    const job = cron.schedule('0 * * * *', async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        logger.error('Error in health check:', error);
      }
    }, {
      scheduled: false,
      timezone: 'UTC',
    });

    job.start();
    this.jobs.set('healthCheck', job);
    logger.debug('Scheduled health check: every hour');
  }

  /**
   * Update recent and ongoing matches for all active competitions
   */
  async updateRecentMatches() {
    try {
      const competitions = await Competition.findAll({
        where: { isActive: true },
        attributes: ['id', 'name', 'externalId'],
      });

      let totalProcessed = 0;
      let totalErrors = 0;

      for (const competition of competitions) {
        try {
          // Update matches from the last 7 days and next 7 days
          const dateFrom = new Date();
          dateFrom.setDate(dateFrom.getDate() - 7);
          
          const dateTo = new Date();
          dateTo.setDate(dateTo.getDate() + 7);

          const filters = {
            dateFrom: dateFrom.toISOString().split('T')[0],
            dateTo: dateTo.toISOString().split('T')[0],
          };

          const result = await this.dataProcessor.processMatches(competition.id, filters);
          totalProcessed += result.processed;
          totalErrors += result.errors;

          logger.debug(`Updated matches for ${competition.name}: ${result.processed} processed, ${result.errors} errors`);
        } catch (error) {
          logger.error(`Error updating matches for competition ${competition.name}:`, error);
          totalErrors++;
        }
      }

      logger.info(`Match updates completed: ${totalProcessed} matches processed, ${totalErrors} errors across ${competitions.length} competitions`);
      return { totalProcessed, totalErrors, competitions: competitions.length };
    } catch (error) {
      logger.error('Failed to update recent matches:', error);
      throw error;
    }
  }

  /**
   * Update competition standings (placeholder for future implementation)
   */
  async updateCompetitionStandings() {
    try {
      const competitions = await Competition.findAll({
        where: { isActive: true, type: 'LEAGUE' },
        attributes: ['id', 'name', 'externalId'],
      });

      // TODO: Implement standings storage and processing
      // This would involve creating a new Standings model and processing standings data
      
      logger.info(`Standings update completed for ${competitions.length} league competitions`);
      return { competitions: competitions.length };
    } catch (error) {
      logger.error('Failed to update competition standings:', error);
      throw error;
    }
  }

  /**
   * Perform system health check
   */
  async performHealthCheck() {
    try {
      const health = {
        timestamp: new Date().toISOString(),
        database: false,
        redis: false,
        externalAPI: false,
        backgroundJobs: this.isRunning,
      };

      // Check database connection
      try {
        const { sequelize } = require('../config/database');
        await sequelize.authenticate();
        health.database = true;
      } catch (error) {
        logger.warn('Database health check failed:', error.message);
      }

      // Check Redis connection
      try {
        const { getRedisClient } = require('../config/redis');
        await getRedisClient().ping();
        health.redis = true;
      } catch (error) {
        logger.warn('Redis health check failed:', error.message);
      }

      // Check external API
      try {
        await this.dataProcessor.footballAPI.makeRequest('/competitions', true, 300);
        health.externalAPI = true;
      } catch (error) {
        logger.warn('External API health check failed:', error.message);
      }

      const isHealthy = health.database && health.redis && health.externalAPI && health.backgroundJobs;
      
      if (isHealthy) {
        logger.debug('System health check: All systems operational');
      } else {
        logger.warn('System health check: Some systems are down', health);
      }

      return health;
    } catch (error) {
      logger.error('Health check failed:', error);
      return {
        timestamp: new Date().toISOString(),
        database: false,
        redis: false,
        externalAPI: false,
        backgroundJobs: false,
        error: error.message,
      };
    }
  }

  /**
   * Manually trigger a specific job
   */
  async runJob(jobName) {
    try {
      logger.info(`Manually triggering job: ${jobName}`);

      switch (jobName) {
        case 'matchUpdates':
          await this.updateRecentMatches();
          break;
        case 'standingsUpdates':
          await this.updateCompetitionStandings();
          break;
        case 'dataCleanup':
          await this.dataProcessor.cleanOldData();
          break;
        case 'healthCheck':
          return await this.performHealthCheck();
        default:
          throw new Error(`Unknown job: ${jobName}`);
      }

      logger.info(`Job ${jobName} completed successfully`);
      return { success: true, job: jobName };
    } catch (error) {
      logger.error(`Job ${jobName} failed:`, error);
      throw error;
    }
  }

  /**
   * Get job status and statistics
   */
  getJobStatus() {
    return {
      isRunning: this.isRunning,
      activeJobs: Array.from(this.jobs.keys()),
      totalJobs: this.jobs.size,
      uptime: this.isRunning ? process.uptime() : 0,
    };
  }

  /**
   * Process competitions data for initial setup
   */
  async initialDataSetup() {
    try {
      logger.info('Starting initial data setup...');

      // Process major competitions first
      const majorCompetitions = [
        'PL',  // Premier League
        'PD',  // La Liga
        'BL1', // Bundesliga
        'SA',  // Serie A
        'FL1', // Ligue 1
        'CL',  // Champions League
        'EL',  // Europa League
      ];

      let totalProcessed = 0;
      let totalErrors = 0;

      // First, get all competitions
      const competitionResult = await this.dataProcessor.processCompetitions();
      totalProcessed += competitionResult.processed;
      totalErrors += competitionResult.errors;

      // Get competitions from database
      const competitions = await Competition.findAll({
        where: { 
          isActive: true,
          code: majorCompetitions,
        },
      });

      // Process teams and matches for each major competition
      for (const competition of competitions) {
        try {
          // Process teams
          const teamResult = await this.dataProcessor.processTeams(competition.id);
          totalProcessed += teamResult.processed;
          totalErrors += teamResult.errors;

          // Process recent matches (last 30 days)
          const dateFrom = new Date();
          dateFrom.setDate(dateFrom.getDate() - 30);
          
          const matchResult = await this.dataProcessor.processMatches(competition.id, {
            dateFrom: dateFrom.toISOString().split('T')[0],
          });
          totalProcessed += matchResult.processed;
          totalErrors += matchResult.errors;

          logger.info(`Initial setup completed for ${competition.name}`);
        } catch (error) {
          logger.error(`Error in initial setup for ${competition.name}:`, error);
          totalErrors++;
        }
      }

      logger.info(`Initial data setup completed: ${totalProcessed} items processed, ${totalErrors} errors`);
      return { totalProcessed, totalErrors, competitions: competitions.length };
    } catch (error) {
      logger.error('Initial data setup failed:', error);
      throw error;
    }
  }
}

module.exports = BackgroundJobs;
