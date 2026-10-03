# SIH26247 project and submission plan

## Objective

Build a desktop training simulator that lets a trainee complete a fictional drone-awareness scenario, records their observations and decisions, and explains their performance through an after-action review (AAR). Prepare the required six-slide SIH idea submission alongside the prototype.

This plan starts from an empty workspace on 3 October 2026. It proposes product and implementation choices; these are not additional ministry requirements.

## Current prototype progress — 4 October 2026

The local React prototype now covers a complete observation/classification/review loop, with a Delhi-inspired 3D district, three camera presets, a shared-position radar, reproducible scenario variations, guided/challenge modes, and daylight/dusk. Single drones, groups, and birds are represented. Recorded sessions support a score breakdown, a timeline, replay/seek, repeat, JSON export, and browser-local history.

The current implementation uses React/TypeScript/Vite and Three.js through React Three Fiber. The scenario engine and scoring are independent of rendering. The renderer loads separately from the app interface.

This is still an illustrative prototype. Expert-reviewed content and scoring, real user validation, unit-level administration, AI effectiveness evaluation, offline packaging, and submission materials remain subsequent work. The initial clock, replay, scoring, and persistence checks are implemented; broader performance and user testing remain part of the plan.

## Submission dependency

The supplied SIH26247 notes record a portal deadline of 5 October 2026. The two guideline PDFs contain older, conflicting dates. A direct verification attempt on 3 October returned HTTP 403. Confirm the current deadline and exact cutoff time through the portal or college SPOC immediately. Do not assume submission remains open until midnight.

Confirm SPOC nomination, team ID, registered team name, six eligible members, and the signed college authorization letter. Collect these while development proceeds. Submission depends on the team leader having working portal credentials.

## Product scope

The first demonstration should show one complete loop:

1. An instructor chooses a scenario and difficulty.
2. A trainee observes a simulated scene and marks an observation.
3. The trainee assigns a fictional object category and confidence level, then chooses a high-level training response such as reporting or requesting verification.
4. The simulator records events and evaluates decisions against the scenario's explicit decision tree.
5. An AAR shows the timeline, score breakdown, missed observations, and explanations.
6. A second session demonstrates retained results and a suggested next exercise.

Use synthetic scenes and configurable training rules. Scenario content and scoring weights remain provisional until reviewed by a relevant subject-matter expert. Detection measurements describe performance inside the exercise, not validated real-world readiness.

| Capability | First demonstration | Subsequent prototype |
|---|---|---|
| Delivery | Desktop experience using ordinary keyboard and mouse | Package for local/offline use and measure minimum hardware needs |
| Scene | One compact fictional environment | Urban and rural scenes, day/night presets |
| Scenarios | One scripted case and seeded variations | Broader scripted library and procedural combinations |
| Objects | Single and grouped synthetic objects | More varied appearances and observation conditions |
| Observation conditions | One clear and one degraded-visibility preset | Configurable simulated sensor degradation |
| Scoring | Detection time, classification accuracy, explicit decision-tree results | Expert-reviewed rules and difficulty calibration |
| AAR | Session timeline, event-linked feedback, replay | Individual and unit trends across repeated sessions |
| Adaptation | Transparent rules selecting a next exercise | Compare data-informed adaptation with a fixed progression |

Defer VR, live drone connections, real sensor integration, multiplayer networking, photorealistic terrain, and custom model training until the core loop works.

## Implementation structure

Keep the simulation independent of its interface so the same seeded scenario can run in a scene, a replay, and automated checks.

- **Scenario definition:** version, seed, environment, visibility, object schedule, difficulty, and decision-tree reference.
- **Simulation engine:** simulation clock, seeded generation, scripted events, and pause/resume behavior.
- **Trainee interface:** scene, observation controls, classification choices, confidence, and response selection.
- **Event recorder:** append-only events with simulation timestamps and session identifiers.
- **Scoring engine:** deterministic evaluation with separate metric values and readable explanations.
- **AAR and storage:** session replay, individual history, and aggregate unit results from persisted records.

Choose the rendering stack after a short feasibility spike on the actual demo laptop. The spike must load a scene, display multiple moving synthetic objects, accept an observation, and preserve a stable simulation clock. Use a stack the team can debug confidently. Freeze the choice after this checkpoint.

## Sequenced work

These are effort estimates for a small coordinated team, not guaranteed completion times. The submission track runs in parallel with the prototype track.

| Step | Suggested effort | Deliverable | Exit check |
|---|---|---|---|
| 1. Readiness and scope | 1–2 hours | Confirmed submission access, agreed demo story, requirement checklist | Every official outcome has a planned demonstration or an explicitly labeled future milestone |
| 2. Feasibility spike | 2–3 hours | Running desktop scene and recorded input | One observation is stored with the correct simulation timestamp on the target laptop |
| 3. Complete session | 4–6 hours | Start, observe, classify, respond, finish | A trainee completes a scripted exercise without developer intervention |
| 4. Scoring and review | 3–4 hours | Decision-tree evaluation, timeline, replay, saved history | Each score is traceable to recorded events; reopening the app retains the session |
| 5. Variation and adaptation | 2–3 hours | Seeded variants, difficulty presets, next-exercise suggestion | Same seed reproduces the exercise; changed seeds vary it within defined limits |
| 6. Demo and submission assets | 3–4 hours | Six-slide PDF, screenshots, short recorded demo, idea description | Claims match implemented behavior or are clearly identified as planned |
| 7. Final review | 1–2 hours | Rehearsed demonstration and checked submission files | PDF opens correctly, text is legible, required fields are complete |

If time is short, complete steps 1–4 and the submission assets first. Describe unfinished official outcomes honestly in the implementation roadmap. Do not delay the required idea submission to polish optional prototype features.

## AI contribution

Start with an interpretable learner profile derived from recorded errors and response times. Use it to recommend scenario difficulty and practice topics. Label the initial implementation as rule-based adaptation.

Once enough reviewed training data exists, evaluate whether a learned recommendation model improves held-out exercise performance compared with a fixed curriculum. Record the experiment, dataset limitations, and results before making AI-effectiveness claims. Keep scoring grounded in explicit rules and recorded events.

## Suggested six-person ownership

1. Team lead: requirements, integration, SPOC coordination, and submission readiness.
2. Simulation developer: scene and simulation clock.
3. Scenario developer: scripted cases, seeded generation, and difficulty controls.
4. Application developer: trainee interface and local persistence.
5. Evaluation developer: scoring, AAR, and meaningful behavior checks.
6. Research and presentation owner: source tracking, usability review, slides, and demo recording.

Adapt assignments to actual skills. Integrate a working session early; avoid six isolated components waiting until the end to connect.

## Verification

- Replay a saved seed and event stream and confirm identical scoring.
- Check correct, incorrect, missed, repeated, and late observations, including scenarios with no valid detection-time value.
- Confirm pause time does not inflate detection time and replay does not modify the original result.
- Restart the application and verify that completed sessions remain available.
- Verify individual/unit summaries against the underlying session records, with sample counts visible.
- Run the full demonstration on the actual laptop and record observed responsiveness and hardware details.
- Have someone outside the implementation team complete one exercise using the on-screen instructions.

## Six-slide submission

Use the supplied SIH template, preserve its required pointers, and export a maximum of six slides as PDF. Exclude the template's instruction slide from the final six-slide submission.

1. **Title:** official problem ID/title, theme, software category, registered team ID and name.
2. **Proposed solution:** intended user, complete training loop, problem fit, and a clearly stated differentiation hypothesis.
3. **Technical approach:** scenario engine, event recording, decision-tree scoring, AAR, and adaptation. Include a real prototype screenshot when available.
4. **Feasibility and viability:** measured demo hardware, delivery milestones, content-validation needs, and mitigation for major implementation risks.
5. **Impact and benefits:** intended learning outcomes and how to measure them through repeated sessions. Avoid unsupported percentage improvements or cost savings.
6. **Research and references:** official problem statement, relevant research reviewed by the team, and asset/data licenses.

Prepare the idea title and portal description from the same claims. The team leader should verify the problem selection, team details, authorization letter, uploaded PDF, and successful submission status, then retain the confirmation.

## Source material

- [Problem statement and compiled portal notes](/Users/dev/Documents/grok-chats/documents/SIH26247.md)
- [2026 general guidelines](/Users/dev/Documents/grok-chats/documents/sih-official/SIH-2026-Guidelines.pdf)
- [2026 college SPOC guidelines](/Users/dev/Documents/grok-chats/documents/sih-official/SIH2026-Guidelines-College-SPOC-updated.pdf)
- [Official presentation template](/Users/dev/Documents/grok-chats/documents/sih-official/SIH2026-IDEA-Presentation-Format.pptx)

The supplied 2024 and 2025 flowcharts provide process context. Their dates and nomination counts do not establish the 2026 requirements.
