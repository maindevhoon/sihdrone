import { contactPosition, type Position, type Scenario } from './simulation';
import { sampleFlight } from './flightRuntime';
import type { FlightState } from './flightTypes';

// Motion state derived from the shared trajectory. Everything here is a pure function of
// scenario and exercise time, so renderers, the sensor feed and replay stay in agreement.
export type Kinematics = {
  position: Position;
  velocity: Position;
  /** Horizontal speed in training units per second. */
  speed: number;
  /** Compass heading of travel in radians, clockwise from north (-z). */
  heading: number;
  forwardAccel: number;
  /** Positive when the acceleration points to the right of travel (a right turn). */
  lateralAccel: number;
  flight?: FlightState;
};
export type Attitude = { pitch: number; roll: number };

const DT = .05, GRAVITY = 9.81;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function contactKinematics(scenario: Scenario, time: number, index: number): Kinematics {
  if(scenario.version===3){
    const flight=sampleFlight(scenario,time,index),previous=sampleFlight(scenario,time-DT,index),next=sampleFlight(scenario,time+DT,index);
    const speed=Math.hypot(flight.velocity[0],flight.velocity[2]);
    const heading=speed>1e-6?(Math.atan2(flight.velocity[0],-flight.velocity[2])+Math.PI*2)%(Math.PI*2):scenario.heading??0;
    const ax=(next.velocity[0]-previous.velocity[0])/(2*DT),az=(next.velocity[2]-previous.velocity[2])/(2*DT);
    return {position:flight.position,velocity:flight.velocity,speed,heading,forwardAccel:ax*Math.sin(heading)-az*Math.cos(heading),lateralAccel:ax*Math.cos(heading)+az*Math.sin(heading),flight};
  }
  const p = contactPosition(scenario, time, index);
  const a = contactPosition(scenario, time - DT, index), b = contactPosition(scenario, time + DT, index);
  const velocity: Position = [(b[0]-a[0])/(2*DT), (b[1]-a[1])/(2*DT), (b[2]-a[2])/(2*DT)];
  const accel = [(b[0]-2*p[0]+a[0])/(DT*DT), (b[2]-2*p[2]+a[2])/(DT*DT)];
  const speed = Math.hypot(velocity[0], velocity[2]);
  // A stationary contact keeps the scenario's nominal heading instead of an undefined direction.
  const heading = speed > 1e-6 ? (Math.atan2(velocity[0], -velocity[2]) + Math.PI*2) % (Math.PI*2) : scenario.heading ?? 0;
  const forward = [Math.sin(heading), -Math.cos(heading)], right = [Math.cos(heading), Math.sin(heading)];
  return {
    position: p, velocity, speed, heading,
    forwardAccel: accel[0]*forward[0] + accel[1]*forward[1],
    lateralAccel: accel[0]*right[0] + accel[1]*right[1],
  };
}

/** A multirotor tilts into its acceleration and against drag; angles are in radians, nose-down pitch positive. */
export function droneAttitude(k: Kinematics): Attitude {
  return {
    // Drag term gives roughly 8° of forward tilt at 4 m/s, typical for a mid-size multirotor.
    pitch: clamp(Math.atan((k.forwardAccel + .09*k.speed*k.speed)/GRAVITY), -.3, .42),
    roll: clamp(Math.atan(k.lateralAccel/GRAVITY)*1.4, -.4, .4),
  };
}

/** Birds bank into turns more steeply than a multirotor rolls, and pitch with climb. */
export function birdAttitude(k: Kinematics): Attitude {
  return {
    pitch: clamp(-k.velocity[1]*.18, -.35, .35),
    roll: clamp(Math.atan(k.lateralAccel/GRAVITY)*3.2, -.7, .7),
  };
}

/**
 * Black-kite style flight: bursts of four slow wingbeats, then a long glide with the wings
 * held slightly raised. Returns the wing elevation (radians) and whether the bird is flapping.
 */
export function wingBeat(time: number, index: number) {
  const period = 5.2 + index*.7, local = ((time + index*1.9) % period + period) % period;
  if (local < 1.6) return { angle: .1 + Math.sin(local*Math.PI*2*2.5)*.62, flapping: true };
  return { angle: .12 + Math.sin(time*.8 + index)*.04, flapping: false };
}

/** Anti-collision strobe: a short white flash roughly once per second, staggered per airframe. */
export function strobeOn(time: number, index: number) {
  return ((time + index*.37) % 1.1 + 1.1) % 1.1 < .07;
}
