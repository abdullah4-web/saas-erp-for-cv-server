const express = require('express');
const router = express.Router();
const Notification = require('../models/notificationModel'); // Assuming this is the correct path to your model

// Route to mark a notification as read
router.put('/mark-as-read/:id', async (req, res) => {
    const notificationId = req.params.id;

    try {
        // Find the notification by ID and update the 'read' field to true
        const notification = await Notification.findByIdAndUpdate(
            notificationId,
            { read: true, updated_at: Date.now() },
            { new: true } // This option returns the updated document
        );

        if (!notification) {
            return res.status(404).json({ message: 'Notification not found' });
        }

        return res.status(200).json({ message: 'Notification marked as read', notification });
    } catch (error) {
        console.error('Error marking notification as read:', error);
        return res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
