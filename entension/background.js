"use strict";

const API_URL = "http://127.0.0.1:8000/analyze";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "toxicity:analyze") return false;

  const comment = typeof message.comment === "string" ? message.comment.trim() : "";
  if (!comment || comment.length > 10000) {
    sendResponse({ ok: false, error: "Comment is empty or too long." });
    return false;
  }

  fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ comment }),
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`API returned ${response.status}`);
      sendResponse({ ok: true, result: await response.json() });
    })
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});
