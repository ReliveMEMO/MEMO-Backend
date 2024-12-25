const { encrypt } = require('../utils/encryption');
const { findOrCreateChat, appendMessage } = require('../models/messageModel');

// async function sendMessage(req, res) {
//     const { senderId, receiverId, message } = req.body;
//     const timestamp = new Date().toISOString();
//     const encryptedMessage = encrypt(message);

//     const { chatId, error: chatError } = await findOrCreateChat(senderId, receiverId);
//     if (chatError) return res.status(500).json({ error: chatError.message });

//     const messageObject = { [timestamp]: encryptedMessage };
//     const { data, error } = await appendMessage(chatId, senderId, receiverId, messageObject);
//     if (error) return res.status(500).json({ error: error.message });

//     res.status(200).json({ data });
// }

async function sendMessage(req, res) {
    const { senderId, receiverId, message } = req.body;

    // Debugging
    console.log("Sender ID:", senderId);
    console.log("Receiver ID:", receiverId);
    console.log("Message to encrypt:", message);

    if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: "Invalid message. It must be a non-empty string." });
    }

    const timestamp = new Date().toISOString();
    const encryptedMessage = encrypt(message);

    const { chatId, error: chatError } = await findOrCreateChat(senderId, receiverId);
    if (chatError) {
        console.error("Chat creation error:", chatError);
        return res.status(500).json({ error: chatError.message });
    }

    const messageObject = { [timestamp]: encryptedMessage };
    console.log("Message Object to append:", messageObject);

    const { data, error } = await appendMessage(chatId, messageObject);

    if (error) {
        console.error("Error appending message:", error);
        return res.status(500).json({ error: error.message });
    }

    res.status(200).json({ data });
}


module.exports = { sendMessage };