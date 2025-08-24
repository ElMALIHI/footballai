const request = require('supertest');
const { expect } = require('chai');
const sinon = require('sinon');
const FootballDataAPI = require('../../../src/services/FootballDataAPI');
const { redis } = require('../../../src/config/redis');

describe('FootballDataAPI', () => {
  let footballAPI;
  let redisStub;

  beforeEach(() => {
    footballAPI = new FootballDataAPI();
    redisStub = sinon.stub(redis);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('getCompetitions', () => {
    it('should fetch competitions successfully', async () => {
      const mockResponse = {
        competitions: [
          {
            id: 1,
            name: 'Premier League',
            code: 'PL',
            type: 'LEAGUE',
            country: 'England',
          },
        ],
      };

      redisStub.get.resolves(null);
      redisStub.setEx.resolves('OK');

      const result = await footballAPI.getCompetitions();
      
      expect(result).to.be.an('object');
      expect(result).to.have.property('competitions');
      expect(redisStub.get.calledOnce).to.be.true;
      expect(redisStub.setEx.calledOnce).to.be.true;
    });

    it('should return cached data when available', async () => {
      const cachedData = JSON.stringify({
        competitions: [{ id: 1, name: 'Premier League' }],
      });

      redisStub.get.resolves(cachedData);

      const result = await footballAPI.getCompetitions();
      
      expect(result).to.be.an('object');
      expect(redisStub.get.calledOnce).to.be.true;
      expect(redisStub.setEx.called).to.be.false;
    });
  });

  describe('getCompetitionStandings', () => {
    it('should fetch competition standings successfully', async () => {
      const competitionId = 1;
      const mockResponse = {
        standings: [
          {
            table: [
              {
                position: 1,
                team: { id: 1, name: 'Team A' },
                points: 30,
              },
            ],
          },
        ],
      };

      redisStub.get.resolves(null);
      redisStub.setEx.resolves('OK');

      const result = await footballAPI.getCompetitionStandings(competitionId);
      
      expect(result).to.be.an('object');
      expect(result).to.have.property('standings');
      expect(redisStub.get.calledOnce).to.be.true;
    });
  });

  describe('getCompetitionMatches', () => {
    it('should fetch competition matches successfully', async () => {
      const competitionId = 1;
      const mockResponse = {
        matches: [
          {
            id: 1,
            homeTeam: { id: 1, name: 'Team A' },
            awayTeam: { id: 2, name: 'Team B' },
            status: 'SCHEDULED',
          },
        ],
      };

      redisStub.get.resolves(null);
      redisStub.setEx.resolves('OK');

      const result = await footballAPI.getCompetitionMatches(competitionId);
      
      expect(result).to.be.an('object');
      expect(result).to.have.property('matches');
      expect(redisStub.get.calledOnce).to.be.true;
    });
  });

  describe('getTeams', () => {
    it('should fetch teams successfully', async () => {
      const competitionId = 1;
      const mockResponse = {
        teams: [
          {
            id: 1,
            name: 'Team A',
            shortName: 'TA',
            tla: 'TA',
          },
        ],
      };

      redisStub.get.resolves(null);
      redisStub.setEx.resolves('OK');

      const result = await footballAPI.getTeams(competitionId);
      
      expect(result).to.be.an('object');
      expect(result).to.have.property('teams');
      expect(redisStub.get.calledOnce).to.be.true;
    });
  });

  describe('getTeamMatches', () => {
    it('should fetch team matches successfully', async () => {
      const teamId = 1;
      const mockResponse = {
        matches: [
          {
            id: 1,
            homeTeam: { id: 1, name: 'Team A' },
            awayTeam: { id: 2, name: 'Team B' },
            status: 'FINISHED',
            score: { fullTime: { home: 2, away: 1 } },
          },
        ],
      };

      redisStub.get.resolves(null);
      redisStub.setEx.resolves('OK');

      const result = await footballAPI.getTeamMatches(teamId);
      
      expect(result).to.be.an('object');
      expect(result).to.have.property('matches');
      expect(redisStub.get.calledOnce).to.be.true;
    });
  });

  describe('getMatches', () => {
    it('should fetch general matches successfully', async () => {
      const mockResponse = {
        matches: [
          {
            id: 1,
            homeTeam: { id: 1, name: 'Team A' },
            awayTeam: { id: 2, name: 'Team B' },
            status: 'SCHEDULED',
          },
        ],
      };

      redisStub.get.resolves(null);
      redisStub.setEx.resolves('OK');

      const result = await footballAPI.getMatches();
      
      expect(result).to.be.an('object');
      expect(result).to.have.property('matches');
      expect(redisStub.get.calledOnce).to.be.true;
    });
  });

  describe('getHeadToHead', () => {
    it('should fetch head-to-head data successfully', async () => {
      const team1Id = 1;
      const team2Id = 2;
      const mockResponse = {
        matches: [
          {
            id: 1,
            homeTeam: { id: 1, name: 'Team A' },
            awayTeam: { id: 2, name: 'Team B' },
            status: 'FINISHED',
            score: { fullTime: { home: 2, away: 1 } },
          },
        ],
      };

      redisStub.get.resolves(null);
      redisStub.setEx.resolves('OK');

      const result = await footballAPI.getHeadToHead(team1Id, team2Id);
      
      expect(result).to.be.an('object');
      expect(result).to.have.property('matches');
      expect(redisStub.get.calledOnce).to.be.true;
    });
  });

  describe('getAreas', () => {
    it('should fetch areas successfully', async () => {
      const mockResponse = {
        areas: [
          {
            id: 1,
            name: 'England',
            countryCode: 'ENG',
          },
        ],
      };

      redisStub.get.resolves(null);
      redisStub.setEx.resolves('OK');

      const result = await footballAPI.getAreas();
      
      expect(result).to.be.an('object');
      expect(result).to.have.property('areas');
      expect(redisStub.get.calledOnce).to.be.true;
    });
  });

  describe('getUpcomingMatches', () => {
    it('should fetch upcoming matches successfully', async () => {
      const mockResponse = {
        matches: [
          {
            id: 1,
            homeTeam: { id: 1, name: 'Team A' },
            awayTeam: { id: 2, name: 'Team B' },
            status: 'SCHEDULED',
            utcDate: new Date(Date.now() + 86400000).toISOString(),
          },
        ],
      };

      redisStub.get.resolves(null);
      redisStub.setEx.resolves('OK');

      const result = await footballAPI.getUpcomingMatches();
      
      expect(result).to.be.an('object');
      expect(result).to.have.property('matches');
      expect(redisStub.get.calledOnce).to.be.true;
    });
  });

  describe('getRecentMatches', () => {
    it('should fetch recent matches successfully', async () => {
      const mockResponse = {
        matches: [
          {
            id: 1,
            homeTeam: { id: 1, name: 'Team A' },
            awayTeam: { id: 2, name: 'Team B' },
            status: 'FINISHED',
            utcDate: new Date(Date.now() - 86400000).toISOString(),
          },
        ],
      };

      redisStub.get.resolves(null);
      redisStub.setEx.resolves('OK');

      const result = await footballAPI.getRecentMatches();
      
      expect(result).to.be.an('object');
      expect(result).to.have.property('matches');
      expect(redisStub.get.calledOnce).to.be.true;
    });
  });

  describe('clearCache', () => {
    it('should clear specific cache entry', async () => {
      const key = 'test-key';
      redisStub.del.resolves(1);

      await footballAPI.clearCache(key);
      
      expect(redisStub.del.calledOnceWith(key)).to.be.true;
    });

    it('should clear all cache when no key provided', async () => {
      redisStub.flushAll.resolves('OK');

      await footballAPI.clearCache();
      
      expect(redisStub.flushAll.calledOnce).to.be.true;
    });
  });

  describe('error handling', () => {
    it('should handle API errors gracefully', async () => {
      redisStub.get.resolves(null);
      redisStub.setEx.rejects(new Error('API Error'));

      try {
        await footballAPI.getCompetitions();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(Error);
        expect(error.message).to.include('API Error');
      }
    });

    it('should handle Redis errors gracefully', async () => {
      redisStub.get.rejects(new Error('Redis Error'));

      try {
        await footballAPI.getCompetitions();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(Error);
        expect(error.message).to.include('Redis Error');
      }
    });
  });

  describe('rate limiting', () => {
    it('should respect rate limits', async () => {
      const startTime = Date.now();
      
      // Make multiple requests quickly
      const promises = Array(5).fill().map(() => footballAPI.getCompetitions());
      
      await Promise.all(promises);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should take at least 1 second due to rate limiting
      expect(duration).to.be.at.least(1000);
    });
  });
});
