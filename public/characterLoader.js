// Helper function to load 3D character models
// This will be used when you provide your character model

function loadCharacterModel(modelPath, callback) {
    // Check if GLTFLoader is available
    if (typeof THREE.GLTFLoader === 'undefined') {
        console.error('GLTFLoader not found. Make sure to include it in your HTML.');
        return null;
    }
    
    const loader = new THREE.GLTFLoader();
    
    loader.load(
        modelPath,
        // onLoad callback
        (gltf) => {
            const model = gltf.scene;
            
            // Enable shadows
            model.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            
            // Scale and position the model appropriately
            // Adjust these values based on your model's size
            model.scale.set(1, 1, 1);
            model.position.set(0, 0, 0);
            
            if (callback) {
                callback(model);
            }
        },
        // onProgress callback
        (progress) => {
            console.log('Loading progress:', (progress.loaded / progress.total * 100) + '%');
        },
        // onError callback
        (error) => {
            console.error('Error loading model:', error);
        }
    );
}

// Example usage:
// loadCharacterModel('models/your-character.glb', (model) => {
//     player.mesh.add(model);
// });

