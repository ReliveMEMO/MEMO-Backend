const supabase = require('../config/supabase');

// Log a new call
async function logCall(callerId, calleeId, status) {
    try {
        const { data, error } = await supabase
            .from('ind_calls_table')
            .insert([
                {
                    caller_id: callerId,
                    callee_id: calleeId,
                    status: status,
                },
            ])
            .select(); // Ensure the inserted row is returned
        if (error) throw error;
        return data; // Return the newly created record
    } catch (err) {
        console.error('Error logging call:', err);
        throw err;
    }
}


// Update call status
async function updateCallStatus(callId, status) {
    try {
        const { data, error } = await supabase
            .from('ind_calls_table')
            .update({ status: status, updated_at: new Date().toISOString() })
            .eq('id', callId);
        if (error) throw error;
        return data;
    } catch (err) {
        console.error('Error updating call status:', err);
        throw err;
    }
}

// Get the current call status
async function getCallStatus(callId) {
    try {
        const { data, error } = await supabase
            .from('ind_calls_table')
            .select('status')
            .eq('id', callId)
            .single(); // Expect a single result
        if (error) throw error;
        return data.status; // Return the status field
    } catch (err) {
        console.error('Error fetching call status:', err);
        throw err;
    }
}

module.exports = { logCall, updateCallStatus , getCallStatus};
