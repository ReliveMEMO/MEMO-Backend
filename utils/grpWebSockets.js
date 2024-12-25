const { saveMessage } = require('../models/grpMessageModel');

const connections = new Map(); // Map to store WebSocket connections by user ID

function setupWebSocket(wss) {
    wss.on('connection', (ws) => {
        let userId;

        ws.on('message', async (data) => {
            const parsedData = JSON.parse(data);

            if (parsedData.type === 'register') {
                userId = parsedData.userId;
                connections.set(userId, ws);
            } else if (parsedData.type === 'sendMessage') {
                const { grpId, senderId, message } = parsedData;

                // Save the message to the database
                const { data: savedMessage, error } = await saveMessage(grpId, senderId, message);

                if (!error) {
                    // Broadcast the message to group members
                    const groupMembers = parsedData.members; // Send members from the frontend
                    groupMembers.forEach((memberId) => {
                        const memberSocket = connections.get(memberId);
                        if (memberSocket) {
                            memberSocket.send(
                                JSON.stringify({ type: 'receiveMessage', grpId, senderId, message })
                            );
                        }
                    });
                }
            }
        });

        ws.on('close', () => {
            connections.delete(userId);
        });
    });
}

module.exports = { setupWebSocket };
