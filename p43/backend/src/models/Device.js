const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Device = sequelize.define('Device', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  area: {
    type: DataTypes.STRING,
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
  online: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  lastUpdate: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  timestamps: true,
  tableName: 'devices'
});

module.exports = Device;
