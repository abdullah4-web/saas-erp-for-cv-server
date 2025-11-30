const mongoose = require('mongoose');

const errorLogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // new
  ip: String,
  method: String,
  endpoint: String,
  userAgent: String,
  statusCode: Number,
  responseTime: Number,
  errorMessage: String,
  stackTrace: String,
  timestamp: { type: Date, default: Date.now }
});

const ErrorLog = mongoose.model('ErrorLog', errorLogSchema);

module.exports = ErrorLog;
