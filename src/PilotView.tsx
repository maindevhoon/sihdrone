import { Suspense, lazy, useMemo, useRef, useState } from "react";
import { ArrowLeft, Pause, Play, RotateCcw } from "lucide-react";
import { AIRFRAMES, type AirframeId } from "./airframes";
import { THEATRES, theatreById, type TheatreId } from "./theatres";
import { createScenario, formatTime, type CameraView } from "./simulation";
import { LIGHTING_OPTIONS, lightingLabels, type Lighting } from "./environment";
import type { WindPreset } from "./flightTypes";
import { flatTerrain, terrainHeight } from "./flightTerrain";
import { airDensity } from "./flightPhysics";
import { FLIGHT_PROFILES } from "./flightProfiles";
import { useFlightTerrain } from "./useFlightTerrain";
import { usePilot } from "./usePilot";
const SceneView = lazy(() => import("./SceneView"));
export default function PilotView({
  lighting: initialLighting,
  fog: initialFog,
  suspended = false,
  onBack,
}: {
  lighting: Lighting;
  fog: boolean;
  suspended?: boolean;
  onBack: () => void;
}) {
  const [theatreId, setTheatreId] = useState<TheatreId>("tololing"),
    [model, setModel] = useState<AirframeId>("matrice-350-rtk");
  const [lighting, setLighting] = useState(initialLighting),
    [fog, setFog] = useState(initialFog),
    [wind, setWind] = useState<WindPreset>("breeze");
  const [camera, setCamera] = useState<"chase" | "fpv" | "free">("chase"),
    [cameraView, setCameraView] = useState<CameraView>("overview");
  const [radarSlot, setRadarSlot] = useState<HTMLDivElement | null>(null),
    focus = useRef<HTMLDivElement>(null);
  const theatre = theatreById(theatreId),
    terrain = useFlightTerrain(theatre),
    profile = FLIGHT_PROFILES[model];
  const snapshot = terrain.terrain;
  const scenario = useMemo(
    () => ({
      ...createScenario(
        "passing",
        1123581321,
        "guided",
        lighting === "dusk",
        4,
        { lighting, fog },
        { model, wind, terrain: snapshot ?? flatTerrain(theatre) },
      ),
      arrival: 0,
      count: 1,
    }),
    [lighting, fog, model, wind, snapshot, theatre],
  );
  const eligible =
    profile.maxAltitude > (snapshot?.datum ?? theatre.elevation ?? 0) + 250;
  const pilot = usePilot(scenario, !!snapshot && eligible, suspended),
    state = pilot.state;
  const locked = !pilot.paused,
    altitude = state ? state.position[1] + (snapshot?.datum ?? 0) : 0;
  const agl =
    state && snapshot
      ? state.position[1] -
        terrainHeight(snapshot, state.position[0], state.position[2])
      : 0;
  const fixed = profile.kind === "fixed-wing";
  const play = () => {
    pilot.play();
    focus.current?.focus();
  };
  return (
    <main className="console pilot-console">
      <aside className="panel mission">
        <div className="panel-head">
          <span>PILOT LAB</span>
          <span className="tag">UNSCORED</span>
        </div>
        <div className="panel-scroll">
          <div className="mission-title">
            <h1>Fly the ridgeline</h1>
            <p>
              Stabilized flight over satellite imagery and mountain terrain.
              Start airborne, then explore in Chase or FPV.
            </p>
          </div>
          <div className="field">
            <label className="section-label" htmlFor="pilot-theatre">
              THEATRE
            </label>
            <select
              id="pilot-theatre"
              value={theatreId}
              disabled={locked}
              onChange={(e) => setTheatreId(e.target.value as TheatreId)}
            >
              {THEATRES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="section-label" htmlFor="pilot-airframe">
              AIRCRAFT
            </label>
            <select
              id="pilot-airframe"
              value={model}
              disabled={locked}
              onChange={(e) => setModel(e.target.value as AirframeId)}
            >
              {Object.values(AIRFRAMES).map((a) => (
                <option
                  key={a.id}
                  value={a.id}
                  disabled={
                    FLIGHT_PROFILES[a.id].maxAltitude <
                    (snapshot?.datum ?? theatre.elevation ?? 0) + 250
                  }
                >
                  {a.name}
                  {a.id === "matrice-350-rtk" ? " · high-altitude props" : ""}
                </option>
              ))}
            </select>
            {!eligible && (
              <p role="alert">
                This aircraft is outside its altitude profile. Select the
                Matrice high-altitude configuration.
              </p>
            )}
          </div>
          <div className="field">
            <label className="section-label" htmlFor="pilot-wind">
              WIND
            </label>
            <select
              id="pilot-wind"
              value={wind}
              disabled={locked}
              onChange={(e) => setWind(e.target.value as WindPreset)}
            >
              <option value="calm">Calm</option>
              <option value="breeze">Breeze · 4 m/s</option>
              <option value="gusty">Gusty · 8 m/s + gusts</option>
            </select>
          </div>
          <div className="field">
            <span className="section-label">LIGHTING</span>
            <div className="segmented lighting-options">
              {LIGHTING_OPTIONS.map((l) => (
                <button
                  key={l}
                  disabled={locked}
                  aria-pressed={lighting === l}
                  onClick={() => setLighting(l)}
                >
                  {lightingLabels[l]}
                </button>
              ))}
            </div>
            <label className="pilot-fog">
              <input
                type="checkbox"
                checked={fog}
                disabled={locked}
                onChange={(e) => setFog(e.target.checked)}
              />{" "}
              Fog
            </label>
          </div>
          {!snapshot && (
            <div className="flight-preparing" role="status">
              {terrain.error || "Sampling the terrain before flight…"}
              {terrain.error && (
                <>
                  <button onClick={terrain.retry}>Retry terrain</button>
                  <button onClick={terrain.useFlat}>Use flat practice</button>
                </>
              )}
            </div>
          )}
          {snapshot?.source === "flat" && theatre.kind !== "synthetic" && (
            <p className="pilot-note">
              Flat practice: imagery still shows mountains, but collision height
              uses a flat plane.
            </p>
          )}
          <section className="pilot-guide" aria-label="Flight control tutorial">
            <h2>Flight controls</h2>
            <p>
              Click the view to focus. Trackpad gestures move the camera and
              switch to Free map.
            </p>
            <dl>
              <div>
                <dt>
                  <kbd>W</kbd> <kbd>S</kbd>
                </dt>
                <dd>
                  {fixed
                    ? "Increase / decrease throttle"
                    : "Forward / backward"}
                </dd>
              </div>
              <div>
                <dt>
                  <kbd>A</kbd> <kbd>D</kbd>
                </dt>
                <dd>{fixed ? "Bank left / right" : "Move left / right"}</dd>
              </div>
              <div>
                <dt>
                  <kbd>Q</kbd> <kbd>E</kbd>
                </dt>
                <dd>{fixed ? "Rudder left / right" : "Yaw left / right"}</dd>
              </div>
              <div>
                <dt>
                  {fixed ? (
                    <>
                      <kbd>↑</kbd> <kbd>↓</kbd>
                    </>
                  ) : (
                    <>
                      <kbd>R</kbd> <kbd>F</kbd>
                    </>
                  )}
                </dt>
                <dd>{fixed ? "Pitch down / up" : "Climb / descend"}</dd>
              </div>
              <div>
                <dt>
                  <kbd>Space</kbd>
                </dt>
                <dd>Hold / resume flight</dd>
              </div>
              <div>
                <dt>
                  <kbd>Esc</kbd>
                </dt>
                <dd>Hold and release controls</dd>
              </div>
            </dl>
            <p>
              {fixed
                ? "Throttle and speed persist after release."
                : "Release the keys to brake and hold position."}{" "}
              Switching tabs pauses flight.
            </p>
          </section>
        </div>
        <div className="panel-foot">
          <button
            className="primary-button"
            disabled={!pilot.ready || !!state?.collided || !eligible}
            onClick={pilot.paused ? play : pilot.pause}
          >
            {pilot.paused ? <Play size={16} /> : <Pause size={16} />}{" "}
            {pilot.ready
              ? pilot.paused
                ? "Fly aircraft"
                : "Hold flight"
              : "Preparing flight…"}
          </button>
          <button className="text-button" onClick={pilot.reset}>
            <RotateCcw size={14} />
            Reset airborne
          </button>
          <button className="text-button" onClick={onBack}>
            <ArrowLeft size={14} />
            Back to observation
          </button>
        </div>
      </aside>
      <section
        ref={focus}
        tabIndex={0}
        data-pilot-controls
        className="stage pilot-stage"
        aria-label="Keyboard flight control view"
        onPointerDown={(e) => {
          if (!(e.target as HTMLElement).closest("button,select,input,a"))
            focus.current?.focus();
        }}
      >
        {snapshot && pilot.ready ? (
          <Suspense
            fallback={<div className="scene-loading">Preparing view…</div>}
          >
            <SceneView
              scenario={scenario}
              time={pilot.time}
              displayTime={pilot.time.current}
              selected={false}
              phase={pilot.paused ? "preview" : "running"}
              previewPlaying={false}
              cameraView={cameraView}
              onCameraChange={setCameraView}
              onSelect={() => {}}
              onPause={pilot.pause}
              theatre={theatre}
              onTheatreChange={setTheatreId}
              radarTarget={radarSlot}
              pilotCamera={camera}
              onPilotCamera={setCamera}
            />
          </Suspense>
        ) : (
          <div className="scene scene-loading">
            <span className="loader" />
            <p>
              {terrain.error ||
                pilot.error ||
                "Preparing the terrain and flight controls…"}
            </p>
          </div>
        )}
        <div className="pilot-banner" role="status">
          {pilot.error ||
            (state?.collided
              ? "Flight stopped · Reset airborne to retry"
              : pilot.boundary
                ? "Returning toward the practice area"
                : pilot.paused
                  ? "Flight held · Fly aircraft to begin"
                  : "PILOT LIVE · keyboard controls active")}
        </div>
      </section>
      <aside className="panel ops">
        <div className="panel-head">
          <span>FLIGHT TELEMETRY</span>
          <span className="tag">{formatTime(pilot.time.current)}</span>
        </div>
        <div className="panel-scroll">
          <dl className="pilot-telemetry">
            <div>
              <dt>Ground speed</dt>
              <dd>
                {state
                  ? Math.hypot(state.velocity[0], state.velocity[2]).toFixed(1)
                  : "—"}{" "}
                <small>m/s</small>
              </dd>
            </div>
            <div>
              <dt>Airspeed</dt>
              <dd>
                {state?.airspeed.toFixed(1) ?? "—"} <small>m/s</small>
              </dd>
            </div>
            <div>
              <dt>Above sampled ground</dt>
              <dd>
                {state ? agl.toFixed(1) : "—"} <small>m</small>
              </dd>
            </div>
            <div>
              <dt>Geographic altitude</dt>
              <dd>
                {state ? Math.round(altitude) : "—"} <small>m</small>
              </dd>
            </div>
            <div>
              <dt>Climb</dt>
              <dd>
                {state ? state.velocity[1].toFixed(1) : "—"} <small>m/s</small>
              </dd>
            </div>
            <div>
              <dt>Air density</dt>
              <dd>
                {state ? airDensity(altitude).toFixed(3) : "—"}{" "}
                <small>kg/m³</small>
              </dd>
            </div>
            <div>
              <dt>Rotor speed</dt>
              <dd>
                {state?.rotorRPM.length
                  ? Math.round(
                      state.rotorRPM.reduce((a, b) => a + b, 0) /
                        state.rotorRPM.length,
                    )
                  : "—"}{" "}
                <small>rpm</small>
              </dd>
            </div>
            <div>
              <dt>Flight status</dt>
              <dd>
                {state?.collided
                  ? "STOPPED"
                  : state?.stalled
                    ? "STALL"
                    : pilot.paused
                      ? "HOLD"
                      : "STABLE"}
              </dd>
            </div>
          </dl>
          <div ref={setRadarSlot} className="radar-slot" />
          <p className="pilot-note">
            Estimated aerodynamic profiles and sampled terrain. This practice
            flight does not change your training score or history.
          </p>
          <a
            href="/models/credits.json"
            target="_blank"
            rel="noreferrer"
            className="text-button"
          >
            Model sources & credits
          </a>
        </div>
      </aside>
    </main>
  );
}
