const logger = require('../config/logger');
const { Match, Team, Competition, Prediction } = require('../models');
const { Op } = require('sequelize');
const DataProcessor = require('./DataProcessor');

class AnalyticsService {
  constructor() {
    this.dataProcessor = new DataProcessor();
    this.cache = new Map();
    this.cacheTimeout = 15 * 60 * 1000; // 15 minutes
  }

  /**
   * Get comprehensive analytics dashboard data
   */
  async getDashboardAnalytics(options = {}) {
    const {
      competitionId = null,
      season = null,
      days = 30,
    } = options;

    try {
      logger.info('Generating dashboard analytics');

      const [
        matchStats,
        teamPerformance,
        predictionAccuracy,
        bettingPerformance,
        trends,
        topTeams,
        upcomingMatches,
      ] = await Promise.all([
        this.getMatchStatistics(competitionId, season, days),
        this.getTeamPerformanceAnalytics(competitionId, season),
        this.getPredictionAccuracyAnalytics(days),
        this.getBettingPerformanceAnalytics(days),
        this.getTrendAnalytics(competitionId, days),
        this.getTopPerformingTeams(competitionId, season, 10),
        this.getUpcomingMatchesAnalytics(competitionId, 7),
      ]);

      return {
        period: `${days} days`,
        competitionId,
        season,
        matchStatistics: matchStats,
        teamPerformance,
        predictionAccuracy,
        bettingPerformance,
        trends,
        topTeams,
        upcomingMatches,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Error generating dashboard analytics:', error);
      throw error;
    }
  }

  /**
   * Get match statistics
   */
  async getMatchStatistics(competitionId = null, season = null, days = 30) {
    try {
      const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const whereConditions = {
        status: 'FINISHED',
        utcDate: { [Op.gte]: cutoffDate },
      };

      if (competitionId) whereConditions.competitionId = competitionId;
      if (season) whereConditions.season = season;

      const matches = await Match.findAll({ where: whereConditions });

      const stats = {
        totalMatches: matches.length,
        homeWins: 0,
        awayWins: 0,
        draws: 0,
        totalGoals: 0,
        averageGoalsPerMatch: 0,
        highestScoringMatch: null,
        mostCommonScore: null,
        cleanSheets: 0,
        over25Goals: 0,
        over35Goals: 0,
        bothTeamsScored: 0,
      };

      const scoreCounts = {};
      let maxGoals = 0;
      let highestScoringMatch = null;

      matches.forEach(match => {
        const homeScore = match.homeTeamScore || 0;
        const awayScore = match.awayTeamScore || 0;
        const totalGoals = homeScore + awayScore;

        stats.totalGoals += totalGoals;

        // Winner analysis
        if (homeScore > awayScore) {
          stats.homeWins++;
        } else if (awayScore > homeScore) {
          stats.awayWins++;
        } else {
          stats.draws++;
        }

        // Goals analysis
        if (totalGoals > 2.5) stats.over25Goals++;
        if (totalGoals > 3.5) stats.over35Goals++;
        if (homeScore > 0 && awayScore > 0) stats.bothTeamsScored++;
        if (homeScore === 0 || awayScore === 0) stats.cleanSheets++;

        // Score tracking
        const score = `${homeScore}-${awayScore}`;
        scoreCounts[score] = (scoreCounts[score] || 0) + 1;

        // Highest scoring match
        if (totalGoals > maxGoals) {
          maxGoals = totalGoals;
          highestScoringMatch = {
            matchId: match.id,
            homeTeam: match.homeTeamId,
            awayTeam: match.awayTeamId,
            score: score,
            totalGoals,
          };
        }
      });

      stats.averageGoalsPerMatch = stats.totalMatches > 0 ? 
        (stats.totalGoals / stats.totalMatches).toFixed(2) : 0;
      stats.highestScoringMatch = highestScoringMatch;

      // Find most common score
      const mostCommonScore = Object.entries(scoreCounts)
        .sort(([,a], [,b]) => b - a)[0];
      if (mostCommonScore) {
        stats.mostCommonScore = {
          score: mostCommonScore[0],
          frequency: mostCommonScore[1],
        };
      }

      return stats;
    } catch (error) {
      logger.error('Error getting match statistics:', error);
      throw error;
    }
  }

  /**
   * Get team performance analytics
   */
  async getTeamPerformanceAnalytics(competitionId = null, season = null) {
    try {
      const whereConditions = { isActive: true };
      if (competitionId) whereConditions.competitionId = competitionId;

      const teams = await Team.findAll({ where: whereConditions });

      const teamAnalytics = await Promise.all(
        teams.map(async (team) => {
          try {
            const stats = await this.dataProcessor.calculateTeamStatistics(team.id, season);
            
            return {
              teamId: team.id,
              teamName: team.name,
              totalMatches: stats.overall.matchesPlayed,
              wins: stats.overall.wins,
              draws: stats.overall.draws,
              losses: stats.overall.losses,
              winRate: stats.overall.winRate,
              goalsFor: stats.overall.goalsFor,
              goalsAgainst: stats.overall.goalsAgainst,
              goalDifference: stats.overall.goalDifference,
              points: stats.overall.points,
              homeStats: {
                matches: stats.home.matchesPlayed,
                wins: stats.home.wins,
                winRate: stats.home.winRate,
                goalsFor: stats.home.goalsFor,
                goalsAgainst: stats.home.goalsAgainst,
              },
              awayStats: {
                matches: stats.away.matchesPlayed,
                wins: stats.away.wins,
                winRate: stats.away.winRate,
                goalsFor: stats.away.goalsFor,
                goalsAgainst: stats.away.goalsAgainst,
              },
              form: await this.getTeamForm(team.id, 5),
            };
          } catch (error) {
            logger.warn(`Error getting analytics for team ${team.id}:`, error.message);
            return null;
          }
        })
      );

      return teamAnalytics.filter(analytics => analytics !== null);
    } catch (error) {
      logger.error('Error getting team performance analytics:', error);
      throw error;
    }
  }

  /**
   * Get team form (last N matches)
   */
  async getTeamForm(teamId, matches = 5) {
    try {
      const matches = await Match.findAll({
        where: {
          [Op.or]: [
            { homeTeamId: teamId },
            { awayTeamId: teamId },
          ],
          status: 'FINISHED',
        },
        order: [['utcDate', 'DESC']],
        limit: matches,
      });

      const form = matches.map(match => {
        const isHome = match.homeTeamId === teamId;
        const teamScore = isHome ? match.homeTeamScore : match.awayTeamScore;
        const opponentScore = isHome ? match.awayTeamScore : match.homeTeamScore;

        if (teamScore > opponentScore) return 'W';
        else if (teamScore === opponentScore) return 'D';
        else return 'L';
      });

      return {
        form: form.join(''),
        wins: form.filter(result => result === 'W').length,
        draws: form.filter(result => result === 'D').length,
        losses: form.filter(result => result === 'L').length,
        points: form.reduce((points, result) => {
          if (result === 'W') return points + 3;
          if (result === 'D') return points + 1;
          return points;
        }, 0),
      };
    } catch (error) {
      logger.error(`Error getting form for team ${teamId}:`, error);
      return { form: '', wins: 0, draws: 0, losses: 0, points: 0 };
    }
  }

  /**
   * Get prediction accuracy analytics
   */
  async getPredictionAccuracyAnalytics(days = 30) {
    try {
      const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const predictions = await Prediction.findAll({
        where: {
          predictionTimestamp: { [Op.gte]: cutoffDate },
          isProcessed: true,
        },
        include: [
          {
            model: Match,
            as: 'match',
            where: { status: 'FINISHED' },
          },
        ],
      });

      const analytics = {
        totalPredictions: predictions.length,
        correctPredictions: 0,
        accuracy: 0,
        accuracyByConfidence: {},
        accuracyByOutcome: {},
        accuracyByCompetition: {},
        averageConfidence: 0,
        confidenceDistribution: {},
      };

      let totalConfidence = 0;

      predictions.forEach(prediction => {
        if (prediction.isCorrect) {
          analytics.correctPredictions++;
        }

        totalConfidence += prediction.confidence;

        // Accuracy by confidence level
        const confidenceLevel = this.getConfidenceLevel(prediction.confidence);
        if (!analytics.accuracyByConfidence[confidenceLevel]) {
          analytics.accuracyByConfidence[confidenceLevel] = { correct: 0, total: 0 };
        }
        analytics.accuracyByConfidence[confidenceLevel].total++;
        if (prediction.isCorrect) analytics.accuracyByConfidence[confidenceLevel].correct++;

        // Accuracy by outcome
        const outcome = prediction.predictedWinner;
        if (!analytics.accuracyByOutcome[outcome]) {
          analytics.accuracyByOutcome[outcome] = { correct: 0, total: 0 };
        }
        analytics.accuracyByOutcome[outcome].total++;
        if (prediction.isCorrect) analytics.accuracyByOutcome[outcome].correct++;

        // Accuracy by competition
        const competition = prediction.match?.competition?.name || 'Unknown';
        if (!analytics.accuracyByCompetition[competition]) {
          analytics.accuracyByCompetition[competition] = { correct: 0, total: 0 };
        }
        analytics.accuracyByCompetition[competition].total++;
        if (prediction.isCorrect) analytics.accuracyByCompetition[competition].correct++;

        // Confidence distribution
        const confidenceRange = this.getConfidenceRange(prediction.confidence);
        analytics.confidenceDistribution[confidenceRange] = 
          (analytics.confidenceDistribution[confidenceRange] || 0) + 1;
      });

      analytics.accuracy = analytics.totalPredictions > 0 ? 
        analytics.correctPredictions / analytics.totalPredictions : 0;
      analytics.averageConfidence = analytics.totalPredictions > 0 ? 
        totalConfidence / analytics.totalPredictions : 0;

      // Calculate percentages
      Object.keys(analytics.accuracyByConfidence).forEach(level => {
        const data = analytics.accuracyByConfidence[level];
        data.accuracy = data.total > 0 ? data.correct / data.total : 0;
      });

      Object.keys(analytics.accuracyByOutcome).forEach(outcome => {
        const data = analytics.accuracyByOutcome[outcome];
        data.accuracy = data.total > 0 ? data.correct / data.total : 0;
      });

      Object.keys(analytics.accuracyByCompetition).forEach(competition => {
        const data = analytics.accuracyByCompetition[competition];
        data.accuracy = data.total > 0 ? data.correct / data.total : 0;
      });

      return analytics;
    } catch (error) {
      logger.error('Error getting prediction accuracy analytics:', error);
      throw error;
    }
  }

  /**
   * Get betting performance analytics
   */
  async getBettingPerformanceAnalytics(days = 30) {
    try {
      const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const predictions = await Prediction.findAll({
        where: {
          confidence: { [Op.gte]: 0.6 },
          predictionTimestamp: { [Op.gte]: cutoffDate },
          isProcessed: true,
        },
        include: [
          {
            model: Match,
            as: 'match',
            where: { status: 'FINISHED' },
          },
        ],
      });

      const analytics = {
        totalBets: predictions.length,
        winningBets: 0,
        losingBets: 0,
        accuracy: 0,
        roi: 0,
        profitLoss: 0,
        averageOdds: 0,
        bestPerformingConfidence: null,
        worstPerformingConfidence: null,
      };

      let totalStake = 0;
      let totalReturn = 0;
      let totalOdds = 0;
      const confidencePerformance = {};

      predictions.forEach(prediction => {
        const stake = 100; // Assume $100 stake
        const odds = this.estimateOddsFromConfidence(prediction.confidence);
        
        totalStake += stake;
        totalOdds += odds;

        if (prediction.isCorrect) {
          analytics.winningBets++;
          totalReturn += stake * odds;
        } else {
          analytics.losingBets++;
        }

        // Track performance by confidence
        const confidenceLevel = this.getConfidenceLevel(prediction.confidence);
        if (!confidencePerformance[confidenceLevel]) {
          confidencePerformance[confidenceLevel] = { correct: 0, total: 0 };
        }
        confidencePerformance[confidenceLevel].total++;
        if (prediction.isCorrect) confidencePerformance[confidenceLevel].correct++;
      });

      analytics.accuracy = analytics.totalBets > 0 ? 
        analytics.winningBets / analytics.totalBets : 0;
      analytics.profitLoss = totalReturn - totalStake;
      analytics.roi = analytics.totalBets > 0 ? 
        (analytics.profitLoss / totalStake) * 100 : 0;
      analytics.averageOdds = analytics.totalBets > 0 ? 
        totalOdds / analytics.totalBets : 0;

      // Find best and worst performing confidence levels
      const confidenceLevels = Object.entries(confidencePerformance)
        .map(([level, data]) => ({
          level,
          accuracy: data.total > 0 ? data.correct / data.total : 0,
        }))
        .sort((a, b) => b.accuracy - a.accuracy);

      if (confidenceLevels.length > 0) {
        analytics.bestPerformingConfidence = confidenceLevels[0];
        analytics.worstPerformingConfidence = confidenceLevels[confidenceLevels.length - 1];
      }

      return analytics;
    } catch (error) {
      logger.error('Error getting betting performance analytics:', error);
      throw error;
    }
  }

  /**
   * Get trend analytics
   */
  async getTrendAnalytics(competitionId = null, days = 30) {
    try {
      const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const whereConditions = {
        status: 'FINISHED',
        utcDate: { [Op.gte]: cutoffDate },
      };

      if (competitionId) whereConditions.competitionId = competitionId;

      const matches = await Match.findAll({
        where: whereConditions,
        order: [['utcDate', 'ASC']],
      });

      const trends = {
        goalsPerMatch: this.calculateTrend(matches.map(m => 
          (m.homeTeamScore || 0) + (m.awayTeamScore || 0)
        )),
        homeWinRate: this.calculateTrend(matches.map(m => 
          (m.homeTeamScore || 0) > (m.awayTeamScore || 0) ? 1 : 0
        )),
        bothTeamsScored: this.calculateTrend(matches.map(m => 
          (m.homeTeamScore || 0) > 0 && (m.awayTeamScore || 0) > 0 ? 1 : 0
        )),
        cleanSheets: this.calculateTrend(matches.map(m => 
          (m.homeTeamScore || 0) === 0 || (m.awayTeamScore || 0) === 0 ? 1 : 0
        )),
        over25Goals: this.calculateTrend(matches.map(m => {
          const total = (m.homeTeamScore || 0) + (m.awayTeamScore || 0);
          return total > 2.5 ? 1 : 0;
        })),
      };

      return trends;
    } catch (error) {
      logger.error('Error getting trend analytics:', error);
      throw error;
    }
  }

  /**
   * Calculate trend from time series data
   */
  calculateTrend(data) {
    if (data.length < 2) return { trend: 'stable', slope: 0, change: 0 };

    const n = data.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = data;

    // Calculate linear regression
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const change = ((y[y.length - 1] - y[0]) / y[0]) * 100;

    let trend = 'stable';
    if (slope > 0.01) trend = 'increasing';
    else if (slope < -0.01) trend = 'decreasing';

    return { trend, slope, change };
  }

  /**
   * Get top performing teams
   */
  async getTopPerformingTeams(competitionId = null, season = null, limit = 10) {
    try {
      const teamAnalytics = await this.getTeamPerformanceAnalytics(competitionId, season);
      
      return teamAnalytics
        .sort((a, b) => b.points - a.points)
        .slice(0, limit)
        .map((team, index) => ({
          ...team,
          rank: index + 1,
        }));
    } catch (error) {
      logger.error('Error getting top performing teams:', error);
      throw error;
    }
  }

  /**
   * Get upcoming matches analytics
   */
  async getUpcomingMatchesAnalytics(competitionId = null, days = 7) {
    try {
      const whereConditions = {
        status: 'SCHEDULED',
        utcDate: {
          [Op.between]: [
            new Date(),
            new Date(Date.now() + days * 24 * 60 * 60 * 1000),
          ],
        },
      };

      if (competitionId) whereConditions.competitionId = competitionId;

      const matches = await Match.findAll({
        where: whereConditions,
        include: [
          { model: Team, as: 'homeTeam' },
          { model: Team, as: 'awayTeam' },
          { model: Competition, as: 'competition' },
        ],
        order: [['utcDate', 'ASC']],
      });

      const analytics = {
        totalMatches: matches.length,
        matchesByCompetition: {},
        matchesByDay: {},
        predictedMatches: 0,
        averagePredictionConfidence: 0,
        matches: matches.map(match => ({
          id: match.id,
          homeTeam: match.homeTeam.name,
          awayTeam: match.awayTeam.name,
          utcDate: match.utcDate,
          competition: match.competition.name,
          isPredicted: match.isPredicted,
          predictedWinner: match.predictedWinner,
          predictionConfidence: match.predictionConfidence,
        })),
      };

      let totalConfidence = 0;
      let predictedCount = 0;

      matches.forEach(match => {
        // By competition
        const competition = match.competition.name;
        analytics.matchesByCompetition[competition] = 
          (analytics.matchesByCompetition[competition] || 0) + 1;

        // By day
        const day = new Date(match.utcDate).toDateString();
        analytics.matchesByDay[day] = 
          (analytics.matchesByDay[day] || 0) + 1;

        // Prediction stats
        if (match.isPredicted) {
          analytics.predictedMatches++;
          if (match.predictionConfidence) {
            totalConfidence += match.predictionConfidence;
            predictedCount++;
          }
        }
      });

      analytics.averagePredictionConfidence = predictedCount > 0 ? 
        totalConfidence / predictedCount : 0;

      return analytics;
    } catch (error) {
      logger.error('Error getting upcoming matches analytics:', error);
      throw error;
    }
  }

  /**
   * Get confidence level category
   */
  getConfidenceLevel(confidence) {
    if (confidence >= 0.8) return 'Very High';
    if (confidence >= 0.7) return 'High';
    if (confidence >= 0.6) return 'Medium';
    if (confidence >= 0.5) return 'Low';
    return 'Very Low';
  }

  /**
   * Get confidence range
   */
  getConfidenceRange(confidence) {
    if (confidence >= 0.9) return '0.9-1.0';
    if (confidence >= 0.8) return '0.8-0.9';
    if (confidence >= 0.7) return '0.7-0.8';
    if (confidence >= 0.6) return '0.6-0.7';
    if (confidence >= 0.5) return '0.5-0.6';
    return '0.0-0.5';
  }

  /**
   * Estimate odds from confidence
   */
  estimateOddsFromConfidence(confidence) {
    return 1 + (1 - confidence) * 2;
  }

  /**
   * Clear analytics cache
   */
  clearCache() {
    this.cache.clear();
    logger.info('Analytics cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys()),
    };
  }
}

module.exports = AnalyticsService;
