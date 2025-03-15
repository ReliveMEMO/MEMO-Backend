const supabase = require('../config/supabase');
//post like increase when user like the post
async function increaseLike(postId) {

    try {
        // Call the increment_like stored procedure(increament_like.sql) with the post_id parameter
        const { error } = await supabase.rpc('increment_like', { p_post_id: postId });

        if (error) {
            console.error('Error incrementing like count:', error);
            return { success: false, error: 'Error incrementing like count' };
        }

        return { success: true, message: 'Like added' };
    } catch (err) {
        console.error('Unexpected error handling like:', err);
        return { success: false, error: 'Internal server error' };
    }


}

//post like decrease when user unlike the post
async function decreaseLike(postId) {

    try {
        // Call the decrement_like stored procedure(decrement_like.sql) with the post_id parameter
        const { error } = await supabase.rpc('decrement_like', { p_post_id: postId });

        if (error) {
            console.error('Error decrementing like count:', error);
            return { success: false, error: 'Error decrementing like count' };
        }

        return { success: true, message: 'Like removed' };
    } catch (err) {
        console.error('Unexpected error handling like:', err);
        return { success: false, error: 'Internal server error' };
    }

}

module.exports = { increaseLike, decreaseLike };