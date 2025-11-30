const mongoose = require('mongoose');
const { Schema } = mongoose;
const multiTenant = require("../lib/multiTenantPlugin");

const dealSchema = new Schema({
    is_converted: {
        type: Boolean,
        default: false
    },
    is_reject: {
        type: Boolean,
        default: false
    },
    reject_reason: {
        type: String
    },
    client_id: {
        type: Schema.Types.ObjectId,
        ref: 'Client',
        required: true
    },
    lead_type: {
        type: Schema.Types.ObjectId,
        ref: 'LeadType',
        required: true
    },
    pipeline_id: {
        type: Schema.Types.ObjectId,
        ref: 'Pipeline',
        required: true
    },

    source_id: {
        type: Schema.Types.ObjectId,
        ref: 'Source',
        required: true
    },
    products: {
        type: Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },

    deal_stage: {
        type: Schema.Types.ObjectId,
        ref: 'DealStage',
        // required: true
    },
    labels: [{
        type: String, // Changed to String
        default: null
    }],

    created_by: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    lead_id: {
        type: Schema.Types.ObjectId,
        ref: 'Lead',

    },
    contract_id: {
        type: Schema.Types.ObjectId,
        ref: 'Contract',

    },
    selected_users: [{
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }],

    is_report_generated_approved: {
        type: Boolean,
        default: false
    },
    is_report_generated: {
        type: Boolean,
        default: false
    },
    service_commission_id: {
        type: Schema.Types.ObjectId,
        ref: 'ServiceCommission',

    },
    deal_activity_logs: [{
        type: Schema.Types.ObjectId,
        ref: 'DealActivityLog'
    }],
    branch: {
        type: Schema.Types.ObjectId,
        ref: 'Branch',
        required: true
    },
    created_at: {
        type: Date,
        default: Date.now
    },
    updated_at: {
        type: Date,
        default: Date.now
    },

    delstatus: { type: Boolean, default: false },
    company: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },

});

// Removed the unique index that included 'name' since we're removing the name field
// Now company can have multiple deals without name constraints
dealSchema.index({ company: 1 });

dealSchema.plugin(multiTenant);

module.exports = mongoose.model("Deal", dealSchema);