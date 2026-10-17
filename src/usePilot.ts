import { useEffect, useRef, useState } from "react";
import type { Scenario } from "./simulation";
import type { FlightState } from "./flightTypes";
import { PHYSICS_HZ } from "./flightPhysics";
import { FLIGHT_PROFILES } from "./flightProfiles";
import { setLiveFlight } from "./flightRuntime";
import { PILOT_KEYS, pilotInput } from "./pilotControls";
export function usePilot(
  scenario: Scenario,
  enabled: boolean,
  suspended = false,
) {
  const time = useRef(0),
    keys = useRef(new Set<string>()),
    pausedRef = useRef(true);
  const [paused, setPaused] = useState(true),
    [ready, setReady] = useState(false),
    [state, setState] = useState<FlightState>(),
    [error, setError] = useState(""),
    [boundary, setBoundary] = useState(false),
    [reset, setReset] = useState(0);
  const pause = () => {
    pausedRef.current = true;
    keys.current.clear();
    setPaused(true);
  };
  const play = () => {
    if (ready && !state?.collided && !suspended) {
      keys.current.clear();
      pausedRef.current = false;
      setPaused(false);
    }
  };
  useEffect(() => {
    if (suspended) pause();
  }, [suspended]);
  useEffect(() => {
    pause();
    setReady(false);
    setError("");
    setState(undefined);
    setBoundary(false);
    time.current = 0;
    if (!enabled || !scenario.flight) return;
    const worker = new Worker(new URL("./flight.worker.ts", import.meta.url), {
      type: "module",
    });
    let disposed = false,
      frame = 0,
      previous = performance.now(),
      accumulator = 0,
      busy = true,
      lastHUD = 0;
    worker.onmessage = ({ data }) => {
      if (disposed) return;
      busy = false;
      if (data.error) {
        setError(data.error);
        pause();
        return;
      }
      const next = data.state as FlightState,
        t = (data.tick ?? 0) / PHYSICS_HZ;
      time.current = t;
      setLiveFlight(scenario, t, next);
      setReady(true);
      if (
        performance.now() - lastHUD > 75 ||
        next.collided ||
        data.tick === 0
      ) {
        setState(next);
        setBoundary(!!data.boundary);
        lastHUD = performance.now();
      }
      if (next.collided) pause();
    };
    worker.onerror = () => {
      setError("Flight worker unavailable. Reset or reload to retry.");
      pause();
    };
    worker.postMessage({ id: 0, kind: "pilot-init", scenario });
    const tick = (now: number) => {
      const delta = Math.max(0, Math.min(0.1, (now - previous) / 1000));
      previous = now;
      if (!pausedRef.current && !document.hidden) {
        accumulator += delta;
        if (!busy) {
          const ticks = Math.min(12, Math.floor(accumulator * PHYSICS_HZ));
          if (ticks) {
            accumulator -= ticks / PHYSICS_HZ;
            busy = true;
            worker.postMessage({
              id: 1,
              kind: "pilot-step",
              ticks,
              input: pilotInput(
                keys.current,
                FLIGHT_PROFILES[scenario.flight!.model].kind === "fixed-wing",
              ),
            });
          }
        }
      } else accumulator = 0;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const hide = () => {
      if (document.hidden) pause();
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("blur", pause);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      worker.terminate();
      keys.current.clear();
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("blur", pause);
    };
  }, [scenario, enabled, reset]);
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        event.metaKey ||
        event.altKey ||
        event.ctrlKey ||
        target.closest("input,select,textarea,button,a") ||
        !target.closest("[data-pilot-controls]") ||
        document.querySelector('[aria-modal="true"]')
      )
        return;
      if (event.code === "Space" && !event.repeat) {
        event.preventDefault();
        if (pausedRef.current) play();
        else pause();
        return;
      }
      if (event.code === "Escape") {
        pause();
        return;
      }
      if (PILOT_KEYS.has(event.code)) {
        event.preventDefault();
        if (!pausedRef.current) keys.current.add(event.code);
      }
    };
    const up = (event: KeyboardEvent) => {
      keys.current.delete(event.code);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [ready, state?.collided]);
  return {
    time,
    state,
    paused,
    ready,
    error,
    boundary,
    pause,
    play,
    reset: () => {
      pause();
      setReset((n) => n + 1);
    },
  };
}
