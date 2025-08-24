const express = require('express');
const Joi = require('joi');
const { Competition } = require('../models');
const FootballDataAPI = require('../services/FootballDataAPI');
const logger = require('../config/logger');

const router = express.Router();
const footballAPI = new FootballDataAPI();

// Validation schemas
const competitionIdSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
});

const competitionFiltersSchema = Joi.object({
  plan: Joi.string().valid('TIER_ONE', 'TIER_TWO', 'TIER_THREE', 'TIER_FOUR'),
  areas: Joi.string(),
  limit: Joi.number().integer().min(1).max(100).default(20),
  offset: Joi.number().integer().min(0).default(0),
});

const seasonSchema = Joi.object({
  season: Joi.number().integer().min(2000).max(2030),
});

// GET /api/v1/competitions - List all competitions
router.get('/', async (req, res, next) => {
  try {
    const { error, value } = competitionFiltersSchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation Error',
          details: error.details,
        },
      });
    }

    const { plan, areas, limit, offset } = value;

    // Try to get from database first
    let competitions = await Competition.findAll({
      where: { isActive: true },
      limit,
      offset,
      order: [['name', 'ASC']],
    });

    // If no competitions in database, fetch from API
    if (competitions.length === 0) {
      logger.info('No competitions in database, fetching from API');
      const apiData = await footballAPI.getCompetitions(plan, areas);
      
      if (apiData.competitions && apiData.competitions.length > 0) {
        // Store competitions in database
        const competitionPromises = apiData.competitions.map(comp => {
          return Competition.findOrCreate({
            where: { externalId: comp.id },
            defaults: {
              externalId: comp.id,
              name: comp.name,
              code: comp.code,
              type: comp.type,
              country: comp.area.name,
              countryCode: comp.area.countryCode,
              emblem: comp.emblem,
              plan: comp.plan,
              currentSeason: comp.currentSeason?.startDate ? 
                new Date(comp.currentSeason.startDate).getFullYear() : null,
              numberOfAvailableSeasons: comp.numberOfAvailableSeasons,
              lastUpdated: new Date(comp.lastUpdated),
            },
          });
        });

        await Promise.all(competitionPromises);
        
        // Fetch again from database
        competitions = await Competition.findAll({
          where: { isActive: true },
          limit,
          offset,
          order: [['name', 'ASC']],
        });
      }
    }

    res.json({
      success: true,
      data: {
        competitions: competitions.map(comp => ({
          id: comp.id,
          externalId: comp.externalId,
          name: comp.name,
          code: comp.code,
          type: comp.type,
          country: comp.country,
          countryCode: comp.countryCode,
          emblem: comp.emblem,
          plan: comp.plan,
          currentSeason: comp.currentSeason,
          numberOfAvailableSeasons: comp.numberOfAvailableSeasons,
          lastUpdated: comp.lastUpdated,
          createdAt: comp.createdAt,
          updatedAt: comp.updatedAt,
        })),
        total: competitions.length,
        limit,
        offset,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/competitions/:id - Get specific competition
router.get('/:id', async (req, res, next) => {
  try {
    const { error, value } = competitionIdSchema.validate(req.params);
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

    let competition = await Competition.findOne({
      where: { id, isActive: true },
    });

    if (!competition) {
      // Try to fetch from API and store
      try {
        const apiData = await footballAPI.getCompetition(id);
        
        competition = await Competition.create({
          externalId: apiData.id,
          name: apiData.name,
          code: apiData.code,
          type: apiData.type,
          country: apiData.area.name,
          countryCode: apiData.area.countryCode,
          emblem: apiData.emblem,
          plan: apiData.plan,
          currentSeason: apiData.currentSeason?.startDate ? 
            new Date(apiData.currentSeason.startDate).getFullYear() : null,
          numberOfAvailableSeasons: apiData.numberOfAvailableSeasons,
          lastUpdated: new Date(apiData.lastUpdated),
        });
      } catch (apiError) {
        return res.status(404).json({
          success: false,
          error: {
            message: 'Competition not found',
            details: 'The requested competition does not exist',
          },
        });
      }
    }

    res.json({
      success: true,
      data: {
        competition: {
          id: competition.id,
          externalId: competition.externalId,
          name: competition.name,
          code: competition.code,
          type: competition.type,
          country: competition.country,
          countryCode: competition.countryCode,
          emblem: competition.emblem,
          plan: competition.plan,
          currentSeason: competition.currentSeason,
          numberOfAvailableSeasons: competition.numberOfAvailableSeasons,
          lastUpdated: competition.lastUpdated,
          createdAt: competition.createdAt,
          updatedAt: competition.updatedAt,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/competitions/:id/matches - Get competition matches
router.get('/:id/matches', async (req, res, next) => {
  try {
    const { error: idError, value: idValue } = competitionIdSchema.validate(req.params);
    if (idError) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation Error',
          details: idError.details,
        },
      });
    }

    const { error: queryError, value: queryValue } = seasonSchema.validate(req.query);
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
    const { season } = queryValue;

    // Check if competition exists
    const competition = await Competition.findOne({
      where: { id, isActive: true },
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

    // Fetch matches from API
    const apiData = await footballAPI.getCompetitionMatches(competition.externalId, { season });

    res.json({
      success: true,
      data: {
        competition: {
          id: competition.id,
          name: competition.name,
          code: competition.code,
        },
        matches: apiData.matches || [],
        filters: {
          season,
        },
        total: apiData.resultSet?.count || 0,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/competitions/:id/standings - Get competition standings
router.get('/:id/standings', async (req, res, next) => {
  try {
    const { error: idError, value: idValue } = competitionIdSchema.validate(req.params);
    if (idError) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation Error',
          details: idError.details,
        },
      });
    }

    const { error: queryError, value: queryValue } = seasonSchema.validate(req.query);
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
    const { season } = queryValue;

    // Check if competition exists
    const competition = await Competition.findOne({
      where: { id, isActive: true },
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

    // Fetch standings from API
    const apiData = await footballAPI.getCompetitionStandings(competition.externalId, season);

    res.json({
      success: true,
      data: {
        competition: {
          id: competition.id,
          name: competition.name,
          code: competition.code,
        },
        standings: apiData.standings || [],
        season: apiData.season,
        filters: {
          season,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
