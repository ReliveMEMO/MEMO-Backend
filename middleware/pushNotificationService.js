const supabase = require('../config/supabase');
const admin = require('../config/firebase-service-account');

async function handlePushNotification(chatId, senderId, receiverId, currentMessage) {
    // Fetch recent 20 messages for the chat and sender
    const { data: messages, error } = await supabase
        .from('ind_message_table')
        .select('*')
        .eq('chat_id', chatId)
        .eq('sender_id', senderId)
        .order('time_stamp', { ascending: false })
        .limit(20);

    if (error) {
        console.error("Error fetching messages:", error);
        return;
    }

    // Count unseen messages
    const unseenMessages = messages.filter((msg) => !msg.is_seen);
    const { data: user, errorX } = await supabase
    .from('User_Info')
    .select('fcm_token,full_name')
    .eq('id', senderId)
    .single();


    if (unseenMessages.length === 1) {
        // Send current message as notification
        await sendPushNotification(receiverId, senderId, currentMessage,user.full_name);
    } else if (unseenMessages.length > 1) {
        // Send summarized notification
        const notificationBody = `${unseenMessages.length} new messages from ${user.full_name}`;
        await sendPushNotification(receiverId, senderId, notificationBody,user.full_name);
}
}

async function sendPushNotification(receiverId, senderId, messageBody,fullName) {
    const { data: user, error } = await supabase
        .from('User_Info')
        .select('fcm_token')
        .eq('id', receiverId)
        .single();

    if (error || !user?.fcm_token) {
        console.error("Error fetching FCM token for user:", error);
        return;
    }

    const message = {
        token: user.fcm_token,
        notification: {
            title: `Message from ${fullName}`,
            body: messageBody,
        },
        android: {
            notification: {
                tag: senderId, // Group notifications by sender
            },
        },
        apns: {
            payload: {
                aps: {
                    "thread-id": senderId, // Group notifications by sender on iOS
                },
            },
        },
    };

    try {
        const response = await admin.messaging().send(message);
        console.log(`Push notification sent to ${receiverId}:`, response);
    } catch (err) {
        console.error("Error sending push notification:", err);
    }
}

/**
 * Alternative method to send push notifications
 * This function fetches the FCM token and sends the notification internally
 */
async function notifyUser(senderId, receiverId, notificationType ,message) {
    try {
        // 1. Fetch receiver's FCM token from Supabase
        const { data: user, error } = await supabase
            .from("User_Info")
            .select("fcm_token")
            .eq("id", receiverId)
            .single();

        if (error || !user?.fcm_token) {
            console.error("FCM token not found for receiver:", error);
            return { success: false, error: "FCM token not found" };
        }

        // 2. Prepare the push notification payload
        const payload = {
            token: user.fcm_token,
            notification: {
                title: `${notificationType}`,
                body: message,
            },
        };

        // 3. Send push notification using Firebase
        await admin.messaging().send(payload);

        console.log(`Notification sent to User ${receiverId}`);
        return { success: true };
        
    } catch (err) {
        console.error("Error sending push notification:", err);
        return { success: false, error: "Internal server error" };
    }
}


module.exports = { handlePushNotification ,notifyUser};