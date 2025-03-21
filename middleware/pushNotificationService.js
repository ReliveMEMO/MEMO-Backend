const supabase = require('../config/supabase');
const admin = require('../config/firebase-service-account');



/**
 * Handle push notifications for a chat message
 * This function fetches the recent messages for a chat and sender, and sends a push notification to the receiver
 * It sends a summarized notification if there are multiple unseen messages
*/
async function handlePushNotification(chatId, senderId, receiverId, currentMessage) {
    try {
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
        const { data: user, error: userError } = await supabase
            .from('User_Info')
            .select('fcm_token,full_name')
            .eq('id', senderId)
            .single();

        if (userError) {
            console.error("Error fetching user info:", userError);
            return;
        }

        if (unseenMessages.length === 1) {
            // Send current message as notification
            await sendPushNotification(receiverId, senderId, currentMessage, user.full_name);
        } else if (unseenMessages.length > 1) {
            // Send summarized notification
            const notificationBody = `${unseenMessages.length} new messages from ${user.full_name}`;
            await sendPushNotification(receiverId, senderId, notificationBody, user.full_name);
        }
    } catch (err) {
        console.error("Error handling push notification:", err);
    }
}



/**
 * Send a push notification to a user using their FCM token
 * This function sends a notification to the user using their FCM token
 */
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
        // Fetch receiver's FCM token from Supabase
        const { data: user, error } = await supabase
            .from("User_Info")
            .select("fcm_token")
            .eq("id", receiverId)
            .single();

        if (error || !user?.fcm_token) {
            console.error("FCM token not found for receiver:", error);
            return { success: false, error: "FCM token not found" };
        }

        // Prepare the push notification payload
        const payload = {
            token: user.fcm_token,
            notification: {
                title: `${notificationType}`,
                body: message,
            },
        };

        // Send push notification using Firebase
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
            await saveNotificationConditions(senderId, followedId, notificationType, message);
        }

        return { success: true };
    } catch (err) {
        console.error("Error notifying followed users:", err);
        return { success: false, error: "Internal server error" };
    }
}


/**
 * Save the notification to the database
 */

async function saveNotification(senderId, receiverId, notificationType, message,notificationTitle) {
    try {
        // Save the notification to the database
            const { data, error } = await supabase
                .from("notification_table")
                .insert([
                    {
                        sender_id: senderId, // User ID of the sender
                        receiver_id: receiverId, // User ID of the receiver
                        notification_type: notificationType, // Friends, Notification
                        message: message, // Notification message
                        notification_title: notificationTitle, // Like, Comment, Tag, Event Participation
                    },
                ]);
            console.log("Notification saved:", data);

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


/**
 * Save the notification conditions to the database
 */

async function saveNotificationConditions(senderId, receiverId, notificationType, message) {

    try {
        console.log("Saving notification process");
        const friendSection = "activity";
        const notificationSection = "notification";

        const friendSectionTypes = ["Tag", "Event Participation"];
        const notificationSectionTypes = ["Like", "Comment", "Follow", "Follow-Request"];

        switch (notificationType) {
            case "Like":
                message = "Liked your post";
                break;
            case "Comment":
                message = "Commented on your post";
                break;
            case "Tag":
                message = "Tagged you in a post";
                break;
            case "Follow":
                message = "Started following you";
                break;
            case "Follow-Request":
                message = "Sent you a follow request";
                break;
        }
        
        if (friendSectionTypes.includes(notificationType)) {
            await saveNotification(senderId, receiverId, friendSection, message, notificationType);
            return { success: true };
        } 
        
        else if (notificationSectionTypes.includes(notificationType)) {
            console.log("Saving notification:", notificationType);
            await saveNotification(senderId, receiverId, notificationSection, message, notificationType);
            return { success: true };
        }    
        
        else {
            console.error("Invalid notification type:", notificationType);
            return { success: false, error: "Invalid notification type" };
        }
    } catch (err) {
        console.error("Error saving notification condition:", err);
        return { success: false, error: "Internal server error" };
    }


    
    
}


/**
 * Save the FCM token for a user
 */
async function checkAndUpdateFCM (userId, fcmToken) {
    try {
        // Update or insert the FCM token for the user
        const { data, error } = await supabase
            .from('User_Info')
            .update({ fcm_token: fcmToken }) // Update the FCM token
            .eq('id', userId); // Match the row where the id equals userId

        if (error) {
            console.error("Error saving FCM token:", error);
            return { success: false, error: "Failed to save FCM token" };
        }

        console.log("User ID:", userId);
        console.log("FCM Token:", fcmToken);

        return { success: true };
        
    } catch (err) {
        console.error("Unexpected error:", err);
        return { success: false, error: "Internal server error" };
    }
}


module.exports = { handlePushNotification ,notifyUser, notifyFollowedUsers, saveNotificationConditions, checkAndUpdateFCM };