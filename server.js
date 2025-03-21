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
                    const { error: dbError } = await insertMessage(chatId, senderId, encryptedMessage, true);
                    if (dbError) throw dbError;
                } else {
                    await handlePushNotification(chatId, senderId, receiverId, message);
                    const { error: dbError } = await insertMessage(chatId, senderId, encryptedMessage, false);
                    if (dbError) throw dbError;
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
    let userId; // Variable to store the user ID associated with this WebSocket connection

    // Listen for incoming WebSocket messages
    ws.on('message', async (data) => {
        try {
            // Parse the incoming message data
            const parsedData = JSON.parse(data);

            // Handle user registration for group messaging
            if (parsedData.type === 'register') {
                userId = parsedData.userId; // Extract the user ID from the message
                groupConnections.set(userId, ws); // Map the user ID to the WebSocket connection
                console.log(`User registered for group messages with ID: ${userId}`);
                return; // Exit after handling registration
            }

            // Handle sending a group message
            if (parsedData.type === 'sendGroupMessage') {
                const { grp_id, senderId, message } = parsedData; // Extract group ID, sender ID, and message

                const time_of_msg = new Date().toISOString(); // Get the current timestamp
                const encryptedMessage = encrypt(message); // Encrypt the message

                // Ensure the group ID is provided
                if (!grp_id) throw new Error("Group ID is required.");

                // Create a message object to store in the database
                const messageObject = { senderId, content: { encryptedMessage }, time_of_msg };

                // Append the encrypted message to the database
                const { data: dbData, error: dbError } = await appendGroupMessage(grp_id, messageObject);
                if (dbError) throw dbError; // Handle database errors

                // Decrypt the message for sending to group members
                const decryptedMessage = decrypt(encryptedMessage);

                // Fetch group details (members and group name) from the database
                const { data: groupData, error: groupError } = await supabase
                    .from('Group_Table')
                    .select('members, group_name')
                    .eq('grp_id', grp_id)
                    .single();

                if (groupError) throw groupError; // Handle errors in fetching group details

                const members = groupData.members; // List of group members
                const groupName = groupData.group_name; // Name of the group
                console.log(`Sending message to group: ${groupName}, members: ${JSON.stringify(members)}`);

                // Iterate through all group members and send the decrypted message
                members.forEach(userId => {
                    console.log(`Checking socket for user ${userId}`);
                    const memberSocket = groupConnections.get(userId); // Get the WebSocket connection for the user

                    if (memberSocket) {
                        console.log(`Sending message to member: ${userId}`);
                        memberSocket.send(
                            JSON.stringify({
                                type: 'receiveGroupMessage', // Message type for receiving group messages
                                groupName, // Name of the group
                                senderId, // ID of the sender
                                message: decryptedMessage, // Decrypted message content
                                time_of_msg, // Timestamp of the message
                            })
                        );
                    } else {
                        console.log(`No active socket connection for user: ${userId}`);
                    }
                });

                // Send a confirmation back to the sender
                ws.send(
                    JSON.stringify({
                        status: 'Message sent', // Confirmation status
                        groupId: grp_id, // Group ID
                        time_of_msg, // Timestamp of the message
                        decryptedMessage, // Decrypted message content
                    })
                );
            }
        } catch (err) {
            // Handle errors during message processing
            console.error('Error processing WebSocket message:', err);
            ws.send(JSON.stringify({ error: 'Invalid message format' })); // Send error response to the client
        }
    });

    // Handle WebSocket disconnection
    ws.on('close', () => {
        console.log('User disconnected from group messages:', userId);
        groupConnections.delete(userId); // Remove the user from the active connections map
    });
}

const callConnections = new Map(); // Map to store WebSocket connections by callId
const userConnections = new Map(); // Map to store WebSocket connections by userId

// Calling WebSocket handler
function handleCallingWebSocket(ws) {
    let userId; // Variable to track the userId associated with this WebSocket connection

    // Listen for incoming WebSocket messages
    ws.on('message', async (data) => {
        try {
            // Parse the incoming message data
            const parsedData = JSON.parse(data);


            // Register User

            // Step 1: Register User

            if (parsedData.type === 'register') {
                userId = parsedData.userId; // Extract the userId from the message
                userConnections.set(userId, ws); // Map the userId to the WebSocket connection
                console.log(`User registered for calling: ${userId}`);
                return; // Exit after handling registration
            }

            // Step 2: Initiate Call
            if (parsedData.type === 'call') {
                const { callerId, calleeId, offer } = parsedData; // Extract callerId, calleeId, and offer

                // Ensure both users are registered
                if (!userConnections.has(callerId) || !userConnections.has(calleeId)) {
                    ws.send(
                        JSON.stringify({
                            type: 'error',
                            message: 'Both users must be registered before initiating a call.',
                        })
                    );
                    return; // Exit if either user is not registered
                }

                const calleeSocket = userConnections.get(calleeId); // Find callee's WebSocket connection

                if (calleeSocket) {
                    // Send an incoming call notification to the callee
                    calleeSocket.send(
                        JSON.stringify({
                            type: 'incomingCall',
                            callerId,
                            offer,
                        })
                    );

                    // Log the call in the database and generate a callId
                    const callRecord = await logCall(callerId, calleeId, 'initiated');
                    if (callRecord && callRecord.length > 0) {
                        const callId = callRecord[0].id; // Extract the callId
                        ws.callId = callId; // Attach callId to the caller's WebSocket
                        calleeSocket.callId = callId; // Attach callId to the callee's WebSocket
                        callConnections.set(callId, [ws, calleeSocket]); // Map the callId to both WebSocket connections
                    } else {
                        console.error('Failed to log call');
                    }
                }
                return; // Exit after initiating the call
            }

            // Step 3: Answer Call
            if (parsedData.type === 'answer') {
                const { answer } = parsedData; // Extract the answer

                if (ws.callId) {
                    const [callerSocket] = callConnections.get(ws.callId) || []; // Get the caller's WebSocket
                    if (callerSocket) {
                        // Send the answer to the caller
                        callerSocket.send(
                            JSON.stringify({
                                type: 'callAnswered',
                                answer,
                            })
                        );

                        // Update the call status in the database
                        await updateCallStatus(ws.callId, 'answered');
                    }
                } else {
                    console.error('Call ID is undefined for updating status to "answered"');
                }
                return; // Exit after answering the call
            }

            // Step 4: Exchange ICE Candidates (WebRTC)
            if (parsedData.type === 'iceCandidate') {
                const { candidate } = parsedData; // Extract the ICE candidate

                if (ws.callId) {
                    const [callerSocket, calleeSocket] = callConnections.get(ws.callId) || []; // Get both WebSocket connections
                    const peerSocket = ws === callerSocket ? calleeSocket : callerSocket; // Determine the peer WebSocket

                    if (peerSocket) {
                        // Send the ICE candidate to the peer
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
                return; // Exit after exchanging ICE candidates
            }

            // Step 5: Hangup Call
            if (parsedData.type === 'hangup') {
                if (ws.callId) {
                    const [callerSocket, calleeSocket] = callConnections.get(ws.callId) || []; // Get both WebSocket connections
                    const peerSocket = ws === callerSocket ? calleeSocket : callerSocket; // Determine the peer WebSocket

                    if (peerSocket) {
                        // Notify the peer about the hangup
                        peerSocket.send(
                            JSON.stringify({
                                type: 'hangup',
                            })
                        );

                        // Update the call status in the database
                        await updateCallStatus(ws.callId, 'ended');
                        callConnections.delete(ws.callId); // Remove the call from the map
                    }
                } else {
                    console.error('Call ID is undefined for hangup');
                }
                return; // Exit after handling hangup
            }
        } catch (err) {
            // Handle errors during message processing
            console.error('Error in calling WebSocket:', err);
        }
    });

    // Handle WebSocket disconnection
    ws.on('close', () => {
        (async () => {
            console.log(`Calling user disconnected: ${userId}`);
            callingConnections.delete(userId); // Remove the user from active connections

            if (ws.callId) {
                try {
                    // Check the current status in the database
                    const currentStatus = await getCallStatus(ws.callId);

                    if (currentStatus !== 'ended') {
                        // Update the call status to "disconnected"
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
            callingConnections.delete(userId); // Remove the user from active connections

            if (ws.callId) {
                try {
                    const currentStatus = await getCallStatus(ws.callId);

                    if (currentStatus !== 'ended') {
                        // Update the call status to "disconnected"
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



