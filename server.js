const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { encrypt, decrypt } = require('./utils/encryption');
const { findOrCreateChat, appendMessage, markAsReceived, insertMessage } = require('./models/messageModel');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use('/api/messages', require('./routes/messageRoutes'));

const connections = new Map(); // Map to store WebSocket connections by user ID

wss.on('connection', (ws, req) => {
    let userId;

    ws.on('message', async (data) => {
        try {
            const parsedData = JSON.parse(data);

            if (parsedData.type === 'register') {
                userId = parsedData.userId;
                connections.set(userId, ws);
                console.log(`User registered with ID: ${userId}`);
                return;
            }

            if (parsedData.type === 'sendMessage') {
                const { senderId, receiverId, message } = parsedData;

                const timestamp = new Date().toISOString();
                const encryptedMessage = encrypt(message);

                const { chatId, error: chatError } = await findOrCreateChat(senderId, receiverId);
                if (chatError) throw chatError;

                const messageObject = encryptedMessage;
                const { data: dbData, error: dbError } = await insertMessage(chatId,senderId, messageObject);
                if (dbError) throw dbError;

                const decryptedMessage = decrypt(encryptedMessage);

                // Send decrypted message to receiver
                const receiverSocket = connections.get(receiverId);
                if (receiverSocket) {
                    receiverSocket.send(
                        JSON.stringify({
                            type: 'receiveMessage',
                            senderId,
                            message: messageObject,
                            timestamp,
                        })
                    );
                }

                // Send confirmation back to sender
                ws.send(
                    JSON.stringify({
                        status: 'Message sent',
                        chatId,
                        timestamp,
                        decryptedMessage,
                    })
                );
            }
        } catch (err) {
            console.error('Error processing WebSocket message:', err);
            ws.send(JSON.stringify({ error: 'Invalid message format' }));
        }
    });

    ws.on('close', () => {
        console.log('User disconnected:', userId);
        connections.delete(userId);
    });
});

server.listen(process.env.PORT, () => {
    console.log(`Server running on port ${process.env.PORT}`);
});



// const express = require('express');
// const http = require('http');
// const WebSocket = require('ws');
// const { encrypt, decrypt } = require('./utils/encryption');
// const { findOrCreateChat, appendMessage } = require('./models/messageModel');
// require('dotenv').config();

// const app = express();
// const server = http.createServer(app);
// const wss = new WebSocket.Server({ server });

// app.use(express.json());

// // In-memory storage for WebSocket connections
// const connections = new Map();

// // Handle WebSocket connections
// wss.on('connection', (ws, req) => {
//     console.log('New client connected');

//     ws.on('message', async (data) => {
//         try {
//             const { senderId, receiverId, message } = JSON.parse(data);

//             // Encrypt and save message
//             const timestamp = new Date().toISOString();
//             const encryptedMessage = encrypt(message);
//             const { chatId, error: chatError } = await findOrCreateChat(senderId, receiverId);

//             if (chatError) {
//                 console.error('Error finding or creating chat:', chatError);
//                 return ws.send(JSON.stringify({ error: chatError.message }));
//             }

//             const messageObject = { [timestamp]: encryptedMessage };
//             const { data: dbData, error: dbError } = await appendMessage(chatId, messageObject);

//             if (dbError) {
//                 console.error('Error saving message to database:', dbError);
//                 return ws.send(JSON.stringify({ error: dbError.message }));
//             }

//             // Decrypt message for the receiver
//             const decryptedMessage = decrypt(encryptedMessage);

//             // Send decrypted message to the receiver if connected
//             const receiverSocket = connections.get(receiverId);
//             if (receiverSocket) {
//                 receiverSocket.send(
//                     JSON.stringify({
//                         senderId,
//                         chatId,
//                         message: decryptedMessage,
//                         timestamp,
//                     })
//                 );
//             }

//             // Send confirmation back to the sender
//             ws.send(
//                 JSON.stringify({
//                     status: 'Message sent',
//                     chatId,
//                     timestamp,
//                 })
//             );
//         } catch (err) {
//             console.error('Error processing WebSocket message:', err);
//             ws.send(JSON.stringify({ error: 'Invalid message format' }));
//         }
//     });

//     ws.on('close', () => {
//         console.log('Client disconnected');
//         // Remove connection if client disconnects
//         connections.forEach((socket, userId) => {
//             if (socket === ws) connections.delete(userId);
//         });
//     });
// });

// // Add route for assigning user IDs
// app.post('/api/connect', (req, res) => {
//     const { userId } = req.body;

//     if (!userId) {
//         return res.status(400).json({ error: 'User ID is required' });
//     }

//     connections.set(userId, null); // Initialize connection as null
//     res.status(200).json({ message: `User ${userId} registered for WebSocket` });
// });

// server.listen(process.env.PORT, () => {
//     console.log(`Server running on port ${process.env.PORT}`);
// });







// const express = require('express');
// const http = require('http');
// const { Server } = require('socket.io');
// const { encrypt } = require('./utils/encryption');
// const { findOrCreateChat, appendMessage } = require('./models/messageModel');
// require('dotenv').config();

// const app = express();
// const server = http.createServer(app);
// const io = new Server(server);

// app.use(express.json());
// app.use('/api/messages', require('./routes/messageRoutes'));

// io.on('connection', (socket) => {
//     console.log('User connected');

//     socket.on('sendMessage', async ({ senderId, receiverId, message }) => {
//         const timestamp = new Date().toISOString();
//         const encryptedMessage = encrypt(message);

//         const { chatId, error: chatError } = await findOrCreateChat(senderId, receiverId);
//         if (chatError) {
//             socket.emit('error', { error: chatError.message });
//             return;
//         }

//         const messageObject = { [timestamp]: encryptedMessage };
//         const { data, error } = await appendMessage(chatId, senderId, receiverId, messageObject);

//         if (error) {
//             socket.emit('error', { error: error.message });
//         } else {
//             socket.to(receiverId).emit('receiveMessage', { senderId, message });
//         }
//     });

//     socket.on('disconnect', () => {
//         console.log('User disconnected');
//     });
// });

// server.listen(process.env.PORT, () => {
//     console.log(`Server running on port ${process.env.PORT}`);
// });