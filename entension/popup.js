const API_HEALTH_URL = "http://127.0.0.1:8000/";
const STATUS_TIMEOUT_MS = 2000;
const STATUS_REFRESH_MS = 5000;

const DEFAULTS = { enabled: true, threshold: 0.8, thresholdVersion: 1, filterMode: "blur", filterModeVersion: 2, modelMode: "both" };

const statusEl = document.getElementById("status");
const statusText = document.getElementById("status-text");
const enabledInput = document.getElementById("enabled");
const thresholdInput = document.getElementById("threshold");
const thresholdValue = document.getElementById("threshold-value");
const thresholdCard = document.getElementById("threshold-card");
const modeCard = document.getElementById("mode-card");
const filterModeInput = document.getElementById("filter-mode");
const settingsTab = document.getElementById("settings-tab");
const dashboardTab = document.getElementById("dashboard-tab");
const settingsView = document.getElementById("settings-view");
const dashboardView = document.getElementById("dashboard-view");
const modelModeInput = document.getElementById("model-mode");
const DASHBOARD_CATEGORIES = ["Toxic", "Severe Toxic", "Obscene", "Threat", "Insult", "Identity Hate"];

function showTab(name) {
  const dashboard = name === "dashboard";
  settingsView.hidden = dashboard;
  dashboardView.hidden = !dashboard;
  settingsTab.classList.toggle("active", !dashboard);
  dashboardTab.classList.toggle("active", dashboard);
  settingsTab.setAttribute("aria-selected", String(!dashboard));
  dashboardTab.setAttribute("aria-selected", String(dashboard));
  if (dashboard) renderDashboard();
}

settingsTab.addEventListener("click", () => showTab("settings"));
dashboardTab.addEventListener("click", () => showTab("dashboard"));

async function renderDashboard() {
  const { analytics = {}, communityFlags = [] } = await chrome.storage.local.get(["analytics", "communityFlags"]);
  const scanned = Number(analytics.scanned) || 0;
  const blurred = Number(analytics.blurred) || 0;
  document.getElementById("scanned-count").textContent = scanned.toLocaleString();
  document.getElementById("blurred-count").textContent = blurred.toLocaleString();
  document.getElementById("flag-count").textContent = communityFlags.length.toLocaleString();
  const sites = Object.values(analytics.sites || {});
  const siteScanned = sites.reduce((sum, site) => sum + (Number(site.scanned) || 0), 0);
  const siteBlurred = sites.reduce((sum, site) => sum + (Number(site.blurred) || 0), 0);
  const score = siteScanned ? Math.max(0, Math.min(100, Math.round(100 * (1 - siteBlurred / siteScanned)))) : 100;
  const wellnessCard = document.getElementById("wellness-card");
  wellnessCard.classList.toggle("score-mid", score < 85 && score >= 60);
  wellnessCard.classList.toggle("score-low", score < 60);
  document.getElementById("wellness-score").textContent = score;
  document.getElementById("wellness-label").textContent = score >= 85 ? "Your feed looks calm" : score >= 60 ? "Some rough patches" : "A lot of toxic content detected";
  document.getElementById("wellness-hint").textContent = siteScanned ? "Based on " + siteScanned.toLocaleString() + " analyzed comments across " + sites.length + " site" + (sites.length === 1 ? "" : "s") + "." : "Your score will appear after comments are analyzed.";
  const categories = analytics.categories || {};
  const rows = DASHBOARD_CATEGORIES.map((name) => [name, Number(categories[name]) || 0]);
  const total = rows.reduce((sum, [, count]) => sum + Number(count || 0), 0);
  const chart = document.getElementById("category-chart");
  chart.innerHTML = rows.map(([name, count]) => {
    const pct = total ? Math.round(100 * count / total) : 0;
    const safeName = name.replace(/[&<>\"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]));
    return '<div class="chart-row"><span>' + safeName + '</span><div class="bar"><i style="width:' + pct + '%"></i></div><strong>' + pct + '%</strong></div>';
  }).join("");
}

async function checkConnection() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STATUS_TIMEOUT_MS);
  try {
    const res = await fetch(API_HEALTH_URL, { signal: controller.signal });
    setStatus(res.ok);
  } catch {
    setStatus(false);
  } finally {
    clearTimeout(timer);
  }
}

function setStatus(connected) {
  statusEl.classList.toggle("connected", connected);
  statusEl.classList.toggle("disconnected", !connected);
  statusText.textContent = connected ? "Toxicity model connected" : "Model offline · run start_backend.bat";
}

function formatThreshold(value) {
  return Number(value).toFixed(2);
}

function renderThreshold(value) {
  thresholdInput.value = value;
  thresholdValue.textContent = formatThreshold(value);
}

function renderEnabled(enabled) {
  enabledInput.checked = enabled;
  thresholdCard.classList.toggle("disabled", !enabled);
  modeCard.classList.toggle("disabled", !enabled);
}

async function loadSettings() {
  const saved = await chrome.storage.local.get(null);
  const migrateMode = (saved.filterModeVersion || 0) < 2;
  const migrateThreshold = (saved.thresholdVersion || 0) < 1;
  const stored = { ...DEFAULTS, ...saved };
  const updates = {};
  if (migrateMode) {
    stored.filterMode = "blur";
    updates.filterMode = "blur";
    updates.filterModeVersion = 2;
  }
  if (migrateThreshold) {
    const previousThreshold = Number(saved.threshold);
    stored.threshold = Number.isFinite(previousThreshold)
      ? Math.max(DEFAULTS.threshold, previousThreshold)
      : DEFAULTS.threshold;
    stored.thresholdVersion = 1;
    updates.threshold = stored.threshold;
    updates.thresholdVersion = 1;
  }
  if (!["english", "hinglish", "both"].includes(stored.modelMode)) {
    stored.modelMode = DEFAULTS.modelMode;
    updates.modelMode = stored.modelMode;
  }
  if (Object.keys(updates).length) await chrome.storage.local.set(updates);
  renderEnabled(stored.enabled);
  renderThreshold(stored.threshold);
  filterModeInput.value = stored.filterMode;
  modelModeInput.value = stored.modelMode;
}

enabledInput.addEventListener("change", () => {
  const enabled = enabledInput.checked;
  renderEnabled(enabled);
  chrome.storage.local.set({ enabled });
});

thresholdInput.addEventListener("input", () => {
  const threshold = parseFloat(thresholdInput.value);
  thresholdValue.textContent = formatThreshold(threshold);
  chrome.storage.local.set({ threshold, thresholdVersion: 1 });
});

filterModeInput.addEventListener("change", () => {
  chrome.storage.local.set({ filterMode: filterModeInput.value, filterModeVersion: 2 });
});

modelModeInput.addEventListener("change", () => {
  chrome.storage.local.set({ modelMode: modelModeInput.value });
});

loadSettings();
checkConnection();
setInterval(checkConnection, STATUS_REFRESH_MS);
chrome.storage.onChanged.addListener((_changes, area) => { if (area === "local" && !dashboardView.hidden) renderDashboard(); });
