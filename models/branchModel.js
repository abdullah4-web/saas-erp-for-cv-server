// models/branchModel.js
const mongoose = require('mongoose');
const multiTenant = require('../lib/multiTenantPlugin');
const Schema = mongoose.Schema;

const branchSchema = new Schema(
  {
    name: { type: String, required: true },
    created_by: { type: String },
    timestamp: { type: Date, default: Date.now },
    delstatus: { type: Boolean, default: false },
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  },
  { timestamps: true }
);

branchSchema.index({ company: 1, name: 1 }, { unique: true });
branchSchema.plugin(multiTenant);

module.exports = mongoose.model('Branch', branchSchema);
