const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { encrypt, decrypt } = require('./utils/encryption');
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