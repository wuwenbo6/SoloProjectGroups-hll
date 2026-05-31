const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AutomationRule = sequelize.define('AutomationRule', {
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
  triggerType: {
    type: DataTypes.ENUM('sensor', 'schedule', 'manual'),
    allowNull: false
  },
  triggerCondition: {
    type: DataTypes.JSON,
    allowNull: false
  },
  action: {
    type: DataTypes.JSON,
    allowNull: false
  },
  enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  lastTriggered: {
    type: DataTypes.DATE,
    allowNull: true
  },
  triggerCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  timestamps: true,
  tableName: 'automation_rules'
});

module.exports = AutomationRule;
