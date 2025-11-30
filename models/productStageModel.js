// models/productStageModel.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const multiTenant = require('../lib/multiTenantPlugin');

const productStageSchema = new Schema(
  {
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },

    name: {
      type: String,
      required: true,
      trim: true,
    },
    product_id: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    order: {
      type: Number,
      required: true,
    },
    delstatus: {
      type: Boolean,
      default: false, // false means not deleted
    },
  },
  { timestamps: true }
);

// 🔹 Add index for faster queries (optional, adjust as needed)
productStageSchema.index({ company: 1, product_id: 1, order: 1 });

// 🔹 Multi-tenant plugin (same as Lead)
productStageSchema.plugin(multiTenant);

const ProductStage = mongoose.model('ProductStage', productStageSchema);
module.exports = ProductStage;
