import { visibleContacts, type Scenario, type Position } from "../simulation";
import { contactReadout, DEFAULT_RADAR_OBSERVER } from "../radarMath";
import type { PhoneContact } from "./protocol";

/** Computed on the laptop from the same prepared trajectories/observer as its radar. */
export function phoneContacts(
  scenario: Scenario,
  time: number,
  prepared: boolean,
  metresPerUnit = 1,
  observer: Position = DEFAULT_RADAR_OBSERVER,
): PhoneContact[] {
  if (!prepared) return [];
  return visibleContacts(scenario, time).map(({ id }) => ({
    id,
    ...contactReadout(scenario, time, id, metresPerUnit, observer),
  }));
}
