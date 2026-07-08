import assert from "node:assert/strict";
import test from "node:test";
import {
  X01_FORMATS,
  applyX01Visit,
  createX01Match,
  getX01Stats,
  undoX01Visit
} from "../src/x01-rules.js";

test("scores visits, advances player, and calculates 3 dart average", () => {
  let match = createX01Match({ playerNames: ["A", "B"], startScore: 501 });

  match = applyX01Visit(match, { score: 100, darts: 3 });

  assert.equal(match.players[0].remaining, 401);
  assert.equal(match.activePlayerIndex, 1);
  assert.equal(match.players[0].highestScore, 100);
  assert.equal(getX01Stats(match.players[0]).average, 100);
});


test("double-in marker is inferred from first positive visit in each leg", () => {
  let match = createX01Match({ playerNames: ["A", "B"], startScore: 501, doubleIn: true });

  match = applyX01Visit(match, { score: 0, darts: 3 });
  assert.equal(match.players[0].remaining, 501);
  assert.equal(match.history[0].doubleInHit, false);
  assert.equal(getX01Stats(match.players[0]).doubleInHits, 0);

  match = applyX01Visit(match, { score: 45, darts: 3 });
  assert.equal(match.players[1].remaining, 456);
  assert.equal(match.history[1].doubleInHit, true);
  assert.equal(getX01Stats(match.players[1]).doubleInHits, 1);

  match = applyX01Visit(match, { score: 60, darts: 3 });
  assert.equal(match.players[0].remaining, 441);
  assert.equal(match.history[2].doubleInHit, true);
  assert.equal(getX01Stats(match.players[0]).doubleInHits, 1);

  match = applyX01Visit(match, { score: 20, darts: 3 });
  assert.equal(match.history[3].doubleInHit, false);
  assert.equal(getX01Stats(match.players[1]).doubleInHits, 1);
});

test("busts when the score exceeds the remaining total or leaves one", () => {
  let match = createX01Match({ playerNames: ["A", "B"], startScore: 101 });

  match = applyX01Visit(match, { score: 100, darts: 2 });

  assert.equal(match.players[0].remaining, 101);
  assert.equal(match.players[0].totalDarts, 2);
  assert.equal(match.players[0].totalScored, 0);
  assert.equal(match.history[0].bust, true);

  match = applyX01Visit(match, { score: 102, darts: 2 });

  assert.equal(match.players[1].remaining, 101);
  assert.equal(match.players[1].totalScored, 0);
  assert.equal(match.history[1].bust, true);
});

test("exact checkout records best out", () => {
  let match = createX01Match({
    playerNames: ["A", "B"],
    startScore: 101,
    format: X01_FORMATS.RACE_TO_LEGS,
    formatTarget: 1
  });

  match = applyX01Visit(match, { score: 101, darts: 2 });

  assert.equal(match.status, "finished");
  assert.equal(match.winnerIndex, 0);
  assert.equal(match.players[0].bestOut, 101);
});


test("bogey numbers cannot be checked out", () => {
  let match = createX01Match({
    playerNames: ["A", "B"],
    startScore: 159,
    format: X01_FORMATS.RACE_TO_LEGS,
    formatTarget: 1
  });

  match = applyX01Visit(match, { score: 159, darts: 3 });

  assert.equal(match.status, "playing");
  assert.equal(match.players[0].remaining, 159);
  assert.equal(match.players[0].totalDarts, 3);
  assert.equal(match.players[0].totalScored, 0);
  assert.equal(match.players[0].bestOut, 0);
  assert.equal(match.history[0].bust, true);
  assert.equal(match.history[0].checkout, false);
  assert.equal(match.history[0].message, "Bogey 159");
  assert.equal(match.activePlayerIndex, 1);
});

test("race to sets awards sets and finishes at the target", () => {
  let match = createX01Match({
    playerNames: ["A", "B"],
    startScore: 2,
    format: X01_FORMATS.RACE_TO_SETS,
    formatTarget: 2,
    legsPerSet: 1
  });

  match = applyX01Visit(match, { score: 2, darts: 1 });
  assert.equal(match.players[0].sets, 1);
  assert.equal(match.status, "playing");

  match = applyX01Visit(match, { score: 2, darts: 1 });
  assert.equal(match.players[1].sets, 1);
  assert.equal(match.status, "playing");

  match = applyX01Visit(match, { score: 2, darts: 1 });
  assert.equal(match.players[0].sets, 2);
  assert.equal(match.status, "finished");
  assert.equal(match.winnerIndex, 0);
});

test("undo restores score, active player, stats, and history", () => {
  let match = createX01Match({ playerNames: ["A", "B"], startScore: 501 });

  match = applyX01Visit(match, { score: 60, darts: 3 });
  match = undoX01Visit(match);

  assert.equal(match.players[0].remaining, 501);
  assert.equal(match.players[0].totalDarts, 0);
  assert.equal(match.activePlayerIndex, 0);
  assert.equal(match.history.length, 0);
});
