const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const messageRoutes = require('./routes/messageRoutes');
require('dotenv').config();


const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use('/api/messages', messageRoutes);

io.on('connection', (socket) => {
    console.log('User connected');

    socket.on('sendMessageBatch', async (data) => {
        const { messages } = data; // Array of { senderId, receiverId, message }
        const encryptedMessages = messages.map(msg => ({
            sender_id: msg.senderId,
            receiver_id: msg.receiverId,
            encrypted_message: encrypt(msg.message)
        }));
        const { data: dbData, error } = await createMessagesBatch(encryptedMessages);
        if (error) {
            socket.emit('error', { error });
        } else {
            io.emit('receiveMessageBatch', dbData);
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

server.listen(process.env.PORT, () => {
    console.log(`Server running on port ${process.env.PORT}`);
});