const express = require("express");
const { notifyUser } = require("../middleware/pushNotificationService");

const router = express.Router();

router.post("/send-notification", async (req, res) => {
    const { sender_id, receiver_id, message } = req.body;

    if (!sender_id || !receiver_id || !message) {
        return res.status(400).json({ error: "sender_id, receiver_id, and message are required" });
    }

    const result = await notifyUser(sender_id, receiver_id, message);

    if (result.success) {
        return res.status(200).json({ success: "Push notification sent successfully" });
    } else {
        return res.status(500).json({ error: result.error });
    }
});

module.exports = router;
