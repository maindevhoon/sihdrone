import type { Category } from "../simulation";
import type { PhoneSnapshot } from "./protocol";

export type PendingTag = {
  epoch: number;
  track: number;
  answer?: Category;
};
/** A transport send is not a receipt; only the host's decision state confirms a tag. */
export function tagConfirmed(pending: PendingTag, state: PhoneSnapshot) {
  if (state.epoch !== pending.epoch) return false;
  const decision = state.decisions?.find((track) => track.id === pending.track);
  return (
    decision?.detection != null &&
    (pending.answer === undefined || decision.answer === pending.answer)
  );
}
export function controllerTarget(
  state: PhoneSnapshot | null,
  source: "reticle" | "track",
) {
  if (!state) return null;
  const id =
    source === "reticle"
      ? (state.aimedTrack ?? state.selectedTrack)
      : state.selectedTrack;
  return Number.isSafeInteger(id) && id >= 0 && id < state.scenario.count
    ? id
    : null;
}

/** Advance in numbered order, wrap once, and never return an already observed track. */
export function nextUntaggedTrack(
  state: PhoneSnapshot,
  after: number,
): number | null {
  for (let offset = 1; offset <= state.scenario.count; offset++) {
    const id = (after + offset) % state.scenario.count;
    if (state.decisions?.find((track) => track.id === id)?.detection == null)
      return id;
  }
  return null;
}
