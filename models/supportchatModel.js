const mongoose = require('mongoose');

const supportChatSchema = new mongoose.Schema({
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User',
  },
  receiverId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true, 
    ref: 'User',
  },
  message: {
    type: String,
  },
  mediaUrls: {
    type: [String], 
    default: [],
  },
  isread: {
    type: Boolean,
    default: false,
  },
}, { timestamps: true });

module.exports = mongoose.model('SupportChat', supportChatSchema);
