const request = require('supertest');
const { expect } = require('chai');
const sinon = require('sinon');
const app = require('../../../src/app');
const FootballDataAPI = require('../../../src/services/FootballDataAPI');

describe('Competitions API', () => {
  let footballAPIStub;

  beforeEach(() => {
    footballAPIStub = sinon.stub(FootballDataAPI.prototype);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('GET /api/v1/competitions', () => {
    it('should return all competitions', async () => {
      const mockCompetitions = {
        competitions: [
          {
            id: 1,
            name: 'Premier League',
            code: 'PL',
            type: 'LEAGUE',
            country: 'England',
            emblem: 'https://example.com/pl.png',
            currentSeason: 2023,
            numberOfAvailableSeasons: 5,
            lastUpdated: '2023-08-01T00:00:00Z',
          },
          {
            id: 2,
            name: 'La Liga',
            code: 'PD',
            type: 'LEAGUE',
            country: 'Spain',
            emblem: 'https://example.com/laliga.png',
            currentSeason: 2023,
            numberOfAvailableSeasons: 5,
            lastUpdated: '2023-08-01T00:00:00Z',
          },
        ],
      };

      footballAPIStub.getCompetitions.resolves(mockCompetitions);

      const response = await request(app)
        .get('/api/v1/competitions')
        .expect(200);

      expect(response.body.success).to.be.true;
      expect(response.body.data).to.have.property('competitions');
      expect(response.body.data.competitions).to.have.length(2);
      expect(response.body.data.competitions[0].name).to.equal('Premier League');
      expect(footballAPIStub.getCompetitions.calledOnce).to.be.true;
    });

    it('should handle API errors gracefully', async () => {
      footballAPIStub.getCompetitions.rejects(new Error('API Error'));

      const response = await request(app)
        .get('/api/v1/competitions')
        .expect(500);

      expect(response.body.success).to.be.false;
      expect(response.body.error).to.have.property('message');
      expect(response.body.error.message).to.include('API Error');
    });

    it('should validate query parameters', async () => {
      const response = await request(app)
        .get('/api/v1/competitions')
        .query({ limit: 'invalid' })
        .expect(400);

      expect(response.body.success).to.be.false;
      expect(response.body.error).to.have.property('message');
      expect(response.body.error.message).to.equal('Validation Error');
    });
  });

  describe('GET /api/v1/competitions/:id', () => {
    it('should return a specific competition', async () => {
      const mockCompetition = {
        id: 1,
        name: 'Premier League',
        code: 'PL',
        type: 'LEAGUE',
        country: 'England',
        emblem: 'https://example.com/pl.png',
        currentSeason: 2023,
        numberOfAvailableSeasons: 5,
        lastUpdated: '2023-08-01T00:00:00Z',
      };

      footballAPIStub.getCompetitions.resolves({ competitions: [mockCompetition] });

      const response = await request(app)
        .get('/api/v1/competitions/1')
        .expect(200);

      expect(response.body.success).to.be.true;
      expect(response.body.data).to.have.property('competition');
      expect(response.body.data.competition.id).to.equal(1);
      expect(response.body.data.competition.name).to.equal('Premier League');
    });

    it('should return 404 for non-existent competition', async () => {
      footballAPIStub.getCompetitions.resolves({ competitions: [] });

      const response = await request(app)
        .get('/api/v1/competitions/999')
        .expect(404);

      expect(response.body.success).to.be.false;
      expect(response.body.error.message).to.equal('Competition not found');
    });

    it('should validate competition ID parameter', async () => {
      const response = await request(app)
        .get('/api/v1/competitions/invalid')
        .expect(400);

      expect(response.body.success).to.be.false;
      expect(response.body.error.message).to.equal('Validation Error');
    });
  });

  describe('GET /api/v1/competitions/:id/matches', () => {
    it('should return competition matches', async () => {
      const mockMatches = {
        matches: [
          {
            id: 1,
            competition: { id: 1, name: 'Premier League' },
            homeTeam: { id: 1, name: 'Team A' },
            awayTeam: { id: 2, name: 'Team B' },
            status: 'SCHEDULED',
            utcDate: '2023-08-15T19:00:00Z',
            matchday: 1,
          },
          {
            id: 2,
            competition: { id: 1, name: 'Premier League' },
            homeTeam: { id: 3, name: 'Team C' },
            awayTeam: { id: 4, name: 'Team D' },
            status: 'FINISHED',
            utcDate: '2023-08-14T15:00:00Z',
            matchday: 1,
            score: { fullTime: { home: 2, away: 1 } },
          },
        ],
      };

      footballAPIStub.getCompetitionMatches.resolves(mockMatches);

      const response = await request(app)
        .get('/api/v1/competitions/1/matches')
        .expect(200);

      expect(response.body.success).to.be.true;
      expect(response.body.data).to.have.property('matches');
      expect(response.body.data.matches).to.have.length(2);
      expect(response.body.data.competitionId).to.equal(1);
      expect(footballAPIStub.getCompetitionMatches.calledOnceWith(1)).to.be.true;
    });

    it('should handle query parameters for matches', async () => {
      const mockMatches = { matches: [] };
      footballAPIStub.getCompetitionMatches.resolves(mockMatches);

      const response = await request(app)
        .get('/api/v1/competitions/1/matches')
        .query({ 
          status: 'SCHEDULED',
          limit: 10,
          offset: 0,
        })
        .expect(200);

      expect(response.body.success).to.be.true;
      expect(footballAPIStub.getCompetitionMatches.calledOnce).to.be.true;
    });

    it('should validate match query parameters', async () => {
      const response = await request(app)
        .get('/api/v1/competitions/1/matches')
        .query({ limit: 'invalid' })
        .expect(400);

      expect(response.body.success).to.be.false;
      expect(response.body.error.message).to.equal('Validation Error');
    });
  });

  describe('GET /api/v1/competitions/:id/standings', () => {
    it('should return competition standings', async () => {
      const mockStandings = {
        standings: [
          {
            type: 'TOTAL',
            table: [
              {
                position: 1,
                team: { id: 1, name: 'Team A', crest: 'https://example.com/team-a.png' },
                playedGames: 10,
                won: 8,
                draw: 1,
                lost: 1,
                points: 25,
                goalsFor: 20,
                goalsAgainst: 8,
                goalDifference: 12,
              },
              {
                position: 2,
                team: { id: 2, name: 'Team B', crest: 'https://example.com/team-b.png' },
                playedGames: 10,
                won: 7,
                draw: 2,
                lost: 1,
                points: 23,
                goalsFor: 18,
                goalsAgainst: 10,
                goalDifference: 8,
              },
            ],
          },
        ],
      };

      footballAPIStub.getCompetitionStandings.resolves(mockStandings);

      const response = await request(app)
        .get('/api/v1/competitions/1/standings')
        .expect(200);

      expect(response.body.success).to.be.true;
      expect(response.body.data).to.have.property('standings');
      expect(response.body.data.standings).to.have.length(1);
      expect(response.body.data.standings[0].table).to.have.length(2);
      expect(response.body.data.competitionId).to.equal(1);
      expect(footballAPIStub.getCompetitionStandings.calledOnceWith(1)).to.be.true;
    });

    it('should handle standings API errors', async () => {
      footballAPIStub.getCompetitionStandings.rejects(new Error('Standings API Error'));

      const response = await request(app)
        .get('/api/v1/competitions/1/standings')
        .expect(500);

      expect(response.body.success).to.be.false;
      expect(response.body.error.message).to.include('Standings API Error');
    });
  });

  describe('Error handling', () => {
    it('should handle invalid routes', async () => {
      const response = await request(app)
        .get('/api/v1/competitions/invalid/route')
        .expect(404);

      expect(response.body.success).to.be.false;
      expect(response.body.error.message).to.equal('Route not found');
    });

    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/v1/competitions')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400);

      expect(response.body.success).to.be.false;
    });

    it('should handle missing required parameters', async () => {
      const response = await request(app)
        .get('/api/v1/competitions/')
        .expect(404);

      expect(response.body.success).to.be.false;
    });
  });

  describe('Response format', () => {
    it('should include proper response headers', async () => {
      footballAPIStub.getCompetitions.resolves({ competitions: [] });

      const response = await request(app)
        .get('/api/v1/competitions')
        .expect(200);

      expect(response.headers['content-type']).to.include('application/json');
      expect(response.headers).to.have.property('x-response-time');
    });

    it('should include pagination metadata when applicable', async () => {
      const mockCompetitions = {
        competitions: Array(20).fill().map((_, i) => ({
          id: i + 1,
          name: `Competition ${i + 1}`,
          code: `C${i + 1}`,
          type: 'LEAGUE',
          country: 'England',
        })),
      };

      footballAPIStub.getCompetitions.resolves(mockCompetitions);

      const response = await request(app)
        .get('/api/v1/competitions')
        .query({ limit: 10, offset: 0 })
        .expect(200);

      expect(response.body.data).to.have.property('pagination');
      expect(response.body.data.pagination).to.have.property('total');
      expect(response.body.data.pagination).to.have.property('limit');
      expect(response.body.data.pagination).to.have.property('offset');
    });
  });
});
