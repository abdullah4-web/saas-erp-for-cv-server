const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const salarySchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    basicSalary: {
        type: Number,
        required: true,
    },
    otherAllowances: {
        type: Number,
        default: 0,
    }, 
    totalSalary: {
        type: Number,
        required: true,
    },
    files: [
        {
            filename: { type: String },
            url: { type: String, required: true },
            mimetype: { type: String },
            uploadedAt: { type: Date, default: Date.now },
        },
    ],
    
    salaryActivityLog: [
       {type: Schema.Types.ObjectId, ref: 'SalaryActivityLog'} 
    ],

    salaryHistory: [
        {
            basicSalary: Number,
            otherAllowances: Number,
            totalSalary: Number,
            fromDate: {
                type: Date,
                required: true,
            },
            toDate: {
                type: Date,
            },
        },
    ],
}, {
    timestamps: true,
});

module.exports = mongoose.model('Salary', salarySchema);
