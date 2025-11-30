// models/BlockedIP.js
const mongoose = require('mongoose');

const blockedIpSchema = new mongoose.Schema({
  ip: { type: String, required: true, unique: true },
  blockedAt: { type: Date, default: Date.now },
  reason: String,
});

const BlockedIP = mongoose.model('BlockedIP', blockedIpSchema);

module.exports = BlockedIP;
