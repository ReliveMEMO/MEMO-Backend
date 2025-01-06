const { encrypt } = require('../utils/encryption');
const { findOrCreateChat, appendMessage, insertMessage, appendGroupMessage, findOrCreateGroup } = require('../models/messageModel');

async function sendMessage(req, res) {
    const { senderId, receiverId, message } = req.body;

    if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: "Invalid message. It must be a non-empty string." });
    }

    const timestamp = new Date().toISOString();
    const encryptedMessage = encrypt(message);

    const { chatId, error: chatError } = await findOrCreateChat(senderId, receiverId);
    if (chatError) return res.status(500).json({ error: chatError.message });

    const messageObject =  encryptedMessage;
    const { data, error } = await insertMessage(chatId,senderId, messageObject);

    if (error) return res.status(500).json({ error: error.message });

    const decryptedMessage = decrypt(encryptedMessage);
    res.status(200).json({
        status: 'Message sent',
        chatId,
        timestamp,
        decryptedMessage,
    });
}

async function sendGroupMessage(req, res) {
    const { grp_id, senderId, message } = req.body;

    if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: "Invalid message. It must be a non-empty string." });
    }

    const time_of_msg = new Date().toISOString();
    const encryptedMessage = encrypt(message);

    if (!grp_id) return res.status(400).json({ error: "Group ID is required." });

    const messageObject = { senderId, content: { [time_of_msg]: encryptedMessage }, time_of_msg };
    const { data, error } = await appendGroupMessage(grp_id, messageObject);

    if (error) return res.status(500).json({ error: error.message });

    res.status(200).json({
        status: 'Message sent',
        groupId: grp_id,
        time_of_msg,
        message: encryptedMessage,
    });
}

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


module.exports = { sendMessage, sendGroupMessage };