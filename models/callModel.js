const supabase = require('../config/supabase'); // Import the Supabase client configuration

// Log a new call
async function logCall(callerId, calleeId, status) {
    try {
        // Insert a new call record into the 'ind_calls_table'
        const { data, error } = await supabase
            .from('ind_calls_table')
            .insert([
                {
                    caller_id: callerId, // ID of the user initiating the call
                    callee_id: calleeId, // ID of the user receiving the call
                    status: status, // Initial status of the call (e.g., 'initiated')
                },
            ])
            .select(); // Ensure the inserted row is returned

        if (error) throw error; // Throw an error if the insertion fails
        return data; // Return the newly created record
    } catch (err) {
        console.error('Error logging call:', err); // Log the error
        throw err; // Re-throw the error for further handling
    }
}

// Update call status
async function updateCallStatus(callId, status) {
    try {
        // Update the status of a call in the 'ind_calls_table'
        const { data, error } = await supabase
            .from('ind_calls_table')
            .update({
                status: status, // New status of the call (e.g., 'answered', 'ended', 'disconnected')
                updated_at: new Date().toISOString(), // Update the timestamp
            })
            .eq('id', callId); // Match the call by its unique ID

        if (error) throw error; // Throw an error if the update fails
        return data; // Return the updated record
    } catch (err) {
        console.error('Error updating call status:', err); // Log the error
        throw err; // Re-throw the error for further handling
    }
}

// Get the current call status
async function getCallStatus(callId) {
    try {
        // Fetch the current status of a call from the 'ind_calls_table'
        const { data, error } = await supabase
            .from('ind_calls_table')
            .select('status') // Select only the 'status' column
            .eq('id', callId) // Match the call by its unique ID
            .single(); // Expect a single result

        if (error) throw error; // Throw an error if the query fails
        return data.status; // Return the status field
    } catch (err) {
        console.error('Error fetching call status:', err); // Log the error
        throw err; // Re-throw the error for further handling
    }
}

module.exports = { logCall, updateCallStatus, getCallStatus }; // Export the functions for use in other parts of the application
