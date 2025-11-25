// Game state
let scene, camera, renderer;
let player = null;
let otherPlayers = new Map();
let socket = null;
let username = '';
let isInitialized = false;
let clock = new THREE.Clock(); // For animation timing

// Model cache to avoid reloading the same models
const modelCache = new Map();

// Movement state
const keys = {};
const moveSpeed = 0.05; // Reduced by 50% to match animation speed
const rotationSpeed = 0.05;
let pitch = 0; // Camera pitch (up/down look)

// Initialize username input
document.getElementById('join-button').addEventListener('click', () => {
    username = document.getElementById('username-field').value.trim() || `Player_${Math.random().toString(36).substr(2, 6)}`;
    document.getElementById('username-input').classList.add('hidden');
    document.getElementById('ui-overlay').classList.remove('hidden');
    init();
});

document.getElementById('username-field').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('join-button').click();
    }
});

function init() {
    if (isInitialized) return;
    isInitialized = true;

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
        
        // Send player join event
        socket.emit('playerJoin', {
            username: username,
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 }
        });
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
            const oldPos = otherPlayer.mesh.position.clone();
            otherPlayer.mesh.position.set(data.position.x, data.position.y, data.position.z);
            otherPlayer.mesh.rotation.y = data.rotation.y;
            
            // Check if player is moving (position changed)
            const isMoving = oldPos.distanceTo(otherPlayer.mesh.position) > 0.01;
            
            // Switch animations based on movement
            if (isMoving && !otherPlayer.isMoving && otherPlayer.mixer && otherPlayer.walkAction) {
                fadeToAction(otherPlayer, otherPlayer.walkAction);
                otherPlayer.isMoving = true;
            } else if (!isMoving && otherPlayer.isMoving && otherPlayer.mixer && otherPlayer.idleAction) {
                // Switch to idle animation when not moving
                fadeToAction(otherPlayer, otherPlayer.idleAction);
                otherPlayer.isMoving = false;
            }
        }
    });
    
    // Player left
    socket.on('playerLeft', (playerId) => {
        removeOtherPlayer(playerId);
        updatePlayerCount();
    });
    
    // Keyboard controls
    document.addEventListener('keydown', (e) => {
        keys[e.key.toLowerCase()] = true;
    });
    
    document.addEventListener('keyup', (e) => {
        keys[e.key.toLowerCase()] = false;
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
            pitch += e.movementY * 0.002; // Reversed: mouse up = look up, mouse down = look down
            pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch)); // Limit pitch to -90 to +90 degrees
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
        const size = Math.random() * 0.2 + 0.1; // Random size between 0.1 and 0.3 (much smaller)
        sprite.scale.set(size, size, 1);
        sprite.position.set(x, y, z);
        
        // Store velocity for animation
        sprite.userData.velocity = {
            x: (Math.random() - 0.5) * 0.02,
            y: (Math.random() - 0.5) * 0.01,
            z: (Math.random() - 0.5) * 0.02
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
    
    // Load the character model from walk.glb (using only this file)
    const loader = new THREE.GLTFLoader();
    // Set up DRACO loader for compressed models
    if (typeof THREE.DRACOLoader !== 'undefined') {
        const dracoLoader = new THREE.DRACOLoader();
        dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
        loader.setDRACOLoader(dracoLoader);
    }
    loader.load(
        'models/walk.glb',
        (gltf) => {
            // Cache the model for reuse
            if (!modelCache.has('walk')) {
                modelCache.set('walk', gltf.scene.clone(true));
            }
            
            const model = gltf.scene;
            
            // Enable shadows on all meshes
            model.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            
            // Adjust scale and position based on your model
            // You may need to tweak these values
            const box = new THREE.Box3().setFromObject(model);
            const size = box.getSize(new THREE.Vector3());
            const maxDimension = Math.max(size.x, size.y, size.z);
            const scale = 3.5 / maxDimension; // Scale to approximately 3.5 units tall (much bigger)
            
            model.scale.set(scale, scale, scale);
            
            // Character faces away from camera (positive Z direction)
            model.rotation.y = 0;
            
            // Center the model
            const center = box.getCenter(new THREE.Vector3());
            model.position.sub(center);
            model.position.y = -box.min.y * scale; // Place on ground
            
            group.add(model);
            
            // Create animation mixer for the model
            const mixer = new THREE.AnimationMixer(model);
            let walkAction = null;
            let currentAction = null;
            
            // Get animation from the walk.glb file
            if (gltf.animations && gltf.animations.length > 0) {
                const walkClip = gltf.animations[0];
                
                // Create the action with the animation
                walkAction = mixer.clipAction(walkClip);
                walkAction.setLoop(THREE.LoopRepeat);
                walkAction.reset();
                
                console.log('Walk animation loaded from walk.glb:', walkClip.name);
                
                // Don't play walk by default - wait for idle to load
            }
            
            // Update username sprite position based on model height
            if (size.y > 0) {
                sprite.position.y = (size.y * scale) + 0.5;
            }
            
            // Store animation data in player object
            player.mixer = mixer;
            player.walkAction = walkAction;
            player.idleAction = null;
            player.currentAction = currentAction;
            player.isMoving = false; // Start with idle
            
            // Load idle animation from separate file
            loader.load(
                'models/idle.glb',
                (idleGltf) => {
                    // Get idle animation from the idle GLB file
                    if (idleGltf.animations && idleGltf.animations.length > 0) {
                        const idleClip = idleGltf.animations[0];
                        const idleAction = mixer.clipAction(idleClip);
                        idleAction.setLoop(THREE.LoopRepeat);
                        idleAction.reset();
                        
                        player.idleAction = idleAction;
                        
                        // Start with idle animation
                        if (idleAction) {
                            idleAction.play();
                            player.currentAction = idleAction;
                        }
                        
                        console.log('Idle animation loaded from idle.glb:', idleClip.name);
                    }
                },
                undefined,
                (error) => {
                    console.log('Idle animation file not found. Character will use walk animation.');
                }
            );
        },
        (progress) => {
            console.log('Loading character:', (progress.loaded / progress.total * 100).toFixed(0) + '%');
        },
        (error) => {
            console.error('Error loading character model:', error);
            // Fallback to placeholder if model fails to load
            createPlaceholderCharacter(group);
        }
    );
    
    player = {
        mesh: group,
        usernameSprite: sprite,
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 }
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
    context.fillText(playerData.username, baseWidth / 2, baseHeight / 2);
    
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
    
    group.position.set(playerData.position.x, playerData.position.y, playerData.position.z);
    group.rotation.y = playerData.rotation.y;
    scene.add(group);
    
    // Load character model from walk.glb for other players
    // Check cache first to avoid reloading
    if (modelCache.has('walk')) {
        console.log('Using cached model for other player:', playerData.username);
        const cachedModel = modelCache.get('walk');
        const model = cachedModel.clone(true);
        setupOtherPlayerModel(model, group, sprite, playerData);
        return;
    }
    
    const loader = new THREE.GLTFLoader();
    // Set up DRACO loader for compressed models
    if (typeof THREE.DRACOLoader !== 'undefined') {
        const dracoLoader = new THREE.DRACOLoader();
        dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
        loader.setDRACOLoader(dracoLoader);
    }
    console.log('Loading character model for other player:', playerData.username);
    loader.load(
        'models/walk.glb',
        (gltf) => {
            console.log('Character model loaded successfully for:', playerData.username);
            // Cache the model for reuse
            if (!modelCache.has('walk')) {
                modelCache.set('walk', gltf.scene.clone(true));
            }
            // Clone the entire scene to avoid sharing references
            const model = gltf.scene.clone(true); // Deep clone to clone all children
            
            // Enable shadows
            model.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            
            // Use same scale as player character
            const box = new THREE.Box3().setFromObject(model);
            const size = box.getSize(new THREE.Vector3());
            const maxDimension = Math.max(size.x, size.y, size.z);
            const scale = 3.5 / maxDimension; // Same bigger scale
            
            model.scale.set(scale, scale, scale);
            
            // Character faces away from camera (positive Z direction)
            model.rotation.y = 0;
            
            // Center the model
            const center = box.getCenter(new THREE.Vector3());
            model.position.sub(center);
            model.position.y = -box.min.y * scale;
            
            group.add(model);
            console.log('Model added to group for:', playerData.username, 'Group children:', group.children.length);
            
            // Create animation mixer for other players
            const mixer = new THREE.AnimationMixer(model);
            let walkAction = null;
            let currentAction = null;
            
            // Get animation from the walk.glb file (same file as model)
            if (gltf.animations && gltf.animations.length > 0) {
                const walkClip = gltf.animations[0];
                walkAction = mixer.clipAction(walkClip);
                walkAction.setLoop(THREE.LoopRepeat);
                walkAction.reset();
                
                // Don't play walk by default - wait for idle to load
            }
            
            // Update username sprite position
            if (size.y > 0) {
                sprite.position.y = (size.y * scale) + 0.5;
            }
            
            // Store animation data
            const otherPlayer = otherPlayers.get(playerData.id);
            if (otherPlayer) {
                otherPlayer.mixer = mixer;
                otherPlayer.walkAction = walkAction;
                otherPlayer.idleAction = null;
                otherPlayer.currentAction = currentAction;
                otherPlayer.isMoving = false; // Start with idle
                
                // Load idle animation for other players
                loader.load(
                    'models/idle.glb',
                    (idleGltf) => {
                        if (idleGltf.animations && idleGltf.animations.length > 0) {
                            const idleClip = idleGltf.animations[0];
                            const idleAction = mixer.clipAction(idleClip);
                            idleAction.setLoop(THREE.LoopRepeat);
                            idleAction.reset();
                            
                            if (otherPlayer) {
                                otherPlayer.idleAction = idleAction;
                                // Start with idle
                                if (idleAction) {
                                    idleAction.play();
                                    otherPlayer.currentAction = idleAction;
                                }
                            }
                        }
                    },
                    undefined,
                    (error) => {
                        // Idle not found, that's okay
                    }
                );
            }
        },
        (progress) => {
            console.log('Loading other player model:', playerData.username, (progress.loaded / progress.total * 100).toFixed(0) + '%');
        },
        (error) => {
            console.error('Error loading character for other player:', playerData.username, error);
            // Fallback to placeholder - make it visible so we know the function is working
            const bodyGeometry = new THREE.CylinderGeometry(0.3, 0.3, 1.5, 8);
            const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xe24a4a });
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
            
            const headGeometry = new THREE.SphereGeometry(0.25, 8, 8);
            const headMaterial = new THREE.MeshStandardMaterial({ color: 0xffdbac });
            const head = new THREE.Mesh(headGeometry, headMaterial);
            head.position.y = 1.75;
            head.castShadow = true;
            group.add(head);
        }
    );
    
    otherPlayers.set(playerData.id, {
        mesh: group,
        usernameSprite: sprite,
        username: playerData.username
    });
}

// Helper function to set up other player model (used for cached models)
function setupOtherPlayerModel(model, group, sprite, playerData) {
    // Enable shadows
    model.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });
    
    // Use same scale as player character
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z);
    const scale = 3.5 / maxDimension;
    
    model.scale.set(scale, scale, scale);
    model.rotation.y = 0;
    
    // Center the model
    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center);
    model.position.y = -box.min.y * scale;
    
    group.add(model);
    
    // Update username sprite position
    if (size.y > 0) {
        sprite.position.y = (size.y * scale) + 0.5;
    }
    
    // Create animation mixer
    const mixer = new THREE.AnimationMixer(model);
    const otherPlayer = otherPlayers.get(playerData.id);
    if (otherPlayer) {
        otherPlayer.mixer = mixer;
        otherPlayer.walkAction = null;
        otherPlayer.idleAction = null;
        otherPlayer.currentAction = null;
        otherPlayer.isMoving = false;
        
        // Load idle animation
        const loader = new THREE.GLTFLoader();
        if (typeof THREE.DRACOLoader !== 'undefined') {
            const dracoLoader = new THREE.DRACOLoader();
            dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
            loader.setDRACOLoader(dracoLoader);
        }
        loader.load(
            'models/idle.glb',
            (idleGltf) => {
                if (idleGltf.animations && idleGltf.animations.length > 0) {
                    const idleClip = idleGltf.animations[0];
                    const idleAction = mixer.clipAction(idleClip);
                    idleAction.setLoop(THREE.LoopRepeat);
                    idleAction.reset();
                    
                    if (otherPlayer) {
                        otherPlayer.idleAction = idleAction;
                        if (idleAction) {
                            idleAction.play();
                            otherPlayer.currentAction = idleAction;
                        }
                    }
                }
            },
            undefined,
            (error) => {
                // Idle not found, that's okay
            }
        );
    }
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
function fadeToAction(character, newAction, duration = 0.3) {
    if (!character || !character.mixer || !newAction) return;
    
    const oldAction = character.currentAction;
    
    if (oldAction && oldAction !== newAction) {
        oldAction.fadeOut(duration);
    }
    
    if (newAction !== oldAction) {
        newAction.reset();
        newAction.fadeIn(duration);
        newAction.play();
    }
    
    character.currentAction = newAction;
}

function updateMovement() {
    if (!player) return;
    
    const direction = new THREE.Vector3();
    
    // Calculate movement direction based on player rotation
    // Only W and S for forward/backward (strafe disabled)
    if (keys['w']) {
        direction.z += 1; // Forward is now positive Z
    }
    if (keys['s']) {
        direction.z -= 1; // Backward is now negative Z
    }
    // A and D keys disabled (no strafing)
    
    // Normalize and apply rotation
    if (direction.length() > 0) {
        direction.normalize();
        direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), player.mesh.rotation.y);
        
        player.mesh.position.x += direction.x * moveSpeed;
        player.mesh.position.z += direction.z * moveSpeed;
        
        // Update player position
        player.position.x = player.mesh.position.x;
        player.position.y = player.mesh.position.y;
        player.position.z = player.mesh.position.z;
        player.rotation.y = player.mesh.rotation.y;
        
        // Switch to walk animation if not already walking
        if (player.mixer && player.walkAction && !player.isMoving) {
            fadeToAction(player, player.walkAction);
            player.isMoving = true;
        }
        
        // Send movement update to server
        if (socket && socket.connected) {
            socket.emit('playerMove', {
                position: player.position,
                rotation: player.rotation
            });
        }
    } else {
        // Switch to idle animation when not moving
        if (player.mixer && player.idleAction && player.isMoving) {
            fadeToAction(player, player.idleAction);
            player.isMoving = false;
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
    const cameraOffset = new THREE.Vector3(0, 0, -cameraDistance);
    
    // First rotate around Y axis (yaw) based on character rotation
    cameraOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), player.mesh.rotation.y);
    
    // Then rotate around X axis (pitch) - this creates the up/down look
    const rightVector = new THREE.Vector3(1, 0, 0);
    rightVector.applyAxisAngle(new THREE.Vector3(0, 1, 0), player.mesh.rotation.y);
    cameraOffset.applyAxisAngle(rightVector, pitch);
    
    // Add base height offset
    cameraOffset.y += baseCameraHeight - headHeight;
    
    camera.position.copy(pivotPoint).add(cameraOffset);
    
    // Always look at the head pivot point
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
    
    renderer.render(scene, camera);
}

