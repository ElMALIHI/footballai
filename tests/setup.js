// Test setup file for Jest
const { sequelize } = require('../src/config/database');
const { getRedisClient } = require('../src/config/redis');

// Set test environment
process.env.NODE_ENV = 'test';

// Global test setup
beforeAll(async () => {
  // Connect to test database
  await sequelize.authenticate();
  
  // Sync database (create tables)
  await sequelize.sync({ force: true });
  
  // Connect to test Redis
  await getRedisClient().connect();
});

// Global test teardown
afterAll(async () => {
  // Close database connection
  await sequelize.close();
  
  // Close Redis connection
  await getRedisClient().disconnect();
});

// Mock external services
jest.mock('../src/services/FootballDataAPI', () => {
  return jest.fn().mockImplementation(() => ({
    getCompetitions: jest.fn(),
    getCompetitionStandings: jest.fn(),
    getCompetitionMatches: jest.fn(),
    getTeams: jest.fn(),
    getTeamMatches: jest.fn(),
    getMatches: jest.fn(),
    getHeadToHead: jest.fn(),
    getAreas: jest.fn(),
    getUpcomingMatches: jest.fn(),
    getRecentMatches: jest.fn(),
    clearCache: jest.fn(),
  }));
});

// Mock logger to avoid console output during tests
jest.mock('../src/config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  stream: {
    write: jest.fn(),
  },
}));

// Global test utilities
global.testUtils = {
  // Create test data helpers
  createTestCompetition: (data = {}) => ({
    id: 1,
    name: 'Test Competition',
    code: 'TEST',
    type: 'LEAGUE',
    country: 'Test Country',
    emblem: 'https://example.com/test.png',
    currentSeason: 2023,
    numberOfAvailableSeasons: 1,
    lastUpdated: new Date().toISOString(),
    isActive: true,
    ...data,
  }),
  
  createTestTeam: (data = {}) => ({
    id: 1,
    name: 'Test Team',
    shortName: 'Test',
    tla: 'TST',
    crest: 'https://example.com/test.png',
    address: 'Test Address',
    website: 'https://test.com',
    founded: 1900,
    clubColors: 'Red / White',
    venue: 'Test Stadium',
    venueCapacity: 50000,
    country: 'Test Country',
    lastUpdated: new Date().toISOString(),
    isActive: true,
    ...data,
  }),
  
  createTestMatch: (data = {}) => ({
    id: 1,
    competitionId: 1,
    season: 2023,
    stage: 'REGULAR_SEASON',
    matchday: 1,
    homeTeamId: 1,
    awayTeamId: 2,
    homeTeamScore: null,
    awayTeamScore: null,
    winner: null,
    utcDate: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
    status: 'SCHEDULED',
    venue: 'Test Stadium',
    referee: 'Test Referee',
    homeTeamWinOdds: 2.0,
    drawOdds: 3.0,
    awayTeamWinOdds: 3.5,
    isPredicted: false,
    predictedWinner: null,
    predictionConfidence: null,
    ...data,
  }),
  
  createTestPrediction: (data = {}) => ({
    id: 1,
    matchId: 1,
    modelName: 'test_model',
    modelVersion: '1.0',
    homeTeamWinProbability: 0.4,
    drawProbability: 0.3,
    awayTeamWinProbability: 0.3,
    predictedWinner: 'HOME_TEAM',
    confidence: 0.7,
    actualWinner: null,
    isCorrect: null,
    predictionTimestamp: new Date().toISOString(),
    isProcessed: false,
    ...data,
  }),
  
  // Mock response helpers
  mockSuccessResponse: (data = {}) => ({
    success: true,
    message: 'Operation completed successfully',
    data,
    timestamp: new Date().toISOString(),
  }),
  
  mockErrorResponse: (message = 'Error occurred', details = null) => ({
    success: false,
    error: {
      message,
      details,
    },
  }),
  
  // Test database helpers
  clearDatabase: async () => {
    const models = sequelize.models;
    for (const modelName in models) {
      await models[modelName].destroy({ where: {}, force: true });
    }
  },
  
  seedTestData: async () => {
    const { Competition, Team, Match } = sequelize.models;
    
    // Create test competition
    const competition = await Competition.create(global.testUtils.createTestCompetition());
    
    // Create test teams
    const team1 = await Team.create(global.testUtils.createTestTeam({ id: 1, name: 'Team A' }));
    const team2 = await Team.create(global.testUtils.createTestTeam({ id: 2, name: 'Team B' }));
    
    // Create test match
    const match = await Match.create(global.testUtils.createTestMatch({
      homeTeamId: team1.id,
      awayTeamId: team2.id,
    }));
    
    return { competition, team1, team2, match };
  },
};

// Extend Jest matchers
expect.extend({
  toBeValidDate(received) {
    const pass = received instanceof Date && !isNaN(received);
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid date`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid date`,
        pass: false,
      };
    }
  },
  
  toBeValidUUID(received) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const pass = typeof received === 'string' && uuidRegex.test(received);
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid UUID`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid UUID`,
        pass: false,
      };
    }
  },
});

// Global test timeout
jest.setTimeout(30000);
