require('dotenv').config();

console.log('=== Redis Connection Debug ===');
console.log('Environment variables:');
console.log('REDIS_HOST:', process.env.REDIS_HOST);
console.log('REDIS_PORT:', process.env.REDIS_PORT);
console.log('REDIS_PASSWORD:', process.env.REDIS_PASSWORD ? '***' : 'none');
console.log('REDIS_DB:', process.env.REDIS_DB);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('');

// Test basic Redis client creation
try {
  console.log('1. Testing Redis client creation...');
  const redis = require('redis');
  console.log('✅ Redis module loaded successfully');
  
  console.log('2. Creating Redis client...');
  const client = redis.createClient({
    socket: {
      host: process.env.REDIS_HOST || 'redis',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      family: 4, // Force IPv4
      connectTimeout: 10000,
      commandTimeout: 5000,
    },
    password: process.env.REDIS_PASSWORD || undefined,
    database: parseInt(process.env.REDIS_DB) || 0,
  });
  console.log('✅ Redis client created successfully');
  
  console.log('3. Setting up event listeners...');
  client.on('error', (err) => {
    console.log('❌ Redis error event:', err.message);
  });
  
  client.on('connect', () => {
    console.log('✅ Redis connect event fired');
  });
  
  client.on('ready', () => {
    console.log('✅ Redis ready event fired');
  });
  
  client.on('end', () => {
    console.log('ℹ️ Redis end event fired');
  });
  
  client.on('reconnecting', () => {
    console.log('🔄 Redis reconnecting event fired');
  });
  
  console.log('4. Attempting to connect...');
  await client.connect();
  console.log('✅ Redis connect() completed');
  
  console.log('5. Testing ping...');
  const pong = await client.ping();
  console.log('✅ Redis ping response:', pong);
  
  console.log('6. Disconnecting...');
  await client.disconnect();
  console.log('✅ Redis disconnect completed');
  
  console.log('\n🎉 All Redis tests passed successfully!');
  
} catch (error) {
  console.error('\n❌ Redis test failed:', error);
  console.error('Error details:', {
    message: error.message,
    code: error.code,
    errno: error.errno,
    syscall: error.syscall,
    address: error.address,
    port: error.port
  });
  process.exit(1);
}
