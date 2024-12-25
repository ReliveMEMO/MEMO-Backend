const supabase = require('../config/supabase');

// Save a message to the database
async function saveMessage(grpId, senderId, message) {
    const { data, error } = await supabase.from('grp_message_table').insert([
        { grp_id: grpId, sender_id: senderId, content: message, timestamp: new Date().toISOString() },
    ]);
    return { data, error };
}

// Fetch messages for a group
async function fetchMessages(grpId) {
    const { data, error } = await supabase
        .from('grp_message_table')
        .select('*')
        .eq('grp_id', grpId)
        .order('timestamp', { ascending: true });
    return { data, error };
}

module.exports = { saveMessage, fetchMessages };
