const mongoose = require('mongoose');
const { Schema } = mongoose;
const multiTenant = require("../lib/multiTenantPlugin");

const contractSchema = new Schema({
    title: {
        type: String,
        trim: true, // optional
    },
    is_reject: {
        type: Boolean,
        default: false
    },
    reject_reason: {
        type: String
    },
    is_converted: {
        type: Boolean,
        default: false
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
    branch: {
        type: Schema.Types.ObjectId,
        ref: 'Branch',
        required: true
    },
    contract_stage: {
        type: Schema.Types.ObjectId,
        ref: 'ContractStage',
        required: true
    },
    labels: [{
        type: String,
        default: null
    }],
    status: {
        type: String,
        enum: ['Active', 'Inactive'],
        required: true
    },
    created_by: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    lead_id: {
        type: Schema.Types.ObjectId,
        ref: 'Lead',
    },
    selected_users: [{
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }],
    is_active: {
        type: Boolean,
        default: false
    },
    service_commission_id: {
        type: Schema.Types.ObjectId,
        ref: 'ServiceCommission',
    },
    contract_activity_logs: [{
        type: Schema.Types.ObjectId,
        ref: 'ContractActivityLog'
    }],
    //////////////////////////  new fields  //////////////////////////
    loan_type: { type: String },
    building_type: { type: String },
    plot_no: { type: String },
    sector: { type: String },
    emirate: { type: String },

    created_at: {
        type: Date,
        default: Date.now
    },
    updated_at: {
        type: Date,
        default: Date.now
    },
    delstatus: {
        type: Boolean,
        default: false
    },
    company: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: "Company", 
        required: true, 
        index: true 
    },

}, {
    timestamps: true
});

// Middleware to update `updated_at`
contractSchema.pre('save', function(next) {
    if (this.isModified()) {
        this.updated_at = Date.now();
    }
    next();
});

// Partial unique index to avoid duplicate key errors for null titles
contractSchema.index(
    { company: 1, title: 1 },
    { unique: true, partialFilterExpression: { title: { $type: "string" } } }
);

contractSchema.plugin(multiTenant);

module.exports = mongoose.model("Contract", contractSchema);
