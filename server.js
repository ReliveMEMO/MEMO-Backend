
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { encrypt } = require('./utils/encryption');
const { findOrCreateChat, appendMessage } = require('./models/messageModel');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use('/api/messages', require('./routes/messageRoutes'));

io.on('connection', (socket) => {
    console.log('User connected');

    socket.on('sendMessage', async ({ senderId, receiverId, message }) => {
        const timestamp = new Date().toISOString();
        const encryptedMessage = encrypt(message);

        const { chatId, error: chatError } = await findOrCreateChat(senderId, receiverId);
        if (chatError) {
            socket.emit('error', { error: chatError.message });
            return;
        }

        const messageObject = { [timestamp]: encryptedMessage };
        const { data, error } = await appendMessage(chatId, senderId, receiverId, messageObject);

        if (error) {
            socket.emit('error', { error: error.message });
        } else {
            socket.to(receiverId).emit('receiveMessage', { senderId, message });
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

server.listen(process.env.PORT, () => {
    console.log(`Server running on port ${process.env.PORT}`);
});