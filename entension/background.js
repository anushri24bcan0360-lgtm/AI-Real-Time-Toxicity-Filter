"use strict";

const API_URL = "http://127.0.0.1:8000/analyze";
const EMPTY_ANALYTICS = { scanned: 0, blurred: 0, categories: {}, sites: {} };

function resetAnalytics() {
  chrome.storage.local.set({ analytics: { ...EMPTY_ANALYTICS } }).catch((error) => {
    console.error("[Toxicity Filter] could not reset dashboard analytics:", error);
  });
}

// Reset analytics on install, update, and browser startup.
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === "install" || reason === "update") resetAnalytics();
});

chrome.runtime.onStartup.addListener(resetAnalytics);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "toxicity:analyze") return false;

  const comment = typeof message.comment === "string" ? message.comment.trim() : "";
  const modelMode = ["english", "hinglish", "both"].includes(message.modelMode) ? message.modelMode : "both";
  const requestedThreshold = Number(message.threshold);
  const threshold = Number.isFinite(requestedThreshold) ? Math.min(0.95, Math.max(0.5, requestedThreshold)) : 0.8;
  if (!comment || comment.length > 10000) {
    sendResponse({ ok: false, error: "Comment is empty or too long." });
    return false;
  }

  fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ comment, model_mode: modelMode, threshold }),
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`API returned ${response.status}`);
      sendResponse({ ok: true, result: await response.json() });
    })
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});
