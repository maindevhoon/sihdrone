# Agent guide — Trinetra

This file applies to the entire repository. Follow the user's current request and keep changes focused on it.

## Project

Trinetra (त्रिनेत्र, formerly Aeron) is the SIH26247 drone-observation prototype: choose a scenario, observe and classify synthetic aerial objects, then review the recorded session. The interface uses React, TypeScript, and Vite. Three.js/React Three Fiber render the local Delhi-inspired district; Cesium renders the geographic Earth view.

- Repository: https://github.com/maindevhoon/sihdrone
- Production: https://sihdrone.vercel.app
- Vercel project: `sihdrone`, under `maindevhoons-projects`.
- There is no backend, account system, or database. Results are stored in the browser.
- Read `README.md` for implemented behavior. `PLAN.md` is a broader roadmap and contains historical assumptions; do not describe its planned features as completed work.

## Commands

```sh
npm ci
npm run dev -- --port 5173 --strictPort
npm test
npm run build
npm run preview -- --port 4173
```

Use the existing npm lockfile. Check whether a development server is already running before starting another. The development server binds to `127.0.0.1`.

`predev` and `prebuild` run `scripts/prepare-cesium.mjs`, which copies Cesium runtime assets into `public/cesium/`. Use `npm run build` so this preparation runs; invoking `vite build` alone can omit required assets on a fresh checkout.

To regenerate the original contact models after editing their geometry:

```sh
node --import tsx scripts/create-contact-models.mjs
```

## Code map

| File | Responsibility |
| --- | --- |
| `src/App.tsx` | Console layout, exercise clock, session transitions, observation/classification, keyboard controls |
| `src/simulation.ts` | Scenario types, seeded generation, contact positions, scoring, recommendations |
| `src/airframes.ts` | Published airframe specifications and the seed-based airframe choice; `airframes.test.ts` checks models against them |
| `src/kinematics.ts` | Velocity, heading, attitude, wingbeat and strobe timing derived from `contactPosition` |
| `src/flightPhysics.ts`, `flightProfiles.ts`, `flightScenario.ts` | 120 Hz rigid-body solver, aerodynamic profiles, seeded version-4 routes |
| `src/flightTrace.ts`, `flightRuntime.ts`, `flight.worker.ts` | 60 Hz trace compilation/interpolation, two-trace cache and worker lifecycle |
| `src/flightTerrain.ts`, `useFlightTerrain.ts` | Frozen 2 km terrain snapshot, sampling/retry/flat fallback |
| `src/PilotView.tsx`, `usePilot.ts`, `pilotControls.ts`, `FlightCamera.tsx` | Unscored manual flight, focused keyboard controls and Chase/FPV cameras |
| `src/birds.ts` | Species proportions and published references |
| `src/contactGeometry.ts` | Real-size drone/kite builders and pose/animation shared by the scene, sensor feed and GLB export |
| `src/ContactModel.tsx` | R3F wrapper that places a contact model on the shared trajectory |
| `src/SensorFeed.tsx` | EO/IR sensor camera that tracks a radar-cued contact |
| `src/RecognitionGuide.tsx` | Recognition-cue reference shown in the situation panel |
| `src/variations.ts` | Stable 200-seed library and shuffled selection deck |
| `src/storage.ts` | Validation and persistence of completed sessions |
| `src/SceneView.tsx` | Environment selection, HUD, sensor panel, radar track selection (portalled into the situation panel) |
| `src/DelhiScene.tsx` | Procedural district, Three.js contacts, local camera presets |
| `src/theatres.ts` | Theatre catalogue (published coordinates), per-terrain camera framing, ground-sample rings |
| `src/EarthScene.tsx` | Cesium viewer, imagery on 3D terrain or Google 3D tiles, airspace datum sampling, geographic contacts, cleanup |
| `src/Radar.tsx` | Interactive synthetic situation display |
| `src/radarMath.ts` | Radar projection, trails, and readouts |
| `src/Review.tsx` | Score explanation, timeline, replay, history, JSON export, print |
| `src/practice.ts` | Explainable adaptive practice suggestions from saved decision evidence |
| `src/analytics.ts` | Pure training-record statistics, readiness milestones, CSV export |
| `src/Progress.tsx` | Progress dashboard and trainee profile fields |
| `src/acoustics.ts` | Rotor loudness/pitch model and Web Audio renderer |
| `src/HelpDialog.tsx` | First-visit guide and keyboard reference |
| `public/sw.js` | Production-only service worker; bump `VERSION` when its caching logic changes |
| `src/styles.css` | Shared styling and responsive layouts |
| `src/*.test.ts` | Node tests for simulation, kinematics, radar, variations, and persistence |
| `scripts/` | Cesium asset preparation and contact-model generation |

## Simulation and persistence rules

- Keep scenario generation, positions, and scoring deterministic for a given scenario version, seed, and simulation time. Randomness belongs in scenario/deck creation, never in frame rendering or replay.
- Use `contactPosition` and `visibleContacts` (and `contactKinematics`, derived from them) as the shared source for both renderers, the sensor feed, radar, and replay. Contact models are real size in metres; Earth view scales positions, not models. Support the full generated contact count in every view; do not assume a fixed maximum from one sample scenario.
- The scenario format supports versions 1–4. Versions 1/2 retain their original encounters; version 3 retains the earlier mixed-contact trajectories and per-track categories. Version 4 combines per-track mixed recognition with physics traces and frozen primary/bird flight definitions. Preserve all older generators and trajectories; do not reinterpret existing version-3 results as physics sessions.
- The session format supports version 1 (legacy encounter scoring) and version 2 (per-track decisions and averaged scores), with the unchanged storage key `aeron-sessions-v1`. Scenario versions 3/4 save version-2 sessions; repeats of scenario versions 1/2 retain version-1 scoring. Storage validates every track and reconstructs final answers from its events. Older application versions cannot read version-2 results; do not migrate or erase version-1 history. All `aeron-*` storage keys predate the rename to Trinetra; keep them unchanged so saved results and preferences survive. Storage validates regenerated scenario fields and recomputed scores. Update these together when changing the schema or scoring, with an explicit migration/compatibility decision.
- Version-4 scenarios retain their flight definitions and frozen terrain snapshot; never resample terrain during repeat/replay. Changes to physics semantics require an explicit version/compatibility decision and tests.
- Prepare version-4 automatic traces before advancing a preview, exercise or replay clock. The 120 Hz solver belongs in the worker, with 60 Hz trace interpolation shared by renderers, radar, sensor and audio. Keep the compiled cache bounded at two traces. Manual piloting uses a separate worker clock and is unscored and unsaved; camera movement never drives pilot inputs.
- Keep the 200 numbered seed entries stable. Shuffle should cover a complete cycle without repeats and avoid repeating the current seed at a cycle boundary. Display the full seed so a variation can be reproduced.
- All motion, radar trails, sweep animation, and recorded events use the exercise clock. Pause must freeze simulation time. An active exercise pauses when the document becomes hidden.
- Observation time must fall after contact arrival and before the session ends to earn credit. Classification credit requires a valid observation.
- Sessions may carry an optional `theatre` id (added without a version bump: older results without it remain valid, unknown ids are rejected). Keep it optional.
- The trainee profile is stored separately under `aeron-profile-v1` and is not part of the session schema. Readiness milestones are illustrative practice targets; do not present them as an operational qualification.
- Rotor audio must stay a function of exercise time and contact range, and fall silent whenever the clock stops.
- Replay must not modify the saved session or its score. Handle malformed/unavailable browser storage without breaking the exercise; history currently retains up to 20 results.

## Rendering and radar

- Preserve the local training scene and the Earth view. Keep heavy renderer code lazy-loaded, bound resource usage, and dispose of WebGL resources, controls, event handlers, and textures when appropriate. Check lifecycle changes under React StrictMode.
- The simulation uses `[x, y, z]`, with `y` as altitude. The local radar observer is `[0, 0, 12]`. Earth mode translates that observer with the map reticle on the exercise airspace plane (`earthRadarObserver.ts`), keeping altitude relative to the airspace datum. Pass the shared observer to radar projection, range filtering, trails, picking, readouts, EO/IR and rotor range. Version-4 positions and models use metres in both scenes; version-1/2/3 Earth positions retain eight metres per training unit. Camera navigation changes viewpoint even on a held clock; it must never change contact motion or saved results.
- Radar heading-up mode rotates the projection using camera heading. Preserve range when rotating, count out-of-range contacts accurately, and never clamp them to misleading positions on the scope.
- Airframe dimensions must stay within 2% of the published envelope in `airframes.ts`; cite the source when adding an airframe and only display published figures. Regenerate the GLBs after geometry changes.
- Regenerate `public/models/credits.json` with GLBs; retain source links, original-mesh provenance and hashes. Estimated aerodynamic coefficients, bird internal proportions and reference-plane geometry must remain labelled as estimates. Version-4 named rotor/wing/control-surface joints and poses must agree in Three.js and Cesium. Use altitude eligibility, density and frozen sampled terrain consistently; collision is approximate and excludes synthetic district buildings.
- Thermal views are display approximations; do not describe them as radiometric or validated sensor output.
- Radar contact inspection may record an observation during a live exercise, but preview and replay interactions must not alter exercise results. Radar track identity reflects the operator's classification, never the scenario category.
- Keep the cockpit-inspired display legible and its controls usable at narrow widths. Check that radar, camera presets, attribution, and bottom controls do not overlap.
- Geographic theatres (`src/theatres.ts`) without credentials show Esri satellite imagery on Esri World Elevation terrain. Do not label it as photorealistic 3D buildings or surveyed terrain. Google 3D coverage has not been verified with an authenticated account. Cite a source for any new theatre coordinates.
- Do not add third-party boundary or place-name overlays; their border depictions may not match official Indian maps. The app draws its own site marker.
- Keep provider attribution visible and loading/failure states informative. The sampled airspace datum and camera ground clearance are illustrative, not a validated collision/terrain system.

## Credentials and generated files

- Optional browser configuration lives in `.env.local`: `VITE_GOOGLE_MAPS_API_KEY` or `VITE_CESIUM_ION_TOKEN`. See `.env.example`. Vite values are embedded in the browser bundle; never put server secrets in them. Use provider restrictions for browser credentials.
- Do not commit credentials, `.vercel/`, `node_modules/`, `dist/`, `public/cesium/`, `.verification/`, or TypeScript build caches.
- Commit the original generated `public/models/*.glb` assets together with relevant model-generator changes.
- Keep the simulation usable without paid-service credentials. Preserve the current distinction between synthetic training data, satellite imagery, and authenticated 3D tile data.

## Verification and delivery

- For simulation, radar math, seed, or persistence changes, run `npm test` and add behavior tests for meaningful new edge cases. For application code or build changes, run `npm run build`.
- For UI/renderer changes, verify in a browser: scene loading, changed controls, contact/radar agreement, pause/resume, and relevant replay behavior. Check a narrow viewport and browser errors. A successful Vite startup or build alone does not verify WebGL rendering.
- Documentation-only changes need a content/path review, not a full browser or test run.
- Avoid unrelated rewrites of compact existing files. Keep pure logic outside React/render loops; use readable TypeScript for new code and accessible labels for interactive controls.
- Vercel builds with `npm run build` and publishes `dist`. The GitHub integration deploys pushes to `main`; treat a push there as a production deployment and account for the user's requested scope.
- When deployment is requested, verify the live page and renderer assets after Vercel reports readiness. Report the actual URL and any remaining limitation; do not equate a successful upload with a verified site.
- In the handoff, state what changed, what was checked, and any material limitation. Keep prototype claims grounded in implemented behavior: synthetic encounters and rule-based scoring are not validated sensor performance or learned AI.
