const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    game: { type: String, default: 'unknown', index: true },

    roundId: { type: String, required: true, index: true },

    type: {
      type: String,
      enum: ['bet', 'payout'],
      required: true
    },

    amount: { type: Number, required: true },
    reason: { type: String, default: '' },

    balanceAfter: { type: Number, default: 0 },

    status: {
      type: String,
      enum: ['open', 'closed'],
      default: 'closed'
    },

    result: {
      type: String,
      enum: ['pending', 'win', 'loss', 'cashout'],
      default: 'pending'
    },

    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    settledAt: { type: Date, default: null },

    timestamp: { type: Date, default: Date.now }
  },
  {
    timestamps: false,
    collection: 'transactions'
  }
);

transactionSchema.index({ userId: 1, roundId: 1, type: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);
