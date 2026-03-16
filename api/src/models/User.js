const mongoose = require('mongoose');

const gameStatSchema = new mongoose.Schema(
  {
    played: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    profit: { type: Number, default: 0 }
  },
  { _id: false }
);

function defaultGameStat() {
  return {
    played: 0,
    wins: 0,
    losses: 0,
    profit: 0
  };
}

const userSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    username: { type: String, default: '' },
    avatar: { type: String, default: '' },

    balance: { type: Number, default: 10000, min: 0 },
    totalWagered: { type: Number, default: 0 },
    totalWon: { type: Number, default: 0 },

    stats: {
      plinko: { type: gameStatSchema, default: defaultGameStat },
      mines: { type: gameStatSchema, default: defaultGameStat },
      keno: { type: gameStatSchema, default: defaultGameStat },
      dice: { type: gameStatSchema, default: defaultGameStat },
      dragonTower: { type: gameStatSchema, default: defaultGameStat },
      chickenCross: { type: gameStatSchema, default: defaultGameStat },
      unknown: { type: gameStatSchema, default: defaultGameStat }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);