const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Prediction = sequelize.define(
  'Prediction',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    matchId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'matches',
        key: 'id',
      },
    },
    modelName: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Name of the ML model used',
    },
    modelVersion: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Version of the ML model',
    },
    // Prediction probabilities
    homeTeamWinProbability: {
      type: DataTypes.DECIMAL(5, 4),
      allowNull: true,
      comment: 'Predicted probability for home team win',
    },
    drawProbability: {
      type: DataTypes.DECIMAL(5, 4),
      allowNull: true,
      comment: 'Predicted probability for draw',
    },
    awayTeamWinProbability: {
      type: DataTypes.DECIMAL(5, 4),
      allowNull: true,
      comment: 'Predicted probability for away team win',
    },
    // Predicted outcome
    predictedWinner: {
      type: DataTypes.ENUM('HOME_TEAM', 'AWAY_TEAM', 'DRAW'),
      allowNull: true,
    },
    confidence: {
      type: DataTypes.DECIMAL(5, 4),
      allowNull: true,
      comment: 'Confidence level of the prediction (0-1)',
    },
    // Feature values used for prediction
    features: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Feature values used for this prediction',
    },
    // Model metadata
    trainingDataSize: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Number of training samples used',
    },
    modelAccuracy: {
      type: DataTypes.DECIMAL(5, 4),
      allowNull: true,
      comment: 'Model accuracy on validation set',
    },
    // Actual result (filled after match)
    actualWinner: {
      type: DataTypes.ENUM('HOME_TEAM', 'AWAY_TEAM', 'DRAW'),
      allowNull: true,
      comment: 'Actual match result',
    },
    isCorrect: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      comment: 'Whether prediction was correct',
    },
    // Betting analysis
    recommendedBet: {
      type: DataTypes.ENUM('HOME_TEAM', 'AWAY_TEAM', 'DRAW', 'NO_BET'),
      allowNull: true,
      comment: 'Recommended betting option',
    },
    betConfidence: {
      type: DataTypes.DECIMAL(5, 4),
      allowNull: true,
      comment: 'Confidence level for betting recommendation',
    },
    expectedValue: {
      type: DataTypes.DECIMAL(8, 4),
      allowNull: true,
      comment: 'Expected value of the bet',
    },
    kellyCriterion: {
      type: DataTypes.DECIMAL(5, 4),
      allowNull: true,
      comment: 'Kelly criterion percentage for bet sizing',
    },
    // Metadata
    predictionTimestamp: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    isProcessed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
      comment: 'Whether prediction has been processed for accuracy',
    },
  },
  {
    tableName: 'predictions',
    timestamps: true,
    indexes: [
      {
        fields: ['matchId'],
      },
      {
        fields: ['modelName'],
      },
      {
        fields: ['predictedWinner'],
      },
      {
        fields: ['isCorrect'],
      },
      {
        fields: ['predictionTimestamp'],
      },
      {
        fields: ['isProcessed'],
      },
      {
        fields: ['matchId', 'modelName'],
        unique: true,
      },
    ],
  }
);

module.exports = Prediction;
