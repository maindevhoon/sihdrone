# Trinetra (त्रिनेत्र) — Airspace observation trainer

Trinetra was previously named Aeron. Browser storage keys keep the `aeron-` prefix so existing results and settings carry over.

A React + Three.js prototype for the recognition and after-action-review portion of SIH26247. It is laid out as an operations console: mission setup on the left, the sensor view in the centre, and a situation panel (simulated radar, observation, classification and recognition cues) on the right. The fictional district takes visual cues from Delhi; it is not a geographic reconstruction.

## Try an exercise

1. Choose **Skyline watch**, **Passing contact**, or **Mixed recognition**. New mixed exercises contain birds and drones together.
2. Choose guided/challenge difficulty and daylight/dusk. Shuffle the variation for different reproducible motion and encounters.
3. Select an overview, rooftop, or street-level camera. Drag to orbit and scroll to zoom. The heading tape and radar show where to look.
4. Press **Start exercise**. The objects enter after a short delay. Click an aircraft, click its radar track, or use **Mark observation**.
5. The EO/IR sensor feed slews to the selected track. Confirm the type in the daylight (EO) or white-hot thermal (IR) view, then choose a category for that track. Repeat for every radar track; each member of a drone formation is classified as **Drone group**.
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
- New encounters use rigid-body flight described below. Historical encounters retain their trajectory-derived attitude and original wingbeat timing.
- An EO/IR sensor feed that auto-tracks a radar-cued contact from a 3 m mast at the radar observer, with three fields of view, distance haze, a tracking gate and azimuth/elevation/range/span/FOV readouts. The IR palette renders motors and battery as hot spots on drones and the whole body as warm on birds.
- Track identity on the radar follows the operator's assessment (unknown yellow, suspect UAS red, bird neutral green), never the scenario's ground truth.
- A recognition-cue guide, expanded in guided mode and collapsed in challenge mode.
- Synthesised rotor audio heard from the radar observer: loudness falls with slant range and scales with airframe size, new flight profiles drive pitch from motor RPM, and it is silent whenever the exercise or replay clock is stopped. Birds are silent.
- A progress dashboard with illustrative practice milestones, an optional trainee name and unit for reports, CSV export of the record, and print-ready debrief and progress pages.
- An installable progressive web app: production builds register a service worker so the 3D district works offline after the first visit (Earth imagery still needs a connection).
- Guided and challenge modes vary appearance timing, altitude, movement speed, and haze.
- Smooth camera transitions, fullscreen, and balanced/high graphics settings.
- A per-track score breakdown based on classification and observation time after object arrival. Every generated track has equal weight, including missed tracks. Classification earns credit only after a valid observation.
- Up to 20 browser-local results, a chart of recorded scores, JSON result export, and recommendations from explicit rules.
- Timeline replay with seeking and markers for recorded decisions. Replay never writes to the original result.

## Run and verify

```sh
npm ci
npm run dev -- --port 5173 --strictPort
```

Open the URL printed by Vite. The app can be built with `npm run build`. Run meaningful simulation and persistence checks with `npm test`.

The automated checks cover seeded reproduction, contact arrival, scoring edge cases, radar bounds, stored result integrity, history retention, and storage failures. Browser checks cover the full exercise, pause, automatic completion, replay seeking, camera controls, reload persistence, and narrow layouts.

## Flight simulation and Pilot lab

New exercises use scenario **version 4**: a six-degree-of-freedom rigid body integrates position, velocity, quaternion attitude and angular velocity at 120 Hz with RK4. Individual multirotor motors have lag, thrust, arm moments and alternating reaction torque. Fixed-wing and bird profiles use airspeed-dependent lift, drag, stall and control authority. Calm, breeze and seeded gust settings change aerodynamic forces; air density falls with geographic altitude. These are estimated browser simulation profiles, not manufacturer flight software or validated aerodynamics.

The catalogue adds the six-rotor **Yuneec Typhoon H480**, an electric **PX4 fixed-wing reference**, **house crow** and **rock pigeon**, alongside the existing four DJI airframes and black kite. Birds have separate shoulder, elbow, wrist and tail joints, species-specific proportions and flap/glide schedules. Aircraft have animated rotors or control surfaces. All new meshes are original project geometry; high/low detail GLBs share named joints with the local renderer and EO/IR. [Model references, provenance and file hashes](public/models/credits.json) are generated with the assets. The reference plane's geometry and bird internal proportions are estimates; only published reference figures are presented as such.

For geographic theatres, preparation samples a **2 km square, 65 × 65 heightfield** before flight. Route clearance, density and approximate ground collision use that frozen snapshot; it is retained with the scenario so replay does not depend on later terrain downloads. Sampling failure offers retry or an explicit flat-practice surface. Loaded terrain can contain finer detail than the collision grid. The synthetic district uses a flat ground plane; buildings are not collision objects. Routes and follower controllers use metre coordinates in both renderers. Aircraft outside their configured altitude profile are omitted; the Matrice mountain configuration assumes high-altitude propellers. Typhoon and reference-plane ceilings are conservative practice limits.

Automatic encounters compile in a Web Worker into a 60 Hz trace, with Hermite position and quaternion interpolation for arbitrary seeks. The cache retains two traces. Both scenes, sensor feed, radar and audio use the same sampled flight state. The 200 numbered seeds and scoring rules stay unchanged; **version 1/2/3 scenarios keep their original generation, trajectories and Earth scale**, with no migration or deletion of history. Environment settings do not alter the physical encounter.

Open **Pilot lab** for unscored, airborne manual practice, initially at Tololing with the Matrice. Pick an eligible aircraft, wind and theatre while held. **Chase**, **FPV** and **Free map** cameras are available. Click **Fly aircraft** or focus the view and press Space. Trackpad navigation switches to Free map and moves only the camera.

| Control | Multirotor | Fixed-wing |
| --- | --- | --- |
| W / S | Forward / backward | Increase / decrease throttle |
| A / D | Left / right | Bank left / right |
| Q / E | Yaw left / right | Rudder left / right |
| R / F | Climb / descend | — |
| ↑ / ↓ | — | Pitch down / up |
| Space / Esc | Hold or resume / hold | Hold or resume / hold |

Releasing multirotor movement keys commands braking, then captures a position hold. Fixed-wing throttle persists after release and flight still needs airspeed. Flight pauses on tab hiding or window blur. Leaving the practice area commands a return; a sampled-ground collision stops motion until **Reset airborne**. Manual flight is not saved as a scored session and does not modify observation history. The tutorial and telemetry explain controls, speed, altitude, density, RPM and stall/hold state.

## Implementation

- `src/simulation.ts`: seeded scenarios, positions, scoring, and recommendations.
- `src/kinematics.ts`: velocity, heading, attitude, wingbeat and strobe timing derived from the shared trajectory.
- `src/airframes.ts`: reference airframe specifications and the seed-based airframe choice.
- `src/flightPhysics.ts`, `flightProfiles.ts`, `flightScenario.ts`: rigid-body solver, estimated aerodynamic profiles and seeded routes.
- `src/flightTrace.ts`, `flightRuntime.ts`, `flight.worker.ts`: deterministic compilation, interpolation and bounded worker/cache lifecycle.
- `src/flightTerrain.ts`, `useFlightTerrain.ts`: sampled heightfield and explicit failure/flat-practice handling.
- `src/PilotView.tsx`, `usePilot.ts`, `pilotControls.ts`, `FlightCamera.tsx`: unscored pilot controls, worker clock and follow cameras.
- `src/birds.ts`: species proportions and published reference sources.
- `src/contactGeometry.ts`: drone and kite builders (built to `airframes.ts`) shared by the scene, the sensor feed and the Earth-view GLBs.
- `src/storage.ts`: versioned, validated browser-local history.
- `src/App.tsx`: console layout, the live simulation clock, controls, and session lifecycle.
- `src/DelhiScene.tsx`: district geometry, vehicles, and camera motion; `src/ContactModel.tsx` places contacts in it.
- `src/SceneView.tsx`: renderer selection, HUD, heading tape, sensor panel, graphics options, and fullscreen.
- `src/earthNavigation.ts`: satellite gestures, camera bounds, and input cleanup; `src/earthNavigationMath.ts` contains input/zoom/orbit math, `src/earthNavigationMotion.ts` coalesces and eases gesture movement, and `src/earthNavigationTerrain.ts` handles surface-ray zoom and clearance along the camera path.
- `src/SensorFeed.tsx`: the EO/IR camera.
- `src/Radar.tsx`: shared-position radar visualization.
- `src/RecognitionGuide.tsx`: recognition cues.
- `src/Review.tsx`: score explanation, deterministic replay, history, export and print.
- `src/DecisionReview.tsx` / `src/reviewEvidence.ts`: outcome filters, per-decision replay checkpoints and mobile decision cards.
- `src/analytics.ts` / `src/Progress.tsx`: training-record statistics, CSV export and the progress dashboard.
- `src/acoustics.ts`: rotor loudness/pitch model and the Web Audio renderer.
- `src/HelpDialog.tsx`: first-visit guide and keyboard reference.
- `public/sw.js`, `public/manifest.webmanifest`: offline caching and install metadata.

The 3D renderer loads separately from the application interface. Shadows and resolution are capped in balanced mode.

## Prototype boundaries

The physics solver and Pilot lab are illustrative simulations with estimated aerodynamic coefficients, not validated flight dynamics or an operational qualification. Pilot lab is unscored and never saves a training result.

Scenario movement, contact attitude, the sensor feed and the scoring rubric are illustrative. The EO/IR view is a rendered approximation, not a sensor model: it has no optics, detector noise or radiometric temperature model, and its background is sky only. The prototype does not implement operational engagement training, validated drone physics, real sensor data, or a learned AI model. Recommendations use explicit rules. The training scene is generated locally. Earth view streams geographic data and requires internet access; fonts fall back to system fonts when offline. Browser-local results belong to this device/browser and are not synchronized to a server.

## Theatres and Earth view

The **Theatre** selector (mission setup or sensor HUD) chooses where the exercise is viewed. The trajectories, radar and scoring are identical in every theatre; only the scene changes. The choice is remembered per browser and recorded as an optional theatre id in completed sessions. Older sessions without it remain valid.
The **Theatre** selector (mission setup or sensor HUD) chooses where the exercise is viewed. In new version-4 exercises, terrain preparation and altitude eligibility shape the flight, so the theatre is locked during an exercise/replay and recorded with its frozen terrain. Historical exercises retain theatre-independent trajectories. The choice is remembered per browser; session theatre remains optional for older results.

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

Pan, orbit and zoom gestures use reduced sensitivity and a short eased response, with bounded travel and speed so a burst of trackpad momentum cannot cause a large jump. Reversing a gesture cancels its remaining momentum. Each gesture retains its navigation anchor instead of re-picking terrain every frame; panning translates across that plane while the existing terrain-clearance check limits the camera path. Home uses a short transition. Navigation stops when the tab hides, the window loses focus, the guide opens, the input device changes, or the viewer is disposed.

Geographic theatres use CesiumJS. Without credentials they stream Esri World Imagery draped on **Esri World Elevation 3D terrain**, so mountains, valleys and ridgelines render in relief with sun shading. With `VITE_GOOGLE_MAPS_API_KEY` (Map Tiles API enabled) or `VITE_CESIUM_ION_TOKEN`, they use **Google Photorealistic 3D Tiles**, the Google Earth-style mesh; coverage and detail depend on Google. Copy `.env.example` to `.env.local` (and add the same variable in Vercel) to enable it. Browser credentials are visible to users: restrict them by HTTP referrer and API.

Historical encounters sample the rendered surface on rings 150 m and 320 m around the site and set the airspace datum to the highest point. Version-3 encounters retain the centre datum and frozen 2 km heightfield described above. The HUD shows the datum. Camera presets are framed per terrain (Overview / Ridgeline / Ground in mountains) and are raised automatically if they would end inside a slope. This is an illustrative placement, not a validated terrain-collision or line-of-sight model.

Pinch, wheel and button zoom follow the rendered hillside under the pointer (or the view centre), independently of the exercise airspace datum. Zoom preserves the viewing direction and stops before entering loaded terrain, with a 35 m ground-clearance limit. Terrain detail can change as tiles load.

The app draws its own site marker and does not overlay third-party boundary or place-name layers, whose depiction of borders may not match official Indian maps. Provider attribution stays visible. Thermal view is offered only in the training district, because satellite photography carries no heat information. Training contacts remain synthetic and follow the same recorded scenario and radar coordinates; version-4 positions use actual metres. Models keep their reference dimensions in EO/IR and Pilot lab; automatic Earth exercises apply bounded minimum-pixel display enlargement so contacts remain visible in wide views. Historical versions retain eight metres per Earth training unit and contact-size assistance. Use radar-cued EO/IR to inspect a distant real-size contact.

`src/theatres.ts` lists the theatres and camera framing; `src/EarthScene.tsx` owns the geographic viewer and tears down its WebGL resources and callbacks on unmount. `node --import tsx scripts/create-contact-models.mjs` regenerates the GLB contact models from `src/contactGeometry.ts`; `scripts/prepare-cesium.mjs` prepares runtime assets.

## Radar and variation library

The radar is a cockpit-inspired synthetic situation display, with adjustable range (100/250/500/1000 metres in version 4; 30/60/120 training units in historical encounters), north-up or camera-heading-up orientation, contact trails, track identifiers, and bearing/range/relative-altitude/speed readouts. Units scale to Earth mode metres. Click a return or a numbered track button to inspect it and cue EO/IR; during a live exercise this also records an observation. Scope clicks choose the nearest return, and the track buttons let you select individual contacts in a tightly spaced group. Returns outside the chosen range are counted rather than drawn at a false position; their track buttons remain available and are marked OUT.

Before starting, unscored preview playback animates the scene, radar and cued sensor from one looping clock. Use **Pause sample / Play sample** on the radar to hold or resume it. Starting an exercise resets its clock to zero; preview inspection never records an observation, classification or result. Exercise and replay sweeps, trails and readouts follow their respective clocks and freeze on hold. Hidden tabs do not advance the preview.

Earth mode shows **MAP FOLLOW**: panning translates the radar observer with the map's reticle on the exercise airspace plane. Returns, trails, bearing/range readouts, scope picking, EO/IR and rotor range all use that shared observer. Camera height is a viewing control; radar altitude stays relative to the airspace datum. Navigating while held or replaying changes this viewpoint without advancing contact motion or changing the saved result. Home and camera presets return to the theatre framing. The local district retains its **SITE FIXED** observer at `[0, 0, 12]`.

Visual reference: the range rings, heading references, ownship indicator and multifunction-display framing of [Falcon BMS's F-16 situation display](https://cdn.falcon-bms.com/docs/4.38/TO%201F-16CMAM-34-1-1%20BMS.pdf). The app uses an illustrative PPI layout with synthetic ground-relative returns; it does not reproduce an operational fighter radar or sensor physics.

The setup now exposes 200 numbered, deterministic variations in a selector and shows their full seed values. Shuffle visits all 200 without repetition within a cycle. Version-two scenarios add orbit, crossing, figure-eight, weave and approach paths, direction, formation spacing, speed, altitude and phase variation. New exercises use scenario version four: a worker compiles physics traces for drones and birds from frozen terrain, wind, and routes. Mixed encounters combine one to three drones with two birds, using separate flight definitions and the same per-track scoring. Saved scenario versions one, two, and three retain their original generation and motion when replayed or repeated. New per-track sessions use session version two, with ordered track decisions and timestamped observation/classification events. Session version one and scenario versions one/two retain their original scoring and replay paths. Both session versions share the existing `aeron-sessions-v1` storage key; no saved records or preferences are migrated or deleted. New code reads both formats; older app versions cannot read version-two results.

Verification includes all 200 seeded routes within the default scope, heading projection, readout scaling, shuffle cycles, legacy saves and trajectory validation. Browser checks exercised 100 distinct shuffles, radar controls, contact inspection/observation, pause freeze, and mobile layout.

## Per-track recognition

Choose **Mixed recognition**, start the exercise, and inspect each numbered radar track. A live radar click records an observation for that track and cues EO/IR. Classify the selected track with the buttons or **1 / 2 / 3**; **T** changes the selection and **O** observes it. Preview and replay inspections are unscored. Radar identities update independently from the operator's answers and never disclose the ground truth during an exercise. Pause freezes motion and blocks scored decisions.

The opening screen uses a monochrome introduction with direct Start and Configure actions; it collapses when a live exercise starts. The live console keeps the selected track and classification controls above the radar. The contact register shows each visible track as unobserved, observed or classified, based only on the operator's decisions. A workflow strip shows the current step; **Setup** jumps to mission configuration on smaller screens. The procedure reference can be expanded when needed.

The debrief lists every track's true category, submitted answer, response time and score. Filter decisions by missed, unclassified, incorrect or correct outcomes, then use **Inspect** to open a paused replay at the selected track's final classification, observation, or arrival. Repeated jumps update the existing replay and cue EO/IR without modifying the result. On small screens decisions become individual cards; printed reports include every decision even when the screen is filtered. Sessions ended before arrival cannot inspect an unrecorded future contact. Observation timing contributes up to 40 points and a correct identification after observation adds 60. Component scores are averaged across all generated tracks and rounded; a missed track contributes zero. Replay reconstructs answers and corrections at their recorded times without changing the saved result. Progress counts individual track decisions (one encounter for legacy sessions); CSV export includes one row per track, with a Track column.

## Adaptive practice

The debrief and Progress page recommend a fresh numbered variation using recorded per-track errors, missed observations, category coverage and day/dusk conditions. The recommendation shows its supporting counts and flags limited evidence. **Set up targeted practice** configures the exercise without starting its clock. This is a deterministic rule-based planner, not a learned AI instructor or an operational proficiency assessment. Legacy records contribute their original encounter-level decisions.


Night and fog are simulated display conditions in the district, Earth view and EO/IR feed. Earth view dims existing daytime satellite imagery or 3D tile textures; it does not provide nighttime satellite photography. Fog and thermal contrast are illustrative approximations, not validated atmospheric or sensor models. Conditions are retained in results, repeats, replay and exports. Optional `lighting` and `fog` scenario fields are additive: older Day/Dusk records remain valid under the existing session and scenario versions, and contact generation, trajectories and scoring are unchanged.
