const mongoose = require('mongoose');

const salaryActivitySchema = new mongoose.Schema({
    salary: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Salary',
        required: true,
    },
    action: {
        type: String,
        enum: ['created', 'updated', 'adjusted'],
        required: true,
    },
    performedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    performedAt: {
        type: Date,
        default: Date.now,
    },
    details: {
        type: String, // optional field to store extra info
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('SalaryActivityLog', salaryActivitySchema);
