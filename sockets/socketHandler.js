import { supabase } from '../services/supabaseClient.js';

export default function setupSockets(io) {
    io.on('connection', (socket) => {
        console.log(`Socket connected: ${socket.id}`);

        socket.on('join-room', (roomId, userId) => {
            console.log(`User ${userId} joining room ${roomId}`);
            socket.join(roomId);

            socket.userId = userId;
            socket.roomId = roomId;

            // Notify everyone else in the room
            socket.to(roomId).emit('user-connected', userId);

            // Forward WebRTC Signaling: Offer
            socket.on('webrtc-offer', (offer, toUserId) => {
                socket.to(roomId).emit('webrtc-offer', offer, userId, toUserId);
            });

            // Forward WebRTC Signaling: Answer
            socket.on('webrtc-answer', (answer, toUserId) => {
                socket.to(roomId).emit('webrtc-answer', answer, userId, toUserId);
            });

            // Forward WebRTC Signaling: ICE Candidate
            socket.on('ice-candidate', (candidate, toUserId) => {
                socket.to(roomId).emit('ice-candidate', candidate, userId, toUserId);
            });

            // Chat Message Handlers
            socket.on('chat-message', async (messageObj) => {
                // messageObj expected to be: { text, senderName, senderId }
                io.to(roomId).emit('chat-message', {
                    ...messageObj,
                    timestamp: new Date().toISOString()
                });

                // Save message asynchronously to DB
                try {
                    const { data: roomData } = await supabase
                        .from('Rooms')
                        .select('id')
                        .eq('room_code', roomId)
                        .single();

                    if (roomData?.id && messageObj.senderId && messageObj.text) {
                        await supabase.from('Messages').insert([{
                            room_id: roomData.id,
                            sender_id: messageObj.senderId,
                            message: messageObj.text
                        }]);
                    }
                } catch (err) {
                    console.error("Error saving chat message:", err.message);
                }
            });

            socket.on('disconnect', () => {
                console.log(`User ${userId} disconnected from ${roomId}`);
                socket.to(roomId).emit('user-disconnected', userId);
            });
        });
    });
}
