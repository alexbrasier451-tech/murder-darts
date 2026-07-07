import test from "node:test";
import assert from "node:assert/strict";

import {
  TARGET_IDS,
  applyApplication,
  createMatch,
  generateApplications,
  targetIsClosed,
  targetIsOpenFor,
  undoLastDart
} from "../src/rules.js";

test("opens a number with singles, doubles as two number hits, or trebles as three number hits", () => {
  let match = createMatch();
  match = applyChoice(match, { segment: "single", number: 20 }, "20", 1);
  match = applyChoice(match, { segment: "single", number: 20 }, "20", 1);
  match = applyChoice(match, { segment: "single", number: 20 }, "20", 1);
  assert.equal(targetIsOpenFor(match, "20", 0), true);

  match = createMatch();
  match = applyChoice(match, { segment: "double", number: 19 }, "19", 2);
  match = applyChoice(match, { segment: "single", number: 19 }, "19", 1);
  assert.equal(targetIsOpenFor(match, "19", 0), true);

  match = createMatch();
  match = applyChoice(match, { segment: "treble", number: 18 }, "18", 3);
  assert.equal(targetIsOpenFor(match, "18", 0), true);
});

test("lets T20 target either 20 as three hits or Trebles as one hit", () => {
  const match = createMatch();
  const applications = generateApplications(match, { segment: "treble", number: 20 });

  assert.deepEqual(
    applications.map((application) => [application.targetId, application.hitCount]),
    [
      ["20", 3],
      ["Trebles", 1]
    ]
  );
});

test("lets D20 target either 20 as two hits or Doubles as one hit", () => {
  const match = createMatch();
  const applications = generateApplications(match, { segment: "double", number: 20 });

  assert.deepEqual(
    applications.map((application) => [application.targetId, application.hitCount]),
    [
      ["20", 2],
      ["Doubles", 1]
    ]
  );
});

test("does not score on the dart that opens a target", () => {
  let match = createMatch();
  match.targets["20"].hits[0] = 2;

  match = applyChoice(match, { segment: "single", number: 20 }, "20", 1);

  assert.equal(targetIsOpenFor(match, "20", 0), true);
  assert.equal(match.teams[0].score, 0);
});

test("scores board value on already open numbers, rings, and bulls", () => {
  let match = createMatch();
  match.targets["20"].hits[0] = 3;
  match = applyChoice(match, { segment: "treble", number: 20 }, "20", 0);
  assert.equal(match.teams[0].score, 60);

  match = createMatch();
  match.targets.Doubles.hits[0] = 3;
  match = applyChoice(match, { segment: "double", number: 20 }, "Doubles", 0);
  assert.equal(match.teams[0].score, 40);

  match = createMatch();
  match.targets.Trebles.hits[0] = 3;
  match = applyChoice(match, { segment: "treble", number: 19 }, "Trebles", 0);
  assert.equal(match.teams[0].score, 57);

  match = createMatch();
  match.targets.Bulls.hits[0] = 3;
  match = applyChoice(match, { segment: "double-bull" }, "Bulls", 0);
  assert.equal(match.teams[0].score, 50);
});

test("closes a target when both teams reach three hits", () => {
  let match = createMatch();
  match.activeTeamIndex = 1;
  match.targets["20"].hits = [3, 1];

  match = applyChoice(match, { segment: "double", number: 20 }, "20", 2);

  assert.equal(targetIsClosed(match, "20"), true);
  assert.equal(match.teams[1].score, 0);
});

test("does not score after a target is closed", () => {
  let match = createMatch();
  match.targets["20"].hits = [3, 3];

  match = applyChoice(match, { segment: "treble", number: 20 }, "20", 0);

  assert.equal(match.teams[0].score, 0);
  assert.deepEqual(match.targets["20"].hits, [3, 3]);
});

test("advances turns after three darts", () => {
  let match = createMatch();
  match = applyFirst(match, { segment: "miss" });
  assert.equal(match.activeTeamIndex, 0);
  assert.equal(match.dartInTurn, 2);

  match = applyFirst(match, { segment: "miss" });
  assert.equal(match.activeTeamIndex, 0);
  assert.equal(match.dartInTurn, 3);

  match = applyFirst(match, { segment: "miss" });
  assert.equal(match.activeTeamIndex, 1);
  assert.equal(match.turnNumber, 2);
  assert.equal(match.dartInTurn, 1);
});

test("undo restores score, hits, active team, dart count, and status", () => {
  let match = createMatch();
  match.targets["20"].hits[0] = 3;
  match = applyChoice(match, { segment: "treble", number: 20 }, "20", 0);

  assert.equal(match.teams[0].score, 60);
  assert.equal(match.dartInTurn, 2);

  match = undoLastDart(match);

  assert.equal(match.teams[0].score, 0);
  assert.deepEqual(match.targets["20"].hits, [3, 0]);
  assert.equal(match.activeTeamIndex, 0);
  assert.equal(match.dartInTurn, 1);
  assert.equal(match.status, "playing");
});

test("ends the match when all targets are closed", () => {
  let match = createMatch();
  for (const targetId of TARGET_IDS) {
    match.targets[targetId].hits = [3, 3];
  }
  match.targets.Bulls.hits = [3, 1];
  match.activeTeamIndex = 1;

  match = applyChoice(match, { segment: "double-bull" }, "Bulls", 2);

  assert.equal(match.status, "finished");
  assert.equal(targetIsClosed(match, "Bulls"), true);
});

function applyFirst(match, hit) {
  const application = generateApplications(match, hit)[0];
  return applyApplication(match, application);
}

function applyChoice(match, hit, targetId, hitCount) {
  const applications = generateApplications(match, hit);
  const application = applications.find(
    (candidate) => candidate.targetId === targetId && candidate.hitCount === hitCount
  );

  assert.ok(
    application,
    `Expected application for ${JSON.stringify(hit)} target=${targetId} hits=${hitCount}; got ${applications
      .map((candidate) => `${candidate.targetId}:${candidate.hitCount}`)
      .join(", ")}`
  );

  return applyApplication(match, application);
}