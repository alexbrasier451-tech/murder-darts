export const TEAM_A = 0;
export const TEAM_B = 1;
export const DARTS_PER_TURN = 3;
export const STORAGE_VERSION = 1;

export const TARGETS = [
  ...Array.from({ length: 20 }, (_, index) => {
    const value = index + 1;
    return {
      id: String(value),
      label: String(value),
      sort: value,
      kind: "number"
    };
  }),
  { id: "Doubles", label: "Doubles", sort: 21, kind: "ring" },
  { id: "Trebles", label: "Trebles", sort: 22, kind: "ring" },
  { id: "Bulls", label: "Bulls", sort: 23, kind: "bull" }
];

export const TARGET_IDS = TARGETS.map((target) => target.id);

const TARGET_BY_ID = new Map(TARGETS.map((target) => [target.id, target]));

/**
 * @typedef {{ name: string, score: number }} Team
 * @typedef {{ hits: [number, number] }} TargetState
 * @typedef {"playing" | "finished"} MatchStatus
 * @typedef {{
 *   version: number,
 *   status: MatchStatus,
 *   teams: [Team, Team],
 *   activeTeamIndex: 0 | 1,
 *   turnNumber: number,
 *   dartInTurn: number,
 *   targets: Record<string, TargetState>,
 *   history: DartEntry[],
 *   winnerIndex: 0 | 1 | null,
 *   createdAt: string,
 *   updatedAt: string,
 *   completedAt: string | null
 * }} Match
 * @typedef {{ segment: "miss" } | { segment: "single" | "double" | "treble", number: number } | { segment: "single-bull" | "double-bull" }} DartHit
 * @typedef {{
 *   id: string,
 *   rawHit: DartHit,
 *   rawLabel: string,
 *   targetId: string | null,
 *   targetLabel: string,
 *   hitCount: number,
 *   boardValue: number,
 *   points: number,
 *   opensTarget: boolean,
 *   closesTarget: boolean,
 *   targetWasOpen: boolean,
 *   targetWasClosed: boolean,
 *   label: string,
 *   detail: string
 * }} DartApplication
 * @typedef {{
 *   id: string,
 *   teamIndex: 0 | 1,
 *   teamName: string,
 *   turnNumber: number,
 *   dartInTurn: number,
 *   rawLabel: string,
 *   targetId: string | null,
 *   targetLabel: string,
 *   hitCount: number,
 *   points: number,
 *   before: MatchSnapshot,
 *   createdAt: string
 * }} DartEntry
 * @typedef {{
 *   status: MatchStatus,
 *   teams: [Team, Team],
 *   activeTeamIndex: 0 | 1,
 *   turnNumber: number,
 *   dartInTurn: number,
 *   targets: Record<string, TargetState>,
 *   winnerIndex: 0 | 1 | null,
 *   completedAt: string | null
 * }} MatchSnapshot
 */

export function createMatch(teamNames = ["Team A", "Team B"]) {
  const now = new Date().toISOString();
  return {
    version: STORAGE_VERSION,
    status: "playing",
    teams: [
      { name: normalizeTeamName(teamNames[0], "Team A"), score: 0 },
      { name: normalizeTeamName(teamNames[1], "Team B"), score: 0 }
    ],
    activeTeamIndex: TEAM_A,
    turnNumber: 1,
    dartInTurn: 1,
    targets: createTargetStates(),
    history: [],
    winnerIndex: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null
  };
}

export function createTargetStates() {
  return Object.fromEntries(TARGETS.map((target) => [target.id, { hits: [0, 0] }]));
}

export function generateApplications(match, hit) {
  const normalizedHit = normalizeHit(hit);
  const rawLabel = labelForHit(normalizedHit);

  if (normalizedHit.segment === "miss") {
    return [
      {
        id: "miss",
        rawHit: normalizedHit,
        rawLabel,
        targetId: null,
        targetLabel: "No target",
        hitCount: 0,
        boardValue: 0,
        points: 0,
        opensTarget: false,
        closesTarget: false,
        targetWasOpen: false,
        targetWasClosed: false,
        label: "Miss",
        detail: "No hits or points"
      }
    ];
  }

  return candidatesForHit(normalizedHit).flatMap((candidate) =>
    applicationsForCandidate(match, normalizedHit, rawLabel, candidate)
  );
}

export function applyApplication(match, application) {
  if (match.status === "finished") {
    return cloneMatch(match);
  }

  const before = snapshotMatch(match);
  const next = cloneMatch(match);
  const activeTeamIndex = match.activeTeamIndex;
  const createdAt = new Date().toISOString();
  let appliedHits = 0;
  let points = 0;

  if (application.targetId && isKnownTarget(application.targetId)) {
    const wasClosed = targetIsClosed(match, application.targetId);

    if (!wasClosed) {
      const wasOpen = targetIsOpenFor(match, application.targetId, activeTeamIndex);
      const target = next.targets[application.targetId];
      appliedHits = application.hitCount;

      if (wasOpen) {
        points = application.boardValue;
        next.teams[activeTeamIndex].score += points;
      }

      target.hits[activeTeamIndex] = clampHits(target.hits[activeTeamIndex] + appliedHits);
    }
  }

  next.history.push({
    id: createId(),
    teamIndex: activeTeamIndex,
    teamName: match.teams[activeTeamIndex].name,
    turnNumber: match.turnNumber,
    dartInTurn: match.dartInTurn,
    rawLabel: application.rawLabel,
    targetId: application.targetId,
    targetLabel: application.targetLabel,
    hitCount: appliedHits,
    points,
    before,
    createdAt
  });

  if (allTargetsClosed(next)) {
    next.status = "finished";
    next.winnerIndex = getWinnerIndex(next);
    next.completedAt = createdAt;
  } else if (match.dartInTurn >= DARTS_PER_TURN) {
    next.activeTeamIndex = /** @type {0 | 1} */ (activeTeamIndex === TEAM_A ? TEAM_B : TEAM_A);
    next.dartInTurn = 1;
    next.turnNumber += 1;
  } else {
    next.dartInTurn += 1;
  }

  next.updatedAt = createdAt;
  return next;
}

export function undoLastDart(match) {
  if (!match.history.length) {
    return cloneMatch(match);
  }

  const history = match.history.slice(0, -1);
  const previous = match.history[match.history.length - 1].before;
  return {
    ...cloneMatch(match),
    status: previous.status,
    teams: clone(previous.teams),
    activeTeamIndex: previous.activeTeamIndex,
    turnNumber: previous.turnNumber,
    dartInTurn: previous.dartInTurn,
    targets: clone(previous.targets),
    history,
    winnerIndex: previous.winnerIndex,
    completedAt: previous.completedAt,
    updatedAt: new Date().toISOString()
  };
}

export function targetIsOpenFor(match, targetId, teamIndex) {
  return getTargetState(match, targetId).hits[teamIndex] >= 3;
}

export function targetIsClosed(match, targetId) {
  const hits = getTargetState(match, targetId).hits;
  return hits[TEAM_A] >= 3 && hits[TEAM_B] >= 3;
}

export function allTargetsClosed(match) {
  return TARGET_IDS.every((targetId) => targetIsClosed(match, targetId));
}

export function getTarget(targetId) {
  return TARGET_BY_ID.get(targetId) ?? null;
}

export function getTargetState(match, targetId) {
  if (!isKnownTarget(targetId) || !match.targets[targetId]) {
    throw new Error(`Unknown target: ${targetId}`);
  }

  return match.targets[targetId];
}

export function getWinnerIndex(match) {
  const [teamA, teamB] = match.teams;
  if (teamA.score === teamB.score) {
    return null;
  }

  return teamA.score > teamB.score ? TEAM_A : TEAM_B;
}

export function labelForHit(hit) {
  switch (hit.segment) {
    case "miss":
      return "Miss";
    case "single":
      return `S${hit.number}`;
    case "double":
      return `D${hit.number}`;
    case "treble":
      return `T${hit.number}`;
    case "single-bull":
      return "SB";
    case "double-bull":
      return "DB";
    default:
      return "Unknown";
  }
}

export function summarizeTarget(match, targetId) {
  const target = getTarget(targetId);
  const state = getTargetState(match, targetId);
  const teamAOpen = state.hits[TEAM_A] >= 3;
  const teamBOpen = state.hits[TEAM_B] >= 3;

  if (teamAOpen && teamBOpen) {
    return {
      label: "Closed",
      closed: true,
      teamAOpen,
      teamBOpen
    };
  }

  if (teamAOpen) {
    return {
      label: `${match.teams[TEAM_A].name} open`,
      closed: false,
      teamAOpen,
      teamBOpen
    };
  }

  if (teamBOpen) {
    return {
      label: `${match.teams[TEAM_B].name} open`,
      closed: false,
      teamAOpen,
      teamBOpen
    };
  }

  return {
    label: target?.kind === "number" ? "Live" : "Live",
    closed: false,
    teamAOpen,
    teamBOpen
  };
}

function normalizeTeamName(name, fallback) {
  const trimmed = String(name ?? "").trim();
  return trimmed || fallback;
}

function applicationsForCandidate(match, rawHit, rawLabel, candidate) {
  const targetId = candidate.targetId;
  const target = getTarget(targetId);
  const activeTeamIndex = match.activeTeamIndex;
  const activeHits = getTargetState(match, targetId).hits[activeTeamIndex];
  const otherTeamIndex = activeTeamIndex === TEAM_A ? TEAM_B : TEAM_A;
  const otherHits = getTargetState(match, targetId).hits[otherTeamIndex];
  const targetWasOpen = activeHits >= 3;
  const targetWasClosed = activeHits >= 3 && otherHits >= 3;

  if (targetWasClosed) {
    return [
      makeApplication({
        rawHit,
        rawLabel,
        targetId,
        targetLabel: target?.label ?? targetId,
        hitCount: 0,
        boardValue: candidate.boardValue,
        points: 0,
        opensTarget: false,
        closesTarget: false,
        targetWasOpen,
        targetWasClosed,
        label: `${target?.label ?? targetId} is closed`,
        detail: "No hits or points"
      })
    ];
  }

  if (targetWasOpen) {
    return [
      makeApplication({
        rawHit,
        rawLabel,
        targetId,
        targetLabel: target?.label ?? targetId,
        hitCount: 0,
        boardValue: candidate.boardValue,
        points: candidate.boardValue,
        opensTarget: false,
        closesTarget: false,
        targetWasOpen,
        targetWasClosed,
        label: `Score ${candidate.boardValue} on ${target?.label ?? targetId}`,
        detail: `${rawLabel} scores board value`
      })
    ];
  }

  return candidate.allowedHits.map((hitCount) => {
    const nextHits = clampHits(activeHits + hitCount);
    const opensTarget = activeHits < 3 && nextHits >= 3;
    const closesTarget = opensTarget && otherHits >= 3;
    const hitWord = hitCount === 1 ? "hit" : "hits";
    const targetLabel = target?.label ?? targetId;
    const suffix = closesTarget ? " and closes" : opensTarget ? " and opens" : "";

    return makeApplication({
      rawHit,
      rawLabel,
      targetId,
      targetLabel,
      hitCount,
      boardValue: candidate.boardValue,
      points: 0,
      opensTarget,
      closesTarget,
      targetWasOpen,
      targetWasClosed,
      label: `${targetLabel}: ${hitCount} ${hitWord}`,
      detail: `${rawLabel}${suffix}`
    });
  });
}

function candidatesForHit(hit) {
  switch (hit.segment) {
    case "single":
      return [
        {
          targetId: String(hit.number),
          allowedHits: [1],
          boardValue: hit.number
        }
      ];
    case "double":
      return [
        {
          targetId: String(hit.number),
          allowedHits: [2],
          boardValue: hit.number * 2
        },
        {
          targetId: "Doubles",
          allowedHits: [1],
          boardValue: hit.number * 2
        }
      ];
    case "treble":
      return [
        {
          targetId: String(hit.number),
          allowedHits: [3],
          boardValue: hit.number * 3
        },
        {
          targetId: "Trebles",
          allowedHits: [1],
          boardValue: hit.number * 3
        }
      ];
    case "single-bull":
      return [
        {
          targetId: "Bulls",
          allowedHits: [1],
          boardValue: 25
        }
      ];
    case "double-bull":
      return [
        {
          targetId: "Bulls",
          allowedHits: [2],
          boardValue: 50
        }
      ];
    default:
      return [];
  }
}

function makeApplication(application) {
  return {
    ...application,
    id: `${labelForHit(application.rawHit)}:${application.targetId ?? "none"}:${application.hitCount}`
  };
}

function normalizeHit(hit) {
  if (!hit || hit.segment === "miss") {
    return { segment: "miss" };
  }

  if (hit.segment === "single-bull" || hit.segment === "double-bull") {
    return { segment: hit.segment };
  }

  const number = Number(hit.number);
  if (!Number.isInteger(number) || number < 1 || number > 20) {
    throw new Error(`Invalid dart number: ${hit.number}`);
  }

  if (!["single", "double", "treble"].includes(hit.segment)) {
    throw new Error(`Invalid dart segment: ${hit.segment}`);
  }

  return {
    segment: hit.segment,
    number
  };
}

function snapshotMatch(match) {
  return {
    status: match.status,
    teams: clone(match.teams),
    activeTeamIndex: match.activeTeamIndex,
    turnNumber: match.turnNumber,
    dartInTurn: match.dartInTurn,
    targets: clone(match.targets),
    winnerIndex: match.winnerIndex,
    completedAt: match.completedAt
  };
}

function createId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function cloneMatch(match) {
  return clone(match);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clampHits(value) {
  return Math.max(0, Math.min(3, value));
}

function isKnownTarget(targetId) {
  return TARGET_BY_ID.has(targetId);
}

