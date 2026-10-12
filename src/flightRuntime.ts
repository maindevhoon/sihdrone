import type { Scenario } from "./simulation";
import type { FlightState } from "./flightTypes";
import { bodyState, createBody } from "./flightPhysics";
import { FLIGHT_PROFILES } from "./flightProfiles";
import {
  compileFlight,
  interpolateState,
  sampleTrace,
  type FlightTrace,
} from "./flightTrace";
const keys = new WeakMap<Scenario, string>(),
  cache = new Map<string, FlightTrace>(),
  pending = new Map<string, Promise<void>>();
const initial = new WeakMap<Scenario, FlightState[]>(),
  live = new WeakMap<Scenario, { time: number; state: FlightState }[]>();
let active: { key: string; cancel: () => void } | undefined;
function key(s: Scenario) {
  let k = keys.get(s);
  if (!k) {
    k = JSON.stringify(s);
    keys.set(s, k);
  }
  return k;
}
function store(k: string, trace: FlightTrace) {
  cache.delete(k);
  cache.set(k, trace);
  while (cache.size > 2) cache.delete(cache.keys().next().value!);
}
export const flightPrepared = (s: Scenario) =>
  s.version !== 3 || live.has(s) || cache.has(key(s));
export function prepareFlight(s: Scenario): Promise<void> {
  if (s.version !== 3 || flightPrepared(s)) return Promise.resolve();
  const k = key(s),
    existing = pending.get(k);
  if (existing) return existing;
  active?.cancel();
  const task = new Promise<void>((resolve, reject) => {
    if (typeof Worker === "undefined") {
      store(k, compileFlight(s));
      resolve();
      return;
    }
    const worker = new Worker(new URL("./flight.worker.ts", import.meta.url), {
      type: "module",
    });
    const timeout = setTimeout(() => {
      worker.terminate();
      reject(new Error("Flight preparation timed out. Retry this variation."));
    }, 30000);
    const done = () => {
      clearTimeout(timeout);
      worker.terminate();
    };
    active = {
      key: k,
      cancel: () => {
        done();
        reject(new Error("Flight preparation superseded by a new variation."));
      },
    };
    worker.onmessage = ({ data }) => {
      done();
      if (data.error) reject(new Error(data.error));
      else {
        store(k, data.trace);
        resolve();
      }
    };
    worker.onerror = () => {
      done();
      reject(
        new Error("Flight worker could not load. Retry or reload the page."),
      );
    };
    worker.postMessage({ id: 0, kind: "compile", scenario: s });
  });
  pending.set(k, task);
  void task
    .finally(() => {
      pending.delete(k);
      if (active?.key === k) active = undefined;
    })
    .catch(() => {});
  return task;
}
export function setLiveFlight(s: Scenario, time: number, state: FlightState) {
  let history = live.get(s);
  if (!history) {
    history = [];
    live.set(s, history);
  }
  if (history.length && time <= history.at(-1)!.time) history.length = 0;
  history.push({ time, state });
  while (history.length > 1 && history[1].time < time - 6) history.shift();
}
export function sampleFlight(
  s: Scenario,
  time: number,
  index: number,
): FlightState {
  if (!s.flight) throw new Error("Missing flight definition");
  const history = live.get(s);
  if (history?.length) {
    let i = history.length - 1;
    while (i > 0 && history[i].time > time) i--;
    const a = history[i],
      b = history[Math.min(i + 1, history.length - 1)],
      dt = b.time - a.time;
    return dt > 0
      ? interpolateState(
          a.state,
          b.state,
          Math.max(0, Math.min(1, (time - a.time) / dt)),
          dt,
        )
      : a.state;
  }
  let trace = cache.get(key(s));
  if (!trace && typeof Worker === "undefined") {
    trace = compileFlight(s);
    store(key(s), trace);
  }
  if (trace) return sampleTrace(trace, time, index);
  let states = initial.get(s);
  if (!states) {
    states = Array.from({ length: s.count }, (_, i) =>
      bodyState(
        createBody(FLIGHT_PROFILES[s.flight!.model], s.flight!, s.seed, i),
      ),
    );
    initial.set(s, states);
  }
  return states[Math.max(0, Math.min(index, states.length - 1))];
}
