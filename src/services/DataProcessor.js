const logger = require('../config/logger');
const { Competition, Team, Match, Prediction } = require('../models');
const FootballDataAPI = require('./FootballDataAPI');
const { Op } = require('sequelize');

class DataProcessor {
  constructor() {
    this.footballAPI = new FootballDataAPI();
  }

  /**
   * Process and store competition data from external API
   */
  async processCompetitions(filters = {}) {
    try {
      logger.info('Starting competition data processing...');
      
      const apiData = await this.footballAPI.getCompetitions(filters.plan, filters.areas);
      
      if (!apiData.competitions || apiData.competitions.length === 0) {
        logger.warn('No competition data received from API');
        return { processed: 0, errors: 0 };
      }

      let processed = 0;
      let errors = 0;

      for (const comp of apiData.competitions) {
        try {
          const [competition, created] = await Competition.findOrCreate({
            where: { externalId: comp.id },
            defaults: {
              externalId: comp.id,
              name: comp.name,
              code: comp.code,
              type: comp.type,
              country: comp.area?.name || 'Unknown',
              countryCode: comp.area?.countryCode || 'UNK',
              emblem: comp.emblem,
              plan: comp.plan,
              currentSeason: comp.currentSeason?.startDate ? 
                new Date(comp.currentSeason.startDate).getFullYear() : null,
              numberOfAvailableSeasons: comp.numberOfAvailableSeasons,
              lastUpdated: new Date(comp.lastUpdated),
            },
          });

          if (!created) {
            // Update existing competition
            await competition.update({
              name: comp.name,
              emblem: comp.emblem,
              plan: comp.plan,
              currentSeason: comp.currentSeason?.startDate ? 
                new Date(comp.currentSeason.startDate).getFullYear() : null,
              numberOfAvailableSeasons: comp.numberOfAvailableSeasons,
              lastUpdated: new Date(comp.lastUpdated),
            });
          }

          processed++;
          logger.debug(`Processed competition: ${comp.name} (${created ? 'created' : 'updated'})`);
        } catch (error) {
          logger.error(`Error processing competition ${comp.name}:`, error);
          errors++;
        }
      }

      logger.info(`Competition processing completed: ${processed} processed, ${errors} errors`);
      return { processed, errors };
    } catch (error) {
      logger.error('Failed to process competitions:', error);
      throw error;
    }
  }

  /**
   * Process and store team data for a specific competition
   */
  async processTeams(competitionId, season = null) {
    try {
      logger.info(`Processing teams for competition ${competitionId}, season ${season}...`);
      
      const competition = await Competition.findOne({
        where: { id: competitionId, isActive: true },
      });

      if (!competition) {
        throw new Error(`Competition with ID ${competitionId} not found`);
      }

      const apiData = await this.footballAPI.getTeams(competition.externalId, season);
      
      if (!apiData.teams || apiData.teams.length === 0) {
        logger.warn(`No team data received for competition ${competition.name}`);
        return { processed: 0, errors: 0 };
      }

      let processed = 0;
      let errors = 0;

      for (const team of apiData.teams) {
        try {
          const [teamRecord, created] = await Team.findOrCreate({
            where: { externalId: team.id },
            defaults: {
              externalId: team.id,
              name: team.name,
              shortName: team.shortName,
              tla: team.tla,
              crest: team.crest,
              address: team.address,
              website: team.website,
              founded: team.founded,
              clubColors: team.clubColors,
              venue: team.venue,
              country: team.area?.name || competition.country || 'Unknown',
              countryCode: team.area?.countryCode || competition.countryCode || null,
              lastUpdated: new Date(team.lastUpdated),
            },
          });

          if (!created) {
            // Update existing team
            await teamRecord.update({
              name: team.name,
              shortName: team.shortName,
              tla: team.tla,
              crest: team.crest,
              address: team.address,
              website: team.website,
              founded: team.founded,
              clubColors: team.clubColors,
              venue: team.venue,
              lastUpdated: new Date(team.lastUpdated),
            });
          }

          processed++;
          logger.debug(`Processed team: ${team.name} (${created ? 'created' : 'updated'})`);
        } catch (error) {
          logger.error(`Error processing team ${team.name}:`, error);
          errors++;
        }
      }

      logger.info(`Team processing completed: ${processed} processed, ${errors} errors`);
      return { processed, errors };
    } catch (error) {
      logger.error('Failed to process teams:', error);
      throw error;
    }
  }

  /**
   * Process and store match data for a competition
   */
  async processMatches(competitionId, filters = {}) {
    try {
      logger.info(`Processing matches for competition ${competitionId}...`);
      
      const competition = await Competition.findOne({
        where: { id: competitionId, isActive: true },
      });

      if (!competition) {
        throw new Error(`Competition with ID ${competitionId} not found`);
      }

      const apiData = await this.footballAPI.getCompetitionMatches(competition.externalId, filters);
      
      if (!apiData.matches || apiData.matches.length === 0) {
        logger.warn(`No match data received for competition ${competition.name}`);
        return { processed: 0, errors: 0 };
      }

      let processed = 0;
      let errors = 0;

      for (const match of apiData.matches) {
        try {
          // Find or create home and away teams
          const [homeTeam] = await Team.findOrCreate({
            where: { externalId: match.homeTeam.id },
            defaults: {
              externalId: match.homeTeam.id,
              name: match.homeTeam.name,
              shortName: match.homeTeam.shortName,
              tla: match.homeTeam.tla,
              crest: match.homeTeam.crest,
              country: competition.country || 'Unknown',
              countryCode: competition.countryCode || null,
            },
          });

          const [awayTeam] = await Team.findOrCreate({
            where: { externalId: match.awayTeam.id },
            defaults: {
              externalId: match.awayTeam.id,
              name: match.awayTeam.name,
              shortName: match.awayTeam.shortName,
              tla: match.awayTeam.tla,
              crest: match.awayTeam.crest,
              country: competition.country || 'Unknown',
              countryCode: competition.countryCode || null,
            },
          });

          // Process match data
          const [matchRecord, created] = await Match.findOrCreate({
            where: { externalId: match.id },
            defaults: {
              externalId: match.id,
              competitionId: competition.id,
              season: match.season?.startDate ? 
                new Date(match.season.startDate).getFullYear() : null,
              stage: match.stage || 'REGULAR_SEASON',
              group: match.group,
              lastUpdated: new Date(match.lastUpdated),
              matchday: match.matchday,
              homeTeamId: homeTeam.id,
              awayTeamId: awayTeam.id,
              homeTeamName: match.homeTeam.name || 'Unknown Team',
              awayTeamName: match.awayTeam.name || 'Unknown Team',
              homeTeamShortName: match.homeTeam.shortName,
              awayTeamShortName: match.awayTeam.shortName,
              homeTeamTla: match.homeTeam.tla,
              awayTeamTla: match.awayTeam.tla,
              homeTeamCrest: match.homeTeam.crest,
              awayTeamCrest: match.awayTeam.crest,
              status: match.status || 'SCHEDULED',
              utcDate: match.utcDate ? new Date(match.utcDate) : new Date(),
              venue: match.venue,
              referee: match.referees?.[0]?.name,
              // Scores
              homeTeamScore: match.score?.fullTime?.home,
              awayTeamScore: match.score?.fullTime?.away,
              homeTeamHalfTimeScore: match.score?.halfTime?.home,
              awayTeamHalfTimeScore: match.score?.halfTime?.away,
              homeTeamFullTimeScore: match.score?.fullTime?.home,
              awayTeamFullTimeScore: match.score?.fullTime?.away,
              homeTeamExtraTimeScore: match.score?.extraTime?.home,
              awayTeamExtraTimeScore: match.score?.extraTime?.away,
              homeTeamPenaltiesScore: match.score?.penalties?.home,
              awayTeamPenaltiesScore: match.score?.penalties?.away,
              winner: match.score?.winner,
              duration: match.score?.duration || 'REGULAR',
            },
          });

          if (!created && match.status === 'FINISHED') {
            // Update existing match with latest results
            await matchRecord.update({
              status: match.status,
              homeTeamScore: match.score?.fullTime?.home,
              awayTeamScore: match.score?.fullTime?.away,
              homeTeamHalfTimeScore: match.score?.halfTime?.home,
              awayTeamHalfTimeScore: match.score?.halfTime?.away,
              homeTeamFullTimeScore: match.score?.fullTime?.home,
              awayTeamFullTimeScore: match.score?.fullTime?.away,
              homeTeamExtraTimeScore: match.score?.extraTime?.home,
              awayTeamExtraTimeScore: match.score?.extraTime?.away,
              homeTeamPenaltiesScore: match.score?.penalties?.home,
              awayTeamPenaltiesScore: match.score?.penalties?.away,
              winner: match.score?.winner,
              duration: match.score?.duration || 'REGULAR',
              lastUpdated: new Date(match.lastUpdated),
            });
          }

          processed++;
          logger.debug(`Processed match: ${match.homeTeam.name} vs ${match.awayTeam.name} (${created ? 'created' : 'updated'})`);
        } catch (error) {
          logger.error(`Error processing match ${match.id}:`, error);
          errors++;
        }
      }

      logger.info(`Match processing completed: ${processed} processed, ${errors} errors`);
      return { processed, errors };
    } catch (error) {
      logger.error('Failed to process matches:', error);
      throw error;
    }
  }

  /**
   * Calculate team statistics based on historical matches
   */
  async calculateTeamStatistics(teamId, season = null, lastNMatches = null) {
    try {
      logger.debug(`Calculating statistics for team ${teamId}...`);

      const team = await Team.findByPk(teamId);
      if (!team) {
        throw new Error(`Team with ID ${teamId} not found`);
      }

      // Build query conditions
      const whereConditions = {
        [Op.or]: [
          { homeTeamId: teamId },
          { awayTeamId: teamId },
        ],
        status: 'FINISHED',
      };

      if (season) {
        whereConditions.season = season;
      }

      // Get matches
      let matches = await Match.findAll({
        where: whereConditions,
        order: [['utcDate', 'DESC']],
        limit: lastNMatches || undefined,
      });

      if (matches.length === 0) {
        return {
          matchesPlayed: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          goalDifference: 0,
          points: 0,
          winPercentage: 0,
          averageGoalsFor: 0,
          averageGoalsAgainst: 0,
          form: [],
        };
      }

      // Calculate statistics
      let wins = 0;
      let draws = 0;
      let losses = 0;
      let goalsFor = 0;
      let goalsAgainst = 0;
      const form = [];

      matches.forEach(match => {
        const isHome = match.homeTeamId === teamId;
        const teamScore = isHome ? match.homeTeamScore : match.awayTeamScore;
        const opponentScore = isHome ? match.awayTeamScore : match.homeTeamScore;

        if (teamScore !== null && opponentScore !== null) {
          goalsFor += teamScore;
          goalsAgainst += opponentScore;

          if (teamScore > opponentScore) {
            wins++;
            form.push('W');
          } else if (teamScore === opponentScore) {
            draws++;
            form.push('D');
          } else {
            losses++;
            form.push('L');
          }
        }
      });

      const matchesPlayed = wins + draws + losses;
      const points = wins * 3 + draws;
      const goalDifference = goalsFor - goalsAgainst;

      return {
        matchesPlayed,
        wins,
        draws,
        losses,
        goalsFor,
        goalsAgainst,
        goalDifference,
        points,
        winPercentage: matchesPlayed > 0 ? (wins / matchesPlayed * 100) : 0,
        averageGoalsFor: matchesPlayed > 0 ? (goalsFor / matchesPlayed) : 0,
        averageGoalsAgainst: matchesPlayed > 0 ? (goalsAgainst / matchesPlayed) : 0,
        form: form.slice(0, 5), // Last 5 matches
      };
    } catch (error) {
      logger.error(`Failed to calculate team statistics for team ${teamId}:`, error);
      throw error;
    }
  }

  /**
   * Get head-to-head analysis between two teams
   */
  async getHeadToHeadAnalysis(homeTeamId, awayTeamId, limit = 10) {
    try {
      logger.debug(`Getting head-to-head analysis: ${homeTeamId} vs ${awayTeamId}...`);

      const matches = await Match.findAll({
        where: {
          [Op.or]: [
            {
              homeTeamId,
              awayTeamId,
            },
            {
              homeTeamId: awayTeamId,
              awayTeamId: homeTeamId,
            },
          ],
          status: 'FINISHED',
        },
        order: [['utcDate', 'DESC']],
        limit,
        include: [
          { model: Team, as: 'homeTeam', attributes: ['name', 'shortName', 'tla'] },
          { model: Team, as: 'awayTeam', attributes: ['name', 'shortName', 'tla'] },
        ],
      });

      if (matches.length === 0) {
        return {
          totalMatches: 0,
          team1Wins: 0,
          team2Wins: 0,
          draws: 0,
          team1Goals: 0,
          team2Goals: 0,
          averageGoals: 0,
          matches: [],
        };
      }

      let team1Wins = 0; // homeTeamId wins
      let team2Wins = 0; // awayTeamId wins
      let draws = 0;
      let team1Goals = 0;
      let team2Goals = 0;

      matches.forEach(match => {
        const team1IsHome = match.homeTeamId === homeTeamId;
        const team1Score = team1IsHome ? match.homeTeamScore : match.awayTeamScore;
        const team2Score = team1IsHome ? match.awayTeamScore : match.homeTeamScore;

        if (team1Score !== null && team2Score !== null) {
          team1Goals += team1Score;
          team2Goals += team2Score;

          if (team1Score > team2Score) {
            team1Wins++;
          } else if (team1Score === team2Score) {
            draws++;
          } else {
            team2Wins++;
          }
        }
      });

      const totalGoals = team1Goals + team2Goals;
      const totalMatches = matches.length;

      return {
        totalMatches,
        team1Wins,
        team2Wins,
        draws,
        team1Goals,
        team2Goals,
        averageGoals: totalMatches > 0 ? (totalGoals / totalMatches) : 0,
        matches: matches.map(match => ({
          id: match.id,
          utcDate: match.utcDate,
          homeTeam: match.homeTeam.name,
          awayTeam: match.awayTeam.name,
          homeScore: match.homeTeamScore,
          awayScore: match.awayTeamScore,
          status: match.status,
        })),
      };
    } catch (error) {
      logger.error(`Failed to get head-to-head analysis: ${homeTeamId} vs ${awayTeamId}:`, error);
      throw error;
    }
  }

  /**
   * Data validation and cleaning
   */
  validateMatchData(matchData) {
    const errors = [];

    if (!matchData.homeTeam || !matchData.awayTeam) {
      errors.push('Missing team information');
    }

    if (!matchData.utcDate || isNaN(new Date(matchData.utcDate))) {
      errors.push('Invalid match date');
    }

    if (matchData.status === 'FINISHED') {
      if (matchData.score?.fullTime?.home === null || matchData.score?.fullTime?.away === null) {
        errors.push('Missing score for finished match');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Clean old data to maintain database performance
   */
  async cleanOldData(daysToKeep = 730) { // Keep 2 years by default
    try {
      logger.info(`Cleaning data older than ${daysToKeep} days...`);

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      // Clean old matches
      const deletedMatches = await Match.destroy({
        where: {
          utcDate: {
            [Op.lt]: cutoffDate,
          },
          status: 'FINISHED',
        },
      });

      // Clean old predictions
      const deletedPredictions = await Prediction.destroy({
        where: {
          createdAt: {
            [Op.lt]: cutoffDate,
          },
        },
      });

      logger.info(`Data cleanup completed: ${deletedMatches} matches, ${deletedPredictions} predictions`);
      return { deletedMatches, deletedPredictions };
    } catch (error) {
      logger.error('Failed to clean old data:', error);
      throw error;
    }
  }
}

module.exports = DataProcessor;
