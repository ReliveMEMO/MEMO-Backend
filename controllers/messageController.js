const { encrypt } = require('../utils/encryption');
const { findOrCreateChat, appendMessage, findOrCreateGroup, appendGroupMessage } = require('../models/messageModel');

async function sendMessage(req, res) {
    const { senderId, receiverId, message } = req.body;

    if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: "Invalid message. It must be a non-empty string." });
    }

    const time_of_msg = new Date().toISOString();
    const encryptedMessage = encrypt(message);

    const { chatId, error: chatError } = await findOrCreateChat(senderId, receiverId);
    if (chatError) return res.status(500).json({ error: chatError.message });

    const messageObject = { [time_of_msg]: encryptedMessage };
    const { data, error } = await appendMessage(chatId, messageObject);

    if (error) return res.status(500).json({ error: error.message });

    const decryptedMessage = decrypt(encryptedMessage);
    res.status(200).json({
        status: 'Message sent',
        chatId,
        time_of_msg,
        decryptedMessage,
    });
}

//group messaging part

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

// async function sendGroupMessage(req, res) {
//     const { groupName, senderId, message } = req.body;

//     if (!message || typeof message !== 'string') {
//         return res.status(400).json({ error: "Invalid message. It must be a non-empty string." });
//     }

//     const time_of_msg = new Date().toISOString();
//     const encryptedMessage = encrypt(message);

//     const { groupId, error: groupError } = await findOrCreateGroup(groupName);
//     if (groupError) return res.status(500).json({ error: groupError.message });

//     if (!groupId) return res.status(500).json({ error: "Group ID not found." });

//     const messageObject = { senderId, content: { [time_of_msg]: encryptedMessage }, time_of_msg };
//     const { data, error } = await appendGroupMessage(groupId, messageObject);

//     if (error) return res.status(500).json({ error: error.message });

//     res.status(200).json({
//         status: 'Message sent',
//         groupId,
//         time_of_msg,
//         message: encryptedMessage,
//     });
// }


module.exports = { sendMessage, sendGroupMessage };