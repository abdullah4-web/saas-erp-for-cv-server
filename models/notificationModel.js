const mongoose = require('mongoose');

// Define the notification schema
const notificationSchema = new mongoose.Schema({
    receiver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // Reference to the User model
        required: true,
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // Reference to the User model
        required: true,
    },
    message: {
        type: String,
        required: true,
    },
    // Polymorphic reference (can refer to Lead, Contract, or Deal)
    reference_id: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: 'notification_type', // Dynamically reference model based on notification_type
    },
    notification_type: {
        type: String,
        required: true,
        enum: ['Lead', 'Contract', 'Deal'], // Specify the possible model names
    },
    read: {
        type: Boolean,
        default: false,
    },
    created_at: {
        type: Date,
        default: Date.now,
    },
    updated_at: {
        type: Date,
        default: Date.now,
    },
});

// Create the Notification model
const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
