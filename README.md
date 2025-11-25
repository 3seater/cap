# 3D Multiplayer Room

A real-time 3D multiplayer experience where users can walk around in a dark room, see other players, and interact in real-time.

## Features

- 🎮 3D dark room environment
- 👤 3D character with username display
- ⌨️ WASD movement controls
- 🖱️ Mouse look controls
- 🌐 Real-time multiplayer synchronization
- 👥 See other players in real-time

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the server:**
   ```bash
   npm start
   ```
   
   Or for development with auto-reload:
   ```bash
   npm run dev
   ```

3. **Open your browser:**
   Navigate to `http://localhost:3000`

## Adding Your 3D Character Model

To replace the placeholder character with your own 3D model:

1. Export your character as a **GLTF** or **GLB** file
2. Place it in the `public/models/` directory
3. Update the `createPlayerCharacter()` function in `public/game.js` to load your model using GLTFLoader

Example:
```javascript
const loader = new THREE.GLTFLoader();
loader.load('models/your-character.glb', (gltf) => {
    const model = gltf.scene;
    // Scale and position your model
    model.scale.set(1, 1, 1);
    model.position.set(0, 0, 0);
    player.mesh.add(model);
});
```

## Controls

- **W/A/S/D**: Move forward/left/backward/right
- **Mouse**: Look around (click to enable pointer lock)
- **Enter**: Submit username

## Tech Stack

- **Three.js**: 3D graphics rendering
- **Socket.io**: Real-time multiplayer communication
- **Node.js + Express**: Server backend

## Project Structure

```
Cap_Site/
├── server.js          # Node.js server with Socket.io
├── package.json       # Dependencies
├── public/
│   ├── index.html    # Main HTML file
│   └── game.js       # Client-side game logic
└── README.md
```

## Next Steps

- [ ] Add your 3D character model
- [ ] Customize room environment
- [ ] Add collision detection
- [ ] Add animations (walking, idle, etc.)
- [ ] Add chat functionality
- [ ] Add more interactive elements

