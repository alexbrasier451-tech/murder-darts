export const X01_STORAGE_VERSION = 2;

export const X01_FORMATS = {
  BEST_OF_LEGS: "best-of-legs",
  RACE_TO_LEGS: "race-to-legs",
  RACE_TO_SETS: "race-to-sets"
};

const X01_BOGEY_CHECKOUTS = new Set([159, 162, 163, 165, 166, 168, 169]);

export function createX01Match(options = {}) {
  const now = new Date().toISOString();
  const settings = normalizeSettings(options);

  return {
    version: X01_STORAGE_VERSION,
    id: options.id || createId(),
    kind: "x01",
    status: "playing",
    settings,
    players: [
      createPlayer(options.playerNames?.[0] || "Player 1", settings, options.playerIds?.[0]),
      createPlayer(options.playerNames?.[1] || "Player 2", settings, options.playerIds?.[1])
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
  const wasDoubleInComplete = !next.settings.doubleIn || Boolean(player.doubleInComplete);
  let countedScore = 0;
  let bust = false;
  let checkout = false;
  let message = "";


  const proposedRemaining = remainingBefore - score;

  const bogeyCheckout = proposedRemaining === 0 && isBogeyCheckout(remainingBefore);

  if (score > remainingBefore || proposedRemaining < 0 || proposedRemaining === 1 || bogeyCheckout) {
    bust = true;
    message = bogeyCheckout ? `Bogey ${remainingBefore}` : "Bust";
  } else if (proposedRemaining === 0) {
    checkout = true;
    countedScore = score;
    player.remaining = 0;
    player.bestOut = Math.max(Number(player.bestOut || 0), remainingBefore);
    message = `Checked out ${remainingBefore}`;
  } else {
    countedScore = score;
    player.remaining = proposedRemaining;
    message = countedScore > 0 ? `Scored ${countedScore}` : "No score";
  }

  const doubleInHit = Boolean(next.settings.doubleIn && !wasDoubleInComplete && countedScore > 0);

  player.totalDarts = Number(player.totalDarts || 0) + darts;
  player.totalScored = Number(player.totalScored || 0) + countedScore;
  player.highestScore = Math.max(Number(player.highestScore || 0), countedScore);
  player.doubleInHits = Number(player.doubleInHits || 0) + (doubleInHit ? 1 : 0);
  player.doubleInComplete = wasDoubleInComplete || doubleInHit;

  next.history.push({
    id: createId(),
    playerIndex: next.activePlayerIndex,
    playerName: player.name,
    score,
    countedScore,
    darts,
    doubleInHit,
    remainingBefore,
    remainingAfter: player.remaining,
    bust,
    checkout,
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
    darts: Number(player.totalDarts || 0),
    average: player.totalDarts ? (player.totalScored / player.totalDarts) * 3 : 0,
    highestScore: Number(player.highestScore || 0),
    bestOut: Number(player.bestOut || 0),
    doubleInHits: Number(player.doubleInHits || 0)
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
    player.doubleInComplete = !match.settings.doubleIn;
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

function createPlayer(name, settings, playerId) {
  return {
    playerId: playerId || null,
    name: normalizeName(name),
    remaining: settings.startScore,
    legs: 0,
    sets: 0,
    totalDarts: 0,
    totalScored: 0,
    highestScore: 0,
    bestOut: 0,
    doubleInHits: 0,
    doubleInComplete: !settings.doubleIn
  };
}

function normalizeSettings(options) {
  const startScore = Number(options.startScore || 501);
  const format = Object.values(X01_FORMATS).includes(options.format) ? options.format : X01_FORMATS.BEST_OF_LEGS;
  const formatTarget = Math.max(1, Number(options.formatTarget || (format === X01_FORMATS.BEST_OF_LEGS ? 5 : 3)));
  const legsPerSet = Math.max(1, Number(options.legsPerSet || 3));

  return {
    startScore: Number.isInteger(startScore) && startScore > 1 ? startScore : 501,
    format,
    formatTarget,
    legsPerSet,
    doubleIn: Boolean(options.doubleIn)
  };
}

function isBogeyCheckout(score) {
  return score > 170 || X01_BOGEY_CHECKOUTS.has(score);
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
