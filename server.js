import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes.js';
import roomRoutes from './routes/roomRoutes.js';
import setupSockets from './sockets/socketHandler.js';

dotenv.config();

const app = express();
const server = http.createServer(app);

// CORS config
app.use(cors({
    origin: '*', // For development. In production, restrict to Vercel domain.
    methods: ['GET', 'POST']
}));

app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);

// Socket.io setup
const io = new Server(server, {
    cors: {
        origin: '*', // Allow all origins for dev
        methods: ['GET', 'POST']
    }
});

setupSockets(io);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date() });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`ZMeet signaling Server running on port ${PORT}`);
});
