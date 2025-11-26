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

// Meme coin stats
let memeCoinData = null;
let lastStatsUpdate = 0;
const STATS_UPDATE_INTERVAL = 30000; // Update every 30 seconds

// Your Solana token contract address (replace with your actual address)
// Example: const TOKEN_ADDRESS = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // USDC
const TOKEN_ADDRESS = "RwwqrcyNt9CDbCFTib9rs4ESjVJaPTNUK9gymXvpump";

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
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 0.3);
    scene.add(ambientLight);
    
    const spotlight = new THREE.SpotLight(0xffffff, 1.5);
    spotlight.position.set(0, 20, 0);
    spotlight.angle = Math.PI / 4;
    spotlight.penumbra = 0.3;
    spotlight.decay = 2;
    spotlight.distance = 50;
    spotlight.castShadow = true;
    spotlight.shadow.mapSize.width = 2048;
    spotlight.shadow.mapSize.height = 2048;
    spotlight.shadow.camera.near = 0.5;
    spotlight.shadow.camera.far = 50;
    spotlight.target.position.set(0, 0, 0);
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
            position: { x: 0, y: 0, z: 0 },
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
        
        if (!isChatOpen) {
            keys[key] = true;
        }
    });
    
    document.addEventListener('keyup', (e) => {
        if (!isChatOpen) {
            keys[e.key.toLowerCase()] = false;
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
        if (isPointerLocked) {
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
    const roomRadius = 25;
    
    const floorGeometry = new THREE.PlaneGeometry(50, 50);
    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    
    const domeGeometry = new THREE.SphereGeometry(roomRadius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const domeMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x0a1a2e,
        side: THREE.BackSide,
        roughness: 0.9,
        metalness: 0.1
    });
    const dome = new THREE.Mesh(domeGeometry, domeMaterial);
    dome.position.y = roomRadius;
    dome.receiveShadow = true;
    scene.add(dome);
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

function createFloatingHat() {
    const hatGroup = new THREE.Group();
    hatGroup.position.set(0, 6, 0);
    
    const glowLight = new THREE.PointLight(0x1047d2, 2, 15);
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
    
    for (let i = 0; i < 3; i++) {
        const glowSprite = new THREE.Sprite(
            new THREE.SpriteMaterial({
                map: glowTexture,
                transparent: true,
                opacity: 0.6 - i * 0.15,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            })
        );
        const size = 3 + i * 0.5;
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
            const scale = 7.5 / maxDimension;
            hatModel.scale.set(scale, scale, scale);
            
            const center = box.getCenter(new THREE.Vector3());
            hatModel.position.sub(center);
            
            hatGroup.add(hatModel);
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
    
    group.position.set(0, 0, 0);
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
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        animState: 'idle'
    };
    
    camera.position.set(0, 4, -3);
    camera.lookAt(0, 2.5, 0);
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
    
    // Walk animations - create separate actions to prevent interference
    if (walkGltf?.animations?.length > 0) {
        const walkClip = walkGltf.animations[0];
        
        // Forward walk - NORMAL playback (your walk.glb exactly as-is)
        animations.walkForward = mixer.clipAction(walkClip);
        animations.walkForward.setLoop(THREE.LoopRepeat);
        animations.walkForward.timeScale = 1.0; // POSITIVE = forward
        animations.walkForward.clampWhenFinished = false;
        
        // Clone the clip for backward to avoid sharing state
        const walkClipClone = walkClip.clone();
        animations.walkBackward = mixer.clipAction(walkClipClone);
        animations.walkBackward.setLoop(THREE.LoopRepeat);
        animations.walkBackward.timeScale = -1.0; // NEGATIVE = reversed
        animations.walkBackward.clampWhenFinished = false;
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
    let newAction = null;
    
    switch(newState) {
        case 'walkForward':
            newAction = animations.walkForward;
            break;
        case 'walkBackward':
            newAction = animations.walkBackward;
            break;
        case 'idle':
        default:
            newAction = animations.idle;
            break;
    }
    
    if (!newAction || newAction === playerObj.currentAction) return;
    
    // Fade from old to new animation
    const fadeDuration = 0.3; // Subtle fade
    
    if (playerObj.currentAction) {
        playerObj.currentAction.fadeOut(fadeDuration);
    }
    
    newAction.reset();
    
    // CRITICAL: Ensure timeScale is preserved correctly
    if (newAction === animations.walkForward) {
        newAction.timeScale = 1.0; // Force forward playback
    } else if (newAction === animations.walkBackward) {
        newAction.timeScale = -1.0; // Force backward playback
        // Start from end of animation for smooth reverse playback
        newAction.time = newAction.getClip().duration;
    }
    
    newAction.fadeIn(fadeDuration);
    newAction.play();
    
    console.log(`Animation changed to: ${newState}, timeScale: ${newAction.timeScale}`);
    
    playerObj.currentAction = newAction;
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
    if (!player) return;
    
    const direction = new THREE.Vector3();
    let newAnimState = 'idle';
    
    // Check movement keys
    if (keys['w']) {
        direction.z += 1; // Forward
        newAnimState = 'walkForward';
    }
    if (keys['s']) {
        direction.z -= 1; // Backward
        newAnimState = 'walkBackward';
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
