const mongoose = require('mongoose');
if (mongoose.models.Payroll) {
  delete mongoose.models.Payroll;
}
const payrollSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  month: {
    type: String,
    required: true,
    match: [/^\d{4}-\d{2}$/, 'Use YYYY-MM format']
  },
  salaryReference: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Salary',
    required: true
  },
  bonuses: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Bounce',
    default: []
  }],
  penalties: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Penalty',
    default: []
  }],
  leaves: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Leave',
    default: []
  }],
  attendances: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Attendance',
    default: []
  }],
  absences: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Attendance',
    default: []
  }],
  absences_amount: {
    type: Number,
    default: 0,
    min: 0
  },
  totalBonuses: {
    type: Number,
    default: 0,
    min: 0
  },
  totalDeductions: {
    type: Number,
    default: 0,
    min: 0
  },
  netPayable: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ['Pending Approval', 'Approved', 'Paid', 'Rejected'],
    default: 'Pending Approval'
  },
  paymentMethod: {
    type: String,
    enum: ['Bank Transfer', 'Cash', 'Check', 'Digital Wallet', 'Other']
  },
  paymentReference: {
    type: String,
    trim: true
  },
  paymentDate: {
    type: Date
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approved: {
    type: Boolean,
    default: false
  },
  paid: {
    type: Boolean,
    default: false
  },
  approvedAt: {
    type: Date
  },
  paymentDate: {
    type: Date
  },
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  processedAt: {
    type: Date
  },
  paidBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  rejectionReason: {
    type: String,
    trim: true,
    maxlength: 500
  },
  advancePayment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AdvancePayment',
    default: null
  },

  advancePaymentDeducted: {
  type: Number,
  default: 0
}
}, {
  timestamps: true
});
const Payroll = mongoose.model('Payroll', payrollSchema);
module.exports = Payroll;
