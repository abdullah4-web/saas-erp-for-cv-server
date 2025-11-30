const mongoose = require('mongoose');
const { Schema } = mongoose;

const commissionEntrySchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  commission_percentage: {
    type: Number,
    default: 0
  },
  commission_amount: {
    type: Number,
    default: 0
  }
}, { _id: false });

const serviceCommissionSchema = new Schema({
  contract_id: {
    type: Schema.Types.ObjectId,
    ref: 'Contract',
    required: false
  },
  finance_amount: Number,
  bank_commission: Number,
  customer_commission: Number,
  with_vat_commission: Number,
  without_vat_commission: Number,
  commissions: [commissionEntrySchema],
  delstatus: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
});

// 🔹 Add or update commission (safe against duplicates)
serviceCommissionSchema.methods.addOrUpdateCommission = function (userId, percentage, amount) {
  const commission = this.commissions.find(
    comm => comm.user.toString() === userId.toString()
  );

  if (commission) {
    commission.commission_percentage = percentage;
    commission.commission_amount = amount;
  } else {
    this.commissions.push({
      user: userId,
      commission_percentage: percentage,
      commission_amount: amount
    });
  }
  return this;
};

// 🔹 Remove commission
serviceCommissionSchema.methods.removeCommission = function (userId) {
  this.commissions = this.commissions.filter(
    commission => commission.user.toString() !== userId.toString()
  );
  return this;
};

// 🔹 Get commission for a user
serviceCommissionSchema.methods.getCommissionByUser = function (userId) {
  return this.commissions.find(
    commission => commission.user.toString() === userId.toString()
  );
};

// 🔹 Virtual for total commission
serviceCommissionSchema.virtual('total_commission_amount').get(function () {
  return (this.commissions || []).reduce(
    (total, commission) => total + (commission.commission_amount || 0),
    0
  );
});

// Ensure virtuals appear in JSON
serviceCommissionSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('ServiceCommission', serviceCommissionSchema);
