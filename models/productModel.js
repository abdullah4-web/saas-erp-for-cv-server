const mongoose = require('mongoose');
const multiTenant = require('../lib/multiTenantPlugin');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['Active', 'UnActive'],
    default: 'Active',
  },
  delStatus: {
    type: Boolean,
    default: false,
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true,
  },
  branches: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
    },
  ],
}, {
  timestamps: true,
});

// Unique compound index to prevent duplicate product names per company
productSchema.index({ company: 1, name: 1 }, { unique: true });

productSchema.plugin(multiTenant);

module.exports = mongoose.model('Product', productSchema);
