const express = require('express');
const { sendMessage, sendGroupMessage } = require('../controllers/messageController');
const router = express.Router();

router.post('/send', sendMessage);
router.post('/sendGroup', sendGroupMessage);

module.exports = router;