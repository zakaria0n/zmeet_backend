import express from 'express';
import { supabase, supabaseClient } from '../services/supabaseClient.js';

const router = express.Router();

async function getAuthenticatedUser(req) {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
        throw new Error('Missing auth token');
    }

    const { data: { user }, error } = await supabaseClient.auth.getUser(token);

    if (error || !user) {
        throw new Error('Invalid auth token');
    }

    return user;
}

// Get all recordings for a specific user
router.get('/my-recordings', async (req, res) => {
    try {
        const user = await getAuthenticatedUser(req);

        const { data, error } = await supabase
            .from('Recordings')
            .select(`
                id,
                room_code,
                file_url,
                created_at
            `)
            .eq('created_by', user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.status(200).json(data);
    } catch (err) {
        const status = err.message === 'Missing auth token' || err.message === 'Invalid auth token' ? 401 : 500;
        res.status(status).json({ error: err.message });
    }
});

// Save recording metadata to Database
router.post('/save-metadata', async (req, res) => {
    const { room_code, file_url } = req.body;

    if (!room_code || !file_url) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const user = await getAuthenticatedUser(req);

        const { data, error } = await supabase
            .from('Recordings')
            .insert([{ room_code, created_by: user.id, file_url }]);

        if (error) throw error;
        res.status(201).json({ success: true, data });
    } catch (err) {
        const status = err.message === 'Missing auth token' || err.message === 'Invalid auth token' ? 401 : 500;
        res.status(status).json({ error: err.message });
    }
});

export default router;
