const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Team = sequelize.define(
  'Team',
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
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    shortName: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    tla: {
      type: DataTypes.STRING(10),
      allowNull: true,
      comment: 'Three letter abbreviation',
    },
    crest: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'URL to team crest/logo',
    },
    address: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    website: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    founded: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Year team was founded',
    },
    clubColors: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    venue: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Home stadium name',
    },
    venueCapacity: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    country: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    countryCode: {
      type: DataTypes.STRING(3),
      allowNull: false,
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
    tableName: 'teams',
    timestamps: true,
    indexes: [
      {
        fields: ['externalId'],
      },
      {
        fields: ['name'],
      },
      {
        fields: ['tla'],
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

module.exports = Team;
