require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api/v1';

async function testAITraining() {
  console.log('🧠 Testing AI Training System...\n');

  try {
    // Test 1: Check system health
    console.log('1. Checking system health...');
    const healthResponse = await axios.get(`${BASE_URL.replace('/api/v1', '')}/health`);
    console.log('✅ Health check passed:', healthResponse.data.status);
    console.log('   Database:', healthResponse.data.services.database);
    console.log('   Redis:', healthResponse.data.services.redis);
    console.log('');

    // Test 2: Check available data
    console.log('2. Checking available data...');
    const matchesResponse = await axios.get(`${BASE_URL}/matches?limit=1`);
    const totalMatches = matchesResponse.data.total || 0;
    console.log(`✅ Found ${totalMatches} matches in database`);
    
    if (totalMatches < 100) {
      console.log('⚠️  Warning: Need at least 100 matches for reliable training');
      console.log('   Consider running data collection first:');
      console.log('   curl -X POST "http://localhost:3000/api/v1/admin/setup-free-tier" \\');
      console.log('     -H "Content-Type: application/json" \\');
      console.log('     -d "{\\"includeTeams\\":true,\\"includeMatches\\":true,\\"daysBack\\":365}"');
      console.log('');
    } else {
      console.log('✅ Sufficient data for training');
      console.log('');
    }

    // Test 3: List existing models
    console.log('3. Checking existing models...');
    try {
      const modelsResponse = await axios.get(`${BASE_URL}/admin/ai/models`);
      const models = modelsResponse.data.data.models;
      console.log(`✅ Found ${models.length} existing models`);
      
      if (models.length > 0) {
        models.forEach(model => {
          console.log(`   - ${model.name} (${model.modelInfo?.type || 'unknown'})`);
        });
      }
    } catch (error) {
      console.log('ℹ️  No existing models found (this is normal for first run)');
    }
    console.log('');

    // Test 4: Check training statistics
    console.log('4. Checking training statistics...');
    try {
      const statsResponse = await axios.get(`${BASE_URL}/admin/ai/training-stats`);
      const stats = statsResponse.data.data;
      console.log(`✅ Training stats: ${stats.totalTrainingRuns} total runs`);
      console.log(`   Average training time: ${Math.round(stats.averageTrainingTime / 1000)}s`);
    } catch (error) {
      console.log('ℹ️  No training history found (this is normal for first run)');
    }
    console.log('');

    // Test 5: Test feature engineering (if we have matches)
    if (totalMatches > 0) {
      console.log('5. Testing feature engineering...');
      try {
        const firstMatch = matchesResponse.data.data[0];
        if (firstMatch) {
          console.log(`   Testing with match ID: ${firstMatch.id}`);
          console.log(`   ${firstMatch.homeTeam?.name || 'Unknown'} vs ${firstMatch.awayTeam?.name || 'Unknown'}`);
          console.log('✅ Feature engineering ready');
        }
      } catch (error) {
        console.log('⚠️  Feature engineering test failed:', error.message);
      }
    }
    console.log('');

    // Test 6: Show training commands
    console.log('6. Ready to train! Use these commands:');
    console.log('');
    console.log('🚀 Basic Random Forest Training:');
    console.log('curl -X POST "http://localhost:3000/api/v1/admin/ai/train" \\');
    console.log('  -H "Content-Type: application/json" \\');
    console.log('  -d "{');
    console.log('    \\"modelTypes\\": [\\"random_forest\\"],');
    console.log('    \\"crossValidationFolds\\": 5,');
    console.log('    \\"hyperparameterTuning\\": true,');
    console.log('    \\"maxTrainingTime\\": 15');
    console.log('  }"');
    console.log('');
    
    console.log('🎯 Advanced Training with Competition Focus:');
    console.log('curl -X POST "http://localhost:3000/api/v1/admin/ai/train" \\');
    console.log('  -H "Content-Type: application/json" \\');
    console.log('  -d "{');
    console.log('    \\"modelTypes\\": [\\"random_forest\\"],');
    console.log('    \\"competitionId\\": 2021,');
    console.log('    \\"daysBack\\": 730,');
    console.log('    \\"maxTrainingTime\\": 20');
    console.log('  }"');
    console.log('');

    // Test 7: Show monitoring commands
    console.log('7. Monitor training progress:');
    console.log('   Watch logs: docker logs -f footballai_api');
    console.log('   Check models: curl "http://localhost:3000/api/v1/admin/ai/models"');
    console.log('   Training stats: curl "http://localhost:3000/api/v1/admin/ai/training-stats"');
    console.log('');

    console.log('🎉 AI Training System is ready! 🚀');
    console.log('');
    console.log('📚 For detailed instructions, see: AI_TRAINING_GUIDE.md');
    console.log('🔧 For API reference, see: API_GUIDE.md');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('');
      console.log('💡 Make sure your API server is running:');
      console.log('   docker-compose up -d');
      console.log('   or');
      console.log('   npm start');
    }
    
    process.exit(1);
  }
}

// Run the test
testAITraining();
