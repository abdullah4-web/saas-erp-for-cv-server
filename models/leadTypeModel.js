// models/leadTypeModel.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const multiTenant = require('../lib/multiTenantPlugin');

const leadTypeSchema = new Schema(
  {
    company: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Company', 
      required: true, 
      index: true 
    },

    name: { 
      type: String, 
      required: true, 
      trim: true 
    },

    created_by: { 
      type: Schema.Types.ObjectId, 
      ref: 'User', 
      required: false 
    },

    delstatus: { 
      type: Boolean, 
      default: false 
    }
  },
  { timestamps: true }
);

// 🔹 Add index for faster queries (company + name unique)
leadTypeSchema.index({ company: 1, name: 1 }, { unique: true });

// 🔹 Multi-tenant plugin (same as Source)
leadTypeSchema.plugin(multiTenant);

const LeadType = mongoose.model('LeadType', leadTypeSchema);
module.exports = LeadType;
