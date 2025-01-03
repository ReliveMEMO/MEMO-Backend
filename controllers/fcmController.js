const express = require('express');
const supabase = require('../config/supabase');

const router = express.Router();

// Endpoint to save FCM token
router.post('/fcm-token', async (req, res) => {
    const { userId, fcmToken } = req.body;

    if (!userId || !fcmToken) {
        return res.status(400).json({ error: 'userId and fcmToken are required' });
    }

    try {
        // Update or insert the FCM token for the user
        const { data, error } = await supabase
        .from('User_Info')
        .update({ fcm_token: fcmToken }) // Update the FCM token
        .eq('id', userId); // Match the row where the id equals userId

        if (error) {
            console.error("Error saving FCM token:", error);
            return res.status(500).json({ error: 'Failed to save FCM token' });
        }

        console.log("User ID:", userId);
        console.log("FCM Token:", fcmToken);

        res.status(200).json({ message: 'FCM token saved successfully' });
        
    } catch (err) {
        console.error("Unexpected error:", err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;