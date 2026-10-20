(() => {
  "use strict";

  // Scan recognized comment and message rows only.
  const BASE_ITEM_SELECTORS = [
    '[data-testid*="comment" i]', '[data-testid*="message" i]',
    '[data-message-id]', '[data-comment-id]', '[data-message-author-role]',
    '[data-a-target="chat-line"]', '[data-e2e="chat-message"]',
    '[class~="comment" i]', '[class*="comment-item" i]', '[class*="message-item" i]',
    '[class*="chat-message" i]', '[class*="chat-line" i]',
    'ytd-comment-view-model', 'ytd-live-chat-text-message-renderer',
  ];
  const BASE_BODY_SELECTORS = [
    '[data-testid*="comment-text" i]', '[data-testid*="message-text" i]',
    '[data-testid*="message-body" i]', '[data-a-target="chat-line-message-body"]',
    '[class*="comment-text" i]', '[class*="message-text" i]', '[class*="message-body" i]',
  ];
  const PLATFORM_ADAPTERS = [
    {
      hosts: ["x.com", "twitter.com"],
      items: [
        'article[data-testid="tweet"]', 'article[role="article"]', '[data-testid="tweet"]',
        '[data-testid="messageEntry"]',
      ],
      bodies: [
        '[data-testid="tweetText"]', '[data-testid="messageEntry"] [dir="auto"]',
        '[data-testid="messageEntry"] [data-testid*="messageText" i]',
        '[data-testid^="message-text-" i]', '[data-testid*="messageText" i]',
        '[data-testid="messageText"]', 'article span[dir="auto"]', '[lang][dir] span',
      ],
    },
    { hosts: ["youtube.com"], items: ["ytd-comment-thread-renderer", "yt-live-chat-text-message-renderer"],
      bodies: ["#content-text", "#message", "#message-content"] },
    { hosts: ["reddit.com"], items: ["shreddit-comment", '[data-testid="comment"]'],
      bodies: ['[slot="comment"]', '[data-click-id="text"]', '[data-testid="comment"] p'] },
    {
      hosts: ["facebook.com"],
      items: [
        "[data-ad-rendering-role='comment']", "[data-commentid]", "[data-comment-id]",
        "[aria-label^='Comment by' i]", "[aria-label^='Reply by' i]",
      ],
      bodies: [
        '[data-ad-comet-preview="message"]', '[data-ad-preview="message"]',
        "[dir='auto']",
      ],
    },
    { hosts: ["threads.net", "threads.com"], items: ["div[role='article']", "[data-pressable-container='true']"],
      bodies: ["[dir='auto']"] },
    { hosts: ["whatsapp.com"], items: [".message", ".message-in", ".message-out"],
      bodies: [".copyable-text", ".selectable-text"] },
    {
      hosts: ["telegram.org"],
      items: [
        ".bubble:not(.service):not(.is-date)", ".MessageList .Message:not(.ActionMessage)",
        "[data-message-id]", ".message", ".message-in", ".message-out",
      ],
      bodies: [
        ".text-content", ".message-content", ".translatable-message", ".message",
        "[dir='auto']",
      ],
    },
  ];
  const INSTAGRAM_HOST = /(^|\.)instagram\.com$/i.test(location.hostname);
  const IS_X = hostMatches("x.com") || hostMatches("twitter.com");
  const PLATFORM = PLATFORM_ADAPTERS.find(({ hosts }) => hosts.some(hostMatches));
  // Instagram requires stricter comment boundaries.
  const genericSelectors = INSTAGRAM_HOST ? [] : BASE_ITEM_SELECTORS;
  const genericBodies = INSTAGRAM_HOST ? [] : BASE_BODY_SELECTORS;
  const ITEM_SELECTOR = [...genericSelectors, ...(PLATFORM?.items || [])].join(",") || ":not(*)";
  const BODY_SELECTOR = [...genericBodies, ...(PLATFORM?.bodies || [])].join(",") || ":not(*)";
  const ACCOUNT_LABEL_SELECTOR = [
    "[data-testid*='author' i]", "[data-testid*='username' i]", "[class*='author' i]",
    "[class*='username' i]", "[id*='author' i]", "[role='heading']", "h1", "h2",
  ].join(",");
  const INSTAGRAM_COMMENT_ROW_SELECTOR = "li, [role='listitem']";
  const INSTAGRAM_BUBBLE_SELECTOR = "main [dir='auto'], article [dir='auto'], [role='dialog'] [dir='auto'], [role='log'] [dir='auto']";
  const INSTAGRAM_VIEWPORT_SELECTOR = [
    "main li", "main [role='listitem']", "article li", "article [role='listitem']",
    "[role='dialog'] li", "[role='dialog'] [role='listitem']", INSTAGRAM_BUBBLE_SELECTOR,
  ].join(",");
  const INSTAGRAM_RESERVED_PROFILE_PATHS = new Set([
    "about", "accounts", "api", "challenge", "direct", "emails", "explore",
    "legal", "locations", "p", "privacy", "reel", "reels", "stories", "tags",
    "terms", "tv",
  ]);
  const defaults = { enabled: true, threshold: 0.8, thresholdVersion: 1, filterMode: "blur", filterModeVersion: 2, modelMode: "both" };
  let seen = new WeakMap();
  let requestTokens = new WeakMap();
  const hidden = new WeakMap();
  const hiddenElements = new Set();
  let settings = { ...defaults };
  let pending = [];
  let active = 0;
  const MAX_ACTIVE = 4;
  let storageQueue = Promise.resolve();
  const BLUR_PROPS = [
    "color", "-webkit-text-fill-color", "text-shadow", "--toxicity-ink", "--toxicity-blur-radius",
    "--toxicity-label-surface", "transition", "cursor", "position",
  ];
  const HIDE_PROPS = ["visibility", "position"];
  const EXEMPT_PROPS = ["--toxicity-exempt-color", "color", "-webkit-text-fill-color", "text-shadow"];

  function hostMatches(host) {
    return location.hostname === host || location.hostname.endsWith(`.${host}`);
  }

  function parseUrl(href) {
    try { return new URL(href, location.origin); } catch { return null; }
  }

  function isXMessagesContext() {
    return IS_X && /^\/messages(?:\/|$)/i.test(location.pathname);
  }

  function activeItemSelector() {
    if (!PLATFORM?.hosts.includes("threads.com")) return ITEM_SELECTOR;
    const container = "[data-pressable-container='true']";
    return hostMatches("threads.com") || document.querySelector(container) ? container : "div[role='article']";
  }

  const viewportSelector = () => (INSTAGRAM_HOST ? INSTAGRAM_VIEWPORT_SELECTOR : activeItemSelector());

  function controlLabel(control) {
    return `${control.getAttribute("aria-label") || ""} ${control.getAttribute("title") || ""} ${textOf(control)}`;
  }

  const snapshot = (el, props) => Object.fromEntries(props.map((prop) => [prop, readStyle(el, prop)]));
  const restoreProps = (el, saved, props) => props.forEach((prop) => restoreStyle(el, prop, saved[prop]));
  const restoreAttr = (el, name, value) => (value === null ? el.removeAttribute(name) : el.setAttribute(name, value));

  function isFacebookReelsContext() {
    return hostMatches("facebook.com") && /\/(?:reel|reels)(?:\/|$)/i.test(location.pathname);
  }

  function isFacebookReelCommentItem(item) {
    if (!(item instanceof HTMLElement) || !item.matches("[role='article']")) return false;
    const label = item.getAttribute("aria-label") || "";
    if (/^(?:comment|reply)\s+by\b/i.test(label)) return true;
    if (item.matches("[data-commentid], [data-comment-id]")) return true;
    const hasReplyAction = [...item.querySelectorAll("button, [role='button']")]
      .some((control) => /^\s*reply\b/i.test(controlLabel(control)));
    return hasReplyAction && Boolean(item.querySelector("[dir='auto']"));
  }

  function updateAnalytics(data, wasBlurred) {
    const categories = [...new Set([
      ...Object.keys(data.scores || {}).filter((key) => Number(data.scores[key]) >= Number(settings.threshold)),
      ...(data.flagged_categories || []),
    ])];
    const site = location.hostname || "unknown site";
    storageQueue = storageQueue.then(async () => {
      const { analytics = { scanned: 0, blurred: 0, categories: {}, sites: {} } } = await chrome.storage.local.get("analytics");
      analytics.scanned = (Number(analytics.scanned) || 0) + 1;
      analytics.blurred = (Number(analytics.blurred) || 0) + (wasBlurred ? 1 : 0);
      analytics.categories ||= {};
      analytics.sites ||= {};
      const siteStats = analytics.sites[site] ||= { scanned: 0, blurred: 0 };
      siteStats.scanned++;
      if (wasBlurred) siteStats.blurred++;
      if (wasBlurred) for (const category of categories.length ? categories : (data.flagged_categories || ["toxic"])) {
        const label = category.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
        analytics.categories[label] = (Number(analytics.categories[label]) || 0) + 1;
      }
      await chrome.storage.local.set({ analytics });
    }).catch((err) => console.debug("[Toxicity Filter] analytics update failed:", err.message));
  }

  chrome.storage.local.get(null, (saved) => {
    const updates = {};
    if ((saved.filterModeVersion || 0) < 2) Object.assign(updates, { filterMode: "blur", filterModeVersion: 2 });
    if ((saved.thresholdVersion || 0) < 1) {
      const previous = Number(saved.threshold);
      Object.assign(updates, {
        threshold: Number.isFinite(previous) ? Math.max(defaults.threshold, previous) : defaults.threshold,
        thresholdVersion: 1,
      });
    }
    settings = { ...defaults, ...saved, ...updates };
    if (Object.keys(updates).length) chrome.storage.local.set(updates);
    scan(document.body);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const recheck = Boolean(changes.threshold || changes.filterMode || changes.modelMode || (changes.enabled && changes.enabled.newValue));
    for (const [key, change] of Object.entries(changes)) settings[key] = change.newValue;
    if (!settings.enabled) {
      resetCaches();
      restoreAll();
      return;
    }
    if (recheck) {
      for (const el of [...hiddenElements]) reveal(el);
      resetCaches();
    }
    scan(document.body);
  });

  function resetCaches() {
    seen = new WeakMap();
    requestTokens = new WeakMap();
  }

  function textOf(el) {
    return (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
  }

  function isVisibleTextCandidate(el) {
    if (!(el instanceof Element) || !textOf(el)) return false;
    for (let node = el; node instanceof HTMLElement; node = node.parentElement) {
      if (node.hidden || node.getAttribute("aria-hidden") === "true") return false;
      const style = getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) <= 0.01) return false;
    }
    return true;
  }

  function analysisTextOf(el) {
    if (!isVisibleTextCandidate(el)) return "";
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || parent.closest("[data-toxicity-control], button, time, nav, header, footer, input, textarea, [contenteditable='true']")) {
          return NodeFilter.FILTER_REJECT;
        }
        if (parent.closest(ACCOUNT_LABEL_SELECTOR)) return NodeFilter.FILTER_REJECT;
        const mention = parent.closest("[data-mention], [class*='mention' i], [data-testid*='mention' i]");
        if (mention && isAccountMentionElement(mention)) return NodeFilter.FILTER_REJECT;
        const link = parent.closest("a[href]");
        if (link && isAccountMentionLink(link)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const fragments = [];
    while (walker.nextNode()) {
      const fragment = walker.currentNode.nodeValue || "";
      fragments.push(fragment.replace(/(^|\s)@[\w.-]{2,50}(?=$|\s|[.,!?])/g, "$1 "));
    }
    return fragments.join(" ").replace(/\s+/g, " ").trim();
  }

  function isAccountMentionLink(link) {
    const label = textOf(link);
    if (!label || label.length > 80) return false;
    if (/^@[\w.-]{1,50}$/.test(label)) return true;
    const url = parseUrl(link.href);
    if (!url || url.origin !== location.origin) return false;
    const path = url.pathname.split("/").filter(Boolean);
    if (INSTAGRAM_HOST) return path.length === 1 && !INSTAGRAM_RESERVED_PROFILE_PATHS.has(path[0].toLowerCase());
    if (IS_X) return path.length === 1 && !/^(home|explore|search|notifications|messages)$/i.test(path[0]);
    if (hostMatches("reddit.com")) return path.length === 2 && /^(user|u)$/i.test(path[0]);
    if (hostMatches("youtube.com")) return path.length === 1 && path[0].startsWith("@");
    if (hostMatches("facebook.com")) return path.length === 1 || path[0] === "profile.php";
    return /^@[^/]+$/.test(path[0] || "");
  }

  function isAccountMentionElement(el) {
    if (el.matches("a[href]") && isAccountMentionLink(el)) return true;
    const text = textOf(el);
    if (text.length > 80) return false;
    if (/^@[\w.-]{1,50}$/.test(text)) return true;
    if (el.matches(ACCOUNT_LABEL_SELECTOR)) return true;
    return el.matches("[data-mention], [class*='mention' i], [data-testid*='mention' i]") && /^[\w.-]{1,50}$/.test(text);
  }

  function markAccountMentions(root, state) {
    state.exemptions ||= new Map();
    const nodes = new Set();
    const protectedSelector = `a[href], ${ACCOUNT_LABEL_SELECTOR}, [data-mention], [class*='mention' i], [data-testid*='mention' i], span`;
    if (root.matches(protectedSelector)) nodes.add(root);
    for (const node of root.querySelectorAll(protectedSelector)) nodes.add(node);
    for (const node of nodes) {
      if (!isAccountMentionElement(node)) continue;
      if (!state.exemptions.has(node)) {
        let color = getComputedStyle(node).color;
        if (!color || color === "transparent" || color === "rgba(0, 0, 0, 0)") color = state.textColor || getComputedStyle(root).color;
        state.exemptions.set(node, { attribute: node.getAttribute("data-toxicity-exempt"), ...snapshot(node, EXEMPT_PROPS) });
        for (const prop of EXEMPT_PROPS) setImportantStyle(node, prop, prop === "text-shadow" ? "none" : color);
      }
      node.dataset.toxicityExempt = "true";
    }
  }

  function restoreAccountMentions(state) {
    for (const [node, saved] of state.exemptions || []) {
      if (!node.isConnected) continue;
      if (saved.attribute === null) delete node.dataset.toxicityExempt;
      else node.setAttribute("data-toxicity-exempt", saved.attribute);
      restoreProps(node, saved, EXEMPT_PROPS);
    }
    state.exemptions?.clear();
  }

  const TOXICITY_NAMES = {
    toxic: "Toxic Language", severe_toxic: "Severe Toxicity", obscene: "Obscene Language",
    threat: "Threat", insult: "Insult", identity_hate: "Identity Hate",
  };
  const categoryName = (category) => TOXICITY_NAMES[category] || category.replaceAll("_", " ");

  function assessToxicity(data) {
    const scores = data.scores || {};
    const ranked = Object.entries(scores)
      .filter(([, score]) => Number(score) >= Number(settings.threshold))
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .map(([category]) => categoryName(category));
    const labels = [...new Set([...ranked, ...(data.flagged_categories || []).map(categoryName)])].slice(0, 2);
    const maxScore = Number(data.max_score) || 0;
    const severeScore = Math.max(...["severe_toxic", "threat", "identity_hate"].map((key) => Number(scores[key]) || 0));
    const extreme = maxScore >= 0.97 || severeScore >= 0.9;
    return {
      label: labels.length ? `Contains ${labels.join(" + ")}` : "Potentially Toxic Content",
      level: extreme ? "critical" : maxScore >= 0.85 ? "high" : maxScore >= 0.7 ? "medium" : "low",
      blurRadius: extreme ? 12 : maxScore < 0.7 ? 2 : maxScore < 0.82 ? 4 : maxScore < 0.92 ? 7 : 10,
    };
  }

  function candidates(root) {
    const items = [];
    const itemSelector = activeItemSelector();
    if (root instanceof Element) {
      const ancestorItem = root.closest(itemSelector);
      if (ancestorItem) items.push(ancestorItem);
      if (root.matches(itemSelector) && !items.includes(root)) items.push(root);
    }
    for (const item of root.querySelectorAll?.(itemSelector) || []) items.push(item);
    if (isFacebookReelsContext()) {
      const articles = [...(root.querySelectorAll?.("[role='article']") || []), root];
      for (const item of articles) if (isFacebookReelCommentItem(item) && !items.includes(item)) items.push(item);
    }

    const found = new Set();
    const addIfMessageText = (el, instagramRow = null) => {
      if (!(el instanceof HTMLElement) || el.closest("[data-toxicity-control]")) return false;
      if (!isVisibleTextCandidate(el)) return false;
      if (isAccountMentionElement(el)) return false;
      if (instagramRow) {
        if (el.closest("a, button, time, nav, header, footer, form, textarea, input, [contenteditable='true'], [role='heading']")) return false;
        if (el.closest(ACCOUNT_LABEL_SELECTOR)) return false;
        const nestedControl = el.closest("[role='button']");
        if (nestedControl && nestedControl !== instagramRow &&
            /^(?:like|unlike|reply|replies|more|share|report|translate|follow|hide|delete|save|view replies)(?:\s+\d+)?$/i.test(textOf(nestedControl))) return false;
      } else if (isAccountOrControlText(el) || el.matches(ACCOUNT_LABEL_SELECTOR) || el.closest(ACCOUNT_LABEL_SELECTOR)) return false;
      if (!isNearViewport(el)) return false;
      const { length } = analysisTextOf(el);
      if (length < 2 || length > 2000) return false;
      found.add(el);
      return true;
    };

    // Text spans inside a verified Instagram comment row.
    const addRowText = (row) => {
      for (const textEl of row.querySelectorAll("span")) {
        if (!textEl.querySelector("span") || textEl.matches("[dir='auto']")) addIfMessageText(textEl, row);
      }
    };

    // Prefer explicit message-body fields.
    for (const item of items) {
      if (!isNearViewport(item)) continue;
      const bodies = [...(item.matches(BODY_SELECTOR) ? [item] : []), ...item.querySelectorAll(BODY_SELECTOR)];
      if (bodies.map((body) => addIfMessageText(body)).some(Boolean)) continue;
      for (const leaf of item.querySelectorAll("p, [dir='auto']")) {
        if (leaf.tagName === "P" || isLikelyInstagramBubbleText(leaf) || isKnownLiveChatText(item)) addIfMessageText(leaf);
      }
    }

    // Use visible bubble boundaries for Instagram DMs.
    if (INSTAGRAM_HOST) {
      const scanRoot = root instanceof Element ? root : document.documentElement;
      const rows = scanRoot.querySelectorAll?.(INSTAGRAM_COMMENT_ROW_SELECTOR) || [];
      const commentRows = new Set([scanRoot.closest?.(INSTAGRAM_COMMENT_ROW_SELECTOR), ...rows].filter(Boolean));
      let verifiedRows = 0;
      for (const row of commentRows) {
        if (!isNearViewport(row) || !isLikelyInstagramCommentRow(row)) continue;
        verifiedRows++;
        addRowText(row);
      }

      // Handle Instagram layouts without semantic row elements.
      if (!verifiedRows) {
        const spans = scanRoot.querySelectorAll?.("main span, article span, [role='dialog'] span") || [];
        for (const textEl of new Set([...(scanRoot.matches?.("span") ? [scanRoot] : []), ...spans])) {
          if (!isNearViewport(textEl) || textEl.closest("a, button, time, nav, header, footer, form, textarea, input, [contenteditable='true'], [role='heading'], [data-testid*='author' i], [data-testid*='username' i], [class*='author' i], [class*='username' i], [id*='author' i]")) continue;
          const row = findInstagramCommentRow(textEl);
          if (row) commentRows.add(row);
        }
        for (const row of commentRows) if (isLikelyInstagramCommentRow(row)) addRowText(row);
      }

      if (scanRoot.matches?.("[dir='auto']") && isLikelyInstagramBubbleText(scanRoot)) addIfMessageText(scanRoot);
      for (const textEl of scanRoot.querySelectorAll?.("[dir='auto']") || []) {
        if (isLikelyInstagramBubbleText(textEl)) addIfMessageText(textEl);
      }
    }

    const parentsWithCandidates = new Set();
    for (const el of found) {
      for (let parent = el.parentElement; parent; parent = parent.parentElement) {
        if (found.has(parent)) parentsWithCandidates.add(parent);
      }
    }
    return [...found].filter((el) => !parentsWithCandidates.has(el));
  }

  function isAccountOrControlText(el) {
    return Boolean(el.closest([
      "a", "button", "time", "nav", "header", "footer", "form", "textarea", "input",
      "[contenteditable='true']", "[role='button']", "[role='heading']",
      "[data-testid*='author' i]", "[data-testid*='username' i]",
      "[class*='author' i]", "[class*='username' i]", "[id*='author' i]",
    ].join(",")));
  }

  function isKnownLiveChatText(row) {
    return Boolean(INSTAGRAM_HOST && row.closest("[role='log']")) ||
      (isXMessagesContext() && row.matches('[data-testid*="message" i]'));
  }

  function isLikelyInstagramBubbleText(el) {
    if (isAccountOrControlText(el) || !isNearViewport(el) || !isVisibleTextCandidate(el)) return false;
    for (let node = el, depth = 0; node instanceof HTMLElement && depth < 6; node = node.parentElement, depth++) {
      const style = getComputedStyle(node);
      const radii = style.borderRadius.match(/[\d.]+/g)?.map(Number) || [];
      const rounded = radii.some((radius) => radius >= 8);
      const background = style.backgroundColor.match(/[\d.]+/g);
      const opaqueBackground = background && background.length >= 3 &&
        (background.length === 3 || Number(background[3]) > 0.05);
      const hasGradient = style.backgroundImage !== "none";
      const rect = node.getBoundingClientRect();
      const bubbleSized = rect.width >= 28 && rect.height >= 14 && rect.width < window.innerWidth * 0.95;
      if (rounded && (opaqueBackground || hasGradient) && bubbleSized) return true;
    }
    return false;
  }

  function isLikelyInstagramCommentRow(row) {
    if (!(row instanceof HTMLElement) || row.closest("[data-toxicity-control]") || !isVisibleTextCandidate(row)) return false;
    const text = textOf(row);
    if (text.length < 2 || text.length > 3000) return false;

    const hasProfileLink = [...row.querySelectorAll("a[href]")].some((link) => {
      const segments = parseUrl(link.href)?.pathname.split("/").filter(Boolean) || [];
      return segments.length === 1 && !INSTAGRAM_RESERVED_PROFILE_PATHS.has(segments[0].toLowerCase());
    });
    if (!hasProfileLink) return false;

    const controls = [...row.querySelectorAll("button, [role='button']")];
    const hasReplyAction = controls.some((control) => /reply|repl(y|ies)|respond|responder/i.test(controlLabel(control)));
    const hasLikeAction = controls.some((control) => /^(?:like|unlike)\b/i.test(controlLabel(control).trim()));
    const hasCommentMarker = row.matches("[data-testid*='comment' i], [data-comment-id], [class*='comment' i]") ||
      Boolean(row.querySelector("[data-testid*='comment' i], [data-comment-id]"));
    const hasTimestamp = Boolean(row.querySelector("time, [datetime]"));
    return hasCommentMarker || hasReplyAction || (hasTimestamp && hasLikeAction);
  }

  function findInstagramCommentRow(textEl) {
    for (let node = textEl.parentElement, depth = 0; node instanceof HTMLElement && depth < 9; node = node.parentElement, depth++) {
      const text = textOf(node);
      if (text.length > 3000) break;
      if (isLikelyInstagramCommentRow(node)) return node;
    }
    return null;
  }

  function isNearViewport(el) {
    const rect = el.getBoundingClientRect();
    const buffer = Math.max(window.innerHeight * 0.75, 240);
    return rect.width > 0 && rect.height > 0 && rect.bottom >= -buffer && rect.top <= window.innerHeight + buffer;
  }

  function viewportPriority(el) {
    const rect = el.getBoundingClientRect();
    // 0 when on screen, otherwise the distance to the viewport.
    return Math.max(-rect.bottom, rect.top - window.innerHeight, 0);
  }

  function scan(root) {
    if (!settings.enabled || !root) return;
    const work = candidates(root)
      .map((el) => ({ el, priority: viewportPriority(el) }))
      .sort((a, b) => a.priority - b.priority);
    for (const { el } of work) {
      const state = hidden.get(el);
      if (state && state.mode !== "blur" && !state.revealed) {
        markAccountMentions(el, state);
        continue;
      }
      const text = analysisTextOf(el);
      if (state?.mode === "blur" && !state.revealed) {
        setBlurredAppearance(el, state, true);
      }
      if (seen.get(el) === text) continue;
      seen.set(el, text);
      const token = {};
      requestTokens.set(el, token);
      pending.push({ el, text, token });
    }
    drain();
  }

  // Drops every node that already sits inside another node of the list.
  function outermost(nodes) {
    const set = new Set(nodes);
    return nodes.filter((node) => {
      for (let parent = node.parentNode; parent; parent = parent.parentNode) if (set.has(parent)) return false;
      return true;
    });
  }

  const queuedScanRoots = new Set();
  let incrementalScanTimer = null;
  function scheduleIncrementalScan(root) {
    if (!root) return;
    queuedScanRoots.add(root);
    incrementalScanTimer ??= setTimeout(() => {
      incrementalScanTimer = null;
      const roots = [...queuedScanRoots];
      queuedScanRoots.clear();
      const crowded = roots.length > 40;
      for (const scanRoot of outermost(roots)) {
        if (!crowded || !(scanRoot instanceof Element) || isNearViewport(scanRoot)) scan(scanRoot);
      }
    }, 20);
  }

  let documentScanTimer = null;
  function scheduleDocumentScan() {
    documentScanTimer ??= setTimeout(() => {
      documentScanTimer = null;
      scanViewport();
    }, 80);
  }

  function scanViewport() {
    const near = (query, test = () => true) =>
      [...document.querySelectorAll(query)].filter((el) => isNearViewport(el) && test(el));
    const targets = [
      ...near(activeItemSelector()),
      ...(isFacebookReelsContext() ? near("[role='article']", isFacebookReelCommentItem) : []),
      ...(INSTAGRAM_HOST ? near(INSTAGRAM_COMMENT_ROW_SELECTOR, isLikelyInstagramCommentRow) : []),
      ...(INSTAGRAM_HOST ? near(INSTAGRAM_BUBBLE_SELECTOR, isLikelyInstagramBubbleText) : []),
    ];
    for (const root of outermost([...new Set(targets)])) scan(root);
  }

  // A job is current while its element, text and request token are all unchanged.
  const isCurrent = (job) => job.el.isConnected && settings.enabled &&
    requestTokens.get(job.el) === job.token && seen.get(job.el) === job.text &&
    analysisTextOf(job.el) === job.text;

  function drain() {
    pending.sort((a, b) => viewportPriority(a.el) - viewportPriority(b.el));
    while (active < MAX_ACTIVE && pending.length) {
      const job = pending.shift();
      if (!isCurrent(job) || !isNearViewport(job.el)) {
        if (requestTokens.get(job.el) === job.token) {
          requestTokens.delete(job.el);
          if (seen.get(job.el) === job.text) seen.delete(job.el);
        }
        continue;
      }
      active++;
      Promise.resolve()
        .then(() => chrome.runtime.sendMessage({ type: "toxicity:analyze", comment: job.text, modelMode: settings.modelMode, threshold: settings.threshold }))
        .then((response) => {
          if (!response?.ok) throw new Error(response?.error || "Analysis request failed");
          return response.result;
        })
        .then((data) => {
          if (!data || !isCurrent(job)) return;
          const flagged = Boolean(data.is_toxic) || Number(data.max_score) >= Number(settings.threshold);
          updateAnalytics(data, flagged);
          if (flagged) conceal(job.el, assessToxicity(data));
          else reveal(job.el);
        })
        .catch((err) => {
          if (requestTokens.get(job.el) === job.token) {
            requestTokens.delete(job.el);
            seen.delete(job.el);
          }
          console.debug("[Toxicity Filter] analysis failed:", err.message);
        })
        .finally(() => { active--; drain(); });
    }
  }

  function conceal(el, assessment) {
    if (isAccountMentionElement(el)) return;
    if (!assessment) assessment = assessToxicity({ max_score: Number(settings.threshold), scores: {} });
    const requestedMode = settings.filterMode === "hide" ? "hide" : "blur";
    const current = hidden.get(el);
    if (current) {
      if (current.mode !== requestedMode) {
        reveal(el);
        conceal(el, assessment);
      } else {
        current.assessment = assessment;
        if (current.mode === "blur" && !current.revealed) setBlurredAppearance(el, current, true);
        else if (current.mode !== "blur" && current.revealed) hideAgain(el, current);
      }
      return;
    }
    const state = {
      mode: requestedMode,
      assessment,
      revealed: false,
      old: {
        ...snapshot(el, ["visibility", ...BLUR_PROPS]),
        title: el.getAttribute("title"),
        tabindex: el.getAttribute("tabindex"),
      },
    };

    if (requestedMode !== "blur") {
      state.control = createHideControl(el, assessment);
      state.showOnInput = (event) => {
        if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
        consumeToggleEvent(event);
        revealHideItem(el, state);
      };
      hideAgain(el, state);
    } else {
      if (el.tabIndex < 0) el.setAttribute("tabindex", "0");
      setBlurredAppearance(el, state, true);
    }

    hidden.set(el, state);
    hiddenElements.add(el);
  }

  function createHideControl(el, assessment) {
    const { color, fontFamily } = getComputedStyle(el);
    const [border, fill, shadow] = getBackgroundSurface(el).dark
      ? ["rgba(255,255,255,.2)", "rgba(255,255,255,.12)", "0 1px 4px rgba(0,0,0,.22)"]
      : ["rgba(15,23,42,.16)", "rgba(15,23,42,.08)", "0 1px 4px rgba(15,23,42,.12)"];
    const control = document.createElement("span");
    control.dataset.toxicityControl = "true";
    control.setAttribute("role", "button");
    control.setAttribute("tabindex", "0");
    control.setAttribute("aria-label", `${assessment.label}. Activate to show the content.`);
    control.style.cssText = `position: absolute; inset: 0; z-index: 2147483647; display: flex; align-items: center;
      justify-content: center; visibility: visible; pointer-events: auto; cursor: pointer; color: ${color};
      font-family: ${fontFamily}; font-size: 12px; font-weight: 500; line-height: 1.3; max-width: 90%;
      overflow: hidden; text-overflow: ellipsis;`;
    const chip = document.createElement("span");
    chip.style.cssText = `padding: 4px 10px; border: 1px solid ${border}; border-radius: 999px; background: ${fill};
      color: inherit; font: inherit; white-space: nowrap; max-width: 100%; overflow: hidden;
      text-overflow: ellipsis; box-shadow: ${shadow};`;
    chip.textContent = `${assessment.label} · 👁 Show anyway`;
    control.append(chip);
    return control;
  }

  function getBackgroundSurface(el) {
    for (let node = el; node instanceof Element; node = node.parentElement) {
      const color = getComputedStyle(node).backgroundColor;
      const values = color.match(/[\d.]+/g);
      if (!values || values.length < 3 || (values.length > 3 && Number(values[3]) === 0)) continue;
      const [r, g, b] = values.slice(0, 3).map(Number);
      return { color, dark: (0.2126 * r + 0.7152 * g + 0.0722 * b) < 128 };
    }
    const dark = matchMedia("(prefers-color-scheme: dark)").matches;
    return { color: dark ? "rgb(30, 41, 59)" : "rgb(248, 250, 252)", dark };
  }

  function consumeToggleEvent(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  let pendingPointerClick = null;

  function toggleBlurredContent(event) {
    // Pointer events keep tap-to-reveal working across social sites.
    if (event.type === "pointerup") {
      pendingPointerClick = null;
      if (event.button !== 0 || event.isPrimary === false) return;
    }
    if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
    const path = event.composedPath?.() || [event.target];
    for (let index = 0; index < path.length; index++) {
      const node = path[index];
      if (!(node instanceof Element)) continue;
      const state = hidden.get(node);
      if (state?.mode !== "blur") continue;
      if (event.type === "keydown" && event.target !== node) return;
      // Keep links and embedded controls interactive.
      const targetPath = path.slice(0, index + 1);
      if (targetPath.some((target) => target instanceof Element && target.matches(
        'a[href], button, input, textarea, select, img, video, audio, [role="button"], [contenteditable="true"], [data-toxicity-control], [data-toxicity-exempt="true"]',
      ))) return;
      if (event.type === "pointerup") {
        const activation = { el: node, at: performance.now() };
        pendingPointerClick = activation;
        setTimeout(() => {
          if (pendingPointerClick === activation) pendingPointerClick = null;
        }, 800);
      }
      consumeToggleEvent(event);
      state.revealed = !state.revealed;
      setBlurredAppearance(node, state, !state.revealed);
      return;
    }
  }

  function suppressPointerClick(event) {
    if (event.detail === 0) return;
    const activation = pendingPointerClick;
    pendingPointerClick = null;
    if (!activation || performance.now() - activation.at > 800) return;
    if ((event.composedPath?.() || [event.target]).includes(activation.el)) consumeToggleEvent(event);
  }

  // Prevent pointer and click handlers from toggling reveal twice.
  window.addEventListener("pointerup", toggleBlurredContent, true);
  window.addEventListener("click", suppressPointerClick, true);
  window.addEventListener("keydown", toggleBlurredContent, true);

  const CLICK_AND_KEY = ["click", "keydown"];
  const listen = (target, handler, capture = false) =>
    CLICK_AND_KEY.forEach((type) => target.addEventListener(type, handler, capture));
  const unlisten = (target, handler, capture = false) =>
    CLICK_AND_KEY.forEach((type) => target.removeEventListener(type, handler, capture));

  // Shared by "Show anyway" and reveal(): put a hide-mode element back as it was.
  function showHiddenItem(el, state) {
    unlisten(state.control, state.showOnInput);
    state.control.remove();
    delete el.dataset.toxicityHidden;
    restoreProps(el, state.old, HIDE_PROPS);
    restoreAccountMentions(state);
  }

  function revealHideItem(el, state) {
    showHiddenItem(el, state);
    if (el.tabIndex < 0) el.setAttribute("tabindex", "0");
    state.revealed = true;

    state.hideOnInput = (event) => {
      if (event.type === "keydown" && (event.target !== el || !["Enter", " "].includes(event.key))) return;
      if (event.target instanceof Element && event.target.closest('[data-toxicity-exempt="true"]')) return;
      consumeToggleEvent(event);
      hideAgain(el, state);
    };
    listen(el, state.hideOnInput, true);
  }

  function hideAgain(el, state) {
    unlisten(el, state.hideOnInput, true);
    if (getComputedStyle(el).position === "static") el.style.setProperty("position", "relative", "important");
    markAccountMentions(el, state);
    el.dataset.toxicityHidden = "true";
    el.style.setProperty("visibility", "hidden", "important");
    el.append(state.control);
    state.revealed = false;
    listen(state.control, state.showOnInput);
  }

  function readStyle(el, property) {
    return { value: el.style.getPropertyValue(property), priority: el.style.getPropertyPriority(property) };
  }

  function restoreStyle(el, property, saved) {
    if (saved.value) el.style.setProperty(property, saved.value, saved.priority);
    else el.style.removeProperty(property);
  }

  const BLUR_DATASET_KEYS = ["toxicityBlurred", "toxicityLabel", "toxicityLevel", "toxicityTheme"];

  function setBlurredAppearance(el, state, blurred) {
    if (blurred) {
      const computed = getComputedStyle(el);
      state.textColor ||= computed.color;
      markAccountMentions(el, state);
      if (computed.position === "static") setImportantStyle(el, "position", "relative");
      setImportantStyle(el, "--toxicity-ink", state.textColor);
      setImportantStyle(el, "--toxicity-blur-radius", `${state.assessment.blurRadius}px`);
      setImportantStyle(el, "color", "transparent");
      setImportantStyle(el, "-webkit-text-fill-color", "transparent");
      setImportantStyle(el, "text-shadow", `0 0 ${state.assessment.blurRadius}px ${state.textColor}`);
      setImportantStyle(el, "transition", "color 120ms ease, text-shadow 120ms ease");
      setImportantStyle(el, "cursor", "pointer");
      const revealAction = matchMedia("(hover: none), (pointer: coarse)").matches ? "Tap" : "Click";
      Object.assign(el.dataset, {
        toxicityBlurred: "true",
        toxicityLabel: `${state.assessment.label} · ${revealAction} to reveal`,
        toxicityLevel: state.assessment.level,
      });
      const surface = getBackgroundSurface(el);
      el.dataset.toxicityTheme = surface.dark ? "dark" : "light";
      setImportantStyle(el, "--toxicity-label-surface", surface.color);
    } else {
      restoreProps(el, state.old, BLUR_PROPS);
      for (const key of BLUR_DATASET_KEYS) delete el.dataset[key];
      restoreAccountMentions(state);
    }
  }

  function setImportantStyle(el, property, value) {
    if (el.style.getPropertyValue(property) !== value || el.style.getPropertyPriority(property) !== "important") {
      el.style.setProperty(property, value, "important");
    }
  }

  function reveal(el) {
    const state = hidden.get(el);
    if (!state) return;
    if (state.mode !== "blur") {
      unlisten(el, state.hideOnInput, true);
      showHiddenItem(el, state);
    } else {
      setBlurredAppearance(el, state, false);
      restoreAttr(el, "title", state.old.title);
    }
    restoreAttr(el, "tabindex", state.old.tabindex);
    hidden.delete(el);
    hiddenElements.delete(el);
  }

  function restoreAll() {
    for (const el of [...hiddenElements]) reveal(el);
    pending = [];
  }

  const observedRoots = new WeakSet();
  const observedViewportCandidates = new WeakSet();
  const viewportObserver = typeof IntersectionObserver === "function"
    ? new IntersectionObserver((entries) => {
      for (const { isIntersecting, target } of entries) if (isIntersecting) scheduleIncrementalScan(target);
    }, { rootMargin: "500px 0px" })
    : null;
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "attributes") {
        const state = hidden.get(m.target);
        if (state?.mode === "blur" && !state.revealed) setBlurredAppearance(m.target, state, true);
        observeViewportCandidate(m.target);
        scheduleIncrementalScan(m.target);
      }
      if (m.type === "characterData") scheduleIncrementalScan(m.target.parentElement);
      for (const node of m.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // The document already observes this subtree.
          scheduleIncrementalScan(node);
          observeViewportCandidates(node);
          observeShadowRoots(node);
        }
        else if (node.nodeType === Node.TEXT_NODE) scheduleIncrementalScan(m.target);
      }
    }
  });

  function observeShadowRoots(root) {
    if (!root?.querySelectorAll) return;
    for (const el of [root, ...root.querySelectorAll("*")]) if (el.shadowRoot) observeTree(el.shadowRoot);
  }

  function observeTree(root) {
    if (!root) return;
    if (!observedRoots.has(root)) {
      observedRoots.add(root);
      observer.observe(root, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: [
          "style", "class", "role", "dir", "data-testid", "data-message-id",
          "data-comment-id", "data-commentid", "data-message-author-role", "data-e2e", "data-a-target", "data-pressable-container", "aria-label",
        ],
      });
    }
    scheduleIncrementalScan(root);
    observeViewportCandidates(root);
    observeShadowRoots(root);
  }

  function observeViewportCandidate(el) {
    if (!viewportObserver || !(el instanceof Element) || observedViewportCandidates.has(el)) return;
    if (!el.matches(viewportSelector())) return;
    observedViewportCandidates.add(el);
    viewportObserver.observe(el);
  }

  function observeViewportCandidates(root) {
    if (!viewportObserver || !root) return;
    observeViewportCandidate(root);
    for (const el of root.querySelectorAll?.(viewportSelector()) || []) observeViewportCandidate(el);
  }

  observeTree(document.documentElement);
  if (!viewportObserver) {
    document.addEventListener("scroll", scheduleDocumentScan, { capture: true, passive: true });
  }
  window.addEventListener("resize", scheduleDocumentScan, { passive: true });
  window.addEventListener("pageshow", scheduleDocumentScan);
  window.addEventListener("load", scheduleDocumentScan, { once: true });
  setTimeout(scheduleDocumentScan, 500);
  setTimeout(scheduleDocumentScan, 1500);
})();
