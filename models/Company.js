// /models/Company.js
const mongoose = require('mongoose');

const companySchema = new mongoose.Schema({
    name: { type: String, required: true },
    subdomain: { type: String, unique: true, sparse: true }, // if you use subdomain routing
    emailDomain: { type: String },
    plan: { type: String, enum: ['free', 'pro', 'enterprise'], default: 'free' },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    logo: { type: String },
    settings: { type: mongoose.Schema.Types.Mixed },
    primaryColor: { type: String },
    secondaryColor: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('Company', companySchema);
