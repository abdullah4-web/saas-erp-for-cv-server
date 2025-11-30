const mongoose = require('mongoose');
 
const whatsAppMessageSchema = new mongoose.Schema({
    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
    phonenumber: { type: mongoose.Schema.Types.ObjectId, ref: 'Phonebook' },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Optional, for messages from users
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' }, // Client sending or receiving the message
    message_body: { type: String, required: true },
    from: { type: String, required: true }, // Sender's number
    to: { type: String, required: true },   // Receiver's number
    status: { type: String, },
    error_code: { type: String, },
    read: { type: Boolean, default: false },  // New field for read status 
    twilio_message_sid: { type: String },   // Twilio message ID for tracking
    media_urls: [{ type: String }], // Array to store media URLs
    createdAt: { type: Date, default: Date.now }
});
 
module.exports = mongoose.model('WhatsAppMessage', whatsAppMessageSchema);
 