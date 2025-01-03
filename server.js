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

// Add this line to include the fcmController routes
app.use('/api', require('./controllers/fcmController'));

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