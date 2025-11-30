const express = require('express');
const router = express.Router();
const twilio = require('twilio');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const WhatsAppMessage = require('../models/whatsAppMessageModel');
const Lead = require('../models/leadModel');
const Client = require('../models/clientModel');
const File = require('../models/fileModel'); // Import the File model
const { isAuth } = require('../utils');
const { getMedia } = require('../twilioUtils');
const accountSid = "AC5422ad69b453e53f15958313f847aa7d";
const authToken = "29b5b044d81a7b215decc24565456e4f";
const mongoose = require('mongoose');
const moment = require('moment');
// Twilio Configuration  whatsapp:+971507549065
const fromWhatsAppNumber = ""; // Your Twilio WhatsApp Number

const client = twilio(accountSid, authToken);
const url = require('url'); // Add this
const http = require('http'); // Add this
const https = require('https'); // Add this
const mime = require('mime-types');
const activityLogModel = require('../models/activityLogModel');
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, '../lead_files');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const randomHexName = crypto.randomBytes(16).toString('hex'); // Random hex for saving
        const ext = path.extname(file.originalname); // Keep the original extension
        cb(null, `${randomHexName}${ext}`); // Save as random hex + original extension
    }
});


const upload = multer({ storage });

async function getFinalUrl(urlString) {
    return new Promise((resolve, reject) => {
        try {
            const parsedUrl = url.parse(decodeURIComponent(urlString));
            const protocol = parsedUrl.protocol === 'https:' ? https : http;

            const req = protocol.get(parsedUrl, (res) => {
                // Follow redirects
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    // Call the function again with the new location (redirected URL)
                    return getFinalUrl(res.headers.location).then(resolve).catch(reject);
                }

                // If no redirect, resolve the original URL
                resolve(urlString);
            });

            req.on('error', (err) => {
                reject(`Error fetching the URL: ${err.message}`);
            });
        } catch (error) {
            reject(`Error processing the URL: ${error.message}`);
        }
    });
}

// Function to fetch the final URL and then get the correct file extension
async function getFileExtensionAndSave(mediaUrl, messageSid) {
    try {
        const finalUrl = await getFinalUrl(mediaUrl);
        const mediaSid = finalUrl.split('/').pop();
        const mediaData = await getMedia(messageSid, mediaSid);

        // Check if mediaData is valid and contains headers
        if (!mediaData || !mediaData.headers) {
            throw new Error('Invalid media data received from Twilio');
        }

        // Extract original filename from the Content-Disposition header
        const contentDisposition = mediaData.headers['content-disposition'];
        let originalFileName = null;

        if (contentDisposition) {
            const matches = contentDisposition.match(/filename="(.+?)"/);
            if (matches && matches[1]) {
                originalFileName = matches[1]; // Get the original file name
            }
        }

        if (!originalFileName) {
            originalFileName = `${mediaSid}.${mime.extension(mediaData.headers['content-type']) || 'bin'}`; // Fallback if no filename
        }

        const ext = path.extname(originalFileName);
        const randomHexName = crypto.randomBytes(16).toString('hex'); // Random hex name for saving
        const fileName = `${randomHexName}${ext}`;
        const filePath = path.join(__dirname, '../lead_files', fileName);

        // Save the media data to disk with random hex name
        fs.writeFileSync(filePath, mediaData.body);

        return {
            file_name: originalFileName, // Store the original file name in the database
            file_path: `/lead_files/${fileName}` // Use the random hex name for the file path
        };
    } catch (error) {
        console.error(`Failed to process media URL: ${mediaUrl}`, error);
        return null;
    }
}
const axios = require('axios');
const Phonebook = require('../models/phonebookModel');

async function isUrlAccessible(url) {
    try {
        const response = await axios.head(url);
        return response.status >= 200 && response.status < 400;
    } catch (error) {
        console.error(`Error checking URL accessibility: ${error.message}`);
        return false;
    }
}


// Export a function that takes the io instance 
module.exports = (io) => {
    -
        // Route to send a WhatsApp message
        router.post('/send-message', isAuth, upload.single('mediaFile'), async (req, res) => {
            const { leadId, messageBody, mediaUrl } = req.body;
            const userId = req.user._id;
            const forwardedBaseUrl = 'https://request-cold-screening-earned.trycloudflare.com'; // Use the forwarded URL
            let uploadedFileUrl = null;

            try {
                // Handle file upload
                if (req.file) {
                    const filePath = path.join('lead_files', req.file.filename);
                    uploadedFileUrl = `${forwardedBaseUrl}/${filePath}`; // Use the forwarded base URL

                    console.log(`Uploaded file path: ${filePath}`);
                    console.log(`Uploaded file URL: ${uploadedFileUrl}`);

                    // Debugging file URL properties
                    console.log('Final Uploaded File URL:', uploadedFileUrl);
                    const isAccessible = await isUrlAccessible(uploadedFileUrl); // Helper function
                    console.log('Twilio Media URL Check:', {
                        isHttp: uploadedFileUrl.startsWith('http'),
                        isAccessible,
                    });

                    // Save file metadata in the database
                    const newFile = new File({
                        added_by: userId,
                        file_name: req.file.originalname,
                        file_path: filePath,
                        created_at: new Date(),
                        updated_at: new Date(),
                    });

                    await newFile.save();
                }


                // Validate message content
                if (!messageBody && !mediaUrl && !uploadedFileUrl) {
                    return res.status(400).json({ error: 'A message body, media URL, or uploaded file is required' });
                }

                const lead = await Lead.findById(leadId).populate('client');
                if (!lead || !lead.client) {
                    return res.status(400).json({ error: 'Invalid lead or client' });
                }
                const statusCallbackUrl = "https://request-cold-screening-earned.trycloudflare.com/api/whatsup/message-status";
                const clientData = lead.client;
                const toWhatsAppNumber = `whatsapp:${clientData.phone}`;
                const messageOptions = {
                    from: fromWhatsAppNumber,
                    to: toWhatsAppNumber,
                    statusCallback: statusCallbackUrl,
                };

                if (messageBody) {
                    messageOptions.body = messageBody;
                }
                if (mediaUrl || uploadedFileUrl) {
                    messageOptions.mediaUrl = [mediaUrl || uploadedFileUrl];
                }

                const message = await client.messages.create(messageOptions);

                // Save WhatsApp message to the database
                const newMessage = new WhatsAppMessage({
                    lead: leadId,
                    client: clientData._id,
                    user: userId,
                    message_body: messageBody || 'Media message',
                    from: fromWhatsAppNumber,
                    to: clientData.phone,
                    status: 'N/A',
                    read: true,
                    twilio_message_sid: message.sid,
                    media_urls: mediaUrl ? [mediaUrl] : uploadedFileUrl ? [uploadedFileUrl] : [],
                });

                const savedMessage = await newMessage.save();

                // Update the lead with the new message
                lead.messages = lead.messages || [];
                lead.messages.push(savedMessage._id);
                await lead.save();

                // Emit the new message via Socket.IO
                io.to(`lead_${leadId}`).emit('new_message', savedMessage);

                res.status(200).json({ message: 'WhatsApp message sent successfully', messageId: savedMessage._id });
            } catch (error) {
                console.error('Error sending WhatsApp message:', error);
                res.status(500).json({ error: 'Failed to send WhatsApp message', details: error.message });
            }
        });

    router.post('/send-message-from-phonebook', isAuth, async (req, res) => {
        const { clientphone, messageBody } = req.body;
        const userId = req.user._id;

        try {
            let phoneBookEntry = await Phonebook.findOne({ number: clientphone });

            if (!phoneBookEntry) {
                return res.status(404).json({ error: "Phonebook entry not found for this number" });
            }

            ////whatsapp:+971503856371
            const fromWhatsAppNumberPh = ""; // From WhatsApp number
            const toWhatsAppNumber = `whatsapp:${clientphone}`;
            const statusCallbackUrl = "https://request-cold-screening-earned.trycloudflare.com/api/whatsup/message-status";

            const messageOptions = {
                from: fromWhatsAppNumberPh,
                to: toWhatsAppNumber,
                statusCallback: statusCallbackUrl,
            };

            if (messageBody) {
                messageOptions.body = messageBody;
            }

            const message = await client.messages.create(messageOptions);

            // Save WhatsApp message to the database
            const newMessage = new WhatsAppMessage({
                user: userId,
                message_body: messageBody,
                from: fromWhatsAppNumberPh,
                to: clientphone,
                status: 'pending', // Initially set as pending
                read: false,
                twilio_message_sid: message.sid,
            });

            const savedMessage = await newMessage.save();

            phoneBookEntry.messages = phoneBookEntry.messages || [];
            phoneBookEntry.messages.push(savedMessage._id);
            await phoneBookEntry.save();

            // Emit the new message via Socket.IO
            io.to(`phonebook_${phoneBookEntry._id}`).emit("new_message", savedMessage);

            res.status(200).json({
                message: "WhatsApp message sent successfully",
                messageId: savedMessage._id
            });

        } catch (error) {
            console.error('Error sending WhatsApp message:', error);
            res.status(500).json({ error: 'Failed to send WhatsApp message', details: error.message });
        }
    });
    router.post("/send-welcome-content", async (req, res) => {
        const { leadId, userId } = req.body;

        try {
            // Find the lead and populate client details
            const lead = await Lead.findById(leadId).populate("client");
            if (!lead || !lead.client) {
                return res.status(400).json({ error: "Invalid lead or client" });
            }
             // Initialize variables inside the route handler   whatsapp:+971507549065
             const fromWhatsAppNumber = ""; // From WhatsApp number
             const messagingServiceSid = "MG81af942ac1693e7ea87013b15520ca99"; // Messaging Service SID
             const contentSidservice = "HX9f343cd5d51e8d95e01e9ee4f0d68d38"; // Content SID service
            const clientData = lead.client;
            const toWhatsAppNumber = `whatsapp:${clientData.phone}`;

            // Send the content template message via Twilio
            const message = await client.messages.create({
                contentSid:contentSidservice,
                contentVariables: JSON.stringify({ 1: clientData.name || "Customer" }),
                from: fromWhatsAppNumber,
                to: toWhatsAppNumber,
                messagingServiceSid,
                statusCallback: 'https://request-cold-screening-earned.trycloudflare.com/api/whatsup/message-status',
            });

            const messageDetails = await client.messages(message.sid).fetch();
            const sentMessageBody = messageDetails.body;

            // Save the WhatsApp message in the database
            const newMessage = new WhatsAppMessage({
                lead: leadId,
                client: clientData._id,
                user: userId,
                message_body: sentMessageBody || `شكرًا لاهتمامك بمجموعة Jovera! 🙌 سيتواصل معك فريق المبيعات قريبًا لتقديم المساعدة. إذا كان لديك أي أسئلة، لا تتردد في طرحها. نتطلع لخدمتك! 😊

                        Thank you for your interest in Jovera Group! 🙌 Our sales team will reach out to assist you shortly. If you have any questions, feel free to ask. We look forward to serving you! 😊

                        يرجى اختيار الوقت المناسب للاتصال`,
                from: fromWhatsAppNumber,
                to: clientData.phone,
                status: "N/A",
                read: true,
                twilio_message_sid: message.sid,
                media_urls: [],
            });

            const savedMessage = await newMessage.save();

            // Update the lead with the new message
            lead.messages = lead.messages || [];
            lead.messages.push(savedMessage._id);
            await lead.save();

            // Emit the new message via Socket.IO
            io.to(`lead_${leadId}`).emit("new_message", savedMessage);

            res.status(200).json({ message: "WhatsApp content message sent successfully", messageId: savedMessage._id });
        } catch (error) {
            console.error("Error sending WhatsApp content message:", error);
            res.status(500).json({ error: "Failed to send WhatsApp message", details: error.message });
        }
    });

    router.post("/send-service-content", isAuth, async (req, res) => {
        const { clientphone } = req.body;
        const userId = req.user._id;
    
        try {
            // Find phonebook entry by phone number
            let phoneBookEntry = await Phonebook.findOne({ number: clientphone });
    
            if (!phoneBookEntry) {
                return res.status(404).json({ error: "Phonebook entry not found for this number" });
            }
    
            // Initialize variables inside the route handler   whatsapp:+971503856371
            const fromWhatsAppNumber = ""; // From WhatsApp number
            const messagingServiceSid = "MG90413b39cff8da4e06de2727632c52db"; // Messaging Service SID
            const contentSidservice = "HX9f649052bcbcdc7ec3e0293869c92564"; // Content SID service
    
            const toWhatsAppNumber = `whatsapp:${clientphone}`;
            const clientData = { name: "Customer" }; // Default client name if missing
    
            // Send WhatsApp message via Twilio
            const message = await client.messages.create({
                contentSid: contentSidservice,
                contentVariables: JSON.stringify({ 1: clientData.name }),
                from: fromWhatsAppNumber,
                to: toWhatsAppNumber,
                messagingServiceSid: messagingServiceSid,
                statusCallback: 'https://request-cold-screening-earned.trycloudflare.com/api/whatsup/message-status',
            });
    
            // Fetch message details from Twilio API
            const messageDetails = await client.messages(message.sid).fetch();
            const sentMessageBody = messageDetails.body;
    
            console.log(sentMessageBody, "sentMessageBody");
    
            // Save the WhatsApp message in the database
            const newMessage = new WhatsAppMessage({
                user: userId,
                message_body: sentMessageBody || `🌟 مرحبًا بكم في مجموعة جوفيرا! 🌟
    
                    نقدم لك حلولًا مالية مبتكرة مصممة خصيصًا لتحقيق أحلامك، بما في ذلك:
                    
                    🏡 تمويل المنازل – امتلك منزل أحلامك بسهولة مع خيارات تمويل مرنة ومريحة.
                    🏦 تمويل الأعمال والشركات – حلول مالية ذكية لدعم نمو أعمالك وتوسيع شركتك.
                    💰 القروض الشخصية – تمويل سريع وسهل لتلبية احتياجاتك الفورية بدون تعقيدات.
                    
                    تواصل معنا اليوم ودعنا نساعدك في تحقيق طموحاتك المالية!
                    `,
                from: fromWhatsAppNumber,
                to: toWhatsAppNumber,
                status: "N/A",
                read: true,
                twilio_message_sid: message.sid,
                media_urls: [],
                createdAt: new Date() // Set the exact current date and time
            });
    
            const savedMessage = await newMessage.save();
    
            // Add the new message ID to the phonebook entry
            phoneBookEntry.messages = phoneBookEntry.messages || [];
            phoneBookEntry.messages.push(savedMessage._id);
            await phoneBookEntry.save();
    
            // Emit the new message via Socket.IO
            io.to(`phonebook_${phoneBookEntry._id}`).emit("new_message", savedMessage);
    
            res.status(200).json({
                message: "WhatsApp content message sent successfully",
                messageId: savedMessage._id
            });
    
        } catch (error) {
            console.error("Error sending WhatsApp content message:", error);
            res.status(500).json({ error: "Failed to send WhatsApp message", details: error.message });
        }
    });
    

    // Webhook to receive incoming messages from WhatsApp
    router.post("/webhook", async (req, res) => {
        const { Body, From, To, MessageSid, MediaUrl0, MediaUrl1, MediaUrl2, MediaUrl3, MediaUrl4 } = req.body;

        try {
            const fromNumber = From.replace("whatsapp:", "");
            const toNumber = To.replace("whatsapp:", "");

            // Check if the sender is an existing client
            let clientData = await Client.findOne({ phone: fromNumber });

            let lead = null;

            if (clientData) {
                lead = await Lead.findOne({ client: clientData._id });
            } else {
                // If not found in Clients, check in Phonebook
                const phoneBookEntry = await Phonebook.findOne({ number: fromNumber });

                if (!phoneBookEntry) {
                    return res.status(404).json({ error: "Client or Phonebook entry not found" });
                }

                // Create a new WhatsApp message for Phonebook
                const newMessage = new WhatsAppMessage({
                    lead: null,
                    client: null,
                    user: null,
                    from: fromNumber,
                    to: toNumber,
                    status: "received",
                    twilio_message_sid: MessageSid,
                    message_body: Body || "Media message",
                });

                await newMessage.save();

                // Add the message ID to the phonebook entry
                phoneBookEntry.messages = phoneBookEntry.messages || [];
                phoneBookEntry.messages.push(newMessage._id);
                await phoneBookEntry.save();

                // Emit new message to the phonebook socket
                io.to(`phonebook_${phoneBookEntry._id}`).emit("new_message", newMessage);

                return res.status(200).send("Message saved in Phonebook");
            }

            if (!lead) {
                return res.status(404).json({ error: "Lead not found" });
            }

            // Prepare new message data
            const newMessageData = {
                lead: lead._id,
                client: clientData._id,
                user: null,
                from: fromNumber,
                to: toNumber,
                status: "received",
                twilio_message_sid: MessageSid,
                message_body: Body || "Media message",
            };

            // Handle media files
            const mediaUrls = [MediaUrl0, MediaUrl1, MediaUrl2, MediaUrl3, MediaUrl4].filter(Boolean);
            if (mediaUrls.length > 0) {
                console.log("Received media URLs:", mediaUrls);

                const filePaths = await Promise.all(
                    mediaUrls.map(async (mediaUrl) => {
                        return await getFileExtensionAndSave(mediaUrl, MessageSid);
                    })
                );

                const validFilePaths = filePaths.filter(Boolean);

                const savedFiles = await Promise.all(
                    validFilePaths.map(async (fileData) => {
                        const newFile = new File({
                            added_by: null, // No user associated for incoming messages
                            file_name: fileData.file_name,
                            file_path: fileData.file_path,
                            created_at: new Date(),
                            updated_at: new Date(),
                        });
                        const savedFile = await newFile.save();

                        const activityLog = new activityLogModel({
                            user_id: null,
                            log_type: "file_upload",
                            remark: `File ${fileData.file_name} received and uploaded to lead's files`,
                            created_at: new Date(),
                            updated_at: new Date(),
                        });
                        const savedActivityLog = await activityLog.save();

                        lead.activity_logs = lead.activity_logs || [];
                        lead.activity_logs.push(savedActivityLog._id);

                        return savedFile;
                    })
                );

                lead.files = lead.files || [];
                savedFiles.forEach((file) => lead.files.push(file._id));
            }

            // Save the new message in the WhatsApp messages collection
            const newMessage = new WhatsAppMessage(newMessageData);
            await newMessage.save();

            lead.messages = lead.messages || [];
            lead.messages.push(newMessage._id);
            await lead.save();

            io.to(`lead_${lead._id}`).emit("new_message", newMessage);

            res.status(200).send("Received message");
        } catch (error) {
            console.error("Failed to process webhook:", error);
            res.status(500).json({ error: "Failed to process webhook", details: error.message });
        }
    });

    // Route to get chat history
    router.get('/chat-history/:leadId', isAuth, async (req, res) => {
        try {
            const { leadId } = req.params;

            // Find all messages related to this lead, populate user and client details
            const chatHistory = await WhatsAppMessage.find({ lead: leadId })
                .populate('user', 'name') // Populate the user who sent the message
                .populate('client', 'name phone') // Populate client info
                .sort({ createdAt: 'asc' }); // Sort messages by creation time

            // Fetch media details if there are media URLs
            const chatHistoryWithMedia = await Promise.all(chatHistory.map(async (message) => {
                if (message.media_urls && message.media_urls.length > 0) {
                    try {
                        // Extract Media SID from each media URL and fetch media details
                        const mediaDetails = await Promise.all(
                            message.media_urls.map(async (mediaUrl) => {
                                const mediaSid = mediaUrl.split('/').pop(); // Extract the Media SID from the URL
                                return getMedia(message.twilio_message_sid, mediaSid); // Pass both MessageSid and MediaSid
                            })
                        );
                        return {
                            ...message.toObject(),
                            mediaDetails, // Add media details to the message
                        };
                    } catch (error) {
                        console.error('Error fetching media:', error);
                        return message;
                    }
                } else {
                    return message;
                }
            }));

            // Update the 'read' status to true for all unread messages
            await WhatsAppMessage.updateMany(
                { lead: leadId, read: false }, // Condition: messages related to the lead and not read yet
                { $set: { read: true } }       // Update: set 'read' field to true
            );

            res.status(200).json(chatHistoryWithMedia);
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch chat history', details: error.message });
        }
    });

    router.get('/media/:messageSid/:mediaSid', isAuth, async (req, res) => {
        const { messageSid, mediaSid } = req.params;

        try {
            // Fetch media using Twilio API
            const media = await getMedia(messageSid, mediaSid);

            // Set the correct headers for serving media
            res.setHeader('Content-Type', media.headers['content-type']);
            res.setHeader('Content-Disposition', 'inline'); // Display in browser
            res.send(media.body); // Send media content as the response
        } catch (error) {
            res.status(500).json({ error: 'Failed to retrieve media', details: error.message });
        }
    });

    router.put('/mark-messages-read', isAuth, async (req, res) => {
        const { messageIds } = req.body; // Expecting an array of message IDs

        if (!Array.isArray(messageIds) || messageIds.length === 0) {
            return res.status(400).json({ error: "Invalid or empty message IDs array" });
        }

        try {
            const result = await WhatsAppMessage.updateMany(
                { _id: { $in: messageIds }, read: false }, // Update only unread messages
                { $set: { read: true } }
            );

            if (result.modifiedCount === 0) {
                return res.status(404).json({ message: "No unread messages found to update" });
            }

            res.status(200).json({ message: "Messages marked as read", updatedCount: result.modifiedCount });

        } catch (error) {
            console.error('Error updating messages:', error);
            res.status(500).json({ error: 'Failed to update messages', details: error.message });
        }
    });
    // Create the /message-status route to receive status updates
    router.post("/message-status", async (req, res) => {
        const { MessageSid, MessageStatus, ErrorCode, ErrorMessage, To, From } = req.body;

        try {
            // Log the incoming status update for debugging or processing
            console.log(`Received status update for MessageSid: ${MessageSid}`);
            console.log(`Status: ${MessageStatus}, Error: ${ErrorCode ? ErrorCode : 'N/A'}, Message: ${ErrorMessage || 'N/A'}`);

            // Find the message in your database using MessageSid
            const savedMessage = await WhatsAppMessage.findOne({ twilio_message_sid: MessageSid });

            if (!savedMessage) {
                console.error(`No message found for SID: ${MessageSid}`);
                return res.status(404).json({ error: "Message not found" });
            }

            // Update the message status in the database
            savedMessage.status = MessageStatus;
            savedMessage.error_code = ErrorCode || null;
            savedMessage.error_message = ErrorMessage || null;

            // Save the updated message
            await savedMessage.save();

            // Handle specific statuses (optional)
            if (MessageStatus === 'delivered') {
                console.log(`Message delivered to ${To}`);
                // You can add any custom logic for when the message is delivered
            } else if (MessageStatus === 'failed') {
                console.log(`Message failed: ${ErrorMessage}`);
                // You can add custom logic to handle failures, like retrying
            } else if (MessageStatus === 'undelivered') {
                console.log(`Message undelivered`);
                // Handle undelivered status (e.g., retrying, notifying the user, etc.)
            }

            // Respond to Twilio to acknowledge receipt of the status
            res.status(200).send('Status received');
        } catch (error) {
            console.error("Error processing message status:", error);
            res.status(500).json({ error: "Failed to process message status", details: error.message });
        }
    });



    return router;


};
