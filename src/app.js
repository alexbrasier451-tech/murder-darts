import {
  TARGETS,
  applyApplication,
  createMatch as createMurderMatch,
  generateApplications,
  labelForHit,
  summarizeTarget,
  targetIsClosed,
  targetIsOpenFor,
  undoLastDart
} from "./rules.js";
import {
  X01_FORMATS,
  applyX01Visit,
  createX01Match,
  getX01Stats,
  getX01TargetLabel,
  undoX01Visit
} from "./x01-rules.js";

const MURDER_STORAGE_KEY = "murder-darts-current-match";
const X01_STORAGE_KEY = "darts-x01-current-match";
const PLAYERS_STORAGE_KEY = "darts-stored-players";
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
const QUICK_X01_SCORES = [26, 41, 45, 60, 81, 100, 121, 140, 180];
const X01_ONE_DART_SCORES = buildOneDartScores();
const X01_TWO_DART_SCORES = buildTwoDartScores(X01_ONE_DART_SCORES);

const app = document.querySelector("#app");

let view = "menu";
let players = loadPlayers();
let murderMatch = loadJson(MURDER_STORAGE_KEY);
let x01Match = loadJson(X01_STORAGE_KEY);
let selectedSegment = "single";
let pendingChoices = null;
let pendingX01Checkout = null;

render();
registerServiceWorker();

function render() {
  switch (view) {
    case "players":
      renderPlayers();
      return;
    case "murder-setup":
      renderMurderSetup();
      return;
    case "murder-match":
      murderMatch ? renderMurderMatch() : renderMurderSetup();
      return;
    case "x01-setup":
      renderX01Setup();
      return;
    case "x01-match":
      x01Match ? renderX01Match() : renderX01Setup();
      return;
    default:
      renderMenu();
  }
}

function renderMenu() {
  app.innerHTML = `
    <section class="menu-view">
      <div class="brand-lockup">
        <img class="brand-icon" src="./assets/icon.svg" alt="">
        <div>
          <p class="eyebrow">Darts scorer</p>
          <h1>Darts Night</h1>
        </div>
      </div>

      <section class="menu-grid" aria-label="Main menu">
        ${x01Match ? renderMenuCard("resume-x01", "Resume X01", `${activeName(x01Match)} to throw`) : ""}
        ${murderMatch ? renderMenuCard("resume-murder", "Resume Murder", `${activeName(murderMatch)} to throw`) : ""}
        ${renderMenuCard("show-x01-setup", "New X01", "501, 301, legs and sets")}
        ${renderMenuCard("show-murder-setup", "New Murder", "Open, score, close")}
        ${renderMenuCard("players", "Players", `${players.length} stored`)}
      </section>
    </section>
  `;

  wireNavigation();
}

function renderMenuCard(action, title, detail) {
  return `
    <button class="menu-card" type="button" data-action="${action}">
      <span>${escapeHtml(title)}</span>
      <small>${escapeHtml(detail)}</small>
    </button>
  `;
}

function renderPlayers() {
  app.innerHTML = `
    ${renderTopbar("Players", "Stored names", [
      ["menu", "Menu"]
    ])}

    <form id="add-player-form" class="setup-form compact-form">
      <label>
        <span>Add player</span>
        <input name="playerName" autocomplete="off" maxlength="32" placeholder="Player name">
      </label>
      <button class="primary-action" type="submit">Add player</button>
    </form>

    <section class="player-list" aria-label="Stored players">
      ${
        players.length
          ? players.map((player) => renderPlayerEditor(player)).join("")
          : `<article class="empty-panel">No players stored yet.</article>`
      }
    </section>
  `;

  wireNavigation();
  document.querySelector("#add-player-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = new FormData(event.currentTarget).get("playerName");
    addPlayer(name);
    render();
  });

  document.querySelectorAll(".player-edit-form").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const id = event.currentTarget.dataset.playerId;
      const name = new FormData(event.currentTarget).get("playerName");
      updatePlayer(id, name);
      render();
    });
  });

  document.querySelectorAll("[data-delete-player]").forEach((button) => {
    button.addEventListener("click", () => {
      players = players.filter((player) => player.id !== button.dataset.deletePlayer);
      savePlayers();
      render();
    });
  });
}

function renderPlayerEditor(player) {
  return `
    <form class="player-card player-edit-form" data-player-id="${escapeHtml(player.id)}">
      <input name="playerName" autocomplete="off" maxlength="32" value="${escapeHtml(player.name)}">
      <div class="player-actions">
        <button class="ghost-action" type="submit">Save</button>
        <button class="ghost-action danger-action" type="button" data-delete-player="${escapeHtml(player.id)}">Delete</button>
      </div>
    </form>
  `;
}

function renderMurderSetup() {
  app.innerHTML = `
    ${renderTopbar("Murder", "New match", [
      ["menu", "Menu"]
    ])}

    <form id="murder-setup-form" class="setup-form">
      ${renderPlayerDatalist()}
      <label>
        <span>Team A</span>
        <input name="teamA" list="stored-players" autocomplete="off" maxlength="32" value="${escapeHtml(players[0]?.name || "Team A")}">
      </label>
      <label>
        <span>Team B</span>
        <input name="teamB" list="stored-players" autocomplete="off" maxlength="32" value="${escapeHtml(players[1]?.name || "Team B")}">
      </label>
      <button class="primary-action" type="submit">Start Murder</button>
    </form>
  `;

  wireNavigation();
  document.querySelector("#murder-setup-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const names = [form.get("teamA"), form.get("teamB")].map(normalizeName);
    addPlayersFromNames(names);
    murderMatch = createMurderMatch(names);
    pendingChoices = null;
    selectedSegment = "single";
    saveMurderMatch();
    view = "murder-match";
    render();
  });
}
function renderMurderMatch() {
  const activeTeam = murderMatch.teams[murderMatch.activeTeamIndex];
  const recent = murderMatch.history.slice(-4).reverse();
  const latestEntry = murderMatch.history[murderMatch.history.length - 1] ?? null;
  const winner = murderMatch.status === "finished" ? getMurderWinnerText() : null;
  const activeClass = teamClass(murderMatch.activeTeamIndex, "active");
  const resultClass =
    murderMatch.winnerIndex === null ? "draw-result" : teamClass(murderMatch.winnerIndex, "result");

  app.innerHTML = `
    ${renderTopbar("Murder", `Turn ${murderMatch.turnNumber}`, [
      ["murder-undo", "Undo", murderMatch.history.length ? "" : "disabled"],
      ["murder-new", "New"],
      ["menu", "Menu"]
    ])}

    <section class="scoreboard" aria-label="Scores">
      ${murderMatch.teams
        .map(
          (team, index) => `
            <article class="team-score ${teamClass(index, "score")} ${
              index === murderMatch.activeTeamIndex && murderMatch.status !== "finished" ? "is-active" : ""
            } ${latestEntry?.teamIndex === index && latestEntry.points > 0 ? "is-scored" : ""}">
              <span class="team-name">${escapeHtml(team.name)}</span>
              <strong>${team.score}</strong>
            </article>
          `
        )
        .join("")}
    </section>

    <section class="match-strip ${activeClass}" aria-label="Match status">
      ${renderMurderMiniTeam(0)}
      <div class="mini-state">
        <span>${murderMatch.status === "finished" ? "Final" : `Turn ${murderMatch.turnNumber}`}</span>
        <strong>${murderMatch.status === "finished" ? "Match over" : `Dart ${murderMatch.dartInTurn}/3`}</strong>
      </div>
      ${renderMurderMiniTeam(1)}
    </section>

    ${
      winner
        ? `
          <section class="result-band ${resultClass}">
            <div class="result-copy">
              <p class="eyebrow">Final</p>
              <h2>${escapeHtml(winner)}</h2>
              <div class="final-scoreline">
                <span>${escapeHtml(murderMatch.teams[0].name)} ${murderMatch.teams[0].score}</span>
                <span>${escapeHtml(murderMatch.teams[1].name)} ${murderMatch.teams[1].score}</span>
              </div>
            </div>
            <button class="primary-action" data-action="murder-new">New match</button>
          </section>
        `
        : `
          <section class="turn-band ${activeClass}">
            <span>${escapeHtml(activeTeam.name)}</span>
            <strong>Dart ${murderMatch.dartInTurn} of 3</strong>
          </section>
        `
    }

    <section class="target-grid" aria-label="Targets">
      ${DISPLAY_TARGETS.map((target) => renderMurderTarget(target)).join("")}
    </section>

    ${
      murderMatch.status === "finished"
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
            ${recent.map((entry) => renderMurderHistoryEntry(entry)).join("")}
          </section>
        `
        : ""
    }

    ${pendingChoices ? renderMurderChoiceSheet() : ""}
  `;

  wireNavigation();
  wireMurderEvents();
}

function renderMurderTarget(target) {
  const state = murderMatch.targets[target.id];
  const summary = summarizeTarget(murderMatch, target.id);
  const closed = targetIsClosed(murderMatch, target.id);
  const scoreable =
    murderMatch.status !== "finished" && !closed && targetIsOpenFor(murderMatch, target.id, murderMatch.activeTeamIndex);
  const classNames = [
    "target-card",
    closed ? "is-closed" : "",
    summary.teamAOpen && !closed ? "team-a-open" : "",
    summary.teamBOpen && !closed ? "team-b-open" : "",
    scoreable ? "is-scoreable" : "",
    scoreable ? teamClass(murderMatch.activeTeamIndex, "scoreable") : ""
  ]
    .filter(Boolean)
    .join(" ");

  return `
    <article class="${classNames}">
      <div class="target-head">
        <strong>${escapeHtml(target.label)}</strong>
        <span class="target-status">${escapeHtml(summary.label)}</span>
      </div>
      <div class="target-row ${murderTeamRowClass(0)}">
        <span>${murderTeamInitial(0)}</span>
        ${renderMurderHitMarks(state.hits[0], 0, target.id)}
      </div>
      <div class="target-row ${murderTeamRowClass(1)}">
        <span>${murderTeamInitial(1)}</span>
        ${renderMurderHitMarks(state.hits[1], 1, target.id)}
      </div>
    </article>
  `;
}

function renderX01Setup() {
  app.innerHTML = `
    ${renderTopbar("X01", "New match", [
      ["menu", "Menu"]
    ])}

    <form id="x01-setup-form" class="setup-form">
      ${renderPlayerDatalist()}
      <div class="form-grid">
        <label>
          <span>Player 1</span>
          <input name="playerA" list="stored-players" autocomplete="off" maxlength="32" value="${escapeHtml(players[0]?.name || "Player 1")}">
        </label>
        <label>
          <span>Player 2</span>
          <input name="playerB" list="stored-players" autocomplete="off" maxlength="32" value="${escapeHtml(players[1]?.name || "Player 2")}">
        </label>
        <label>
          <span>X01 start</span>
          <select name="startScore">
            ${[501, 301, 701, 1001].map((score) => `<option value="${score}">${score}</option>`).join("")}
          </select>
        </label>
        <label>
          <span>Custom start</span>
          <input name="customStart" type="number" inputmode="numeric" min="2" max="5001" placeholder="Optional">
        </label>
        <label>
          <span>Format</span>
          <select name="format" id="x01-format-select">
            <option value="${X01_FORMATS.BEST_OF_LEGS}">Best of legs</option>
            <option value="${X01_FORMATS.RACE_TO_LEGS}">Race to legs</option>
            <option value="${X01_FORMATS.RACE_TO_SETS}">Race to sets</option>
          </select>
        </label>
        <label>
          <span>Target</span>
          <input name="formatTarget" type="number" inputmode="numeric" min="1" max="21" value="5">
        </label>
        <label class="x01-sets-field is-hidden" aria-hidden="true">
          <span>Legs per set</span>
          <input name="legsPerSet" type="number" inputmode="numeric" min="1" max="11" value="3">
        </label>
        <label class="toggle-field">
          <input name="doubleIn" type="checkbox">
          <span>Double in</span>
        </label>
      </div>
      <button class="primary-action" type="submit">Start X01</button>
    </form>
  `;

  wireNavigation();
  const setupForm = document.querySelector("#x01-setup-form");
  const formatSelect = setupForm.elements.format;
  const setsField = setupForm.querySelector(".x01-sets-field");
  const syncSetsField = () => {
    const needsSets = formatSelect.value === X01_FORMATS.RACE_TO_SETS;
    setsField.classList.toggle("is-hidden", !needsSets);
    setsField.setAttribute("aria-hidden", String(!needsSets));
  };

  syncSetsField();
  formatSelect.addEventListener("change", syncSetsField);
  setupForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const names = [form.get("playerA"), form.get("playerB")].map(normalizeName);
    const customStart = Number(form.get("customStart"));
    addPlayersFromNames(names);

    x01Match = createX01Match({
      playerNames: names,
      startScore: customStart > 1 ? customStart : Number(form.get("startScore")),
      doubleIn: Boolean(form.get("doubleIn")),
      format: form.get("format"),
      formatTarget: Number(form.get("formatTarget")),
      legsPerSet: Number(form.get("legsPerSet"))
    });
    saveX01Match();
    view = "x01-match";
    render();
  });
}
function renderX01Match() {
  const activePlayer = x01Match.players[x01Match.activePlayerIndex];
  const recent = x01Match.history.slice(-5).reverse();
  const latestEntry = x01Match.history[x01Match.history.length - 1] ?? null;
  const activeClass = teamClass(x01Match.activePlayerIndex, "active");
  const resultClass =
    x01Match.winnerIndex === null ? "draw-result" : teamClass(x01Match.winnerIndex, "result");

  app.innerHTML = `
    ${renderTopbar("X01", getX01TargetLabel(x01Match), [
      ["x01-undo", "Undo", x01Match.history.length ? "" : "disabled"],
      ["x01-new", "New"],
      ["menu", "Menu"]
    ])}

    <section class="scoreboard x01-scoreboard" aria-label="Scores">
      ${x01Match.players.map((player, index) => renderX01ScoreCard(player, index, latestEntry)).join("")}
    </section>

    <section class="match-strip ${activeClass}" aria-label="Match status">
      ${renderX01MiniPlayer(0)}
      <div class="mini-state">
        <span>${x01Match.status === "finished" ? "Final" : `Leg ${x01Match.legNumber}`}</span>
        <strong>${x01Match.status === "finished" ? "Match over" : activePlayer.name}</strong>
      </div>
      ${renderX01MiniPlayer(1)}
    </section>

    ${
      x01Match.status === "finished"
        ? `
          <section class="result-band ${resultClass}">
            <div class="result-copy">
              <p class="eyebrow">Final</p>
              <h2>${escapeHtml(x01Match.players[x01Match.winnerIndex].name)} wins</h2>
              <div class="final-scoreline">
                <span>${escapeHtml(x01Match.players[0].name)} ${formatX01Progress(x01Match.players[0])}</span>
                <span>${escapeHtml(x01Match.players[1].name)} ${formatX01Progress(x01Match.players[1])}</span>
              </div>
            </div>
            <button class="primary-action" data-action="x01-new">New match</button>
          </section>
        `
        : `
          <section class="turn-band ${activeClass}">
            <span>${escapeHtml(activePlayer.name)}</span>
            <strong>${activePlayer.remaining} left</strong>
          </section>
        `
    }

    <section class="x01-stats-grid" aria-label="X01 stats">
      ${x01Match.players.map((player, index) => renderX01Stats(player, index)).join("")}
    </section>

    ${
      x01Match.status === "finished"
        ? ""
        : `
          <section class="input-dock ${activeClass}" aria-label="X01 visit input">
            <form id="x01-visit-form" class="visit-form">
              <label class="visit-score-field">
                <span>Visit score</span>
                <input id="x01-score-input" name="score" type="number" inputmode="numeric" min="0" max="180" autocomplete="off" value="">
              </label>

              ${
                x01Match.settings.doubleIn && !activePlayer.isIn
                  ? `
                    <div class="x01-toggle-row">
                      <label class="toggle-field">
                        <input name="doubleInHit" type="checkbox">
                        <span>Double-in hit</span>
                      </label>
                    </div>
                  `
                  : ""
              }

              <div class="quick-score-grid" aria-label="Quick scores">
                ${QUICK_X01_SCORES.map((score) => `<button type="button" data-x01-score="${score}">${score}</button>`).join("")}
              </div>

              <button class="primary-action" type="submit">Record visit</button>
            </form>
          </section>
        `
    }

    ${
      recent.length
        ? `
          <section class="history-strip" aria-label="Recent visits">
            ${recent.map((entry) => renderX01HistoryEntry(entry)).join("")}
          </section>
        `
        : ""
    }
    ${pendingX01Checkout ? renderX01CheckoutDartSheet() : ""}
  `;

  wireNavigation();
  wireX01Events();
}

function renderX01ScoreCard(player, index, latestEntry) {
  return `
    <article class="team-score ${teamClass(index, "score")} ${
      index === x01Match.activePlayerIndex && x01Match.status !== "finished" ? "is-active" : ""
    } ${latestEntry?.playerIndex === index && latestEntry.countedScore > 0 ? "is-scored" : ""}">
      <span class="team-name">${escapeHtml(player.name)}</span>
      <strong>${player.remaining}</strong>
      <small>${formatX01Progress(player)}${x01Match.settings.doubleIn && !player.isIn ? " · not in" : ""}</small>
    </article>
  `;
}

function renderX01Stats(player, index) {
  const stats = getX01Stats(player);
  return `
    <article class="stat-panel ${teamClass(index, "history")}">
      <h2>${escapeHtml(player.name)}</h2>
      <dl>
        <div><dt>Darts</dt><dd>${stats.darts}</dd></div>
        <div><dt>3DA</dt><dd>${formatAverage(stats.average)}</dd></div>
        <div><dt>High</dt><dd>${stats.highestScore}</dd></div>
        <div><dt>Best out</dt><dd>${stats.bestOut || "-"}</dd></div>
      </dl>
    </article>
  `;
}

function renderX01MiniPlayer(index) {
  const player = x01Match.players[index];
  return `
    <div class="mini-team ${teamClass(index, "mini")} ${
      index === x01Match.activePlayerIndex && x01Match.status !== "finished" ? "is-active" : ""
    }">
      <b>${playerInitial(player.name, index)}</b>
      <span>${escapeHtml(player.name)}</span>
      <strong>${player.remaining}</strong>
    </div>
  `;
}

function renderX01HistoryEntry(entry) {
  return `
    <article class="history-entry ${teamClass(entry.playerIndex, "history")}">
      <strong>${entry.checkout ? `Out ${entry.remainingBefore}` : entry.bust ? "Bust" : entry.countedScore}</strong>
      <span>${escapeHtml(entry.playerName)} · ${escapeHtml(entry.message)}</span>
      <b>${entry.darts} dart${entry.darts === 1 ? "" : "s"}</b>
    </article>
  `;
}

function renderX01CheckoutDartSheet() {
  const minimum = minimumX01CheckoutDarts(pendingX01Checkout.score);
  return `
    <div class="choice-backdrop" data-action="cancel-x01-checkout">
      <section class="choice-sheet" role="dialog" aria-modal="true" aria-labelledby="x01-checkout-title">
        <div class="choice-head">
          <div>
            <p class="eyebrow">Out ${pendingX01Checkout.score}</p>
            <h2 id="x01-checkout-title">Darts used?</h2>
          </div>
          <button class="icon-action" type="button" data-action="cancel-x01-checkout" aria-label="Close">x</button>
        </div>
        <div class="choice-list">
          ${[1, 2, 3]
            .filter((darts) => darts >= minimum)
            .map(
              (darts) => `
                <button type="button" data-x01-checkout-darts="${darts}">
                  <span>${darts} dart${darts === 1 ? "" : "s"}</span>
                  <small>Record the winning visit</small>
                </button>
              `
            )
            .join("")}
        </div>
      </section>
    </div>
  `;
}
function wireNavigation() {
  document.querySelectorAll("[data-action='menu']").forEach((button) => {
    button.addEventListener("click", () => {
      pendingChoices = null;
      pendingX01Checkout = null;
      view = "menu";
      render();
    });
  });

  document.querySelectorAll("[data-action='players']").forEach((button) => {
    button.addEventListener("click", () => {
      view = "players";
      render();
    });
  });

  document.querySelectorAll("[data-action='show-murder-setup']").forEach((button) => {
    button.addEventListener("click", () => {
      if (!murderMatch || confirm("Start a new Murder match?")) {
        murderMatch = null;
        localStorage.removeItem(MURDER_STORAGE_KEY);
        view = "murder-setup";
        render();
      }
    });
  });

  document.querySelectorAll("[data-action='resume-murder']").forEach((button) => {
    button.addEventListener("click", () => {
      view = "murder-match";
      render();
    });
  });

  document.querySelectorAll("[data-action='show-x01-setup']").forEach((button) => {
    button.addEventListener("click", () => {
      if (!x01Match || confirm("Start a new X01 match?")) {
        pendingX01Checkout = null;
        x01Match = null;
        localStorage.removeItem(X01_STORAGE_KEY);
        view = "x01-setup";
        render();
      }
    });
  });

  document.querySelectorAll("[data-action='resume-x01']").forEach((button) => {
    button.addEventListener("click", () => {
      view = "x01-match";
      render();
    });
  });
}

function wireMurderEvents() {
  document.querySelectorAll("[data-segment]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedSegment = button.dataset.segment;
      render();
    });
  });

  document.querySelectorAll("[data-number]").forEach((button) => {
    button.addEventListener("click", () => {
      handleMurderHit({
        segment: selectedSegment,
        number: Number(button.dataset.number)
      });
    });
  });

  document.querySelectorAll("[data-hit]").forEach((button) => {
    button.addEventListener("click", () => {
      const hit = button.dataset.hit === "miss" ? { segment: "miss" } : { segment: button.dataset.hit };
      handleMurderHit(hit);
    });
  });

  document.querySelectorAll("[data-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      const application = pendingChoices.applications[Number(button.dataset.choice)];
      applyMurderChoice(application);
    });
  });

  document.querySelectorAll("[data-action='murder-undo']").forEach((button) => {
    button.addEventListener("click", () => {
      murderMatch = undoLastDart(murderMatch);
      pendingChoices = null;
      saveMurderMatch();
      render();
    });
  });

  document.querySelectorAll("[data-action='murder-new']").forEach((button) => {
    button.addEventListener("click", () => {
      if (!murderMatch.history.length || murderMatch.status === "finished" || confirm("Start a new Murder match?")) {
        murderMatch = null;
        pendingChoices = null;
        localStorage.removeItem(MURDER_STORAGE_KEY);
        view = "murder-setup";
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
function wireX01Events() {
  document.querySelectorAll("[data-x01-score]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.querySelector("#x01-score-input");
      input.value = button.dataset.x01Score;
      input.focus();
    });
  });

  document.querySelectorAll("[data-action='x01-undo']").forEach((button) => {
    button.addEventListener("click", () => {
      pendingX01Checkout = null;
      x01Match = undoX01Visit(x01Match);
      saveX01Match();
      render();
    });
  });

  document.querySelectorAll("[data-action='x01-new']").forEach((button) => {
    button.addEventListener("click", () => {
      if (!x01Match.history.length || x01Match.status === "finished" || confirm("Start a new X01 match?")) {
        pendingX01Checkout = null;
        x01Match = null;
        localStorage.removeItem(X01_STORAGE_KEY);
        view = "x01-setup";
        render();
      }
    });
  });

  document.querySelectorAll("[data-x01-checkout-darts]").forEach((button) => {
    button.addEventListener("click", () => {
      try {
        recordX01Visit({
          ...pendingX01Checkout,
          darts: Number(button.dataset.x01CheckoutDarts)
        });
      } catch (error) {
        alert(error.message);
      }
    });
  });

  document.querySelectorAll("[data-action='cancel-x01-checkout']").forEach((element) => {
    element.addEventListener("click", (event) => {
      if (event.target === element || element.matches("button")) {
        pendingX01Checkout = null;
        render();
      }
    });
  });

  const form = document.querySelector("#x01-visit-form");
  if (form) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);

      try {
        const visit = {
          score: normalizeX01ScoreInput(formData.get("score") || 0),
          doubleInHit: Boolean(formData.get("doubleInHit"))
        };

        if (shouldAskForX01CheckoutDarts(visit)) {
          pendingX01Checkout = visit;
          render();
          return;
        }

        recordX01Visit({
          ...visit,
          darts: 3
        });
      } catch (error) {
        alert(error.message);
      }
    });
  }
}

function recordX01Visit(visit) {
  x01Match = applyX01Visit(x01Match, visit);
  pendingX01Checkout = null;
  saveX01Match();
  render();
}

function handleMurderHit(hit) {
  const applications = generateApplications(murderMatch, hit);

  if (applications.length === 1) {
    applyMurderChoice(applications[0]);
    return;
  }

  pendingChoices = {
    hit,
    applications
  };
  render();
}

function applyMurderChoice(application) {
  murderMatch = applyApplication(murderMatch, application);
  pendingChoices = null;
  saveMurderMatch();
  render();
}

function renderMurderChoiceSheet() {
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

function renderMurderHistoryEntry(entry) {
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

function renderMurderMiniTeam(index) {
  const team = murderMatch.teams[index];
  return `
    <div class="mini-team ${teamClass(index, "mini")} ${
      index === murderMatch.activeTeamIndex && murderMatch.status !== "finished" ? "is-active" : ""
    }">
      <b>${murderTeamInitial(index)}</b>
      <span>${escapeHtml(team.name)}</span>
      <strong>${team.score}</strong>
    </div>
  `;
}

function renderMurderHitMarks(hits, teamIndex, targetId) {
  const marksClass = teamIndex === 0 ? "team-a-marks" : "team-b-marks";
  return `
    <span class="hit-marks ${marksClass}" aria-label="${hits} of 3 hits">
      ${[0, 1, 2]
        .map((index) => {
          const filled = index < hits;
          const newHit = filled && isNewMurderHitMark(targetId, teamIndex, index, hits);
          return `<span class="hit-mark ${filled ? "is-filled" : ""} ${newHit ? "is-new" : ""}"></span>`;
        })
        .join("")}
    </span>
  `;
}

function murderTeamRowClass(index) {
  const baseClass = index === 0 ? "team-a-row" : "team-b-row";
  if (murderMatch.status === "finished" || index !== murderMatch.activeTeamIndex) {
    return baseClass;
  }

  return `is-active-row ${baseClass}`;
}

function getMurderWinnerText() {
  if (murderMatch.winnerIndex === null) {
    return "Draw match";
  }

  return `${murderMatch.teams[murderMatch.winnerIndex].name} wins`;
}

function isNewMurderHitMark(targetId, teamIndex, markIndex, currentHits) {
  const latestEntry = murderMatch.history[murderMatch.history.length - 1];
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

function renderTopbar(title, eyebrow, actions) {
  return `
    <header class="topbar">
      <div>
        <p class="eyebrow">${escapeHtml(eyebrow)}</p>
        <h1>${escapeHtml(title)}</h1>
      </div>
      <div class="topbar-actions">
        ${actions
          .map(
            ([action, label, disabled]) => `
              <button class="ghost-action" data-action="${escapeHtml(action)}" ${disabled || ""}>${escapeHtml(label)}</button>
            `
          )
          .join("")}
      </div>
    </header>
  `;
}

function renderPlayerDatalist() {
  return `
    <datalist id="stored-players">
      ${players.map((player) => `<option value="${escapeHtml(player.name)}"></option>`).join("")}
    </datalist>
  `;
}

function activeName(match) {
  const collection = match.players || match.teams;
  return collection?.[match.activePlayerIndex ?? match.activeTeamIndex]?.name || "Match";
}

function teamClass(index, suffix) {
  return `${index === 0 ? "team-a" : "team-b"}-${suffix}`;
}

function murderTeamInitial(index) {
  const name = murderMatch.teams[index].name.trim();
  if (/^team\s+a$/i.test(name)) {
    return "A";
  }
  if (/^team\s+b$/i.test(name)) {
    return "B";
  }
  return playerInitial(name, index);
}

function playerInitial(name, index) {
  const trimmed = String(name || "").trim();
  return escapeHtml(trimmed ? trimmed[0].toUpperCase() : index === 0 ? "A" : "B");
}

function formatX01Progress(player) {
  if (x01Match.settings.format === X01_FORMATS.RACE_TO_SETS) {
    return `${player.sets} sets · ${player.legs} legs`;
  }
  return `${player.legs} legs`;
}

function formatAverage(value) {
  return value ? value.toFixed(2) : "0.00";
}

function shouldAskForX01CheckoutDarts(visit) {
  const player = x01Match.players[x01Match.activePlayerIndex];
  const doubleInSatisfied =
    !x01Match.settings.doubleIn || player.isIn || (visit.score > 0 && visit.doubleInHit);

  return doubleInSatisfied && player.remaining - visit.score === 0 && minimumX01CheckoutDarts(visit.score) <= 2;
}

function normalizeX01ScoreInput(score) {
  const value = Number(score);
  if (!Number.isInteger(value) || value < 0 || value > 180) {
    throw new Error("Score must be between 0 and 180.");
  }
  return value;
}

function minimumX01CheckoutDarts(score) {
  if (X01_ONE_DART_SCORES.has(score)) {
    return 1;
  }
  if (X01_TWO_DART_SCORES.has(score)) {
    return 2;
  }
  return 3;
}

function buildOneDartScores() {
  const scores = new Set([25, 50]);
  for (let number = 1; number <= 20; number += 1) {
    scores.add(number);
    scores.add(number * 2);
    scores.add(number * 3);
  }
  return scores;
}

function buildTwoDartScores(oneDartScores) {
  const scores = new Set(oneDartScores);
  const values = Array.from(oneDartScores);
  values.forEach((first) => {
    values.forEach((second) => {
      scores.add(first + second);
    });
  });
  return scores;
}
function normalizeName(name) {
  const trimmed = String(name || "").trim();
  return trimmed || "Player";
}

function addPlayer(name) {
  const normalized = normalizeName(name);
  if (!normalized || normalized === "Player") {
    return;
  }
  addPlayersFromNames([normalized]);
}

function addPlayersFromNames(names) {
  const existing = new Set(players.map((player) => player.name.toLowerCase()));
  const now = new Date().toISOString();

  names.forEach((name) => {
    const normalized = normalizeName(name);
    if (normalized && normalized !== "Player" && !existing.has(normalized.toLowerCase())) {
      players.push({
        id: createId(),
        name: normalized,
        createdAt: now,
        updatedAt: now
      });
      existing.add(normalized.toLowerCase());
    }
  });

  players.sort((left, right) => left.name.localeCompare(right.name));
  savePlayers();
}

function updatePlayer(id, name) {
  const normalized = normalizeName(name);
  players = players.map((player) =>
    player.id === id
      ? {
          ...player,
          name: normalized,
          updatedAt: new Date().toISOString()
        }
      : player
  );
  savePlayers();
}

function loadPlayers() {
  const stored = loadJson(PLAYERS_STORAGE_KEY);
  return Array.isArray(stored) ? stored : [];
}

function savePlayers() {
  localStorage.setItem(PLAYERS_STORAGE_KEY, JSON.stringify(players));
}

function saveMurderMatch() {
  localStorage.setItem(MURDER_STORAGE_KEY, JSON.stringify(murderMatch));
}

function saveX01Match() {
  localStorage.setItem(X01_STORAGE_KEY, JSON.stringify(x01Match));
}

function loadJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js");
  });
}

function createId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}