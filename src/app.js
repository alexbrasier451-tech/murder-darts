import {
  TARGETS,
  applyApplication,
  createMatch,
  generateApplications,
  labelForHit,
  summarizeTarget,
  targetIsClosed,
  targetIsOpenFor,
  undoLastDart
} from "./rules.js";

const STORAGE_KEY = "murder-darts-current-match";
const SEGMENTS = [
  { id: "single", label: "S" },
  { id: "double", label: "D" },
  { id: "treble", label: "T" }
];
const DISPLAY_TARGETS = [
  ...TARGETS.filter((target) => target.kind === "number").sort((left, right) => Number(right.id) - Number(left.id)),
  ...TARGETS.filter((target) => target.kind !== "number")
];
const NUMBER_BUTTONS = Array.from({ length: 20 }, (_, index) => 20 - index);

const app = document.querySelector("#app");

let match = loadMatch();
let selectedSegment = "single";
let pendingChoices = null;

render();
registerServiceWorker();

function render() {
  if (!match) {
    renderSetup();
    return;
  }

  renderMatch();
}

function renderSetup() {
  app.innerHTML = `
    <section class="setup-view">
      <div class="brand-lockup">
        <img class="brand-icon" src="./assets/icon.svg" alt="">
        <div>
          <p class="eyebrow">Darts scorer</p>
          <h1>Murder</h1>
        </div>
      </div>

      <form id="setup-form" class="setup-form">
        <label>
          <span>Team A</span>
          <input name="teamA" autocomplete="off" maxlength="24" value="Team A">
        </label>
        <label>
          <span>Team B</span>
          <input name="teamB" autocomplete="off" maxlength="24" value="Team B">
        </label>
        <button class="primary-action" type="submit">Start match</button>
      </form>
    </section>
  `;

  document.querySelector("#setup-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    match = createMatch([form.get("teamA"), form.get("teamB")]);
    saveMatch();
    render();
  });
}

function renderMatch() {
  const activeTeam = match.teams[match.activeTeamIndex];
  const recent = match.history.slice(-4).reverse();
  const latestEntry = match.history[match.history.length - 1] ?? null;
  const winner = match.status === "finished" ? getWinnerText() : null;
  const activeClass = teamClass(match.activeTeamIndex, "active");
  const resultClass =
    match.winnerIndex === null ? "draw-result" : teamClass(match.winnerIndex, "result");

  app.innerHTML = `
    <header class="topbar">
      <div>
        <p class="eyebrow">Turn ${match.turnNumber}</p>
        <h1>Murder</h1>
      </div>
      <div class="topbar-actions">
        <button class="ghost-action" data-action="undo" ${match.history.length ? "" : "disabled"}>Undo</button>
        <button class="ghost-action" data-action="new">New</button>
      </div>
    </header>

    <section class="scoreboard" aria-label="Scores">
      ${match.teams
        .map(
          (team, index) => `
            <article class="team-score ${teamClass(index, "score")} ${
              index === match.activeTeamIndex && match.status !== "finished" ? "is-active" : ""
            } ${latestEntry?.teamIndex === index && latestEntry.points > 0 ? "is-scored" : ""}">
              <span class="team-name">${escapeHtml(team.name)}</span>
              <strong>${team.score}</strong>
            </article>
          `
        )
        .join("")}
    </section>

    <section class="match-strip ${activeClass}" aria-label="Match status">
      ${renderMiniTeam(0)}
      <div class="mini-state">
        <span>${match.status === "finished" ? "Final" : `Turn ${match.turnNumber}`}</span>
        <strong>${match.status === "finished" ? "Match over" : `Dart ${match.dartInTurn}/3`}</strong>
      </div>
      ${renderMiniTeam(1)}
    </section>

    ${
      winner
        ? `
          <section class="result-band ${resultClass}">
            <div class="result-copy">
              <p class="eyebrow">Final</p>
              <h2>${escapeHtml(winner)}</h2>
              <div class="final-scoreline">
                <span>${escapeHtml(match.teams[0].name)} ${match.teams[0].score}</span>
                <span>${escapeHtml(match.teams[1].name)} ${match.teams[1].score}</span>
              </div>
            </div>
            <button class="primary-action" data-action="new">New match</button>
          </section>
        `
        : `
          <section class="turn-band ${activeClass}">
            <span>${escapeHtml(activeTeam.name)}</span>
            <strong>Dart ${match.dartInTurn} of 3</strong>
          </section>
        `
    }

    <section class="target-grid" aria-label="Targets">
      ${DISPLAY_TARGETS.map((target) => renderTarget(target)).join("")}
    </section>

    ${
      match.status === "finished"
        ? ""
        : `
          <section class="input-dock ${activeClass}" aria-label="Dart input">
            <div class="segment-control" role="group" aria-label="Segment">
              ${SEGMENTS.map(
                (segment) => `
                  <button class="${segment.id === selectedSegment ? "is-selected" : ""}" data-segment="${segment.id}" type="button">
                    ${segment.label}
                  </button>
                `
              ).join("")}
            </div>

            <div class="number-pad" aria-label="Numbers">
              ${NUMBER_BUTTONS.map((number) => `<button type="button" data-number="${number}">${number}</button>`).join("")}
            </div>

            <div class="special-pad">
              <button type="button" data-hit="single-bull">Single bull</button>
              <button type="button" data-hit="double-bull">Double bull</button>
              <button type="button" data-hit="miss">Miss</button>
            </div>
          </section>
        `
    }

    ${
      recent.length
        ? `
          <section class="history-strip" aria-label="Recent darts">
            ${recent.map((entry) => renderHistoryEntry(entry)).join("")}
          </section>
        `
        : ""
    }

    ${pendingChoices ? renderChoiceSheet() : ""}
  `;

  wireEvents();
}

function renderTarget(target) {
  const state = match.targets[target.id];
  const summary = summarizeTarget(match, target.id);
  const closed = targetIsClosed(match, target.id);
  const scoreable =
    match.status !== "finished" && !closed && targetIsOpenFor(match, target.id, match.activeTeamIndex);
  const classNames = [
    "target-card",
    closed ? "is-closed" : "",
    summary.teamAOpen && !closed ? "team-a-open" : "",
    summary.teamBOpen && !closed ? "team-b-open" : "",
    scoreable ? "is-scoreable" : "",
    scoreable ? teamClass(match.activeTeamIndex, "scoreable") : ""
  ]
    .filter(Boolean)
    .join(" ");

  return `
    <article class="${classNames}">
      <div class="target-head">
        <strong>${escapeHtml(target.label)}</strong>
        <span class="target-status">${escapeHtml(summary.label)}</span>
      </div>
      <div class="target-row ${teamRowClass(0)}">
        <span>${teamInitial(0)}</span>
        ${renderHitMarks(state.hits[0], 0, target.id)}
      </div>
      <div class="target-row ${teamRowClass(1)}">
        <span>${teamInitial(1)}</span>
        ${renderHitMarks(state.hits[1], 1, target.id)}
      </div>
    </article>
  `;
}

function teamRowClass(index) {
  const baseClass = index === 0 ? "team-a-row" : "team-b-row";
  if (match.status === "finished" || index !== match.activeTeamIndex) {
    return baseClass;
  }

  return `is-active-row ${baseClass}`;
}

function renderHitMarks(hits, teamIndex, targetId) {
  const teamClass = teamIndex === 0 ? "team-a-marks" : "team-b-marks";
  return `
    <span class="hit-marks ${teamClass}" aria-label="${hits} of 3 hits">
      ${[0, 1, 2]
        .map((index) => {
          const filled = index < hits;
          const newHit = filled && isNewHitMark(targetId, teamIndex, index, hits);
          return `<span class="hit-mark ${filled ? "is-filled" : ""} ${newHit ? "is-new" : ""}"></span>`;
        })
        .join("")}
    </span>
  `;
}

function renderMiniTeam(index) {
  const team = match.teams[index];
  return `
    <div class="mini-team ${teamClass(index, "mini")} ${
      index === match.activeTeamIndex && match.status !== "finished" ? "is-active" : ""
    }">
      <b>${teamInitial(index)}</b>
      <span>${escapeHtml(team.name)}</span>
      <strong>${team.score}</strong>
    </div>
  `;
}

function renderHistoryEntry(entry) {
  const points = entry.points ? `+${entry.points}` : "0";
  const target = entry.targetLabel ? escapeHtml(entry.targetLabel) : "No target";
  return `
    <article class="history-entry ${teamClass(entry.teamIndex, "history")}">
      <strong>${escapeHtml(entry.rawLabel)}</strong>
      <span>${target}</span>
      <b>${points}</b>
    </article>
  `;
}

function renderChoiceSheet() {
  return `
    <div class="choice-backdrop" data-action="cancel-choice">
      <section class="choice-sheet" role="dialog" aria-modal="true" aria-labelledby="choice-title">
        <div class="choice-head">
          <div>
            <p class="eyebrow">${escapeHtml(labelForHit(pendingChoices.hit))}</p>
            <h2 id="choice-title">Choose target</h2>
          </div>
          <button class="icon-action" type="button" data-action="cancel-choice" aria-label="Close">x</button>
        </div>
        <div class="choice-list">
          ${pendingChoices.applications
            .map(
              (application, index) => `
                <button type="button" data-choice="${index}">
                  <span>${escapeHtml(application.label)}</span>
                  <small>${escapeHtml(application.detail)}</small>
                </button>
              `
            )
            .join("")}
        </div>
      </section>
    </div>
  `;
}

function wireEvents() {
  document.querySelectorAll("[data-segment]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedSegment = button.dataset.segment;
      render();
    });
  });

  document.querySelectorAll("[data-number]").forEach((button) => {
    button.addEventListener("click", () => {
      handleHit({
        segment: selectedSegment,
        number: Number(button.dataset.number)
      });
    });
  });

  document.querySelectorAll("[data-hit]").forEach((button) => {
    button.addEventListener("click", () => {
      const hit = button.dataset.hit === "miss" ? { segment: "miss" } : { segment: button.dataset.hit };
      handleHit(hit);
    });
  });

  document.querySelectorAll("[data-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      const application = pendingChoices.applications[Number(button.dataset.choice)];
      applyChoice(application);
    });
  });

  document.querySelectorAll("[data-action='undo']").forEach((button) => {
    button.addEventListener("click", () => {
      match = undoLastDart(match);
      pendingChoices = null;
      saveMatch();
      render();
    });
  });

  document.querySelectorAll("[data-action='new']").forEach((button) => {
    button.addEventListener("click", () => {
      if (!match.history.length || match.status === "finished" || confirm("Start a new match?")) {
        match = null;
        pendingChoices = null;
        localStorage.removeItem(STORAGE_KEY);
        render();
      }
    });
  });

  document.querySelectorAll("[data-action='cancel-choice']").forEach((element) => {
    element.addEventListener("click", (event) => {
      if (event.target === element || element.matches("button")) {
        pendingChoices = null;
        render();
      }
    });
  });
}

function handleHit(hit) {
  const applications = generateApplications(match, hit);

  if (applications.length === 1) {
    applyChoice(applications[0]);
    return;
  }

  pendingChoices = {
    hit,
    applications
  };
  render();
}

function applyChoice(application) {
  match = applyApplication(match, application);
  pendingChoices = null;
  saveMatch();
  render();
}

function getWinnerText() {
  if (match.winnerIndex === null) {
    return "Draw match";
  }

  return `${match.teams[match.winnerIndex].name} wins`;
}

function teamClass(index, suffix) {
  return `${index === 0 ? "team-a" : "team-b"}-${suffix}`;
}

function isNewHitMark(targetId, teamIndex, markIndex, currentHits) {
  const latestEntry = match.history[match.history.length - 1];
  if (
    !latestEntry ||
    latestEntry.targetId !== targetId ||
    latestEntry.teamIndex !== teamIndex ||
    latestEntry.hitCount <= 0
  ) {
    return false;
  }

  const previousHits = latestEntry.before.targets[targetId]?.hits?.[teamIndex] ?? 0;
  return markIndex >= previousHits && markIndex < currentHits;
}

function teamInitial(index) {
  const name = match.teams[index].name.trim();
  if (/^team\s+a$/i.test(name)) {
    return "A";
  }
  if (/^team\s+b$/i.test(name)) {
    return "B";
  }
  return escapeHtml(name ? name[0].toUpperCase() : index === 0 ? "A" : "B");
}

function loadMatch() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function saveMatch() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(match));
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js");
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

