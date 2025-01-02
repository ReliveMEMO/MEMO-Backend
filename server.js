const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { encrypt, decrypt } = require('./utils/encryption');
const { findOrCreateGroup, appendGroupMessage } = require('./models/messageModel');
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

                const messageObject = { [timestamp]: encryptedMessage };
                const { data: dbData, error: dbError } = await appendMessage(chatId, messageObject);
                if (dbError) throw dbError;

                const decryptedMessage = decrypt(encryptedMessage);

                // Send decrypted message to receiver
                const receiverSocket = connections.get(receiverId);
                if (receiverSocket) {
                    receiverSocket.send(
                        JSON.stringify({
                            type: 'receiveMessage',
                            senderId,
                            message: decryptedMessage,
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

//group messaging part
            
            if (parsedData.type === 'sendGroupMessage') {
                // const { groupName, senderId, message } = parsedData;

                // const time_of_msg = new Date().toISOString();
                // const encryptedMessage = encrypt(message);

                // const { groupId, error: groupError1 } = await findOrCreateGroup(groupName);
                // if (groupError1) throw groupError1;

                // if (!groupId) throw new Error("Group ID not found.");

                // const messageObject = { senderId, content: { [time_of_msg]: encryptedMessage }, time_of_msg };
                // const { data: dbData, error: dbError } = await appendGroupMessage(groupId, messageObject);
                // if (dbError) throw dbError;

                // const decryptedMessage = decrypt(encryptedMessage);

                const { grp_id, senderId, message } = parsedData;

                const time_of_msg = new Date().toISOString();
                const encryptedMessage = encrypt(message);

                if (!grp_id) throw new Error("Group ID is required.");

                const messageObject = { senderId, content: { [time_of_msg]: encryptedMessage }, time_of_msg };
                const { data: dbData, error: dbError } = await appendGroupMessage(grp_id, messageObject);
                if (dbError) throw dbError;

                const decryptedMessage = decrypt(encryptedMessage);

                // Send decrypted message to all group members
                const { data: groupData, error: groupError2 } = await supabase
                    .from('Group_Table')
                    .select('members')
                    .eq('group_id', groupId)
                    .single();

                if (groupError2) throw groupError2;

                const members = groupData.members;
                members.forEach(member => {
                    const memberSocket = connections.get(member.user_id);
                    if (memberSocket) {
                        memberSocket.send(
                            JSON.stringify({
                                type: 'receiveGroupMessage',
                                groupName,
                                senderId,
                                message: decryptedMessage,
                                time_of_msg,
                            })
                        );
                    }
                });

                // Send confirmation back to sender
                ws.send(
                    JSON.stringify({
                        status: 'Message sent',
                        groupId,
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
        console.log('User disconnected:', userId);
        connections.delete(userId);
    });
});

server.listen(process.env.PORT, () => {
    console.log(`Server running on port ${process.env.PORT}`);
});