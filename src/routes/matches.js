const express = require('express');
const Joi = require('joi');
const { Match, Team, Competition, Prediction } = require('../models');
const DataProcessor = require('../services/DataProcessor');
const FootballDataAPI = require('../services/FootballDataAPI');
const logger = require('../config/logger');
const { Op } = require('sequelize');

const router = express.Router();
const dataProcessor = new DataProcessor();
const footballAPI = new FootballDataAPI();

// Validation schemas
const matchIdSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
});

const matchFiltersSchema = Joi.object({
  competition: Joi.number().integer().positive(),
  season: Joi.number().integer().min(2000).max(2030),
  status: Joi.string().valid('SCHEDULED', 'LIVE', 'IN_PLAY', 'PAUSED', 'FINISHED', 'POSTPONED', 'SUSPENDED', 'CANCELLED'),
  dateFrom: Joi.date().iso(),
  dateTo: Joi.date().iso(),
  team: Joi.number().integer().positive(),
  venue: Joi.string().valid('home', 'away'),
  limit: Joi.number().integer().min(1).max(100).default(20),
  offset: Joi.number().integer().min(0).default(0),
});

const updateMatchesSchema = Joi.object({
  competitionId: Joi.number().integer().positive().required(),
  season: Joi.number().integer().min(2000).max(2030),
  dateFrom: Joi.date().iso(),
  dateTo: Joi.date().iso(),
  forceUpdate: Joi.boolean().default(false),
});

const head2headSchema = Joi.object({
  limit: Joi.number().integer().min(1).max(20).default(10),
});

// GET /api/v1/matches - List matches with filters
router.get('/', async (req, res, next) => {
  try {
    const { error, value } = matchFiltersSchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation Error',
          details: error.details,
        },
      });
    }

    const { competition, season, status, dateFrom, dateTo, team, venue, limit, offset } = value;

    // Build where conditions
    const whereConditions = {};
    
    if (competition) {
      whereConditions.competitionId = competition;
    }
    
    if (season) {
      whereConditions.season = season;
    }
    
    if (status) {
      whereConditions.status = status;
    }
    
    if (dateFrom || dateTo) {
      whereConditions.utcDate = {};
      if (dateFrom) whereConditions.utcDate[Op.gte] = new Date(dateFrom);
      if (dateTo) whereConditions.utcDate[Op.lte] = new Date(dateTo);
    }

    // Handle team and venue filters
    if (team) {
      if (venue === 'home') {
        whereConditions.homeTeamId = team;
      } else if (venue === 'away') {
        whereConditions.awayTeamId = team;
      } else {
        whereConditions[Op.or] = [
          { homeTeamId: team },
          { awayTeamId: team },
        ];
      }
    }

    const matches = await Match.findAndCountAll({
      where: whereConditions,
      include: [
        {
          model: Team,
          as: 'homeTeam',
          attributes: ['id', 'name', 'shortName', 'tla', 'crest'],
        },
        {
          model: Team,
          as: 'awayTeam',
          attributes: ['id', 'name', 'shortName', 'tla', 'crest'],
        },
        {
          model: Competition,
          as: 'competition',
          attributes: ['id', 'name', 'code', 'emblem', 'country'],
        },
      ],
      order: [['utcDate', 'DESC']],
      limit,
      offset,
    });

    res.json({
      success: true,
      data: {
        matches: matches.rows.map(match => ({
          id: match.id,
          externalId: match.externalId,
          competition: match.competition,
          season: match.season,
          stage: match.stage,
          group: match.group,
          matchday: match.matchday,
          utcDate: match.utcDate,
          status: match.status,
          venue: match.venue,
          referee: match.referee,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          homeTeamScore: match.homeTeamScore,
          awayTeamScore: match.awayTeamScore,
          homeTeamHalfTimeScore: match.homeTeamHalfTimeScore,
          awayTeamHalfTimeScore: match.awayTeamHalfTimeScore,
          winner: match.winner,
          duration: match.duration,
          isPredicted: match.isPredicted,
          predictedWinner: match.predictedWinner,
          homeTeamWinProbability: match.homeTeamWinProbability,
          drawProbability: match.drawProbability,
          awayTeamWinProbability: match.awayTeamWinProbability,
          predictionConfidence: match.predictionConfidence,
          lastUpdated: match.lastUpdated,
        })),
        pagination: {
          total: matches.count,
          limit,
          offset,
          pages: Math.ceil(matches.count / limit),
          currentPage: Math.floor(offset / limit) + 1,
        },
        filters: {
          competition,
          season,
          status,
          dateFrom,
          dateTo,
          team,
          venue,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/matches/:id - Specific match details
router.get('/:id', async (req, res, next) => {
  try {
    const { error, value } = matchIdSchema.validate(req.params);
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation Error',
          details: error.details,
        },
      });
    }

    const { id } = value;

    const match = await Match.findOne({
      where: { id },
      include: [
        {
          model: Team,
          as: 'homeTeam',
          attributes: ['id', 'name', 'shortName', 'tla', 'crest', 'founded', 'venue', 'country'],
        },
        {
          model: Team,
          as: 'awayTeam',
          attributes: ['id', 'name', 'shortName', 'tla', 'crest', 'founded', 'venue', 'country'],
        },
        {
          model: Competition,
          as: 'competition',
          attributes: ['id', 'name', 'code', 'emblem', 'country', 'type'],
        },
        {
          model: Prediction,
          as: 'predictions',
          attributes: ['id', 'modelName', 'predictedWinner', 'homeTeamWinProbability', 'drawProbability', 'awayTeamWinProbability', 'confidence', 'predictionTimestamp'],
          order: [['predictionTimestamp', 'DESC']],
          limit: 3,
        },
      ],
    });

    if (!match) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Match not found',
          details: 'The requested match does not exist',
        },
      });
    }

    res.json({
      success: true,
      data: {
        match: {
          id: match.id,
          externalId: match.externalId,
          competition: match.competition,
          season: match.season,
          stage: match.stage,
          group: match.group,
          matchday: match.matchday,
          utcDate: match.utcDate,
          status: match.status,
          venue: match.venue,
          referee: match.referee,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          // Scores
          homeTeamScore: match.homeTeamScore,
          awayTeamScore: match.awayTeamScore,
          homeTeamHalfTimeScore: match.homeTeamHalfTimeScore,
          awayTeamHalfTimeScore: match.awayTeamHalfTimeScore,
          homeTeamFullTimeScore: match.homeTeamFullTimeScore,
          awayTeamFullTimeScore: match.awayTeamFullTimeScore,
          homeTeamExtraTimeScore: match.homeTeamExtraTimeScore,
          awayTeamExtraTimeScore: match.awayTeamExtraTimeScore,
          homeTeamPenaltiesScore: match.homeTeamPenaltiesScore,
          awayTeamPenaltiesScore: match.awayTeamPenaltiesScore,
          winner: match.winner,
          duration: match.duration,
          // Live match data
          minute: match.minute,
          second: match.second,
          // Betting odds
          homeTeamOdds: match.homeTeamOdds,
          drawOdds: match.drawOdds,
          awayTeamOdds: match.awayTeamOdds,
          // Predictions
          isPredicted: match.isPredicted,
          predictedWinner: match.predictedWinner,
          homeTeamWinProbability: match.homeTeamWinProbability,
          drawProbability: match.drawProbability,
          awayTeamWinProbability: match.awayTeamWinProbability,
          predictionConfidence: match.predictionConfidence,
          predictionModel: match.predictionModel,
          predictionTimestamp: match.predictionTimestamp,
          predictions: match.predictions,
          // Metadata
          lastUpdated: match.lastUpdated,
          createdAt: match.createdAt,
          updatedAt: match.updatedAt,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/matches/:id/head2head - Head-to-head analysis
router.get('/:id/head2head', async (req, res, next) => {
  try {
    const { error: idError, value: idValue } = matchIdSchema.validate(req.params);
    if (idError) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation Error',
          details: idError.details,
        },
      });
    }

    const { error: queryError, value: queryValue } = head2headSchema.validate(req.query);
    if (queryError) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation Error',
          details: queryError.details,
        },
      });
    }

    const { id } = idValue;
    const { limit } = queryValue;

    // Get the match to find the teams
    const match = await Match.findOne({
      where: { id },
      attributes: ['id', 'homeTeamId', 'awayTeamId'],
      include: [
        {
          model: Team,
          as: 'homeTeam',
          attributes: ['id', 'name', 'shortName', 'tla', 'crest'],
        },
        {
          model: Team,
          as: 'awayTeam',
          attributes: ['id', 'name', 'shortName', 'tla', 'crest'],
        },
      ],
    });

    if (!match) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Match not found',
          details: 'The requested match does not exist',
        },
      });
    }

    // Get head-to-head analysis
    const h2hAnalysis = await dataProcessor.getHeadToHeadAnalysis(
      match.homeTeamId,
      match.awayTeamId,
      limit
    );

    res.json({
      success: true,
      data: {
        match: {
          id: match.id,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
        },
        headToHead: {
          ...h2hAnalysis,
          team1: match.homeTeam,
          team2: match.awayTeam,
        },
        filters: {
          limit,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/matches/update - Manual data update
router.post('/update', async (req, res, next) => {
  try {
    const { error, value } = updateMatchesSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation Error',
          details: error.details,
        },
      });
    }

    const { competitionId, season, dateFrom, dateTo, forceUpdate } = value;

    // Check if competition exists
    const competition = await Competition.findOne({
      where: { id: competitionId, isActive: true },
    });

    if (!competition) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Competition not found',
          details: 'The requested competition does not exist',
        },
      });
    }

    // Build filters for data update
    const filters = {};
    if (season) filters.season = season;
    if (dateFrom) filters.dateFrom = new Date(dateFrom).toISOString().split('T')[0];
    if (dateTo) filters.dateTo = new Date(dateTo).toISOString().split('T')[0];

    logger.info(`Manual data update requested for competition ${competition.name}`, {
      competitionId,
      filters,
      forceUpdate,
    });

    // Process teams first if not exists
    const teamResult = await dataProcessor.processTeams(competitionId, season);
    
    // Process matches
    const matchResult = await dataProcessor.processMatches(competitionId, filters);

    const result = {
      competition: {
        id: competition.id,
        name: competition.name,
        code: competition.code,
      },
      teams: teamResult,
      matches: matchResult,
      filters,
      timestamp: new Date().toISOString(),
    };

    logger.info('Manual data update completed', result);

    res.json({
      success: true,
      message: 'Data update completed successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/matches/upcoming - Get upcoming matches
router.get('/upcoming', async (req, res, next) => {
  try {
    const { error, value } = matchFiltersSchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation Error',
          details: error.details,
        },
      });
    }

    const { competition, limit, offset } = value;

    // Get upcoming matches (next 7 days by default)
    const now = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);

    const whereConditions = {
      status: 'SCHEDULED',
      utcDate: {
        [Op.between]: [now, nextWeek],
      },
    };

    if (competition) {
      whereConditions.competitionId = competition;
    }

    const matches = await Match.findAndCountAll({
      where: whereConditions,
      include: [
        {
          model: Team,
          as: 'homeTeam',
          attributes: ['id', 'name', 'shortName', 'tla', 'crest'],
        },
        {
          model: Team,
          as: 'awayTeam',
          attributes: ['id', 'name', 'shortName', 'tla', 'crest'],
        },
        {
          model: Competition,
          as: 'competition',
          attributes: ['id', 'name', 'code', 'emblem'],
        },
      ],
      order: [['utcDate', 'ASC']],
      limit,
      offset,
    });

    res.json({
      success: true,
      data: {
        upcomingMatches: matches.rows.map(match => ({
          id: match.id,
          externalId: match.externalId,
          competition: match.competition,
          utcDate: match.utcDate,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          venue: match.venue,
          matchday: match.matchday,
          stage: match.stage,
          isPredicted: match.isPredicted,
          predictedWinner: match.predictedWinner,
          predictionConfidence: match.predictionConfidence,
        })),
        pagination: {
          total: matches.count,
          limit,
          offset,
          pages: Math.ceil(matches.count / limit),
          currentPage: Math.floor(offset / limit) + 1,
        },
        dateRange: {
          from: now.toISOString(),
          to: nextWeek.toISOString(),
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/matches/live - Get live matches
router.get('/live', async (req, res, next) => {
  try {
    const { error, value } = matchFiltersSchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation Error',
          details: error.details,
        },
      });
    }

    const { competition, limit, offset } = value;

    const whereConditions = {
      status: {
        [Op.in]: ['LIVE', 'IN_PLAY', 'PAUSED'],
      },
    };

    if (competition) {
      whereConditions.competitionId = competition;
    }

    const matches = await Match.findAndCountAll({
      where: whereConditions,
      include: [
        {
          model: Team,
          as: 'homeTeam',
          attributes: ['id', 'name', 'shortName', 'tla', 'crest'],
        },
        {
          model: Team,
          as: 'awayTeam',
          attributes: ['id', 'name', 'shortName', 'tla', 'crest'],
        },
        {
          model: Competition,
          as: 'competition',
          attributes: ['id', 'name', 'code', 'emblem'],
        },
      ],
      order: [['utcDate', 'ASC']],
      limit,
      offset,
    });

    res.json({
      success: true,
      data: {
        liveMatches: matches.rows.map(match => ({
          id: match.id,
          externalId: match.externalId,
          competition: match.competition,
          utcDate: match.utcDate,
          status: match.status,
          minute: match.minute,
          second: match.second,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          homeTeamScore: match.homeTeamScore,
          awayTeamScore: match.awayTeamScore,
          venue: match.venue,
          referee: match.referee,
        })),
        pagination: {
          total: matches.count,
          limit,
          offset,
          pages: Math.ceil(matches.count / limit),
          currentPage: Math.floor(offset / limit) + 1,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
