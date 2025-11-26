// CLEAN ANIMATION SYSTEM - W = walk forward, S = walk reversed, Idle otherwise
// Game state
let scene, camera, renderer;
let player = null;
let otherPlayers = new Map();
let socket = null;
let username = '';
let isInitialized = false;
let clock = new THREE.Clock();
let walkGLTF = null;
let idleGLTF = null;

// Movement state
const keys = {};
const moveSpeed = 0.02;
const rotationSpeed = 0.05;
let pitch = 0;

// Chat state
let isChatOpen = false;
let chatMessages = new Map();

// Emote wheel state
let isEmoteWheelOpen = false;
let hoveredEmoteId = null;

// Meme coin stats
let memeCoinData = null;
let lastStatsUpdate = 0;
const STATS_UPDATE_INTERVAL = 5000; // Update every 5 seconds

// Your Solana token contract address (replace with your actual address)
// Example: const TOKEN_ADDRESS = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // USDC
const TOKEN_ADDRESS = "76UweP5GmcYuwD7x6gEDjZph1A6boMFKEAC5pdrxpump";

// Fetch meme coin stats from DexScreener (free API)
async function fetchMemeCoinStats() {
    try {
        const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${TOKEN_ADDRESS}`);
        const data = await response.json();

        if (data.pairs && data.pairs.length > 0) {
            // Get the most liquid pair (usually first one)
            const pair = data.pairs[0];
            memeCoinData = {
                symbol: pair.baseToken.symbol,
                name: pair.baseToken.name,
                price: parseFloat(pair.priceUsd),
                marketCap: pair.marketCap || 0,
                liquidity: pair.liquidity?.usd || 0,
                volume24h: pair.volume?.h24 || 0,
                priceChange24h: pair.priceChange?.h24 || 0,
                dex: pair.dexId,
                pairAddress: pair.pairAddress,
                lastUpdated: Date.now()
            };
            console.log('Updated meme coin stats:', memeCoinData);
            updateStatsDisplay();
        }
    } catch (error) {
        console.error('Error fetching meme coin stats:', error);
        // Fallback to mock data if API fails
        memeCoinData = {
            symbol: 'YOUR_TOKEN',
            name: 'Your Meme Coin',
            price: 0.001,
            marketCap: 1000000,
            liquidity: 50000,
            volume24h: 25000,
            priceChange24h: 15.5,
            lastUpdated: Date.now()
        };
        updateStatsDisplay();
    }
}

// Format large numbers nicely
function formatNumber(num) {
    if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
    return num.toFixed(2);
}

// Update the stats display in the UI
function updateStatsDisplay() {
    if (!memeCoinData) return;

    const statsElement = document.getElementById('meme-coin-stats');
    if (!statsElement) return;

    const priceColor = memeCoinData.priceChange24h >= 0 ? '#00ff00' : '#ff4444';
    const changeSymbol = memeCoinData.priceChange24h >= 0 ? '↗' : '↘';

    statsElement.innerHTML = `
        <div class="stats-header">${memeCoinData.name} (${memeCoinData.symbol})</div>
        <div class="stats-price">$${memeCoinData.price.toFixed(6)}</div>
        <div class="stats-change" style="color: ${priceColor}">
            ${changeSymbol} ${Math.abs(memeCoinData.priceChange24h).toFixed(2)}% (24h)
        </div>
        <div class="stats-details">
            <div>MC: $${formatNumber(memeCoinData.marketCap)}</div>
            <div>Liq: $${formatNumber(memeCoinData.liquidity)}</div>
            <div>Vol: $${formatNumber(memeCoinData.volume24h)}</div>
        </div>
    `;
}

function createGLTFLoader() {
    const loader = new THREE.GLTFLoader();
    try {
        if (typeof THREE.DRACOLoader !== 'undefined') {
            const dracoLoader = new THREE.DRACOLoader();
            dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
            loader.setDRACOLoader(dracoLoader);
        }
    } catch (e) {
        console.warn('DRACO loader not available:', e);
    }
    return loader;
}

// Preload animation GLBs
function loadWalkGLTF() {
    if (walkGLTF) return Promise.resolve(walkGLTF);
    const loader = createGLTFLoader();
    return new Promise((resolve, reject) => {
        loader.load('models/walk.glb', (gltf) => {
            walkGLTF = gltf;
            resolve(gltf);
        }, undefined, reject);
    });
}

function loadIdleGLTF() {
    if (idleGLTF) return Promise.resolve(idleGLTF);
    const loader = createGLTFLoader();
    return new Promise((resolve, reject) => {
        loader.load('models/idle.glb', (gltf) => {
            idleGLTF = gltf;
            resolve(gltf);
        }, undefined, reject);
    });
}

// Loading screen
let loadingStartTime = 0;
const MIN_LOADING_TIME = 5000;
let modelsLoaded = false;
let serverConnected = false;

function updateLoadingProgress(percent, text) {
    const progressFill = document.getElementById('loading-progress-fill');
    if (progressFill) {
        progressFill.style.width = percent + '%';
    }
}

function hideLoadingScreen() {
    const loadingScreen = document.getElementById('loading-screen');
    const elapsed = Date.now() - loadingStartTime;
    const remaining = Math.max(0, MIN_LOADING_TIME - elapsed);

    setTimeout(() => {
        if (loadingScreen) {
            loadingScreen.classList.add('hidden');
        }
        document.getElementById('ui-overlay').classList.remove('hidden');
        document.getElementById('chat-container').classList.remove('hidden');
        document.getElementById('chat-hint').classList.remove('hidden');

        // Show meme coin stats if token address is configured
        if (TOKEN_ADDRESS && TOKEN_ADDRESS !== 'YOUR_SOLANA_TOKEN_ADDRESS_HERE') {
            document.getElementById('meme-coin-stats').classList.remove('hidden');
        }
    }, remaining);
}

// Username input
document.getElementById('join-button').addEventListener('click', async () => {
    username = document.getElementById('username-field').value.trim() || `Player_${Math.random().toString(36).substr(2, 6)}`;
    
    document.getElementById('username-input').classList.add('hidden');
    document.getElementById('loading-screen').classList.remove('hidden');
    document.getElementById('chat-container').classList.add('hidden');
    document.getElementById('chat-hint').classList.add('hidden');
    loadingStartTime = Date.now();
    modelsLoaded = false;
    serverConnected = false;
    
    await new Promise(resolve => setTimeout(resolve, 50));
    
    updateLoadingProgress(10, 'Loading models...');
    
    try {
        await Promise.all([loadWalkGLTF(), loadIdleGLTF()]);
        modelsLoaded = true;
        updateLoadingProgress(90, 'Initializing...');
        
        init();
        
        if (serverConnected) {
            updateLoadingProgress(100, 'Ready!');
            hideLoadingScreen();
        }
    } catch (error) {
        console.error('Error loading models:', error);
        updateLoadingProgress(100, 'Error loading models');
        setTimeout(() => {
            init();
            hideLoadingScreen();
        }, 1000);
    }
});

document.getElementById('username-field').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('join-button').click();
    }
});

function init() {
    if (isInitialized) return;
    isInitialized = true;
    
    console.log('Initializing game...');

    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a1a2e);
    scene.fog = new THREE.FogExp2(0x0a1a2e, 0.08);
    
    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 2, 5);
    
    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('canvas-container').appendChild(renderer.domElement);
    
    // Lighting - Atmospheric church lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 0.2);
    scene.add(ambientLight);
    
    // Light in hallway (dim)
    const hallwayLight = new THREE.PointLight(0xffaa55, 0.6, 30);
    hallwayLight.position.set(0, 6, 10);
    hallwayLight.castShadow = true;
    scene.add(hallwayLight);
    
    // Light at doorway
    const doorLight = new THREE.PointLight(0xffaa55, 0.8, 20);
    doorLight.position.set(0, 5, 40);
    doorLight.castShadow = true;
    scene.add(doorLight);
    
    // Spotlight over the hat in the open area
    const spotlight = new THREE.SpotLight(0xffffff, 1.5);
    spotlight.position.set(0, 20, 55);
    spotlight.angle = Math.PI / 4;
    spotlight.penumbra = 0.3;
    spotlight.decay = 2;
    spotlight.distance = 50;
    spotlight.castShadow = true;
    spotlight.shadow.mapSize.width = 2048;
    spotlight.shadow.mapSize.height = 2048;
    spotlight.shadow.camera.near = 0.5;
    spotlight.shadow.camera.far = 50;
    spotlight.target.position.set(0, 0, 55);
    scene.add(spotlight);
    scene.add(spotlight.target);
    
    createRoom();
    createDustParticles();
    createFloatingHat();
    createPlayerCharacter();
    
    // Connect to server
    const serverUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? ''
        : 'https://cap-q7mt.onrender.com';
    socket = io(serverUrl);
    
    socket.on('connect', () => {
        console.log('Connected to server');
        serverConnected = true;
        updateLoadingProgress(95, 'Connected!');

        socket.emit('playerJoin', {
            username: username,
            position: { x: 0, y: 0, z: 2 },
            rotation: { x: 0, y: 0, z: 0 },
            animState: 'idle'
        });

        // Start fetching meme coin stats
        if (TOKEN_ADDRESS && TOKEN_ADDRESS !== 'YOUR_SOLANA_TOKEN_ADDRESS_HERE') {
            fetchMemeCoinStats();
        }

        if (modelsLoaded) {
            updateLoadingProgress(100, 'Ready!');
            hideLoadingScreen();
        }
    });
    
    socket.on('currentPlayers', (players) => {
        players.forEach(playerData => {
            if (playerData.id !== socket.id) {
                addOtherPlayer(playerData);
            }
        });
        updatePlayerCount();
    });
    
    socket.on('playerJoined', (playerData) => {
        if (playerData.id !== socket.id) {
            addOtherPlayer(playerData);
            updatePlayerCount();
        }
    });
    
    socket.on('playerMoved', (data) => {
        const otherPlayer = otherPlayers.get(data.id);
        if (otherPlayer) {
            otherPlayer.mesh.position.set(data.position.x, data.position.y, data.position.z);
            otherPlayer.mesh.rotation.y = data.rotation.y;
            
            // Update animation based on state
            if (otherPlayer.mixer && otherPlayer.animations) {
                updatePlayerAnimation(otherPlayer, data.animState);
            }
        }
    });
    
    socket.on('playerLeft', (playerId) => {
        removeOtherPlayer(playerId);
        updatePlayerCount();
        if (chatMessages.has(playerId)) {
            const chatSprite = chatMessages.get(playerId);
            scene.remove(chatSprite);
            chatMessages.delete(playerId);
        }
    });
    
    socket.on('chatMessage', (data) => {
        addMessageToChatLog(data.username, data.message);
    });

    // Handle emote events from other players
    socket.on('playerEmote', (data) => {
        // TODO: Show emote animation above other player's head
        console.log(`Player ${data.playerId} played emote ${data.emoteId}`);
    });
    
    // Keyboard controls
    document.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();
        
        if (key === 't' && isInitialized && !isChatOpen) {
            openChat();
            e.preventDefault();
            return;
        }
        
        if (key === 'enter' && isChatOpen) {
            sendChatMessage();
            e.preventDefault();
            return;
        }
        
        if (key === 'escape' && isChatOpen) {
            closeChat();
            e.preventDefault();
            return;
        }

        // F key for emote wheel (hold to open)
        if (key === 'f' && isInitialized && !isChatOpen && !isEmoteWheelOpen) {
            openEmoteWheel();
            e.preventDefault();
            return;
        }

        if (!isChatOpen && !isEmoteWheelOpen) {
            keys[key] = true;
        }
    });
    
    document.addEventListener('keyup', (e) => {
        const key = e.key.toLowerCase();

        // F key release - close emote wheel and play selected emote
        if (key === 'f' && isEmoteWheelOpen) {
            if (hoveredEmoteId) {
                playEmote(hoveredEmoteId);
            }
            closeEmoteWheel();
            e.preventDefault();
            return;
        }

        if (!isChatOpen) {
            keys[key] = false;
        }
    });
    
    // Mouse controls
    let isPointerLocked = false;
    
    renderer.domElement.addEventListener('click', () => {
        renderer.domElement.requestPointerLock();
    });
    
    document.addEventListener('pointerlockchange', () => {
        isPointerLocked = document.pointerLockElement === renderer.domElement;
    });
    
    document.addEventListener('mousemove', (e) => {
        if (isPointerLocked && player) {
            const yaw = -e.movementX * 0.002;
            player.mesh.rotation.y += yaw;
            
            const pitchDelta = e.movementY * 0.002;
            const newPitch = pitch + pitchDelta;
            const maxPitch = Math.PI / 2 - 0.1;
            const minPitch = -Math.PI / 2 + 0.1;
            
            if (newPitch > maxPitch) {
                const excess = newPitch - maxPitch;
                pitch = maxPitch + excess * 0.1;
            } else if (newPitch < minPitch) {
                const excess = newPitch - minPitch;
                pitch = minPitch + excess * 0.1;
            } else {
                pitch = newPitch;
            }
            
            pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, pitch));
        }
    });
    
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
    
    animate();
}

function createRoom() {
    // Church hallway dimensions
    const hallwayLength = 40;
    const hallwayWidth = 12;
    const wallHeight = 8;
    const pillarSpacing = 5;
    const numPillars = Math.floor(hallwayLength / pillarSpacing);
    
    // Hallway floor
    const floorGeometry = new THREE.PlaneGeometry(hallwayWidth, hallwayLength);
    const floorMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x2a2a2a,
        roughness: 0.8
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = hallwayLength / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    
    // Create pillars along both sides
    for (let i = 0; i < numPillars; i++) {
        const z = i * pillarSpacing;
        
        // Left pillar
        createPillar(-hallwayWidth / 2 + 1.5, z);
        
        // Right pillar
        createPillar(hallwayWidth / 2 - 1.5, z);
    }
    
    // Walls
    const wallMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x3a3a3a,
        roughness: 0.9
    });
    
    // Left wall
    const leftWallGeometry = new THREE.BoxGeometry(0.5, wallHeight, hallwayLength);
    const leftWall = new THREE.Mesh(leftWallGeometry, wallMaterial);
    leftWall.position.set(-hallwayWidth / 2, wallHeight / 2, hallwayLength / 2);
    leftWall.receiveShadow = true;
    leftWall.castShadow = true;
    scene.add(leftWall);
    
    // Right wall
    const rightWall = new THREE.Mesh(leftWallGeometry, wallMaterial);
    rightWall.position.set(hallwayWidth / 2, wallHeight / 2, hallwayLength / 2);
    rightWall.receiveShadow = true;
    rightWall.castShadow = true;
    scene.add(rightWall);
    
    // Ceiling
    const ceilingGeometry = new THREE.PlaneGeometry(hallwayWidth, hallwayLength);
    const ceilingMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x1a1a1a,
        roughness: 0.9
    });
    const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, wallHeight, hallwayLength / 2);
    ceiling.receiveShadow = true;
    scene.add(ceiling);
    
    // Back wall at start (behind spawn)
    const backWallGeometry = new THREE.BoxGeometry(hallwayWidth, wallHeight, 0.5);
    const backWall = new THREE.Mesh(backWallGeometry, wallMaterial);
    backWall.position.set(0, wallHeight / 2, -0.25);
    backWall.receiveShadow = true;
    backWall.castShadow = true;
    scene.add(backWall);
    
    // Doorway frame at end
    const doorHeight = 6;
    const doorWidth = 6;
    const doorFrameMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x4a3020,
        roughness: 0.7
    });
    
    // Left door frame
    const doorFrameGeometry = new THREE.BoxGeometry(0.5, doorHeight, 0.5);
    const leftDoorFrame = new THREE.Mesh(doorFrameGeometry, doorFrameMaterial);
    leftDoorFrame.position.set(-doorWidth / 2, doorHeight / 2, hallwayLength);
    leftDoorFrame.castShadow = true;
    scene.add(leftDoorFrame);
    
    // Right door frame
    const rightDoorFrame = new THREE.Mesh(doorFrameGeometry, doorFrameMaterial);
    rightDoorFrame.position.set(doorWidth / 2, doorHeight / 2, hallwayLength);
    rightDoorFrame.castShadow = true;
    scene.add(rightDoorFrame);
    
    // Top door frame
    const topFrameGeometry = new THREE.BoxGeometry(doorWidth, 0.5, 0.5);
    const topDoorFrame = new THREE.Mesh(topFrameGeometry, doorFrameMaterial);
    topDoorFrame.position.set(0, doorHeight, hallwayLength);
    topDoorFrame.castShadow = true;
    scene.add(topDoorFrame);
    
    // Open area beyond door (where hat is)
    const openAreaSize = 50;
    const openFloorGeometry = new THREE.PlaneGeometry(openAreaSize, openAreaSize);
    const openFloorMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x1a1a1a,
        roughness: 0.8
    });
    const openFloor = new THREE.Mesh(openFloorGeometry, openFloorMaterial);
    openFloor.rotation.x = -Math.PI / 2;
    openFloor.position.z = hallwayLength + openAreaSize / 2;
    openFloor.receiveShadow = true;
    scene.add(openFloor);
    
    // Dome over open area
    const roomRadius = 25;
    const domeGeometry = new THREE.SphereGeometry(roomRadius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const domeMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x0a1a2e,
        side: THREE.BackSide,
        roughness: 0.9,
        metalness: 0.1
    });
    const dome = new THREE.Mesh(domeGeometry, domeMaterial);
    dome.position.set(0, roomRadius, hallwayLength + 15);
    dome.receiveShadow = true;
    scene.add(dome);
}

function createPillar(x, z) {
    const pillarMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x5a5a5a,
        roughness: 0.8,
        metalness: 0.1
    });
    
    // Main pillar column
    const columnGeometry = new THREE.CylinderGeometry(0.5, 0.5, 6, 12);
    const column = new THREE.Mesh(columnGeometry, pillarMaterial);
    column.position.set(x, 3, z);
    column.castShadow = true;
    column.receiveShadow = true;
    scene.add(column);
    
    // Base
    const baseGeometry = new THREE.CylinderGeometry(0.7, 0.8, 0.8, 12);
    const base = new THREE.Mesh(baseGeometry, pillarMaterial);
    base.position.set(x, 0.4, z);
    base.castShadow = true;
    base.receiveShadow = true;
    scene.add(base);
    
    // Capital (top)
    const capitalGeometry = new THREE.CylinderGeometry(0.8, 0.6, 0.8, 12);
    const capital = new THREE.Mesh(capitalGeometry, pillarMaterial);
    capital.position.set(x, 6.4, z);
    capital.castShadow = true;
    capital.receiveShadow = true;
    scene.add(capital);
}

let dustParticles = [];
let floatingHat = null;

function createDustParticles() {
    const particleCount = 200;
    
    const createDustTexture = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const context = canvas.getContext('2d');
        
        const centerX = 64;
        const centerY = 64;
        const gradient = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, 64);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
        gradient.addColorStop(0.2, 'rgba(220, 220, 240, 0.6)');
        gradient.addColorStop(0.4, 'rgba(180, 180, 200, 0.3)');
        gradient.addColorStop(0.7, 'rgba(140, 140, 160, 0.1)');
        gradient.addColorStop(1, 'rgba(100, 100, 140, 0)');
        
        context.fillStyle = gradient;
        context.fillRect(0, 0, 128, 128);
        
        return canvas;
    };
    
    const texture = new THREE.CanvasTexture(createDustTexture());
    texture.needsUpdate = true;
    
    for (let i = 0; i < particleCount; i++) {
        const radius = Math.random() * 20;
        const theta = Math.random() * Math.PI * 2;
        const height = Math.random() * 15;
        
        const x = Math.cos(theta) * radius;
        const y = height;
        const z = Math.sin(theta) * radius;
        
        const spriteMaterial = new THREE.SpriteMaterial({
            map: texture,
            color: 0x8a9ba8,
            transparent: true,
            opacity: 0.4 + Math.random() * 0.3,
            blending: THREE.AdditiveBlending,
            depthTest: true,
            depthWrite: false
        });
        
        const sprite = new THREE.Sprite(spriteMaterial);
        const size = Math.random() * 0.15 + 0.05;
        sprite.scale.set(size, size, 1);
        sprite.position.set(x, y, z);
        
        sprite.userData.velocity = {
            x: (Math.random() - 0.5) * 0.02 * 1.15,
            y: (Math.random() - 0.5) * 0.01 * 1.15,
            z: (Math.random() - 0.5) * 0.02 * 1.15
        };
        
        scene.add(sprite);
        dustParticles.push(sprite);
    }
}

function updateDustParticles() {
    if (!dustParticles || dustParticles.length === 0) return;
    
    dustParticles.forEach(sprite => {
        const vel = sprite.userData.velocity;
        
        sprite.position.x += vel.x;
        sprite.position.y += vel.y;
        sprite.position.z += vel.z;
        
        const radius = Math.sqrt(sprite.position.x * sprite.position.x + sprite.position.z * sprite.position.z);
        if (radius > 22) {
            sprite.position.x = -sprite.position.x * 0.9;
            sprite.position.z = -sprite.position.z * 0.9;
        }
        
        if (sprite.position.y > 18 || sprite.position.y < 0) {
            sprite.position.y = Math.max(0.5, Math.min(17.5, sprite.position.y));
            vel.y *= -0.5;
        }
        
        vel.x += (Math.random() - 0.5) * 0.001;
        vel.y += (Math.random() - 0.5) * 0.0005;
        vel.z += (Math.random() - 0.5) * 0.001;
        
        vel.x *= 0.99;
        vel.y *= 0.99;
        vel.z *= 0.99;
        
        sprite.lookAt(camera.position);
    });
}

// Dense aura particles specifically around the hat
function createHatAuraParticles(hatGroup) {
    const particleCount = 50; // Dense particles around hat

    const createAuraTexture = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const context = canvas.getContext('2d');

        const centerX = 32;
        const centerY = 32;
        const gradient = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, 32);
        gradient.addColorStop(0, 'rgba(16, 71, 210, 0.9)');
        gradient.addColorStop(0.4, 'rgba(16, 71, 210, 0.5)');
        gradient.addColorStop(0.8, 'rgba(16, 71, 210, 0.1)');
        gradient.addColorStop(1, 'rgba(16, 71, 210, 0)');

        context.fillStyle = gradient;
        context.fillRect(0, 0, 64, 64);

        return canvas;
    };

    const auraTexture = new THREE.CanvasTexture(createAuraTexture());
    auraTexture.needsUpdate = true;

    for (let i = 0; i < particleCount; i++) {
        // Create particles in a sphere around the hat (radius 2-4 units)
        const radius = 2 + Math.random() * 2;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI;

        const x = Math.sin(phi) * Math.cos(theta) * radius;
        const y = Math.cos(phi) * radius + (Math.random() - 0.5) * 1.5; // Some vertical spread
        const z = Math.sin(phi) * Math.sin(theta) * radius;

        const spriteMaterial = new THREE.SpriteMaterial({
            map: auraTexture,
            color: 0x1047d2,
            transparent: true,
            opacity: 0.3 + Math.random() * 0.4, // Higher opacity for aura
            blending: THREE.AdditiveBlending,
            depthTest: true,
            depthWrite: false
        });

        const sprite = new THREE.Sprite(spriteMaterial);
        const size = 0.1 + Math.random() * 0.15; // Smaller, denser particles
        sprite.scale.set(size, size, 1);
        sprite.position.set(x, y, z);

        // Slower, more subtle movement for aura effect
        sprite.userData.velocity = {
            x: (Math.random() - 0.5) * 0.005,
            y: (Math.random() - 0.5) * 0.003,
            z: (Math.random() - 0.5) * 0.005
        };

        hatGroup.add(sprite);
    }
}

function updateHatAuraParticles() {
    if (!floatingHat) return;

    // Find all sprite children of the hat group (aura particles)
    floatingHat.children.forEach(child => {
        if (child.type === 'Sprite' && child.userData.velocity) {
            const vel = child.userData.velocity;

            child.position.x += vel.x;
            child.position.y += vel.y;
            child.position.z += vel.z;

            // Keep particles within a reasonable distance from hat center
            const distance = Math.sqrt(
                child.position.x * child.position.x +
                child.position.y * child.position.y +
                child.position.z * child.position.z
            );

            if (distance > 5) {
                // Reset particle to a random position near the hat
                const radius = 2 + Math.random() * 2;
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.random() * Math.PI;

                child.position.x = Math.sin(phi) * Math.cos(theta) * radius;
                child.position.y = Math.cos(phi) * radius + (Math.random() - 0.5) * 1.5;
                child.position.z = Math.sin(phi) * Math.sin(theta) * radius;
            }

            // Gentle random drift
            vel.x += (Math.random() - 0.5) * 0.0002;
            vel.y += (Math.random() - 0.5) * 0.0001;
            vel.z += (Math.random() - 0.5) * 0.0002;

            // Dampen velocities
            vel.x *= 0.995;
            vel.y *= 0.995;
            vel.z *= 0.995;

            // Make particles face camera for better visibility
            if (camera) {
                child.lookAt(camera.position);
            }
        }
    });
}

function createFloatingHat() {
    const hatGroup = new THREE.Group();
    hatGroup.position.set(0, 6.5, 55); // In the open area beyond the door

    // Brighter light for more aura
    const glowLight = new THREE.PointLight(0x1047d2, 4, 20); // Increased intensity from 2 to 4, range from 15 to 20
    glowLight.position.set(0, 0, 0);
    hatGroup.add(glowLight);
    
    const createGlowTexture = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const context = canvas.getContext('2d');
        
        const centerX = 128;
        const centerY = 128;
        const gradient = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, 128);
        gradient.addColorStop(0, 'rgba(16, 71, 210, 0.8)');
        gradient.addColorStop(0.3, 'rgba(16, 71, 210, 0.4)');
        gradient.addColorStop(0.6, 'rgba(16, 71, 210, 0.2)');
        gradient.addColorStop(1, 'rgba(16, 71, 210, 0)');
        
        context.fillStyle = gradient;
        context.fillRect(0, 0, 256, 256);
        
        return canvas;
    };
    
    const glowTexture = new THREE.CanvasTexture(createGlowTexture());
    glowTexture.needsUpdate = true;
    
    // More glow layers for denser aura (increased from 3 to 5)
    for (let i = 0; i < 5; i++) {
        const glowSprite = new THREE.Sprite(
            new THREE.SpriteMaterial({
                map: glowTexture,
                transparent: true,
                opacity: 0.7 - i * 0.1, // Higher base opacity
                blending: THREE.AdditiveBlending,
                depthWrite: false
            })
        );
        const size = 4 + i * 0.6; // Bigger sizes (was 3 + i * 0.5)
        glowSprite.scale.set(size, size, 1);
        glowSprite.position.y = 0;
        hatGroup.add(glowSprite);
    }
    
    const loader = createGLTFLoader();
    loader.load(
        'hat/hat.glb',
        (gltf) => {
            console.log('Hat model loaded');
            const hatModel = gltf.scene;
            
            hatModel.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    if (child.material) {
                        child.material.emissive = new THREE.Color(0x1047d2);
                        child.material.emissiveIntensity = 0.3;
                    }
                }
            });
            
            const box = new THREE.Box3().setFromObject(hatModel);
            const size = box.getSize(new THREE.Vector3());
            const maxDimension = Math.max(size.x, size.y, size.z);
            const scale = 8.625 / maxDimension; // 15% bigger (7.5 * 1.15 = 8.625)
            hatModel.scale.set(scale, scale, scale);
            
            const center = box.getCenter(new THREE.Vector3());
            hatModel.position.sub(center);
            
            hatGroup.add(hatModel);

            // Add dense particles around the hat
            createHatAuraParticles(hatGroup);

            floatingHat = hatGroup;
            scene.add(hatGroup);
        },
        undefined,
        (error) => {
            console.error('Error loading hat model:', error);
            const hatGeometry = new THREE.ConeGeometry(0.8, 0.6, 8);
            const hatMaterial = new THREE.MeshStandardMaterial({
                color: 0x1047d2,
                emissive: 0x1047d2,
                emissiveIntensity: 0.5
            });
            const hatMesh = new THREE.Mesh(hatGeometry, hatMaterial);
            hatMesh.rotation.x = Math.PI;
            hatGroup.add(hatMesh);
            floatingHat = hatGroup;
            scene.add(hatGroup);
        }
    );
}

function createPlayerCharacter() {
    const group = new THREE.Group();
    
    // Username label
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    
    context.font = '500 10px Inter, -apple-system, sans-serif';
    const textWidth = context.measureText(username).width;
    
    const baseWidth = Math.max(80, textWidth + 16);
    const baseHeight = 20;
    
    canvas.width = baseWidth * dpr;
    canvas.height = baseHeight * dpr;
    canvas.style.width = baseWidth + 'px';
    canvas.style.height = baseHeight + 'px';
    
    context.scale(dpr, dpr);
    
    context.fillStyle = 'rgba(0, 0, 0, 0.75)';
    context.fillRect(0, 0, baseWidth, baseHeight);
    
    context.strokeStyle = '#1047d2';
    context.lineWidth = 1;
    context.strokeRect(0.5, 0.5, baseWidth - 1, baseHeight - 1);
    
    context.fillStyle = '#ffffff';
    context.font = '500 10px Inter, -apple-system, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(username, baseWidth / 2, baseHeight / 2);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(spriteMaterial);
    const aspectRatio = baseWidth / baseHeight;
    sprite.scale.set(0.15 * aspectRatio, 0.15, 1);
    sprite.position.y = 2.5;
    group.add(sprite);
    
    group.position.set(0, 0, 2); // Spawn at start of hallway
    scene.add(group);
    
    // Load character model and setup animations
    Promise.all([loadWalkGLTF(), loadIdleGLTF()])
        .then(([walkGltf, idleGltf]) => {
            setupCharacterModel(group, sprite, walkGltf, idleGltf, true);
        })
        .catch((error) => {
            console.error('Error loading character model:', error);
        });
    
    player = {
        mesh: group,
        usernameSprite: sprite,
        position: { x: 0, y: 0, z: 2 },
        rotation: { x: 0, y: 0, z: 0 },
        animState: 'idle'
    };
    
    camera.position.set(0, 4, -1); // Camera behind player at start
    camera.lookAt(0, 2.5, 2);
}

// Setup character model with animations
function setupCharacterModel(group, sprite, walkGltf, idleGltf, isPlayer = false) {
    const model = THREE.SkeletonUtils.clone(walkGltf.scene);
    
    model.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });
    
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z);
    const scale = 3.5 / maxDimension;
    
    model.scale.set(scale, scale, scale);
    model.rotation.y = 0;
    
    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center);
    model.position.y = -box.min.y * scale;
    
    group.add(model);
    
    // Setup animation mixer and actions
    const mixer = new THREE.AnimationMixer(model);
    const animations = {
        idle: null,
        walkForward: null,
        walkBackward: null
    };
    
    // Idle animation
    if (idleGltf?.animations?.length > 0) {
        const idleClip = idleGltf.animations[0];
        animations.idle = mixer.clipAction(idleClip);
        animations.idle.setLoop(THREE.LoopRepeat);
        animations.idle.play();
    }
    
    // Single walk animation that can be reversed
    if (walkGltf?.animations?.length > 0) {
        const walkClip = walkGltf.animations[0];

        // Create a single walk action that we'll control with timeScale
        animations.walk = mixer.clipAction(walkClip);
        animations.walk.setLoop(THREE.LoopRepeat);
        animations.walk.timeScale = 1.0; // Start with forward
        animations.walk.clampWhenFinished = false;

        // Reference the same action for both forward and backward
        animations.walkForward = animations.walk;
        animations.walkBackward = animations.walk;
    }
    
    // Update sprite position
    if (size.y > 0) {
        sprite.position.y = (size.y * scale) + 1.2;
    }
    
    // Attach to player or other player object
    if (isPlayer) {
        player.mixer = mixer;
        player.animations = animations;
        player.currentAction = animations.idle;
    } else {
        // For other players, find the correct otherPlayer object
        // This will be set by the calling function
        return { mixer, animations, currentAction: animations.idle };
    }
}

// Update player animation based on state
function updatePlayerAnimation(playerObj, newState) {
    if (!playerObj.mixer || !playerObj.animations) return;

    const animations = playerObj.animations;
    const fadeDuration = 0.3; // Smooth fade duration

    // Handle walk animations (forward/backward use same action, just different timeScale)
    if (newState === 'walkForward' || newState === 'walkBackward') {
        // If we're already walking, just change direction if needed
        if (playerObj.currentAction === animations.walk) {
            // Already playing walk animation, just change direction
            if (newState === 'walkForward' && animations.walk.timeScale !== 1.0) {
                animations.walk.timeScale = 1.0; // Switch to forward
            } else if (newState === 'walkBackward' && animations.walk.timeScale !== -1.0) {
                animations.walk.timeScale = -1.0; // Switch to backward
            }
            return; // No need to change actions
        }

        // Switch to walk animation with fade
        if (playerObj.currentAction && playerObj.currentAction !== animations.walk) {
            playerObj.currentAction.fadeOut(fadeDuration);
        }

        // Set correct direction
        animations.walk.timeScale = (newState === 'walkForward') ? 1.0 : -1.0;
        animations.walk.reset();
        animations.walk.time = 0;
        animations.walk.fadeIn(fadeDuration);
        animations.walk.play();
        playerObj.currentAction = animations.walk;
        return;
    }

    // Handle idle animation
    if (newState === 'idle') {
        if (playerObj.currentAction === animations.idle) {
            return; // Already idle
        }

        // Switch to idle with fade
        if (playerObj.currentAction) {
            playerObj.currentAction.fadeOut(fadeDuration);
        }

        if (animations.idle) {
            animations.idle.reset();
            animations.idle.time = 0;
            animations.idle.fadeIn(fadeDuration);
            animations.idle.play();
            playerObj.currentAction = animations.idle;
        }
    }
}

function addOtherPlayer(playerData) {
    const group = new THREE.Group();
    
    // Username label
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    
    context.font = '500 10px Inter, -apple-system, sans-serif';
    const textWidth = context.measureText(playerData.username).width;
    
    const baseWidth = Math.max(80, textWidth + 16);
    const baseHeight = 20;
    
    canvas.width = baseWidth * dpr;
    canvas.height = baseHeight * dpr;
    canvas.style.width = baseWidth + 'px';
    canvas.style.height = baseHeight + 'px';
    
    context.scale(dpr, dpr);
    
    context.fillStyle = 'rgba(0, 0, 0, 0.75)';
    context.beginPath();
    const radius = 6;
    context.moveTo(radius, 0);
    context.lineTo(baseWidth - radius, 0);
    context.quadraticCurveTo(baseWidth, 0, baseWidth, radius);
    context.lineTo(baseWidth, baseHeight - radius);
    context.quadraticCurveTo(baseWidth, baseHeight, baseWidth - radius, baseHeight);
    context.lineTo(radius, baseHeight);
    context.quadraticCurveTo(0, baseHeight, 0, baseHeight - radius);
    context.lineTo(0, radius);
    context.quadraticCurveTo(0, 0, radius, 0);
    context.closePath();
    context.fill();
    
    context.strokeStyle = '#1047d2';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(radius, 0.5);
    context.lineTo(baseWidth - radius, 0.5);
    context.quadraticCurveTo(baseWidth, 0.5, baseWidth, radius + 0.5);
    context.lineTo(baseWidth, baseHeight - radius - 0.5);
    context.quadraticCurveTo(baseWidth, baseHeight - 0.5, baseWidth - radius, baseHeight - 0.5);
    context.lineTo(radius, baseHeight - 0.5);
    context.quadraticCurveTo(0.5, baseHeight - 0.5, 0.5, baseHeight - radius - 0.5);
    context.lineTo(0.5, radius + 0.5);
    context.quadraticCurveTo(0.5, 0.5, radius, 0.5);
    context.closePath();
    context.stroke();
    
    context.fillStyle = '#ffffff';
    context.font = '500 10px Inter, -apple-system, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(playerData.username, baseWidth / 2, baseHeight / 2);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(spriteMaterial);
    const aspectRatio = baseWidth / baseHeight;
    sprite.scale.set(0.09 * aspectRatio, 0.09, 1);
    sprite.position.y = 3.2;
    group.add(sprite);
    
    group.position.set(playerData.position.x, playerData.position.y, playerData.position.z);
    group.rotation.y = playerData.rotation.y;
    scene.add(group);
    
    // Store other player data
    const otherPlayerObj = {
        mesh: group,
        usernameSprite: sprite,
        username: playerData.username,
        animState: playerData.animState || 'idle'
    };
    
    otherPlayers.set(playerData.id, otherPlayerObj);
    
    // Load character model
    Promise.all([loadWalkGLTF(), loadIdleGLTF()])
        .then(([walkGltf, idleGltf]) => {
            const animData = setupCharacterModel(group, sprite, walkGltf, idleGltf, false);
            otherPlayerObj.mixer = animData.mixer;
            otherPlayerObj.animations = animData.animations;
            otherPlayerObj.currentAction = animData.currentAction;
            
            // Set initial animation
            updatePlayerAnimation(otherPlayerObj, otherPlayerObj.animState);
        })
        .catch((error) => {
            console.error('Error loading character for other player:', playerData.username, error);
        });
}

function removeOtherPlayer(playerId) {
    const otherPlayer = otherPlayers.get(playerId);
    if (otherPlayer) {
        scene.remove(otherPlayer.mesh);
        otherPlayers.delete(playerId);
    }
}

function updatePlayerCount() {
    document.getElementById('player-count').textContent = otherPlayers.size + 1;
}

function updateMovement() {
    if (!player || isEmoteWheelOpen) return;
    
    const direction = new THREE.Vector3();
    let newAnimState = 'idle';
    let rotateCharacter = false;
    let targetRotationOffset = 0;
    
    // Determine movement direction and character rotation
    if (keys['w'] && keys['a']) {
        // W+A = Forward-left (45 degrees)
        direction.z += 1;
        targetRotationOffset = Math.PI / 4; // 45 degrees left
        rotateCharacter = true;
        newAnimState = 'walkForward';
    } else if (keys['w'] && keys['d']) {
        // W+D = Forward-right (-45 degrees)
        direction.z += 1;
        targetRotationOffset = -Math.PI / 4; // 45 degrees right
        rotateCharacter = true;
        newAnimState = 'walkForward';
    } else if (keys['s'] && keys['a']) {
        // S+A = Backward-left (135 degrees)
        direction.z += 1;
        targetRotationOffset = (3 * Math.PI) / 4; // 135 degrees left
        rotateCharacter = true;
        newAnimState = 'walkForward';
    } else if (keys['s'] && keys['d']) {
        // S+D = Backward-right (-135 degrees)
        direction.z += 1;
        targetRotationOffset = -(3 * Math.PI) / 4; // 135 degrees right
        rotateCharacter = true;
        newAnimState = 'walkForward';
    } else if (keys['w']) {
        // W = Forward (0 degrees)
        direction.z += 1;
        newAnimState = 'walkForward';
    } else if (keys['s']) {
        // S = Backward (180 degrees)
        direction.z += 1;
        targetRotationOffset = Math.PI; // 180 degrees
        rotateCharacter = true;
        newAnimState = 'walkForward';
    } else if (keys['a']) {
        // A = Left (90 degrees)
        direction.z += 1; // Move forward after rotating
        targetRotationOffset = Math.PI / 2; // 90 degrees left
        rotateCharacter = true;
        newAnimState = 'walkForward';
    } else if (keys['d']) {
        // D = Right (-90 degrees)
        direction.z += 1; // Move forward after rotating
        targetRotationOffset = -Math.PI / 2; // 90 degrees right
        rotateCharacter = true;
        newAnimState = 'walkForward';
    }
    
    // Apply smooth rotation to character if needed
    if (rotateCharacter) {
        const targetRotation = player.mesh.rotation.y + targetRotationOffset;
        const rotationSpeed = 0.036; // 80% less sensitive than original (was 0.15, then 0.045)
        let rotationDiff = targetRotation - player.mesh.rotation.y;
        
        // Normalize to shortest path
        while (rotationDiff > Math.PI) rotationDiff -= 2 * Math.PI;
        while (rotationDiff < -Math.PI) rotationDiff += 2 * Math.PI;
        
        player.mesh.rotation.y += rotationDiff * rotationSpeed;
    }
    
    // Apply movement
    if (direction.lengthSq() > 0) {
        direction.normalize();
        direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), player.mesh.rotation.y);
        
        player.mesh.position.x += direction.x * moveSpeed;
        player.mesh.position.z += direction.z * moveSpeed;
    }
    
    // Update animation if state changed
    if (newAnimState !== player.animState) {
        updatePlayerAnimation(player, newAnimState);
        player.animState = newAnimState;
    }
    
    // Update position references
    player.position.x = player.mesh.position.x;
    player.position.y = player.mesh.position.y;
    player.position.z = player.mesh.position.z;
    player.rotation.y = player.mesh.rotation.y;
    
    // Send to server
    if (socket && socket.connected) {
        socket.emit('playerMove', {
            position: { ...player.position },
            rotation: { ...player.rotation },
            animState: player.animState
        });
    }
    
    // Update camera (third-person)
    const headHeight = 2.5;
    const cameraDistance = 3;
    const baseCameraHeight = 4;
    
    const pivotPoint = new THREE.Vector3(
        player.mesh.position.x,
        player.mesh.position.y + headHeight,
        player.mesh.position.z
    );
    
    const cameraOffset = new THREE.Vector3(0, 0, -cameraDistance);
    cameraOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), player.mesh.rotation.y);
    
    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyAxisAngle(new THREE.Vector3(0, 1, 0), player.mesh.rotation.y);
    const rightVector = new THREE.Vector3(1, 0, 0);
    rightVector.applyAxisAngle(new THREE.Vector3(0, 1, 0), player.mesh.rotation.y);
    
    cameraOffset.applyAxisAngle(rightVector, pitch);
    cameraOffset.y += baseCameraHeight - headHeight;
    
    camera.position.copy(pivotPoint).add(cameraOffset);
    camera.lookAt(pivotPoint);
}

function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();

    if (player) {
        updateMovement();

        if (player.mixer) {
            player.mixer.update(delta);
        }
    }

    otherPlayers.forEach((otherPlayer) => {
        if (otherPlayer.mixer) {
            otherPlayer.mixer.update(delta);
        }
    });

    updateDustParticles();
    updateHatAuraParticles();

    if (floatingHat) {
        floatingHat.rotation.y += delta * 0.3;
        floatingHat.position.y = 6 + Math.sin(clock.getElapsedTime() * 0.5) * 0.5;
    }

    // Update meme coin stats periodically
    const now = Date.now();
    if (now - lastStatsUpdate > STATS_UPDATE_INTERVAL && TOKEN_ADDRESS && TOKEN_ADDRESS !== 'YOUR_SOLANA_TOKEN_ADDRESS_HERE') {
        fetchMemeCoinStats();
        lastStatsUpdate = now;
    }

    renderer.render(scene, camera);
}

// Chat functions
function openChat() {
    // Close emote wheel if open
    if (isEmoteWheelOpen) {
        closeEmoteWheel();
    }

    isChatOpen = true;
    const chatContainer = document.getElementById('chat-container');
    const chatInputContainer = document.getElementById('chat-input-container');
    const chatHint = document.getElementById('chat-hint');

    if (chatContainer) chatContainer.classList.remove('hidden');
    if (chatInputContainer) chatInputContainer.classList.add('active');
    if (chatHint) chatHint.classList.add('hidden');

    const chatInput = document.getElementById('chat-input');
    if (chatInput) {
        chatInput.focus();
    }

    if (document.pointerLockElement) {
        document.exitPointerLock();
    }
}

function closeChat() {
    isChatOpen = false;
    const chatInputContainer = document.getElementById('chat-input-container');
    const chatHint = document.getElementById('chat-hint');
    
    if (chatInputContainer) chatInputContainer.classList.remove('active');
    if (chatHint) chatHint.classList.remove('hidden');
    
    const chatInput = document.getElementById('chat-input');
    if (chatInput) {
        chatInput.value = '';
        chatInput.blur();
    }
}

function sendChatMessage() {
    const chatInput = document.getElementById('chat-input');
    if (!chatInput || !socket || !socket.connected) return;
    
    const message = chatInput.value.trim();
    if (message.length === 0) {
        closeChat();
        return;
    }
    
    socket.emit('chatMessage', {
        username: username,
        message: message
    });
    
    addMessageToChatLog(username, message);
    
    chatInput.value = '';
    closeChat();
}

function addMessageToChatLog(username, message) {
    const chatLog = document.getElementById('chat-log');
    if (!chatLog) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message';
    messageDiv.innerHTML = `<span class="chat-username">${escapeHtml(username)}:</span> ${escapeHtml(message)}`;
    
    chatLog.appendChild(messageDiv);
    chatLog.scrollTop = chatLog.scrollHeight;
    
    while (chatLog.children.length > 50) {
        chatLog.removeChild(chatLog.firstChild);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Emote wheel functions
function openEmoteWheel() {
    if (isChatOpen) return; // Don't open if chat is open

    isEmoteWheelOpen = true;
    hoveredEmoteId = null;

    // Force player to idle pose
    if (player && player.animations && player.animations.idle) {
        updatePlayerAnimation(player, 'idle');
        player.animState = 'idle';
    }

    // Exit pointer lock to show mouse cursor
    if (document.pointerLockElement) {
        document.exitPointerLock();
    }

    const emoteWheel = document.getElementById('emote-wheel');
    if (emoteWheel) {
        emoteWheel.classList.remove('hidden');
    }

    // Add hover handlers to track which emote is being hovered
    const emoteItems = document.querySelectorAll('.emote-item');
    emoteItems.forEach(item => {
        item.addEventListener('mouseenter', handleEmoteHover);
        item.addEventListener('mouseleave', handleEmoteUnhover);
    });
}

function closeEmoteWheel() {
    isEmoteWheelOpen = false;
    hoveredEmoteId = null;

    const emoteWheel = document.getElementById('emote-wheel');
    if (emoteWheel) {
        emoteWheel.classList.add('hidden');
    }

    // Remove hover handlers
    const emoteItems = document.querySelectorAll('.emote-item');
    emoteItems.forEach(item => {
        item.removeEventListener('mouseenter', handleEmoteHover);
        item.removeEventListener('mouseleave', handleEmoteUnhover);
        item.classList.remove('hovered');
    });
}

function handleEmoteHover(event) {
    hoveredEmoteId = event.target.dataset.emote;
    event.target.classList.add('hovered');
}

function handleEmoteUnhover(event) {
    if (hoveredEmoteId === event.target.dataset.emote) {
        hoveredEmoteId = null;
    }
    event.target.classList.remove('hovered');
}

function playEmote(emoteId) {
    console.log(`Playing emote ${emoteId}`);

    // Add visual feedback
    const emoteElement = document.querySelector(`.emote-item[data-emote="${emoteId}"]`);
    if (emoteElement) {
        emoteElement.classList.add('playing-emote');
        setTimeout(() => {
            emoteElement.classList.remove('playing-emote');
        }, 600);
    }

    // Send emote to server (for multiplayer sync)
    if (socket && socket.connected) {
        socket.emit('playEmote', {
            emoteId: emoteId,
            playerId: socket.id
        });
    }

    // TODO: Add actual emote animation/display when you provide the .glb files
}
