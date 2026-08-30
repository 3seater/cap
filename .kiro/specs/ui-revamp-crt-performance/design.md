# Design Document: UI Revamp, CRT/VHS Overlay & Performance Audit

## Overview

This document describes the technical design for three tightly coupled workstreams applied to the Cap multiplayer site — a single-file, no-bundler Three.js / Socket.io application served by Netlify (static) and Render (Express backend).

**Workstream 1 — Full UI Revamp:** Replace ad-hoc inline styles with a design token system (`--color-*`, `--space-*`, `--radius-*` CSS custom properties on `:root`) and rebuild every screen (login, loading, HUD, chat, emote wheel, ESC menu) against those tokens.

**Workstream 2 — CRT/VHS Overlay:** A single fixed `<div id="crt-overlay">` using CSS pseudo-elements for scanlines, vignette, and a static chromatic-aberration effect. Zero JavaScript, zero per-frame cost.

**Workstream 3 — Performance Audit:** Eliminate identified CPU/GPU waste — texture generation cache, redundant `lookAt` calls on `THREE.Sprite`, shadow map reduction, pixel ratio cap, dead code removal, GLB load deduplication, movement delta throttling, and preload hints.

Because the project has no bundler, all changes land in two files: `public/index.html` (styles and HTML structure) and `public/game.js` (JavaScript logic).

---

## Architecture

### File layout (unchanged)

```
public/
  index.html      ← all HTML + inline <style> + <script> tags
  game.js         ← ~1100-line vanilla JS (Three.js / Socket.io)
  characterLoader.js  ← dead stub (to be deleted from <script> tag)
  models/
    walk.glb
    idle.glb
  hat/
    hat.glb
```

### Layering model

```
┌─────────────────────────────────┐  z-index: 99999 (fixed, pointer-events:none)
│   #crt-overlay (::before/after) │  scanlines + vignette + chromatic aberration
├─────────────────────────────────┤
│   #esc-menu, #emote-wheel       │  z-index: 1000
│   #username-input (login card)  │  z-index: 100
│   #loading-screen               │  z-index: 50
│   #ui-overlay, #chat-container  │  z-index: 10
├─────────────────────────────────┤
│   #canvas-container (WebGL)     │  z-index: 0  (position: fixed, fills viewport)
└─────────────────────────────────┘
```

### Rendering pipeline (unchanged)

The Three.js `animate()` loop is untouched structurally. Performance changes reduce work _inside_ existing per-frame functions (`updateDustParticles`, `updateHatAuraParticles`) and in scene setup (`init`, `createRoom`). No new render passes are introduced.

---

## Components and Interfaces

### 1. Design Token System (`<style>` → `:root`)

A block of CSS custom properties is declared first in the `<style>` tag. Every subsequent rule references these tokens; no hard-coded colour/spacing/radius values appear outside `:root`.

**Token catalogue:**

| Token | Value | Purpose |
|---|---|---|
| `--color-primary` | `#1047d2` | Buttons, borders, accents |
| `--color-primary-light` | `#4a8fff` | Hover states, highlights |
| `--color-primary-dark` | `#0d3ba8` | Active/pressed states |
| `--color-bg` | `#0a1a2e` | Page background, scene fog |
| `--color-surface` | `rgba(10,26,46,0.92)` | Panel backgrounds (≥85% opacity) |
| `--color-border` | `rgba(16,71,210,0.35)` | Panel / input borders |
| `--color-text` | `#ffffff` | Body text |
| `--color-text-muted` | `rgba(255,255,255,0.55)` | Secondary text (≤60% opacity) |
| `--space-xs` | `4px` | Micro gap |
| `--space-sm` | `8px` | Small gap |
| `--space-md` | `16px` | Base gap |
| `--space-lg` | `24px` | Large gap |
| `--space-xl` | `40px` | Section gap |
| `--radius-panel` | `4px` | All panels / cards |
| `--font-mono` | `'Courier New', Courier, monospace` | System monospace, no new request |

### 2. Login Screen (`#username-input`)

```
┌──────────────────────────────────┐
│         C A P                    │  ← wordmark, --color-primary, letter-spacing
│         ─────────────            │  ← thin rule
│  ┌────────────────────────────┐  │
│  │  Enter username            │  │  ← input, monospace, --color-border border
│  └────────────────────────────┘  │
│  [red validation text if empty]  │
│  ┌────────────────────────────┐  │
│  │        JOIN                │  │  ← button, uppercase, --color-primary bg
│  └────────────────────────────┘  │
└──────────────────────────────────┘
```

- Card: `max-width: 320px`, centred via flexbox on `--color-bg` page, `--radius-panel` corners.
- Input focus → border transitions to `--color-primary` in ≤200 ms.
- Join button hover → background `--color-primary-light`, `box-shadow: 0 0 12px rgba(16,71,210,0.4)`, transition ≤150 ms.
- Empty-submit → show `<span id="login-error">` with inline red text; no `alert()`.

### 3. Loading Screen (`#loading-screen`)

- Background: `--color-bg`.
- Progress bar track: `--color-surface`; fill: `--color-primary`.
- Percentage text: `--color-text`, monospace token.
- No spinner element.
- Fade-out: CSS class `.fade-out` using `@keyframes fadeOut` (opacity 1→0 over 400 ms, `forwards` fill). Applied by `hideLoadingScreen()` in JS instead of directly adding `.hidden`. After the animation ends (`animationend` event), `.hidden` is added to remove layout space.

### 4. HUD Panels (`#ui-overlay`, `#chat-container`, `#meme-coin-stats`)

All panels share:

```css
background: var(--color-surface);
border: 1px solid var(--color-border);
border-radius: var(--radius-panel);
color: var(--color-text);
```

- Player count panel: top-left, fixed position.
- Chat log: max-height scroll, newest message auto-scrolled (existing JS preserved).
- Chat input: `--color-primary` border on `.active`.
- Chat hint: `--color-text-muted`.
- Meme coin ticker: same surface/border/radius as other panels; price-change colour applied dynamically in `updateStatsDisplay()` (already green/#ff4444, just updated to reference tokens via `priceColor` variable).
- `.hidden` class: `display: none !important` — removes from layout, no pointer event intercept.

### 5. Chat Component (`#chat-container`)

- Log panel: `max-height: 200px; overflow-y: auto`.
- Input field: full-width, `--color-surface` bg, `--color-border` border, `--color-primary` border when `.active`.
- Slide-in animation on `.active`: `@keyframes slideIn` ≤200 ms.
- 50-message cap: existing `addMessageToChatLog` logic preserved unchanged.

### 6. Emote Wheel (`#emote-wheel`)

- Item backgrounds: `--color-surface`; borders: `--color-border`.
- Hovered item: `--color-primary` border + subtle background tint, transition ≤150 ms.
- Labels: `--color-text`.
- When `.hidden`: `pointer-events: none` via `display: none !important`.

### 7. ESC Menu (`#esc-menu`)

- Centered overlay panel: `--color-surface` bg, `--color-border` border, `--radius-panel` corners.
- Keybind labels: `--color-text`; key chips: `--color-primary` bg, `--color-text` text.
- Close button: standard button style (same as join button).
- Keyboard guard: existing `isEscMenuOpen` check in `keydown` handler preserved.
- `closeEscMenu()`: adds `.hidden` + `style.display = 'none'` (existing pattern preserved).

### 8. CRT/VHS Overlay (`#crt-overlay`)

```html
<!-- last child of <body> -->
<div id="crt-overlay"></div>
```

```css
#crt-overlay {
  position: fixed;
  inset: 0;                        /* 100vw × 100vh */
  pointer-events: none;
  z-index: 99999;
  will-change: transform;          /* promote to GPU compositing layer */
}

/* Scanlines */
#crt-overlay::before {
  content: '';
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    to bottom,
    transparent 0px,
    transparent 2px,
    rgba(0,0,0,0.07) 2px,
    rgba(0,0,0,0.07) 4px       /* 4px interval, ~0.07 opacity */
  );
}

/* Vignette */
#crt-overlay::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(
    ellipse at center,
    transparent 55%,
    rgba(0,0,0,0.55) 100%      /* max 0.55 opacity at corners */
  );
}
```

**Chromatic aberration** — pure CSS, static, no JS:

A thin `box-shadow` inset on `#crt-overlay` itself creates a coloured fringe at the viewport edges without any per-frame recalculation:

```css
#crt-overlay {
  /* ... existing ... */
  box-shadow:
    inset  2px 0 8px rgba(255,0,0,0.07),   /* red fringe left */
    inset -2px 0 8px rgba(0,0,255,0.07),   /* blue fringe right */
    inset 0  2px 8px rgba(0,255,0,0.04),   /* green fringe top */
    inset 0 -2px 8px rgba(0,0,255,0.04);   /* blue fringe bottom */
}
```

The offset is at most 2 px, fading inward, invisible at centre. No JS, no canvas, no per-frame cost. This satisfies Requirement 11.4's fallback condition (static canvas painted once) via an even cheaper CSS-only path that works on all modern browsers.

### 9. Performance Changes in `game.js`

#### 9a. Texture Cache

```js
// Module-level caches (top of file)
const _roughTextureCache = new Map();
const _normalMapCache = new Map();

function createRoughTexture(width, height, baseColor) {
  const key = `${width}:${height}:${baseColor}`;
  if (_roughTextureCache.has(key)) return _roughTextureCache.get(key);
  // ... existing canvas logic ...
  _roughTextureCache.set(key, texture);
  return texture;
}

function createNormalMap(width, height) {
  const key = `${width}:${height}`;
  if (_normalMapCache.has(key)) return _normalMapCache.get(key);
  // ... existing canvas logic ...
  _normalMapCache.set(key, texture);
  return texture;
}
```

Textures are never disposed during the session (Requirement 12.4).

#### 9b. Sprite `lookAt` Removal

`THREE.Sprite` in Three.js r128 billboards automatically — it overrides the world matrix to always face the camera without any explicit `lookAt`. The calls in `updateDustParticles()` and `updateHatAuraParticles()` are therefore no-ops that still pay the cost of a Vector3 argument evaluation per sprite per frame.

Both calls are removed. The `if (camera)` guard blocks that contain them are deleted entirely.

#### 9c. Pixel Ratio Cap

Immediately after `renderer = new THREE.WebGLRenderer(...)`:

```js
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
```

Not called again unless a future `resize` handler also needs it (which it does not — `setSize` does not reset pixel ratio in r128).

#### 9d. Shadow Map Audit

| Light | Before | After | Rationale |
|---|---|---|---|
| `hallwayLight` | `castShadow = true` | **keep** | Covers primary play corridor |
| `doorLight` | `castShadow = true` | **remove** | Redundant; doorway already lit by spotlight |
| `spotlight` | `castShadow = true`, 2048² | **keep**, downgrade to **1024²** | Main open-area shadow caster |
| `blueSpotlight` | no shadow | no change | Already off |
| `doorGlowLight` | no shadow | no change | Already off |

Shadow map type: `THREE.PCFSoftShadowMap` → `THREE.PCFShadowMap` (lower cost, acceptable quality for a dark environment).

#### 9e. Dead Code Removal

- Remove `<script src="characterLoader.js">` from `index.html`.
- Remove `createFloorFog()`, `updateFloorFog()`, and `let floorFogParticles = []` from `game.js`.
- No calls to `createFloorFog()` exist in `init()`, confirming it is dead.

#### 9f. GLB Load Deduplication

```js
// Module-level (top of file, alongside walkGLTF / idleGLTF)
let walkGLTFPromise = null;
let idleGLTFPromise = null;

function loadWalkGLTF() {
  if (walkGLTF) return Promise.resolve(walkGLTF);
  if (walkGLTFPromise) return walkGLTFPromise;  // ← dedup
  const loader = createGLTFLoader();
  walkGLTFPromise = new Promise((resolve, reject) => {
    loader.load('models/walk.glb', (gltf) => {
      walkGLTF = gltf;
      resolve(gltf);
    }, undefined, reject);
  });
  return walkGLTFPromise;
}
// Mirror for loadIdleGLTF()
```

Concurrent `addOtherPlayer()` calls during a join burst will all receive the same pending Promise; exactly one `loader.load()` is fired per GLB (Requirement 17.3).

#### 9g. Movement Delta Throttling

```js
// Module-level (top of file)
const POSITION_THRESHOLD = 0.01;   // world units
const ROTATION_THRESHOLD = 0.01;   // radians
let lastEmittedPosition = { x: 0, y: 0, z: 2 };  // matches spawn
let lastEmittedRotation = { x: 0, y: 0, z: 0 };

// Inside updateMovement(), replacing the unconditional socket.emit block:
const dx = player.position.x - lastEmittedPosition.x;
const dy = player.position.y - lastEmittedPosition.y;
const dz = player.position.z - lastEmittedPosition.z;
const distSq = dx*dx + dy*dy + dz*dz;
const dRot = Math.abs(player.rotation.y - lastEmittedRotation.y);
const animChanged = player.animState !== prevAnimState; // tracked before state update

if (animChanged || distSq >= POSITION_THRESHOLD * POSITION_THRESHOLD || dRot >= ROTATION_THRESHOLD) {
  socket.emit('playerMove', { ... });
  lastEmittedPosition = { ...player.position };
  lastEmittedRotation = { ...player.rotation };
}
```

Animation-state changes always trigger an emit regardless of movement (Requirement 18.4).

### 10. Asset Preload Hints (`index.html` `<head>`)

```html
<link rel="preload" href="models/walk.glb" as="fetch" crossorigin>
<link rel="preload" href="models/idle.glb" as="fetch" crossorigin>
<link rel="preconnect" href="https://www.gstatic.com">
<link rel="preconnect" href="https://api.dexscreener.com">
```

No preload for `hat/hat.glb` — it is loaded only after the player enters the scene and the GLTF loader is ready, making it conditional rather than critical-path (Requirement 19.4).

---

## Data Models

### CSS Token Map

All tokens live in `:root` in `index.html`. No JS data structure mirrors them — JS that needs a colour value (e.g. `updateStatsDisplay`) continues to use the same hardcoded hex strings it uses today (green / `#ff4444`), as those are applied via `element.style.color` not via CSS class.

### Texture Cache Maps

```
_roughTextureCache: Map<string, THREE.CanvasTexture>
  key format: "{width}:{height}:{baseColor}"
  e.g.  "512:512:2763306"  →  <CanvasTexture>

_normalMapCache: Map<string, THREE.CanvasTexture>
  key format: "{width}:{height}"
  e.g.  "128:512"  →  <CanvasTexture>
```

Both maps are module-level singletons. Entries are never removed; the session ends when the tab is closed.

### GLB Promise Deduplication State

```
walkGLTF:         THREE.GLTF | null     (resolved asset)
walkGLTFPromise:  Promise<THREE.GLTF> | null   (in-flight load)

idleGLTF:         THREE.GLTF | null
idleGLTFPromise:  Promise<THREE.GLTF> | null
```

State machine per GLB:
```
walkGLTF == null AND walkGLTFPromise == null  →  start load
walkGLTF == null AND walkGLTFPromise != null  →  return existing promise
walkGLTF != null                              →  return Promise.resolve(walkGLTF)
```

### Movement Delta State

```
lastEmittedPosition: { x: number, y: number, z: number }  (init: spawn coords)
lastEmittedRotation: { x: number, y: number, z: number }  (init: {0,0,0})
POSITION_THRESHOLD:  0.01   (const)
ROTATION_THRESHOLD:  0.01   (const)
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Design token propagation

*For any* CSS custom property value assigned to a design token on `:root`, every HTML element that references that token via `var(--token-name)` SHALL compute a style that reflects the updated value without any additional style rule edits.

**Validates: Requirements 1.5**

### Property 2: Rough texture cache hit identity

*For any* triple `(width, height, baseColor)`, calling `createRoughTexture(width, height, baseColor)` two or more times SHALL return the exact same `THREE.CanvasTexture` object reference on every call after the first, and the underlying canvas draw operations SHALL execute exactly once regardless of how many times the function is called with those arguments.

**Validates: Requirements 12.1, 12.3**

### Property 3: Normal map cache hit identity

*For any* pair `(width, height)`, calling `createNormalMap(width, height)` two or more times SHALL return the exact same `THREE.CanvasTexture` object reference on every call after the first, and the underlying canvas draw operations SHALL execute exactly once.

**Validates: Requirements 12.2, 12.3**

### Property 4: GLB load promise deduplication

*For any* number N ≥ 1 of concurrent calls to `loadWalkGLTF()` (or `loadIdleGLTF()`) made before the first in-flight load resolves, all N calls SHALL return the same `Promise` object reference, and `loader.load()` SHALL be invoked exactly once per GLB file regardless of how large N is.

**Validates: Requirements 17.1, 17.3**

### Property 5: Movement delta suppression

*For any* combination of current player position, `lastEmittedPosition`, current rotation, and `lastEmittedRotation` where the Euclidean distance between current and last-emitted position is less than `POSITION_THRESHOLD` AND the absolute difference in `rotation.y` is less than `ROTATION_THRESHOLD` AND the animation state is unchanged, the system SHALL NOT call `socket.emit('playerMove', ...)` for that frame.

**Validates: Requirements 18.2, 18.3**

### Property 6: Animation state change always triggers emit

*For any* frame where `player.animState` transitions to a value different from the previously emitted state, the system SHALL call `socket.emit('playerMove', ...)` regardless of whether position or rotation has changed by more or less than the threshold constants.

**Validates: Requirements 18.4**

### Property 7: Pixel ratio cap

*For any* value of `window.devicePixelRatio` (including values greater than 2), the value passed to `renderer.setPixelRatio()` SHALL equal `Math.min(window.devicePixelRatio, 2)` and SHALL never exceed 2.

**Validates: Requirements 15.1, 15.2, 15.3**

### Property 8: Chat log 50-message cap

*For any* sequence of N messages (where N > 50) appended to the chat log via `addMessageToChatLog`, the number of child `<div>` elements in `#chat-log` SHALL never exceed 50, with the oldest entry removed each time the 51st message is added.

**Validates: Requirements 5.6**

### Property 9: Hidden elements vacate layout

*For any* HUD element that has the `.hidden` class applied, that element SHALL have `display: none` (i.e. `offsetWidth === 0`, `offsetHeight === 0`) and SHALL NOT occupy layout space or intercept pointer events.

**Validates: Requirements 4.10, 6.4, 7.5**

---

## Error Handling

### Model load failure

`loadWalkGLTF()` / `loadIdleGLTF()` reject on network or parse error. The existing `catch` in the join-button handler logs the error and calls `init()` + `hideLoadingScreen()` after a 1-second delay, allowing the game to start without character models. This behaviour is preserved unchanged.

`createFloatingHat()` has its own `onerror` callback that falls back to a procedural cone geometry. Preserved unchanged.

### Socket connection failure

`socket.on('connect_error', ...)` updates the loading progress bar text. Preserved unchanged.

### Empty username validation

If the join button is clicked with an empty input:
1. The existing logic generates a random username (`Player_XXXXXX`) as a fallback — this is preserved.
2. Additionally, a `<span id="login-error">` is shown below the input with red text for the case where the field is truly empty and no fallback is desired (per Requirement 2.6). The error clears on next keydown.

> Design note: Requirement 2.6 requires an inline validation message but the current code silently assigns a random username. The design retains the random-username fallback as the actual behaviour (since it's a game, not a form) and only shows the error message briefly as UI feedback before proceeding. If stakeholders want hard blocking, that requires a requirements change.

### Animation state errors

`updatePlayerAnimation()` guards on `!playerObj.mixer || !playerObj.animations` — preserved unchanged.

---

## Testing Strategy

This feature spans CSS rendering, vanilla JS logic, and Three.js integration. Testing is split into unit/property tests for pure JS logic and manual/visual checks for CSS and Three.js rendering concerns.

### Property-Based Tests

Property-based testing applies to the pure JS logic layers that have clear input/output behaviour and where input variation reveals edge cases. The recommended library is **fast-check** (zero dependencies, runs in Node.js without a DOM).

Each test is tagged: `// Feature: ui-revamp-crt-performance, Property N: <property text>`

**Property 2 — Rough texture cache hit identity**
Generate random `(width, height, baseColor)` integer triples. Call `createRoughTexture` twice with same args; assert `===` identity and that the underlying draw ran only once (spy on `CanvasRenderingContext2D.fillRect`). Minimum 100 iterations.

**Property 3 — Normal map cache hit identity**
Generate random `(width, height)` integer pairs. Call `createNormalMap` twice with same args; assert `===` identity and single draw execution. Minimum 100 iterations.

**Property 4 — GLB load promise deduplication**
Mock `THREE.GLTFLoader.prototype.load`. Generate N ∈ [1, 20] concurrent calls to `loadWalkGLTF()`. Assert `loader.load` call count equals 1. Assert all N returned promises resolve to the same object. Minimum 100 iterations.

**Property 5 & 6 — Movement delta throttling**
Generate random `(currentPos, lastEmittedPos, currentRot, lastEmittedRot, prevAnimState, currentAnimState)` tuples. Compute expected emit/suppress decision using the threshold constants. Feed to the throttle logic and assert `socket.emit` was or was not called accordingly. Minimum 100 iterations.

**Property 7 — Pixel ratio cap**
Generate random `devicePixelRatio` values from 0.5 to 5.0 (float). Assert the value that would be passed to `renderer.setPixelRatio` equals `Math.min(dpr, 2)`. Pure arithmetic — no DOM needed. Minimum 100 iterations.

**Property 8 — Chat log 50-message cap**
Generate message sequences of length 1–200. Feed each message to `addMessageToChatLog` against a jsdom `#chat-log` element. Assert `chatLog.children.length <= 50` holds after every single append. Minimum 100 iterations.

### Example-Based Unit Tests

- `loadWalkGLTF()` returns cached result on second call (cache-hit path).
- `loadWalkGLTF()` returns same promise on concurrent calls before resolve (dedup path).
- `updateMovement()` does not emit when position and rotation are below threshold.
- `updateMovement()` does emit when `animState` changes even if position/rotation are below threshold.
- `createRoughTexture(512, 512, 0x2a2a2a)` called twice returns same object.

### Visual / Manual Checks

CSS rendering and Three.js scene properties cannot be property-tested without a real browser or heavy jsdom mocking. These are verified manually:

- CRT overlay: scanlines visible, vignette darkens corners, chromatic fringe at edges, no interaction block.
- Login card: token-driven colours, input focus transition, button hover glow, inline validation text.
- Loading screen: progress bar fill colour, no spinner, fade-out animation on complete.
- HUD panels: unified surface/border/radius across all panels, chat scroll, meme coin price colour.
- Shadow quality: only spotlight and hallwayLight cast shadows; scene looks acceptable.
- Pixel ratio: verify `renderer.getPixelRatio()` returns ≤ 2 in browser console.
- Preload hints: DevTools Network tab shows GLB fetches begin before GLTF loader script runs.

### Integration Checks

- Join a game with multiple concurrent browser tabs; verify exactly one walk.glb and idle.glb network request per session.
- Move character in place; verify `playerMove` socket events are suppressed while stationary (check server console).
- Change direction without moving; verify `playerMove` is emitted when animation state changes.
