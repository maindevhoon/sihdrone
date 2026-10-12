import { compileFlight } from "./flightTrace";
import {
  createBody,
  stepBody,
  bodyState,
  type FlightBody,
} from "./flightPhysics";
import { FLIGHT_PROFILES } from "./flightProfiles";
import type { Scenario } from "./simulation";
import type { PilotInput } from "./flightTypes";
const context = globalThis as unknown as {
  onmessage: (event: MessageEvent) => void;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};
let pilot: FlightBody | undefined;
context.onmessage = ({
  data,
}: {
  data: {
    id: number;
    kind: "compile" | "pilot-init" | "pilot-step";
    scenario: Scenario;
    ticks: number;
    input: PilotInput;
  };
}) => {
  try {
    if (data.kind === "compile") {
      const trace = compileFlight(data.scenario);
      context.postMessage({ id: data.id, trace }, [trace.data.buffer]);
    } else if (data.kind === "pilot-init") {
      pilot = createBody(
        FLIGHT_PROFILES[data.scenario.flight!.model],
        data.scenario.flight!,
        data.scenario.seed,
      );
      context.postMessage({ id: data.id, state: bodyState(pilot), tick: 0 });
    } else if (pilot) {
      let state = bodyState(pilot);
      for (let i = 0; i < data.ticks; i++) state = stepBody(pilot, data.input);
      context.postMessage({
        id: data.id,
        state,
        tick: pilot.tick,
        boundary: pilot.boundary,
      });
    }
  } catch (error) {
    context.postMessage({
      id: data.id,
      error:
        error instanceof Error ? error.message : "Flight preparation failed",
    });
  }
};
