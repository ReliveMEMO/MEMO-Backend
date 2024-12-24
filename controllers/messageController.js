const { encrypt, decrypt } = require('../utils/encryption');
const { createMessagesBatch, getMessages } = require('../models/messageModel');

async function sendMessagesBatch(req, res) {
    const { messages } = req.body; // Array of { senderId, receiverId, message }
    const encryptedMessages = messages.map(msg => ({
        sender_id: msg.senderId,
        receiver_id: msg.receiverId,
        encrypted_message: encrypt(msg.message)
    }));

    console.log("Encrypted Messages to Insert:", encryptedMessages); // Debug the batch

    const { data, error } = await createMessagesBatch(encryptedMessages);
    if (error) return res.status(500).json({ error });
    res.status(200).json({ data });
}

async function fetchMessages(req, res) {
    const { receiverId } = req.params;
    const { data, error } = await getMessages(receiverId);
    if (error) return res.status(500).json({ error });
    const decryptedMessages = data.map(msg => ({
        ...msg,
        decrypted_message: decrypt(msg.encrypted_message)
    }));
    res.status(200).json({ data: decryptedMessages });
}

module.exports = { sendMessagesBatch, fetchMessages };