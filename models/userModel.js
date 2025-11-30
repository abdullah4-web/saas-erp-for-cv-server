const mongoose = require('mongoose');
const multiTenant = require('../lib/multiTenantPlugin');
const bcrypt = require('bcrypt');
const userSchema = new mongoose.Schema(
  {
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    name: { type: String, required: true },
    pipeline: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Pipeline', required: false }],
    email: { type: String, required: true, unique: true },
    password: { type: String, default: null },
    image: { type: String },
    role: { type: String, required: true },
    branch: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: false }],
    phone: { type: String },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: false },
    subcompany: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: false },
    emp_code: { type: String },
    employee_id: { type: String },
    office: { type: String },
    type: { type: String },
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: false }],
    shifts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Shift', required: false }],
    areas: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Area', required: false }],
    permissions: [{ type: String }],
    isBlocked: { type: Boolean, default: false },
    verified: { type: Boolean, default: false },
    bio_times_id: { type: Number, required: false },
    delstatus: { type: Boolean, default: false },
    hire_date: { type: String },
    first_name: { type: String },
    last_name: { type: String },
    gender: { type: String },
    national: { type: mongoose.Schema.Types.ObjectId, ref: 'Country', required: false },
    address: { type: String },
    status: { type: String, enum: ['Active', 'Unactive'], default: 'Active' },
    // Passport info
    passport_number: { type: String },
    passport_expiry: { type: Date },
    // Emirates ID info
    emirates_id_number: { type: String },
    emirates_id_expiry: { type: Date },
    // Labour card info
    labour_card_number: { type: String },
    labour_card_expiry: { type: Date },
    labour_card_status: { type: String, enum: ['Active', 'Unactive'], default: 'Unactive' },
    //NOC info
    noc_letter_number: { type: String },
    noc_letter_expiry: { type: Date },
    /// Contract info
    contract_start_date: { type: Date },
    contract_end_date: { type: Date },
    ////  Files
    passport_files: [String],
    emirates_id_files: [String],
    labour_card_files: [String],
    noc_letter_files: [String],
    contract_files: [String],
    /// Resigation info
    resignation_date: { type: Date },
    resignation_reason: { type: String },
    resignation_file: { type: String },
    resignation_type: { type: String },
    resigned: { type: Boolean, default: false },
    // Other info
    city: { type: String },
    position: { type: mongoose.Schema.Types.ObjectId, ref: 'Position', required: false },
    emergency_contact_name: { type: String },
    emergency_contact_number: { type: String },
    emergency_contact_relation: { type: String },
    eligible_commission: { type: Boolean, default: true },
    ////

  },
  {
    timestamps: true,
  }
);

userSchema.index({ company: 1, email: 1 }, { unique: true });

userSchema.pre('save', async function(next) {
  if (this.isModified('password')) this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.plugin(multiTenant);

module.exports = mongoose.model('User', userSchema);
