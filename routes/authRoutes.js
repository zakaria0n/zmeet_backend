import express from 'express';
import { supabase, supabaseClient } from '../services/supabaseClient.js';

const router = express.Router();

router.post('/signup', async (req, res) => {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
        return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    try {
        // Sign up with Supabase Auth
        const { data: authData, error: authError } = await supabaseClient.auth.signUp({
            email,
            password
        });

        if (authError) throw authError;

        // Insert into Users table explicitly. It might fail if email is already taken, etc.
        if (authData?.user) {
            const { error: dbError } = await supabase.from('Users').upsert([
                { id: authData.user.id, email, name }
            ]);

            if (dbError) {
                console.error("DB Insert Error:", dbError);
            }
        }

        res.status(201).json({ message: 'User created successfully', user: authData.user });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;

        // Fetch user from DB to return name
        const { data: userData } = await supabase
            .from('Users')
            .select('id, name, email')
            .eq('id', data.user.id)
            .single();

        res.status(200).json({ session: data.session, user: userData || data.user });
    } catch (error) {
        res.status(401).json({ error: error.message });
    }
});

router.get('/me', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });

    try {
        const { data: { user }, error } = await supabaseClient.auth.getUser(token);
        if (error || !user) throw error;

        // Fetch user profile from Users table
        const { data: userData } = await supabase
            .from('Users')
            .select('id, name, email')
            .eq('id', user.id)
            .single();

        res.json({ user: userData || user });
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
});

export default router;
