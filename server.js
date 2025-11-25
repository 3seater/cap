const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Enable compression for static files
const compression = require('compression');
app.use(compression());

// Serve static files with caching headers
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1y', // Cache static files for 1 year
  etag: true
}));

// Store connected players
const players = new Map();

// Clear all players on server restart
players.clear();

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  // When a player joins, send them all existing players
  socket.emit('currentPlayers', Array.from(players.values()));

  // When a new player joins with their info
  socket.on('playerJoin', (playerData) => {
    const player = {
      id: socket.id,
      username: playerData.username || `Player_${socket.id.substring(0, 6)}`,
      position: playerData.position || { x: 0, y: 0, z: 0 },
      rotation: playerData.rotation || { x: 0, y: 0, z: 0 },
      isMoving: playerData.isMoving || false
    };
    
    players.set(socket.id, player);
    
    // Broadcast to all other players that a new player joined
    socket.broadcast.emit('playerJoined', player);
    
    console.log(`Player ${player.username} joined`);
  });

  // Handle player movement updates
  socket.on('playerMove', (data) => {
    const player = players.get(socket.id);
    if (player) {
      player.position = data.position;
      player.rotation = data.rotation;
      player.isMoving = !!data.isMoving;
      player.isMovingBackwards = !!data.isMovingBackwards;
      
      // Broadcast movement to all other players
      socket.broadcast.emit('playerMoved', {
        id: socket.id,
        position: data.position,
        rotation: data.rotation,
        isMoving: player.isMoving,
        isMovingBackwards: player.isMovingBackwards
      });
    }
  });

  // Handle chat messages
  socket.on('chatMessage', (data) => {
    const player = players.get(socket.id);
    if (player) {
      // Broadcast message to all players
      io.emit('chatMessage', {
        playerId: socket.id,
        username: player.username,
        message: data.message
      });
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    const player = players.get(socket.id);
    if (player) {
      console.log(`Player ${player.username} disconnected`);
      players.delete(socket.id);
      io.emit('playerLeft', socket.id);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

