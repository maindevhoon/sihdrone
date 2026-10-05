# Trinetra (त्रिनेत्र) — Airspace observation trainer

Trinetra was previously named Aeron. Browser storage keys keep the `aeron-` prefix so existing results and settings carry over.

A React + Three.js prototype for the recognition and after-action-review portion of SIH26247. It is laid out as an operations console: mission setup on the left, the sensor view in the centre, and a situation panel (simulated radar, observation, classification and recognition cues) on the right. The fictional district takes visual cues from Delhi; it is not a geographic reconstruction.

## Try an exercise

1. Choose **Skyline watch**, **Passing contact**, or **Mixed recognition**.
2. Choose guided/challenge difficulty and daylight/dusk. Shuffle the variation for different reproducible motion and encounters.
3. Select an overview, rooftop, or street-level camera. Drag to orbit and scroll to zoom. The heading tape and radar show where to look.
4. Press **Start exercise**. The objects enter after a short delay. Click an aircraft, click its radar track, or use **Mark observation**.
5. The EO/IR sensor feed slews to the selected track. Confirm the type in the daylight (EO) or white-hot thermal (IR) view, then choose a category.
6. End early, or let the 45-second clock finish automatically. The debrief explains the score, preserves the event timeline, and lets you replay, repeat, export or print the session.
7. **Progress** summarises every stored session: score trend, identification matrix, per-category and per-condition results, practice milestones, and a CSV export for instructors.

The **EN / हिं** switch in the top bar changes the interface language between English and Hindi (remembered per browser). The training flow — mission setup, procedure, situation panel, classification, recognition cues, operator guide, and debrief/progress headings — is translated; sensor HUD abbreviations stay in English as on real displays, and generated debrief sentences are currently English. `src/i18n.ts` holds the dictionary, keyed by the English text so missing entries fall back safely.

Keyboard shortcuts outside form controls: **Space** starts/holds/resumes, **O** records an observation, **1 / 2 / 3** classify, **T** cycles radar tracks (and slews the sensor), **I** toggles the EO/IR feed, **H** toggles the thermal scene view, **F** toggles fullscreen, **M** mutes rotor audio, and **?** opens the operator guide. Changing browser tabs pauses an active exercise. A welcome guide opens on the first visit.

## Included

- A textured 3D district with an India Gate-inspired arch, storefronts, rooftop equipment, balconies, trees, mixed road traffic, and an elevated metro.
- Shared deterministic scenario logic for the 3D objects, radar, sensor feed and replay. Contact motion and the clock hold when paused. The observer indicator reflects camera heading; satellite map panning moves the shared radar/sensor observer.
- Four reference airframes built to manufacturers' published dimensions, checked by tests against the generated geometry: DJI Mavic 3 (347.5 × 283 × 107.7 mm, 380.1 mm diagonal, 895 g), DJI Phantom 4 Pro V2.0 (350 mm diagonal, 1375 g), DJI Matrice 350 RTK (810 × 670 × 430 mm, 895 mm wheelbase, 6.47 kg) and DJI Mini 4 Pro (298 × 373 × 101 mm with propellers, under 249 g). Each has propellers with motion-blur discs, navigation lights and an anti-collision strobe. The airframe is chosen deterministically from the variation seed (groups fly one type); the debrief shows its published figures.
- A black kite (about 150 cm wingspan, 50–60 cm long), a common large bird over Delhi, with fingered primaries and a forked tail.
- A thermal (long-wave IR) mode for the 3D district with white-hot, black-hot and ironbow palettes: clear sky and vegetation read cold, sun-loaded asphalt and dark surfaces warm, lamps, engines and drone motors hot. It is a rendered approximation, not a radiometric model, and is unavailable over satellite photography.
- Attitude derived from the shared trajectory: multirotors tilt into acceleration and drag and roll into turns; kites bank more steeply, twist the tail, and alternate bursts of slow wingbeats with glides. No new randomness is introduced.
- An EO/IR sensor feed that auto-tracks a radar-cued contact from a 3 m mast at the radar observer, with three fields of view, distance haze, a tracking gate and azimuth/elevation/range/span/FOV readouts. The IR palette renders motors and battery as hot spots on drones and the whole body as warm on birds.
- Track identity on the radar follows the operator's assessment (unknown yellow, suspect UAS red, bird neutral green), never the scenario's ground truth.
- A recognition-cue guide, expanded in guided mode and collapsed in challenge mode.
- Synthesised rotor audio heard from the radar observer: loudness falls with slant range and scales with airframe size, pitch follows propeller size and rises with speed and acceleration, and it is silent whenever the exercise or replay clock is stopped. Kites are silent.
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
- `src/airframes.ts`: reference airframe specifications and the seed-based airframe choice.
- `src/contactGeometry.ts`: drone and kite builders (built to `airframes.ts`) shared by the scene, the sensor feed and the Earth-view GLBs.
- `src/storage.ts`: versioned, validated browser-local history.
- `src/App.tsx`: console layout, the live simulation clock, controls, and session lifecycle.
- `src/DelhiScene.tsx`: district geometry, vehicles, and camera motion; `src/ContactModel.tsx` places contacts in it.
- `src/SceneView.tsx`: renderer selection, HUD, heading tape, sensor panel, graphics options, and fullscreen.
- `src/earthNavigation.ts`: satellite gestures, camera bounds, and input cleanup; `src/earthNavigationMath.ts` contains input/zoom/orbit math, and `src/earthNavigationTerrain.ts` handles surface-ray zoom and clearance along the camera path.
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

## Theatres and Earth view

The **Theatre** selector (mission setup or sensor HUD) chooses where the exercise is viewed. The trajectories, radar and scoring are identical in every theatre; only the scene changes. The choice is remembered per browser and is not stored in sessions.

| Theatre | Location | Terrain |
| --- | --- | --- |
| 3D training district | Synthetic city block (local, offline, supports thermal) | Urban |
| India Gate | 28.6126° N, 77.2268° E, New Delhi | Dense urban |
| Tololing | 34.4709° N, 75.7952° E, Drass sector, Kargil | High-altitude ridgeline |
| Galwan Valley | 34.7492° N, 78.1656° E, Galwan–Shyok confluence | High-altitude valley |
| Chamba hills | 32.6855° N, 76.1662° E, Himachal Pradesh | Forested Himalayan ridges |
| Nathu La | 27.3868° N, 88.8310° E, Sikkim | High mountain pass |
| Tawang | 27.5883° N, 91.8653° E, Arunachal Pradesh | Mountain town and valley |
| Longewala | 27.5249° N, 70.1567° E, Thar Desert | Open desert |
| Attari | 31.6046° N, 74.5731° E, Attari–Wagah crossing | Border plains |

On a Mac, geographic theatres default to **Trackpad** input: **one-finger click-drag pans**, **two-finger scroll rotates horizontally or tilts vertically**, and **pinch zooms** around the pointer. Holding **Shift + two-finger scroll** is an alternate way to pan. Moving a finger without holding the click only moves the pointer. Safari also supports pinch and two-finger twist gestures. **Mouse** input restores wheel zoom; dragging pans, and right-drag or Shift-drag orbits. Use the map buttons for zoom, north, top-down, return to the selected site, and gesture help. An illustrated gesture tutorial opens the first time you enter a geographic theatre in a tab; reopen it with the **?** button. Opening the guide pauses a live exercise or replay; resume when you are ready. The local district keeps its existing controls.

Geographic theatres use CesiumJS. Without credentials they stream Esri World Imagery draped on **Esri World Elevation 3D terrain**, so mountains, valleys and ridgelines render in relief with sun shading. With `VITE_GOOGLE_MAPS_API_KEY` (Map Tiles API enabled) or `VITE_CESIUM_ION_TOKEN`, they use **Google Photorealistic 3D Tiles**, the Google Earth-style mesh; coverage and detail depend on Google. Copy `.env.example` to `.env.local` (and add the same variable in Vercel) to enable it. Browser credentials are visible to users: restrict them by HTTP referrer and API.

For each theatre the app samples the rendered surface on rings 150 m and 320 m around the site and sets the airspace datum to the highest point, so contacts fly over ridges rather than through them; the HUD shows the datum. Camera presets are framed per terrain (Overview / Ridgeline / Ground in mountains) and are raised automatically if they would end inside a slope. This is an illustrative placement, not a validated terrain-collision or line-of-sight model.

Pinch, wheel and button zoom follow the rendered hillside under the pointer (or the view centre), independently of the exercise airspace datum. Zoom preserves the viewing direction and stops before entering loaded terrain, with a 35 m ground-clearance limit. Terrain detail can change as tiles load.

The app draws its own site marker and does not overlay third-party boundary or place-name layers, whose depiction of borders may not match official Indian maps. Provider attribution stays visible. Thermal view is offered only in the training district, because satellite photography carries no heat information. Training contacts remain synthetic and follow the same recorded scenario and radar coordinates; each training unit maps to eight metres in Earth view. Guided mode sets a minimum on-screen contact size.

`src/theatres.ts` lists the theatres and camera framing; `src/EarthScene.tsx` owns the geographic viewer and tears down its WebGL resources and callbacks on unmount. `node --import tsx scripts/create-contact-models.mjs` regenerates the GLB contact models from `src/contactGeometry.ts`; `scripts/prepare-cesium.mjs` prepares runtime assets.

## Radar and variation library

The radar is a cockpit-inspired synthetic situation display, with adjustable range (30/60/120 training units), north-up or camera-heading-up orientation, contact trails, track identifiers, and bearing/range/relative-altitude/speed readouts. Units scale to Earth mode metres. Click a return or a numbered track button to inspect it and cue EO/IR; during a live exercise this also records an observation. Scope clicks choose the nearest return, and the track buttons let you select individual contacts in a tightly spaced group. Returns outside the chosen range are counted rather than drawn at a false position; their track buttons remain available and are marked OUT.

Before starting, unscored preview playback animates the scene, radar and cued sensor from one looping clock. Use **Pause sample / Play sample** on the radar to hold or resume it. Starting an exercise resets its clock to zero; preview inspection never records an observation, classification or result. Exercise and replay sweeps, trails and readouts follow their respective clocks and freeze on hold. Hidden tabs do not advance the preview.

Earth mode shows **MAP FOLLOW**: panning translates the radar observer with the map's reticle on the exercise airspace plane. Returns, trails, bearing/range readouts, scope picking, EO/IR and rotor range all use that shared observer. Camera height is a viewing control; radar altitude stays relative to the airspace datum. Navigating while held or replaying changes this viewpoint without advancing contact motion or changing the saved result. Home and camera presets return to the theatre framing. The local district retains its **SITE FIXED** observer at `[0, 0, 12]`.

Visual reference: the range rings, heading references, ownship indicator and multifunction-display framing of [Falcon BMS's F-16 situation display](https://cdn.falcon-bms.com/docs/4.38/TO%201F-16CMAM-34-1-1%20BMS.pdf). The app uses an illustrative PPI layout with synthetic ground-relative returns; it does not reproduce an operational fighter radar or sensor physics.

The setup now exposes 200 numbered, deterministic variations in a selector and shows their full seed values. Shuffle visits all 200 without repetition within a cycle. Version-two scenarios add orbit, crossing, figure-eight, weave and approach paths, direction, formation spacing, speed, altitude and phase variation. Version-one saved sessions retain their original paths when replayed or repeated. The session schema/storage key remain compatible; scenario generation is separately versioned.

Verification includes all 200 seeded routes within the default scope, heading projection, readout scaling, shuffle cycles, legacy saves and trajectory validation. Browser checks exercised 100 distinct shuffles, radar controls, contact inspection/observation, pause freeze, and mobile layout.
