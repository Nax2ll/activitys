const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    wallet: { type: Number, default: 0 }
  },
  {
    timestamps: false,
    collection: 'users'
  }
);

module.exports = mongoose.model('User', userSchema);
