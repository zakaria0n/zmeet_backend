import express from 'express';
import { supabase, supabaseClient } from '../services/supabaseClient.js';

const router = express.Router();
const RECORDINGS_BUCKET = 'recordings';

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

function getStoragePathFromPublicUrl(fileUrl) {
    try {
        const url = new URL(fileUrl);
        const marker = `/storage/v1/object/public/${RECORDINGS_BUCKET}/`;
        const markerIndex = url.pathname.indexOf(marker);

        if (markerIndex === -1) {
            return null;
        }

        return decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
    } catch {
        return null;
    }
}

async function getOwnedRecording(recordingId, userId) {
    const { data: recording, error } = await supabase
        .from('Recordings')
        .select('id, room_code, file_url')
        .eq('id', recordingId)
        .eq('created_by', userId)
        .single();

    if (error || !recording) {
        return null;
    }

    return recording;
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

router.get('/:recordingId/download', async (req, res) => {
    const { recordingId } = req.params;

    try {
        const user = await getAuthenticatedUser(req);
        const recording = await getOwnedRecording(recordingId, user.id);

        if (!recording) {
            return res.status(404).json({ error: 'Recording not found' });
        }

        const storagePath = getStoragePathFromPublicUrl(recording.file_url);
        if (!storagePath) {
            return res.status(400).json({ error: 'Invalid recording file path' });
        }

        const { data, error } = await supabase.storage
            .from(RECORDINGS_BUCKET)
            .download(storagePath);

        if (error || !data) throw error || new Error('Download failed');

        const arrayBuffer = await data.arrayBuffer();
        const fileName = `${recording.room_code}-${recording.id}.webm`;

        res.setHeader('Content-Type', data.type || 'video/webm');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.status(200).send(Buffer.from(arrayBuffer));
    } catch (err) {
        const status = err.message === 'Missing auth token' || err.message === 'Invalid auth token' ? 401 : 500;
        res.status(status).json({ error: err.message });
    }
});

router.delete('/:recordingId', async (req, res) => {
    const { recordingId } = req.params;

    try {
        const user = await getAuthenticatedUser(req);
        const recording = await getOwnedRecording(recordingId, user.id);

        if (!recording) {
            return res.status(404).json({ error: 'Recording not found' });
        }

        const storagePath = getStoragePathFromPublicUrl(recording.file_url);

        if (storagePath) {
            const { error: storageError } = await supabase.storage
                .from(RECORDINGS_BUCKET)
                .remove([storagePath]);

            if (storageError) {
                throw storageError;
            }
        }

        const { error: deleteError } = await supabase
            .from('Recordings')
            .delete()
            .eq('id', recordingId)
            .eq('created_by', user.id);

        if (deleteError) throw deleteError;

        res.status(200).json({ success: true });
    } catch (err) {
        const status = err.message === 'Missing auth token' || err.message === 'Invalid auth token' ? 401 : 500;
        res.status(status).json({ error: err.message });
    }
});

export default router;
