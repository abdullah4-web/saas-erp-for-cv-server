// /models/Role.js
const mongoose = require('mongoose');
const multiTenant = require('../lib/multiTenantPlugin');

const roleSchema = new mongoose.Schema({
  name: { type: String, required: true },
  permissions: [{ type: String, required: true }],
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true }
}, { timestamps: true });

roleSchema.index({ company: 1, name: 1 }, { unique: true });
roleSchema.plugin(multiTenant);

module.exports = mongoose.model('Role', roleSchema);
