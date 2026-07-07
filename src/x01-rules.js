export const X01_STORAGE_VERSION = 1;

export const X01_FORMATS = {
  BEST_OF_LEGS: "best-of-legs",
  RACE_TO_LEGS: "race-to-legs",
  RACE_TO_SETS: "race-to-sets"
};

export function createX01Match(options = {}) {
  const now = new Date().toISOString();
  const settings = normalizeSettings(options);

  return {
    version: X01_STORAGE_VERSION,
    kind: "x01",
    status: "playing",
    settings,
    players: [
      createPlayer(options.playerNames?.[0] || "Player 1", settings),
      createPlayer(options.playerNames?.[1] || "Player 2", settings)
    ],
    activePlayerIndex: 0,
    legStarterIndex: 0,
    legNumber: 1,
    setNumber: 1,
    history: [],
    winnerIndex: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null
  };
}

export function applyX01Visit(match, visit) {
  if (match.status === "finished") {
    return clone(match);
  }

  const score = normalizeScore(visit.score);
  const darts = normalizeDarts(visit.darts);
  const before = snapshot(match);
  const next = clone(match);
  const player = next.players[next.activePlayerIndex];
  const createdAt = new Date().toISOString();
  const remainingBefore = player.remaining;
  let countedScore = 0;
  let bust = false;
  let checkout = false;
  let openedDoubleIn = false;
  let message = "";

  if (next.settings.doubleIn && !player.isIn) {
    if (score > 0 && visit.doubleInHit) {
      player.isIn = true;
      openedDoubleIn = true;
    } else {
      message = score > 0 ? "No score: double-in required" : "No score";
    }
  }

  if (!next.settings.doubleIn || player.isIn) {
    const proposedRemaining = remainingBefore - score;

    if (score > remainingBefore || proposedRemaining < 0 || proposedRemaining === 1) {
      bust = true;
      message = "Bust";
    } else if (proposedRemaining === 0) {
      checkout = true;
      countedScore = score;
      player.remaining = 0;
      player.bestOut = Math.max(player.bestOut, remainingBefore);
      message = `Checked out ${remainingBefore}`;
    } else {
      countedScore = score;
      player.remaining = proposedRemaining;
      message = countedScore > 0 ? `Scored ${countedScore}` : "No score";
    }
  }

  player.totalDarts += darts;
  player.totalScored += countedScore;
  player.highestScore = Math.max(player.highestScore, countedScore);

  next.history.push({
    id: createId(),
    playerIndex: next.activePlayerIndex,
    playerName: player.name,
    score,
    countedScore,
    darts,
    remainingBefore,
    remainingAfter: player.remaining,
    bust,
    checkout,
    openedDoubleIn,
    message,
    before,
    createdAt
  });

  if (checkout) {
    awardLeg(next, next.activePlayerIndex, createdAt);
  } else {
    next.activePlayerIndex = otherPlayer(next.activePlayerIndex);
  }

  next.updatedAt = createdAt;
  return next;
}

export function undoX01Visit(match) {
  if (!match.history.length) {
    return clone(match);
  }

  const history = match.history.slice(0, -1);
  const previous = match.history[match.history.length - 1].before;

  return {
    ...clone(match),
    ...clone(previous),
    history,
    updatedAt: new Date().toISOString()
  };
}

export function getX01Stats(player) {
  return {
    darts: player.totalDarts,
    average: player.totalDarts ? (player.totalScored / player.totalDarts) * 3 : 0,
    highestScore: player.highestScore,
    bestOut: player.bestOut
  };
}

export function getX01TargetLabel(match) {
  const target = match.settings.formatTarget;
  switch (match.settings.format) {
    case X01_FORMATS.BEST_OF_LEGS:
      return `Best of ${target} legs`;
    case X01_FORMATS.RACE_TO_SETS:
      return `Race to ${target} sets`;
    default:
      return `Race to ${target} legs`;
  }
}

function awardLeg(match, winnerIndex, completedAt) {
  const winner = match.players[winnerIndex];
  winner.legs += 1;

  if (matchIsWon(match, winnerIndex)) {
    match.status = "finished";
    match.winnerIndex = winnerIndex;
    match.completedAt = completedAt;
    return;
  }

  if (match.settings.format === X01_FORMATS.RACE_TO_SETS && winner.legs >= match.settings.legsPerSet) {
    winner.sets += 1;
    match.players.forEach((player) => {
      player.legs = 0;
    });

    if (winner.sets >= match.settings.formatTarget) {
      match.status = "finished";
      match.winnerIndex = winnerIndex;
      match.completedAt = completedAt;
      return;
    }

    match.setNumber += 1;
  }

  startNextLeg(match);
}

function startNextLeg(match) {
  match.legNumber += 1;
  match.legStarterIndex = otherPlayer(match.legStarterIndex);
  match.activePlayerIndex = match.legStarterIndex;

  match.players.forEach((player) => {
    player.remaining = match.settings.startScore;
    player.isIn = !match.settings.doubleIn;
  });
}

function matchIsWon(match, playerIndex) {
  const player = match.players[playerIndex];

  switch (match.settings.format) {
    case X01_FORMATS.BEST_OF_LEGS:
      return player.legs >= Math.floor(match.settings.formatTarget / 2) + 1;
    case X01_FORMATS.RACE_TO_SETS:
      return player.sets >= match.settings.formatTarget;
    default:
      return player.legs >= match.settings.formatTarget;
  }
}

function createPlayer(name, settings) {
  return {
    name: normalizeName(name),
    remaining: settings.startScore,
    isIn: !settings.doubleIn,
    legs: 0,
    sets: 0,
    totalDarts: 0,
    totalScored: 0,
    highestScore: 0,
    bestOut: 0
  };
}

function normalizeSettings(options) {
  const startScore = Number(options.startScore || 501);
  const format = Object.values(X01_FORMATS).includes(options.format) ? options.format : X01_FORMATS.BEST_OF_LEGS;
  const formatTarget = Math.max(1, Number(options.formatTarget || (format === X01_FORMATS.BEST_OF_LEGS ? 5 : 3)));
  const legsPerSet = Math.max(1, Number(options.legsPerSet || 3));

  return {
    startScore: Number.isInteger(startScore) && startScore > 1 ? startScore : 501,
    doubleIn: Boolean(options.doubleIn),
    format,
    formatTarget,
    legsPerSet
  };
}

function normalizeName(name) {
  const trimmed = String(name || "").trim();
  return trimmed || "Player";
}

function normalizeScore(score) {
  const value = Number(score);
  if (!Number.isInteger(value) || value < 0 || value > 180) {
    throw new Error("Score must be between 0 and 180.");
  }
  return value;
}

function normalizeDarts(darts) {
  const value = Number(darts);
  if (!Number.isInteger(value) || value < 1 || value > 3) {
    throw new Error("Darts must be 1, 2, or 3.");
  }
  return value;
}

function snapshot(match) {
  return {
    status: match.status,
    settings: clone(match.settings),
    players: clone(match.players),
    activePlayerIndex: match.activePlayerIndex,
    legStarterIndex: match.legStarterIndex,
    legNumber: match.legNumber,
    setNumber: match.setNumber,
    winnerIndex: match.winnerIndex,
    completedAt: match.completedAt
  };
}

function otherPlayer(index) {
  return index === 0 ? 1 : 0;
}

function createId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
