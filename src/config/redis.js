const redis = require('redis');
const logger = require('./logger');

const redisClient = redis.createClient({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: process.env.REDIS_DB || 0,
  retry_strategy: (options) => {
    if (options.error && options.error.code === 'ECONNREFUSED') {
      // End reconnecting on a specific error and flush all commands with a individual error
      logger.error('Redis server refused connection');
      return new Error('Redis server refused connection');
    }
    if (options.total_retry_time > 1000 * 60 * 60) {
      // End reconnecting after a specific timeout and flush all commands with a individual error
      logger.error('Redis retry time exhausted');
      return new Error('Retry time exhausted');
    }
    if (options.attempt > 10) {
      // End reconnecting with built in error
      logger.error('Redis max retry attempts reached');
      return undefined;
    }
    // Reconnect after
    return Math.min(options.attempt * 100, 3000);
  },
});

redisClient.on('connect', () => {
  logger.info('Redis client connected');
});

redisClient.on('error', (err) => {
  logger.error('Redis client error:', err);
});

redisClient.on('ready', () => {
  logger.info('Redis client ready');
});

redisClient.on('end', () => {
  logger.info('Redis client disconnected');
});

// Helper functions for common Redis operations
const redisHelpers = {
  // Set key with expiration
  setEx: async (key, seconds, value) => {
    try {
      return await redisClient.setEx(key, seconds, JSON.stringify(value));
    } catch (error) {
      logger.error('Redis setEx error:', error);
      throw error;
    }
  },

  // Get key
  get: async (key) => {
    try {
      const value = await redisClient.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Redis get error:', error);
      throw error;
    }
  },

  // Delete key
  del: async (key) => {
    try {
      return await redisClient.del(key);
    } catch (error) {
      logger.error('Redis del error:', error);
      throw error;
    }
  },

  // Set hash field
  hSet: async (key, field, value) => {
    try {
      return await redisClient.hSet(key, field, JSON.stringify(value));
    } catch (error) {
      logger.error('Redis hSet error:', error);
      throw error;
    }
  },

  // Get hash field
  hGet: async (key, field) => {
    try {
      const value = await redisClient.hGet(key, field);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Redis hGet error:', error);
      throw error;
    }
  },

  // Get all hash fields
  hGetAll: async (key) => {
    try {
      const hash = await redisClient.hGetAll(key);
      const result = {};
      for (const [field, value] of Object.entries(hash)) {
        result[field] = JSON.parse(value);
      }
      return result;
    } catch (error) {
      logger.error('Redis hGetAll error:', error);
      throw error;
    }
  },

  // Check if key exists
  exists: async (key) => {
    try {
      return await redisClient.exists(key);
    } catch (error) {
      logger.error('Redis exists error:', error);
      throw error;
    }
  },

  // Set expiration on key
  expire: async (key, seconds) => {
    try {
      return await redisClient.expire(key, seconds);
    } catch (error) {
      logger.error('Redis expire error:', error);
      throw error;
    }
  },

  // Flush all keys
  flushAll: async () => {
    try {
      return await redisClient.flushAll();
    } catch (error) {
      logger.error('Redis flushAll error:', error);
      throw error;
    }
  },
};

module.exports = {
  redisClient,
  redis: redisHelpers,
};
