const express = require('express');
const Joi = require('joi');
const { Team, Match, Competition } = require('../models');
const DataProcessor = require('../services/DataProcessor');
const FootballDataAPI = require('../services/FootballDataAPI');
const logger = require('../config/logger');
const { Op } = require('sequelize');

const router = express.Router();
const dataProcessor = new DataProcessor();
const footballAPI = new FootballDataAPI();

// Validation schemas
const teamIdSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
});

const teamFiltersSchema = Joi.object({
  competition: Joi.number().integer().positive(),
  country: Joi.string().max(100),
  search: Joi.string().max(100),
  limit: Joi.number().integer().min(1).max(100).default(20),
  offset: Joi.number().integer().min(0).default(0),
});

const matchFiltersSchema = Joi.object({
  season: Joi.number().integer().min(2000).max(2030),
  status: Joi.string().valid('SCHEDULED', 'LIVE', 'IN_PLAY', 'PAUSED', 'FINISHED', 'POSTPONED', 'SUSPENDED', 'CANCELLED'),
  venue: Joi.string().valid('home', 'away'),
  limit: Joi.number().integer().min(1).max(100).default(20),
  offset: Joi.number().integer().min(0).default(0),
});

const statsFiltersSchema = Joi.object({
  season: Joi.number().integer().min(2000).max(2030),
  lastNMatches: Joi.number().integer().min(1).max(50),
});

// GET /api/v1/teams - List teams
router.get('/', async (req, res, next) => {
  try {
    const { error, value } = teamFiltersSchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation Error',
          details: error.details,
        },
      });
    }

    const { competition, country, search, limit, offset } = value;

    // Build where conditions
    const whereConditions = { isActive: true };
    
    if (country) {
      whereConditions.country = { [Op.iLike]: `%${country}%` };
    }
    
    if (search) {
      whereConditions[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { shortName: { [Op.iLike]: `%${search}%` } },
        { tla: { [Op.iLike]: `%${search}%` } },
      ];
    }

    // Build include conditions
    const includeOptions = [];
    if (competition) {
      includeOptions.push({
        model: Match,
        as: 'homeMatches',
        where: { competitionId: competition },
        required: true,
        attributes: [],
      });
    }

    const teams = await Team.findAndCountAll({
      where: whereConditions,
      include: includeOptions,
      limit,
      offset,
      order: [['name', 'ASC']],
      distinct: true,
    });

    res.json({
      success: true,
      data: {
        teams: teams.rows.map(team => ({
          id: team.id,
          externalId: team.externalId,
          name: team.name,
          shortName: team.shortName,
          tla: team.tla,
          crest: team.crest,
          country: team.country,
          founded: team.founded,
          venue: team.venue,
          website: team.website,
          clubColors: team.clubColors,
          lastUpdated: team.lastUpdated,
        })),
        pagination: {
          total: teams.count,
          limit,
          offset,
          pages: Math.ceil(teams.count / limit),
          currentPage: Math.floor(offset / limit) + 1,
        },
        filters: {
          competition,
          country,
          search,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/teams/:id - Team details
router.get('/:id', async (req, res, next) => {
  try {
    const { error, value } = teamIdSchema.validate(req.params);
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

    const team = await Team.findOne({
      where: { id, isActive: true },
    });

    if (!team) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Team not found',
          details: 'The requested team does not exist',
        },
      });
    }

    // Get recent match count
    const recentMatchCount = await Match.count({
      where: {
        [Op.or]: [
          { homeTeamId: id },
          { awayTeamId: id },
        ],
        utcDate: {
          [Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
        },
      },
    });

    res.json({
      success: true,
      data: {
        team: {
          id: team.id,
          externalId: team.externalId,
          name: team.name,
          shortName: team.shortName,
          tla: team.tla,
          crest: team.crest,
          address: team.address,
          website: team.website,
          founded: team.founded,
          clubColors: team.clubColors,
          venue: team.venue,
          venueCapacity: team.venueCapacity,
          country: team.country,
          countryCode: team.countryCode,
          lastUpdated: team.lastUpdated,
          createdAt: team.createdAt,
          updatedAt: team.updatedAt,
          recentMatchCount,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/teams/:id/matches - Team matches
router.get('/:id/matches', async (req, res, next) => {
  try {
    const { error: idError, value: idValue } = teamIdSchema.validate(req.params);
    if (idError) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation Error',
          details: idError.details,
        },
      });
    }

    const { error: queryError, value: queryValue } = matchFiltersSchema.validate(req.query);
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
    const { season, status, venue, limit, offset } = queryValue;

    // Check if team exists
    const team = await Team.findOne({
      where: { id, isActive: true },
    });

    if (!team) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Team not found',
          details: 'The requested team does not exist',
        },
      });
    }

    // Build where conditions
    const whereConditions = {};
    
    if (season) {
      whereConditions.season = season;
    }
    
    if (status) {
      whereConditions.status = status;
    }

    // Handle venue filter
    if (venue === 'home') {
      whereConditions.homeTeamId = id;
    } else if (venue === 'away') {
      whereConditions.awayTeamId = id;
    } else {
      whereConditions[Op.or] = [
        { homeTeamId: id },
        { awayTeamId: id },
      ];
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
      order: [['utcDate', 'DESC']],
      limit,
      offset,
    });

    res.json({
      success: true,
      data: {
        team: {
          id: team.id,
          name: team.name,
          shortName: team.shortName,
          tla: team.tla,
        },
        matches: matches.rows.map(match => ({
          id: match.id,
          externalId: match.externalId,
          utcDate: match.utcDate,
          status: match.status,
          matchday: match.matchday,
          stage: match.stage,
          venue: match.venue,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          homeTeamScore: match.homeTeamScore,
          awayTeamScore: match.awayTeamScore,
          winner: match.winner,
          competition: match.competition,
        })),
        pagination: {
          total: matches.count,
          limit,
          offset,
          pages: Math.ceil(matches.count / limit),
          currentPage: Math.floor(offset / limit) + 1,
        },
        filters: {
          season,
          status,
          venue,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/teams/:id/form - Team form analysis
router.get('/:id/form', async (req, res, next) => {
  try {
    const { error: idError, value: idValue } = teamIdSchema.validate(req.params);
    if (idError) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation Error',
          details: idError.details,
        },
      });
    }

    const { error: queryError, value: queryValue } = statsFiltersSchema.validate(req.query);
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
    const { season, lastNMatches } = queryValue;

    // Check if team exists
    const team = await Team.findOne({
      where: { id, isActive: true },
    });

    if (!team) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Team not found',
          details: 'The requested team does not exist',
        },
      });
    }

    // Get team statistics
    const stats = await dataProcessor.calculateTeamStatistics(id, season, lastNMatches);

    // Get recent matches for form display
    const recentMatches = await Match.findAll({
      where: {
        [Op.or]: [
          { homeTeamId: id },
          { awayTeamId: id },
        ],
        status: 'FINISHED',
        ...(season && { season }),
      },
      include: [
        {
          model: Team,
          as: 'homeTeam',
          attributes: ['id', 'name', 'shortName', 'tla'],
        },
        {
          model: Team,
          as: 'awayTeam',
          attributes: ['id', 'name', 'shortName', 'tla'],
        },
      ],
      order: [['utcDate', 'DESC']],
      limit: lastNMatches || 10,
    });

    const formDetails = recentMatches.map(match => {
      const isHome = match.homeTeamId === id;
      const teamScore = isHome ? match.homeTeamScore : match.awayTeamScore;
      const opponentScore = isHome ? match.awayTeamScore : match.homeTeamScore;
      
      let result = 'D';
      if (teamScore > opponentScore) result = 'W';
      else if (teamScore < opponentScore) result = 'L';

      return {
        matchId: match.id,
        utcDate: match.utcDate,
        isHome,
        opponent: isHome ? match.awayTeam : match.homeTeam,
        teamScore,
        opponentScore,
        result,
      };
    });

    res.json({
      success: true,
      data: {
        team: {
          id: team.id,
          name: team.name,
          shortName: team.shortName,
          tla: team.tla,
        },
        form: {
          ...stats,
          formString: stats.form.join(''),
          recentMatches: formDetails,
        },
        filters: {
          season,
          lastNMatches: lastNMatches || stats.matchesPlayed,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/teams/:id/stats - Detailed statistics
router.get('/:id/stats', async (req, res, next) => {
  try {
    const { error: idError, value: idValue } = teamIdSchema.validate(req.params);
    if (idError) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation Error',
          details: idError.details,
        },
      });
    }

    const { error: queryError, value: queryValue } = statsFiltersSchema.validate(req.query);
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
    const { season, lastNMatches } = queryValue;

    // Check if team exists
    const team = await Team.findOne({
      where: { id, isActive: true },
    });

    if (!team) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Team not found',
          details: 'The requested team does not exist',
        },
      });
    }

    // Get overall statistics
    const overallStats = await dataProcessor.calculateTeamStatistics(id, season, lastNMatches);
    
    // Get home statistics
    const homeMatches = await Match.findAll({
      where: {
        homeTeamId: id,
        status: 'FINISHED',
        ...(season && { season }),
      },
      order: [['utcDate', 'DESC']],
      limit: lastNMatches || undefined,
    });

    // Get away statistics
    const awayMatches = await Match.findAll({
      where: {
        awayTeamId: id,
        status: 'FINISHED',
        ...(season && { season }),
      },
      order: [['utcDate', 'DESC']],
      limit: lastNMatches || undefined,
    });

    // Calculate home/away specific stats
    const calculateVenueStats = (matches, isHome) => {
      let wins = 0, draws = 0, losses = 0, goalsFor = 0, goalsAgainst = 0;
      
      matches.forEach(match => {
        const teamScore = isHome ? match.homeTeamScore : match.awayTeamScore;
        const opponentScore = isHome ? match.awayTeamScore : match.homeTeamScore;
        
        if (teamScore !== null && opponentScore !== null) {
          goalsFor += teamScore;
          goalsAgainst += opponentScore;
          
          if (teamScore > opponentScore) wins++;
          else if (teamScore === opponentScore) draws++;
          else losses++;
        }
      });

      const matchesPlayed = wins + draws + losses;
      return {
        matchesPlayed,
        wins,
        draws,
        losses,
        goalsFor,
        goalsAgainst,
        goalDifference: goalsFor - goalsAgainst,
        points: wins * 3 + draws,
        winPercentage: matchesPlayed > 0 ? (wins / matchesPlayed * 100) : 0,
        averageGoalsFor: matchesPlayed > 0 ? (goalsFor / matchesPlayed) : 0,
        averageGoalsAgainst: matchesPlayed > 0 ? (goalsAgainst / matchesPlayed) : 0,
      };
    };

    const homeStats = calculateVenueStats(homeMatches, true);
    const awayStats = calculateVenueStats(awayMatches, false);

    res.json({
      success: true,
      data: {
        team: {
          id: team.id,
          name: team.name,
          shortName: team.shortName,
          tla: team.tla,
          crest: team.crest,
        },
        statistics: {
          overall: overallStats,
          home: homeStats,
          away: awayStats,
          comparison: {
            homeWinPercentage: homeStats.winPercentage,
            awayWinPercentage: awayStats.winPercentage,
            homeGoalAverage: homeStats.averageGoalsFor,
            awayGoalAverage: awayStats.averageGoalsFor,
            preferredVenue: homeStats.winPercentage > awayStats.winPercentage ? 'home' : 'away',
          },
        },
        filters: {
          season,
          lastNMatches: lastNMatches || overallStats.matchesPlayed,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
