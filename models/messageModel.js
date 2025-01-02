const supabase = require('../config/supabase');
//const { v4: uuidv4 } = require('uuid');

async function findOrCreateChat(senderId, receiverId) {
    // Ensure consistent order for senderId and receiverId
    const participants = [senderId, receiverId].sort();

    // Check if the chat already exists
    let { data, error } = await supabase
        .from('message_table')
        .select('*')
        .eq('sender_id', participants[0])
        .eq('receiver_id', participants[1])
        .single();

    if (error && error.code === 'PGRST116') {
        // Chat does not exist; create a new one
        ({ data, error } = await supabase.from('message_table').insert({
            sender_id: participants[0],
            receiver_id: participants[1],
            content: []
        }).select('*').single());
    }

    return { chatId: data?.chat_id, error };
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


//group messaging part

async function findOrCreateGroup(groupName) {
    let { data, error } = await supabase
        .from('Group_Table')
        .select('*')
        .eq('group_name', groupName)
        .single();

    if (error && error.code === 'PGRST116') {
        ({ data, error } = await supabase.from('Group_Table').insert({
            group_name: groupName,
            created_at: new Date().toISOString(),
            members: []
        }).select('*').single());
    }

    return { groupId: data?.group_id, error };
}

async function appendGroupMessage(groupId, messageObject) {
    const { data, error } = await supabase
        .from('grp_msg_table')
        .insert({
            grp_id: groupId,
            sender_id: messageObject.senderId,
            content: messageObject.content,
            time_of_msg: messageObject.time_of_msg
        })
        .select('*');

    return { data, error };
}

// async function findOrCreateGroup(groupName) {
//     let { data, error } = await supabase
//         .from('Group_Table')
//         .select('*')
//         .eq('group_name', groupName)
//         .single();

//     if (error && error.code === 'PGRST116') {
//         ({ data, error } = await supabase.from('Group_Table').insert({
//             group_name: groupName
//         }).select('*').single());
//     }

//     return { groupId: data?.group_id, error };
// }

// async function appendGroupMessage(groupId, messageObject) {
//     const { data, error } = await supabase
//         .from('grp_msg_table')
//         .insert({
//             group_id: groupId,
//             sender_id: messageObject.senderId,
//             content: messageObject.content,
//             time_of_msg: messageObject.time_of_msg
//         })
//         .select('*');

//     return { data, error };
// }

module.exports = { findOrCreateChat, appendMessage, findOrCreateGroup, appendGroupMessage };