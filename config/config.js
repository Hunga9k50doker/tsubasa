require("dotenv").config();
const { _isArray } = require("../utils.js");

const settings = {
  TIME_SLEEP: process.env.TIME_SLEEP ? parseInt(process.env.TIME_SLEEP) : 8,
  MAX_THEADS: process.env.MAX_THEADS ? parseInt(process.env.MAX_THEADS) : 10,
  MAX_PRICE_UPGRADE_CARD: process.env.MAX_PRICE_UPGRADE_CARD ? parseInt(process.env.MAX_PRICE_UPGRADE_CARD) : 1000000,
  MAX_LEVEL_TAP: process.env.MAX_LEVEL_TAP ? parseInt(process.env.MAX_LEVEL_TAP) : 10,
  MAX_LEVEL_ENERGY: process.env.MAX_LEVEL_ENERGY ? parseInt(process.env.MAX_LEVEL_ENERGY) : 10,
  DAILY_COMBO: process.env.DAILY_COMBO ? JSON.parse(process.env.DAILY_COMBO.replace(/'/g, '"')) : [],
  SKIP_TASKS: process.env.SKIP_TASKS ? JSON.parse(process.env.SKIP_TASKS.replace(/'/g, '"')) : [],
  AUTO_TASK: process.env.AUTO_TASK ? process.env.AUTO_TASK.toLowerCase() === "true" : false,
  AUTO_UPGRADE_CARD: process.env.AUTO_UPGRADE_CARD ? process.env.AUTO_UPGRADE_CARD.toLowerCase() === "true" : false,
  AUTO_UPGRADE_TAP: process.env.AUTO_UPGRADE_TAP ? process.env.AUTO_UPGRADE_TAP.toLowerCase() === "true" : false,
  AUTO_UPGRADE_ENERGY: process.env.AUTO_UPGRADE_ENERGY ? process.env.AUTO_UPGRADE_ENERGY.toLowerCase() === "true" : false,
  AUTO_TAP: process.env.AUTO_TAP ? process.env.AUTO_TAP.toLowerCase() === "true" : false,

  CONNECT_WALLET: process.env.CONNECT_WALLET ? process.env.CONNECT_WALLET.toLowerCase() === "true" : false,
  AUTO_DAILY_COMBO: process.env.AUTO_DAILY_COMBO ? process.env.AUTO_DAILY_COMBO.toLowerCase() === "true" : false,
  DELAY_BETWEEN_REQUESTS: process.env.DELAY_BETWEEN_REQUESTS && _isArray(process.env.DELAY_BETWEEN_REQUESTS) ? JSON.parse(process.env.DELAY_BETWEEN_REQUESTS) : [1, 5],
  DELAY_START_BOT: process.env.DELAY_START_BOT && _isArray(process.env.DELAY_START_BOT) ? JSON.parse(process.env.DELAY_START_BOT) : [1, 15],
};

module.exports = settings;
