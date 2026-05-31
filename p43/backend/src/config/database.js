const { Sequelize } = require('sequelize');
const path = require('path');

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: path.join(__dirname, '../../database/smart_lighting.db'),
  logging: process.env.NODE_ENV === 'development' ? console.log : false
});

module.exports = sequelize;
