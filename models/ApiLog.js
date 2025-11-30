const mongoose = require('mongoose');

const apiLogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  ip: String,        // raw IP (proxy / IPv6 / etc.)
  ipV4: String,      // normalized IPv4 (public)
  localIp: String,   // Local IP (LAN address on server)
  method: String,
  endpoint: String,
  userAgent: String,
  statusCode: Number,
  responseTime: Number,
  errorMessage: String,
  stackTrace: String,
  timestamp: { type: Date, default: Date.now }
});

const ApiLog = mongoose.model('ApiLog', apiLogSchema);

module.exports = ApiLog;
