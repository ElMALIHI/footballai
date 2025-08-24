const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Competition = sequelize.define(
  'Competition',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    externalId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'ID from Football-Data.org API',
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    code: {
      type: DataTypes.STRING(10),
      allowNull: false,
      comment: 'Competition code (e.g., PL, CL, BL1)',
    },
    type: {
      type: DataTypes.ENUM('LEAGUE', 'CUP', 'FRIENDLY'),
      allowNull: false,
      defaultValue: 'LEAGUE',
    },
    country: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    countryCode: {
      type: DataTypes.STRING(3),
      allowNull: true, // Changed from false to true
      comment: 'Country code (e.g., ENG, ESP, GER)',
    },
    emblem: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'URL to competition emblem',
    },
    plan: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'API plan tier (TIER_ONE, TIER_TWO, etc.)',
    },
    currentSeason: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Current season year',
    },
    numberOfAvailableSeasons: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    lastUpdated: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Last update from external API',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      allowNull: false,
    },
  },
  {
    tableName: 'competitions',
    timestamps: true,
    indexes: [
      {
        fields: ['externalId'],
      },
      {
        fields: ['code'],
      },
      {
        fields: ['country'],
      },
      {
        fields: ['isActive'],
      },
    ],
  }
);

module.exports = Competition;
