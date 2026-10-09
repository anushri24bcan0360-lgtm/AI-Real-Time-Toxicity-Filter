const API_HEALTH_URL = "http://127.0.0.1:8000/";
const STATUS_TIMEOUT_MS = 2000;
const STATUS_REFRESH_MS = 5000;

const DEFAULTS = { enabled: true, threshold: 0.6, filterMode: "blur", filterModeVersion: 2 };

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
  const rows = Object.entries(categories).sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((sum, [, count]) => sum + Number(count || 0), 0);
  const chart = document.getElementById("category-chart");
  chart.innerHTML = total ? rows.map(([name, count]) => {
    const pct = Math.round(100 * count / total);
    const safeName = name.replace(/[&<>\"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]));
    return '<div class="chart-row"><span>' + safeName + '</span><div class="bar"><i style="width:' + pct + '%"></i></div><strong>' + pct + '%</strong></div>';
  }).join("") : "No flagged comments yet.";
}

// ---------- Connection status ----------
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

// ---------- Settings ----------
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
  const stored = { ...DEFAULTS, ...saved };
  if (migrateMode) {
    stored.filterMode = "blur";
    chrome.storage.local.set({ filterMode: "blur", filterModeVersion: 2 });
  }
  renderEnabled(stored.enabled);
  renderThreshold(stored.threshold);
  filterModeInput.value = stored.filterMode;
}

enabledInput.addEventListener("change", () => {
  const enabled = enabledInput.checked;
  renderEnabled(enabled);
  chrome.storage.local.set({ enabled });
});

// Update the label live while dragging, save to storage on every change
thresholdInput.addEventListener("input", () => {
  const threshold = parseFloat(thresholdInput.value);
  thresholdValue.textContent = formatThreshold(threshold);
  chrome.storage.local.set({ threshold });
});

filterModeInput.addEventListener("change", () => {
  chrome.storage.local.set({ filterMode: filterModeInput.value, filterModeVersion: 2 });
});

// ---------- Init ----------
loadSettings();
checkConnection();
setInterval(checkConnection, STATUS_REFRESH_MS);
chrome.storage.onChanged.addListener((_changes, area) => { if (area === "local" && !dashboardView.hidden) renderDashboard(); });
