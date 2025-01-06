const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { encrypt, decrypt } = require('./utils/encryption');
const { findOrCreateChat, insertMessage } = require('./models/messageModel');
const { logCall, updateCallStatus, getCallStatus } = require('./models/callModel');
const { handlePushNotification } = require('./middleware/pushNotificationService');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

app.use(express.json());
app.use('/api/messages', require('./routes/messageRoutes'));
app.use('/api', require('./controllers/fcmController'));

const wss = new WebSocket.Server({ noServer: true });

const messagingConnections = new Map();
const callingConnections = new Map();

// Handle WebSocket upgrade requests
server.on('upgrade', (request, socket, head) => {
    const path = request.url;

    if (path === '/messaging') {
        wss.handleUpgrade(request, socket, head, (ws) => {
            handleMessagingWebSocket(ws);
        });
    } else if (path === '/calling') {
        wss.handleUpgrade(request, socket, head, (ws) => {
            handleCallingWebSocket(ws);
        });
    } else {
        socket.destroy();
    }
});

// Messaging WebSocket handler
function handleMessagingWebSocket(ws) {
    let userId;

    ws.on('message', async (data) => {
        try {
            const parsedData = JSON.parse(data);

            if (parsedData.type === 'register') {
                userId = parsedData.userId;
                messagingConnections.set(userId, ws);
                console.log(`User registered for messaging: ${userId}`);
                return;
            }

            if (parsedData.type === 'sendMessage') {
                const { senderId, receiverId, message } = parsedData;

                const timestamp = new Date().toISOString();
                const encryptedMessage = encrypt(message);

                const { chatId, error: chatError } = await findOrCreateChat(senderId, receiverId);
                if (chatError) throw chatError;

                const { error: dbError } = await insertMessage(chatId, senderId, encryptedMessage);
                if (dbError) throw dbError;

                const receiverSocket = messagingConnections.get(receiverId);
                if (receiverSocket) {
                    receiverSocket.send(
                        JSON.stringify({
                            type: 'receiveMessage',
                            senderId,
                            message: encryptedMessage,
                            timestamp,
                        })
                    );
                } else {
                    await handlePushNotification(chatId, senderId, receiverId, message);
                }

                ws.send(
                    JSON.stringify({
                        status: 'Message sent',
                        chatId,
                        timestamp,
                    })
                );
            }
        } catch (err) {
            console.error('Error in messaging WebSocket:', err);
        }
    });

    ws.on('close', () => {
        console.log(`Messaging user disconnected: ${userId}`);
        messagingConnections.delete(userId);
    });
}

const callConnections = new Map(); // Map to store WebSocket connections by callId
const userConnections = new Map(); // Map to store WebSocket connections by userId

function handleCallingWebSocket(ws) {
    let userId; // To track the userId associated with this WebSocket

    ws.on('message', async (data) => {
        try {
            const parsedData = JSON.parse(data);

            // Register User
            if (parsedData.type === 'register') {
                userId = parsedData.userId;
                userConnections.set(userId, ws); // Map the userId to the WebSocket connection
                console.log(`User registered for calling: ${userId}`);
                return;
            }

            //Initiate Call
            if (parsedData.type === 'call') {
                const { callerId, calleeId, offer } = parsedData;

                if (!userConnections.has(callerId) || !userConnections.has(calleeId)) {
                    ws.send(
                        JSON.stringify({
                            type: 'error',
                            message: 'Both users must be registered before initiating a call.',
                        })
                    );
                    return;
                }

                const calleeSocket = userConnections.get(calleeId); // Find callee's connection

                if (calleeSocket) {
                    calleeSocket.send(
                        JSON.stringify({
                            type: 'incomingCall',
                            callerId,
                            offer,
                        })
                    );

                    // Log the call and store the callId
                    const callRecord = await logCall(callerId, calleeId, 'initiated');
                    if (callRecord && callRecord.length > 0) {
                        const callId = callRecord[0].id; // Generate callId
                        ws.callId = callId; // Attach callId to the WebSocket
                        calleeSocket.callId = callId; // Attach callId to callee WebSocket
                        callConnections.set(callId, [ws, calleeSocket]); // Map callId to both connections
                    } else {
                        console.error('Failed to log call');
                    }
                }
                return;
            }

            // Answer Call
            if (parsedData.type === 'answer') {
                const { answer } = parsedData;

                if (ws.callId) {
                    const [callerSocket] = callConnections.get(ws.callId) || [];
                    if (callerSocket) {
                        callerSocket.send(
                            JSON.stringify({
                                type: 'callAnswered',
                                answer,
                            })
                        );

                        await updateCallStatus(ws.callId, 'answered');
                    }
                } else {
                    console.error('Call ID is undefined for updating status to "answered"');
                }
                return;
            }

            //Exchange ICE Candidates
            if (parsedData.type === 'iceCandidate') {
                const { candidate } = parsedData;

                if (ws.callId) {
                    const [callerSocket, calleeSocket] = callConnections.get(ws.callId) || [];
                    const peerSocket = ws === callerSocket ? calleeSocket : callerSocket;

                    if (peerSocket) {
                        peerSocket.send(
                            JSON.stringify({
                                type: 'iceCandidate',
                                candidate,
                            })
                        );
                    }
                } else {
                    console.error('Call ID is undefined for ICE candidate exchange');
                }
                return;
            }

            // Step 5: Hangup
            if (parsedData.type === 'hangup') {
                if (ws.callId) {
                    const [callerSocket, calleeSocket] = callConnections.get(ws.callId) || [];
                    const peerSocket = ws === callerSocket ? calleeSocket : callerSocket;

                    if (peerSocket) {
                        peerSocket.send(
                            JSON.stringify({
                                type: 'hangup',
                            })
                        );

                        await updateCallStatus(ws.callId, 'ended');
                        callConnections.delete(ws.callId); // Remove the call from the map
                    }
                } else {
                    console.error('Call ID is undefined for hangup');
                }
                return;
            }
        } catch (err) {
            console.error('Error in calling WebSocket:', err);
        }
    });

    // Handle Disconnection
    ws.on('close', () => {
        (async () => {
            console.log(`Calling user disconnected: ${userId}`);
            callingConnections.delete(userId); // Remove user from active connections

            if (ws.callId) {
                try {
                    // Check the current status in the database
                    const currentStatus = await getCallStatus(ws.callId);

                    if (currentStatus !== 'ended') {
                        await updateCallStatus(ws.callId, 'disconnected');
                        console.log(`Call status updated to "disconnected" for user: ${userId}`);
                    } else {
                        console.log(`Call already ended for callId: ${ws.callId}, no further updates.`);
                    }
                } catch (err) {
                    console.error('Error updating call status to "disconnected":', err);
                }
                
            }
        })();
    });


    // Handle WebSocket errors
    ws.on('error', (error) => {
        (async () => {
            console.error(`WebSocket error for user ${userId}:`, error);
            callingConnections.delete(userId);

            if (ws.callId) {
                try {
                    const currentStatus = await getCallStatus(ws.callId);

                    if (currentStatus !== 'ended') {
                        await updateCallStatus(ws.callId, 'disconnected');
                        console.log(`Call status updated to "disconnected" for user: ${userId}`);
                    } else {
                        console.log(`Call already ended for callId: ${ws.callId}, no further updates.`);
                    }
                } catch (err) {
                    console.error('Error updating call status to "disconnected":', err);
                }
            }
        })();
    });
}


// Start the server
server.listen(process.env.PORT, () => {
    console.log(`Server running on port ${process.env.PORT}`);
    console.log(`Messaging WebSocket endpoint: ws://localhost:${process.env.PORT}/messaging`);
    console.log(`Calling WebSocket endpoint: ws://localhost:${process.env.PORT}/calling`);
});









