const redis = require('redis');
const logger = require('./logger');

// Create Redis client function to ensure environment variables are loaded
const createRedisClient = () => {
  const host = process.env.REDIS_HOST;
  const port = process.env.REDIS_PORT || 6379;
  const password = process.env.REDIS_PASSWORD;
  const db = process.env.REDIS_DB || 0;
  const family = process.env.REDIS_FAMILY || 4;
  const connectTimeout = process.env.REDIS_CONNECT_TIMEOUT || 10000;
  const commandTimeout = process.env.REDIS_COMMAND_TIMEOUT || 5000;
  
  if (!host) {
    throw new Error('REDIS_HOST environment variable is required');
  }
  
  logger.info(`Redis config - Host: ${host}, Port: ${port}, Password: ${password ? '***' : 'none'}, DB: ${db}, Family: ${family}`);
  
  // Create Redis client with proper configuration for Docker and Redis v4
  const client = redis.createClient({
    socket: {
      host: host,
      port: port,
      // Force IPv4 to avoid IPv6 connection issues
      family: parseInt(family),
      // Add connection timeout
      connectTimeout: parseInt(connectTimeout),
      // Add command timeout
      commandTimeout: parseInt(commandTimeout),
    },
    password: password || undefined,
    database: db,
  });

  // Add better error handling
  client.on('error', (err) => {
    logger.error('Redis client error:', err);
  });

  client.on('connect', () => {
    logger.info('Redis client connecting...');
  });

  client.on('ready', () => {
    logger.info('Redis client ready');
  });

  client.on('end', () => {
    logger.info('Redis client disconnected');
  });

  client.on('reconnecting', () => {
    logger.info('Redis client reconnecting...');
  });

  return client;
};

// Initialize client as null, will be created when needed
let redisClient = null;

// Function to get or create Redis client
const getRedisClient = () => {
  if (!redisClient) {
    try {
      redisClient = createRedisClient();
    } catch (error) {
      logger.error('Failed to create Redis client:', error);
      throw error;
    }
  }
  return redisClient;
};

// Function to check if Redis client is available and connected
const isRedisAvailable = () => {
  try {
    const client = getRedisClient();
    return client && client.isOpen;
  } catch (error) {
    return false;
  }
};

// Function to safely execute Redis operations
const safeRedisOperation = async (operation) => {
  try {
    if (!isRedisAvailable()) {
      throw new Error('Redis client not available');
    }
    return await operation();
  } catch (error) {
    logger.error('Redis operation failed:', error);
    throw error;
  }
};

// Helper functions for common Redis operations
const redisHelpers = {
  // Set key with expiration
  setEx: async (key, seconds, value) => {
    return safeRedisOperation(async () => {
      return await getRedisClient().setEx(key, seconds, JSON.stringify(value));
    });
  },

  // Get key
  get: async (key) => {
    return safeRedisOperation(async () => {
      const value = await getRedisClient().get(key);
      return value ? JSON.parse(value) : null;
    });
  },

  // Delete key
  del: async (key) => {
    return safeRedisOperation(async () => {
      return await getRedisClient().del(key);
    });
  },

  // Set hash field
  hSet: async (key, field, value) => {
    return safeRedisOperation(async () => {
      return await getRedisClient().hSet(key, field, JSON.stringify(value));
    });
  },

  // Get hash field
  hGet: async (key, field) => {
    return safeRedisOperation(async () => {
      const value = await getRedisClient().hGet(key, field);
      return value ? JSON.parse(value) : null;
    });
  },

  // Get all hash fields
  hGetAll: async (key) => {
    return safeRedisOperation(async () => {
      const hash = await getRedisClient().hGetAll(key);
      const result = {};
      for (const [field, value] of Object.entries(hash)) {
        result[field] = JSON.parse(value);
      }
      return result;
    });
  },

  // Check if key exists
  exists: async (key) => {
    return safeRedisOperation(async () => {
      return await getRedisClient().exists(key);
    });
  },

  // Set expiration on key
  expire: async (key, seconds) => {
    return safeRedisOperation(async () => {
      return await getRedisClient().expire(key, seconds);
    });
  },

  // Flush all keys
  flushAll: async () => {
    return safeRedisOperation(async () => {
      return await getRedisClient().flushAll();
    });
  },
};

module.exports = {
  getRedisClient,
  isRedisAvailable,
  safeRedisOperation,
  redis: redisHelpers,
};
