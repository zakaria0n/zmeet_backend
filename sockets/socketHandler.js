import { supabase } from '../services/supabaseClient.js';

async function getRoomByCode(roomCode) {
    const { data, error } = await supabase
        .from('Rooms')
        .select('id, room_code')
        .eq('room_code', roomCode)
        .single();

    if (error || !data) {
        return null;
    }

    return data;
}

async function getRoomChatHistory(roomId) {
    const { data: messages, error } = await supabase
        .from('Messages')
        .select('sender_id, message, created_at')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true })
        .limit(100);

    if (error || !messages?.length) {
        return [];
    }

    const senderIds = [...new Set(messages.map(message => message.sender_id).filter(Boolean))];
    let usersById = {};

    if (senderIds.length > 0) {
        const { data: users } = await supabase
            .from('Users')
            .select('id, name, email')
            .in('id', senderIds);

        usersById = (users || []).reduce((accumulator, currentUser) => {
            accumulator[currentUser.id] = currentUser;
            return accumulator;
        }, {});
    }

    return messages.map(message => ({
        senderId: message.sender_id || 'system',
        senderName: usersById[message.sender_id]?.name || usersById[message.sender_id]?.email || 'Unknown user',
        text: message.message,
        timestamp: message.created_at,
        isSelf: false
    }));
}

function getExistingUsersInRoom(io, roomId) {
    const room = io.sockets.adapter.rooms.get(roomId);

    if (!room) {
        return [];
    }

    return [...room]
        .map(socketId => io.sockets.sockets.get(socketId))
        .filter(Boolean)
        .filter(currentSocket => currentSocket.userId)
        .map(currentSocket => ({
            userId: currentSocket.userId,
            userName: currentSocket.userName
        }));
}

export default function setupSockets(io) {
    io.on('connection', (socket) => {
        console.log(`Socket connected: ${socket.id}`);

        socket.on('join-room', async (roomId, userId, userName) => {
            console.log(`User ${userId} joining room ${roomId}`);

            const room = await getRoomByCode(roomId);
            if (!room) {
                socket.emit('room-error', { message: 'Room not found' });
                return;
            }

            const existingUsers = getExistingUsersInRoom(io, roomId);

            socket.userId = userId;
            socket.roomId = roomId;
            socket.userName = userName;
            socket.join(roomId);

            const chatHistory = await getRoomChatHistory(room.id);
            socket.emit('chat-history', chatHistory);
            socket.emit('existing-users', existingUsers);

            socket.to(roomId).emit('user-connected', { userId, userName });

            socket.on('webrtc-offer', ({ offer, target }) => {
                socket.to(roomId).emit('webrtc-offer', {
                    offer,
                    senderId: userId,
                    target
                });
            });

            socket.on('webrtc-answer', ({ answer, target }) => {
                socket.to(roomId).emit('webrtc-answer', {
                    answer,
                    senderId: userId,
                    target
                });
            });

            socket.on('ice-candidate', ({ candidate, target }) => {
                socket.to(roomId).emit('ice-candidate', {
                    candidate,
                    senderId: userId,
                    target
                });
            });

            socket.on('chat-message', async (messageObj) => {
                io.to(roomId).emit('chat-message', {
                    ...messageObj,
                    timestamp: new Date().toISOString()
                });

                try {
                    if (room?.id && messageObj.senderId && messageObj.text) {
                        await supabase.from('Messages').insert([{
                            room_id: room.id,
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
                socket.to(roomId).emit('user-disconnected', { userId });
            });
        });
    });
}
