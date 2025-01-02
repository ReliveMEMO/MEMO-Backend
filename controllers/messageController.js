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


module.exports = { sendMessage };