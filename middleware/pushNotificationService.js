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


/**
 * Fetch all followed users of a given sender_id
 */
async function getFollowedUsers(senderId) {
    try {
        const { data, error } = await supabase
            .from("user_following")
            .select("followed_id")
            .eq("follower_id", senderId);

        if (error) {
            console.error("Error fetching followed users:", error);
            return [];
        }

        return data.map((user) => user.followed_id);
    } catch (err) {
        console.error("Unexpected error fetching followed users:", err);
        return [];
    }
}

/**
 * Notify all followed users of a sender
 */
async function notifyFollowedUsers(senderId, notificationType, message) {
    try {
        const followedUserIds = await getFollowedUsers(senderId);

        if (followedUserIds.length === 0) {
            console.log("No followed users found for sender:", senderId);
            return { success: false, error: "No followed users found" };
        }

        for (const followedId of followedUserIds) {
            await notifyUser(senderId, followedId, notificationType, message);
        }

        return { success: true };
    } catch (err) {
        console.error("Error notifying followed users:", err);
        return { success: false, error: "Internal server error" };
    }
}



async function saveNotification(senderId, receiverId, notificationType, message) {
    try {
        // Save the notification to the database
            const { data, error } = await supabase
                .from("notification_table")
                .insert([
                    {
                        sender_id: senderId,
                        receiver_id: receiverId,
                        notification_type: notificationType,
                        message: message,
                    },
                ]);

            if (error) {
                console.error("Error saving notification:", error);
                return { success: false, error: "Failed to save notification" };
            }

            return { success: true };
        
    } catch (err) {
        console.error("Unexpected error saving notification:", err);
        return { success: false, error: "Internal server error" };
    }
}


async function saveNotificationConditions(senderId, receiverId, notificationType, message) {

    if(notificationType === "Like"){
        await saveNotification(senderId, receiverId, notificationType, message);
        return { success: true };
    }

    if (notificationType === "Comment"){
        await saveNotification(senderId, receiverId, notificationType, message);
        return { success: true };
    }


    
    
}


module.exports = { handlePushNotification ,notifyUser, notifyFollowedUsers, saveNotificationConditions };