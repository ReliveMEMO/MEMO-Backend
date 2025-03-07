const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');
const { encrypt, decrypt } = require('./utils/encryption');
const { findOrCreateChat, insertMessage, appendGroupMessage} = require('./models/messageModel');
const { logCall, updateCallStatus, getCallStatus } = require('./models/callModel');
const { handlePushNotification } = require('./middleware/pushNotificationService');
require('dotenv').config();
const cors = require('cors');

// Initialize Express and HTTP server
const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/messages', require('./routes/messageRoutes'));
app.use('/api', require('./controllers/fcmController'));
app.use('/api', require('./routes/fcmRoutes')); // New push notification route
app.use('/api', require('./routes/likeRoutes')); // post like count increase and decrease route

// WebSocket server
const wss = new WebSocket.Server({ noServer: true });
const groupWss = new WebSocket.Server({ noServer: true });

const messagingConnections = new Map();
const callingConnections = new Map();
const groupConnections = new Map();

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

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
    }else if (path === '/group-messages') {
        groupWss.handleUpgrade(request, socket, head, (ws) => {
            handleGroupMessagingWebSocket(ws);
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


// Group Messaging WebSocket handler
function handleGroupMessagingWebSocket(ws) {
    let userId;

    ws.on('message', async (data) => {
        try {
            const parsedData = JSON.parse(data);

            if (parsedData.type === 'register') {
                userId = parsedData.userId;
                groupConnections.set(userId, ws);
                console.log(`User registered for group messages with ID: ${userId}`);
                return;
            }

            if (parsedData.type === 'sendGroupMessage') {
                const { grp_id, senderId, message } = parsedData;

                const time_of_msg = new Date().toISOString();
                const encryptedMessage = encrypt(message);

                if (!grp_id) throw new Error("Group ID is required.");

                const messageObject = { senderId, content: { [time_of_msg]: encryptedMessage }, time_of_msg };
                const { data: dbData, error: dbError } = await appendGroupMessage(grp_id, messageObject);
                if (dbError) throw dbError;

                const decryptedMessage = decrypt(encryptedMessage);

                // Send decrypted message to all group members
                const { data: groupData, error: groupError } = await supabase
                    .from('Group_Table')
                    .select('members, group_name')
                    .eq('grp_id', grp_id)
                    .single();

                if (groupError) throw groupError;

                // const members = groupData.members;
                // members.forEach(member => {
                //     const memberSocket = groupConnections.get(member.user_id);
                //     if (memberSocket) {
                //         memberSocket.send(
                //             JSON.stringify({
                //                 type: 'receiveGroupMessage',
                //                 groupName: parsedData.groupName,
                //                 senderId,
                //                 message: decryptedMessage,
                //                 time_of_msg,
                //             })
                //         );
                //     }
                // });

                const members = groupData.members;
                const groupName = groupData.group_name;
                console.log(`Sending message to group: ${groupName}, members: ${JSON.stringify(members)}`);
                // members.forEach(member => {
                //     const memberSocket = groupConnections.get(member.user_id);
                //     if (memberSocket) {
                //         console.log(`Sending message to member: ${member.user_id}`);
                //         memberSocket.send(
                //             JSON.stringify({
                //                 type: 'receiveGroupMessage',
                //                 groupName: groupName,
                //                 senderId,
                //                 message: decryptedMessage,
                //                 time_of_msg,
                //             })
                //         );
                //     }
                // });
                //heeeeee
                // console.log("Members array:", members);
                // members.forEach(member => {
                //     console.log("Member object:", member);
                //     const memberSocket = groupConnections.get(member.user_id);
                //     console.log(`Checking socket for user ${member.user_id}:`, memberSocket);
                
                //     if (memberSocket) {
                //         console.log(`Sending message to member: ${member.user_id}`);
                //         memberSocket.send(
                //             JSON.stringify({
                //                 type: 'receiveGroupMessage',
                //                 groupName: groupName,
                //                 senderId,
                //                 message: decryptedMessage,
                //                 time_of_msg,
                //             })
                //         );
                //     } else {
                //         console.log(`No active socket connection for user: ${member.user_id}`);
                //     }
                // });

                members.forEach(userId => {
                    console.log(`Checking socket for user ${userId}`);
                    const memberSocket = groupConnections.get(userId);
                
                    if (memberSocket) {
                        console.log(`Sending message to member: ${userId}`);
                        memberSocket.send(
                            JSON.stringify({
                                type: 'receiveGroupMessage',
                                groupName,
                                senderId,
                                message: decryptedMessage,
                                time_of_msg,
                            })
                        );
                    } else {
                        console.log(`No active socket connection for user: ${userId}`);
                    }
                });

                // Send confirmation back to sender
                ws.send(
                    JSON.stringify({
                        status: 'Message sent',
                        groupId: grp_id,
                        time_of_msg,
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
        console.log('User disconnected from group messages:', userId);
        groupConnections.delete(userId);
    });
}

const callConnections = new Map(); // Map to store WebSocket connections by callId
const userConnections = new Map(); // Map to store WebSocket connections by userId

function handleCallingWebSocket(ws) {
    let userId; // To track the userId associated with this WebSocket
    ws.on('message', async (data) => {
        try {
            const parsedData = JSON.parse(data);

//             if (parsedData.type === 'sendGroupMessage') {
//                 const { grp_id, senderId, message } = parsedData;

//                 const time_of_msg = new Date().toISOString();
//                 const encryptedMessage = encrypt(message);

//                 if (!grp_id) throw new Error("Group ID is required.");

//                 const messageObject = { senderId, content: { [time_of_msg]: encryptedMessage }, time_of_msg };
//                 const { data: dbData, error: dbError } = await appendGroupMessage(grp_id, messageObject);
//                 if (dbError) throw dbError;

//                 const decryptedMessage = decrypt(encryptedMessage);

//                 // Send decrypted message to all group members
//                 const { data: groupData, error: groupError } = await supabase
//                     .from('Group_Table')
//                     .select('members')
//                     .eq('group_id', grp_id)
//                     .single();

//                 if (groupError) throw groupError;

//                 const members = groupData.members;
//                 members.forEach(member => {
//                     const memberSocket = groupConnections.get(member.user_id);
//                     if (memberSocket) {
//                         memberSocket.send(
//                             JSON.stringify({
//                                 type: 'receiveGroupMessage',
//                                 groupName: parsedData.groupName,
//                                 senderId,
//                                 message: decryptedMessage,
//                                 time_of_msg,
//                             })
//                         );
//                     }
//                 });

//                  // Send confirmation back to sender
//                  ws.send(
//                     JSON.stringify({
//                         status: 'Message sent',
//                         groupId: grp_id,
//                         time_of_msg,
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
//         console.log('User disconnected from group messages:', userId);
//         groupConnections.delete(userId);
//     });
// });

// server.on('upgrade', (request, socket, head) => {
//     const pathname = request.url;

//     if (pathname === '/group-messages') {
//         groupWss.handleUpgrade(request, socket, head, (ws) => {
//             groupWss.emit('connection', ws, request);
//         });
//     } else {
//         socket.destroy();
//     }
// });


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
            //web rtc
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
//
            //Exchange ICE Candidates
            //web rtc
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
    console.log(`API Endpoint for common push notifications: http://localhost:${process.env.PORT}/api/send-com-notification`);
    console.log(`API Endpoint for tag users notifications: http://localhost:${process.env.PORT}/api/tag-users`);
    console.log(`API Endpoint for event participation notifications: http://localhost:${process.env.PORT}/api/send-notification-to-followed`);
    

});



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

