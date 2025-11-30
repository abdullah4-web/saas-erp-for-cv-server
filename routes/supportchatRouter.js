const express = require('express');
const multer = require('multer');
const path = require('path');
const { isAuth } = require('../utils');
const User = require('../models/userModel');
const supportchatModel = require('../models/supportchatModel');
const { getIO } = require('../socket'); // Import the Socket.IO instance

const router = express.Router();

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../chat_files')); // Upload files to 'chat_files' directory
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname)); // Unique filenames
  },
});

const upload = multer({ storage: storage });

router.put('/mark-read', isAuth, async (req, res) => {
  try {
    const { messageIds } = req.body;

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return res.status(400).json({ error: 'Message IDs are required' });
    }

    // Update the isread field for messages where the user is the receiver
    const result = await supportchatModel.updateMany(
      { _id: { $in: messageIds }, receiverId: req.user._id, isread: false },
      { $set: { isread: true } }
    );


    // Fetch the updated messages
    const updatedMessages = await supportchatModel
      .find({ _id: { $in: messageIds } })
      .populate('senderId', 'name image')
      .populate('receiverId', 'name image');

    // Notify the sender about the read status via Socket.IO
    const io = getIO();
    updatedMessages.forEach((msg) => {
      io.to(`user_${msg.senderId._id}`).emit('message_read', {
        messageId: msg._id,
        senderId: msg.senderId._id,
        receiverId: msg.receiverId._id,
        isread: msg.isread,
      });
    });

    res.status(200).json({ message: 'Messages marked as read', data: updatedMessages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


router.post('/send', isAuth, upload.array('files', 5), async (req, res) => {
  try {
    const { message } = req.body;

    let receiverId;
    const mediaUrls = req.files.map(file => file.filename);

    if (req.user.role === 'Admin') {
      // Admin sends message to a specific receiver
      receiverId = req.body.receiverId;
      if (!receiverId) {
        return res.status(400).json({ error: 'Receiver ID is required' });
      }

      const receiver = await User.findById(receiverId).select('name image role');
      if (!receiver || receiver.role === 'Admin') {
        return res.status(400).json({ error: 'Invalid receiver' });
      }
    } else {
      // Regular user sends message to the Admin
      const superAdmin = await User.findOne({ role: 'Admin' }).select('name image');
      if (!superAdmin) {
        return res.status(404).json({ error: 'Admin not found' });
      }

      receiverId = superAdmin._id;
    }

    // Save the message in the database
    const newMessage = new supportchatModel({
      senderId: req.user._id,
      receiverId,
      message,
      mediaUrls,
    });

    await newMessage.save();

    // Fetch and populate sender and receiver details
    const populatedMessage = await supportchatModel
      .findById(newMessage._id)
      .populate('senderId', 'name image')
      .populate('receiverId', 'name image')
      .exec();

    // Emit the message to both sender's and receiver's socket rooms
    const io = getIO();
    io.to(`user_${receiverId}`).emit('new_message', populatedMessage);
    io.to(`user_${req.user._id}`).emit('new_message', populatedMessage);

    res.status(201).json(populatedMessage);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
// Route to get chat history for a specific user
router.get('/history/:userId', isAuth, async (req, res) => {
  try {
    const { userId } = req.params;

    const chatHistory = await supportchatModel.find({
      $or: [
        { senderId: userId },
        { receiverId: userId },
      ],
    }).sort('createdAt');

    res.status(200).json(chatHistory);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Separate route for Admin to view all chat history
router.get('/superadmin/history', isAuth, async (req, res) => {
  try {
    if (req.user.role !== 'Admin') {
      return res.status(403).json({ error: 'Access denied. Only Admin can view this.' });
    }

    // Fetch all chat history for the Admin
    const chatHistory = await supportchatModel.find({
      $or: [
        { senderId: req.user._id },
        { receiverId: req.user._id },
      ],
    }).sort('createdAt');

    res.status(200).json(chatHistory);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Route for user chat history with populated sender and receiver details
router.get('/user-chat-history', isAuth, async (req, res) => {
  try {
    // Fetch all chat history for the Admin
    const chatHistory = await supportchatModel.find({
      $or: [
        { senderId: req.user._id },
        { receiverId: req.user._id },
      ],
    })
    .sort('createdAt')
    .populate('senderId', 'name image') // Populate senderId with name and image
    .populate('receiverId', 'name image'); // Populate receiverId with name and image

    res.status(200).json(chatHistory);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
