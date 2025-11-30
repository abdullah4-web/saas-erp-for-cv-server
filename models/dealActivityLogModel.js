const mongoose = require('mongoose');
const { Schema } = mongoose;

// Define the schema for DealActivityLog
const dealActivityLogSchema = new Schema({
    user_id: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    deal_id: { 
        type: Schema.Types.ObjectId,
        ref: 'Deal',
        required: true
    },
    log_type: {
        type: String, 
        required: true
    },
    remark: {
        type: String,
        default: ''
    },
    created_at: {
        type: Date,
        default: Date.now
    },
    updated_at: {
        type: Date,
        default: Date.now
    }
});

// Create and export the model
const DealActivityLog = mongoose.model('DealActivityLog', dealActivityLogSchema);
module.exports = DealActivityLog;
