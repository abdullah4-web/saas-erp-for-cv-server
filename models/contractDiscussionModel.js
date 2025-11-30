const mongoose = require('mongoose');

const contractDiscussionSchema = new mongoose.Schema({
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  comment: { type: String, required: true },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
  delstatus: { type: Boolean, default: false },
});

module.exports = mongoose.model('ContractDiscussion', contractDiscussionSchema);
 