// models/leadStageModel.js

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Define the LeadStage Schema
const leadStageSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  // pipeline_id: {
  //   type: String,
  //   required: true,
  // },
  pipeline_id: { type: Schema.Types.ObjectId, ref: 'Pipeline', required: true },

  created_by: {
    type: String,
  },

  order: {
    type: Number,
    required: true,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  updated_at: {
    type: Date,
    default: Date.now,
  },
  delstatus: { type: Boolean, default: false },

});

// Pre-save hook to update `updated_at` field before saving
leadStageSchema.pre('save', function (next) {
  this.updated_at = Date.now();
  next();
});

// Create and export the LeadStage model
const LeadStage = mongoose.model('LeadStage', leadStageSchema);
module.exports = LeadStage;
