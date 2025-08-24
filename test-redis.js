require('dotenv').config();
const { getRedisClient } = require('./src/config/redis');

async function testRedisConnection() {
  try {
    console.log('Testing Redis connection...');
    console.log('Environment variables:');
    console.log('REDIS_HOST:', process.env.REDIS_HOST);
    console.log('REDIS_PORT:', process.env.REDIS_PORT);
    console.log('REDIS_PASSWORD:', process.env.REDIS_PASSWORD ? '***' : 'none');
    console.log('REDIS_DB:', process.env.REDIS_DB);
    
    const client = getRedisClient();
    console.log('Redis client created successfully');
    
    await client.connect();
    console.log('Connected to Redis');
    
    const pong = await client.ping();
    console.log('Redis ping response:', pong);
    
    await client.disconnect();
    console.log('Disconnected from Redis');
    
    console.log('✅ Redis connection test successful!');
  } catch (error) {
    console.error('❌ Redis connection test failed:', error);
    process.exit(1);
  }
}

testRedisConnection();
