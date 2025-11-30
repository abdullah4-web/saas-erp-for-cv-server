// models/leadModel.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const multiTenant = require('../lib/multiTenantPlugin');

const leadSchema = new Schema(
  {
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    client: { type: Schema.Types.ObjectId, ref: 'Client' },
    created_by: { type: Schema.Types.ObjectId, ref: 'User' },

    // Optional references
    ref_created_by: { type: Schema.Types.ObjectId, ref: 'User', required: false, default: null },
    ref_other_user: { type: Schema.Types.ObjectId, ref: 'User', required: false, default: null },
    thirdpartyname: { type: Schema.Types.ObjectId, ref: 'User', required: false, default: null },
    rejected_by: { type: Schema.Types.ObjectId, ref: 'User', required: false, default: null },

    selected_users: [{ type: Schema.Types.ObjectId, ref: 'User' }],

    pipeline_id: { type: Schema.Types.ObjectId, ref: 'Pipeline' },
    product_stage: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductStage' },

    lead_type: { type: Schema.Types.ObjectId, ref: 'LeadType', required: true },
    source: { type: Schema.Types.ObjectId, ref: 'Source', required: true },
    products: { type: Schema.Types.ObjectId, ref: 'Product', required: true },

    notes: { type: String },
    company_Name: { type: String },
    description: { type: String },

    activity_logs: [{ type: Schema.Types.ObjectId, ref: 'ActivityLog' }],
    discussions: [{ type: Schema.Types.ObjectId, ref: 'LeadDiscussion' }],
    files: [{ type: Schema.Types.ObjectId, ref: 'File' }],
    labels: [{ type: Schema.Types.ObjectId, ref: 'Label' }],
    messages: [{ type: mongoose.Schema.Types.ObjectId, ref: 'WhatsAppMessage' }],
    phonebookcomments: [{ type: Schema.Types.ObjectId, ref: 'Comment' }],

    order: { type: String },
    deal_stage: { type: String },
    reject_reason: { type: String },

    branch: { type: Schema.Types.ObjectId, ref: 'Branch' },

    // Status flags
    is_active: { type: Boolean, default: true },
    is_converted: { type: Boolean, default: false },
    is_reject: { type: Boolean, default: false },
    is_transfer: { type: Boolean, default: false },
    is_move: { type: Boolean, default: false },
    notify_user: { type: Boolean, default: false },
    delstatus: { type: Boolean, default: false },

    transfer_from: {
      pipeline: { type: Schema.Types.ObjectId, ref: 'Pipeline' },
      branch: { type: Schema.Types.ObjectId, ref: 'Branch' },
      product_stage: { type: Schema.Types.ObjectId, ref: 'ProductStage' },
      products: { type: Schema.Types.ObjectId, ref: 'Product' },
    },
  },
  { timestamps: true }
);

// 🔹 Example index (you can adjust depending on actual requirements)
leadSchema.index({ company: 1, stage: 1 });

leadSchema.plugin(multiTenant);

module.exports = mongoose.model('Lead', leadSchema);
