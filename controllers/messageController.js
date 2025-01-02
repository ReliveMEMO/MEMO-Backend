const { encrypt } = require('../utils/encryption');
const { findOrCreateChat, appendMessage } = require('../models/messageModel');

async function sendMessage(req, res) {
    const { senderId, receiverId, message } = req.body;

    if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: "Invalid message. It must be a non-empty string." });
    }

    const timestamp = new Date().toISOString();
    const encryptedMessage = encrypt(message);

    const { chatId, error: chatError } = await findOrCreateChat(senderId, receiverId);
    if (chatError) return res.status(500).json({ error: chatError.message });

    const messageObject = { [timestamp]: encryptedMessage };
    const { data, error } = await appendMessage(chatId, messageObject);

    if (error) return res.status(500).json({ error: error.message });

    const decryptedMessage = decrypt(encryptedMessage);
    res.status(200).json({
        status: 'Message sent',
        chatId,
        timestamp,
        decryptedMessage,
    });
}

//group messaging part

async function sendGroupMessage(req, res) {
    const { groupName, senderId, message } = req.body;

    if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: "Invalid message. It must be a non-empty string." });
    }

    const timestamp = new Date().toISOString();
    const encryptedMessage = encrypt(message);

    const { groupId, error: groupError } = await findOrCreateGroup(groupName);
    if (groupError) return res.status(500).json({ error: groupError.message });

    const messageObject = { senderId, content: { [timestamp]: encryptedMessage }, timestamp };
    const { data, error } = await appendGroupMessage(groupId, messageObject);

    if (error) return res.status(500).json({ error: error.message });

    res.status(200).json({
        status: 'Message sent',
        groupId,
        timestamp,
        message: encryptedMessage,
    });
}

module.exports = { sendGroupMessage };




// async function sendMessage(req, res) {
//     const { senderId, receiverId, message } = req.body;

//     // Debugging
//     console.log("Sender ID:", senderId);
//     console.log("Receiver ID:", receiverId);
//     console.log("Message to encrypt:", message);

//     if (!message || typeof message !== 'string') {
//         return res.status(400).json({ error: "Invalid message. It must be a non-empty string." });
//     }

//     const timestamp = new Date().toISOString();
//     const encryptedMessage = encrypt(message);

//     const { chatId, error: chatError } = await findOrCreateChat(senderId, receiverId);
//     if (chatError) {
//         console.error("Chat creation error:", chatError);
//         return res.status(500).json({ error: chatError.message });
//     }

//     const messageObject = { [timestamp]: encryptedMessage };
//     console.log("Message Object to append:", messageObject);

//     const { data, error } = await appendMessage(chatId, messageObject);

//     if (error) {
//         console.error("Error appending message:", error);
//         return res.status(500).json({ error: error.message });
//     }

//     res.status(200).json({ data });
// }


module.exports = { sendMessage };