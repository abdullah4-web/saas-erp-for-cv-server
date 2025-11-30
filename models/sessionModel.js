const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    token: {
      type: String,
      required: true,
    },
    loginTime: {
      type: Date,
      default: Date.now
    },
    ipAddress: {
      type: String,
   
    },
    logoutTime: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
  }
);

const Session = mongoose.model('Session', sessionSchema);
module.exports = Session;
