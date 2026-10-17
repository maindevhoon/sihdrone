import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScenario, contactPosition, type ScenarioVersion } from './simulation';

// Captured from main before merging the physics branch: historical routes must not drift.
const fixtures = [
  {
    "scenario": {
      "version": 1,
      "exercise": "mixed",
      "seed": 7,
      "difficulty": "guided",
      "dusk": false,
      "duration": 45,
      "category": "Single drone",
      "count": 1,
      "arrival": 2.061958257574588,
      "speed": 0.9465361449168995,
      "altitude": 15.398057411424816,
      "shift": 0.10722634266130626
    },
    "positions": [
      [
        11.950320700213421,
        15.422138919122922,
        -7.336000950524919
      ]
    ]
  },
  {
    "scenario": {
      "version": 2,
      "exercise": "mixed",
      "seed": 7,
      "difficulty": "guided",
      "dusk": false,
      "duration": 45,
      "category": "Single drone",
      "count": 1,
      "arrival": 2.061958257574588,
      "speed": 0.817580114665907,
      "altitude": 17.935690183658153,
      "shift": 2.112719092518091,
      "pattern": "figure-eight",
      "heading": 2.9294260263752956,
      "spread": 2.471790520567447,
      "radius": 16.979930435540155,
      "phase": 4.585607432087171
    },
    "positions": [
      [
        6.3956344069116104,
        17.25825307787987,
        -8.564944500186822
      ]
    ]
  },
  {
    "scenario": {
      "version": 3,
      "exercise": "mixed",
      "seed": 7,
      "difficulty": "guided",
      "dusk": false,
      "duration": 45,
      "category": "Drone group",
      "count": 5,
      "arrival": 2.061958257574588,
      "speed": 0.817580114665907,
      "altitude": 17.935690183658153,
      "shift": 2.112719092518091,
      "pattern": "figure-eight",
      "heading": 2.9294260263752956,
      "spread": 2.471790520567447,
      "radius": 16.979930435540155,
      "phase": 4.585607432087171
    },
    "positions": [
      [
        3.9238438863441636,
        16.808253077879872,
        -9.553660708413801
      ],
      [
        6.3956344069116104,
        17.718014191139957,
        -8.564944500186822
      ],
      [
        8.867424927479057,
        18.827905608056998,
        -7.576228291959843
      ],
      [
        -5.603618560696087,
        20.953288024815347,
        -28.24529502753939
      ],
      [
        -3.1318280401286396,
        20.968243954026676,
        -27.256578819312416
      ]
    ]
  }
];
for (const {scenario, positions} of fixtures) {
  test(`scenario version ${scenario.version} retains its pre-merge generator and positions`, () => {
    const actual = createScenario('mixed', 7, 'guided', false, scenario.version as ScenarioVersion);
    assert.deepEqual(actual, scenario);
    assert.deepEqual(Array.from({length:actual.count}, (_, id) => contactPosition(actual, 17.25, id)), positions);
  });
}
