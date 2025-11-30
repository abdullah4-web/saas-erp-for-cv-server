// models/sourceModel.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const multiTenant = require('../lib/multiTenantPlugin');

const sourceSchema = new Schema(
  {
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },

    name: {
      type: String,
      required: true,
      trim: true,
    },
    lead_type_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LeadType', // Reference to the LeadType model
      required: true,
    },
    created_by: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
    delstatus: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// 🔹 Add index for faster queries (optional, adjust as needed)
sourceSchema.index({ company: 1, lead_type_id: 1, name: 1 }, { unique: true });

// 🔹 Multi-tenant plugin (same as Lead & ProductStage)
sourceSchema.plugin(multiTenant);

const Source = mongoose.model('Source', sourceSchema);
module.exports = Source;
