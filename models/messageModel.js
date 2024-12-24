const supabase = require('../config/supabase');

async function createMessagesBatch(messages) {
    console.log("Batch Data to Save:", messages); // Log the batch data
    const { data, error } = await supabase.from('message_table').insert(messages);
    if (error) {
        console.error("Supabase Insert Error:", error); // Log any Supabase errors
    } else {
        console.log("Supabase Insert Response:", data); // Log the response
    }
    return { data, error };
}

async function getMessages(receiverId) {
    const { data, error } = await supabase
        .from('message_table')
        .select('*')
        .eq('receiver_id', receiverId)
        .order('created_at', { ascending: true });
    return { data, error };
}

module.exports = { createMessagesBatch, getMessages };