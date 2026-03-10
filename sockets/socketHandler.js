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
        .filter(currentSocket => currentSocket.data.userId)
        .map(currentSocket => ({
            userId: currentSocket.data.userId,
            userName: currentSocket.data.userName
        }));
}

function findSocketByUserId(io, roomId, userId) {
    const room = io.sockets.adapter.rooms.get(roomId);

    if (!room) {
        return null;
    }

    for (const socketId of room) {
        const currentSocket = io.sockets.sockets.get(socketId);

        if (currentSocket?.data.userId === userId) {
            return currentSocket;
        }
    }

    return null;
}

function emitToTarget(io, roomId, targetUserId, eventName, payload) {
    if (!roomId || !targetUserId) {
        return;
    }

    const targetSocket = findSocketByUserId(io, roomId, targetUserId);
    targetSocket?.emit(eventName, payload);
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

            socket.data.roomId = roomId;
            socket.data.roomDbId = room.id;
            socket.data.userId = userId;
            socket.data.userName = userName;
            socket.join(roomId);

            const chatHistory = await getRoomChatHistory(room.id);
            socket.emit('chat-history', chatHistory);
            socket.emit('existing-users', existingUsers);

            socket.to(roomId).emit('user-connected', { userId, userName });
        });

        socket.on('webrtc-offer', ({ offer, target }) => {
            emitToTarget(io, socket.data.roomId, target, 'webrtc-offer', {
                offer,
                senderId: socket.data.userId,
                target
            });
        });

        socket.on('webrtc-answer', ({ answer, target }) => {
            emitToTarget(io, socket.data.roomId, target, 'webrtc-answer', {
                answer,
                senderId: socket.data.userId,
                target
            });
        });

        socket.on('ice-candidate', ({ candidate, target }) => {
            emitToTarget(io, socket.data.roomId, target, 'ice-candidate', {
                candidate,
                senderId: socket.data.userId,
                target
            });
        });

        socket.on('chat-message', async (messageObj) => {
            if (!socket.data.roomId) {
                return;
            }

            io.to(socket.data.roomId).emit('chat-message', {
                ...messageObj,
                timestamp: new Date().toISOString()
            });

            try {
                if (socket.data.roomDbId && messageObj.senderId && messageObj.text) {
                    await supabase.from('Messages').insert([{
                        room_id: socket.data.roomDbId,
                        sender_id: messageObj.senderId,
                        message: messageObj.text
                    }]);
                }
            } catch (err) {
                console.error('Error saving chat message:', err.message);
            }
        });

        socket.on('reaction', (reactionObj) => {
            if (!socket.data.roomId) {
                return;
            }

            io.to(socket.data.roomId).emit('reaction', {
                ...reactionObj,
                timestamp: new Date().toISOString()
            });
        });

        socket.on('disconnect', () => {
            const { roomId, userId } = socket.data;

            if (roomId && userId) {
                console.log(`User ${userId} disconnected from ${roomId}`);
                socket.to(roomId).emit('user-disconnected', { userId });
            }
        });
    });
}
