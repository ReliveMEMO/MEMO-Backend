const express = require('express');
const { fetchMessages } = require('../models/groupMessageModel');
const router = express.Router();

// Fetch group messages
router.get('/:grpId', async (req, res) => {
    const { grpId } = req.params;
    const { data, error } = await fetchMessages(grpId);
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

module.exports = router;
