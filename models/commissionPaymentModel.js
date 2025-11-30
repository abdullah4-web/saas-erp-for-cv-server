const mongoose = require('mongoose');

const commissionPaymentSchema = new mongoose.Schema(
    {
        dealId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Deal',
            required: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        paidCommission: {
            type: Number, 
        },
        remainingCommission: {
            type: Number,
            required: true,
        },
        totalCommission: {
            type: Number,
            required: true,
        },
        paymentMethod: {
            type: String,
        },
    },
    {
        timestamps: true, 
    }
);

const CommissionPayment = mongoose.model('CommissionPayment', commissionPaymentSchema);
module.exports = CommissionPayment;
