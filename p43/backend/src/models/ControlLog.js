const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ControlLog = sequelize.define('ControlLog', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  deviceId: {
    type: DataTypes.STRING,
    allowNull: true,
    index: true
  },
  deviceName: {
    type: DataTypes.STRING,
    allowNull: true
  },
  action: {
    type: DataTypes.ENUM('manual', 'scene', 'schedule', 'automation', 'daylight'),
    allowNull: false
  },
  actionSource: {
    type: DataTypes.STRING,
    allowNull: true
  },
  brightness: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  colorTemperature: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  area: {
    type: DataTypes.STRING,
    allowNull: true
  },
  affectedDevices: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  energyConsumption: {
    type: DataTypes.FLOAT,
    defaultValue: 0
  },
  timestamp: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    index: true
  }
}, {
  timestamps: true,
  indexes: [
    {
      fields: ['timestamp']
    },
    {
      fields: ['action']
    },
    {
      fields: ['deviceId']
    }
  ]
});

module.exports = ControlLog;
