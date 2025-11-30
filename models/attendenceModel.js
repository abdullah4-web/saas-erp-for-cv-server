const mongoose = require("mongoose");

const AttendanceSchema = new mongoose.Schema(
    {
        transaction_id: { type: String },  // Matches "transaction_id" field from API
        emp_id: { type: Number, },  // Matches "emp" field from API
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        shift: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift' },
        emp_code: { type: String, },
        first_name: { type: String },
        department: { type: String },
        position: { type: String },
        punch_time: { type: String, },
        punch_state_display: { type: String },
        verify_type: { type: String },
        terminal_alias: { type: String },
        status: { type: String },
        checkstatus: { type: String, },
        upload_time: { type: Date },
        Date: { type: Date },
        check_in_time: { type: String },
        check_out_time: { type: String },
        check_in_status: { type: String },  
        check_out_status: { type: String }, 
        update_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' , required: false },
        process_status: { type: Boolean, default: false }, // Fixed line
    },
    { timestamps: true } 
);

module.exports = mongoose.model("Attendance", AttendanceSchema);
