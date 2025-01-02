const supabase = require('../config/supabase');
//const { v4: uuidv4 } = require('uuid');

async function findOrCreateChat(senderId, receiverId) {
    // Ensure consistent order for senderId and receiverId
    const participants = [senderId, receiverId].sort();

    // Check if the chat already exists
    let { data, error } = await supabase
        .from('ind_chat_table')
        .select('*')
        .eq('user1', participants[0])
        .eq('user2', participants[1])
        .single();

    if (error && error.code === 'PGRST116') {
        // Chat does not exist; create a new one
        ({ data, error } = await supabase.from('ind_chat_table').insert({
            user1: participants[0],
            user2: participants[1],
        }).select('*').single());

        if (error) {
            console.error("Error fetching chat:", error);
        } else {
            console.log("Fetched chat data:", data);
        }

        console.log("Chat creation data:", data);

        if (data) {
            const chatId = data.chat_id;
            await updateUserChats(participants[0], chatId);
            await updateUserChats(participants[1], chatId);
        }
    }

    return { chatId: data?.chat_id, error };
}

async function updateUserChats(userId, chatId) {
    const { data, error } = await supabase
        .from('User_Info')
        .select('chats')
        .eq('id', userId)
        .single();

    if (error) {
        console.error(`Error fetching chats for user ${userId}:`, error);
        return;
    }

    console.log(`Fetched chats for user ${userId}:`, data?.chats);

    const currentChats = data?.chats ?? [];
    const updatedChats = [chatId, ...currentChats];

    console.log(`Updated chats for user ${userId}:`, updatedChats);


    const { error: updateError } = await supabase
        .from('User_Info')
        .update({ chats: updatedChats })
        .eq('id', userId);

        if (updateError) {
            console.error(`Error updating chats for user ${userId}:`, updateError);
        } else {
            console.log(`Successfully updated chats for user ${userId}`);
        }
}

async function insertMessage(chatId, senderId, content) {
    const { data, error } = await supabase
        .from('ind_message_table')
        .insert({ chat_id: chatId, sender_id: senderId, message: content })
        .select('*')
        .single();

        if (error) {
            console.error("Error inserting message:", error);
        }

    return { data, error };
}

async function appendMessage(chatId, messageObject) {
    // Fetch the current content for the chat ID
    const { data: currentData, error: fetchError } = await supabase
        .from('message_table')
        .select('content')
        .eq('chat_id', chatId)
        .single();

    if (fetchError) {
        console.error("Error fetching current content:", fetchError);
        return { data: null, error: fetchError };
    }

    // Ensure current content is an array
    const currentContent = Array.isArray(currentData?.content) ? currentData.content : [];

    // Debugging
    console.log("Current Content:", currentContent);

    // Append the new message object
    const updatedContent = [...currentContent, messageObject];

    // Debugging
    console.log("Updated Content:", updatedContent);

    // Update the content column in the database
    const { data, error } = await supabase
        .from('message_table')
        .update({ content: updatedContent })
        .eq('chat_id', chatId)
        .select('*');

    if (error) {
        console.error("Error updating content:", error);
    }

    return { data, error };
}

