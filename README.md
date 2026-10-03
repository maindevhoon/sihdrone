# Aeron — Delhi observation lab

A React + Three.js prototype for the recognition and after-action-review portion of SIH26247. It runs locally in a desktop browser with keyboard and mouse. The fictional district takes visual cues from Delhi; it is not a geographic reconstruction.

## Try an exercise

1. Choose **Skyline watch**, **Passing contact**, or **Mixed recognition**.
2. Choose guided/challenge difficulty and daylight/dusk. Shuffle the variation for different reproducible motion and encounters.
3. Select an overview, rooftop, or street-level camera. Drag to orbit and scroll to zoom.
4. Press **Begin session**. The objects enter after a short delay. Click an aerial object or use **Mark observation**, then choose a category.
5. Finish early, or let the 45-second clock finish automatically. The review explains the score, preserves the event timeline, and lets you replay or repeat the exact variation.

Keyboard shortcuts outside form controls: **Space** pauses/resumes, **O** records an observation, and **1 / 2 / 3** classify. Changing browser tabs pauses an active exercise.

## Included

- A textured 3D district with an India Gate-inspired arch, storefronts, rooftop equipment, balconies, trees, mixed road traffic, and an elevated metro.
- Shared deterministic scenario logic for the 3D objects, north-up mini-radar, and replay. Radar contacts and the clock hold when paused. The observer indicator reflects camera heading.
- Single drones, drone groups, and animated birds. Guided and challenge modes vary appearance timing, altitude, movement speed, and haze.
- Smooth camera transitions, fullscreen, and balanced/high graphics settings.
- A score breakdown based on classification and observation time after object arrival. Classification earns credit only after a valid observation.
- Up to 20 browser-local results, a chart of recorded scores, JSON result export, and recommendations from explicit rules.
- Timeline replay with seeking and markers for recorded decisions. Replay never writes to the original result.

## Run and verify

```sh
npm install
npm run dev -- --port 5173
```

Open the URL printed by Vite. The app can be built with `npm run build`. Run meaningful simulation and persistence checks with `npm test`.

The automated checks cover seeded reproduction, contact arrival, scoring edge cases, radar bounds, stored result integrity, history retention, and storage failures. Browser checks cover the full exercise, pause, automatic completion, replay seeking, camera controls, reload persistence, and narrow layouts.

## Implementation

- `src/simulation.ts`: seeded scenarios, positions, radar projection, scoring, and recommendations.
- `src/storage.ts`: versioned, validated browser-local history.
- `src/App.tsx`: setup, the live simulation clock, controls, and session lifecycle.
- `src/DelhiScene.tsx`: district geometry, vehicles, aerial objects, and camera motion.
- `src/SceneView.tsx`: rendering, heading, graphics options, fullscreen, and scene overlays.
- `src/Radar.tsx`: shared-position radar visualization.
- `src/Review.tsx`: score explanation, deterministic replay, history, and export.

The 3D renderer loads separately from the application interface. Shadows and resolution are capped in balanced mode.

## Prototype boundaries

Scenario movement and the scoring rubric are illustrative. The prototype does not implement operational engagement training, validated drone physics, real sensor data, or a learned AI model. Recommendations use explicit rules. The training scene is generated locally. Earth view streams geographic data and requires internet access; fonts fall back to system fonts when offline. Browser-local results belong to this device/browser and are not synchronized to a server.

## Earth view

Earth view uses CesiumJS, centered near India Gate in New Delhi. Without a key it streams Esri World Imagery onto the Earth ellipsoid: this is satellite photography, **not reconstructed 3D buildings or elevation terrain**. The source label makes this distinction explicit. The local training scene remains available from the environment switch.

For actual Google photorealistic 3D buildings, copy `.env.example` to `.env.local` and configure either `VITE_GOOGLE_MAPS_API_KEY` (Map Tiles API enabled, billing configured) or `VITE_CESIUM_ION_TOKEN` with Google Photorealistic 3D Tiles access. Restart the server. Browser credentials are visible to users: use allowed HTTP referrers and API restrictions, and never use a server secret. Credentials are excluded from Git. Coverage and detail depend on the provider; Delhi coverage has not been verified with an authenticated account.

Official setup: https://developers.google.com/maps/documentation/tile/get-api-key
Cesium integration: https://cesium.com/learn/cesiumjs-learn/cesiumjs-photorealistic-3d-tiles

The Cesium assets are copied locally by predev/prebuild. Attribution remains visible. Google tiles use a bounded streaming cache, with satellite fallback for failed authentication. There is no geocoding/search integration. Training contacts remain synthetic and follow the same recorded scenario and radar coordinates; each training unit maps to eight metres in Earth view. Guided mode sets a minimum contact size for visibility. Camera altitude presets are illustrative; photorealistic mode assumes a Delhi ground datum near 215 m, not a surveyed collision or ground-height solution.

`src/EarthScene.tsx` owns the geographic viewer and tears down its WebGL resources and callbacks on unmount. `scripts/create-contact-models.mjs` generates the original local GLB contact models; `scripts/prepare-cesium.mjs` prepares runtime assets.

## Radar and variation library

The radar is a cockpit-inspired synthetic situation display, with adjustable range (30/60/120 training units), north-up or camera-heading-up orientation, contact trails, track identifiers, and bearing/range/relative-altitude/speed readouts. Units scale to Earth mode metres. Click a return to inspect its track; during a live exercise this also records an observation. The sweep, trails and readouts follow the exercise clock and freeze on pause. Returns outside the chosen range are counted rather than drawn at a false position.

Visual reference: the range rings, heading references, ownship indicator and multifunction-display framing of [Falcon BMS's F-16 situation display](https://cdn.falcon-bms.com/docs/4.38/TO%201F-16CMAM-34-1-1%20BMS.pdf). The app uses an illustrative PPI layout with synthetic ground-relative returns; it does not reproduce an operational fighter radar or sensor physics.

The setup now exposes 200 numbered, deterministic variations in a selector and shows their full seed values. Shuffle visits all 200 without repetition within a cycle. Version-two scenarios add orbit, crossing, figure-eight, weave and approach paths, direction, formation spacing, speed, altitude and phase variation. Version-one saved sessions retain their original paths when replayed or repeated. The session schema/storage key remain compatible; scenario generation is separately versioned.

Verification includes all 200 seeded routes within the default scope, heading projection, readout scaling, shuffle cycles, legacy saves and trajectory validation. Browser checks exercised 100 distinct shuffles, radar controls, contact inspection/observation, pause freeze, and mobile layout.
