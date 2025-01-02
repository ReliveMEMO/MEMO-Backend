const express = require('express');
const { sendMessage } = require('../controllers/messageController');
const router = express.Router();

router.post('/send', sendMessage);
//group update
router.post('/sendGroup', sendGroupMessage);

module.exports = router;