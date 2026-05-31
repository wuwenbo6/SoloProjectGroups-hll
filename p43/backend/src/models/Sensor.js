const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Sensor = sequelize.define('Sensor', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  type: {
    type: DataTypes.ENUM('motion', 'light', 'temperature', 'humidity', 'occupancy'),
    allowNull: false
  },
  area: {
    type: DataTypes.STRING,
    allowNull: true
  },
  value: {
    type: DataTypes.FLOAT,
    allowNull: true
  },
  unit: {
    type: DataTypes.STRING,
    allowNull: true
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
  tableName: 'sensors'
});

module.exports = Sensor;
