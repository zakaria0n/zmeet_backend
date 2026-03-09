import express from 'express';
import { supabase } from '../services/supabaseClient.js';

const router = express.Router();

// Get all recordings for a specific user
router.get('/my-recordings', async (req, res) => {
    // Basic extraction, usually handled by a middleware
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Missing auth token' });

    // In a real app we'd verify the JWT, here we trust the created_by sent by frontend or fetch using supabaseClient auth (which requires standard anon token).
    // Using simple query parameter for demo purposes matching the requesting user
    const userId = req.query.userId;

    if (!userId) return res.status(400).json({ error: 'userId parameter required' });

    try {
        const { data, error } = await supabase
            .from('Recordings')
            .select(`
                id,
                room_code,
                file_url,
                created_at
            `)
            .eq('created_by', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.status(200).json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Save recording metadata to Database
router.post('/save-metadata', async (req, res) => {
    const { room_code, created_by, file_url } = req.body;

    if (!room_code || !created_by || !file_url) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const { data, error } = await supabase
            .from('Recordings')
            .insert([{ room_code, created_by, file_url }]);

        if (error) throw error;
        res.status(201).json({ success: true, data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
