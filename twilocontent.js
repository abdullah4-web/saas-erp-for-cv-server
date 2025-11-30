const twilio = require('twilio');

const accountSid = "AC5422ad69b453e53f15958313f847aa7d";
const authToken = "29b5b044d81a7b215decc24565456e4f";   // Replace with your Twilio Auth Token

const client = new twilio(accountSid, authToken);

async function createMessage() {
    try {
      const message = await client.messages.create({
        contentSid: "HX53ac8c980b8983ac93ee46d81f2c15a9", // Your approved Content Template SID
        contentVariables: JSON.stringify({ 1: "Name" }),
        from: "whatsapp:+971507549065", // Your Twilio WhatsApp number
        to: "whatsapp:+971503857713", // Recipient's WhatsApp number
        messagingServiceSid: "MGbb04e47ef10d5ded6830180abba3e0eb",
      });
  
      console.log("Message sent successfully:", message.sid);
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  }
  
  createMessage();
