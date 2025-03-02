const supabase = require('../config/supabase');

async function increaseLike(postId) {

    try {
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

async function decreaseLike(postId) {

    try {
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