(() => {
  "use strict";

  // Shared selectors require an explicit comment/message identity. Broad text
  // selectors such as p, [dir=auto], or #message are only used inside a known row.
  const BASE_ITEM_SELECTORS = [
    '[data-testid*="comment" i]', '[data-testid*="message" i]',
    '[data-message-id]', '[data-comment-id]', '[data-message-author-role]',
    '[data-a-target="chat-line"]', '[data-e2e="chat-message"]',
    '[class~="comment" i]', '[class*="comment-item" i]', '[class*="message-item" i]',
    '[class*="chat-message" i]', '[class*="chat-line" i]',
    'ytd-comment-view-model', 'ytd-live-chat-text-message-renderer',
  ];
  const EXPLICIT_CHAT_ITEM_SELECTOR = [
    '[data-testid*="message" i]', '[data-message-id]', '[data-message-author-role]',
    '[data-a-target="chat-line"]', '[data-e2e="chat-message"]',
    '[class*="message-item" i]', '[class*="chat-message" i]', '[class*="chat-line" i]',
    '.message-in', '.message-out', '.msg-s-message-list__event',
  ].join(",");
  const EXPLICIT_COMMENT_ITEM_SELECTOR = [
    '[data-testid*="comment" i]', '[data-comment-id]', '[data-e2e*="comment" i]',
    '[data-test-id*="comment" i]', '[data-ad-rendering-role="comment"]',
    '[class~="comment" i]', '[class*="comment-item" i]',
    ".comments-comment-item", "shreddit-comment", "ytd-comment-view-model",
  ].join(",");
  const BASE_BODY_SELECTORS = [
    '[data-testid*="comment-text" i]', '[data-testid*="message-text" i]',
    '[data-testid*="message-body" i]', '[data-a-target="chat-line-message-body"]',
    '[class*="comment-text" i]', '[class*="message-text" i]', '[class*="message-body" i]',
  ];
  const PLATFORM_ADAPTERS = [
    {
      hosts: ["instagram.com"],
      items: [],
      bodies: [],
    },
    {
      hosts: ["x.com", "twitter.com"],
      items: ['article[data-testid="tweet"]', '[data-testid="messageEntry"]'],
      bodies: ['[data-testid="tweetText"]', '[data-testid="messageEntry"] [dir="auto"]', '[data-testid="messageText"]'],
      repliesOnly: true,
    },
    {
      hosts: ["youtube.com"],
      items: ["ytd-comment-thread-renderer", "yt-live-chat-text-message-renderer"],
      bodies: ["#content-text", "#message", "#message-content"],
    },
    {
      hosts: ["reddit.com"],
      items: ["shreddit-comment", '[data-testid="comment"]'],
      bodies: ['[slot="comment"]', '[data-click-id="text"]', '[data-testid="comment"] p'],
    },
    {
      hosts: ["facebook.com"],
      items: ["[data-ad-rendering-role='comment']"],
      bodies: ['[data-ad-comet-preview="message"]', "[data-ad-rendering-role='comment'] [dir='auto']"],
    },
    {
      hosts: ["threads.net"],
      items: ["div[role='article']"],
      bodies: ["[dir='auto']"],
      repliesOnly: true,
    },
    {
      hosts: ["tiktok.com"],
      items: [
        '[data-e2e="comment-item"]', '[data-e2e="comment-level-1"]',
        '[data-e2e="comment-level-2"]', '[data-e2e="chat-item"]',
        '[data-e2e="chat-line"]', '[data-e2e="chat-message"]',
        '[data-e2e*="comment" i]', '[data-e2e*="chat" i]',
      ],
      bodies: [
        '[data-e2e="comment-text"]', '[data-e2e="comment-level-1"]',
        '[data-e2e="comment-level-2"]', '[data-e2e="chat-message"]',
        '[data-e2e*="comment-text" i]', '[data-e2e*="chat-message" i]',
      ],
    },
    {
      hosts: ["discord.com", "discordapp.com"],
      items: ["li[id^='chat-messages-']", "[id^='chat-messages-']"],
      bodies: ["[id^='message-content-']", "[class*='messageContent']"],
    },
    {
      hosts: ["twitch.tv"],
      items: ['[data-test-selector="chat-line-message"]'],
      bodies: ['[data-a-target="chat-line-message-body"]', '[data-a-target="chat-line-message"]'],
    },
    {
      hosts: ["linkedin.com"],
      items: [".comments-comment-item", '[data-test-id*="comment" i]', ".msg-s-message-list__event"],
      bodies: [
        ".comments-comment-item__comment-text", ".comments-comment-item__main-content",
        '[data-test-id*="comment" i] [dir="auto"]', ".msg-s-message-list__event [dir='auto']",
      ],
    },
    {
      hosts: ["bsky.app"],
      items: ["[data-testid*='postThreadItem']"],
      bodies: ["[data-testid='postText']"],
      repliesOnly: true,
    },
    {
      hosts: ["mastodon.social", "mastodon.online", "fosstodon.org"],
      items: ["article.status"],
      bodies: [".status__content", ".status__content__text"],
      repliesOnly: true,
    },
    {
      hosts: ["pinterest.com"],
      items: ["[data-test-id*='comment' i]"],
      bodies: ["[data-test-id='comment-body']", "[data-test-id*='comment' i] [dir='auto']"],
    },
    {
      hosts: ["kick.com"],
      items: ["[data-testid='chat-message']", ".chat-entry"],
      bodies: ["[data-testid='chat-message-text']", ".chat-entry-content"],
    },
    {
      hosts: ["whatsapp.com"],
      items: [".message", ".message-in", ".message-out"],
      bodies: [".copyable-text", ".selectable-text"],
    },
    {
      hosts: ["telegram.org"],
      items: [".message", ".message-in", ".message-out"],
      bodies: [".text-content", ".message-content", ".translatable-message"],
    },
    {
      hosts: ["slack.com"],
      items: ["[data-qa='virtual-list-item']", "[data-qa='message_container']"],
      bodies: ["[data-qa='message_content']", ".c-message_kit__message__text"],
    },
    {
      hosts: ["messenger.com"],
      items: ["[data-testid*='message' i]"],
      bodies: ["[data-testid*='message-text' i]", "[data-testid*='message-body' i]"],
    },
  ];
  const INSTAGRAM_HOST = /(^|\.)instagram\.com$/i.test(location.hostname);
  const MASTODON_ADAPTER = PLATFORM_ADAPTERS.find(({ hosts }) => hosts.includes("mastodon.social"));
  const PLATFORM = PLATFORM_ADAPTERS.find(({ hosts }) => hosts.some(hostMatches)) ||
    (document.querySelector("article.status .status__content, article.status .status__prepend") ? MASTODON_ADAPTER : null);
  // Instagram uses generic utility classes in its inbox; only its verified comment
  // rows and rounded message bubbles are safe scan boundaries there.
  const genericSelectors = INSTAGRAM_HOST ? [] : BASE_ITEM_SELECTORS;
  const genericBodies = INSTAGRAM_HOST ? [] : BASE_BODY_SELECTORS;
  const ITEM_SELECTOR = [...genericSelectors, ...(PLATFORM?.items || [])].join(",") || ":not(*)";
  const BODY_SELECTOR = [...genericBodies, ...(PLATFORM?.bodies || [])].join(",") || ":not(*)";
  const ACCOUNT_LABEL_SELECTOR = [
    "[data-testid*='author' i]", "[data-testid*='username' i]", "[class*='author' i]",
    "[class*='username' i]", "[id*='author' i]", "[role='heading']", "h1", "h2",
  ].join(",");
  const INSTAGRAM_COMMENT_ROW_SELECTOR = "li, [role='listitem']";
  const INSTAGRAM_VIEWPORT_SELECTOR = [
    "main li", "main [role='listitem']", "article li", "article [role='listitem']",
    "[role='dialog'] li", "[role='dialog'] [role='listitem']",
    "main [dir='auto']", "article [dir='auto']", "[role='dialog'] [dir='auto']", "[role='log'] [dir='auto']",
  ].join(",");
  const INSTAGRAM_RESERVED_PROFILE_PATHS = new Set([
    "about", "accounts", "api", "challenge", "direct", "emails", "explore",
    "legal", "locations", "p", "privacy", "reel", "reels", "stories", "tags",
    "terms", "tv",
  ]);
  const defaults = { enabled: true, threshold: 0.8, thresholdVersion: 1, filterMode: "blur", filterModeVersion: 2 };
  let seen = new WeakMap();
  let requestTokens = new WeakMap();
  const hidden = new WeakMap();
  const hiddenElements = new Set();
  let settings = { ...defaults };
  let pending = [];
  let active = 0;
  const MAX_ACTIVE = 4;
  let storageQueue = Promise.resolve();

  function hostMatches(host) {
    return location.hostname === host || location.hostname.endsWith(`.${host}`);
  }

  function updateAnalytics(data, wasBlurred) {
    const categories = Object.keys(data.scores || {}).filter((key) => Number(data.scores[key]) >= Number(settings.threshold));
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

  let reportMenu;
  document.addEventListener("contextmenu", (event) => {
    const selection = String(window.getSelection?.() || "").replace(/\s+/g, " ").trim();
    const target = event.target instanceof Element ? event.target : null;
    const targetItem = target?.closest(ITEM_SELECTOR);
    let candidate = target?.closest(BODY_SELECTOR) || targetItem;
    if (PLATFORM?.repliesOnly && (!targetItem || !isTargetItem(targetItem))) candidate = null;
    if (!candidate && INSTAGRAM_HOST && target) {
      const commentText = target.closest("span[dir='auto'], span");
      if (commentText && isLikelyInstagramBubbleText(commentText)) candidate = commentText;
      const commentRow = commentText?.closest(INSTAGRAM_COMMENT_ROW_SELECTOR);
      if (!candidate && commentText && commentRow && isLikelyInstagramCommentRow(commentRow)) candidate = commentText;
    }
    const text = candidate ? (selection || analysisTextOf(candidate)) : "";
    if (!text || text.length < 2 || text.length > 2000 || candidate?.closest("[data-toxicity-control]")) return;
    reportMenu?.remove();
    reportMenu = document.createElement("button");
    reportMenu.type = "button";
    reportMenu.dataset.toxicityControl = "true";
    reportMenu.textContent = "⚑ Report missed toxic comment";
    Object.assign(reportMenu.style, { position: "fixed", left: Math.min(event.clientX, innerWidth - 240) + "px", top: Math.min(event.clientY, innerHeight - 44) + "px", zIndex: "2147483647", padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: "8px", background: "#fff", color: "#0f172a", font: "13px system-ui", boxShadow: "0 4px 16px #0003", cursor: "pointer" });
    reportMenu.addEventListener("click", async () => {
      const { communityFlags = [] } = await chrome.storage.local.get("communityFlags");
      communityFlags.push({ text: text.slice(0, 2000), url: location.href, site: location.hostname, reportedAt: Date.now(), source: "context-menu" });
      await chrome.storage.local.set({ communityFlags });
      reportMenu.textContent = "✓ Report saved on this device";
      setTimeout(() => reportMenu?.remove(), 1300);
    }, { once: true });
    document.documentElement.append(reportMenu);
    event.preventDefault();
  }, true);
  document.addEventListener("click", (event) => { if (reportMenu && event.target !== reportMenu) { reportMenu.remove(); reportMenu = null; } }, true);

  chrome.storage.local.get(null, (saved) => {
    const needsModeMigration = (saved.filterModeVersion || 0) < 2;
    const needsThresholdMigration = (saved.thresholdVersion || 0) < 1;
    settings = { ...defaults, ...saved };
    const updates = {};
    if (needsModeMigration) {
      settings.filterMode = "blur";
      settings.filterModeVersion = 2;
      updates.filterMode = "blur";
      updates.filterModeVersion = 2;
    }
    if (needsThresholdMigration) {
      const previousThreshold = Number(saved.threshold);
      settings.threshold = Number.isFinite(previousThreshold)
        ? Math.max(defaults.threshold, previousThreshold)
        : defaults.threshold;
      settings.thresholdVersion = 1;
      updates.threshold = settings.threshold;
      updates.thresholdVersion = 1;
    }
    if (Object.keys(updates).length) chrome.storage.local.set(updates);
    scan(document.body);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const recheck = Boolean(changes.threshold || changes.filterMode || (changes.enabled && changes.enabled.newValue));
    for (const [key, change] of Object.entries(changes)) settings[key] = change.newValue;
    if (!settings.enabled) {
      seen = new WeakMap();
      requestTokens = new WeakMap();
      pending = [];
      restoreAll();
    }
    else {
      if (recheck) {
        for (const el of [...hiddenElements]) reveal(el);
        seen = new WeakMap();
        requestTokens = new WeakMap();
      }
      scan(document.body);
    }
  });

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
    let url;
    try {
      url = new URL(link.href, location.origin);
    } catch {
      return false;
    }
    if (url.origin !== location.origin) return false;
    const path = url.pathname.split("/").filter(Boolean);
    const host = location.hostname;
    if (INSTAGRAM_HOST) return path.length === 1 && !INSTAGRAM_RESERVED_PROFILE_PATHS.has(path[0].toLowerCase());
    if (hostMatches("x.com") || hostMatches("twitter.com")) return path.length === 1 && !/^(home|explore|search|notifications|messages)$/i.test(path[0]);
    if (hostMatches("reddit.com")) return path.length === 2 && /^(user|u)$/i.test(path[0]);
    if (hostMatches("tiktok.com")) return path.length === 1 && path[0].startsWith("@");
    if (hostMatches("youtube.com")) return path.length === 1 && path[0].startsWith("@");
    if (hostMatches("linkedin.com")) return path.length === 2 && /^(in|company)$/i.test(path[0]);
    if (hostMatches("bsky.app")) return path.length === 2 && path[0] === "profile";
    if (hostMatches("facebook.com")) return path.length === 1 || path[0] === "profile.php";
    if (/^@[^/]+$/.test(path[0] || "")) return true;
    return false;
  }

  function isAccountMentionElement(el) {
    if (el.matches("a[href]") && isAccountMentionLink(el)) return true;
    const text = textOf(el);
    if (text.length > 80) return false;
    if (/^@[\w.-]{1,50}$/.test(text)) return true;
    if (el.matches(ACCOUNT_LABEL_SELECTOR)) return true;
    return el.matches("[data-mention], [class*='mention' i], [data-testid*='mention' i]") && /^[\w.-]{1,50}$/.test(text);
  }

  function isReplyItem(item) {
    if (item.matches("[data-testid*='replying' i], [data-test-id*='replying' i], [aria-label*='replying to' i], [class*='replying' i], .status__prepend")) return true;
    if (item.querySelector("[data-testid*='replying' i], [data-test-id*='replying' i], [aria-label*='replying to' i], [class*='replying' i], .status__prepend")) return true;
    const leadingText = (item.innerText || item.textContent || "").split(/\n+/).slice(0, 4).join(" ").trim();
    return /\b(?:replying to|replied to|responding to)\b/i.test(leadingText.slice(0, 250));
  }

  function isTargetItem(item) {
    if (!PLATFORM?.repliesOnly) return true;
    return item.matches(EXPLICIT_CHAT_ITEM_SELECTOR) || Boolean(item.closest(EXPLICIT_CHAT_ITEM_SELECTOR)) ||
      item.matches(EXPLICIT_COMMENT_ITEM_SELECTOR) || Boolean(item.closest(EXPLICIT_COMMENT_ITEM_SELECTOR)) || isReplyItem(item);
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
        state.exemptions.set(node, {
          attribute: node.getAttribute("data-toxicity-exempt"),
          exemptionColor: readStyle(node, "--toxicity-exempt-color"),
          color: readStyle(node, "color"),
          webkitTextFillColor: readStyle(node, "-webkit-text-fill-color"),
          textShadow: readStyle(node, "text-shadow"),
        });
        setImportantStyle(node, "--toxicity-exempt-color", color);
        setImportantStyle(node, "color", color);
        setImportantStyle(node, "-webkit-text-fill-color", color);
        setImportantStyle(node, "text-shadow", "none");
      }
      node.dataset.toxicityExempt = "true";
    }
  }

  function restoreAccountMentions(state) {
    for (const [node, saved] of state.exemptions || []) {
      if (!node.isConnected) continue;
      if (saved.attribute === null) delete node.dataset.toxicityExempt;
      else node.setAttribute("data-toxicity-exempt", saved.attribute);
      restoreStyle(node, "--toxicity-exempt-color", saved.exemptionColor);
      restoreStyle(node, "color", saved.color);
      restoreStyle(node, "-webkit-text-fill-color", saved.webkitTextFillColor);
      restoreStyle(node, "text-shadow", saved.textShadow);
    }
    state.exemptions?.clear();
  }

  function assessToxicity(data) {
    const names = {
      toxic: "Toxic Language",
      severe_toxic: "Severe Toxicity",
      obscene: "Obscene Language",
      threat: "Threat",
      insult: "Insult",
      identity_hate: "Identity Hate",
    };
    const scores = data.scores || {};
    const categories = Object.entries(scores)
      .filter(([, score]) => Number(score) >= Number(settings.threshold))
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .map(([category]) => names[category] || category.replaceAll("_", " "));
    const fallback = (data.flagged_categories || []).map((category) => names[category] || category.replaceAll("_", " "));
    const labels = [...new Set(categories.length ? categories : fallback)].slice(0, 2);
    const maxScore = Number(data.max_score) || 0;
    const severeScore = Math.max(
      Number(scores.severe_toxic) || 0,
      Number(scores.threat) || 0,
      Number(scores.identity_hate) || 0,
    );
    const extreme = maxScore >= 0.97 || severeScore >= 0.9;
    const blurRadius = extreme ? 12 : maxScore < 0.7 ? 2 : maxScore < 0.82 ? 4 : maxScore < 0.92 ? 7 : 10;
    return {
      maxScore,
      categories: labels,
      label: labels.length ? `Contains ${labels.join(" + ")}` : "Potentially Toxic Content",
      level: extreme ? "critical" : maxScore >= 0.85 ? "high" : maxScore >= 0.7 ? "medium" : "low",
      blurRadius,
      extreme,
      textColor: "",
    };
  }

  function candidates(root) {
    const items = [];
    if (root instanceof Element) {
      const ancestorItem = root.closest(ITEM_SELECTOR);
      if (ancestorItem && isTargetItem(ancestorItem)) items.push(ancestorItem);
      if (root.matches(ITEM_SELECTOR) && !items.includes(root) && isTargetItem(root)) items.push(root);
    }
    if (root.querySelectorAll) {
      for (const item of root.querySelectorAll(ITEM_SELECTOR)) {
        if (isTargetItem(item)) items.push(item);
      }
    }

    const found = new Set();
    const addIfMessageText = (el, instagramRow = null) => {
      if (!(el instanceof HTMLElement) || el.closest("[data-toxicity-control]")) return;
      if (!isVisibleTextCandidate(el)) return;
      if (isAccountMentionElement(el)) return;
      if (instagramRow) {
        if (el.closest("a, button, time, nav, header, footer, form, textarea, input, [contenteditable='true'], [role='heading']")) return;
        if (el.closest(ACCOUNT_LABEL_SELECTOR)) return;
        const nestedControl = el.closest("[role='button']");
        if (nestedControl && nestedControl !== instagramRow &&
            /^(?:like|unlike|reply|replies|more|share|report|translate|follow|hide|delete|save|view replies)(?:\s+\d+)?$/i.test(textOf(nestedControl))) return;
      } else if (isAccountOrControlText(el) || el.matches(ACCOUNT_LABEL_SELECTOR) || el.closest(ACCOUNT_LABEL_SELECTOR)) return;
      if (!isNearViewport(el)) return;
      const text = analysisTextOf(el);
      if (text.length >= 2 && text.length <= 2000) found.add(el);
    };

    // Analyze only explicit message-body fields, or text inside a recognized message row.
    for (const item of items) {
      if (!isNearViewport(item)) continue;
      if (item.matches(BODY_SELECTOR)) addIfMessageText(item);
      for (const body of item.querySelectorAll(BODY_SELECTOR)) addIfMessageText(body);

      if (item.querySelector(BODY_SELECTOR)) continue;
      for (const leaf of item.querySelectorAll("p, [dir='auto']")) {
        if (leaf.tagName === "P" || isLikelyInstagramBubbleText(leaf) || isKnownLiveChatText(leaf, item)) {
          addIfMessageText(leaf);
        }
      }
    }

    // Instagram's DM bubbles lack stable semantic attributes. Require a rounded, visibly
    // styled bubble ancestor so names, navigation labels, and profile text are skipped.
    if (INSTAGRAM_HOST) {
      const scanRoot = root instanceof Element ? root : document.documentElement;
      const commentRows = new Set();
      const ancestorRow = scanRoot.closest?.(INSTAGRAM_COMMENT_ROW_SELECTOR);
      if (ancestorRow) commentRows.add(ancestorRow);
      if (scanRoot.matches?.(INSTAGRAM_COMMENT_ROW_SELECTOR)) commentRows.add(scanRoot);
      for (const row of scanRoot.querySelectorAll?.(INSTAGRAM_COMMENT_ROW_SELECTOR) || []) commentRows.add(row);
      let verifiedRows = 0;
      for (const row of commentRows) {
        if (!isNearViewport(row) || !isLikelyInstagramCommentRow(row)) continue;
        verifiedRows++;
        // Instagram's comment bodies don't have stable test IDs. In a verified
        // comment row, scan text spans outside usernames and action controls.
        for (const textEl of row.querySelectorAll("span[dir='auto'], span")) {
          if (!textEl.querySelector("span") || textEl.matches("[dir='auto']")) {
            addIfMessageText(textEl, row);
          }
        }
      }

      // Some Instagram layouts use nested divs instead of li/listitem rows.
      // When no semantic rows were found, locate compact containers that pair
      // a profile link with a text span and use those as comment boundaries.
      if (!verifiedRows) {
        const textElements = new Set();
        if (scanRoot.matches?.("span")) textElements.add(scanRoot);
        for (const textEl of scanRoot.querySelectorAll?.("main span, article span, [role='dialog'] span") || []) {
          textElements.add(textEl);
        }
        for (const textEl of textElements) {
          if (!isNearViewport(textEl)) continue;
          if (textEl.closest("a, button, time, nav, header, footer, form, textarea, input, [contenteditable='true'], [role='heading'], [data-testid*='author' i], [data-testid*='username' i], [class*='author' i], [class*='username' i], [id*='author' i]")) continue;
          const row = findInstagramCommentRow(textEl);
          if (!row) continue;
          commentRows.add(row);
        }
        for (const row of commentRows) {
          if (!isLikelyInstagramCommentRow(row)) continue;
          for (const textEl of row.querySelectorAll("span[dir='auto'], span")) {
            if (!textEl.querySelector("span") || textEl.matches("[dir='auto']")) {
              addIfMessageText(textEl, row);
            }
          }
        }
      }

      if (scanRoot.matches?.("[dir='auto']") && isLikelyInstagramBubbleText(scanRoot)) addIfMessageText(scanRoot);
      for (const textEl of scanRoot.querySelectorAll?.("[dir='auto']") || []) {
        if (isLikelyInstagramBubbleText(textEl)) addIfMessageText(textEl);
      }
    }

    const unique = [...found];
    const candidateSet = new Set(unique);
    const parentsWithCandidates = new Set();
    for (const el of unique) {
      for (let parent = el.parentElement; parent; parent = parent.parentElement) {
        if (candidateSet.has(parent)) parentsWithCandidates.add(parent);
      }
    }
    return unique.filter((el) => !parentsWithCandidates.has(el));
  }

  function isAccountOrControlText(el) {
    return Boolean(el.closest([
      "a", "button", "time", "nav", "header", "footer", "form", "textarea", "input",
      "[contenteditable='true']", "[role='button']", "[role='heading']",
      "[data-testid*='author' i]", "[data-testid*='username' i]",
      "[class*='author' i]", "[class*='username' i]", "[id*='author' i]",
    ].join(",")));
  }

  function isKnownLiveChatText(el, row) {
    if (INSTAGRAM_HOST && row.closest("[role='log']")) return true;
    if (PLATFORM?.hosts.includes("tiktok.com") && row.matches("[data-e2e*='chat' i]")) return true;
    return false;
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
      try {
        const segments = new URL(link.href, location.origin).pathname.split("/").filter(Boolean);
        return segments.length === 1 && !INSTAGRAM_RESERVED_PROFILE_PATHS.has(segments[0].toLowerCase());
      } catch {
        return false;
      }
    });
    if (!hasProfileLink) return false;

    const controls = [...row.querySelectorAll("button, [role='button']")];
    const hasReplyAction = controls.some((control) => {
      const label = `${control.getAttribute("aria-label") || ""} ${control.getAttribute("title") || ""} ${textOf(control)}`;
      return /reply|repl(y|ies)|respond|responder/i.test(label);
    });
    const hasLikeAction = controls.some((control) => {
      const label = `${control.getAttribute("aria-label") || ""} ${control.getAttribute("title") || ""} ${textOf(control)}`;
      return /^(?:like|unlike)\b/i.test(label.trim());
    });
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
    if (rect.bottom >= 0 && rect.top <= window.innerHeight) return 0;
    if (rect.bottom < 0) return -rect.bottom;
    return rect.top - window.innerHeight;
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

  const queuedScanRoots = new Set();
  let incrementalScanTimer = null;
  function scheduleIncrementalScan(root) {
    if (!root) return;
    queuedScanRoots.add(root);
    if (incrementalScanTimer !== null) return;
    incrementalScanTimer = setTimeout(() => {
      incrementalScanTimer = null;
      const roots = [...queuedScanRoots];
      queuedScanRoots.clear();
      const minimalRoots = roots.filter((root) =>
        !roots.some((other) => other !== root && typeof other.contains === "function" && other.contains(root)),
      );
      if (roots.length > 40) {
        for (const root of minimalRoots) {
          if (!(root instanceof Element) || isNearViewport(root)) scan(root);
        }
        return;
      }
      for (const scanRoot of minimalRoots) scan(scanRoot);
    }, 20);
  }

  let documentScanTimer = null;
  function scheduleDocumentScan() {
    if (documentScanTimer !== null) return;
    documentScanTimer = setTimeout(() => {
      documentScanTimer = null;
      scanViewport();
    }, 80);
  }

  function scanViewport() {
    const targets = new Set();
    if (ITEM_SELECTOR !== ":not(*)") {
      for (const item of document.querySelectorAll(ITEM_SELECTOR)) {
        if (isNearViewport(item)) targets.add(item);
      }
    }

    if (INSTAGRAM_HOST) {
      for (const row of document.querySelectorAll(INSTAGRAM_COMMENT_ROW_SELECTOR)) {
        if (isNearViewport(row) && isLikelyInstagramCommentRow(row)) targets.add(row);
      }
      const bubbleSelector = "main [dir='auto'], article [dir='auto'], [role='dialog'] [dir='auto'], [role='log'] [dir='auto']";
      for (const text of document.querySelectorAll(bubbleSelector)) {
        if (isLikelyInstagramBubbleText(text)) targets.add(text);
      }
    }

    const roots = [...targets];
    const selected = new Set(roots);
    for (const root of roots) {
      let nested = false;
      for (let parent = root.parentElement; parent; parent = parent.parentElement) {
        if (selected.has(parent)) {
          nested = true;
          break;
        }
      }
      if (!nested) scan(root);
    }
  }

  function drain() {
    pending.sort((a, b) => viewportPriority(a.el) - viewportPriority(b.el));
    while (active < MAX_ACTIVE && pending.length) {
      const job = pending.shift();
      if (!job.el.isConnected || !settings.enabled || !isNearViewport(job.el) ||
          requestTokens.get(job.el) !== job.token || seen.get(job.el) !== job.text ||
          analysisTextOf(job.el) !== job.text) {
        if (requestTokens.get(job.el) === job.token) {
          requestTokens.delete(job.el);
          if (seen.get(job.el) === job.text) seen.delete(job.el);
        }
        continue;
      }
      active++;
      Promise.resolve()
        .then(() => chrome.runtime.sendMessage({ type: "toxicity:analyze", comment: job.text }))
        .then((response) => {
          if (!response?.ok) throw new Error(response?.error || "Analysis request failed");
          return response.result;
        })
        .then((data) => {
          if (!data || !settings.enabled || !job.el.isConnected ||
              requestTokens.get(job.el) !== job.token || seen.get(job.el) !== job.text ||
              analysisTextOf(job.el) !== job.text) return;
          const flagged = Number(data.max_score) >= Number(settings.threshold);
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
    if (hidden.has(el)) {
      const current = hidden.get(el);
      if (current.mode !== requestedMode) {
        reveal(el);
        conceal(el, assessment);
        return;
      }
      current.assessment = assessment;
      if (current.mode === "blur") {
        if (!current.revealed) setBlurredAppearance(el, current, true);
      } else if (current.revealed) {
        hideAgain(el, current);
      }
      return;
    }
    const mode = requestedMode;
    const state = {
      mode,
      assessment,
      old: {
        display: readStyle(el, "display"),
        visibility: readStyle(el, "visibility"),
        position: readStyle(el, "position"),
        filter: readStyle(el, "filter"),
        color: readStyle(el, "color"),
        webkitTextFillColor: readStyle(el, "-webkit-text-fill-color"),
        textShadow: readStyle(el, "text-shadow"),
        toxicityInk: readStyle(el, "--toxicity-ink"),
        toxicityBlurRadius: readStyle(el, "--toxicity-blur-radius"),
        toxicityLabelSurface: readStyle(el, "--toxicity-label-surface"),
        transition: readStyle(el, "transition"),
        cursor: readStyle(el, "cursor"),
        title: el.getAttribute("title"),
        tabindex: el.getAttribute("tabindex"),
      },
    };

    if (mode !== "blur") {
      state.revealed = false;
      const control = createHideControl(el, assessment);
      markAccountMentions(el, state);
      if (getComputedStyle(el).position === "static") {
        el.style.setProperty("position", "relative", "important");
      }
      el.dataset.toxicityHidden = "true";
      el.style.setProperty("visibility", "hidden", "important");
      el.append(control);
      const showOnInput = (event) => {
        if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
        consumeToggleEvent(event);
        revealHideItem(el, state);
      };
      state.control = control;
      state.showOnInput = showOnInput;
      bindHideControl(state);
    } else {
      state.revealed = false;
      if (el.tabIndex < 0) el.setAttribute("tabindex", "0");
      setBlurredAppearance(el, state, true);
    }

    hidden.set(el, state);
    hiddenElements.add(el);
  }

  function createHideControl(el, assessment) {
    const pageStyle = getComputedStyle(el);
    const dark = hasDarkBackground(el);
    const control = document.createElement("span");
    control.dataset.toxicityControl = "true";
    control.setAttribute("role", "button");
    control.setAttribute("tabindex", "0");
    control.setAttribute("aria-label", `${assessment.label}. Activate to show the content.`);
    control.textContent = `${assessment.label} · 👁 Show anyway`;
    Object.assign(control.style, {
      position: "absolute",
      inset: "0",
      zIndex: "2147483647",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      visibility: "visible",
      pointerEvents: "auto",
      cursor: "pointer",
      color: pageStyle.color,
      fontFamily: pageStyle.fontFamily,
      fontSize: "12px",
      fontWeight: "500",
      lineHeight: "1.3",
      maxWidth: "90%",
      overflow: "hidden",
      textOverflow: "ellipsis",
    });
    const chip = document.createElement("span");
    Object.assign(chip.style, {
      padding: "4px 10px",
      border: `1px solid ${dark ? "rgba(255,255,255,.2)" : "rgba(15,23,42,.16)"}`,
      borderRadius: "999px",
      background: dark ? "rgba(255,255,255,.12)" : "rgba(15,23,42,.08)",
      color: "inherit",
      font: "inherit",
      whiteSpace: "nowrap",
      maxWidth: "100%",
      overflow: "hidden",
      textOverflow: "ellipsis",
      boxShadow: dark ? "0 1px 4px rgba(0,0,0,.22)" : "0 1px 4px rgba(15,23,42,.12)",
    });
    chip.textContent = control.textContent;
    control.textContent = "";
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

  function hasDarkBackground(el) {
    return getBackgroundSurface(el).dark;
  }

  function consumeToggleEvent(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  let pendingPointerClick = null;

  function toggleBlurredContent(event) {
    // Use pointerup for mouse, pen, and touch. Some social apps cancel the
    // synthesized click while handling their own pointer/touch interactions.
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
      // A blurred message can contain links, media, or embedded controls. Let
      // those targets keep their normal behavior instead of treating them as
      // a request to reveal the whole message.
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

  // Capture the completed pointer action before page-level handlers can cancel
  // the synthesized click. Suppress that same click without toggling twice.
  // Keyboard users activate the focused comment through keydown.
  window.addEventListener("pointerup", toggleBlurredContent, true);
  window.addEventListener("click", suppressPointerClick, true);
  window.addEventListener("keydown", toggleBlurredContent, true);

  function bindHideControl(state) {
    state.control.addEventListener("click", state.showOnInput);
    state.control.addEventListener("keydown", state.showOnInput);
  }

  function unbindHideControl(state) {
    state.control.removeEventListener("click", state.showOnInput);
    state.control.removeEventListener("keydown", state.showOnInput);
  }

  function revealHideItem(el, state) {
    unbindHideControl(state);
    state.control.remove();
    delete el.dataset.toxicityHidden;
    restoreStyle(el, "visibility", state.old.visibility);
    restoreStyle(el, "position", state.old.position);
    restoreAccountMentions(state);
    if (el.tabIndex < 0) el.setAttribute("tabindex", "0");
    state.revealed = true;

    state.hideOnInput = (event) => {
      if (event.type === "keydown" && (event.target !== el || !["Enter", " "].includes(event.key))) return;
      if (event.target instanceof Element && event.target.closest('[data-toxicity-exempt="true"]')) return;
      consumeToggleEvent(event);
      hideAgain(el, state);
    };
    el.addEventListener("click", state.hideOnInput, true);
    el.addEventListener("keydown", state.hideOnInput, true);
  }

  function hideAgain(el, state) {
    el.removeEventListener("click", state.hideOnInput, true);
    el.removeEventListener("keydown", state.hideOnInput, true);
    if (getComputedStyle(el).position === "static") {
      el.style.setProperty("position", "relative", "important");
    }
    markAccountMentions(el, state);
    el.dataset.toxicityHidden = "true";
    el.style.setProperty("visibility", "hidden", "important");
    el.append(state.control);
    state.revealed = false;
    bindHideControl(state);
  }

  function readStyle(el, property) {
    return { value: el.style.getPropertyValue(property), priority: el.style.getPropertyPriority(property) };
  }

  function restoreStyle(el, property, saved) {
    if (saved.value) el.style.setProperty(property, saved.value, saved.priority);
    else el.style.removeProperty(property);
  }

  function setBlurredAppearance(el, state, blurred) {
    if (blurred) {
      const computed = getComputedStyle(el);
      if (!state.textColor) state.textColor = computed.color;
      markAccountMentions(el, state);
      if (computed.position === "static") setImportantStyle(el, "position", "relative");
      setImportantStyle(el, "--toxicity-ink", state.textColor);
      setImportantStyle(el, "--toxicity-blur-radius", `${state.assessment.blurRadius}px`);
      setImportantStyle(el, "color", "transparent");
      setImportantStyle(el, "-webkit-text-fill-color", "transparent");
      setImportantStyle(el, "text-shadow", `0 0 ${state.assessment.blurRadius}px ${state.textColor}`);
      setImportantStyle(el, "transition", "color 120ms ease, text-shadow 120ms ease");
      setImportantStyle(el, "cursor", "pointer");
      el.dataset.toxicityBlurred = "true";
      const revealAction = matchMedia("(hover: none), (pointer: coarse)").matches ? "Tap" : "Click";
      el.dataset.toxicityLabel = `${state.assessment.label} · ${revealAction} to reveal`;
      el.dataset.toxicityLevel = state.assessment.level;
      const surface = getBackgroundSurface(el);
      el.dataset.toxicityTheme = surface.dark ? "dark" : "light";
      setImportantStyle(el, "--toxicity-label-surface", surface.color);
    } else {
      restoreStyle(el, "color", state.old.color);
      restoreStyle(el, "-webkit-text-fill-color", state.old.webkitTextFillColor);
      restoreStyle(el, "text-shadow", state.old.textShadow);
      restoreStyle(el, "--toxicity-ink", state.old.toxicityInk);
      restoreStyle(el, "--toxicity-blur-radius", state.old.toxicityBlurRadius);
      restoreStyle(el, "--toxicity-label-surface", state.old.toxicityLabelSurface);
      restoreStyle(el, "transition", state.old.transition);
      restoreStyle(el, "cursor", state.old.cursor);
      delete el.dataset.toxicityBlurred;
      delete el.dataset.toxicityLabel;
      delete el.dataset.toxicityLevel;
      delete el.dataset.toxicityTheme;
      restoreStyle(el, "position", state.old.position);
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
      unbindHideControl(state);
      el.removeEventListener("click", state.hideOnInput, true);
      el.removeEventListener("keydown", state.hideOnInput, true);
      state.control.remove();
      restoreStyle(el, "visibility", state.old.visibility);
      restoreStyle(el, "position", state.old.position);
      delete el.dataset.toxicityHidden;
      restoreAccountMentions(state);
      if (state.old.tabindex === null) el.removeAttribute("tabindex");
      else el.setAttribute("tabindex", state.old.tabindex);
    } else {
      restoreStyle(el, "color", state.old.color);
      restoreStyle(el, "-webkit-text-fill-color", state.old.webkitTextFillColor);
      restoreStyle(el, "text-shadow", state.old.textShadow);
      restoreStyle(el, "--toxicity-ink", state.old.toxicityInk);
      restoreStyle(el, "--toxicity-blur-radius", state.old.toxicityBlurRadius);
      restoreStyle(el, "--toxicity-label-surface", state.old.toxicityLabelSurface);
      restoreStyle(el, "transition", state.old.transition);
      restoreStyle(el, "cursor", state.old.cursor);
      restoreStyle(el, "position", state.old.position);
      delete el.dataset.toxicityBlurred;
      delete el.dataset.toxicityLabel;
      delete el.dataset.toxicityLevel;
      delete el.dataset.toxicityTheme;
      restoreAccountMentions(state);
      if (state.old.title === null) el.removeAttribute("title");
      else el.setAttribute("title", state.old.title);
      if (state.old.tabindex === null) el.removeAttribute("tabindex");
      else el.setAttribute("tabindex", state.old.tabindex);
    }
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
      for (const entry of entries) {
        if (entry.isIntersecting) scheduleIncrementalScan(entry.target);
      }
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
          // The document (or its shadow root) already observes this subtree.
          // Observing every inserted element again creates overlapping
          // MutationObserver registrations and duplicate scan work on busy feeds.
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
    if (root instanceof Element && root.shadowRoot) observeTree(root.shadowRoot);
    for (const el of root.querySelectorAll("*")) {
      if (el.shadowRoot) observeTree(el.shadowRoot);
    }
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
          "data-comment-id", "data-message-author-role", "data-e2e", "data-a-target",
        ],
      });
    }
    scheduleIncrementalScan(root);
    observeViewportCandidates(root);
    observeShadowRoots(root);
  }

  function observeViewportCandidate(el) {
    if (!viewportObserver || !(el instanceof Element) || observedViewportCandidates.has(el)) return;
    const selector = INSTAGRAM_HOST ? INSTAGRAM_VIEWPORT_SELECTOR : ITEM_SELECTOR;
    if (selector === ":not(*)" || !el.matches(selector)) return;
    observedViewportCandidates.add(el);
    viewportObserver.observe(el);
  }

  function observeViewportCandidates(root) {
    if (!viewportObserver || !root) return;
    observeViewportCandidate(root);
    if (!root.querySelectorAll) return;
    const selector = INSTAGRAM_HOST ? INSTAGRAM_VIEWPORT_SELECTOR : ITEM_SELECTOR;
    if (selector === ":not(*)") return;
    for (const el of root.querySelectorAll(selector)) observeViewportCandidate(el);
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
