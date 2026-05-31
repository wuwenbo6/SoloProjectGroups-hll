const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Scene = sequelize.define('Scene', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  brightness: {
    type: DataTypes.INTEGER,
    defaultValue: 50,
    validate: {
      min: 0,
      max: 100
    }
  },
  colorTemperature: {
    type: DataTypes.INTEGER,
    defaultValue: 4000,
    validate: {
      min: 2700,
      max: 6500
    }
  },
  isPreset: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  targetAreas: {
    type: DataTypes.JSON,
    allowNull: true
  }
}, {
  timestamps: true,
  tableName: 'scenes'
});

module.exports = Scene;
