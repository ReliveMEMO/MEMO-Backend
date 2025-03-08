const express = require("express");
const { notifyUser, notifyFollowedUsers, saveNotification} = require("../middleware/pushNotificationService");


const router = express.Router();

router.post("/send-com-notification", async (req, res) => {
    const { sender_id, receiver_id, notification_type ,message } = req.body;

    if (!sender_id || !receiver_id || !notification_type || !message) {
        return res.status(400).json({ error: "sender_id, receiver_id, notification_type and message are required" });
    }

    const result = await notifyUser(sender_id, receiver_id, notification_type, message);
    const saveResult = await saveNotification(sender_id, receiver_id, notification_type, message);

    if (result.success && saveResult.success) {
        return res.status(200).json({ success: "Push notification sent successfully" });
    } else {
        return res.status(500).json({ error: result.error });
    }
});


// New POST method for sending notifications to a list of users
router.post("/tag-users", async (req, res) => {
    const { user_ids, notification_type, message } = req.body;

    if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0 || !notification_type || !message) {
        return res.status(400).json({ error: "user_ids, notification_type, and message are required" });
    }

    try {
        // Loop through the user_ids and send notifications
        for (let i = 0; i < user_ids.length; i++) {
            const receiverId = user_ids[i];
            const result = await notifyUser(null, receiverId, notification_type, message);

            if (!result.success) {
                console.error(`Failed to send notification to user ${receiverId}:`, result.error);
            }
        }

        return res.status(200).json({ success: "Push notifications sent to all users" });
    } catch (err) {
        console.error("Error sending notifications:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});



// New POST method for sending notifications to all followed users
router.post("/send-notification-to-followed", async (req, res) => {
    const { sender_id, notification_type, message } = req.body;

    if (!sender_id || !notification_type || !message) {
        return res.status(400).json({ error: "sender_id, notification_type, and message are required" });
    }

    const result = await notifyFollowedUsers(sender_id, notification_type, message);

    if (result.success) {
        return res.status(200).json({ success: "Push notifications sent to followed users" });
    } else {
        return res.status(500).json({ error: result.error });
    }
});

module.exports = router;
