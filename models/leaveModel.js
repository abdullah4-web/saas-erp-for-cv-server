const mongoose = require("mongoose");

const leaveSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    leave_type: { type: String, required: true },
    emp_code: { type: String },
    employee_id: { type: String },
    start_date: { type: Date, required: true },
    end_date: { type: Date, required: true }, 
    reason: { type: String },
    status: { type: String, enum: ["Pending", "Approved", "Rejected"], default: "Pending" },
    manager_approval_status: { type: String, enum: ["Pending", "Approved", "Rejected"], default: "Pending" },
    hr_approval_status: { type: String, enum: ["Pending", "Approved", "Rejected"], default: "Pending" },
    manager_approved_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    hr_approved_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    approved: { type: Boolean, default: false },
    approved_date: { type: Date },
    approved_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    pay_option: { type: String, default: "Paid" },
    duration: { type: Number },
    files: [
        {
            filename: { type: String },      
            url: { type: String, required: true }, 
            mimetype: { type: String },        
            uploadedAt: { type: Date, default: Date.now }
        }
    ]
}, { timestamps: true });

module.exports = mongoose.model("Leave", leaveSchema);
