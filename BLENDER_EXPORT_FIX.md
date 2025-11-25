# Fix for T-Pose Issue: Blender Export Settings

## The Problem

You exported `walkbackwards.glb` and `idle.glb` as **"Action"** instead of **"NLA Tracks"**. This causes animations to not export properly, resulting in T-pose.

## The Solution

Re-export both files with the correct settings:

### Steps in Blender:

1. **Open your file** with the character and animations

2. **For idle.glb:**
   - Make sure the idle animation is active/selected
   - Go to **File → Export → glTF 2.0**
   - In the export settings, find **"Animation"** section:
     - ✅ Check **"Animations"**
     - ✅ Select **"NLA Tracks"** (NOT "Action")
     - ✅ Check **"Include All Actions"** (optional, but safer)
   - Export as `idle.glb`

3. **For walkbackwards.glb:**
   - Make sure the walk backwards animation is active/selected
   - Same export settings as above
   - ✅ Select **"NLA Tracks"** (NOT "Action")
   - Export as `walkbackwards.glb`

4. **Important:** Make sure the skeleton/armature matches `walk.glb`
   - All three files should use the same armature
   - The bone names must match exactly

## Why NLA Tracks vs Action?

- **NLA Tracks**: Exports animations in a format that Three.js can properly read and apply
- **Action**: Exports raw action data that might not be compatible with the skeleton structure

## After Re-exporting:

1. Replace the files in `public/models/`
2. The animations should work correctly
3. Check browser console - you should see "Loading walk backwards animation" and "Loading idle animation" messages

## Quick Check:

After re-exporting, the files should:
- Still be small (8-10 MB for animation-only)
- Work with the skeleton from walk.glb
- Not cause T-pose

