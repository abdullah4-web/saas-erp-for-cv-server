const mongoose = require('mongoose');
const multiTenant = require('../lib/multiTenantPlugin'); // optional, if you use multi-tenancy

const dealStageSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true, // helps queries per company
  },
  order: {
    type: String,
    default: '0',
    required: true,
  },
  delStatus: {
    type: Boolean,
    default: false,
  },
  created_at: {
    type: Date,
    default: Date.now,
    required: true,
  },
  updated_at: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true, // automatically manages createdAt and updatedAt
});

// Middleware to automatically update `updated_at`
dealStageSchema.pre('save', function(next) {
  this.updated_at = new Date();
  next();
});

// Optional: prevent duplicate stage names per company
dealStageSchema.index({ company: 1, name: 1 }, { unique: true });

// Add multi-tenant plugin if your app supports it
dealStageSchema.plugin(multiTenant);

const DealStage = mongoose.model('DealStage', dealStageSchema);

module.exports = DealStage;
