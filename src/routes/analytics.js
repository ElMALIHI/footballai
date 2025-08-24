const express = require('express');
const Joi = require('joi');
const AnalyticsService = require('../services/AnalyticsService');
const { Team, Competition } = require('../models');
const logger = require('../config/logger');

const router = express.Router();
const analyticsService = new AnalyticsService();

// Validation schemas
const dashboardSchema = Joi.object({
  competitionId: Joi.number().integer().positive(),
  season: Joi.number().integer().min(2000).max(2030),
  days: Joi.number().integer().min(1).max(365).default(30),
});

const teamAnalyticsSchema = Joi.object({
  teamId: Joi.number().integer().positive().required(),
  season: Joi.number().integer().min(2000).max(2030),
  days: Joi.number().integer().min(1).max(365).default(30),
});

const competitionAnalyticsSchema = Joi.object({
  competitionId: Joi.number().integer().positive().required(),
  season: Joi.number().integer().min(2000).max(2030),
  days: Joi.number().integer().min(1).max(365).default(30),
});

const trendsSchema = Joi.object({
  competitionId: Joi.number().integer().positive(),
  season: Joi.number().integer().min(2000).max(2030),
  days: Joi.number().integer().min(1).max(365).default(90),
  metric: Joi.string().valid('goals', 'wins', 'draws', 'clean_sheets', 'both_teams_scored').default('goals'),
});

// GET /api/v1/analytics/dashboard - Dashboard analytics
router.get('/dashboard', async (req, res, next) => {
  try {
    const { error, value } = dashboardSchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation Error',
          details: error.details,
        },
      });
    }

    const { competitionId, season, days } = value;

    const startTime = Date.now();
    const analytics = await analyticsService.getDashboardAnalytics({
      competitionId,
      season,
      days,
    });
    const duration = Date.now() - startTime;

    res.json({
      success: true,
      data: {
        ...analytics,
        duration: `${duration}ms`,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/analytics/team/:id - Team analytics
router.get('/team/:id', async (req, res, next) => {
  try {
    const { error, value } = teamAnalyticsSchema.validate({
      ...req.params,
      ...req.query,
    });
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation Error',
          details: error.details,
        },
      });
    }

    const { teamId, season, days } = value;

    // Check if team exists
    const team = await Team.findOne({
      where: { id: teamId, isActive: true },
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

    const startTime = Date.now();
    
    // Get team performance analytics
    const teamAnalytics = await analyticsService.getTeamPerformanceAnalytics(null, season);
    const teamData = teamAnalytics.find(t => t.teamId === teamId);

    if (!teamData) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Team analytics not available',
          details: 'No performance data available for this team',
        },
      });
    }

    // Get match statistics for this team
    const matchStats = await analyticsService.getMatchStatistics(null, season, days);

    // Get prediction accuracy for this team
    const predictionAccuracy = await analyticsService.getPredictionAccuracyAnalytics(days);

    const duration = Date.now() - startTime;

    res.json({
      success: true,
      data: {
        team: {
          id: team.id,
          name: team.name,
          shortName: team.shortName,
          tla: team.tla,
          country: team.country,
        },
        performance: teamData,
        matchStatistics: matchStats,
        predictionAccuracy,
        duration: `${duration}ms`,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/analytics/competition/:id - Competition analytics
router.get('/competition/:id', async (req, res, next) => {
  try {
    const { error, value } = competitionAnalyticsSchema.validate({
      ...req.params,
      ...req.query,
    });
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation Error',
          details: error.details,
        },
      });
    }

    const { competitionId, season, days } = value;

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

    const startTime = Date.now();
    
    // Get competition-specific analytics
    const [
      matchStats,
      teamPerformance,
      predictionAccuracy,
      bettingPerformance,
      trends,
      topTeams,
      upcomingMatches,
    ] = await Promise.all([
      analyticsService.getMatchStatistics(competitionId, season, days),
      analyticsService.getTeamPerformanceAnalytics(competitionId, season),
      analyticsService.getPredictionAccuracyAnalytics(days),
      analyticsService.getBettingPerformanceAnalytics(days),
      analyticsService.getTrendAnalytics(competitionId, days),
      analyticsService.getTopPerformingTeams(competitionId, season, 10),
      analyticsService.getUpcomingMatchesAnalytics(competitionId, 7),
    ]);

    const duration = Date.now() - startTime;

    res.json({
      success: true,
      data: {
        competition: {
          id: competition.id,
          name: competition.name,
          code: competition.code,
          type: competition.type,
          country: competition.country,
        },
        period: `${days} days`,
        season,
        matchStatistics: matchStats,
        teamPerformance,
        predictionAccuracy,
        bettingPerformance,
        trends,
        topTeams,
        upcomingMatches,
        duration: `${duration}ms`,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/analytics/trends - Trend analysis
router.get('/trends', async (req, res, next) => {
  try {
    const { error, value } = trendsSchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation Error',
          details: error.details,
        },
      });
    }

    const { competitionId, season, days, metric } = value;

    const startTime = Date.now();
    const trends = await analyticsService.getTrendAnalytics(competitionId, days);
    const duration = Date.now() - startTime;

    res.json({
      success: true,
      data: {
        period: `${days} days`,
        competitionId,
        season,
        metric,
        trends,
        duration: `${duration}ms`,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/analytics/performance - Performance metrics
router.get('/performance', async (req, res, next) => {
  try {
    const schema = Joi.object({
      days: Joi.number().integer().min(1).max(365).default(30),
      competitionId: Joi.number().integer().positive(),
      season: Joi.number().integer().min(2000).max(2030),
    });

    const { error, value } = schema.validate(req.query);
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation Error',
          details: error.details,
        },
      });
    }

    const { days, competitionId, season } = value;

    const startTime = Date.now();
    
    const [
      predictionAccuracy,
      bettingPerformance,
      matchStats,
    ] = await Promise.all([
      analyticsService.getPredictionAccuracyAnalytics(days),
      analyticsService.getBettingPerformanceAnalytics(days),
      analyticsService.getMatchStatistics(competitionId, season, days),
    ]);

    const duration = Date.now() - startTime;

    res.json({
      success: true,
      data: {
        period: `${days} days`,
        competitionId,
        season,
        predictionAccuracy,
        bettingPerformance,
        matchStatistics: matchStats,
        duration: `${duration}ms`,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/analytics/teams/ranking - Team rankings
router.get('/teams/ranking', async (req, res, next) => {
  try {
    const schema = Joi.object({
      competitionId: Joi.number().integer().positive(),
      season: Joi.number().integer().min(2000).max(2030),
      limit: Joi.number().integer().min(1).max(100).default(20),
      sortBy: Joi.string().valid('points', 'wins', 'goals', 'winRate').default('points'),
    });

    const { error, value } = schema.validate(req.query);
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation Error',
          details: error.details,
        },
      });
    }

    const { competitionId, season, limit, sortBy } = value;

    const startTime = Date.now();
    const teamAnalytics = await analyticsService.getTeamPerformanceAnalytics(competitionId, season);
    
    // Sort teams by the specified criteria
    const sortedTeams = teamAnalytics.sort((a, b) => {
      switch (sortBy) {
        case 'points':
          return b.points - a.points;
        case 'wins':
          return b.wins - a.wins;
        case 'goals':
          return b.goalsFor - a.goalsFor;
        case 'winRate':
          return b.winRate - a.winRate;
        default:
          return b.points - a.points;
      }
    }).slice(0, limit);

    const duration = Date.now() - startTime;

    res.json({
      success: true,
      data: {
        competitionId,
        season,
        sortBy,
        totalTeams: teamAnalytics.length,
        rankings: sortedTeams.map((team, index) => ({
          rank: index + 1,
          ...team,
        })),
        duration: `${duration}ms`,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/analytics/matches/upcoming - Upcoming matches analytics
router.get('/matches/upcoming', async (req, res, next) => {
  try {
    const schema = Joi.object({
      competitionId: Joi.number().integer().positive(),
      days: Joi.number().integer().min(1).max(30).default(7),
    });

    const { error, value } = schema.validate(req.query);
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation Error',
          details: error.details,
        },
      });
    }

    const { competitionId, days } = value;

    const startTime = Date.now();
    const upcomingMatches = await analyticsService.getUpcomingMatchesAnalytics(competitionId, days);
    const duration = Date.now() - startTime;

    res.json({
      success: true,
      data: {
        ...upcomingMatches,
        duration: `${duration}ms`,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/analytics/cache/clear - Clear analytics cache
router.post('/cache/clear', async (req, res, next) => {
  try {
    analyticsService.clearCache();
    
    res.json({
      success: true,
      message: 'Analytics cache cleared successfully',
      data: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/analytics/cache/stats - Get cache statistics
router.get('/cache/stats', async (req, res, next) => {
  try {
    const cacheStats = analyticsService.getCacheStats();
    
    res.json({
      success: true,
      data: cacheStats,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
