// Game state
let scene, camera, renderer;
let player = null;
let otherPlayers = new Map();
let socket = null;
let username = '';
let isInitialized = false;
let clock = new THREE.Clock(); // For animation timing
let walkGLTF = null;
let idleGLTF = null;
let walkBackwardsGLTF = null;

// Movement state
const keys = {};
const moveSpeed = 0.02; // Reduced by 60% (40% of original speed)
const rotationSpeed = 0.05;
let pitch = 0; // Camera pitch (up/down look)

// Chat state
let isChatOpen = false;
let chatMessages = new Map(); // Store chat message sprites per player

function createGLTFLoader() {
    const loader = new THREE.GLTFLoader();
    try {
        if (typeof THREE.DRACOLoader !== 'undefined') {
            const dracoLoader = new THREE.DRACOLoader();
            dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
            loader.setDRACOLoader(dracoLoader);
        }
    } catch (e) {
        console.warn('DRACO loader not available, models will load without compression:', e);
    }
    return loader;
}

function loadWalkGLTF() {
    if (walkGLTF) {
        return Promise.resolve(walkGLTF);
    }
    const loader = createGLTFLoader();
    return new Promise((resolve, reject) => {
        loader.load(
            'models/walk.glb',
            (gltf) => {
                walkGLTF = gltf;
                resolve(gltf);
            },
            undefined,
            reject
        );
    });
}

function loadIdleGLTF() {
    if (idleGLTF) {
        return Promise.resolve(idleGLTF);
    }
    const loader = createGLTFLoader();
    return new Promise((resolve, reject) => {
        loader.load(
            'models/idle.glb',
            (gltf) => {
                idleGLTF = gltf;
                resolve(gltf);
            },
            undefined,
            reject
        );
    });
}

function loadWalkBackwardsGLTF() {
    // Always load fresh - add timestamp to bust browser cache
    const loader = createGLTFLoader();
    return new Promise((resolve, reject) => {
        loader.load(
            'models/walkbackwards.glb?v=' + Date.now(),
            (gltf) => {
                walkBackwardsGLTF = gltf;
                resolve(gltf);
            },
            undefined,
            reject
        );
    });
}

// Loading screen state
let loadingStartTime = 0;
const MIN_LOADING_TIME = 5000; // Minimum 5 seconds
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
    }, remaining);
}

// Initialize username input
document.getElementById('join-button').addEventListener('click', async () => {
    username = document.getElementById('username-field').value.trim() || `Player_${Math.random().toString(36).substr(2, 6)}`;
    
    // Hide username input and show loading screen immediately
    document.getElementById('username-input').classList.add('hidden');
    document.getElementById('loading-screen').classList.remove('hidden');
    // Make sure chat is hidden during loading
    document.getElementById('chat-container').classList.add('hidden');
    document.getElementById('chat-hint').classList.add('hidden');
    loadingStartTime = Date.now();
    modelsLoaded = false;
    serverConnected = false;
    
    // Small delay to ensure loading screen is visible
    await new Promise(resolve => setTimeout(resolve, 50));
    
    updateLoadingProgress(10, 'Loading character models...');
    
    // Preload models with progress tracking
    try {
        const loader = createGLTFLoader();
        
        // Load walk model with progress
        const walkPromise = new Promise((resolve, reject) => {
            loader.load(
                'models/walk.glb',
                (gltf) => {
                    walkGLTF = gltf;
                    updateLoadingProgress(50, 'Loading animations...');
                    resolve(gltf);
                },
                (progress) => {
                    if (progress.total > 0) {
                        const percent = 10 + (progress.loaded / progress.total) * 40;
                        updateLoadingProgress(percent, 'Loading character model...');
                    }
                },
                reject
            );
        });
        
        // Load idle model with progress
        const idlePromise = new Promise((resolve, reject) => {
            loader.load(
                'models/idle.glb',
                (gltf) => {
                    idleGLTF = gltf;
                    updateLoadingProgress(80, 'Connecting to server...');
                    resolve(gltf);
                },
                (progress) => {
                    if (progress.total > 0) {
                        const percent = 50 + (progress.loaded / progress.total) * 30;
                        updateLoadingProgress(percent, 'Loading idle animation...');
                    }
                },
                reject
            );
        });
        
        await Promise.all([walkPromise, idlePromise]);
        modelsLoaded = true;
        updateLoadingProgress(90, 'Initializing game...');
        
        // Initialize game
        init();
        
        // Check if we can hide loading screen
        if (serverConnected) {
            updateLoadingProgress(100, 'Ready!');
            hideLoadingScreen();
        }
    } catch (error) {
        console.error('Error loading models:', error);
        updateLoadingProgress(100, 'Error loading models');
        setTimeout(() => {
            init(); // Still try to initialize
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
    console.log('THREE.js version:', THREE.REVISION);
    console.log('DRACOLoader available:', typeof THREE.DRACOLoader !== 'undefined');

    // Initialize Three.js scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a1a2e); // Dark blue background
    
    // Add fog for atmospheric effect
    scene.fog = new THREE.FogExp2(0x0a1a2e, 0.08); // Dark blue fog, density controls how foggy
    
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
    
    // Spotlight coming down from above
    const spotlight = new THREE.SpotLight(0xffffff, 1.5);
    spotlight.position.set(0, 20, 0);
    spotlight.angle = Math.PI / 4; // 45 degree cone
    spotlight.penumbra = 0.3; // Soft edges
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
    
    // Create dark room (floor and walls)
    createRoom();
    
    // Create dust particles
    createDustParticles();
    
    // Create floating hat with glowing aura
    createFloatingHat();
    
    // Create placeholder character (will be replaced with user's model)
    createPlayerCharacter();
    
    // Connect to server
    // Use Render.com server for production, localhost for development
    const serverUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? '' // Use same origin for local development
        : 'https://cap-q7mt.onrender.com'; // Render.com server URL
    socket = io(serverUrl);
    
    socket.on('connect', () => {
        console.log('Connected to server');
        serverConnected = true;
        updateLoadingProgress(95, 'Connected!');
        
        // Send player join event
        socket.emit('playerJoin', {
            username: username,
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            isMoving: false
        });
        
        // Check if we can hide loading screen
        if (modelsLoaded) {
            updateLoadingProgress(100, 'Ready!');
            hideLoadingScreen();
        }
    });
    
    // Receive current players
    socket.on('currentPlayers', (players) => {
        players.forEach(playerData => {
            if (playerData.id !== socket.id) {
                addOtherPlayer(playerData);
            }
        });
        updatePlayerCount();
    });
    
    // New player joined
    socket.on('playerJoined', (playerData) => {
        if (playerData.id !== socket.id) {
            addOtherPlayer(playerData);
            updatePlayerCount();
        }
    });
    
    // Player moved
    socket.on('playerMoved', (data) => {
        const otherPlayer = otherPlayers.get(data.id);
        if (otherPlayer) {
            otherPlayer.mesh.position.set(data.position.x, data.position.y, data.position.z);
            otherPlayer.mesh.rotation.y = data.rotation.y;
            
            // CRITICAL: Only update animations if mixer and actions are initialized
            if (otherPlayer.mixer && otherPlayer.walkAction && otherPlayer.idleAction) {
                if (typeof data.isMoving === 'boolean') {
                if (data.isMoving) {
                    const isBackwards = data.isMovingBackwards === true;
                    if (isBackwards && otherPlayer.walkBackwardsAction) {
                        if (!otherPlayer.isMovingBackwards || otherPlayer.currentAction !== otherPlayer.walkBackwardsAction) {
                            // Determine fade duration based on current state
                            let fadeDuration;
                            if (!otherPlayer.isMoving) {
                                // Transitioning from idle to walk backwards
                                fadeDuration = 1.2;
                            } else if (otherPlayer.isMoving && !otherPlayer.isMovingBackwards) {
                                // Switching from walk forward to walk backwards
                                fadeDuration = 1.0;
                            } else {
                                // Already walking backwards
                                fadeDuration = 0.8;
                            }
                            // Reset to beginning before fading
                            otherPlayer.walkBackwardsAction.reset();
                            otherPlayer.walkBackwardsAction.time = 0;
                            fadeToAction(otherPlayer, otherPlayer.walkBackwardsAction, fadeDuration);
                        }
                    } else if (otherPlayer.walkAction) {
                        if (!otherPlayer.isMoving || otherPlayer.isMovingBackwards || otherPlayer.currentAction !== otherPlayer.walkAction) {
                            // Determine fade duration based on current state
                            let fadeDuration;
                            if (!otherPlayer.isMoving) {
                                // Transitioning from idle to walk forward
                                fadeDuration = 1.2;
                            } else if (otherPlayer.isMoving && otherPlayer.isMovingBackwards) {
                                // Switching from walk backwards to walk forward
                                fadeDuration = 1.0;
                            } else {
                                // Already walking forward
                                fadeDuration = 0.5;
                            }
                            // Reset to beginning before fading
                            otherPlayer.walkAction.reset();
                            otherPlayer.walkAction.time = 0;
                            fadeToAction(otherPlayer, otherPlayer.walkAction, fadeDuration);
                        }
                    }
                    otherPlayer.isMoving = true;
                    otherPlayer.isMovingBackwards = isBackwards;
                } else if (!data.isMoving && otherPlayer.isMoving && otherPlayer.idleAction) {
                    // Longer fade when returning to idle
                    fadeToAction(otherPlayer, otherPlayer.idleAction, 1.0);
                    otherPlayer.isMoving = false;
                    otherPlayer.isMovingBackwards = false;
                }
                }
            } else {
                // Animations not loaded yet, just update movement state
                if (typeof data.isMoving === 'boolean') {
                    otherPlayer.isMoving = data.isMoving;
                    otherPlayer.isMovingBackwards = data.isMovingBackwards === true;
                }
            }
        }
    });
    
    // Player left
    socket.on('playerLeft', (playerId) => {
        removeOtherPlayer(playerId);
        updatePlayerCount();
        // Remove chat message sprite if exists
        if (chatMessages.has(playerId)) {
            const chatSprite = chatMessages.get(playerId);
            scene.remove(chatSprite);
            chatMessages.delete(playerId);
        }
    });
    
    // Chat message received
    socket.on('chatMessage', (data) => {
        // Only show in terminal, not above heads
        addMessageToChatLog(data.username, data.message);
    });
    
    // Keyboard controls
    document.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();
        
        // T key to toggle chat
        if (key === 't' && isInitialized && !isChatOpen) {
            openChat();
            e.preventDefault();
            return;
        }
        
        // Enter to send message (only if chat is open)
        if (key === 'enter' && isChatOpen) {
            sendChatMessage();
            e.preventDefault();
            return;
        }
        
        // Escape to close chat
        if (key === 'escape' && isChatOpen) {
            closeChat();
            e.preventDefault();
            return;
        }
        
        // Don't register movement keys if chat is open
        if (!isChatOpen) {
            keys[key] = true;
        }
    });
    
    document.addEventListener('keyup', (e) => {
        if (!isChatOpen) {
            keys[e.key.toLowerCase()] = false;
        }
    });
    
    // Mouse controls for camera
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
            
            // Smooth pitch with soft limits to prevent glitchy rotation at extremes
            const pitchDelta = e.movementY * 0.002;
            const newPitch = pitch + pitchDelta;
            const maxPitch = Math.PI / 2 - 0.1; // Slightly less than 90 degrees to prevent issues
            const minPitch = -Math.PI / 2 + 0.1;
            
            // Apply soft limit - reduce sensitivity near limits
            if (newPitch > maxPitch) {
                const excess = newPitch - maxPitch;
                pitch = maxPitch + excess * 0.1; // Dampen movement near limit
            } else if (newPitch < minPitch) {
                const excess = newPitch - minPitch;
                pitch = minPitch + excess * 0.1; // Dampen movement near limit
            } else {
                pitch = newPitch;
            }
            
            // Hard clamp as final safety
            pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, pitch));
        }
    });
    
    // Handle window resize
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
    
    // Start game loop
    animate();
}

function createRoom() {
    const roomRadius = 25; // Radius of the dome
    
    // Floor
    const floorGeometry = new THREE.PlaneGeometry(50, 50);
    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    
    // Dome (hemisphere) - dark blue
    const domeGeometry = new THREE.SphereGeometry(roomRadius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const domeMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x0a1a2e, // Dark blue dome
        side: THREE.BackSide, // Render inside of the sphere
        roughness: 0.9,
        metalness: 0.1
    });
    const dome = new THREE.Mesh(domeGeometry, domeMaterial);
    dome.position.y = roomRadius; // Position so the bottom of the sphere is at ground level
    dome.receiveShadow = true;
    scene.add(dome);
}

// Global variable to store dust particles for animation
let dustParticles = [];
let floatingHat = null; // Store hat reference for animation

function createDustParticles() {
    const particleCount = 200; // Number of dust particles
    
    // Create a realistic dust particle texture (circular, soft edges)
    const createDustTexture = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const context = canvas.getContext('2d');
        
        // Create a gradient for soft circular dust mote
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
    
    // Create individual sprites for each dust particle
    for (let i = 0; i < particleCount; i++) {
        // Random position within the dome
        const radius = Math.random() * 20;
        const theta = Math.random() * Math.PI * 2;
        const height = Math.random() * 15;
        
        const x = Math.cos(theta) * radius;
        const y = height;
        const z = Math.sin(theta) * radius;
        
        // Create sprite material
        const spriteMaterial = new THREE.SpriteMaterial({
            map: texture,
            color: 0x8a9ba8,
            transparent: true,
            opacity: 0.4 + Math.random() * 0.3, // Random opacity between 0.4 and 0.7
            blending: THREE.AdditiveBlending,
            depthTest: true,
            depthWrite: false
        });
        
        // Create sprite - smaller particles
        const sprite = new THREE.Sprite(spriteMaterial);
        const size = Math.random() * 0.15 + 0.05; // Random size between 0.05 and 0.2 (smaller)
        sprite.scale.set(size, size, 1);
        sprite.position.set(x, y, z);
        
        // Store velocity for animation (15% faster)
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
        
        // Update position
        sprite.position.x += vel.x;
        sprite.position.y += vel.y;
        sprite.position.z += vel.z;
        
        // Wrap around if particles go too far (keep them in the dome area)
        const radius = Math.sqrt(sprite.position.x * sprite.position.x + sprite.position.z * sprite.position.z);
        if (radius > 22) {
            // Reset to opposite side
            sprite.position.x = -sprite.position.x * 0.9;
            sprite.position.z = -sprite.position.z * 0.9;
        }
        
        // Reset height if too high or too low
        if (sprite.position.y > 18 || sprite.position.y < 0) {
            sprite.position.y = Math.max(0.5, Math.min(17.5, sprite.position.y));
            vel.y *= -0.5; // Bounce back
        }
        
        // Add some random drift
        vel.x += (Math.random() - 0.5) * 0.001;
        vel.y += (Math.random() - 0.5) * 0.0005;
        vel.z += (Math.random() - 0.5) * 0.001;
        
        // Dampen velocities to prevent excessive speed
        vel.x *= 0.99;
        vel.y *= 0.99;
        vel.z *= 0.99;
        
        // Make sprites always face the camera
        sprite.lookAt(camera.position);
    });
}

function createFloatingHat() {
    const hatGroup = new THREE.Group();
    hatGroup.position.set(0, 6, 0); // Float lower to the ground
    
    // Create glowing aura using point light
    const glowLight = new THREE.PointLight(0x1047d2, 2, 15);
    glowLight.position.set(0, 0, 0);
    hatGroup.add(glowLight);
    
    // Create additional aura effect with particles/sprites
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
    
    // Create multiple glow layers for depth
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
    
    // Load hat model from hat/hat.glb
    const loader = createGLTFLoader();
    loader.load(
        'hat/hat.glb',
        (gltf) => {
            console.log('Hat model loaded');
            const hatModel = gltf.scene;
            
            // Enable shadows
            hatModel.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    // Make hat glow
                    if (child.material) {
                        child.material.emissive = new THREE.Color(0x1047d2);
                        child.material.emissiveIntensity = 0.3;
                    }
                }
            });
            
            // Scale the hat appropriately - 5 times bigger
            const box = new THREE.Box3().setFromObject(hatModel);
            const size = box.getSize(new THREE.Vector3());
            const maxDimension = Math.max(size.x, size.y, size.z);
            const scale = 7.5 / maxDimension; // 5 times bigger (1.5 * 5 = 7.5)
            hatModel.scale.set(scale, scale, scale);
            
            // Center the hat
            const center = box.getCenter(new THREE.Vector3());
            hatModel.position.sub(center);
            
            hatGroup.add(hatModel);
            floatingHat = hatGroup;
            scene.add(hatGroup);
        },
        undefined,
        (error) => {
            console.error('Error loading hat model:', error);
            // Create placeholder if hat fails to load
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
    
    // Username label - sleek and small
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1; // For sharp text rendering
    
    // Set font and measure text
    context.font = '500 10px Inter, -apple-system, sans-serif';
    const textWidth = context.measureText(username).width;
    
    // Smaller canvas size
    const baseWidth = Math.max(80, textWidth + 16);
    const baseHeight = 20;
    
    // High resolution canvas to prevent blur
    canvas.width = baseWidth * dpr;
    canvas.height = baseHeight * dpr;
    canvas.style.width = baseWidth + 'px';
    canvas.style.height = baseHeight + 'px';
    
    // Scale context for high DPI
    context.scale(dpr, dpr);
    
    // Background with subtle border
    context.fillStyle = 'rgba(0, 0, 0, 0.75)';
    context.fillRect(0, 0, baseWidth, baseHeight);
    
    // Thin blue border
    context.strokeStyle = '#1047d2';
    context.lineWidth = 1;
    context.strokeRect(0.5, 0.5, baseWidth - 1, baseHeight - 1);
    
    // Username text - smaller, cleaner font
    context.fillStyle = '#ffffff';
    context.font = '500 10px Inter, -apple-system, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(username, baseWidth / 2, baseHeight / 2);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter; // Prevent blur
    texture.magFilter = THREE.LinearFilter;
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(spriteMaterial);
    // Much smaller scale
    const aspectRatio = baseWidth / baseHeight;
    sprite.scale.set(0.15 * aspectRatio, 0.15, 1);
    sprite.position.y = 2.5;
    group.add(sprite);
    
    group.position.set(0, 0, 0);
    scene.add(group);
    
    // Load models - make walkBackwards optional so character still loads if it fails
    Promise.all([
        loadWalkGLTF(), 
        loadIdleGLTF()
        // No longer need walkBackwards - we'll reverse walk forwards instead
    ])
        .then(([walkGltf, idleGltf]) => {
            // walkBackwardsGltf is no longer used - we reverse walk.glb instead
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
            
            const mixer = new THREE.AnimationMixer(model);
            let walkAction = null;
            let walkBackwardsAction = null;
            let idleAction = null;
            let currentAction = null;
            
            // Find the skeleton in the cloned model
            let skeleton = null;
            model.traverse((child) => {
                if (child.isSkinnedMesh && child.skeleton) {
                    skeleton = child.skeleton;
                    console.log('=== SKELETON DEBUG ===');
                    console.log('Found skeleton in model:', skeleton.bones.length, 'bones');
                    // Log ALL bone names for debugging
                    const allBoneNames = skeleton.bones.map(b => b.name);
                    console.log('ALL skeleton bone names:', allBoneNames);
                    console.log('First 10 bone names:', allBoneNames.slice(0, 10));
                }
            });
            
            if (!skeleton) {
                console.error('ERROR: No skeleton found in cloned model!');
            }
            
            // Load walk animation from walk.glb
            if (walkGltf.animations && walkGltf.animations.length > 0) {
                const walkClip = walkGltf.animations[0];
                console.log('Loading walk animation:', walkClip.name || 'unnamed', 'tracks:', walkClip.tracks.length);
                
                // Log track names to see what bones they reference
                const trackNames = walkClip.tracks.slice(0, 10).map(t => t.name);
                console.log('Sample animation track names:', trackNames);
                
                // Try to find the clip by name first, or use first one
                let clipToUse = walkClip;
                if (walkGltf.animations.length > 1) {
                    const namedClip = walkGltf.animations.find(clip => clip.name && (clip.name.toLowerCase().includes('walk') || clip.name.toLowerCase().includes('forward')));
                    if (namedClip) clipToUse = namedClip;
                }
                
                walkAction = mixer.clipAction(clipToUse);
                if (walkAction) {
                    // Check if the action actually has any effective tracks
                    // In Three.js, property bindings are stored internally and may not be directly accessible
                    // Instead, check if the action is properly configured
                    console.log('Walk action created successfully');
                    console.log('Action clip:', walkAction.getClip().name);
                    console.log('Action mixer:', walkAction.getMixer() === mixer);
                    
                    walkAction.setLoop(THREE.LoopRepeat);
                    walkAction.reset();
                    walkAction.enabled = true;
                    walkAction.paused = false;
                    walkAction.setEffectiveWeight(1.0);
                    // Walk forward - play walk.glb normally
                    walkAction.setEffectiveTimeScale(1.0);
                    
                    // Verify the action is set up correctly
                    console.log('Walk action configured - enabled:', walkAction.enabled, 'paused:', walkAction.paused, 'weight:', walkAction.getEffectiveWeight());
                    
                    // Test play immediately to verify it works
                    walkAction.play();
                    setTimeout(() => {
                        console.log('Walk action test after 100ms - time:', walkAction.time, 'weight:', walkAction.getEffectiveWeight());
                    }, 100);
                    walkAction.stop(); // Stop it for now, will be started by movement system
                } else {
                    console.error('Failed to create walk action - mixer.clipAction returned null');
                    console.log('Available animations:', walkGltf.animations.map(a => a.name || 'unnamed'));
                }
            } else {
                console.warn('No walk animation found in walk.glb. Animations array:', walkGltf.animations);
            }
            
            // Use reversed walk forwards animation for walk backwards
            // This reverses all keyframes of the walk forwards animation
            if (walkGltf && walkGltf.animations && walkGltf.animations.length > 0) {
                const walkClip = walkGltf.animations[0];
                console.log('Creating walk backwards from reversed walk forwards animation');
                
                // Use the same walk forwards clip but play it backwards
                walkBackwardsAction = mixer.clipAction(walkClip);
                if (walkBackwardsAction) {
                    walkBackwardsAction.setLoop(THREE.LoopRepeat);
                    walkBackwardsAction.reset();
                    walkBackwardsAction.enabled = true;
                    walkBackwardsAction.paused = false;
                    walkBackwardsAction.setEffectiveWeight(1.0);
                    // Walk backwards - reverse walk.glb animation
                    walkBackwardsAction.setEffectiveTimeScale(-1.0);
                    console.log('Walk backwards (reversed walk forwards) action configured');
                }
            } else {
                console.warn('No walk forwards animation found to reverse for walk backwards');
            }
            
            // Load idle animation from idle.glb
            if (idleGltf && idleGltf.animations && idleGltf.animations.length > 0) {
                const idleClip = idleGltf.animations[0];
                console.log('Loading idle animation:', idleClip.name || 'unnamed', 'tracks:', idleClip.tracks.length);
                
                // Try to find the clip by name first, or use first one
                let clipToUse = idleClip;
                if (idleGltf.animations.length > 1) {
                    const namedClip = idleGltf.animations.find(clip => clip.name && (clip.name.toLowerCase().includes('idle') || clip.name.toLowerCase().includes('rest')));
                    if (namedClip) clipToUse = namedClip;
                }
                
                idleAction = mixer.clipAction(clipToUse);
                if (idleAction) {
                    console.log('Idle action created successfully');
                    console.log('Action clip:', idleAction.getClip().name);
                    
                    idleAction.setLoop(THREE.LoopRepeat);
                    idleAction.reset();
                    idleAction.enabled = true;
                    idleAction.paused = false;
                    idleAction.setEffectiveWeight(1.0);
                    
                    idleAction.play();
                    currentAction = idleAction;
                    console.log('Idle action playing - weight:', idleAction.getEffectiveWeight(), 'enabled:', idleAction.enabled);
                } else {
                    console.error('Failed to create idle action');
                    // Fallback to walk animation if idle not available
                    if (walkAction) {
                        idleAction = walkAction;
                        walkAction.play();
                        currentAction = walkAction;
                        console.warn('Falling back to walk animation as idle');
                    }
                }
            } else {
                console.warn('No idle animation found in idle.glb. Animations array:', idleGltf?.animations);
                // Fallback to walk animation if idle not available
                if (walkAction) {
                    idleAction = walkAction;
                    walkAction.play();
                    currentAction = walkAction;
                    console.warn('Falling back to walk animation as idle');
                }
            }
            
            // Update username sprite position after model loads
            if (size.y > 0) {
                sprite.position.y = (size.y * scale) + 1.2; // Raised higher above character
            }
            
            player.mixer = mixer;
            player.walkAction = walkAction;
            player.walkBackwardsAction = walkBackwardsAction;
            player.idleAction = idleAction;
            player.currentAction = currentAction;
            player.isMoving = false;
            player.isMovingBackwards = false;
            
            // Ensure walk and walkBackwards actions are stopped initially (idle should be playing)
            if (walkAction) walkAction.stop();
            if (walkBackwardsAction) walkBackwardsAction.stop();
            
            // Update username sprite position after model loads
            if (size.y > 0) {
                sprite.position.y = (size.y * scale) + 1.2; // Raised higher above character
            }
        })
        .catch((error) => {
            console.error('Error loading character model:', error);
            // Don't create placeholder - just log the error
            // The group will remain empty if model fails to load
        });
    
    player = {
        mesh: group,
        usernameSprite: sprite,
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        isMoving: false
    };
    
    // Third-person camera setup - behind the character
    camera.position.set(0, 4, -3); // Behind character (negative Z)
    camera.lookAt(0, 2.5, 0);
}

function createPlaceholderCharacter(group) {
    // Fallback placeholder if model fails to load
    const bodyGeometry = new THREE.CylinderGeometry(0.3, 0.3, 1.5, 8);
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x4a90e2 });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.75;
    body.castShadow = true;
    group.add(body);
    
    const headGeometry = new THREE.SphereGeometry(0.25, 8, 8);
    const headMaterial = new THREE.MeshStandardMaterial({ color: 0xffdbac });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 1.75;
    head.castShadow = true;
    group.add(head);
}

function addOtherPlayer(playerData) {
    const group = new THREE.Group();
    
    // Username label - sleek and small
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1; // For sharp text rendering
    
    // Set font and measure text
    context.font = '500 10px Inter, -apple-system, sans-serif';
    const textWidth = context.measureText(playerData.username).width;
    
    // Smaller canvas size
    const baseWidth = Math.max(80, textWidth + 16);
    const baseHeight = 20;
    
    // High resolution canvas to prevent blur
    canvas.width = baseWidth * dpr;
    canvas.height = baseHeight * dpr;
    canvas.style.width = baseWidth + 'px';
    canvas.style.height = baseHeight + 'px';
    
    // Scale context for high DPI
    context.scale(dpr, dpr);
    
    // Background with rounded corners (draw rounded rectangle)
    const radius = 6; // Rounded corner radius
    context.fillStyle = 'rgba(0, 0, 0, 0.75)';
    context.beginPath();
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
    
    // Thin blue border with rounded corners
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
    
    // Username text - smaller, cleaner font
    context.fillStyle = '#ffffff';
    context.font = '500 10px Inter, -apple-system, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(playerData.username, baseWidth / 2, baseHeight / 2);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter; // Prevent blur
    texture.magFilter = THREE.LinearFilter;
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(spriteMaterial);
    // Make name tags 40% smaller (0.15 * 0.6 = 0.09)
    const aspectRatio = baseWidth / baseHeight;
    sprite.scale.set(0.09 * aspectRatio, 0.09, 1);
    sprite.position.y = 3.2; // Raised higher above character
    group.add(sprite);
    
    group.position.set(playerData.position.x, playerData.position.y, playerData.position.z);
    group.rotation.y = playerData.rotation.y;
    scene.add(group);
    
    // Load models - make walkBackwards optional so character still loads if it fails
    Promise.all([
        loadWalkGLTF(), 
        loadIdleGLTF()
        // No longer need walkBackwards - we'll reverse walk forwards instead
    ])
        .then(([walkGltf, idleGltf]) => {
            // walkBackwardsGltf is no longer used - we reverse walk.glb instead
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
            console.log('Model added to group for:', playerData.username, 'Group children:', group.children.length);
            
            const mixer = new THREE.AnimationMixer(model);
            let walkAction = null;
            let walkBackwardsAction = null;
            let idleAction = null;
            let currentAction = null;
            
            // Find the skeleton in the cloned model
            let skeleton = null;
            model.traverse((child) => {
                if (child.isSkinnedMesh && child.skeleton) {
                    skeleton = child.skeleton;
                }
            });
            
            // Load walk animation from walk.glb
            if (walkGltf.animations && walkGltf.animations.length > 0) {
                const walkClip = walkGltf.animations[0];
                
                // Try to find the clip by name first, or use first one
                let clipToUse = walkClip;
                if (walkGltf.animations.length > 1) {
                    const namedClip = walkGltf.animations.find(clip => clip.name && (clip.name.toLowerCase().includes('walk') || clip.name.toLowerCase().includes('forward')));
                    if (namedClip) clipToUse = namedClip;
                }
                
                walkAction = mixer.clipAction(clipToUse);
                if (walkAction) {
                    const effectiveTracks = walkAction._propertyBindings ? walkAction._propertyBindings.length : 0;
                    if (effectiveTracks === 0) {
                        console.warn('WARNING: Walk action has no effective tracks for other player:', playerData.username);
                    }
                    walkAction.setLoop(THREE.LoopRepeat);
                    walkAction.reset();
                    walkAction.enabled = true;
                    walkAction.paused = false;
                    // Walk forward - play walk.glb normally
                    walkAction.setEffectiveTimeScale(1.0);
                }
            } else {
                console.warn('No walk animation found in walk.glb for other player:', playerData.username);
            }
            
            // Use reversed walk forwards animation for walk backwards
            if (walkGltf && walkGltf.animations && walkGltf.animations.length > 0) {
                const walkClip = walkGltf.animations[0];
                walkBackwardsAction = mixer.clipAction(walkClip);
                if (walkBackwardsAction) {
                    walkBackwardsAction.setLoop(THREE.LoopRepeat);
                    walkBackwardsAction.reset();
                    walkBackwardsAction.enabled = true;
                    walkBackwardsAction.paused = false;
                    walkBackwardsAction.setEffectiveWeight(1.0);
                    // Walk backwards - reverse walk.glb animation
                    walkBackwardsAction.setEffectiveTimeScale(-1.0);
                    console.log('Walk backwards (reversed walk forwards) configured for other player:', playerData.username);
                }
            }
            
            // Load idle animation from idle.glb
            if (idleGltf && idleGltf.animations && idleGltf.animations.length > 0) {
                const idleClip = idleGltf.animations[0];
                
                // Try to find the clip by name first
                let clipToUse = idleClip;
                if (idleGltf.animations.length > 1) {
                    const namedClip = idleGltf.animations.find(clip => clip.name && (clip.name.toLowerCase().includes('idle') || clip.name.toLowerCase().includes('rest')));
                    if (namedClip) clipToUse = namedClip;
                }
                
                idleAction = mixer.clipAction(clipToUse);
                if (idleAction) {
                    idleAction.setLoop(THREE.LoopRepeat);
                    idleAction.reset();
                    idleAction.enabled = true;
                    idleAction.paused = false;
                    idleAction.setEffectiveWeight(1.0);
                    idleAction.play();
                    currentAction = idleAction;
                } else {
                    console.warn('Failed to create idle action for other player:', playerData.username);
                    // Fallback to walk animation if idle not available
                    if (walkAction) {
                        idleAction = walkAction;
                        walkAction.play();
                        currentAction = walkAction;
                    }
                }
            } else {
                console.warn('No idle animation found in idle.glb for other player:', playerData.username);
                // Fallback to walk animation if idle not available
                if (walkAction) {
                    idleAction = walkAction;
                    walkAction.play();
                    currentAction = walkAction;
                }
            }
            
            // Update username sprite position after model loads
            if (size.y > 0) {
                sprite.position.y = (size.y * scale) + 1.2; // Raised higher above character
            }
            
            const otherPlayer = otherPlayers.get(playerData.id);
            if (otherPlayer) {
                // CRITICAL: Set up all animation properties
                otherPlayer.mixer = mixer;
                otherPlayer.walkAction = walkAction;
                otherPlayer.walkBackwardsAction = walkBackwardsAction;
                otherPlayer.idleAction = idleAction;
                otherPlayer.currentAction = currentAction;
                otherPlayer.isMoving = Boolean(playerData.isMoving);
                otherPlayer.isMovingBackwards = Boolean(playerData.isMovingBackwards);
                
                // Ensure walk actions are stopped initially
                if (walkAction) walkAction.stop();
                if (walkBackwardsAction) walkBackwardsAction.stop();
                
                if (otherPlayer.isMoving) {
                    if (otherPlayer.isMovingBackwards && walkBackwardsAction) {
                        // Use appropriate fade duration based on state
                        const fadeDuration = (!otherPlayer.currentAction || otherPlayer.currentAction === idleAction) ? 1.2 : 0.8;
                        // Reset to beginning before fading
                        walkBackwardsAction.reset();
                        walkBackwardsAction.time = 0;
                        fadeToAction(otherPlayer, walkBackwardsAction, fadeDuration);
                    } else if (walkAction) {
                        // Use appropriate fade duration based on state
                        const fadeDuration = (!otherPlayer.currentAction || otherPlayer.currentAction === idleAction) ? 1.2 : 0.5;
                        // Reset to beginning before fading
                        walkAction.reset();
                        walkAction.time = 0;
                        fadeToAction(otherPlayer, walkAction, fadeDuration);
                    }
                } else {
                    // Start with idle animation if not moving
                    if (idleAction) {
                        idleAction.setEffectiveWeight(1.0);
                        idleAction.enabled = true;
                        idleAction.paused = false;
                        idleAction.reset();
                        idleAction.time = 0;
                        idleAction.play();
                        otherPlayer.currentAction = idleAction;
                        console.log('Starting idle animation for other player:', playerData.username);
                    }
                }
            } else {
                console.warn('Other player not found when setting up animations:', playerData.id);
            }
        })
        .catch((error) => {
            console.error('Error loading character for other player:', playerData.username, error);
            // Don't create placeholder - just log the error
            // The group will remain empty if model fails to load
        });
    
    otherPlayers.set(playerData.id, {
        mesh: group,
        usernameSprite: sprite,
        username: playerData.username,
        isMoving: Boolean(playerData.isMoving)
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

// Helper function to fade between animations (works for both player and other players)
function fadeToAction(character, newAction, duration = 0.5) {
    if (!character || !character.mixer || !newAction) {
        if (!newAction) {
            console.warn('fadeToAction: newAction is null or undefined');
        }
        return;
    }
    
    const oldAction = character.currentAction;
    
    // If it's the same action, don't do anything - just ensure it's playing
    if (oldAction === newAction) {
        // CRITICAL: Always ensure time scale is correct even for same action
        if (character.walkBackwardsAction === newAction) {
            newAction.setEffectiveTimeScale(-1.0); // Walk backwards - reverse walk.glb
        } else if (character.walkAction === newAction) {
            newAction.setEffectiveTimeScale(1.0); // Walk forward - play walk.glb normally
        }
        if (!newAction.isRunning()) {
            newAction.play();
        }
        newAction.setEffectiveWeight(1.0);
        newAction.enabled = true;
        return; // No need to transition
    }
    
    // Different actions - perform fade transition
    if (oldAction) {
        // Fade out old action
        oldAction.fadeOut(duration);
        oldAction.enabled = true; // Keep enabled during fade
    }
    
    // CRITICAL: Ensure new action is properly enabled and configured BEFORE everything else
    newAction.enabled = true;
    newAction.paused = false;
    
    // Make sure the action is properly synced with the mixer
    if (!newAction.getClip()) {
        console.error('fadeToAction: Animation clip is missing');
        return;
    }
    
    // CRITICAL: Always reset to beginning (time 0) for walk animations to ensure consistent start
    // This prevents random starting points that cause glitchy transitions
    if (character.walkAction === newAction || character.walkBackwardsAction === newAction) {
        // For walk animations, always reset to time 0 to start from the beginning (frame 0)
        newAction.reset();
        newAction.time = 0; // Explicitly set to 0 to ensure we start at frame 0
    } else if (!newAction.isRunning()) {
        // For other animations, only reset if not already running
        newAction.reset();
    }
    
    // CRITICAL: Set time scale based on action type - DO NOT CHANGE THESE VALUES
    // Walk forward (W key) = walk.glb played normally = time scale 1.0
    // Walk backwards (S key) = walk.glb played in reverse = time scale -1.0
    if (character.walkBackwardsAction === newAction) {
        newAction.setEffectiveTimeScale(-1.0); // Walk backwards - reverse walk.glb
    } else if (character.walkAction === newAction) {
        newAction.setEffectiveTimeScale(1.0); // Walk forward - play walk.glb normally (EXACT ANIMATION)
    } else {
        newAction.setEffectiveTimeScale(1.0); // Normal speed for other animations (idle, etc)
    }
    
    // Start playing the new action FIRST (important for proper binding)
    // Make sure it starts from time 0 (frame 0)
    newAction.time = 0;
    newAction.play();
    
    // CRITICAL: Use crossFadeTo instead of manual fade for more reliable transitions
    // But first ensure weights are properly set
    if (oldAction && oldAction !== newAction) {
        // Use crossfade for smoother transition
        oldAction.crossFadeTo(newAction, duration, false);
    } else {
        // No old action or same action - just fade in
        newAction.setEffectiveWeight(0);
        newAction.fadeIn(duration);
    }
    
    // Force enable and ensure proper state
    newAction.enabled = true;
    newAction.paused = false;
    
    // CRITICAL: Ensure time scale is preserved correctly after crossFadeTo/fadeIn
    // Walk forward (W key) = walk.glb played normally = time scale 1.0
    // Walk backwards (S key) = walk.glb played in reverse = time scale -1.0
    if (character.walkBackwardsAction === newAction) {
        newAction.setEffectiveTimeScale(-1.0); // Walk backwards - reverse walk.glb
    } else if (character.walkAction === newAction) {
        newAction.setEffectiveTimeScale(1.0); // Walk forward - play walk.glb normally (EXACT ANIMATION)
    } else {
        newAction.setEffectiveTimeScale(1.0); // Normal speed for other animations
    }
    
    console.log('fadeToAction: Transitioning from', oldAction ? oldAction.getClip().name : 'none', 'to', newAction.getClip().name, 'duration', duration);
    console.log('fadeToAction: New action state - enabled:', newAction.enabled, 'paused:', newAction.paused, 'running:', newAction.isRunning(), 'weight:', newAction.getEffectiveWeight(), 'timeScale:', newAction.getEffectiveTimeScale());
    
    character.currentAction = newAction;
}

function updateMovement() {
    if (!player) return;
    
    const direction = new THREE.Vector3();
    let isMovingBackwards = false;
    
    // Calculate movement direction based on player rotation
    // Only W and S for forward/backward (strafe disabled)
    if (keys['w']) {
        direction.z += 1; // Forward is now positive Z
    }
    if (keys['s']) {
        direction.z -= 1; // Backward is now negative Z
        isMovingBackwards = true;
    }
    // A and D keys disabled (no strafing)
    
    const wantsToMove = direction.lengthSq() > 0;
    let stateChanged = false;
    
    if (wantsToMove) {
        direction.normalize();
        direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), player.mesh.rotation.y);
        
        player.mesh.position.x += direction.x * moveSpeed;
        player.mesh.position.z += direction.z * moveSpeed;
        
        // Use walk backwards animation when moving backwards
        if (isMovingBackwards) {
            if (player.mixer && player.walkBackwardsAction) {
                // Determine fade duration based on current state
                let fadeDuration;
                if (!player.isMoving) {
                    // Transitioning from idle to walk backwards - longer fade for smoothness
                    fadeDuration = 1.2;
                } else if (player.isMoving && !player.isMovingBackwards) {
                    // Switching from walk forward to walk backwards - longer fade to prevent glitchiness
                    fadeDuration = 1.0;
                } else {
                    // Already walking backwards
                    fadeDuration = 0.8;
                }
                
                if (!player.isMoving || player.isMovingBackwards || player.currentAction !== player.walkBackwardsAction) {
                    // CRITICAL: Reset to frame 0 before fading for smooth transition
                    player.walkBackwardsAction.reset();
                    player.walkBackwardsAction.time = 0;
                    fadeToAction(player, player.walkBackwardsAction, fadeDuration);
                    player.isMoving = true;
                    player.isMovingBackwards = true;
                    stateChanged = true;
                }
            } else {
                console.warn('Cannot play walk backwards: mixer:', !!player.mixer, 'action:', !!player.walkBackwardsAction);
            }
        } else {
            // Use forward walk animation
            if (player.mixer && player.walkAction) {
                // Determine fade duration based on current state
                let fadeDuration;
                if (!player.isMoving) {
                    // Transitioning from idle to walk forward - longer fade for smoothness
                    fadeDuration = 1.2;
                } else if (player.isMoving && player.isMovingBackwards) {
                    // Switching from walk backwards to walk forward - longer fade to prevent glitchiness
                    fadeDuration = 1.0;
                } else {
                    // Already walking forward
                    fadeDuration = 0.5;
                }
                
                if (!player.isMoving || player.isMovingBackwards || player.currentAction !== player.walkAction) {
                    // CRITICAL: Reset to frame 0 before fading for smooth transition
                    player.walkAction.reset();
                    player.walkAction.time = 0;
                    fadeToAction(player, player.walkAction, fadeDuration);
                    player.isMoving = true;
                    player.isMovingBackwards = false;
                    stateChanged = true;
                }
            } else {
                console.warn('Cannot play walk forward: mixer:', !!player.mixer, 'action:', !!player.walkAction);
            }
        }
    } else if (player.mixer && player.idleAction && (player.isMoving || player.isMovingBackwards)) {
        // Longer fade when returning to idle for smoothness
        fadeToAction(player, player.idleAction, 1.0);
        player.isMoving = false;
        player.isMovingBackwards = false;
        stateChanged = true;
    }
    
    // Update player position/rotation references
    player.position.x = player.mesh.position.x;
    player.position.y = player.mesh.position.y;
    player.position.z = player.mesh.position.z;
    player.rotation.y = player.mesh.rotation.y;
    
    // Send updates only when moving or when animation state changed
    if (socket && socket.connected) {
        if (wantsToMove || stateChanged) {
            socket.emit('playerMove', {
                position: { ...player.position },
                rotation: { ...player.rotation },
                isMoving: player.isMoving,
                isMovingBackwards: player.isMovingBackwards
            });
        }
    }
    
    // Update camera to follow player (third-person) - orbiting around character's head
    const headHeight = 2.5; // Height of character's head/upper body
    const cameraDistance = 3;
    const baseCameraHeight = 4;
    
    // Pivot point is at the character's head
    const pivotPoint = new THREE.Vector3(
        player.mesh.position.x,
        player.mesh.position.y + headHeight,
        player.mesh.position.z
    );
    
    // Calculate camera position - orbit around head based on yaw and pitch
    // Use spherical coordinates to avoid gimbal lock issues
    const cameraOffset = new THREE.Vector3(0, 0, -cameraDistance);
    
    // First rotate around Y axis (yaw) based on character rotation
    cameraOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), player.mesh.rotation.y);
    
    // Calculate right vector for pitch rotation (perpendicular to forward direction)
    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyAxisAngle(new THREE.Vector3(0, 1, 0), player.mesh.rotation.y);
    const rightVector = new THREE.Vector3(1, 0, 0);
    rightVector.applyAxisAngle(new THREE.Vector3(0, 1, 0), player.mesh.rotation.y);
    
    // Apply pitch rotation smoothly
    cameraOffset.applyAxisAngle(rightVector, pitch);
    
    // Add base height offset
    cameraOffset.y += baseCameraHeight - headHeight;
    
    camera.position.copy(pivotPoint).add(cameraOffset);
    
    // Look at the head pivot point with smooth rotation
    camera.lookAt(pivotPoint);
}

function animate() {
    requestAnimationFrame(animate);
    
    const delta = clock.getDelta(); // Get time since last frame
    
    if (player) {
        updateMovement();
        
        // Update player animation mixer
        if (player.mixer) {
            player.mixer.update(delta);
        }
    }
    
    // Update other players' animations
    otherPlayers.forEach((otherPlayer) => {
        if (otherPlayer.mixer) {
            otherPlayer.mixer.update(delta);
        }
    });
    
    // Update dust particles animation
    updateDustParticles();
    
    // Update floating hat rotation
    if (floatingHat) {
        floatingHat.rotation.y += delta * 0.3; // Slow rotation
        // Gentle floating motion
        floatingHat.position.y = 6 + Math.sin(clock.getElapsedTime() * 0.5) * 0.5;
    }
    
    // Chat messages now only appear in terminal, not above heads
    
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
    
    // Release pointer lock when chat opens
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
    
    // Send message to server
    socket.emit('chatMessage', {
        username: username,
        message: message
    });
    
    // Display own message in chat log
    addMessageToChatLog(username, message);
    
    // Clear input and close chat
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
    
    // Auto-scroll to bottom
    chatLog.scrollTop = chatLog.scrollHeight;
    
    // Keep only last 50 messages
    while (chatLog.children.length > 50) {
        chatLog.removeChild(chatLog.firstChild);
    }
}

// Chat messages now only appear in terminal, not above heads
// Removed displayChatMessage and updateChatMessageSprites functions

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

