# Aeron — Airspace observation trainer

A React + Three.js prototype for the recognition and after-action-review portion of SIH26247. It is laid out as an operations console: mission setup on the left, the sensor view in the centre, and a situation panel (simulated radar, observation, classification and recognition cues) on the right. The fictional district takes visual cues from Delhi; it is not a geographic reconstruction.

## Try an exercise

1. Choose **Skyline watch**, **Passing contact**, or **Mixed recognition**.
2. Choose guided/challenge difficulty and daylight/dusk. Shuffle the variation for different reproducible motion and encounters.
3. Select an overview, rooftop, or street-level camera. Drag to orbit and scroll to zoom. The heading tape and radar show where to look.
4. Press **Start exercise**. The objects enter after a short delay. Click an aircraft, click its radar track, or use **Mark observation**.
5. The EO/IR sensor feed slews to the selected track. Confirm the type in the daylight (EO) or white-hot thermal (IR) view, then choose a category.
6. End early, or let the 45-second clock finish automatically. The debrief explains the score, preserves the event timeline, and lets you replay, repeat, export or print the session.
7. **Progress** summarises every stored session: score trend, identification matrix, per-category and per-condition results, practice milestones, and a CSV export for instructors.

Keyboard shortcuts outside form controls: **Space** starts/holds/resumes, **O** records an observation, **1 / 2 / 3** classify, **T** cycles radar tracks (and slews the sensor), **I** toggles EO/IR, **F** toggles fullscreen, **M** mutes rotor audio, and **?** opens the operator guide. Changing browser tabs pauses an active exercise. A welcome guide opens on the first visit.

## Included

- A textured 3D district with an India Gate-inspired arch, storefronts, rooftop equipment, balconies, trees, mixed road traffic, and an elevated metro.
- Shared deterministic scenario logic for the 3D objects, radar, sensor feed and replay. Radar contacts and the clock hold when paused. The observer indicator reflects camera heading.
- Real-size contact models: an enterprise-class quadcopter (about 1.04 m tip to tip, skid gear, gimbal camera, two-blade propellers with motion-blur discs, red/green/white navigation lights and an anti-collision strobe) and a black kite (about 1.55 m wingspan, fingered primaries, forked tail), a common large bird over Delhi.
- Attitude derived from the shared trajectory: multirotors tilt into acceleration and drag and roll into turns; kites bank more steeply, twist the tail, and alternate bursts of slow wingbeats with glides. No new randomness is introduced.
- An EO/IR sensor feed that auto-tracks a radar-cued contact from a 3 m mast at the radar observer, with three fields of view, distance haze, a tracking gate and azimuth/elevation/range/FOV readouts. The IR palette renders motors and battery as hot spots on drones and the whole body as warm on birds.
- Track identity on the radar follows the operator's assessment (unknown yellow, suspect UAS red, bird neutral green), never the scenario's ground truth.
- A recognition-cue guide, expanded in guided mode and collapsed in challenge mode.
- Synthesised rotor audio heard from the radar observer: loudness falls with slant range, pitch rises with speed and acceleration, and it is silent whenever the exercise or replay clock is stopped. Kites are silent.
- A progress dashboard with illustrative practice milestones, an optional trainee name and unit for reports, CSV export of the record, and print-ready debrief and progress pages.
- An installable progressive web app: production builds register a service worker so the 3D district works offline after the first visit (Earth imagery still needs a connection).
- Guided and challenge modes vary appearance timing, altitude, movement speed, and haze.
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

- `src/simulation.ts`: seeded scenarios, positions, scoring, and recommendations.
- `src/kinematics.ts`: velocity, heading, attitude, wingbeat and strobe timing derived from the shared trajectory.
- `src/contactGeometry.ts`: real-size drone and kite builders shared by the scene, the sensor feed and the Earth-view GLBs.
- `src/storage.ts`: versioned, validated browser-local history.
- `src/App.tsx`: console layout, the live simulation clock, controls, and session lifecycle.
- `src/DelhiScene.tsx`: district geometry, vehicles, and camera motion; `src/ContactModel.tsx` places contacts in it.
- `src/SceneView.tsx`: renderer selection, HUD, heading tape, sensor panel, graphics options, and fullscreen.
- `src/SensorFeed.tsx`: the EO/IR camera.
- `src/Radar.tsx`: shared-position radar visualization.
- `src/RecognitionGuide.tsx`: recognition cues.
- `src/Review.tsx`: score explanation, deterministic replay, history, export and print.
- `src/analytics.ts` / `src/Progress.tsx`: training-record statistics, CSV export and the progress dashboard.
- `src/acoustics.ts`: rotor loudness/pitch model and the Web Audio renderer.
- `src/HelpDialog.tsx`: first-visit guide and keyboard reference.
- `public/sw.js`, `public/manifest.webmanifest`: offline caching and install metadata.

The 3D renderer loads separately from the application interface. Shadows and resolution are capped in balanced mode.

## Prototype boundaries

Scenario movement, contact attitude, the sensor feed and the scoring rubric are illustrative. The EO/IR view is a rendered approximation, not a sensor model: it has no optics, detector noise or radiometric temperature model, and its background is sky only. The prototype does not implement operational engagement training, validated drone physics, real sensor data, or a learned AI model. Recommendations use explicit rules. The training scene is generated locally. Earth view streams geographic data and requires internet access; fonts fall back to system fonts when offline. Browser-local results belong to this device/browser and are not synchronized to a server.

## Earth view

The 3D district is the default environment; **Satellite** switches to Earth view. Earth view uses CesiumJS, centered near India Gate in New Delhi. Without a key it streams Esri World Imagery onto the Earth ellipsoid: this is satellite photography, **not reconstructed 3D buildings or elevation terrain**. The source label makes this distinction explicit. The local training scene remains available from the environment switch.

For actual Google photorealistic 3D buildings, copy `.env.example` to `.env.local` and configure either `VITE_GOOGLE_MAPS_API_KEY` (Map Tiles API enabled, billing configured) or `VITE_CESIUM_ION_TOKEN` with Google Photorealistic 3D Tiles access. Restart the server. Browser credentials are visible to users: use allowed HTTP referrers and API restrictions, and never use a server secret. Credentials are excluded from Git. Coverage and detail depend on the provider; Delhi coverage has not been verified with an authenticated account.

Official setup: https://developers.google.com/maps/documentation/tile/get-api-key
Cesium integration: https://cesium.com/learn/cesiumjs-learn/cesiumjs-photorealistic-3d-tiles

The Cesium assets are copied locally by predev/prebuild. Attribution remains visible. Google tiles use a bounded streaming cache, with satellite fallback for failed authentication. There is no geocoding/search integration. Training contacts remain synthetic and follow the same recorded scenario and radar coordinates; each training unit maps to eight metres in Earth view. Guided mode sets a minimum contact size for visibility. Camera altitude presets are illustrative; photorealistic mode assumes a Delhi ground datum near 215 m, not a surveyed collision or ground-height solution.

`src/EarthScene.tsx` owns the geographic viewer and tears down its WebGL resources and callbacks on unmount. It creates one contact entity per generated contact, orients each from the shared kinematics, and articulates kite wings through glTF node transformations. `node --import tsx scripts/create-contact-models.mjs` regenerates the GLB contact models from `src/contactGeometry.ts`; `scripts/prepare-cesium.mjs` prepares runtime assets.

## Radar and variation library

The radar is a cockpit-inspired synthetic situation display, with adjustable range (30/60/120 training units), north-up or camera-heading-up orientation, contact trails, track identifiers, and bearing/range/relative-altitude/speed readouts. Units scale to Earth mode metres. Click a return to inspect its track; during a live exercise this also records an observation. The sweep, trails and readouts follow the exercise clock and freeze on pause. Returns outside the chosen range are counted rather than drawn at a false position.

Visual reference: the range rings, heading references, ownship indicator and multifunction-display framing of [Falcon BMS's F-16 situation display](https://cdn.falcon-bms.com/docs/4.38/TO%201F-16CMAM-34-1-1%20BMS.pdf). The app uses an illustrative PPI layout with synthetic ground-relative returns; it does not reproduce an operational fighter radar or sensor physics.

The setup now exposes 200 numbered, deterministic variations in a selector and shows their full seed values. Shuffle visits all 200 without repetition within a cycle. Version-two scenarios add orbit, crossing, figure-eight, weave and approach paths, direction, formation spacing, speed, altitude and phase variation. Version-one saved sessions retain their original paths when replayed or repeated. The session schema/storage key remain compatible; scenario generation is separately versioned.

Verification includes all 200 seeded routes within the default scope, heading projection, readout scaling, shuffle cycles, legacy saves and trajectory validation. Browser checks exercised 100 distinct shuffles, radar controls, contact inspection/observation, pause freeze, and mobile layout.
