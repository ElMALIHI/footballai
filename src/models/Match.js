const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Match = sequelize.define(
  'Match',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    externalId: {
      type: DataTypes.INTEGER,
      unique: true,
      allowNull: false,
      comment: 'ID from Football-Data.org API',
    },
    competitionId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'competitions',
        key: 'id',
      },
    },
    season: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Season year (e.g., 2023)',
    },
    stage: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'REGULAR_SEASON',
      comment: 'Competition stage (REGULAR_SEASON, QUARTER_FINAL, etc.)',
    },
    group: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Group name for group stages',
    },
    lastUpdated: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Last update from external API',
    },
    matchday: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Matchday number',
    },
    homeTeamId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'teams',
        key: 'id',
      },
    },
    awayTeamId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'teams',
        key: 'id',
      },
    },
    homeTeamName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    awayTeamName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    homeTeamShortName: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    awayTeamShortName: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    homeTeamTla: {
      type: DataTypes.STRING(10),
      allowNull: true,
    },
    awayTeamTla: {
      type: DataTypes.STRING(10),
      allowNull: true,
    },
    homeTeamCrest: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    awayTeamCrest: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM(
        'SCHEDULED',
        'LIVE',
        'IN_PLAY',
        'PAUSED',
        'FINISHED',
        'POSTPONED',
        'SUSPENDED',
        'CANCELLED'
      ),
      allowNull: false,
      defaultValue: 'SCHEDULED',
    },
    utcDate: {
      type: DataTypes.DATE,
      allowNull: false,
      comment: 'Match date and time in UTC',
    },
    venue: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Stadium name',
    },
    referee: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    // Match results
    homeTeamScore: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    awayTeamScore: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    homeTeamHalfTimeScore: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    awayTeamHalfTimeScore: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    homeTeamFullTimeScore: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    awayTeamFullTimeScore: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    homeTeamExtraTimeScore: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    awayTeamExtraTimeScore: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    homeTeamPenaltiesScore: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    awayTeamPenaltiesScore: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    // Match outcome
    winner: {
      type: DataTypes.ENUM('HOME_TEAM', 'AWAY_TEAM', 'DRAW'),
      allowNull: true,
    },
    duration: {
      type: DataTypes.ENUM('REGULAR', 'EXTRA_TIME', 'PENALTY_SHOOTOUT'),
      allowNull: true,
      defaultValue: 'REGULAR',
    },
    // Additional match data
    minute: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Current minute for live matches',
    },
    second: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Current second for live matches',
    },
    // Odds and betting data
    homeTeamOdds: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      comment: 'Home team win odds',
    },
    drawOdds: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      comment: 'Draw odds',
    },
    awayTeamOdds: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      comment: 'Away team win odds',
    },
    // Prediction data
    predictedWinner: {
      type: DataTypes.ENUM('HOME_TEAM', 'AWAY_TEAM', 'DRAW'),
      allowNull: true,
    },
    homeTeamWinProbability: {
      type: DataTypes.DECIMAL(5, 4),
      allowNull: true,
      comment: 'AI predicted probability for home team win',
    },
    drawProbability: {
      type: DataTypes.DECIMAL(5, 4),
      allowNull: true,
      comment: 'AI predicted probability for draw',
    },
    awayTeamWinProbability: {
      type: DataTypes.DECIMAL(5, 4),
      allowNull: true,
      comment: 'AI predicted probability for away team win',
    },
    predictionConfidence: {
      type: DataTypes.DECIMAL(5, 4),
      allowNull: true,
      comment: 'Confidence level of the prediction (0-1)',
    },
    predictionModel: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Model used for prediction',
    },
    predictionTimestamp: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'When prediction was made',
    },
    // Metadata
    isPredicted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    isProcessed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
      comment: 'Whether match data has been processed for ML features',
    },
  },
  {
    tableName: 'matches',
    timestamps: true,
    indexes: [
      {
        fields: ['externalId'],
      },
      {
        fields: ['competitionId'],
      },
      {
        fields: ['homeTeamId'],
      },
      {
        fields: ['awayTeamId'],
      },
      {
        fields: ['status'],
      },
      {
        fields: ['utcDate'],
      },
      {
        fields: ['season'],
      },
      {
        fields: ['isPredicted'],
      },
      {
        fields: ['isProcessed'],
      },
      {
        fields: ['homeTeamId', 'awayTeamId'],
      },
      {
        fields: ['competitionId', 'season'],
      },
    ],
  }
);

module.exports = Match;
