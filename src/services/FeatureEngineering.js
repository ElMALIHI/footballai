const logger = require('../config/logger');
const { Match, Team, Competition } = require('../models');
const { Op } = require('sequelize');

class FeatureEngineering {
  constructor() {
    this.featureCache = new Map();
    this.cacheTimeout = 30 * 60 * 1000; // 30 minutes
  }

  /**
   * Generate comprehensive features for a match
   */
  async generateMatchFeatures(matchId, includeHistorical = true) {
    try {
      const match = await Match.findOne({
        where: { id: matchId },
        include: [
          { model: Team, as: 'homeTeam' },
          { model: Team, as: 'awayTeam' },
          { model: Competition, as: 'competition' },
        ],
      });

      if (!match) {
        throw new Error(`Match with ID ${matchId} not found`);
      }

      const features = {
        // Basic match features
        matchId: match.id,
        competitionId: match.competitionId,
        season: match.season,
        matchday: match.matchday || 0,
        isHomeTeam: true, // Will be duplicated for both teams
        
        // Competition features
        competitionType: this.getCompetitionType(match.competition?.type),
        competitionTier: this.getCompetitionTier(match.competition?.plan),
        
        // Temporal features
        matchMonth: new Date(match.utcDate).getMonth() + 1,
        matchDayOfWeek: new Date(match.utcDate).getDay(),
        matchHour: new Date(match.utcDate).getHours(),
        daysSinceSeasonStart: this.calculateDaysSinceSeasonStart(match.utcDate, match.season),
        
        // Venue features
        isHomeVenue: true,
        venueCapacity: match.homeTeam?.venueCapacity || 0,
      };

      if (includeHistorical) {
        // Add historical performance features
        const homeTeamFeatures = await this.getTeamHistoricalFeatures(
          match.homeTeamId,
          match.awayTeamId,
          match.utcDate,
          match.season,
          true
        );
        
        const awayTeamFeatures = await this.getTeamHistoricalFeatures(
          match.awayTeamId,
          match.homeTeamId,
          match.utcDate,
          match.season,
          false
        );

        // Head-to-head features
        const h2hFeatures = await this.getHeadToHeadFeatures(
          match.homeTeamId,
          match.awayTeamId,
          match.utcDate
        );

        // Combine all features
        Object.assign(features, homeTeamFeatures, awayTeamFeatures, h2hFeatures);
      }

      return features;
    } catch (error) {
      logger.error(`Error generating features for match ${matchId}:`, error);
      throw error;
    }
  }

  /**
   * Get historical performance features for a team
   */
  async getTeamHistoricalFeatures(teamId, opponentId, matchDate, season, isHome) {
    const cacheKey = `team_features_${teamId}_${season}_${isHome}`;
    
    // Check cache first
    if (this.featureCache.has(cacheKey)) {
      const cached = this.featureCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.features;
      }
    }

    try {
      // Get recent matches (last 10 matches)
      const recentMatches = await Match.findAll({
        where: {
          [Op.or]: [
            { homeTeamId: teamId },
            { awayTeamId: teamId },
          ],
          status: 'FINISHED',
          utcDate: { [Op.lt]: matchDate },
          season: season,
        },
        order: [['utcDate', 'DESC']],
        limit: 10,
      });

      // Get season statistics
      const seasonMatches = await Match.findAll({
        where: {
          [Op.or]: [
            { homeTeamId: teamId },
            { awayTeamId: teamId },
          ],
          status: 'FINISHED',
          season: season,
          utcDate: { [Op.lt]: matchDate },
        },
      });

      // Calculate features
      const features = this.calculateTeamFeatures(recentMatches, seasonMatches, teamId, isHome);
      
      // Cache the results
      this.featureCache.set(cacheKey, {
        features,
        timestamp: Date.now(),
      });

      return features;
    } catch (error) {
      logger.error(`Error getting historical features for team ${teamId}:`, error);
      return this.getDefaultTeamFeatures(isHome);
    }
  }

  /**
   * Calculate team performance features from match data
   */
  calculateTeamFeatures(recentMatches, seasonMatches, teamId, isHome) {
    const prefix = isHome ? 'home' : 'away';
    
    // Recent form features (last 10 matches)
    const recentStats = this.calculateMatchStats(recentMatches, teamId);
    
    // Season statistics
    const seasonStats = this.calculateMatchStats(seasonMatches, teamId);
    
    // Form momentum (trend analysis)
    const momentum = this.calculateFormMomentum(recentMatches, teamId);
    
    return {
      // Recent form (last 10 matches)
      [`${prefix}_recent_wins`]: recentStats.wins,
      [`${prefix}_recent_draws`]: recentStats.draws,
      [`${prefix}_recent_losses`]: recentStats.losses,
      [`${prefix}_recent_goals_for`]: recentStats.goalsFor,
      [`${prefix}_recent_goals_against`]: recentStats.goalsAgainst,
      [`${prefix}_recent_goal_difference`]: recentStats.goalDifference,
      [`${prefix}_recent_points`]: recentStats.points,
      [`${prefix}_recent_win_rate`]: recentStats.winRate,
      [`${prefix}_recent_avg_goals_for`]: recentStats.avgGoalsFor,
      [`${prefix}_recent_avg_goals_against`]: recentStats.avgGoalsAgainst,
      
      // Season statistics
      [`${prefix}_season_matches`]: seasonStats.matchesPlayed,
      [`${prefix}_season_wins`]: seasonStats.wins,
      [`${prefix}_season_draws`]: seasonStats.draws,
      [`${prefix}_season_losses`]: seasonStats.losses,
      [`${prefix}_season_goals_for`]: seasonStats.goalsFor,
      [`${prefix}_season_goals_against`]: seasonStats.goalsAgainst,
      [`${prefix}_season_goal_difference`]: seasonStats.goalDifference,
      [`${prefix}_season_points`]: seasonStats.points,
      [`${prefix}_season_win_rate`]: seasonStats.winRate,
      [`${prefix}_season_avg_goals_for`]: seasonStats.avgGoalsFor,
      [`${prefix}_season_avg_goals_against`]: seasonStats.avgGoalsAgainst,
      
      // Form momentum
      [`${prefix}_form_momentum`]: momentum,
      [`${prefix}_recent_form_string`]: this.getFormString(recentMatches, teamId),
      
      // Home/Away specific features
      [`${prefix}_home_matches`]: this.countHomeMatches(seasonMatches, teamId),
      [`${prefix}_away_matches`]: this.countAwayMatches(seasonMatches, teamId),
      [`${prefix}_home_win_rate`]: this.calculateHomeWinRate(seasonMatches, teamId),
      [`${prefix}_away_win_rate`]: this.calculateAwayWinRate(seasonMatches, teamId),
    };
  }

  /**
   * Calculate match statistics from a list of matches
   */
  calculateMatchStats(matches, teamId) {
    let wins = 0, draws = 0, losses = 0;
    let goalsFor = 0, goalsAgainst = 0;
    const matchesPlayed = matches.length;

    matches.forEach(match => {
      const isHome = match.homeTeamId === teamId;
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

    const points = wins * 3 + draws;
    const winRate = matchesPlayed > 0 ? wins / matchesPlayed : 0;
    const avgGoalsFor = matchesPlayed > 0 ? goalsFor / matchesPlayed : 0;
    const avgGoalsAgainst = matchesPlayed > 0 ? goalsAgainst / matchesPlayed : 0;

    return {
      matchesPlayed,
      wins,
      draws,
      losses,
      goalsFor,
      goalsAgainst,
      goalDifference: goalsFor - goalsAgainst,
      points,
      winRate,
      avgGoalsFor,
      avgGoalsAgainst,
    };
  }

  /**
   * Calculate form momentum (trend analysis)
   */
  calculateFormMomentum(matches, teamId) {
    if (matches.length < 3) return 0;

    const recentMatches = matches.slice(0, 3);
    const olderMatches = matches.slice(3, 6);

    const recentPoints = this.calculatePoints(recentMatches, teamId);
    const olderPoints = this.calculatePoints(olderMatches, teamId);

    // Momentum: positive if recent form is better than older form
    return recentPoints - olderPoints;
  }

  /**
   * Calculate points from matches
   */
  calculatePoints(matches, teamId) {
    let points = 0;
    matches.forEach(match => {
      const isHome = match.homeTeamId === teamId;
      const teamScore = isHome ? match.homeTeamScore : match.awayTeamScore;
      const opponentScore = isHome ? match.awayTeamScore : match.homeTeamScore;

      if (teamScore !== null && opponentScore !== null) {
        if (teamScore > opponentScore) points += 3;
        else if (teamScore === opponentScore) points += 1;
      }
    });
    return points;
  }

  /**
   * Get form string (W/D/L) for recent matches
   */
  getFormString(matches, teamId) {
    return matches.map(match => {
      const isHome = match.homeTeamId === teamId;
      const teamScore = isHome ? match.homeTeamScore : match.awayTeamScore;
      const opponentScore = isHome ? match.awayTeamScore : match.homeTeamScore;

      if (teamScore > opponentScore) return 'W';
      else if (teamScore === opponentScore) return 'D';
      else return 'L';
    }).join('');
  }

  /**
   * Count home matches
   */
  countHomeMatches(matches, teamId) {
    return matches.filter(match => match.homeTeamId === teamId).length;
  }

  /**
   * Count away matches
   */
  countAwayMatches(matches, teamId) {
    return matches.filter(match => match.awayTeamId === teamId).length;
  }

  /**
   * Calculate home win rate
   */
  calculateHomeWinRate(matches, teamId) {
    const homeMatches = matches.filter(match => match.homeTeamId === teamId);
    if (homeMatches.length === 0) return 0;

    const homeWins = homeMatches.filter(match => {
      return match.homeTeamScore > match.awayTeamScore;
    }).length;

    return homeWins / homeMatches.length;
  }

  /**
   * Calculate away win rate
   */
  calculateAwayWinRate(matches, teamId) {
    const awayMatches = matches.filter(match => match.awayTeamId === teamId);
    if (awayMatches.length === 0) return 0;

    const awayWins = awayMatches.filter(match => {
      return match.awayTeamScore > match.homeTeamScore;
    }).length;

    return awayWins / awayMatches.length;
  }

  /**
   * Get head-to-head features
   */
  async getHeadToHeadFeatures(homeTeamId, awayTeamId, matchDate) {
    try {
      const h2hMatches = await Match.findAll({
        where: {
          [Op.or]: [
            { homeTeamId, awayTeamId },
            { homeTeamId: awayTeamId, awayTeamId: homeTeamId },
          ],
          status: 'FINISHED',
          utcDate: { [Op.lt]: matchDate },
        },
        order: [['utcDate', 'DESC']],
        limit: 10,
      });

      const homeTeamWins = h2hMatches.filter(match => {
        if (match.homeTeamId === homeTeamId) {
          return match.homeTeamScore > match.awayTeamScore;
        } else {
          return match.awayTeamScore > match.homeTeamScore;
        }
      }).length;

      const awayTeamWins = h2hMatches.filter(match => {
        if (match.homeTeamId === awayTeamId) {
          return match.homeTeamScore > match.awayTeamScore;
        } else {
          return match.awayTeamScore > match.homeTeamScore;
        }
      }).length;

      const draws = h2hMatches.length - homeTeamWins - awayTeamWins;

      return {
        h2h_total_matches: h2hMatches.length,
        h2h_home_team_wins: homeTeamWins,
        h2h_away_team_wins: awayTeamWins,
        h2h_draws: draws,
        h2h_home_team_win_rate: h2hMatches.length > 0 ? homeTeamWins / h2hMatches.length : 0,
        h2h_away_team_win_rate: h2hMatches.length > 0 ? awayTeamWins / h2hMatches.length : 0,
        h2h_draw_rate: h2hMatches.length > 0 ? draws / h2hMatches.length : 0,
        h2h_last_5_results: this.getH2HLastResults(h2hMatches.slice(0, 5), homeTeamId),
      };
    } catch (error) {
      logger.error('Error getting head-to-head features:', error);
      return this.getDefaultH2HFeatures();
    }
  }

  /**
   * Get last 5 head-to-head results
   */
  getH2HLastResults(matches, homeTeamId) {
    return matches.map(match => {
      if (match.homeTeamId === homeTeamId) {
        if (match.homeTeamScore > match.awayTeamScore) return 'W';
        else if (match.homeTeamScore === match.awayTeamScore) return 'D';
        else return 'L';
      } else {
        if (match.awayTeamScore > match.homeTeamScore) return 'W';
        else if (match.awayTeamScore === match.homeTeamScore) return 'D';
        else return 'L';
      }
    }).join('');
  }

  /**
   * Get competition type as numeric feature
   */
  getCompetitionType(type) {
    const types = {
      'LEAGUE': 1,
      'CUP': 2,
      'FRIENDLY': 3,
    };
    return types[type] || 1;
  }

  /**
   * Get competition tier as numeric feature
   */
  getCompetitionTier(plan) {
    const tiers = {
      'TIER_ONE': 1,
      'TIER_TWO': 2,
      'TIER_THREE': 3,
      'TIER_FOUR': 4,
    };
    return tiers[plan] || 2;
  }

  /**
   * Calculate days since season start
   */
  calculateDaysSinceSeasonStart(matchDate, season) {
    if (!season) return 0;
    
    const seasonStart = new Date(season, 7, 1); // August 1st
    const matchDateTime = new Date(matchDate);
    
    const diffTime = Math.abs(matchDateTime - seasonStart);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return Math.max(0, diffDays);
  }

  /**
   * Get default team features when no data is available
   */
  getDefaultTeamFeatures(isHome) {
    const prefix = isHome ? 'home' : 'away';
    return {
      [`${prefix}_recent_wins`]: 0,
      [`${prefix}_recent_draws`]: 0,
      [`${prefix}_recent_losses`]: 0,
      [`${prefix}_recent_goals_for`]: 0,
      [`${prefix}_recent_goals_against`]: 0,
      [`${prefix}_recent_goal_difference`]: 0,
      [`${prefix}_recent_points`]: 0,
      [`${prefix}_recent_win_rate`]: 0,
      [`${prefix}_recent_avg_goals_for`]: 0,
      [`${prefix}_recent_avg_goals_against`]: 0,
      [`${prefix}_season_matches`]: 0,
      [`${prefix}_season_wins`]: 0,
      [`${prefix}_season_draws`]: 0,
      [`${prefix}_season_losses`]: 0,
      [`${prefix}_season_goals_for`]: 0,
      [`${prefix}_season_goals_against`]: 0,
      [`${prefix}_season_goal_difference`]: 0,
      [`${prefix}_season_points`]: 0,
      [`${prefix}_season_win_rate`]: 0,
      [`${prefix}_season_avg_goals_for`]: 0,
      [`${prefix}_season_avg_goals_against`]: 0,
      [`${prefix}_form_momentum`]: 0,
      [`${prefix}_recent_form_string`]: '',
      [`${prefix}_home_matches`]: 0,
      [`${prefix}_away_matches`]: 0,
      [`${prefix}_home_win_rate`]: 0,
      [`${prefix}_away_win_rate`]: 0,
    };
  }

  /**
   * Get default head-to-head features
   */
  getDefaultH2HFeatures() {
    return {
      h2h_total_matches: 0,
      h2h_home_team_wins: 0,
      h2h_away_team_wins: 0,
      h2h_draws: 0,
      h2h_home_team_win_rate: 0,
      h2h_away_team_win_rate: 0,
      h2h_draw_rate: 0,
      h2h_last_5_results: '',
    };
  }

  /**
   * Normalize features for ML models
   */
  normalizeFeatures(features) {
    const normalized = {};
    
    // Define normalization ranges for different feature types
    const normalizations = {
      // Win rates (0-1)
      win_rate: { min: 0, max: 1 },
      // Goals (0-10)
      goals: { min: 0, max: 10 },
      // Points (0-30 for 10 matches)
      points: { min: 0, max: 30 },
      // Goal difference (-20 to 20)
      goal_difference: { min: -20, max: 20 },
      // Form momentum (-9 to 9)
      momentum: { min: -9, max: 9 },
    };

    Object.entries(features).forEach(([key, value]) => {
      if (typeof value === 'number') {
        // Apply appropriate normalization based on feature name
        let normalizedValue = value;
        
        if (key.includes('win_rate')) {
          normalizedValue = this.normalize(value, normalizations.win_rate.min, normalizations.win_rate.max);
        } else if (key.includes('goals')) {
          normalizedValue = this.normalize(value, normalizations.goals.min, normalizations.goals.max);
        } else if (key.includes('points')) {
          normalizedValue = this.normalize(value, normalizations.points.min, normalizations.points.max);
        } else if (key.includes('goal_difference')) {
          normalizedValue = this.normalize(value, normalizations.goal_difference.min, normalizations.goal_difference.max);
        } else if (key.includes('momentum')) {
          normalizedValue = this.normalize(value, normalizations.momentum.min, normalizations.momentum.max);
        }
        
        normalized[key] = normalizedValue;
      } else {
        normalized[key] = value;
      }
    });

    return normalized;
  }

  /**
   * Normalize a value to 0-1 range
   */
  normalize(value, min, max) {
    if (max === min) return 0.5;
    return Math.max(0, Math.min(1, (value - min) / (max - min)));
  }

  /**
   * Clear feature cache
   */
  clearCache() {
    this.featureCache.clear();
    logger.info('Feature cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.featureCache.size,
      entries: Array.from(this.featureCache.keys()),
    };
  }
}

module.exports = FeatureEngineering;
