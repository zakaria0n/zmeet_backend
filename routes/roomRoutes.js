import express from 'express';
import { supabase } from '../services/supabaseClient.js';
import crypto from 'crypto';

const router = express.Router();

function generateRoomCode() {
    return crypto.randomBytes(3).toString('hex'); // e.g., 'adc123'
}

// Create a new room
router.post('/create', async (req, res) => {
    const { created_by } = req.body; // user auth id
    if (!created_by) return res.status(400).json({ error: 'created_by is required' });

    const room_code = generateRoomCode();

    try {
        const { data, error } = await supabase
            .from('Rooms')
            .insert([{ room_code, created_by }])
            .select()
            .single();

        if (error) throw error;

        res.status(201).json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get room details by its code
router.get('/:roomCode', async (req, res) => {
    const { roomCode } = req.params;

    try {
        const { data, error } = await supabase
            .from('Rooms')
            .select('*')
            .eq('room_code', roomCode)
            .single();

        if (error || !data) {
            return res.status(404).json({ error: 'Room not found' });
        }

        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
