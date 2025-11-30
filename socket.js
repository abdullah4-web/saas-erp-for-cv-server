const socketIO = require('socket.io');
const Notification = require('./models/notificationModel');
const supportchatModel = require('./models/supportchatModel');


let io;

async function initializeSocket(server) {
    io = socketIO(server, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST']
        },
        transports: ['websocket']
    });

    io.on('connection', async (socket) => {
        const userId = socket.handshake.query.userId;
        socket.join(`user_${userId}`); // Join the user-specific room
    
        // Fetch and send any unread notifications or lead requests when the user connects
        try {
            const unreadNotifications = await Notification.find({ receiver: userId, read: false })
                .populate('sender', 'name image') // Populate sender's name and image
                .populate('reference_id')
                .sort({ created_at: -1 });
    
            unreadNotifications.forEach(notification => {
                socket.emit('notification', {
                    sender: {
                        name: notification.sender?.name,  // Ensure sender is populated
                        image: notification.sender?.image, // Ensure sender's image is included
                    },
                    message: notification.message,
                    referenceId: notification.reference_id ? notification.reference_id._id : null,
                    notificationType: notification.notification_type,
                    notificationId: notification._id,
                    createdAt: notification.created_at,
                });
            });

              // Fetch support chats for the connected user
              const supportChats = await supportchatModel.find({
                $or: [{ senderId: userId }, { receiverId: userId }],
            })
                .populate('senderId', 'name image') // Populate sender's details
                .populate('receiverId', 'name image') // Populate receiver's details
                .sort({ createdAt: -1 });

                // Emit support chats
            supportChats.forEach((chat) => {
                socket.emit('new_message', {
                    chatId: chat._id,
                    senderId: {
                        _id: chat.senderId._id,
                        name: chat.senderId.name,
                        image: chat.senderId.image,
                    },
                    receiverId: {
                        _id: chat.receiverId._id,
                        name: chat.receiverId.name,
                        image: chat.receiverId.image,
                    },
                    message: chat.message,
                    mediaUrls: chat.mediaUrls,
                    createdAt: chat.createdAt,
                    isread: chat.isread,
                });
            });

        } catch (error) {
            console.error('Error fetching unread notifications or lead requests:', error);
        }
    
        socket.on('disconnect', () => {
            socket.leave(`user_${userId}`); // Leave the user room on disconnect
        });
    });
    
    return io;
}

function getIO() {
    if (!io) {
        throw new Error('Socket.IO has not been initialized.');
    }
    return io;
}

// // Notify function to emit a real-time permission change update
async function notifyPermissionChange(userId) {
    try {
        console.log('Notifying permission update for user:', userId); // Log the user ID
        // Emit a permission update to the specific user's room
        io.to(`user_${userId}`).emit('permission-update', {
            message: 'Your permissions have been updated. Please refresh to see the changes.'
        });
        console.log('Permission update emitted successfully'); // Log successful emission
    } catch (error) {
        console.error(`Error notifying permission change to user ${userId}:`, error);
    }
}
async function notifyLogout(userId) {
    try {
        console.log('Notifying logout for user:', userId); // Log the user ID
        // Emit a logout notification to the specific user's room
        io.to(`user_${userId}`).emit('logout-notification', {
            message: 'You have been logged out. Please log in again to continue.'
        });
        console.log('Logout notification emitted successfully'); // Log successful emission
    } catch (error) {
        console.error(`Error notifying logout to user ${userId}:`, error);
    }
}


module.exports = { 
    initializeSocket,
    getIO,
    notifyPermissionChange ,
    notifyLogout
}; 
 