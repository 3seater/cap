# Requirements Document

## Introduction

This spec covers three tightly related workstreams for the Cap multiplayer site:

1. **Full UI Revamp** — replace the current ad-hoc styling with a unified dark, editorial design language built around the existing blue system (`#1047d2` / `#4a8fff` / `#0d3ba8`). Every screen — login, loading, HUD, chat, emote wheel, and ESC menu — must look and feel like part of the same product.
2. **CRT / VHS Overlay** — a global, CSS-only retro film effect (scanlines, chromatic aberration, vignette) layered on top of the full page, including both the Three.js canvas and all UI elements, with near-zero performance cost.
3. **Performance Audit & Fixes** — eliminate identified per-frame CPU waste, dead code, redundant asset loading, and missing platform hints across the no-bundler Three.js / Socket.io stack.

The site runs on Three.js r128 (CDN), Socket.io 4.6.1 (CDN), Express + Node.js on Render (backend), and Netlify (static frontend). No bundler is in use; all scripts are plain `<script>` tags.

---

## Glossary

- **UI_System**: The full collection of HTML/CSS/JS elements that make up the login screen, loading screen, and all in-game HUD panels.
- **CRT_Overlay**: The global CSS/HTML element that renders the retro film effect (scanlines, chromatic aberration, vignette) over the entire page viewport.
- **HUD**: The set of in-game on-screen panels — player count, chat log, chat input, meme coin stats ticker, emote wheel, ESC menu.
- **Design_Token**: A CSS custom property (e.g., `--color-primary: #1047d2`) that encodes a single design decision reused across all UI components.
- **Texture_Cache**: The module-level variables (`walkGLTF`, `idleGLTF`) or equivalent in-memory store that prevents redundant asset fetches.
- **Particle_System**: The dust particles (`dustParticles` array, 200 sprites) and hat aura particles (50 sprites inside `floatingHat` group) updated every animation frame.
- **Delta_Threshold**: A minimum positional or rotational change (in world units or radians) below which the client suppresses a `playerMove` socket emit.
- **Renderer**: The `THREE.WebGLRenderer` instance created in `init()`.
- **Shadow_Caster**: Any `THREE.Light` with `castShadow = true` that forces a shadow-map render pass.
- **Dead_Code**: Files or functions that are loaded or declared but never called at runtime.
- **Preload_Hint**: An HTML `<link rel="preload">` tag that instructs the browser to fetch an asset before it is first requested by script.

---

## Requirements

### Requirement 1: Design Token Foundation

**User Story:** As a developer, I want a single source of truth for every colour, spacing, and typography value, so that changing the palette or scale requires edits in one place only.

#### Acceptance Criteria

1. THE UI_System SHALL declare all colour, spacing, border-radius, and font-family values as CSS custom properties on `:root` before any component styles are applied.
2. THE UI_System SHALL expose at minimum the following colour tokens: `--color-primary` (`#1047d2`), `--color-primary-light` (`#4a8fff`), `--color-primary-dark` (`#0d3ba8`), `--color-bg` (`#0a1a2e`), `--color-surface` (a dark panel background with ≥ 85% opacity), `--color-border` (a 1 px border colour derived from `--color-primary` at reduced opacity), `--color-text` (`#ffffff`), `--color-text-muted` (white at ≤ 60% opacity).
3. THE UI_System SHALL expose at minimum the following spacing tokens: `--space-xs`, `--space-sm`, `--space-md`, `--space-lg`, `--space-xl` at a consistent 4 px base scale.
4. THE UI_System SHALL expose at minimum one border-radius token `--radius-panel` used on every panel and card.
5. WHEN a Design_Token value is changed in `:root`, THE UI_System SHALL reflect that change across every component that references the token without requiring any other style edit.
6. THE UI_System SHALL use a single monospace or geometric sans-serif typeface loaded from the existing CDN stack or system fonts — no additional font network requests are permitted.

---

### Requirement 2: Login Screen Redesign

**User Story:** As a first-time visitor, I want the login screen to feel premium and intentional, so that I immediately understand this is a polished product rather than a prototype.

#### Acceptance Criteria

1. THE UI_System SHALL render the login screen as a full-viewport layout with `--color-bg` as the page background.
2. THE UI_System SHALL display a centered login card that uses `--color-surface` for its background, `--color-border` for its border, and `--radius-panel` for its corners.
3. THE UI_System SHALL render the username input field with `--color-surface` background, `--color-border` default border, and a `--color-primary` highlighted border on `:focus`.
4. WHEN the username input field is focused, THE UI_System SHALL transition the border colour from `--color-border` to `--color-primary` using a CSS transition of ≤ 200 ms.
5. THE UI_System SHALL render the join button with `--color-primary` background, `--color-text` label, and a hover state that transitions to `--color-primary-light` within ≤ 150 ms.
6. WHEN the username input field is empty and the join button is activated, THE UI_System SHALL display an inline validation message inside the card without navigating away or showing a browser-native alert.
7. THE UI_System SHALL include a visual mark or wordmark above the input card that matches the `--color-primary` / `--color-primary-light` palette.
8. THE UI_System SHALL NOT display any spinner, loading indicator, or progress bar on the login card itself — those belong exclusively to the loading screen.

---

### Requirement 3: Loading Screen Consistency

**User Story:** As a player, I want the loading screen to feel visually continuous with the login screen and in-game HUD, so that the whole experience reads as one product.

#### Acceptance Criteria

1. THE UI_System SHALL render the loading screen background using `--color-bg`.
2. THE UI_System SHALL render the progress bar fill using `--color-primary` and the track using `--color-surface`.
3. THE UI_System SHALL render percentage text in `--color-text` using the same typeface token as the rest of the UI.
4. THE UI_System SHALL NOT display a spinner element on the loading screen.
5. WHEN loading is complete, THE UI_System SHALL transition the loading screen out using a CSS opacity fade of ≤ 400 ms before removing it from the layout.

---

### Requirement 4: In-Game HUD Visual Unification

**User Story:** As a player, I want every on-screen panel to share the same visual language, so that the interface feels coherent rather than assembled from unrelated parts.

#### Acceptance Criteria

1. THE UI_System SHALL render every HUD panel (player count, chat log, meme coin ticker, emote wheel, ESC menu) using `--color-surface` as its background.
2. THE UI_System SHALL render every HUD panel border using `--color-border`.
3. THE UI_System SHALL render every HUD panel using `--radius-panel` for corner rounding.
4. THE UI_System SHALL render all HUD body text in `--color-text`.
5. THE UI_System SHALL render all HUD muted or secondary text in `--color-text-muted`.
6. THE UI_System SHALL render chat usernames in `#00ff00` (green) to preserve the existing design intent.
7. THE UI_System SHALL render all interactive HUD buttons using the same button style defined in Requirement 2, Criterion 5.
8. THE UI_System SHALL render the meme coin price-change value in green when the 24-hour change is ≥ 0 and in `#ff4444` when it is negative.
9. THE UI_System SHALL render the meme coin ticker panel using the same surface, border, and radius tokens as all other HUD panels.
10. WHEN a HUD panel is hidden via the `.hidden` class, THE UI_System SHALL ensure the element is not visible and does not occupy layout space.

---

### Requirement 5: Chat Component Styling

**User Story:** As a player, I want the chat input and log to look like part of the game's UI rather than a plain HTML form, so that switching between chat and gameplay feels seamless.

#### Acceptance Criteria

1. THE UI_System SHALL render the chat log panel with a maximum height, internal vertical scroll, and `--color-surface` background.
2. THE UI_System SHALL render the chat input field with `--color-surface` background, `--color-border` border, and a `--color-primary` highlighted border when active.
3. WHEN the chat input container gains the `.active` class, THE UI_System SHALL transition it into view using a CSS animation of ≤ 200 ms.
4. THE UI_System SHALL render the chat hint label ("Press T to chat") in `--color-text-muted`.
5. WHEN a new chat message is appended to the log, THE UI_System SHALL scroll the log to the bottom so the newest message is visible.
6. THE UI_System SHALL limit the chat log to 50 messages, removing the oldest when the limit is exceeded (this behaviour already exists in `addMessageToChatLog` and SHALL be preserved).

---

### Requirement 6: Emote Wheel Styling

**User Story:** As a player, I want the emote wheel to match the overall UI design, so that it doesn't visually clash with the rest of the HUD.

#### Acceptance Criteria

1. THE UI_System SHALL render the emote wheel overlay using `--color-surface` for item backgrounds and `--color-border` for item borders.
2. WHEN an emote item is hovered, THE UI_System SHALL apply a `--color-primary` border and a subtle background tint as a hover state, transitioning within ≤ 150 ms.
3. THE UI_System SHALL render emote labels in `--color-text`.
4. WHEN the emote wheel is hidden via the `.hidden` class, THE UI_System SHALL ensure the overlay does not intercept mouse events.

---

### Requirement 7: ESC Menu Styling

**User Story:** As a player, I want the ESC menu to look like a first-class UI panel, so that it feels intentional rather than like a debug overlay.

#### Acceptance Criteria

1. THE UI_System SHALL render the ESC menu as a centered overlay panel using `--color-surface` background, `--color-border` border, and `--radius-panel` corners.
2. THE UI_System SHALL render all keybind labels in `--color-text` and keybind key chips in `--color-primary` background with `--color-text` text.
3. THE UI_System SHALL render the close / resume button using the standard button style from Requirement 2, Criterion 5.
4. WHEN the ESC menu is opened, THE UI_System SHALL NOT capture keyboard events intended for movement (the existing `isEscMenuOpen` guard SHALL be preserved).
5. WHEN the ESC menu is closed via `closeEscMenu()`, THE UI_System SHALL ensure the element is fully hidden and does not intercept mouse or pointer events.

---

### Requirement 8: CRT/VHS Overlay — Structure

**User Story:** As a designer, I want a subtle retro film effect applied globally to the entire page, so that the aesthetic reads as intentional without hurting performance.

#### Acceptance Criteria

1. THE CRT_Overlay SHALL be implemented as a single fixed-position HTML element covering the full viewport (100vw × 100vh) with `pointer-events: none` so it never blocks interaction.
2. THE CRT_Overlay SHALL be positioned above all other page content using a `z-index` value high enough to sit above the Three.js canvas, all HUD panels, and the login/loading screens simultaneously.
3. THE CRT_Overlay SHALL be inserted into the DOM before the closing `</body>` tag so it renders on top without affecting document flow.
4. THE CRT_Overlay SHALL remain visible during the login screen, loading screen, and the in-game view — it is never hidden.
5. THE CRT_Overlay SHALL NOT use WebGL, `THREE.EffectComposer`, or any Three.js shader pass.

---

### Requirement 9: CRT/VHS Overlay — Scanlines

**User Story:** As a designer, I want faint horizontal scanlines across the full viewport, so that the retro CRT aesthetic is present without obscuring the 3D scene or UI.

#### Acceptance Criteria

1. THE CRT_Overlay SHALL render horizontal scanlines using a CSS `repeating-linear-gradient` or equivalent CSS-only technique — no per-frame JavaScript is permitted for the base scanline rendering.
2. THE CRT_Overlay SHALL space scanlines at 3–4 px intervals (one dark line per 3–4 px of vertical space).
3. THE CRT_Overlay scanline opacity SHALL be between 0.04 and 0.10 so the underlying content remains clearly legible.
4. THE CRT_Overlay scanline layer SHALL be GPU-composited (achieved by setting `will-change: transform` or equivalent on the overlay element) so it does not trigger CPU layout or paint recalculation on scroll or resize.

---

### Requirement 10: CRT/VHS Overlay — Vignette

**User Story:** As a designer, I want darkened corners on the full viewport, so that the viewer's eye is drawn toward the centre of the screen.

#### Acceptance Criteria

1. THE CRT_Overlay SHALL render a radial vignette using a CSS `radial-gradient` — no per-frame JavaScript or canvas drawing is permitted for the vignette.
2. THE CRT_Overlay vignette SHALL darken the viewport corners to a maximum opacity of 0.55 (rgba black) so the 3D scene remains visible at the edges.
3. THE CRT_Overlay vignette SHALL use an elliptical gradient centred on the viewport with a transparent centre so the primary game content is unaffected.

---

### Requirement 11: CRT/VHS Overlay — Chromatic Aberration

**User Story:** As a designer, I want a subtle RGB channel offset at the screen edges, so that the VHS feel is complete without being distracting during gameplay.

#### Acceptance Criteria

1. THE CRT_Overlay SHALL implement chromatic aberration using CSS `mix-blend-mode` layering or a CSS `filter` approach that does not require per-frame JavaScript recalculation.
2. THE CRT_Overlay chromatic aberration SHALL be visible only near the viewport edges (within approximately 5–10% of the edge) and SHALL be imperceptible at the centre of the screen.
3. THE CRT_Overlay chromatic aberration offset SHALL not exceed 2 px in any direction so it does not cause readability issues on HUD text.
4. WHERE a pure CSS-only approach for chromatic aberration is not feasible on the target browsers, THE CRT_Overlay SHALL fall back to a single static `<canvas>` element painted once at load time (not on every animation frame).

---

### Requirement 12: Texture Generation Caching

**User Story:** As a developer, I want procedural textures generated only once per session, so that the startup cost of `createRoughTexture()` and `createNormalMap()` is not paid on every page load or player join.

#### Acceptance Criteria

1. THE UI_System SHALL cache the result of `createRoughTexture()` in a module-level `Map` keyed by `(width, height, baseColor)` so that an identical call returns the cached `THREE.CanvasTexture` without re-executing canvas operations.
2. THE UI_System SHALL cache the result of `createNormalMap()` in a module-level `Map` keyed by `(width, height)` so that an identical call returns the cached texture.
3. WHEN `createRoom()` is called, THE UI_System SHALL not generate more unique texture instances than the number of distinct `(width, height, baseColor)` combinations actually required by the room geometry.
4. THE UI_System SHALL dispose of no cached textures during the session lifetime — they are created once and reused.

---

### Requirement 13: Particle Billboard Optimisation

**User Story:** As a developer, I want the per-frame `lookAt(camera)` calls on all sprites to be eliminated or minimised, so that the main animation loop spends less CPU time on billboard maths.

#### Acceptance Criteria

1. THE UI_System SHALL replace per-frame `sprite.lookAt(camera.position)` calls in `updateDustParticles()` and `updateHatAuraParticles()` with a technique that achieves equivalent visual result at lower CPU cost.
2. WHERE `THREE.Sprite` already auto-faces the camera by default in Three.js r128, THE UI_System SHALL remove the explicit `lookAt` call entirely and rely on the built-in behaviour.
3. THE UI_System SHALL verify (via code review or console profiling annotation) that `updateDustParticles()` and `updateHatAuraParticles()` together consume no manual `lookAt` CPU cycles after this change.
4. WHEN the particle count for dust particles is set to 200, THE UI_System SHALL ensure each particle update loop body performs at most a constant number of arithmetic operations per particle with no per-frame matrix inversion or full rotation decomposition.

---

### Requirement 14: Shadow Map Audit

**User Story:** As a developer, I want only the lights that meaningfully contribute to scene shadows to cast shadow maps, so that GPU shadow-pass cost is minimised.

#### Acceptance Criteria

1. THE UI_System SHALL audit all lights in `init()` and `createRoom()` that have `castShadow = true` and disable shadow casting on any light whose shadow map does not visibly affect the primary play area at runtime.
2. THE UI_System SHALL retain shadow casting on no more than 2 lights by default, selecting the lights with the widest visual coverage of the play area.
3. WHEN `renderer.shadowMap.type` is set, THE UI_System SHALL use `THREE.PCFShadowMap` in place of `THREE.PCFSoftShadowMap` unless a visible quality difference is required — `PCFShadowMap` is lower cost.
4. THE UI_System SHALL set shadow map resolution to 1024×1024 on retained shadow-casting lights, reducing from the current 2048×2048 on the spotlight, unless a visible quality regression is identified.

---

### Requirement 15: Pixel Ratio Cap

**User Story:** As a developer, I want the renderer pixel ratio capped at 2, so that high-DPI displays do not incur a 3× or 4× render cost without meaningful visual gain.

#### Acceptance Criteria

1. THE UI_System SHALL call `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))` immediately after the Renderer is constructed in `init()`.
2. WHEN `window.devicePixelRatio` is 1 (standard display), THE UI_System SHALL use pixel ratio 1.
3. WHEN `window.devicePixelRatio` is 2 or greater (retina / HiDPI display), THE UI_System SHALL use pixel ratio 2, never higher.
4. THE UI_System SHALL NOT call `renderer.setPixelRatio` more than once per session unless the window is moved to a display with a different device pixel ratio, in which case the same cap of 2 applies.

---

### Requirement 16: Dead Code Removal

**User Story:** As a developer, I want dead code and unused files removed from the project, so that the script load budget is not wasted and the codebase is easier to reason about.

#### Acceptance Criteria

1. THE UI_System SHALL remove the `<script>` tag that loads `characterLoader.js` from `index.html`, as the file contains only stub example code that is never called by `game.js`.
2. THE UI_System SHALL either remove the `createFloorFog()` function and `floorFogParticles` array from `game.js`, or call `createFloorFog()` in `init()` if the fog effect is intentionally desired.
3. IF `createFloorFog()` is removed, THE UI_System SHALL also remove `updateFloorFog()` and the `floorFogParticles` array declaration.
4. THE UI_System SHALL not introduce any new unreferenced functions or variables as part of this feature work.

---

### Requirement 17: GLB Model Load Deduplication

**User Story:** As a developer, I want model loading promises to be deduplicated so that concurrent `addOtherPlayer()` calls during a burst of joins do not create redundant in-flight fetch operations.

#### Acceptance Criteria

1. THE UI_System SHALL store a single in-flight `Promise` for each GLB asset (`walk.glb`, `idle.glb`) so that concurrent calls to `loadWalkGLTF()` or `loadIdleGLTF()` before the first load completes return the same pending `Promise` rather than initiating duplicate network requests.
2. WHEN a GLB asset has already been fetched and cached (`walkGLTF !== null`), THE UI_System SHALL return `Promise.resolve(walkGLTF)` immediately, preserving the existing cache-hit behaviour.
3. WHEN multiple players join within the same event loop tick, THE UI_System SHALL result in exactly one `loader.load()` call per GLB file regardless of how many `addOtherPlayer()` calls are made concurrently.

---

### Requirement 18: Server-Side Movement Delta Throttling

**User Story:** As a developer, I want the server to receive position updates only when the player has moved meaningfully, so that the Socket.io broadcast volume is reduced for stationary or near-stationary players.

#### Acceptance Criteria

1. THE UI_System SHALL define a `POSITION_THRESHOLD` constant of 0.01 world units and a `ROTATION_THRESHOLD` constant of 0.01 radians in `game.js`.
2. WHEN `updateMovement()` prepares to emit `playerMove`, THE UI_System SHALL compare the current position and rotation against the last-emitted values.
3. IF the Euclidean distance between the current position and last-emitted position is less than `POSITION_THRESHOLD` AND the absolute difference in `rotation.y` is less than `ROTATION_THRESHOLD`, THEN THE UI_System SHALL suppress the `socket.emit('playerMove', ...)` call for that frame.
4. THE UI_System SHALL always emit `playerMove` when `animState` changes, regardless of whether position or rotation has changed, so that animation transitions are synchronised to other clients.
5. THE UI_System SHALL store the last-emitted position and rotation in module-level variables initialised to the player spawn position at `init()` time.

---

### Requirement 19: Asset Preload Hints

**User Story:** As a developer, I want the browser to begin fetching critical assets as early as possible, so that the loading screen duration is reduced for first-time visitors.

#### Acceptance Criteria

1. THE UI_System SHALL include `<link rel="preload" as="fetch" crossorigin>` tags in the `<head>` of `index.html` for `models/walk.glb` and `models/idle.glb`.
2. THE UI_System SHALL include a `<link rel="preconnect" href="https://www.gstatic.com">` tag in the `<head>` of `index.html` so that the TLS handshake to the DRACO decoder CDN is initiated before the loader script executes.
3. THE UI_System SHALL include a `<link rel="preconnect" href="https://api.dexscreener.com">` tag in the `<head>` of `index.html` so that the meme coin stats API connection is warmed up before the first `fetchMemeCoinStats()` call.
4. THE UI_System SHALL NOT introduce `<link rel="preload">` tags for assets that are conditionally loaded or user-dependent, as the browser would fetch them unnecessarily.
