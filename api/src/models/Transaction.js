const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    amount: { type: Number, required: true },
    reason: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now }
  },
  {
    timestamps: false,
    collection: 'transactions'
  }
);

module.exports = mongoose.model('Transaction', transactionSchema);
