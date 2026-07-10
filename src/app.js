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
} from "./rules.js?v=35";
import {
  X01_FORMATS,
  applyX01Visit,
  createX01Match,
  getX01Stats,
  getX01TargetLabel,
  undoX01Visit
} from "./x01-rules.js?v=35";

const MURDER_STORAGE_KEY = "murder-darts-current-match";
const X01_STORAGE_KEY = "darts-x01-current-match";
const X01_COMPLETED_MATCHES_KEY = "darts-x01-completed-matches";
const PLAYERS_STORAGE_KEY = "darts-stored-players";
const LEX_MODE_STORAGE_KEY = "darts-lex-mode";
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
const X01_ONE_DART_SCORES = buildOneDartScores();
const X01_TWO_DART_SCORES = buildTwoDartScores(X01_ONE_DART_SCORES);
const X01_STATS_BOGEY_CHECKOUTS = new Set([159, 162, 163, 165, 166, 168, 169]);
const X01_CHECKOUT_ROUTES = buildX01CheckoutRoutes();
const SPLASH_DURATION_MS = 3000;
const X01_THROW_TABLE_LIMIT = 5;
const X01_STICKY_COMPACT_ON_PX = -8;
const X01_STICKY_COMPACT_OFF_PX = 18;
const LEX_GRAPHIC_DURATION_MS = 2800;
const LEX_DOUBLE_TAP_MS = 420;

const app = document.querySelector("#app");

let view = "menu";
let players = loadPlayers();
let murderMatch = loadJson(MURDER_STORAGE_KEY);
let x01Match = loadJson(X01_STORAGE_KEY);
let selectedSegment = "single";
let pendingChoices = null;
let pendingX01Checkout = null;
let selectedStatisticsPlayerId = null;
let cleanupX01StickyScoreStrip = null;
let splashVisible = true;
let splashDismissTimer = null;
let x01LeagueCollapsed = false;
let x01StatsCollapsed = false;
let lexModeEnabled = loadLexMode();
let lexGraphicTimer = null;
let lastLexIconTapAt = 0;

if (x01Match) {
  ensureX01MatchIdentity(x01Match);
  saveX01Match();
  syncCompletedX01Match();
}

render();
registerServiceWorker();

function render() {
  if (cleanupX01StickyScoreStrip) {
    cleanupX01StickyScoreStrip();
    cleanupX01StickyScoreStrip = null;
  }

  if (splashVisible) {
    renderSplashScreen();
    scheduleSplashDismiss();
    return;
  }

  switch (view) {
    case "players":
      renderPlayers();
      return;
    case "statistics":
      renderStatistics();
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

function renderSplashScreen() {
  app.innerHTML = `
    <section class="splash-screen" aria-label="Darts Night opening screen">
      <div class="splash-art-frame">
        <img src="./assets/splash-dartboard-cape.webp?v=35" alt="Dartboard with a red superhero cape" fetchpriority="high">
      </div>
      <div class="splash-title">
        <p class="eyebrow">Darts scorer</p>
        <h1>Darts Night</h1>
        <span>Murder / X01</span>
      </div>
    </section>
  `;
}

function scheduleSplashDismiss() {
  if (splashDismissTimer) {
    return;
  }

  splashDismissTimer = window.setTimeout(() => {
    splashVisible = false;
    splashDismissTimer = null;
    render();
  }, SPLASH_DURATION_MS);
}

function renderMenu() {
  app.innerHTML = `
    <section class="menu-view">
      <div class="brand-lockup">
        <img class="brand-icon ${lexModeEnabled ? "is-lex" : ""}" src="./assets/icon.svg" alt="" data-action="toggle-lex-mode" role="button" tabindex="0">
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
        ${renderMenuCard("statistics", "Statistics", renderStatisticsMenuDetail())}
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

function renderStatistics() {
  const profiles = getStatisticsPlayerProfiles();
  const profile = resolveSelectedStatisticsProfile(profiles);
  const stats = profile ? buildSelectedX01Statistics(profile) : null;

  app.innerHTML = `
    ${renderTopbar("Statistics", "Player form", [
      ...(x01Match ? [["resume-x01", "X01"]] : []),
      ["menu", "Menu"]
    ])}

    ${
      profiles.length
        ? `
          <form id="statistics-player-form" class="setup-form compact-form statistics-selector">
            <label>
              <span>Player</span>
              <select id="statistics-player-select" name="playerId">
                ${profiles
                  .map(
                    (item) => `
                      <option value="${escapeHtml(item.id)}" ${item.id === profile.id ? "selected" : ""}>
                        ${escapeHtml(item.name)}
                      </option>
                    `
                  )
                  .join("")}
              </select>
            </label>
          </form>
        `
        : ""
    }

    ${profile && stats ? renderSelectedPlayerStatistics(profile, stats) : `<article class="empty-panel">No players or X01 statistics yet.</article>`}
  `;

  wireNavigation();
  document.querySelector("#statistics-player-select")?.addEventListener("change", (event) => {
    selectedStatisticsPlayerId = event.currentTarget.value;
    render();
  });
}

function renderSelectedPlayerStatistics(profile, stats) {
  const livePlayer = getLiveX01PlayerForProfile(profile);
  return `
    <section class="player-stat-hero" aria-label="Selected player statistics">
      <div>
        <p class="eyebrow">X01 form</p>
        <h2>${escapeHtml(profile.name)}</h2>
        <span>${stats.matches.length} completed match${stats.matches.length === 1 ? "" : "es"}</span>
      </div>
      <strong>${formatAverage(stats.average)}</strong>
    </section>

    ${livePlayer ? renderSelectedLiveX01Statistics(livePlayer) : ""}

    <section class="stat-metric-grid" aria-label="X01 summary statistics">
      ${renderStatMetric("Matches", stats.matches.length, `${stats.wins} won`)}
      ${renderStatMetric("Win rate", formatPercent(stats.winRate), `${stats.losses} lost`)}
      ${renderStatMetric("Legs", stats.legs, `${stats.checkouts} checkouts`)}
      ${renderStatMetric("CO%", formatPercent(stats.checkoutPercentage), `${stats.checkouts}/${stats.checkoutAttempts} chances`)}
      ${renderStatMetric("Darts", stats.darts, `${stats.visits} visits`)}
      ${renderStatMetric("3DA", formatAverage(stats.average), `${formatVisitAverage(stats.visitAverage)} visit avg`)}
      ${renderStatMetric("First 9", formatAverage(stats.firstNineAverage), `${stats.firstNineDarts} darts`)}
      ${renderStatMetric("High", stats.highestScore, `${stats.busts} busts`)}
      ${renderStatMetric("100+", stats.tons, "tons")}
      ${renderStatMetric("140+", stats.tonFortyPlus, "big scores")}
      ${renderStatMetric("180s", stats.maxes, "maximums")}
      ${renderStatMetric("Best out", stats.bestOut || "-", `${stats.doubleInHits} D-in`)}
      ${renderStatMetric("Best leg", formatDartCount(stats.bestLeg), "won legs")}
      ${renderStatMetric("Worst leg", formatDartCount(stats.worstLeg), "won legs")}
    </section>

    ${renderTrendChart("3 dart average", stats.matches, (match) => match.average, formatAverage)}
    ${renderTrendChart("First 9 average", stats.matches, (match) => match.firstNineAverage, formatAverage)}
    ${renderTrendChart("Highest score", stats.matches, (match) => match.highestScore, (value) => String(value || 0))}
    ${renderHeadToHeadRecords(stats.headToHead)}
    ${renderRecentX01Matches(stats.matches)}
  `;
}

function renderSelectedLiveX01Statistics(player) {
  const stats = getX01Stats(player);
  return `
    <section class="statistics-live" aria-label="Current X01 statistics">
      <div class="x01-throw-table-head">
        <p class="eyebrow">Live</p>
        <h2>Current X01</h2>
      </div>
      <section class="stat-metric-grid compact-stat-grid">
        ${renderStatMetric("Remaining", player.remaining, formatX01Progress(player))}
        ${renderStatMetric("Darts", stats.darts, `${formatAverage(stats.average)} 3DA`)}
        ${renderStatMetric("High", stats.highestScore, `Best out ${stats.bestOut || "-"}`)}
        ${renderStatMetric("D-in", stats.doubleInHits, x01Match.settings.doubleIn ? "Double-in match" : "Off")}
      </section>
    </section>
  `;
}

function renderStatMetric(label, value, detail = "") {
  return `
    <article class="stat-metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      ${detail ? `<small>${escapeHtml(detail)}</small>` : ""}
    </article>
  `;
}

function renderTrendChart(title, matches, valueForMatch, formatValue) {
  const points = matches.slice(-8);
  const maxValue = Math.max(...points.map(valueForMatch), 1);

  return `
    <section class="trend-panel" aria-label="${escapeHtml(title)} over time">
      <div class="x01-throw-table-head">
        <p class="eyebrow">Trend</p>
        <h2>${escapeHtml(title)}</h2>
      </div>
      ${
        points.length
          ? `
            <div class="trend-chart">
              ${points
                .map((match) => {
                  const value = valueForMatch(match);
                  const percent = Math.max(4, Math.round((value / maxValue) * 100));
                  return `
                    <article class="trend-point" style="--bar-pct: ${percent}%">
                      <div class="trend-bar"><span></span></div>
                      <strong>${escapeHtml(formatValue(value))}</strong>
                      <small>${escapeHtml(formatShortDate(match.completedAt))}</small>
                    </article>
                  `;
                })
                .join("")}
            </div>
          `
          : `<article class="empty-panel">No completed X01 matches yet.</article>`
      }
    </section>
  `;
}

function renderHeadToHeadRecords(records) {
  return `
    <section class="statistics-sheet" aria-label="Head-to-head records">
      <div class="x01-throw-table-head">
        <p class="eyebrow">Records</p>
        <h2>Head to head</h2>
      </div>
      ${
        records.length
          ? `
            <div class="statistics-table-wrap">
              <table class="head-to-head-table">
                <thead>
                  <tr>
                    <th scope="col">Opponent</th>
                    <th scope="col">Matches</th>
                    <th scope="col">W-L</th>
                    <th scope="col">Legs</th>
                  </tr>
                </thead>
                <tbody>
                  ${records
                    .map(
                      (record) => `
                        <tr>
                          <th scope="row">${escapeHtml(record.opponentName)}</th>
                          <td>${record.matches}</td>
                          <td>${record.wins}-${record.losses}</td>
                          <td>${record.legsFor}-${record.legsAgainst}</td>
                        </tr>
                      `
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
          `
          : `<article class="empty-panel">Head-to-head records will appear after completed X01 matches.</article>`
      }
    </section>
  `;
}

function renderRecentX01Matches(matches) {
  const recent = matches.slice(-8).reverse();
  return `
    <section class="statistics-sheet" aria-label="Recent X01 matches">
      <div class="x01-throw-table-head">
        <p class="eyebrow">History</p>
        <h2>Recent X01</h2>
      </div>
      ${
        recent.length
          ? `
            <div class="statistics-table-wrap">
              <table class="recent-match-table">
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Game</th>
                    <th scope="col">Result</th>
                    <th scope="col">3DA</th>
                    <th scope="col">High</th>
                    <th scope="col">Out</th>
                    <th scope="col">D-in</th>
                  </tr>
                </thead>
                <tbody>
                  ${recent
                    .map(
                      (match) => `
                        <tr>
                          <th scope="row">${escapeHtml(formatShortDate(match.completedAt))}</th>
                          <td>${escapeHtml(match.formatLabel)}</td>
                          <td>${match.practice ? "Practice" : match.won ? "Won" : "Lost"}</td>
                          <td>${formatAverage(match.average)}</td>
                          <td>${match.highestScore}</td>
                          <td>${match.bestOut || "-"}</td>
                          <td>${match.doubleInHits}</td>
                        </tr>
                      `
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
          `
          : `<article class="empty-panel">Completed X01 matches will appear here.</article>`
      }
    </section>
  `;
}

function renderMurderSetup() {
  app.innerHTML = `
    ${renderTopbar("Murder", "New match", [
      ["menu", "Menu"]
    ])}

    <form id="murder-setup-form" class="setup-form">
      ${renderPlayerSelectField("teamA", "Team A", players[0]?.name || "Team A")}
      ${renderPlayerSelectField("teamB", "Team B", players[1]?.name || "Team B")}
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
      <div class="form-grid">
        <label>
          <span>Mode</span>
          <select name="mode" id="x01-mode-select">
            <option value="match">Match</option>
            <option value="practice">Solo practice</option>
          </select>
        </label>
        ${renderPlayerSelectField("playerA", "Player 1", players[0]?.name || "Player 1")}
        <div class="x01-player-two-field">
          ${renderPlayerSelectField("playerB", "Player 2", players[1]?.name || "Player 2")}
        </div>
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
        <label class="x01-format-field">
          <span>Format</span>
          <select name="format" id="x01-format-select">
            <option value="${X01_FORMATS.BEST_OF_LEGS}">Best of legs</option>
            <option value="${X01_FORMATS.RACE_TO_LEGS}">Race to legs</option>
            <option value="${X01_FORMATS.RACE_TO_SETS}">Race to sets</option>
          </select>
        </label>
        <label>
          <span data-x01-target-label>Target</span>
          <input name="formatTarget" type="number" inputmode="numeric" min="1" max="21" value="5">
        </label>
        <label class="x01-sets-field is-hidden" aria-hidden="true">
          <span>Legs per set</span>
          <input name="legsPerSet" type="number" inputmode="numeric" min="1" max="11" value="3">
        </label>
      </div>
      <div class="x01-toggle-row x01-form-wide">
        <label class="toggle-field">
          <input name="doubleIn" type="checkbox">
          <span>Double-in marker</span>
        </label>
        <label class="toggle-field">
          <input name="outShotAdvice" type="checkbox">
          <span>Out-shot advice</span>
        </label>
      </div>
      <button class="primary-action" type="submit">Start X01</button>
    </form>
  `;

  wireNavigation();
  const setupForm = document.querySelector("#x01-setup-form");
  const modeSelect = setupForm.elements.mode;
  const formatSelect = setupForm.elements.format;
  const playerTwoField = setupForm.querySelector(".x01-player-two-field");
  const formatField = setupForm.querySelector(".x01-format-field");
  const setsField = setupForm.querySelector(".x01-sets-field");
  const targetLabel = setupForm.querySelector("[data-x01-target-label]");
  const practiceModeIsSelected = () => modeSelect.value === "practice";
  const syncSetsField = () => {
    const needsSets = !practiceModeIsSelected() && formatSelect.value === X01_FORMATS.RACE_TO_SETS;
    setsField.classList.toggle("is-hidden", !needsSets);
    setsField.setAttribute("aria-hidden", String(!needsSets));
  };
  const syncPracticeFields = () => {
    const practice = practiceModeIsSelected();
    playerTwoField.classList.toggle("is-hidden", practice);
    playerTwoField.setAttribute("aria-hidden", String(practice));
    formatField.classList.toggle("is-hidden", practice);
    formatField.setAttribute("aria-hidden", String(practice));
    targetLabel.textContent = practice ? "Practice legs" : "Target";
    if (practice) {
      formatSelect.value = X01_FORMATS.RACE_TO_LEGS;
    }
    syncSetsField();
  };

  syncPracticeFields();
  modeSelect.addEventListener("change", syncPracticeFields);
  formatSelect.addEventListener("change", syncSetsField);
  setupForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const practice = form.get("mode") === "practice";
    const names = (practice ? [form.get("playerA")] : [form.get("playerA"), form.get("playerB")]).map(normalizeName);
    const customStart = Number(form.get("customStart"));
    const playerIds = addPlayersFromNames(names);

    x01Match = createX01Match({
      playerNames: names,
      playerIds,
      practice,
      startScore: customStart > 1 ? customStart : Number(form.get("startScore")),
      format: practice ? X01_FORMATS.RACE_TO_LEGS : form.get("format"),
      doubleIn: form.get("doubleIn") === "on",
      outShotAdvice: form.get("outShotAdvice") === "on",
      formatTarget: Number(form.get("formatTarget")),
      legsPerSet: Number(form.get("legsPerSet"))
    });
    x01LeagueCollapsed = false;
    x01StatsCollapsed = false;
    saveX01Match();
    view = "x01-match";
    render();
  });
}
function renderX01Match() {
  const activePlayer = x01Match.players[x01Match.activePlayerIndex];
  const latestEntry = x01Match.history[x01Match.history.length - 1] ?? null;
  const activeClass = teamClass(x01Match.activePlayerIndex, "active");
  const practice = isX01PracticeMatch();
  const resultClass =
    x01Match.winnerIndex === null ? "draw-result" : teamClass(x01Match.winnerIndex, "result");

  app.innerHTML = `
    ${renderX01MatchToolbar()}

    <div class="x01-sticky-sentinel" aria-hidden="true"></div>
    <section class="match-strip x01-match-strip ${activeClass} ${practice ? "is-solo" : ""}" aria-label="X01 score">
      ${renderX01MiniPlayer(0, latestEntry)}
      <div class="mini-state x01-mini-state">
        <span>${x01Match.status === "finished" ? "Final" : getX01TargetLabel(x01Match)}</span>
        <strong>${
          x01Match.status === "finished" ? (practice ? "Practice complete" : "Match over") : `${activePlayer.name} to throw`
        }</strong>
      </div>
      ${x01Match.players[1] ? renderX01MiniPlayer(1, latestEntry) : ""}
    </section>

    ${
      x01Match.status === "finished"
        ? `
          <section class="result-band ${resultClass}">
            <div class="result-copy">
              <p class="eyebrow">Final</p>
              <h2>${escapeHtml(getX01ResultTitle())}</h2>
              <div class="final-scoreline">
                ${x01Match.players
                  .map((player) => `<span>${escapeHtml(player.name)} ${formatX01Progress(player)}</span>`)
                  .join("")}
              </div>
            </div>
            <button class="primary-action" data-action="x01-new">New match</button>
          </section>
        `
        : ""
    }

    ${renderX01ThrowTable()}
    ${renderX01StatsSection(practice)}

    ${
      x01Match.status === "finished"
        ? ""
        : `
          <section class="input-dock ${activeClass}" aria-label="X01 visit input">
            <form id="x01-visit-form" class="visit-form">
              ${renderX01OutShotAdvice(activePlayer)}
              <label class="visit-score-field">
                <span>Visit score</span>
                <input id="x01-score-input" name="score" type="number" inputmode="numeric" min="0" max="180" autocomplete="off" value="">
              </label>

              <button class="primary-action" type="submit">Record visit</button>
            </form>
          </section>
        `
    }
    ${pendingX01Checkout ? renderX01CheckoutDartSheet() : ""}
  `;

  wireNavigation();
  wireX01Events();
  wireX01StickyScoreStrip();
}

function isX01PracticeMatch(match = x01Match) {
  return Boolean(match?.settings?.practice || match?.players?.length === 1);
}

function getX01ResultTitle() {
  if (isX01PracticeMatch()) {
    return `${x01Match.players[0].name} completed practice`;
  }
  return `${x01Match.players[x01Match.winnerIndex].name} wins`;
}

function renderX01MatchToolbar() {
  return `
    <header class="match-toolbar" aria-label="X01 actions">
      <div class="topbar-actions">
        <button class="ghost-action" data-action="x01-undo" ${x01Match.history.length ? "" : "disabled"}>Undo</button>
        <button class="ghost-action" data-action="statistics">Stats</button>
        <button class="ghost-action" data-action="x01-new">New</button>
        <button class="ghost-action" data-action="menu">Menu</button>
      </div>
    </header>
  `;
}

function renderX01StatsSection(practice) {
  const summary = summarizeX01StatsLine();

  if (x01StatsCollapsed) {
    return renderX01CollapsedSection("X01 stats", "Stats", summary, "toggle-x01-stats");
  }

  return `
    <section class="x01-stats-section" aria-label="X01 stats">
      <div class="x01-section-toolbar">
        <div>
          <p class="eyebrow">Stats</p>
          <h2>Live stats</h2>
        </div>
        <button class="icon-action section-toggle" type="button" data-action="toggle-x01-stats" aria-label="Hide X01 stats" aria-expanded="true">-</button>
      </div>
      <div class="x01-stats-grid ${practice ? "is-solo" : ""}">
        ${x01Match.players.map((player, index) => renderX01Stats(player, index)).join("")}
      </div>
    </section>
  `;
}

function renderX01ScoreCard(player, index, latestEntry) {
  return `
    <article class="team-score ${teamClass(index, "score")} ${
      index === x01Match.activePlayerIndex && x01Match.status !== "finished" ? "is-active" : ""
    } ${latestEntry?.playerIndex === index && latestEntry.countedScore > 0 ? "is-scored" : ""}">
      <span class="team-name">${escapeHtml(player.name)}</span>
      <strong>${player.remaining}</strong>
      <small>${formatX01Progress(player)}</small>
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
        <div><dt>D-in</dt><dd>${stats.doubleInHits}</dd></div>
      </dl>
    </article>
  `;
}

function renderX01OutShotAdvice(player) {
  if (!x01Match.settings.outShotAdvice) {
    return "";
  }

  const advice = getX01OutShotAdvice(player.remaining);
  return `
    <section class="x01-out-advice ${advice.route ? "has-route" : ""}" aria-label="Out-shot advice">
      <span>Out shot</span>
      <strong>${escapeHtml(advice.title)}</strong>
      <small>${escapeHtml(advice.detail)}</small>
    </section>
  `;
}

function getX01OutShotAdvice(remaining) {
  const score = Number(remaining || 0);

  if (score === 0) {
    return { title: "Leg complete", detail: "Start the next leg", route: null };
  }

  if (score === 1) {
    return { title: "No finish", detail: "1 is a bust number", route: null };
  }

  if (score > 170) {
    return { title: "No finish", detail: "Leave a checkout under 171", route: null };
  }

  if (X01_STATS_BOGEY_CHECKOUTS.has(score)) {
    return { title: `Bogey ${score}`, detail: "Cannot finish in three darts", route: null };
  }

  const route = X01_CHECKOUT_ROUTES.get(score) || null;
  if (!route) {
    return { title: "No finish", detail: "Set up a better leave", route: null };
  }

  return { title: `${score} out`, detail: route.join(" / "), route };
}

function getCurrentX01LegEntries() {
  const history = x01Match.history || [];
  const checkoutIndexes = history
    .map((entry, index) => (entry.checkout ? index : -1))
    .filter((index) => index >= 0);

  if (!checkoutIndexes.length) {
    return history;
  }

  if (x01Match.status === "finished") {
    const finalLegStart = checkoutIndexes.length > 1 ? checkoutIndexes[checkoutIndexes.length - 2] + 1 : 0;
    return history.slice(finalLegStart);
  }

  return history.slice(checkoutIndexes[checkoutIndexes.length - 1] + 1);
}

function renderX01ThrowTable() {
  const currentLegEntries = getCurrentX01LegEntries();
  const playerEntries = x01Match.players.map((_, playerIndex) =>
    currentLegEntries.filter((entry) => entry.playerIndex === playerIndex).slice(-X01_THROW_TABLE_LIMIT).reverse()
  );

  if (x01LeagueCollapsed) {
    return renderX01CollapsedSection("Last five throws", "League record", summarizeX01LeagueLine(), "toggle-x01-league");
  }

  return `
    <section class="x01-throw-table" aria-label="Last five throws">
      <div class="x01-throw-table-head">
        <div>
          <p class="eyebrow">League record</p>
          <h2>Last five throws</h2>
        </div>
        <button class="icon-action section-toggle" type="button" data-action="toggle-x01-league" aria-label="Hide last five throws" aria-expanded="true">-</button>
      </div>
      <table>
        <thead>
          <tr>
            ${x01Match.players.map((player) => `<th scope="col">${escapeHtml(player.name)}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${Array.from({ length: X01_THROW_TABLE_LIMIT }, (_, rowIndex) => rowIndex)
            .map(
              (rowIndex) => `
                <tr>
                  ${x01Match.players
                    .map((_, playerIndex) => renderX01ThrowCell(playerEntries[playerIndex][rowIndex]))
                    .join("")}
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </section>
  `;
}

function renderX01CollapsedSection(label, eyebrow, summary, action) {
  return `
    <section class="x01-collapse-line" aria-label="${escapeHtml(label)}">
      <div>
        <p class="eyebrow">${escapeHtml(eyebrow)}</p>
        <strong>${escapeHtml(summary)}</strong>
      </div>
      <button class="icon-action section-toggle" type="button" data-action="${escapeHtml(action)}" aria-label="Show ${escapeHtml(label)}" aria-expanded="false">+</button>
    </section>
  `;
}

function summarizeX01StatsLine() {
  return x01Match.players
    .map((player) => {
      const stats = getX01Stats(player);
      return `${player.name}: ${player.remaining} left / 3DA ${formatAverage(stats.average)} / high ${stats.highestScore}`;
    })
    .join(" | ");
}

function summarizeX01LeagueLine() {
  const currentLegEntries = getCurrentX01LegEntries();
  return x01Match.players
    .map((player, playerIndex) => {
      const entries = currentLegEntries.filter((entry) => entry.playerIndex === playerIndex);
      const latest = entries[entries.length - 1];
      return `${player.name}: ${latest ? summarizeX01ThrowEntry(latest) : "-"}`;
    })
    .join(" | ");
}

function summarizeX01ThrowEntry(entry) {
  if (entry.checkout) {
    return `Out ${entry.remainingBefore}`;
  }

  if (entry.bust) {
    return entry.message || "Bust";
  }

  return `${entry.countedScore} (${entry.remainingAfter} left)`;
}

function renderX01ThrowCell(entry) {
  if (!entry) {
    return `<td><span class="throw-empty">-</span></td>`;
  }

  const label = entry.checkout ? `Out ${entry.remainingBefore}` : entry.bust ? entry.message || "Bust" : entry.countedScore;
  const baseMeta = entry.checkout ? `${entry.darts} dart${entry.darts === 1 ? "" : "s"}` : `${entry.remainingAfter} left`;
  const meta = entry.doubleInHit ? `${baseMeta} / D-in` : baseMeta;
  return `
    <td>
      <strong>${escapeHtml(label)}</strong>
      <small>${escapeHtml(meta)}</small>
    </td>
  `;
}
function renderX01MiniPlayer(index, latestEntry) {
  const player = x01Match.players[index];
  return `
    <div class="mini-team x01-mini-team ${teamClass(index, "mini")} ${
      index === x01Match.activePlayerIndex && x01Match.status !== "finished" ? "is-active" : ""
    } ${latestEntry?.playerIndex === index && latestEntry.countedScore > 0 ? "is-scored" : ""}">
      <b>${playerInitial(player.name, index)}</b>
      <span>${escapeHtml(player.name)}</span>
      <strong>${player.remaining}</strong>
      <small>${formatX01Progress(player)}</small>
    </div>
  `;
}

function wireX01StickyScoreStrip() {
  if (cleanupX01StickyScoreStrip) {
    cleanupX01StickyScoreStrip();
    cleanupX01StickyScoreStrip = null;
  }

  const strip = document.querySelector(".x01-match-strip");
  const sentinel = document.querySelector(".x01-sticky-sentinel");
  if (!strip || !sentinel) {
    return;
  }

  let compact = strip.classList.contains("is-compact");
  let animationFrame = null;

  const setCompactState = (nextCompact) => {
    if (compact === nextCompact) {
      return;
    }

    compact = nextCompact;
    strip.classList.toggle("is-compact", compact);
  };

  const syncCompactState = () => {
    animationFrame = null;
    const sentinelBottom = sentinel.getBoundingClientRect().bottom;

    if (!compact && sentinelBottom <= X01_STICKY_COMPACT_ON_PX) {
      setCompactState(true);
    } else if (compact && sentinelBottom >= X01_STICKY_COMPACT_OFF_PX) {
      setCompactState(false);
    }
  };

  const requestCompactSync = () => {
    if (animationFrame !== null) {
      return;
    }
    animationFrame = window.requestAnimationFrame(syncCompactState);
  };

  window.addEventListener("scroll", requestCompactSync, { passive: true });
  window.addEventListener("resize", requestCompactSync);
  syncCompactState();

  cleanupX01StickyScoreStrip = () => {
    window.removeEventListener("scroll", requestCompactSync);
    window.removeEventListener("resize", requestCompactSync);
    if (animationFrame !== null) {
      window.cancelAnimationFrame(animationFrame);
    }
  };
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
  document.querySelectorAll("[data-action='toggle-lex-mode']").forEach((icon) => {
    const toggleFromIcon = () => {
      toggleLexMode();
    };

    icon.addEventListener("click", () => {
      const now = Date.now();
      if (now - lastLexIconTapAt <= LEX_DOUBLE_TAP_MS) {
        lastLexIconTapAt = 0;
        toggleFromIcon();
        return;
      }
      lastLexIconTapAt = now;
    });

    icon.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        toggleFromIcon();
      }
    });
  });

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

  document.querySelectorAll("[data-action='statistics']").forEach((button) => {
    button.addEventListener("click", () => {
      const activePlayer = x01Match?.players?.[x01Match.activePlayerIndex];
      if (activePlayer) {
        selectedStatisticsPlayerId = profileIdForX01Player(activePlayer);
      }
      view = "statistics";
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
        x01LeagueCollapsed = false;
        x01StatsCollapsed = false;
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

  document.querySelectorAll("[data-action='toggle-x01-league']").forEach((button) => {
    button.addEventListener("click", () => {
      x01LeagueCollapsed = !x01LeagueCollapsed;
      render();
    });
  });

  document.querySelectorAll("[data-action='toggle-x01-stats']").forEach((button) => {
    button.addEventListener("click", () => {
      x01StatsCollapsed = !x01StatsCollapsed;
      render();
    });
  });

  document.querySelectorAll("[data-action='x01-undo']").forEach((button) => {
    button.addEventListener("click", () => {
      pendingX01Checkout = null;
      x01Match = undoX01Visit(x01Match);
      ensureX01MatchIdentity(x01Match);
      syncCompletedX01Match();
      saveX01Match();
      render();
    });
  });

  document.querySelectorAll("[data-action='x01-new']").forEach((button) => {
    button.addEventListener("click", () => {
      if (!x01Match.history.length || x01Match.status === "finished" || confirm("Start a new X01 match?")) {
        pendingX01Checkout = null;
        x01LeagueCollapsed = false;
        x01StatsCollapsed = false;
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
          score: normalizeX01ScoreInput(formData.get("score") || 0)
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
  const latestEntry = x01Match.history[x01Match.history.length - 1] || null;
  ensureX01MatchIdentity(x01Match);
  syncCompletedX01Match();
  pendingX01Checkout = null;
  saveX01Match();
  render();
  showLexGraphicForEntry(latestEntry);
}

function toggleLexMode() {
  lexModeEnabled = !lexModeEnabled;
  saveLexMode();
  alert(lexModeEnabled ? "Lex mode activated." : "Lex mode deactivated.");
  render();
}

function loadLexMode() {
  return localStorage.getItem(LEX_MODE_STORAGE_KEY) === "on";
}

function saveLexMode() {
  localStorage.setItem(LEX_MODE_STORAGE_KEY, lexModeEnabled ? "on" : "off");
}

function showLexGraphicForEntry(entry) {
  if (!lexModeEnabled || !entry || entry.bust) {
    return;
  }

  const graphic = getLexGraphic(Number(entry.countedScore || 0));
  if (!graphic) {
    return;
  }

  showLexGraphic(graphic);
}

function getLexGraphic(score) {
  if ([22, 32, 42, 52].includes(score)) {
    return { tone: "choice", title: "what would you do", caption: score + " scored", kicker: "Lex mode", art: "???" };
  }

  if (score === 3) {
    return { tone: "wicked", title: "1, 2, 3", caption: "and I come with the wicked!", kicker: "Low score special", art: "1 2 3" };
  }

  if (score === 100) {
    return { tone: "hundred", title: "ONE..... HUNDRED", caption: "Ton hit", kicker: "Score call", art: "100" };
  }

  if (score === 180) {
    return { tone: "maximum", title: "Take a Picture!", caption: "Maximum visit", kicker: "180", art: "180" };
  }

  const dartScores = new Map([
    [80, "Great First Dart"],
    [120, "Great Second Dart"],
    [140, "Great Third Dart"]
  ]);
  if (dartScores.has(score)) {
    return { tone: "great-dart", title: dartScores.get(score), caption: score + " scored", kicker: "Clean visit", art: String(score) };
  }

  if (score === 69) {
    return { tone: "giggity", title: "All the Giggity", caption: "69 scored", kicker: "Lex mode", art: "69" };
  }

  if (score === 59) {
    return { tone: "low-giggity", title: "Not enough Giggity", caption: "59 scored", kicker: "Lex mode", art: "59" };
  }

  if (score === 79) {
    return { tone: "high-giggity", title: "Too much Giggity", caption: "79 scored", kicker: "Lex mode", art: "79" };
  }

  if (score === 33) {
    return { tone: "tirty-tree", title: "Tirty Tree and a Turd", caption: "33 scored", kicker: "Lex mode", art: "33" };
  }

  return null;
}

function showLexGraphic(graphic) {
  document.querySelectorAll(".lex-graphic-backdrop").forEach((element) => element.remove());

  if (lexGraphicTimer) {
    window.clearTimeout(lexGraphicTimer);
    lexGraphicTimer = null;
  }

  const backdrop = document.createElement("div");
  backdrop.className = "lex-graphic-backdrop lex-tone-" + graphic.tone;
  backdrop.setAttribute("role", "status");
  backdrop.setAttribute("aria-live", "polite");
  backdrop.innerHTML = [
    "<div class=\"lex-burst\" aria-hidden=\"true\"></div>",
    "<section class=\"lex-graphic-card\" data-art=\"" + escapeHtml(graphic.art || "") + "\">",
    "<span>" + escapeHtml(graphic.kicker) + "</span>",
    "<strong>" + escapeHtml(graphic.title) + "</strong>",
    "<small>" + escapeHtml(graphic.caption) + "</small>",
    "</section>"
  ].join("");

  backdrop.addEventListener("click", () => dismissLexGraphic(backdrop));
  document.body.appendChild(backdrop);
  lexGraphicTimer = window.setTimeout(() => dismissLexGraphic(backdrop), LEX_GRAPHIC_DURATION_MS);
}

function dismissLexGraphic(backdrop) {
  if (lexGraphicTimer) {
    window.clearTimeout(lexGraphicTimer);
    lexGraphicTimer = null;
  }

  backdrop.classList.add("is-leaving");
  window.setTimeout(() => backdrop.remove(), 220);
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

function renderPlayerSelectField(name, label, selectedName) {
  const options = playerSelectionNames(selectedName);
  const selected = normalizeName(selectedName);

  return `
    <label>
      <span>${escapeHtml(label)}</span>
      <select name="${escapeHtml(name)}">
        ${options
          .map(
            (option) => `
              <option value="${escapeHtml(option)}" ${option === selected ? "selected" : ""}>
                ${escapeHtml(option)}
              </option>
            `
          )
          .join("")}
      </select>
    </label>
  `;
}

function playerSelectionNames(selectedName) {
  const names = Array.from(new Set(players.map((player) => normalizeName(player.name))));
  if (!names.length) {
    return [normalizeName(selectedName)];
  }
  return names;
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
    return `${player.sets} sets \u00B7 ${player.legs} legs`;
  }
  return `${player.legs} legs`;
}

function formatAverage(value) {
  return value ? value.toFixed(2) : "0.00";
}

function shouldAskForX01CheckoutDarts(visit) {
  const player = x01Match.players[x01Match.activePlayerIndex];
  return player.remaining - visit.score === 0 && minimumX01CheckoutDarts(visit.score) <= 2;
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

// Published 60-170 checkout routes from Darts501's checkout chart; 2-59 use local double-out fallbacks.
function getDarts501CheckoutChart() {
  return {
  170: ["T20","T20","Bull"],
  167: ["T20","T19","Bull"],
  164: ["T20","T18","Bull"],
  161: ["T20","T17","Bull"],
  160: ["T20","T20","D20"],
  158: ["T20","T20","D19"],
  157: ["T20","T19","D20"],
  156: ["T20","T20","D18"],
  155: ["T20","T19","D19"],
  154: ["T20","T18","D20"],
  153: ["T20","T19","D18"],
  152: ["T20","T20","D16"],
  151: ["T20","T17","D20"],
  150: ["T20","T18","D18"],
  149: ["T20","T19","D16"],
  148: ["T20","T16","D20"],
  147: ["T20","T17","D18"],
  146: ["T20","T18","D16"],
  145: ["T20","T15","D20"],
  144: ["T20","T20","D12"],
  143: ["T20","T17","D16"],
  142: ["T20","T14","D20"],
  141: ["T20","T19","D12"],
  140: ["T20","T16","D16"],
  139: ["T19","T14","D20"],
  138: ["T20","T18","D12"],
  137: ["T19","T16","D16"],
  136: ["T20","T20","D8"],
  135: ["T20","T17","D12"],
  134: ["T20","T14","D16"],
  133: ["T20","T19","D8"],
  132: ["T20","T16","D12"],
  131: ["T20","T13","D16"],
  130: ["T20","T20","D5"],
  129: ["T19","T16","D12"],
  128: ["T18","T14","D16"],
  127: ["T20","T17","D8"],
  126: ["T19","T19","D6"],
  125: ["25","T20","D20"],
  124: ["T20","T16","D8"],
  123: ["T19","T16","D9"],
  122: ["T18","T20","D4"],
  121: ["T17","T10","D20"],
  120: ["T20","20","D20"],
  119: ["T19","T10","D16"],
  118: ["T20","18","D20"],
  117: ["T20","17","D20"],
  116: ["T20","16","D20"],
  115: ["T20","15","D20"],
  114: ["T20","14","D20"],
  113: ["T20","13","D20"],
  112: ["T20","12","D20"],
  111: ["T20","19","D16"],
  110: ["T20","18","D16"],
  109: ["T19","20","D16"],
  108: ["T20","16","D16"],
  107: ["T19","18","D16"],
  106: ["T20","14","D16"],
  105: ["T19","16","D16"],
  104: ["T18","18","D16"],
  103: ["T20","3","D20"],
  102: ["T20","10","D16"],
  101: ["T20","1","D20"],
  100: ["T20","D20"],
  99: ["T19","10","D16"],
  98: ["T20","D19"],
  97: ["T19","D20"],
  96: ["T20","D18"],
  95: ["T19","D19"],
  94: ["T18","D20"],
  93: ["T19","D18"],
  92: ["T20","D16"],
  91: ["T17","D20"],
  90: ["T20","D15"],
  89: ["T19","D16"],
  88: ["T16","D20"],
  87: ["T17","D18"],
  86: ["T18","D16"],
  85: ["T15","D20"],
  84: ["T20","D12"],
  83: ["T17","D16"],
  82: ["T14","D20"],
  81: ["T19","D12"],
  80: ["T20","D10"],
  79: ["T19","D11"],
  78: ["T18","D12"],
  77: ["T19","D10"],
  76: ["T20","D8"],
  75: ["T17","D12"],
  74: ["T14","D16"],
  73: ["T19","D8"],
  72: ["T16","D12"],
  71: ["T13","D16"],
  70: ["T10","D20"],
  69: ["T15","D12"],
  68: ["T20","D4"],
  67: ["T17","D8"],
  66: ["T10","D18"],
  65: ["T19","D4"],
  64: ["T16","D8"],
  63: ["T13","D12"],
  62: ["T10","D16"],
  61: ["T15","D8"],
  60: ["20","D20"]
  };
}

function buildX01CheckoutRoutes() {
  const routes = new Map(
    Object.entries(getDarts501CheckoutChart()).map(([score, route]) => [Number(score), route])
  );

  addLowX01CheckoutRoutes(routes);
  return routes;
}

function addLowX01CheckoutRoutes(routes) {
  routes.set(50, ["Bull"]);

  for (let score = 2; score < 60; score += 1) {
    if (routes.has(score)) {
      continue;
    }

    const route = buildLowX01CheckoutRoute(score);
    if (route) {
      routes.set(score, route);
    }
  }
}

function buildLowX01CheckoutRoute(score) {
  if (score % 2 === 0 && score <= 40) {
    return [`D${score / 2}`];
  }

  const preferredDoubles = [20, 16, 10, 8, 18, 12, 14, 6, 4, 2, 1, 19, 17, 15, 13, 11, 9, 7, 5, 3];
  for (const double of preferredDoubles) {
    const setup = score - double * 2;
    if (setup >= 1 && setup <= 20) {
      return [String(setup), `D${double}`];
    }
  }

  return null;
}
function renderStatisticsMenuDetail() {
  const completedMatches = loadX01CompletedMatches().length;
  const suffix = completedMatches === 1 ? "match" : "matches";
  return `${completedMatches} X01 ${suffix}`;
}

function getStatisticsPlayerProfiles() {
  const profiles = new Map();

  players.forEach((player) => {
    addStatisticsProfile(profiles, player.id, player.name, true);
  });

  loadX01CompletedMatches().forEach((match) => {
    match.players.forEach((player) => {
      addStatisticsProfile(profiles, profileIdForX01Player(player), player.name, false);
    });
  });

  x01Match?.players?.forEach((player) => {
    addStatisticsProfile(profiles, profileIdForX01Player(player), player.name, false);
  });

  return Array.from(profiles.values()).sort((left, right) => left.name.localeCompare(right.name));
}

function addStatisticsProfile(profiles, id, name, stored) {
  const normalizedName = normalizeName(name);
  const profileId = id || `name:${normalizedName.toLowerCase()}`;
  const existing = profiles.get(profileId);

  profiles.set(profileId, {
    id: profileId,
    name: existing?.stored && !stored ? existing.name : normalizedName,
    stored: Boolean(existing?.stored || stored)
  });
}

function resolveSelectedStatisticsProfile(profiles) {
  if (!profiles.length) {
    selectedStatisticsPlayerId = null;
    return null;
  }

  const activeId = x01Match?.players?.[x01Match.activePlayerIndex]
    ? profileIdForX01Player(x01Match.players[x01Match.activePlayerIndex])
    : null;
  const selected = profiles.find((profile) => profile.id === selectedStatisticsPlayerId);
  const active = profiles.find((profile) => profile.id === activeId);

  const profile = selected || active || profiles[0];
  selectedStatisticsPlayerId = profile.id;
  return profile;
}

function buildSelectedX01Statistics(profile) {
  const matches = getCompletedX01MatchesForProfile(profile);
  const totals = matches.reduce(
    (record, match) => {
      record.wins += !match.practice && match.won ? 1 : 0;
      record.legs += match.legs;
      record.darts += match.totalDarts;
      record.scored += match.totalScored;
      record.visits += match.visits;
      record.highestScore = Math.max(record.highestScore, match.highestScore);
      record.bestOut = Math.max(record.bestOut, match.bestOut);
      record.checkouts += match.checkouts;
      record.checkoutAttempts += match.checkoutAttempts;
      record.busts += match.busts;
      record.doubleInHits += match.doubleInHits;
      record.tons += match.tons;
      record.tonFortyPlus += match.tonFortyPlus;
      record.maxes += match.maxes;
      record.firstNineDarts += match.firstNineDarts;
      record.firstNineScored += match.firstNineScored;
      record.wonLegDarts.push(
        ...match.legsDetail.filter((leg) => leg.won && leg.darts > 0).map((leg) => leg.darts)
      );
      return record;
    },
    {
      wins: 0,
      legs: 0,
      darts: 0,
      scored: 0,
      visits: 0,
      highestScore: 0,
      bestOut: 0,
      checkouts: 0,
      checkoutAttempts: 0,
      busts: 0,
      doubleInHits: 0,
      tons: 0,
      tonFortyPlus: 0,
      maxes: 0,
      firstNineDarts: 0,
      firstNineScored: 0,
      wonLegDarts: []
    }
  );

  const competitiveMatches = matches.filter((match) => !match.practice).length;
  const bestLeg = totals.wonLegDarts.length ? Math.min(...totals.wonLegDarts) : 0;
  const worstLeg = totals.wonLegDarts.length ? Math.max(...totals.wonLegDarts) : 0;

  return {
    ...totals,
    matches,
    losses: competitiveMatches - totals.wins,
    average: totals.darts ? (totals.scored / totals.darts) * 3 : 0,
    firstNineAverage: totals.firstNineDarts ? (totals.firstNineScored / totals.firstNineDarts) * 3 : 0,
    visitAverage: totals.visits ? totals.scored / totals.visits : 0,
    checkoutPercentage: totals.checkoutAttempts ? totals.checkouts / totals.checkoutAttempts : 0,
    winRate: competitiveMatches ? totals.wins / competitiveMatches : 0,
    bestLeg,
    worstLeg,
    headToHead: buildHeadToHeadRecords(profile)
  };
}

function getCompletedX01MatchesForProfile(profile) {
  return loadX01CompletedMatches()
    .flatMap((match) => {
      const player = match.players.find((candidate) => x01PlayerMatchesProfile(candidate, profile));
      if (!player) {
        return [];
      }

      const totalDarts = Number(player.totalDarts || 0);
      const totalScored = Number(player.totalScored || 0);
      const visits = Number(player.visits || Math.ceil(totalDarts / 3) || 0);
      const legsDetail = Array.isArray(player.legsDetail) ? player.legsDetail.map(normalizeCompletedX01Leg) : [];
      const firstNineDarts = Number(
        player.firstNineDarts || legsDetail.reduce((total, leg) => total + leg.firstNineDarts, 0)
      );
      const firstNineScored = Number(
        player.firstNineScored || legsDetail.reduce((total, leg) => total + leg.firstNineScored, 0)
      );
      const checkoutAttempts = Number(player.checkoutAttempts || 0);

      return [
        {
          id: match.id,
          completedAt: match.completedAt,
          formatLabel: formatX01MatchLabel(match),
          practice: Boolean(match.settings?.practice),
          won: Boolean(player.won),
          legs: Number(player.legs || player.checkouts || 0),
          sets: Number(player.sets || 0),
          totalDarts,
          totalScored,
          visits,
          average: totalDarts ? (totalScored / totalDarts) * 3 : 0,
          firstNineAverage: firstNineDarts ? (firstNineScored / firstNineDarts) * 3 : 0,
          visitAverage: visits ? totalScored / visits : 0,
          highestScore: Number(player.highestScore || 0),
          bestOut: Number(player.bestOut || 0),
          checkouts: Number(player.checkouts || 0),
          checkoutAttempts,
          checkoutPercentage: checkoutAttempts ? Number(player.checkouts || 0) / checkoutAttempts : 0,
          busts: Number(player.busts || 0),
          doubleInHits: Number(player.doubleInHits || 0),
          tons: Number(player.tons || 0),
          tonFortyPlus: Number(player.tonFortyPlus || 0),
          maxes: Number(player.maxes || 0),
          firstNineDarts,
          firstNineScored,
          legsDetail
        }
      ];
    })
    .sort((left, right) => new Date(left.completedAt) - new Date(right.completedAt));
}

function buildHeadToHeadRecords(profile) {
  const records = new Map();

  loadX01CompletedMatches().forEach((match) => {
    if (match.settings?.practice) {
      return;
    }

    const selected = match.players.find((candidate) => x01PlayerMatchesProfile(candidate, profile));
    if (!selected) {
      return;
    }

    const opponent = match.players.find((candidate) => candidate !== selected);
    if (!opponent) {
      return;
    }

    const key = profileIdForX01Player(opponent);
    const existing = records.get(key) || {
      opponentName: opponent.name,
      matches: 0,
      wins: 0,
      losses: 0,
      legsFor: 0,
      legsAgainst: 0,
      lastPlayed: null
    };

    existing.opponentName = opponent.name || existing.opponentName;
    existing.matches += 1;
    existing.wins += selected.won ? 1 : 0;
    existing.losses += selected.won ? 0 : 1;
    existing.legsFor += Number(selected.legs || selected.checkouts || 0);
    existing.legsAgainst += Number(opponent.legs || opponent.checkouts || 0);
    existing.lastPlayed = match.completedAt || existing.lastPlayed;
    records.set(key, existing);
  });

  return Array.from(records.values()).sort(
    (left, right) =>
      right.matches - left.matches ||
      right.wins - left.wins ||
      left.opponentName.localeCompare(right.opponentName)
  );
}

function normalizeCompletedX01Leg(leg) {
  const darts = Number(leg.darts || 0);
  const scored = Number(leg.scored || 0);
  const firstNineDarts = Number(leg.firstNineDarts || 0);
  const firstNineScored = Number(leg.firstNineScored || 0);

  return {
    legNumber: Number(leg.legNumber || 0),
    won: Boolean(leg.won),
    darts,
    scored,
    visits: Number(leg.visits || 0),
    checkout: Number(leg.checkout || 0),
    firstNineDarts,
    firstNineScored,
    average: darts ? (scored / darts) * 3 : Number(leg.average || 0),
    firstNineAverage: firstNineDarts ? (firstNineScored / firstNineDarts) * 3 : Number(leg.firstNineAverage || 0)
  };
}

function getLiveX01PlayerForProfile(profile) {
  return x01Match?.players?.find((player) => x01PlayerMatchesProfile(player, profile)) || null;
}

function x01PlayerMatchesProfile(player, profile) {
  if (player.playerId && player.playerId === profile.id) {
    return true;
  }

  return normalizeName(player.name).toLowerCase() === normalizeName(profile.name).toLowerCase();
}

function profileIdForX01Player(player) {
  return player.playerId || findPlayerIdByName(player.name) || `name:${normalizeName(player.name).toLowerCase()}`;
}

function syncCompletedX01Match() {
  if (!x01Match?.kind) {
    return;
  }

  ensureX01MatchIdentity(x01Match);
  const completedMatches = loadX01CompletedMatches().filter((match) => match.id !== x01Match.id);

  if (x01Match.status === "finished") {
    completedMatches.push(createCompletedX01MatchSummary(x01Match));
  }

  saveX01CompletedMatches(completedMatches);
}

function createCompletedX01MatchSummary(match) {
  const legDetailsByPlayer = match.players.map((_, index) => buildX01LegDetails(match.history, index));

  return {
    id: match.id,
    completedAt: match.completedAt || match.updatedAt || new Date().toISOString(),
    settings: {
      startScore: match.settings.startScore,
      format: match.settings.format,
      formatTarget: match.settings.formatTarget,
      legsPerSet: match.settings.legsPerSet,
      doubleIn: Boolean(match.settings.doubleIn),
      outShotAdvice: Boolean(match.settings.outShotAdvice),
      practice: Boolean(match.settings.practice)
    },
    players: match.players.map((player, index) => {
      const entries = match.history.filter((entry) => entry.playerIndex === index);
      const checkouts = entries.filter((entry) => entry.checkout).length;
      const legsDetail = legDetailsByPlayer[index];
      const firstNineDarts = legsDetail.reduce((total, leg) => total + leg.firstNineDarts, 0);
      const firstNineScored = legsDetail.reduce((total, leg) => total + leg.firstNineScored, 0);
      const checkoutAttempts = entries.filter((entry) => canAttemptX01Checkout(entry.remainingBefore)).length;

      return {
        playerId: player.playerId || findPlayerIdByName(player.name),
        name: player.name,
        won: match.winnerIndex === index,
        legs: checkouts,
        sets: Number(player.sets || 0),
        visits: entries.length,
        totalDarts: Number(player.totalDarts || 0),
        totalScored: Number(player.totalScored || 0),
        highestScore: Number(player.highestScore || 0),
        bestOut: Number(player.bestOut || 0),
        checkouts,
        checkoutAttempts,
        busts: entries.filter((entry) => entry.bust).length,
        doubleInHits: Number(player.doubleInHits || entries.filter((entry) => entry.doubleInHit).length || 0),
        tons: entries.filter((entry) => Number(entry.countedScore || 0) >= 100).length,
        tonFortyPlus: entries.filter((entry) => Number(entry.countedScore || 0) >= 140).length,
        maxes: entries.filter((entry) => Number(entry.countedScore || 0) === 180).length,
        firstNineDarts,
        firstNineScored,
        legsDetail
      };
    })
  };
}

function buildX01LegDetails(history, playerIndex) {
  return splitX01HistoryIntoLegs(history)
    .map((legEntries, index) => {
      const entries = legEntries.filter((entry) => entry.playerIndex === playerIndex);
      const checkoutEntry = legEntries.find((entry) => entry.checkout) || null;
      const darts = entries.reduce((total, entry) => total + Number(entry.darts || 0), 0);
      const scored = entries.reduce((total, entry) => total + Number(entry.countedScore || 0), 0);
      const firstNine = calculateX01FirstNine(entries);
      const won = checkoutEntry?.playerIndex === playerIndex;

      return {
        legNumber: index + 1,
        won,
        darts,
        scored,
        visits: entries.length,
        checkout: won ? Number(checkoutEntry.remainingBefore || 0) : 0,
        firstNineDarts: firstNine.darts,
        firstNineScored: firstNine.scored,
        average: darts ? (scored / darts) * 3 : 0,
        firstNineAverage: firstNine.darts ? (firstNine.scored / firstNine.darts) * 3 : 0
      };
    })
    .filter((leg) => leg.visits || leg.won);
}

function splitX01HistoryIntoLegs(history) {
  const legs = [];
  let current = [];

  history.forEach((entry) => {
    current.push(entry);
    if (entry.checkout) {
      legs.push(current);
      current = [];
    }
  });

  if (current.length) {
    legs.push(current);
  }

  return legs;
}

function calculateX01FirstNine(entries) {
  let darts = 0;
  let scored = 0;

  entries.forEach((entry) => {
    if (darts >= 9) {
      return;
    }

    const entryDarts = Number(entry.darts || 0);
    if (!entryDarts) {
      return;
    }

    const usedDarts = Math.min(entryDarts, 9 - darts);
    const countedScore = Number(entry.countedScore || 0);
    scored += usedDarts === entryDarts ? countedScore : (countedScore / entryDarts) * usedDarts;
    darts += usedDarts;
  });

  return {
    darts,
    scored: Math.round(scored * 100) / 100
  };
}

function canAttemptX01Checkout(remaining) {
  const value = Number(remaining || 0);
  return value > 1 && value <= 170 && !X01_STATS_BOGEY_CHECKOUTS.has(value);
}

function loadX01CompletedMatches() {
  const stored = loadJson(X01_COMPLETED_MATCHES_KEY);
  return Array.isArray(stored) ? stored : [];
}

function saveX01CompletedMatches(matches) {
  localStorage.setItem(X01_COMPLETED_MATCHES_KEY, JSON.stringify(matches));
}

function ensureX01MatchIdentity(match) {
  match.id ||= createId();
  match.settings ||= {};
  match.settings.doubleIn = Boolean(match.settings.doubleIn);
  match.settings.outShotAdvice = Boolean(match.settings.outShotAdvice);
  match.settings.practice = Boolean(match.settings.practice || match.players?.length === 1);
  match.history ||= [];
  inferX01DoubleInHistory(match);

  const currentLegStart = match.history.reduce((start, entry, index) => (entry.checkout ? index + 1 : start), 0);
  const currentLegEntries = match.history.slice(currentLegStart);

  match.players?.forEach((player, index) => {
    player.playerId ||= findPlayerIdByName(player.name);
    player.doubleInHits = Number(player.doubleInHits || match.history.filter((entry) => entry.playerIndex === index && entry.doubleInHit).length || 0);

    if (typeof player.doubleInComplete !== "boolean") {
      player.doubleInComplete =
        !match.settings.doubleIn ||
        currentLegEntries.some((entry) => entry.playerIndex === index && Number(entry.countedScore || 0) > 0);
    }
  });
  return match;
}

function inferX01DoubleInHistory(match) {
  if (!match.settings.doubleIn) {
    match.history.forEach((entry) => {
      entry.doubleInHit = false;
    });
    return;
  }

  const doubleInComplete = match.players.map(() => false);
  match.history.forEach((entry) => {
    const playerIndex = Number(entry.playerIndex || 0);
    const countedScore = Number(entry.countedScore || 0);
    const inferredHit = !doubleInComplete[playerIndex] && countedScore > 0;
    entry.doubleInHit = Boolean(entry.doubleInHit || inferredHit);

    if (entry.doubleInHit || countedScore > 0) {
      doubleInComplete[playerIndex] = true;
    }

    if (entry.checkout) {
      doubleInComplete.fill(false);
    }
  });
}

function formatX01MatchLabel(match) {
  const startScore = match.settings?.startScore || "X01";
  if (match.settings?.practice) {
    return `${startScore} practice${match.settings?.doubleIn ? " D-in" : ""}`;
  }
  const mode = match.settings?.doubleIn ? "D-in" : "Straight";
  return `${startScore} ${mode}`;
}

function formatPercent(value) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

function formatVisitAverage(value) {
  return Number(value || 0).toFixed(1);
}

function formatDartCount(value) {
  const darts = Number(value || 0);
  if (!darts) {
    return "-";
  }
  return `${darts} dart${darts === 1 ? "" : "s"}`;
}

function formatShortDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function findPlayerByName(name) {
  const normalized = normalizeName(name).toLowerCase();
  return players.find((player) => player.name.toLowerCase() === normalized) || null;
}

function findPlayerIdByName(name) {
  return findPlayerByName(name)?.id || null;
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
  const now = new Date().toISOString();
  const playerIds = [];

  names.forEach((name) => {
    const normalized = normalizeName(name);
    if (!normalized || normalized === "Player") {
      playerIds.push(null);
      return;
    }

    let player = findPlayerByName(normalized);
    if (!player) {
      player = {
        id: createId(),
        name: normalized,
        createdAt: now,
        updatedAt: now
      };
      players.push(player);
    }

    playerIds.push(player.id);
  });

  players.sort((left, right) => left.name.localeCompare(right.name));
  savePlayers();
  return playerIds;
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
  if (!Array.isArray(stored)) {
    return [];
  }

  let changed = false;
  const normalized = stored.map((player) => {
    const next = {
      id: player.id || createId(),
      name: normalizeName(player.name),
      createdAt: player.createdAt || new Date().toISOString(),
      updatedAt: player.updatedAt || player.createdAt || new Date().toISOString()
    };
    changed = changed || !player.id || next.name !== player.name;
    return next;
  });

  if (changed) {
    localStorage.setItem(PLAYERS_STORAGE_KEY, JSON.stringify(normalized));
  }

  return normalized.sort((left, right) => left.name.localeCompare(right.name));
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
    navigator.serviceWorker
      .register("./sw.js")
      .then((registration) => registration.update())
      .catch(() => {});
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