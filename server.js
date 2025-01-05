const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { encrypt, decrypt } = require('./utils/encryption');
const { findOrCreateChat, insertMessage } = require('./models/messageModel');
const { logCall, updateCallStatus } = require('./models/callModel');
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

const callIdMap = new Map(); // Map to store callId by callerId or calleeId

function handleCallingWebSocket(ws) {
    let userId;

    ws.on('message', async (data) => {
        try {
            const parsedData = JSON.parse(data);

            if (parsedData.type === 'register') {
                userId = parsedData.userId;
                callingConnections.set(userId, ws);
                console.log(`User registered for calling: ${userId}`);
                return;
            }

            if (parsedData.type === 'call') {
                const { callerId, calleeId, offer } = parsedData;
                const calleeSocket = callingConnections.get(calleeId);

                if (calleeSocket) {
                    calleeSocket.send(
                        JSON.stringify({
                            type: 'incomingCall',
                            callerId,
                            offer,
                        })
                    );

                    // Log the call and store the callId in the map
                    const callRecord = await logCall(callerId, calleeId, 'initiated');
                    if (callRecord && callRecord.length > 0) {
                        const callId = callRecord[0].id;
                        callIdMap.set(callerId, callId); // Associate callId with callerId
                        callIdMap.set(calleeId, callId); // Associate callId with calleeId
                    } else {
                        console.error('Failed to log call');
                    }
                }
            }

            if (parsedData.type === 'answer') {
                const { callerId, answer } = parsedData;
                const callerSocket = callingConnections.get(callerId);

                if (callerSocket) {
                    callerSocket.send(
                        JSON.stringify({
                            type: 'callAnswered',
                            answer,
                        })
                    );

                    // Retrieve callId from the map
                    const callId = callIdMap.get(callerId);
                    if (callId) {
                        await updateCallStatus(callId, 'answered');
                    } else {
                        console.error('Call ID is undefined for updating status to "answered"');
                    }
                }
            }

            if (parsedData.type === 'iceCandidate') {
                const { targetId, candidate } = parsedData;
                const targetSocket = callingConnections.get(targetId);

                if (targetSocket) {
                    targetSocket.send(
                        JSON.stringify({
                            type: 'iceCandidate',
                            candidate,
                        })
                    );
                }
            }

            if (parsedData.type === 'hangup') {
                const { targetId } = parsedData;
                const targetSocket = callingConnections.get(targetId);

                if (targetSocket) {
                    targetSocket.send(
                        JSON.stringify({
                            type: 'hangup',
                        })
                    );

                    // Retrieve callId from the map
                    const callId = callIdMap.get(targetId);
                    if (callId) {
                        await updateCallStatus(callId, 'ended');
                    } else {
                        console.error('Call ID is undefined for updating status to "ended"');
                    }
                }
            }
        } catch (err) {
            console.error('Error in calling WebSocket:', err);
        }
    });

    ws.on('close', async () => {
        console.log(`Calling user disconnected: ${userId}`);
        
        // Remove user from active connections
        callingConnections.delete(userId);
    
        // Retrieve and update the call status to "disconnected"
        const callId = callIdMap.get(userId);
        if (callId) {
            try {
                await updateCallStatus(callId, 'disconnected');
                console.log(`Call status updated to "disconnected" for user: ${userId}`);
            } catch (err) {
                console.error('Error updating call status to "disconnected":', err);
            }
    
            // Remove the callId from the map
            callIdMap.delete(userId);
        }
    });

    // ws.on('error', (err) => {
    //     (async () => {
    //         console.log(`Error in calling WebSocket for user: ${userId}`, err);

    //         callingConnections.delete(userId);

    //         const callId = callIdMap.get(userId);
    //         if (callId) {
    //             try {
    //                 await updateCallStatus(callId, 'disconnected');
    //                 console.log(`Call status updated to "disconnected" for user: ${userId}`);
    //             } catch (err) {
    //                 console.error('Error updating call status to "disconnected":', err);
    //             }
        
    //             callIdMap.delete(userId);
    //         }
        
    // });
    
}

// Start the server
server.listen(process.env.PORT, () => {
    console.log(`Server running on port ${process.env.PORT}`);
    console.log(`Messaging WebSocket endpoint: ws://localhost:${process.env.PORT}/messaging`);
    console.log(`Calling WebSocket endpoint: ws://localhost:${process.env.PORT}/calling`);
});





























// const express = require('express');
// const http = require('http');
// const WebSocket = require('ws');
// const { encrypt, decrypt } = require('./utils/encryption');
// const { findOrCreateChat, appendMessage, markAsReceived, insertMessage } = require('./models/messageModel');
// const { handlePushNotification } = require('./middleware/pushNotificationService');
// require('dotenv').config();

// const app = express();
// const server = http.createServer(app);
// const wss = new WebSocket.Server({ server });

// app.use(express.json());
// app.use('/api/messages', require('./routes/messageRoutes'));

// // Add this line to include the fcmController routes
// app.use('/api', require('./controllers/fcmController'));

// const connections = new Map(); // Map to store WebSocket connections by user ID

// wss.on('connection', (ws, req) => {
//     let userId;

//     ws.on('message', async (data) => {
//         try {
//             const parsedData = JSON.parse(data);

//             if (parsedData.type === 'register') {
//                 userId = parsedData.userId;
//                 connections.set(userId, ws);
//                 console.log(`User registered with ID: ${userId}`);
//                 return;
//             }

//             if (parsedData.type === 'sendMessage') {
//                 const { senderId, receiverId, message } = parsedData;

//                 const timestamp = new Date().toISOString();
//                 const encryptedMessage = encrypt(message);

//                 const { chatId, error: chatError } = await findOrCreateChat(senderId, receiverId);
//                 if (chatError) throw chatError;

//                 const messageObject = encryptedMessage;
//                 const { data: dbData, error: dbError } = await insertMessage(chatId,senderId, messageObject);
//                 if (dbError) throw dbError;

//                 const decryptedMessage = decrypt(encryptedMessage);

//                 // Send decrypted message to receiver
//                 const receiverSocket = connections.get(receiverId);
//                 if (receiverSocket) {
//                     receiverSocket.send(
//                         JSON.stringify({
//                             type: 'receiveMessage',
//                             senderId,
//                             message: messageObject,
//                             timestamp,
//                         })
//                     );
//                 }
//                 else {
//                     await handlePushNotification(chatId, senderId, receiverId, message);
//                 }

//                 // Send confirmation back to sender
//                 ws.send(
//                     JSON.stringify({
//                         status: 'Message sent',
//                         chatId,
//                         timestamp,
//                         decryptedMessage,
//                     })
//                 );
//             }
//         } catch (err) {
//             console.error('Error processing WebSocket message:', err);
//             ws.send(JSON.stringify({ error: 'Invalid message format' }));
//         }
//     });

//     ws.on('close', () => {
//         console.log('User disconnected:', userId);
//         connections.delete(userId);
//     });
// });

// server.listen(process.env.PORT, () => {
//     console.log(`Server running on port ${process.env.PORT}`);
// });