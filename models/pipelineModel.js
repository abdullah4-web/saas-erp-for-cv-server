const mongoose = require('mongoose');
const multiTenant = require('../lib/multiTenantPlugin'); // make sure this exists

// Define the Pipeline Schema
const pipelineSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      // required: true,
    },
    delstatus: { 
      type: Boolean, 
      default: false 
    },
    company: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Company', 
      required: true, 
      index: true 
    },
  },
  { timestamps: true } // automatically adds createdAt & updatedAt
);

pipelineSchema.index({ company: 1, name: 1 }, { unique: true });
pipelineSchema.plugin(multiTenant);

module.exports = mongoose.model('Pipeline', pipelineSchema);
