require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const logger = require('./config/logger');
const { sequelize } = require('./config/database');
const { getRedisClient } = require('./config/redis');
const BackgroundJobs = require('./services/BackgroundJobs');

// Import models to ensure they are registered with Sequelize
require('./models');

// Import routes
const competitionsRoutes = require('./routes/competitions');
const teamsRoutes = require('./routes/teams');
const matchesRoutes = require('./routes/matches');
const predictionsRoutes = require('./routes/predictions');
const bettingRoutes = require('./routes/betting');
const analyticsRoutes = require('./routes/analytics');
const adminRoutes = require('./routes/admin');

// Import middleware
const errorHandler = require('./middleware/errorHandler');
const requestLogger = require('./middleware/requestLogger');
const validationErrorHandler = require('./middleware/validationErrorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize background jobs
const backgroundJobs = new BackgroundJobs();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
}));

// Compression middleware
app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use(requestLogger);

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const healthStatus = {
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      services: {
        database: 'unknown',
        redis: 'unknown'
      }
    };

    // Check database connection
    try {
      await sequelize.authenticate();
      healthStatus.services.database = 'connected';
    } catch (error) {
      healthStatus.services.database = 'error';
      healthStatus.status = 'DEGRADED';
    }

    // Check Redis connection
    try {
      const redisClient = getRedisClient();
      if (redisClient.isOpen) {
        await redisClient.ping();
        healthStatus.services.redis = 'connected';
      } else {
        healthStatus.services.redis = 'disconnected';
        healthStatus.status = 'DEGRADED';
      }
    } catch (error) {
      healthStatus.services.redis = 'error';
      healthStatus.status = 'DEGRADED';
    }

    res.status(200).json(healthStatus);
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// API routes
const apiPrefix = process.env.API_PREFIX || '/api';
const apiVersion = process.env.API_VERSION || 'v1';
const basePath = `${apiPrefix}/${apiVersion}`;

app.use(`${basePath}/competitions`, competitionsRoutes);
app.use(`${basePath}/teams`, teamsRoutes);
app.use(`${basePath}/matches`, matchesRoutes);
app.use(`${basePath}/predictions`, predictionsRoutes);
app.use(`${basePath}/betting`, bettingRoutes);
app.use(`${basePath}/analytics`, analyticsRoutes);
app.use(`${basePath}/admin`, adminRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    message: `The requested route ${req.originalUrl} does not exist`,
    timestamp: new Date().toISOString(),
  });
});

// Error handling middleware
app.use(validationErrorHandler);
app.use(errorHandler);

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  
  try {
    // Stop background jobs
    backgroundJobs.stop();
    logger.info('Background jobs stopped');
    
    // Close database connection
    await sequelize.close();
    logger.info('Database connection closed');
    
    // Close Redis connection
    await getRedisClient().disconnect();
    logger.info('Redis connection closed');
    
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start server
const startServer = async () => {
  try {
    // Test database connection
    await sequelize.authenticate();
    logger.info('Database connection established successfully');
    
    // Sync database models (only in development, use migrations in production)
    if (process.env.NODE_ENV === 'development') {
      // Temporarily disable sync to avoid schema errors
      logger.info('Development mode: skipping database sync to avoid schema conflicts');
      // await sequelize.sync({ alter: true });
      // logger.info('Database models synchronized');
    } else {
      // In production, just verify the connection without syncing
      logger.info('Production mode: skipping database sync (use migrations)');
    }
    
    // Connect to Redis with retry logic
    let redisConnected = false;
    let retryCount = 0;
    const maxRetries = 5;
    
    while (!redisConnected && retryCount < maxRetries) {
      try {
        logger.info(`Attempting Redis connection (attempt ${retryCount + 1}/${maxRetries})...`);
        await getRedisClient().connect();
        logger.info('Redis client connecting...');

        // Test Redis connection
        await getRedisClient().ping();
        logger.info('Redis connection established successfully');
        redisConnected = true;
      } catch (error) {
        retryCount++;
        logger.error(`Redis connection attempt ${retryCount} failed:`, error.message);
        
        if (retryCount >= maxRetries) {
          logger.error('Max Redis connection retries reached. Starting server without Redis...');
          break;
        }
        
        // Wait before retrying
        const waitTime = Math.min(1000 * retryCount, 5000);
        logger.info(`Waiting ${waitTime}ms before retrying Redis connection...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    // Start background jobs in production and development
    if (process.env.NODE_ENV !== 'test') {
      backgroundJobs.start();
      logger.info('Background jobs started');
    }
    
    app.listen(PORT, () => {
      logger.info(`Server is running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`API Base URL: http://localhost:${PORT}${basePath}`);
      if (redisConnected) {
        logger.info('Redis: Connected');
      } else {
        logger.warn('Redis: Not connected - some features may be limited');
      }
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();

module.exports = app;
