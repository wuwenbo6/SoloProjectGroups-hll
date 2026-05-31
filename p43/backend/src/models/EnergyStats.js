const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const EnergyStats = sequelize.define('EnergyStats', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  period: {
    type: DataTypes.ENUM('hourly', 'daily', 'weekly', 'monthly'),
    allowNull: false
  },
  timestamp: {
    type: DataTypes.DATE,
    allowNull: false,
    index: true
  },
  area: {
    type: DataTypes.STRING,
    allowNull: true,
    index: true
  },
  totalKwh: {
    type: DataTypes.FLOAT,
    defaultValue: 0
  },
  peakKwh: {
    type: DataTypes.FLOAT,
    defaultValue: 0
  },
  averageBrightness: {
    type: DataTypes.FLOAT,
    defaultValue: 0
  },
  deviceCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  runtimeMinutes: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  estimatedCost: {
    type: DataTypes.FLOAT,
    defaultValue: 0
  },
  daylightSavings: {
    type: DataTypes.FLOAT,
    defaultValue: 0
  }
}, {
  timestamps: true,
  indexes: [
    {
      fields: ['period', 'timestamp']
    },
    {
      fields: ['area']
    }
  ]
});

module.exports = EnergyStats;
