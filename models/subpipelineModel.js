const mongoose = require('mongoose');

// Define the SubPipeline Schema
const subPipelineSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  pipeline: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Pipeline',  
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
subPipelineSchema.pre('save', function(next) {
  this.updated_at = Date.now();
  next();
});

// Create and export the SubPipeline model
const SubPipeline = mongoose.model('SubPipeline', subPipelineSchema);
module.exports = SubPipeline;
