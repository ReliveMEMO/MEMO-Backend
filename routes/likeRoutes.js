const express = require('express');
const { increaseLike, decreaseLike } = require('../middleware/likeService');
const router = express.Router();

// Route to increase likes for a post
router.post('/like/increase', async (req, res) => {
    const { postId } = req.body; // Get postId from the request body

    const result = await increaseLike(postId); // Call the increaseLike function

    if (result.success) {
        res.status(200).json({ message: result.message }); // Send success response
    } else {
        res.status(500).json({ error: result.error }); // Send error response
    }
});

// Route to decrease likes for a post
router.post('/like/decrease', async (req, res) => {
    const { postId } = req.body; // Get postId from the request body

    const result = await decreaseLike(postId); // Call the decreaseLike function

    if (result.success) {
        res.status(200).json({ message: result.message }); // Send success response
    } else {
        res.status(500).json({ error: result.error }); // Send error response
    }
});

module.exports = router;
