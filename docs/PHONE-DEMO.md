# Phone controller demo

The phone is primarily a motion and touch controller. The laptop renders the selected theatre, including **Galwan Valley, Tololing and the other mountain sites**, with its existing Cesium satellite imagery and 3D terrain. The phone does not load Cesium, compile flight traces, or render a duplicate scene in its default mode. It sends small orientation, navigation and decision messages, so video bandwidth is not required.

## Online pairing on Vercel

Open the deployed app on the laptop, select Galwan Valley or Tololing, and choose the phone icon. Scan the QR in Chrome on Android, enable motion and recenter. Both devices need Internet; no Mac relay, tunnel, shared Wi-Fi or separate server process is required. The laptop always renders the scene.

The backend is `api/phone.ts`, a Node HTTP/WebSocket server hosted as a Vercel Function. `server/phone/store.ts` uses Redis pub/sub to exchange packets across Function instances. Redis holds **capability hashes**, an expiring room index, a short-lived hashed-address creation limit and connection leases. It does not save raw pairing capabilities, orientation history, scenarios or exercise results. Rooms expire after two hours; End pairing revokes their leases immediately. Maximum 32 rooms per environment; creation is limited to ten rooms per address per ten minutes.

Configuration:

1. Connect a Redis-compatible store through Vercel Marketplace. This project uses **Upstash for Redis, Free**, Mumbai (`bom1`), with automatic upgrades disabled.
2. Expose its TCP/TLS `REDIS_URL` to the Function (or use server-only `PHONE_REDIS_URL`). REST-only credentials are insufficient. Never prefix these values with `VITE_` or commit them. Production and preview room namespaces are isolated.
3. Enable Fluid Compute and deploy with the existing Vite build. `vercel.json` routes `/api/phone/*` to the Function with a 300-second limit. The client reconnects and reannounces readiness; sockets rotate before that limit. A live exercise holds when the link drops and **requires an explicit laptop resume** after reconnecting.
4. `/api/phone/status` reports availability without exposing credentials. Missing/unavailable Redis produces an actionable error instead of a QR that cannot connect.

WebSockets on Vercel are in beta. Free Redis quotas and Vercel Function/data usage still apply; the free Redis plan is not unlimited and pairing becomes unavailable if its quota is exhausted. The simulator itself remains usable. Local relay/USB fallback remains available below.

## Wireless on a Mac

```sh
npm ci
npm run build
brew install cloudflared
npm run phone:wireless
```

Open **http://localhost:4173** on the laptop. Select **Galwan Valley** or **Tololing**, wait for terrain and flight preparation, then choose the phone icon in the scene toolbar. Once the terminal prints **Wireless ready**, the QR uses its temporary HTTPS tunnel. Scan it with Android and open in Chrome. Both devices need Internet for this wireless setup; they need not share Wi-Fi. Cloudflare carries the connections to the laptop's local relay. Quick Tunnels are temporary demonstration infrastructure.

1. Hold the phone in landscape or portrait, facing forward. Tap **Enable gyro**, then **Recenter**.
2. The laptop QR closes automatically when the phone joins. Unscored preview plays; the laptop remains the display. During a live exercise, pairing first holds its clock and requires an explicit resume.
3. Turn the phone to look left/right; tilt it to look up/down. On maps this changes viewing direction from the current geographic camera position, preserving the initial valley or mountain framing. Roll is levelled for comfort.
4. With motion enabled, **swipe the pad to pan** and **pinch to zoom**. The **Zoom in / Zoom out**, **North**, and **Site** controls also work. Pan and zoom reuse the laptop's terrain-aware navigation limits and easing. Recenter preserves the current map position and resets the phone's reference.
5. Without sensor access use **Drag look** on the pad. **Motion / pan** restores gyro input and touch panning. Pan/zoom/site controls are available in geographic theatres.
6. The controller reports the laptop reticle's aimed track. When no contact is under it, it identifies the explicitly selected radar track as a **radar cue**. **Next track** selects and cues EO/IR without recording an observation.
7. Start the exercise on the laptop. Choose **Reticle** for the contact under the laptop reticle, or **Selected track** and a track chip in the register. Tap **Tag Txx** to record its observation. **Auto next** is on by default: after the laptop confirms T01, the controller selects/cues the next untagged track (T02, then T03, skipping previously tagged contacts and wrapping once). The identity controls retain their labelled target, so you can label T01 while T02 is cued without moving the cue back. Tagging T02 then makes its identity controls available while T03 is cued. Select a tagged track to revise its identity; turn Auto next off to keep the current target. The final tag reports completion without ending the exercise. Confirmation comes from the laptop's decision state; a send alone is shown as pending. Decisions are recorded and scored by the laptop only.
8. **Hold** pauses a live exercise. The laptop keeps its rendered view visible and the phone camera remains usable while held; the hold message is a compact banner. Resume on the laptop. Leaving either active browser tab or losing the phone connection holds a live exercise; reconnect does not automatically resume it.
9. Review the existing debrief and paused replay on the laptop. Saved results and scoring remain unchanged by camera/navigation controls. New pairing is disabled in replay.

The controller shows exercise time, seed, tagged/identified totals and per-contact range, bearing, relative altitude and ground speed. These readouts are computed on the laptop from the same prepared trajectories and translated observer as its radar; the phone never compiles traces. Reticle mode falls back to the explicitly labelled radar cue when nothing is under the reticle. The tag dock stays accessible while scrolling. Preview, pause, replay and stale links disable tagging, with a visible explanation. Sensor diagnostics and gesture instructions are available in an expandable panel.

The local Delhi-inspired district retains motion-controlled viewing and tagging. Geographic theatre changes retain the room, update its epoch, clear queued navigation, and reset the camera reference for the new site. Physics trace preparation remains on the laptop before its exercise clock can advance. The controller waits for that preparation before accepting scored decisions.

Ctrl+C stops the relay and tunnel. Rebuild after source changes. Restarting the relay invalidates invitations and generates a new tunnel URL; scan the fresh QR. The hosted Vercel relay is independent of this local process.

## USB fallback

Install Google's Android platform tools if needed (`brew install --cask android-platform-tools` on Mac). Enable Android Developer options and USB debugging, connect a data-capable cable, and accept authorization on the phone.

```sh
npm run phone:demo
adb devices
adb reverse tcp:4173 tcp:4173
```

Open **http://localhost:4173** on the laptop, choose the phone icon and use **http://localhost:4173** as the invitation base URL. The forwarded localhost is a secure browser context on Android. Scan the QR, or open that exact invitation link manually in Chrome if the scanner refuses a localhost link. All controller traffic uses ADB forwarding; no wireless connection or WebRTC transport is required. Earth imagery and terrain still require Internet on the laptop.

Afterwards remove forwarding with `adb reverse --remove tcp:4173` and disconnect the cable. USB fallback is explicit, because it requires device authorization and a new localhost invitation.

## Sensors, limits and pairing

- Gyro input prefers `RelativeOrientationSensor` when supported, with orientation-event fallbacks. Retry actually restarts the sensor/listeners. Sensor interruptions trigger recovery, retain the last camera direction and preserve the view across source/display changes. Screen rotation is compensated; Recenter explicitly resets the reference. Recovery and tagging do not switch input mode or reset a working gyro.
- Gyro health and relay health are separate. Missing sensor samples hold the last camera direction while touch controls and tagging remain available over a healthy link. Fresh ready/pose/control messages keep the relay alive; a five-second signal timeout holds the exercise once. A silent OPEN WebSocket reconnects after eight seconds. Explicit disconnection/hiding still holds immediately, and reconnection never resumes a live exercise. Hold reasons appear on the laptop and phone.
- Accelerometer and rotation-rate readings are diagnostics. Acceleration is not integrated into walking position. No GPS, camera or microphone permission is needed.
- Screen wake lock and short vibration feedback are optional. A vibration acknowledges a send, not successful recording.
- **O** tags the displayed reticle/radar-cued track; **1–3** classify that observed target. A delivered AudioVolumeUp event is accepted best-effort, but reliable physical volume-button handling requires native Android integration.
- This is a controller demonstration, not calibrated headset VR or positional tracking. The original local-district handheld renderer remains an opt-in development view at `/phone?view=handheld#pair=…`; its split-eye option is an uncalibrated stereo preview. Use the default controller for geographic theatres.
- Scene data are synthetic. Esri imagery on terrain is not verified photorealistic 3D-building coverage or surveyed collision geometry.
- Local rooms are in memory; cloud rooms use expiring Redis hashes and transient pub/sub. Both are limited to 32 rooms and expire after two hours. The host capability is separate from the bearer invitation and is never included in its QR. Do not share the QR beyond the intended phone. No account or result database is introduced.

## Troubleshooting

- **Motion unavailable on plain LAN HTTP:** use the HTTPS tunnel or USB-forwarded localhost.
- **Relay unavailable on the production website:** verify the server-only Redis connection, Fluid Compute, deployment and provider quota. Retry, or use the local laptop URL printed by the demo script.
- **Waiting / another phone already joined / expired invitation:** end pairing and scan a fresh QR.
- **Motion remains waiting:** allow motion sensors in Chrome site settings, retry and recenter. Drag look is available without sensors.
- **Very steep view:** recenter, then use Site or a laptop camera preset after disconnecting. Phone tilt is bounded; camera translation remains constrained by the existing approximate terrain checks.
- **Imagery missing:** check laptop Internet/provider status. The controller still reports connection separately from terrain loading.
- **Wireless drops:** hold the exercise and use the USB procedure. The laptop render does not depend on a video stream.

## Verification

Run `npm test` and `npm run build`. Phone tests cover malformed commands, room isolation, host authentication, stale/paused/replay decision rejection, heading wrap, recentering, camera rebasing after desktop navigation, bounded tilt and frame-rate-independent easing. Browser checks must include the mountain and valley renderers, remote pan/zoom, held-clock rotation, laptop preview visibility, phone controls, radar/EO agreement and lifecycle cleanup. Distributed relay tests use a temporary local `redis-server` when available (install with `brew install redis`); these integration checks are explicitly skipped if it is absent. They exercise separate Function instances, room limits, host authentication, reconnect leases, packet ordering, revocation and room isolation. A separate browser regression harness with injected sensor readings checks sequential tags, live gyro retention, real retry restart, and interrupted-reading recovery. Injected inputs are not physical OnePlus measurements; handset smoothness still needs a device check.

Sources: [MDN orientation events](https://developer.mozilla.org/en-US/docs/Web/API/Device_orientation_events/Detecting_device_orientation), [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

Hosted references: [Vercel WebSockets](https://vercel.com/docs/functions/websockets), [Redis pub/sub](https://redis.io/docs/latest/develop/pubsub/).

Sensor references: [RelativeOrientationSensor](https://developer.mozilla.org/en-US/docs/Web/API/RelativeOrientationSensor), [W3C orientation coordinate systems](https://www.w3.org/TR/orientation-sensor/).
