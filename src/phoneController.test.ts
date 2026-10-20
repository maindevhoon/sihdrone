import { test } from "node:test";
import assert from "node:assert/strict";
import { createScenario, emptyTrackDecisions } from "./simulation";
import { contactReadout } from "./radarMath";
import { controllerTarget, tagConfirmed } from "./phone/controllerState";
import { phoneContacts } from "./phone/hostTelemetry";
import { validControl, type PhoneSnapshot } from "./phone/protocol";

const scenario = createScenario("mixed", 123, "guided", false, 3);
const state: PhoneSnapshot = {
  scenario,
  epoch: 4,
  time: 15,
  phase: "running",
  playing: true,
  selectedTrack: 0,
  aimedTrack: 2,
  decisions: emptyTrackDecisions(scenario),
};
test("phone telemetry agrees with radar for all contacts, units and translated observer", () => {
  const full = { ...scenario, count: 27 };
  const observer: [number, number, number] = [120, 24, -60];
  const contacts = phoneContacts(full, 15, true, 8, observer);
  assert.equal(contacts.length, full.count);
  for (const contact of contacts)
    assert.deepEqual(contact, {
      id: contact.id,
      ...contactReadout(full, 15, contact.id, 8, observer),
    });
  assert.notEqual(contacts[0].range, phoneContacts(full, 15, true, 8)[0].range);
  assert.deepEqual(phoneContacts(full, scenario.arrival - 0.01, true), []);
  // No solver/trace work may leak to an unprepared snapshot.
  assert.deepEqual(
    phoneContacts(createScenario("mixed", 123, "guided", false, 4), 15, false),
    [],
  );
  assert.ok(
    contacts.every(
      (contact) => !("category" in contact) && !("answer" in contact),
    ),
  );
});
test("reticle and explicit radar selection choose separate targets without a stale target fallback", () => {
  assert.equal(controllerTarget(state, "reticle"), 2);
  assert.equal(controllerTarget(state, "track"), 0);
  assert.equal(controllerTarget({ ...state, aimedTrack: null }, "reticle"), 0);
  assert.equal(
    controllerTarget({ ...state, aimedTrack: scenario.count }, "reticle"),
    null,
  );
  assert.equal(controllerTarget(null, "track"), null);
});
test("a tag receipt requires the matching host track, epoch, observation and identity", () => {
  const pending = { epoch: 4, track: 2 };
  assert.equal(tagConfirmed(pending, state), false);
  const confirmed = {
    ...state,
    decisions: state.decisions!.map((track) =>
      track.id === 2 ? { ...track, detection: 12 } : track,
    ),
  };
  assert.equal(tagConfirmed(pending, confirmed), true);
  assert.equal(tagConfirmed({ ...pending, epoch: 3 }, confirmed), false);
  assert.equal(tagConfirmed({ ...pending, track: 0 }, confirmed), false);
  assert.equal(tagConfirmed({ ...pending, answer: "Bird" }, confirmed), false);
  const identified = {
    ...confirmed,
    decisions: confirmed.decisions!.map((track) =>
      track.id === 2 ? { ...track, answer: "Bird" as const } : track,
    ),
  };
  assert.equal(tagConfirmed({ ...pending, answer: "Bird" }, identified), true);
  assert.equal(
    tagConfirmed({ ...pending, answer: "Drone group" }, identified),
    false,
  );
});
test("explicit phone track cues accept only nonnegative integer ids", () => {
  assert.equal(
    validControl({
      type: "control",
      control: "select-track",
      track: 50,
      epoch: 4,
    }),
    true,
  );
  for (const track of [-1, 1.5, Infinity, "2", null])
    assert.equal(
      validControl({
        type: "control",
        control: "select-track",
        track,
        epoch: 4,
      }),
      false,
    );
});
