const mongoose = require('mongoose');
const { Schema } = mongoose;

// Define the LeadActivityLog schema
const leadActivityLogSchema = new Schema({
    user_id: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    lead_id: {
        type: Schema.Types.ObjectId,
        ref: 'Lead',
        required: true 
    },
    log_type: {
        type: String, 
        required: true
    },
    remark: {
        type: String,
        required: true
    },
    created_at: {
        type: Date,
        default: Date.now,
        required: true
    },
    updated_at: {
        type: Date,
        default: Date.now,
        required: true
    }
}, { timestamps: true });

// Create the model
const LeadActivityLog = mongoose.model('LeadActivityLog', leadActivityLogSchema);

module.exports = LeadActivityLog;
