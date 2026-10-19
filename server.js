const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const UnoGame = require('./game/unoGame');
const UnoBot = require('./game/unoBot');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// In-memory room store
const rooms = new Map(); // roomCode -> { game, bots: Map<botId, UnoBot> }
const socketToRoom = new Map(); // socket.id -> { roomCode, playerId }

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

function broadcastRoomState(roomCode, specificEvent = null, eventData = null) {
  const roomData = rooms.get(roomCode);
  if (!roomData) return;

  const { game } = roomData;
  const socketsInRoom = io.sockets.adapter.rooms.get(roomCode);
  if (!socketsInRoom) return;

  for (const socketId of socketsInRoom) {
    const mapping = socketToRoom.get(socketId);
    if (mapping && mapping.playerId) {
      const playerState = game.getStateForPlayer(mapping.playerId);
      io.to(socketId).emit('game-state', playerState);

      if (specificEvent) {
        io.to(socketId).emit(specificEvent, eventData);
      }
    }
  }
}

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // Create Room
  socket.on('create-room', ({ playerName, avatar }) => {
    const roomCode = generateRoomCode();
    const game = new UnoGame(roomCode);
    const botManager = new UnoBot(game);

    // Setup game callbacks
    game.onStateChange = () => {
      broadcastRoomState(roomCode);
    };

    game.onBotAction = (botPlayer) => {
      botManager.handleBotTurn(botPlayer);
    };

    const joinResult = game.addPlayer(socket.id, playerName, avatar, false);
    if (!joinResult.success) {
      return socket.emit('error-msg', joinResult.message);
    }

    rooms.set(roomCode, { game, botManager });
    socketToRoom.set(socket.id, { roomCode, playerId: socket.id });
    socket.join(roomCode);

    socket.emit('room-created', {
      roomCode,
      playerId: socket.id,
      state: game.getStateForPlayer(socket.id)
    });
  });

  // Join Room
  socket.on('join-room', ({ roomCode, playerName, avatar }) => {
    const cleanCode = (roomCode || '').trim().toUpperCase();
    const roomData = rooms.get(cleanCode);

    if (!roomData) {
      return socket.emit('error-msg', 'Room not found! Check the room code.');
    }

    const { game } = roomData;
    const joinResult = game.addPlayer(socket.id, playerName, avatar, false);
    if (!joinResult.success) {
      return socket.emit('error-msg', joinResult.message);
    }

    socketToRoom.set(socket.id, { roomCode: cleanCode, playerId: socket.id });
    socket.join(cleanCode);

    socket.emit('room-joined', {
      roomCode: cleanCode,
      playerId: socket.id,
      state: game.getStateForPlayer(socket.id)
    });

    broadcastRoomState(cleanCode);
  });

  // Add Guest Player
  socket.on('add-bot', () => {
    const mapping = socketToRoom.get(socket.id);
    if (!mapping) return;
    const roomData = rooms.get(mapping.roomCode);
    if (!roomData) return;

    const { game } = roomData;
    if (game.status !== 'lobby') {
      return socket.emit('error-msg', 'Cannot add players after match has started.');
    }

    const guestAvatars = ['🦊', '🦁', '🐼', '🐯', '🦄', '🚀', '👑', '⚡'];
    const guestNames = ['Aryan', 'Sneha', 'Kabir', 'Rohan', 'Priya', 'Vikram', 'Ananya', 'Sameer'];
    const botCount = game.players.filter(p => p.isBot).length;
    const botId = `p_${Date.now()}_${Math.floor(Math.random()*1000)}`;
    const botName = guestNames[botCount % guestNames.length];
    const botAvatar = guestAvatars[botCount % guestAvatars.length];

    const result = game.addPlayer(botId, botName, botAvatar, true);
    if (!result.success) {
      return socket.emit('error-msg', result.message);
    }

    broadcastRoomState(mapping.roomCode);
  });

  // Start Game
  socket.on('start-game', () => {
    const mapping = socketToRoom.get(socket.id);
    if (!mapping) return;
    const roomData = rooms.get(mapping.roomCode);
    if (!roomData) return;

    const { game } = roomData;
    const player = game.players.find(p => p.id === mapping.playerId);
    if (!player || !player.isHost) {
      return socket.emit('error-msg', 'Only the room host can start the game!');
    }

    const result = game.startRound();
    if (!result.success) {
      return socket.emit('error-msg', result.message);
    }

    broadcastRoomState(mapping.roomCode, 'game-started');
  });

  // Play Card
  socket.on('play-card', ({ cardId, chosenColor }) => {
    const mapping = socketToRoom.get(socket.id);
    if (!mapping) return;
    const roomData = rooms.get(mapping.roomCode);
    if (!roomData) return;

    const { game } = roomData;
    const result = game.playCard(mapping.playerId, cardId, chosenColor);
    if (!result.success) {
      return socket.emit('error-msg', result.message);
    }

    // Play card animation trigger
    io.to(mapping.roomCode).emit('card-played-fx', {
      playerId: mapping.playerId,
      cardId,
      chosenColor
    });

    broadcastRoomState(mapping.roomCode);
  });

  // Draw Card
  socket.on('draw-card', () => {
    const mapping = socketToRoom.get(socket.id);
    if (!mapping) return;
    const roomData = rooms.get(mapping.roomCode);
    if (!roomData) return;

    const { game } = roomData;
    const result = game.playerDrawCard(mapping.playerId);
    if (!result.success) {
      return socket.emit('error-msg', result.message);
    }

    io.to(mapping.roomCode).emit('card-drawn-fx', {
      playerId: mapping.playerId,
      count: result.count || 1,
      stacked: result.stacked || false
    });

    broadcastRoomState(mapping.roomCode);
  });

  // Pass Turn
  socket.on('pass-turn', () => {
    const mapping = socketToRoom.get(socket.id);
    if (!mapping) return;
    const roomData = rooms.get(mapping.roomCode);
    if (!roomData) return;

    const { game } = roomData;
    const result = game.passTurn(mapping.playerId);
    if (!result.success) {
      return socket.emit('error-msg', 'Cannot pass right now');
    }
  });

  // Say UNO
  socket.on('say-uno', () => {
    const mapping = socketToRoom.get(socket.id);
    if (!mapping) return;
    const roomData = rooms.get(mapping.roomCode);
    if (!roomData) return;

    const { game } = roomData;
    const result = game.sayUno(mapping.playerId);
    if (!result.success) {
      return socket.emit('error-msg', result.message);
    }

    io.to(mapping.roomCode).emit('uno-shout-fx', {
      playerId: mapping.playerId,
      playerName: game.players.find(p => p.id === mapping.playerId)?.name
    });
  });

  // Catch UNO
  socket.on('catch-uno', () => {
    const mapping = socketToRoom.get(socket.id);
    if (!mapping) return;
    const roomData = rooms.get(mapping.roomCode);
    if (!roomData) return;

    const { game } = roomData;
    const result = game.catchUno(mapping.playerId);
    if (!result.success) {
      return socket.emit('error-msg', result.message);
    }

    io.to(mapping.roomCode).emit('uno-caught-fx', result);
  });

  // Next Round
  socket.on('next-round', () => {
    const mapping = socketToRoom.get(socket.id);
    if (!mapping) return;
    const roomData = rooms.get(mapping.roomCode);
    if (!roomData) return;

    const { game } = roomData;
    const result = game.nextRound();
    if (!result.success) {
      return socket.emit('error-msg', result.message);
    }

    broadcastRoomState(mapping.roomCode);
  });

  // Floating Emoji Reaction
  socket.on('send-reaction', ({ emoji }) => {
    const mapping = socketToRoom.get(socket.id);
    if (!mapping) return;

    io.to(mapping.roomCode).emit('reaction-fx', {
      playerId: mapping.playerId,
      emoji
    });
  });

  // Chat message
  socket.on('send-chat', ({ message }) => {
    const mapping = socketToRoom.get(socket.id);
    if (!mapping || !message) return;
    const roomData = rooms.get(mapping.roomCode);
    if (!roomData) return;

    const sender = roomData.game.players.find(p => p.id === mapping.playerId);
    if (!sender) return;

    io.to(mapping.roomCode).emit('chat-msg', {
      sender: sender.name,
      avatar: sender.avatar,
      message: message.slice(0, 100),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  });

  // Disconnect
  socket.on('disconnect', () => {
    const mapping = socketToRoom.get(socket.id);
    if (!mapping) return;

    const { roomCode, playerId } = mapping;
    const roomData = rooms.get(roomCode);
    if (roomData) {
      roomData.game.removePlayer(playerId);
      broadcastRoomState(roomCode);

      // Clean up empty rooms
      if (roomData.game.players.length === 0 || roomData.game.players.every(p => p.isBot)) {
        rooms.delete(roomCode);
      }
    }

    socketToRoom.delete(socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`🔥 UNO Multiplayer Server running on http://localhost:${PORT}`);
});
