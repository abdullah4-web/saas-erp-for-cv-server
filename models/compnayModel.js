const mongoose = require('mongoose');
const multiTenant = require('../lib/multiTenantPlugin');

const subCompanySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  licenseType: {
    type: String,
    trim: true
  },
  licenseCategory: {
    type: String,
    trim: true
  },
  economicLicenseNumber: {
    type: String,
    trim: true
  },
  unifiedRegistrationNo: {
    type: String,
    trim: true
  },
  establishmentDate: {
    type: Date
  },
  issuanceDate: {
    type: Date
  },
  expireDate: {
    type: Date
  },
  tradeName: {
    type: String,
    trim: true
  },
  address: {
    type: String,
    trim: true
  },
  files: [
    {
      filename: { type: String },
      url: { type: String, required: true },
      mimetype: { type: String },
      uploadedAt: { type: Date, default: Date.now }
    }
  ],
  logo: {
    filename: { type: String },
    url: { type: String, required: true },
    mimetype: { type: String },
    uploadedAt: { type: Date, default: Date.now }
  },
  // Added company field
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true
  },
  // Added status field similar to product model
  status: {
    type: String,
    enum: ['Active', 'UnActive'],
    default: 'Active'
  },
  // Added delStatus field similar to product model
  delStatus: {
    type: Boolean,
    default: false
  },

}, { 
  timestamps: true 
});

// Optional: Add unique compound index for name per company if needed
// subCompanySchema.index({ company: 1, name: 1 }, { unique: true });

// Apply the multi-tenant plugin
subCompanySchema.plugin(multiTenant);

const SubCompany = mongoose.model('SubCompany', subCompanySchema);

module.exports = SubCompany;