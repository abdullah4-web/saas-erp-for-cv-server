const mongoose = require('mongoose');

const leadFetchConfigSchema = new mongoose.Schema({
    name: { type: String }, // Removed required: true
    formId: { type: String }, // Removed required: true
    accessToken: { type: String }, // Removed required: true
    created_by: { type: mongoose.Types.ObjectId, ref: 'User'},
    pipeline_id: { type: mongoose.Types.ObjectId }, // Removed required: true
    lead_type: { type: mongoose.Types.ObjectId }, // Removed required: true
    source: { type: mongoose.Types.ObjectId }, // Removed required: true
    product_stage: { type: mongoose.Types.ObjectId }, // Removed required: true
    products: { type: mongoose.Types.ObjectId }, // Removed required: true
    branch: { type: mongoose.Types.ObjectId }, // Removed required: true
    notificationEmails: [{ type: String }], // Removed required: true
}, { timestamps: true });

module.exports = mongoose.model('LeadFetchConfig', leadFetchConfigSchema);
