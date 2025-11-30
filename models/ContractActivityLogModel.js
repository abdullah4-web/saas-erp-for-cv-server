const mongoose = require('mongoose');
const { Schema } = mongoose;

// Define the schema for ContractActivityLog
const contractActivityLogSchema = new Schema({
    user_id: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    contract_id: {
        type: Schema.Types.ObjectId,
        ref: 'Contract',
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
const ContractActivityLog = mongoose.model('ContractActivityLog', contractActivityLogSchema);
module.exports = ContractActivityLog;
