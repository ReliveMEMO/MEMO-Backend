const express = require('express');
const { sendMessagesBatch, fetchMessages } = require('../controllers/messageController');
const router = express.Router();

router.post('/sendBatch', sendMessagesBatch);
router.get('/fetch/:receiverId', fetchMessages);

module.exports = router;