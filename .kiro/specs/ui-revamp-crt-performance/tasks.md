# Implementation Plan: UI Revamp, CRT/VHS Overlay & Performance Audit

## Overview

Two files receive all changes: `public/index.html` (HTML structure + all inline CSS) and `public/game.js` (all JavaScript logic). Tasks are ordered so that each step compiles against a stable foundation — design tokens and dead-code removal first, then UI screens, then the CRT overlay, then performance patches, then tests.

## Tasks

- [ ] 1. Foundation — design tokens, preload hints, dead code removal
  - [ ] 1.1 Add CSS custom properties (`--color-*`, `--space-*`, `--radius-*`, `--font-mono`) to `:root` at the top of the `<style>` block in `index.html`
    - Declare every token listed in Design §1 Token catalogue
    - No component rule may use a hard-coded colour, spacing, or radius value after this step
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6_

  - [ ] 1.2 Add `<link rel="preload">` and `<link rel="preconnect">` tags to `<head>` in `index.html`
    - Preload `models/walk.glb` and `models/idle.glb` with `as="fetch" crossorigin`
    - Preconnect to `https://www.gstatic.com` and `https://api.dexscreener.com`
    - Do NOT add a preload for `hat/hat.glb`
    - _Requirements: 19.1, 19.2, 19.3, 19.4_

  - [ ] 1.3 Remove dead code from `index.html` and `game.js`
    - Delete `<script src="characterLoader.js">` from `index.html`
    - Delete `createFloorFog()`, `updateFloorFog()`, and `let floorFogParticles = []` from `game.js`
    - _Requirements: 16.1, 16.2, 16.3_

- [ ] 2. UI Revamp — all screens and HUD panels
  - [ ] 2.1 Rebuild the login screen HTML and CSS in `index.html`
    - Full-viewport `--color-bg` background via flexbox
    - Centered card using `--color-surface`, `--color-border`, `--radius-panel`
    - Wordmark / title element above card in `--color-primary`
    - Username `<input>` with `--color-surface` bg, `--color-border` default border, `--color-primary` border on `:focus` via CSS transition ≤ 200 ms
    - Join `<button>` with `--color-primary` bg, `--color-text` label, hover → `--color-primary-light` + `box-shadow` glow within ≤ 150 ms
    - `<span id="login-error">` element below input for inline validation (hidden by default)
    - No spinner or progress bar on this card
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.7, 2.8_

  - [ ] 2.2 Wire inline validation logic for empty username in `game.js`
    - On join-button click: if input is empty, show `#login-error` with red text and clear it on next `keydown`
    - Preserve the existing random-username fallback behaviour — it still fires after showing the message
    - _Requirements: 2.6_

  - [ ] 2.3 Rebuild the loading screen CSS in `index.html`
    - Background `--color-bg`, progress bar fill `--color-primary`, track `--color-surface`
    - Percentage text in `--color-text` using `--font-mono`
    - Remove any spinner element
    - Add `.fade-out` keyframe (opacity 1 → 0 over 400 ms, `forwards` fill)
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ] 2.4 Update `hideLoadingScreen()` in `game.js` to use the CSS fade-out animation
    - Apply `.fade-out` class instead of directly adding `.hidden`
    - Add an `animationend` listener that then adds `.hidden`
    - _Requirements: 3.5_

  - [ ] 2.5 Unify HUD panel CSS (player count, meme coin ticker) in `index.html`
    - All panels: `background: var(--color-surface)`, `border: 1px solid var(--color-border)`, `border-radius: var(--radius-panel)`, `color: var(--color-text)`
    - Secondary / muted text uses `--color-text-muted`
    - Meme coin ticker panel uses the same surface/border/radius tokens
    - `.hidden` rule: `display: none !important`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.9, 4.10_

  - [ ] 2.6 Update chat component CSS in `index.html`
    - Log panel: `max-height: 200px; overflow-y: auto`, `--color-surface` bg
    - Chat usernames rendered in `#00ff00` (preserve existing design intent)
    - Input field: `--color-surface` bg, `--color-border` border, `--color-primary` border on `.active`
    - Slide-in `@keyframes slideIn` for `.active` state, duration ≤ 200 ms
    - Chat hint label: `--color-text-muted`
    - _Requirements: 4.6, 5.1, 5.2, 5.3, 5.4_

  - [ ] 2.7 Update emote wheel CSS in `index.html`
    - Item bg: `--color-surface`; border: `--color-border`
    - Hovered item: `--color-primary` border + background tint, transition ≤ 150 ms
    - Labels: `--color-text`
    - When `.hidden`: `display: none !important` (pointer-events: none)
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ] 2.8 Update ESC menu CSS in `index.html`
    - Centered overlay panel: `--color-surface` bg, `--color-border` border, `--radius-panel` corners
    - Keybind labels in `--color-text`; key chip elements with `--color-primary` bg and `--color-text` text
    - Close/resume button uses the same button style as the join button (Requirement 2 criterion 5)
    - Preserve `isEscMenuOpen` keyboard guard in `game.js` — no JS change needed
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 3. Checkpoint — visual pass
  - Review all screens match the token system; confirm no hard-coded hex colours remain outside `:root`. Ask the user if any adjustments are needed before proceeding.

- [ ] 4. CRT/VHS Overlay
  - [ ] 4.1 Add `<div id="crt-overlay"></div>` as last child of `<body>` in `index.html`
    - Insert before closing `</body>` tag
    - _Requirements: 8.3_

  - [ ] 4.2 Write `#crt-overlay` base CSS in `index.html`
    - `position: fixed; inset: 0; pointer-events: none; z-index: 99999; will-change: transform`
    - No WebGL, no Three.js shader, no JS
    - _Requirements: 8.1, 8.2, 8.4, 8.5, 9.4_

  - [ ] 4.3 Add scanline layer via `#crt-overlay::before` in `index.html`
    - `repeating-linear-gradient` with 4 px interval (2 px transparent, 2 px rgba black)
    - Scanline opacity 0.07 (within 0.04–0.10 range)
    - _Requirements: 9.1, 9.2, 9.3_

  - [ ] 4.4 Add vignette layer via `#crt-overlay::after` in `index.html`
    - `radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)`
    - _Requirements: 10.1, 10.2, 10.3_

  - [ ] 4.5 Add chromatic aberration via `box-shadow: inset` on `#crt-overlay` in `index.html`
    - Four inset shadows: red/blue/green fringes at viewport edges, max 2 px offset, opacity ≤ 0.07
    - Pure CSS, static, no JS
    - _Requirements: 11.1, 11.2, 11.3_

- [ ] 5. Performance fixes
  - [ ] 5.1 Add texture generation cache to `game.js`
    - Declare `const _roughTextureCache = new Map()` and `const _normalMapCache = new Map()` at module level
    - Update `createRoughTexture(width, height, baseColor)` to check/set cache keyed by `"${width}:${height}:${baseColor}"`
    - Update `createNormalMap(width, height)` to check/set cache keyed by `"${width}:${height}"`
    - Never dispose cached textures
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

  - [ ]* 5.2 Write property test for rough texture cache (Property 2)
    - **Property 2: Rough texture cache hit identity**
    - **Validates: Requirements 12.1, 12.3**
    - Use fast-check to generate random `(width, height, baseColor)` triples; assert `===` identity on repeated calls and that canvas draw ran exactly once

  - [ ]* 5.3 Write property test for normal map cache (Property 3)
    - **Property 3: Normal map cache hit identity**
    - **Validates: Requirements 12.2, 12.3**
    - Use fast-check to generate random `(width, height)` pairs; assert `===` identity and single draw execution

  - [ ] 5.4 Remove explicit `sprite.lookAt(camera.position)` calls from `game.js`
    - Delete the `if (camera) { sprite.lookAt(camera.position); }` block from `updateDustParticles()`
    - Delete the equivalent `if (camera) { child.lookAt(camera.position); }` block from `updateHatAuraParticles()`
    - Rely on `THREE.Sprite` built-in billboarding in r128
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

  - [ ] 5.5 Cap the renderer pixel ratio in `game.js`
    - Add `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))` immediately after `renderer = new THREE.WebGLRenderer(...)`
    - _Requirements: 15.1, 15.2, 15.3, 15.4_

  - [ ]* 5.6 Write property test for pixel ratio cap (Property 7)
    - **Property 7: Pixel ratio cap**
    - **Validates: Requirements 15.1, 15.2, 15.3**
    - Use fast-check to generate `devicePixelRatio` floats in [0.5, 5.0]; assert computed value equals `Math.min(dpr, 2)`

  - [ ] 5.7 Reduce shadow map cost in `game.js`
    - Change `renderer.shadowMap.type` from `THREE.PCFSoftShadowMap` to `THREE.PCFShadowMap`
    - Remove `castShadow = true` from `doorLight`
    - Downgrade spotlight shadow map resolution from 2048 to 1024 (`shadow.mapSize.width = 1024; shadow.mapSize.height = 1024`)
    - Retain shadow casting on `hallwayLight` and `spotlight` only
    - _Requirements: 14.1, 14.2, 14.3, 14.4_

  - [ ] 5.8 Add GLB load promise deduplication to `game.js`
    - Declare `let walkGLTFPromise = null` and `let idleGLTFPromise = null` at module level
    - Update `loadWalkGLTF()`: if promise is in-flight (`walkGLTFPromise !== null`), return it; otherwise store in `walkGLTFPromise` before returning
    - Mirror change for `loadIdleGLTF()`
    - _Requirements: 17.1, 17.2, 17.3_

  - [ ]* 5.9 Write property test for GLB load deduplication (Property 4)
    - **Property 4: GLB load promise deduplication**
    - **Validates: Requirements 17.1, 17.3**
    - Mock `THREE.GLTFLoader.prototype.load`; generate N ∈ [1, 20] concurrent calls; assert `loader.load` count equals 1 and all N promises resolve to the same object

  - [ ] 5.10 Implement movement delta throttling in `game.js`
    - Declare `const POSITION_THRESHOLD = 0.01`, `const ROTATION_THRESHOLD = 0.01`, `let lastEmittedPosition`, `let lastEmittedRotation` at module level (init to spawn coords)
    - Track `prevAnimState` before the state update inside `updateMovement()`
    - Replace unconditional `socket.emit('playerMove', ...)` with the threshold comparison: suppress when `distSq < POSITION_THRESHOLD² AND dRot < ROTATION_THRESHOLD AND !animChanged`
    - Always emit when `animState` changed regardless of position/rotation delta
    - Update `lastEmittedPosition` and `lastEmittedRotation` only when emit fires
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5_

  - [ ]* 5.11 Write property test for movement delta suppression (Property 5)
    - **Property 5: Movement delta suppression**
    - **Validates: Requirements 18.2, 18.3**
    - Use fast-check to generate position/rotation tuples below threshold with unchanged animState; assert `socket.emit` was NOT called

  - [ ]* 5.12 Write property test for animation state change always triggers emit (Property 6)
    - **Property 6: Animation state change always triggers emit**
    - **Validates: Requirements 18.4**
    - Use fast-check to generate tuples where animState changed; assert `socket.emit` WAS called regardless of position/rotation delta

- [ ] 6. Checkpoint — run tests and verify
  - Ensure all property-based tests pass. Run the test suite and verify no regressions. Ask the user if questions arise.

- [ ] 7. Integration wiring and final polish
  - [ ] 7.1 Verify `hideLoadingScreen()` fade-out wiring is correct end-to-end
    - Confirm `.fade-out` class is applied and `animationend` correctly transitions to `.hidden`
    - Confirm `#ui-overlay`, `#chat-container`, `#chat-hint`, and `#meme-coin-stats` unhide after animation completes
    - _Requirements: 3.5, 4.10_

  - [ ]* 7.2 Write property test for chat log 50-message cap (Property 8)
    - **Property 8: Chat log 50-message cap**
    - **Validates: Requirements 5.6**
    - Use fast-check to generate message sequences length 1–200; feed each to `addMessageToChatLog` against a jsdom `#chat-log`; assert `children.length <= 50` after every append

- [ ] 8. Final checkpoint — all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- All CSS changes land exclusively in `public/index.html`; all JS changes land exclusively in `public/game.js`
- Property tests use **fast-check** (zero dependencies, runs in Node without a DOM); jsdom is required only for the chat-log test (Property 8)
- Three.js `THREE.Sprite` in r128 auto-billboards — removing `lookAt` calls is safe with no visual regression
- The design token system (`--color-*`, etc.) is a CSS-only change; JS that sets `element.style.color` dynamically (e.g., `updateStatsDisplay`) keeps using hex literals as-is
- The `closeEscMenu()` function already adds both `.hidden` and `style.display = 'none'` — this pattern is preserved, not replaced
- Shadow map downgrade from PCFSoft → PCF is safe in a dark environment; if a visible regression is found during review, the type can be reverted independently without affecting other tasks

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.3"] },
    { "id": 1, "tasks": ["1.2", "2.1", "2.3", "2.5", "2.6", "2.7", "2.8"] },
    { "id": 2, "tasks": ["2.2", "2.4", "4.1"] },
    { "id": 3, "tasks": ["4.2", "4.3", "4.4", "4.5"] },
    { "id": 4, "tasks": ["5.1", "5.4", "5.5", "5.7", "5.8", "5.10"] },
    { "id": 5, "tasks": ["5.2", "5.3", "5.6", "5.9", "5.11", "5.12"] },
    { "id": 6, "tasks": ["7.1"] },
    { "id": 7, "tasks": ["7.2"] }
  ]
}
```
