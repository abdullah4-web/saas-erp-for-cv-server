// phonebookwhatsup.js
const express = require('express');
const router = express.Router();
const twilio = require('twilio');
const { isAuth } = require('../utils');

// Twilio credentials (provided by you)
const accountSid = 'AC9f10e22cf1b500ee219526db55a7c523';  // Twilio Account SID
const authToken = 'd23214875886a2ce7c3412863d5fe541';     // Twilio Auth Token
const fromWhatsAppNumber = 'whatsapp:+14155238886';        // Twilio WhatsApp number

// Initialize Twilio client
const client = twilio(accountSid, authToken);

// POST route to send WhatsApp message
router.post('/send-message', isAuth, async (req, res) => {
  const { to } = req.body;
    const number = req.user.phone; 
  // Check if 'to' and 'number' are provided
  if (!to ) {
    return res.status(400).json({ error: 'Recipient phone number and contact number are required.' });
  }

  // Create the custom message template
  const customMessage = `I have been trying to call you regarding your liabilities. If you're interested, please call me back on ${number}.`;

  try {
    // Send WhatsApp message via Twilio
    const response = await client.messages.create({
      body: customMessage,              // Use the custom message
      from: fromWhatsAppNumber,         // Twilio WhatsApp number
      to: `whatsapp:${to}`              // Recipient WhatsApp number
    });
    res.status(200).json({ success: true, messageSid: response.sid });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
