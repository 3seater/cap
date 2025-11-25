# How to Add Mixamo Animations to Your Character

## Step 1: Get Your Character Model Ready
1. Make sure your character model is already in `public/models/character.glb`
2. The model should be in T-pose or A-pose for best results

## Step 2: Download Walk Animation from Mixamo
1. Go to [Mixamo.com](https://www.mixamo.com)
2. Search for a walk animation (e.g., "Walking", "Walking Forward", "Walking Loop")
3. Click on the character to select it
4. Choose your character model (or a similar one)
5. Click "Download" and select:
   - **Format**: FBX for Motion (or GLTF if available)
   - **Skin**: With Skin (if you want the animation to work with your model)
   - **Frames Per Second**: 30 or 60
   - **Pose**: T-Pose (if available)

## Step 3: Download Idle Animation (Optional but Recommended)
1. Search for "Idle" animations in Mixamo
2. Download one that loops smoothly
3. Use the same settings as above

## Step 4: Export from Blender (if needed)
If you downloaded FBX files, you'll need to convert them:

1. Open Blender
2. Import your character model (File > Import > glTF 2.0)
3. Import the walk animation (File > Import > FBX)
4. Select the armature and go to Animation workspace
5. Export as GLTF with animations:
   - File > Export > glTF 2.0
   - Check "Selected Objects"
   - Check "Include Animations"
   - Save as `character.glb` in `public/models/`

## Step 5: Alternative - Use Separate Animation Files
If you have separate animation files, you can:
1. Place walk animation as `public/models/walk.glb`
2. Place idle animation as `public/models/idle.glb`
3. Update the code to load animations separately

## Step 6: Test It
1. Start your server: `npm start`
2. Open `http://localhost:3000`
3. Move with WASD - you should see the walk animation
4. Stop moving - you should see the idle animation

## Troubleshooting

### Animation Not Playing?
- Check browser console for errors
- Make sure your GLB file includes animations (check file size - should be larger if animations are included)
- Verify animation names in console - the code looks for "walk", "idle", "run", "jog" in the animation name

### Wrong Animation Playing?
- The code automatically detects animations by name
- If your Mixamo animation has a different name, you can modify the code in `createPlayerCharacter()` function
- Look for the section that checks `clipName.includes('walk')` and add your animation name

### Animation Too Fast/Slow?
- You can adjust animation speed by setting `action.timeScale` in the code
- For example: `walkAction.timeScale = 1.2;` makes it 20% faster

## Current Animation Detection
The code automatically looks for animations containing:
- **Walk**: "walk", "run", "jog"
- **Idle**: "idle", "tpose", "standing"

If your animation names are different, update the detection logic in `public/game.js` around line 350-365.

