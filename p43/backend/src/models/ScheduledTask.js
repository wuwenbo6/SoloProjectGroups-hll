const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ScheduledTask = sequelize.define('ScheduledTask', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  cronExpression: {
    type: DataTypes.STRING,
    allowNull: false
  },
  sceneId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  action: {
    type: DataTypes.JSON,
    allowNull: false
  },
  enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  lastExecuted: {
    type: DataTypes.DATE,
    allowNull: true
  },
  nextExecution: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  timestamps: true,
  tableName: 'scheduled_tasks'
});

module.exports = ScheduledTask;
