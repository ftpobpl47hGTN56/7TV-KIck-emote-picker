// =============================================================================
// content.js  — Kick.com 7TV Emote Picker
//  ✓ Fetches 7TV channel & global emotes via Kick user ID
//  ✓ Injects emote picker button into Kick chat controls
//  ✓ Renders 7TV emotes in Kick chat messages
//  ✓ SPA navigation support via location.href polling
// =============================================================================

(function () {
  'use strict';

  // ─── Config ─────────────────────────────────────────────────────────────────
  const PAGE_SIZE = 300;
  const CDN_7TV   = 'https://cdn.7tv.app/emote/';
 
  const PANEL_ID    = 'sep-emote-panel';
  const BTN_ID      = 'sep-emote-btn';
  const STYLE_ID    = 'sep-emote-style';
  const RENDERED_ATTR = 'data-sep-rendered';


  // ─── Utility ────────────────────────────────────────────────────────────────
  function waitFor(selector, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);
      const obs = new MutationObserver(() => {
        const found = document.querySelector(selector);
        if (found) { obs.disconnect(); resolve(found); }
      });
      obs.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => { obs.disconnect(); reject(new Error('Timeout: ' + selector)); }, timeout);
    });
  }

  // ─── Channel detection (Kick URLs: kick.com/channelname) ────────────────────
  function getChannelName() {
    const path = location.pathname;
     // /popout/channelname/chat → извлечь channelname
    const popoutMatch = path.match(/^\/popout\/([^/?#]+)/);
    if (popoutMatch) return popoutMatch[1].toLowerCase();
    
    const SKIP = new Set([
      'browse','popout', 'categories', 'following', 'subscriptions',
      'settings', 'clips', 'clip', 'dashboard', 'creator-dashboard',
      'search', 'en', 'fr', 'de', 'es', 'pt', 'ko', 'ja', 'ru',
      'api', 'auth', 'terms', 'privacy', 'about',
    ]);
    const m = path.match(/^\/([^/?#]+)/);
    if (m && !SKIP.has(m[1].toLowerCase())) return m[1].toLowerCase();
    return null;
  }

  // ─── Kick API: get channel/user ID ──────────────────────────────────────────
  async function getKickUserId(channelName) {
    try {
      // kick.com/api/v2/channels/{slug} returns the channel object with `id`
      const r = await fetch(`https://kick.com/api/v2/channels/${channelName}`, {
        headers: { 'Accept': 'application/json' },
      });
      if (!r.ok) return null;
      const d = await r.json();
      // The channel user ID is in `d.user_id` or `d.id`
      return d.user_id ? String(d.user_id) : (d.id ? String(d.id) : null);
    } catch (e) {
      console.warn('[SEP] Kick API failed:', e);
      return null;
    }
  }

  // ─── 7TV helpers ────────────────────────────────────────────────────────────
  function parse7TV(emoteSet) {
    return (emoteSet?.emotes || []).map(e => ({
      id: e.id,
      name: e.name,
      src:    `${CDN_7TV}${e.id}/2x.webp`,
      src4x:  `${CDN_7TV}${e.id}/4x.webp`,
      zeroWidth: !!(e.flags & 1) || !!(e.data?.flags & 1),
    }));
  }

  // Try to get 7TV emotes via Kick user ID
  async function fetch7TVByKickId(kickUserId) {
    const r = await fetch(`https://7tv.io/v3/users/kick/${kickUserId}`);
    if (!r.ok) throw new Error(`7TV /users/kick/${kickUserId} → ${r.status}`);
    const d = await r.json();
    if (d.emote_set?.emotes?.length) return parse7TV(d.emote_set);
    if (d.emote_set?.id) {
      const r2 = await fetch(`https://7tv.io/v3/emote-sets/${d.emote_set.id}`);
      if (r2.ok) return parse7TV(await r2.json());
    }
    return [];
  }

  // Fallback: search 7TV by username (GQL)
  async function fetch7TVByKickName(channelName) {
    const r = await fetch('https://7tv.io/v3/gql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `query($q:String!){users(query:$q){id username connections{platform emote_set_id}}}`,
        variables: { q: channelName },
      }),
    });
    if (!r.ok) throw new Error(`7TV GQL → ${r.status}`);
    const d = await r.json();
    const users = d.data?.users || [];
    const user  = users.find(u => u.username?.toLowerCase() === channelName.toLowerCase()) || users[0];
    if (!user) return [];
    // Try KICK connection first, then fall back to any
    const conn = (user.connections || []).find(c => c.platform === 'KICK')
              || (user.connections || [])[0];
    if (!conn?.emote_set_id) return [];
    const r2 = await fetch(`https://7tv.io/v3/emote-sets/${conn.emote_set_id}`);
    if (!r2.ok) return [];
    return parse7TV(await r2.json());
  }

  // ─── Main emote fetcher ──────────────────────────────────────────────────────
  async function fetchAllEmotes(channelName) {
    console.log(`[SEP] 🔍 Fetching emotes for Kick channel: ${channelName}`);

    // ── Step 1: Kick user ID (needed for 7TV lookup) ────────────────────────
    const kickUserId = await getKickUserId(channelName);
    console.log(`[SEP] Kick user ID: ${kickUserId || '(not found)'}`);

    // ── Step 2: 7TV channel emotes ──────────────────────────────────────────
    let sevenTVChannel = [];
    if (kickUserId) {
      try {
        sevenTVChannel = await fetch7TVByKickId(kickUserId);
        console.log(`[SEP] 7TV channel via Kick ID: ${sevenTVChannel.length}`);
      } catch (e) {
        console.warn('[SEP] 7TV by Kick ID failed, trying GQL fallback:', e);
      }
    }
    if (!sevenTVChannel.length) {
      try {
        sevenTVChannel = await fetch7TVByKickName(channelName);
        console.log(`[SEP] 7TV channel via GQL: ${sevenTVChannel.length}`);
      } catch (e) {
        console.warn('[SEP] 7TV GQL fallback also failed:', e);
      }
    }

    // ── Step 3: 7TV global ──────────────────────────────────────────────────
    let sevenTVGlobal = [];
    try {
      const r = await fetch('https://7tv.io/v3/emote-sets/global');
      if (r.ok) sevenTVGlobal = parse7TV(await r.json());
      console.log(`[SEP] 7TV global: ${sevenTVGlobal.length}`);
    } catch (e) { console.warn('[SEP] 7TV global failed', e); }

    // ── Step 4: BTTV global (Kick users don't have BTTV channel emotes) ─────
  

    return {
      sevenTVChannel,
      sevenTVGlobal,
      };
  }

  // ─── State ──────────────────────────────────────────────────────────────────
  const state = {
    activeTab   : '7tv-ch',
    page        : 0,
    query       : '',
    emotesByTab : {
      '7tv-ch'  : [], '7tv-gl'  : [],
     },
    loaded: false,
  };

  function applyFetchResult({ sevenTVChannel, sevenTVGlobal, }) {
    state.emotesByTab['7tv-ch']  = sevenTVChannel;
    state.emotesByTab['7tv-gl']  = sevenTVGlobal;
      console.log('[SEP] ✓ State updated');
  }

  // ─── Panel (mini inline picker) ─────────────────────────────────────────────
  function buildPanel() {
    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.classList.add('sep-hidden');
    panel.innerHTML = `
      <div class="sep-search-wrap">
        <input class="sep-search" placeholder="Search emotes…" autocomplete="off" spellcheck="false"/>
      </div>
      <div class="sep-tabs">
        <div class="sep-tab sep-active" data-tab="7tv-ch">7TV</div>
        <div class="sep-tab" data-tab="7tv-gl">7TV GL</div>
        <div class="sep-tab" data-tab="bttv-ch">BTTV</div>
        <div class="sep-tab" data-tab="bttv-gl">BTTV GL</div>
      </div>
      <div class="sep-grid-wrap">
        <div class="sep-grid"><div class="sep-state">Loading…</div></div>
      </div>
      <div class="sep-pagination">
        <button class="sep-page-btn" id="sep-prev" disabled>&#9664;</button>
        <span class="sep-page-label" id="sep-page-label">— / —</span>
        <button class="sep-page-btn" id="sep-next" disabled>&#9654;</button>
      </div>`;
    document.body.appendChild(panel);
    return panel;
  }

 
  

  function filteredEmotes() {
    const list = state.emotesByTab[state.activeTab] || [];
    if (!state.query) return list;
    const q = state.query.toLowerCase();
    return list.filter(e => e.name.toLowerCase().includes(q));
  }

  function renderGrid(panel) {
    const grid      = panel.querySelector('.sep-grid');
    const prevBtn   = panel.querySelector('#sep-prev');
    const nextBtn   = panel.querySelector('#sep-next');
    const pageLabel = panel.querySelector('#sep-page-label');

    if (!state.loaded) {
      grid.innerHTML = '<div class="sep-state">Loading…</div>';
      prevBtn.disabled = nextBtn.disabled = true;
      pageLabel.textContent = '— / —';
      return;
    }

    const all   = filteredEmotes();
    const total = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
    state.page  = Math.max(0, Math.min(state.page, total - 1));
    const slice = all.slice(state.page * PAGE_SIZE, (state.page + 1) * PAGE_SIZE);

    if (!slice.length) {
      grid.innerHTML = '<div class="sep-state">No emotes found</div>';
      prevBtn.disabled = nextBtn.disabled = true;
      pageLabel.textContent = '0 / 0';
      return;
    }

    const frag = document.createDocumentFragment();
    slice.forEach(emote => {
      const btn = document.createElement('div');
      btn.className = 'sep-emote' + (emote.zeroWidth ? ' sep-emote--zw' : '');
      btn.setAttribute('data-name', emote.name);
      btn.title = emote.name + (emote.zeroWidth ? ' (zero-width)' : '');
      const img = document.createElement('img');
      img.src = emote.src;
      if (emote.src4x) img.srcset = `${emote.src} 2x, ${emote.src4x} 2x`;
      img.alt = emote.name;
      img.loading = 'lazy';
      img.onerror = function() { this.style.display = 'none'; };
      btn.appendChild(img);
      if (emote.zeroWidth) {
        const badge = document.createElement('span');
        badge.className = 'sep-zw-badge'; badge.textContent = 'ZW';
        btn.appendChild(badge);
      }
      btn.addEventListener('click', () => insertEmote(emote.name));
      frag.appendChild(btn);
    });

    grid.innerHTML = '';
    grid.appendChild(frag);
    grid.scrollTop = 0;
    pageLabel.textContent = `${state.page + 1} / ${total}`;
    prevBtn.disabled = state.page === 0;
    nextBtn.disabled = state.page >= total - 1;
  }

  // ─── Wire panel events ───────────────────────────────────────────────────────
  function wirePanel(panel) {
    panel.querySelectorAll('.sep-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        panel.querySelectorAll('.sep-tab').forEach(t => t.classList.remove('sep-active'));
        tab.classList.add('sep-active');
        state.activeTab = tab.dataset.tab;
        state.page = 0; state.query = '';
        panel.querySelector('.sep-search').value = '';
        renderGrid(panel);
      });
    });
    panel.querySelector('#sep-prev').addEventListener('click', () => { state.page--; renderGrid(panel); });
    panel.querySelector('#sep-next').addEventListener('click', () => { state.page++; renderGrid(panel); });
    let searchTimer;
    panel.querySelector('.sep-search').addEventListener('input', e => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.query = e.target.value.trim();
        state.page = 0;
        renderGrid(panel);
      }, 220);
    });
    // Close panel on outside click
    document.addEventListener('click', e => {
      if (!panel.classList.contains('sep-hidden')
          && !panel.contains(e.target)
          && e.target !== document.getElementById(BTN_ID))
        panel.classList.add('sep-hidden');
    });
    panel.addEventListener('click', e => e.stopPropagation());
  }

  // ─── Insert emote into Kick's Lexical chat editor ────────────────────────────
  // Kick uses the Lexical editor (contenteditable + data-lexical-editor).
  // `document.execCommand('insertText')` is intercepted by Lexical's
  // beforeinput handler and works reliably.
  function insertEmote(name) {
    const input = document.querySelector(
      '[data-lexical-editor="true"], [data-testid="chat-input"], .editor-input[contenteditable="true"]'
    );
    if (!input) return;
    input.focus();

    // Move cursor to end
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(input);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);

    // Insert emote name + space
    document.execCommand('insertText', false, name + ' ');
  }

  // ─── Inject picker button ────────────────────────────────────────────────────
  // Target area (from Kick chat HTML):
  //
  //   <div class="flex shrink-0 grow-0 items-center gap-1 lg:w-full lg:gap-0">
  //     <button id="send-message-button">Чат</button>
  //     ...
  //     <div class="ml-auto flex items-center gap-x-2">
  //       <button>[settings]</button>
  //       <button id="kick-bl-toggle">[AutoBan Bot]</button>  ← insert before this
  //     </div>
  //   </div>
  //
  function injectButton() {
    if (document.getElementById(BTN_ID)) return;

    const btn = document.createElement('button');
    btn.id    = BTN_ID;
    btn.type  = 'button';
    btn.title = '7tv Emote Picker';
    // Match Kick's button visual style
    btn.className = [
      'group', 'relative', 'box-border', 'flex', 'shrink-0', 'grow-0',
      'select-none', 'items-center', 'justify-center', 'gap-2',
      'whitespace-nowrap', 'rounded', 'font-semibold', 'ring-0',
      'transition-all', 'focus-visible:outline-none', 'active:scale-[0.95]',
      'disabled:pointer-events-none', 'state-layer-surface', 'bg-transparent',
      'text-white', '[&_svg]:fill-current',
      'lg:data-[state=open]:bg-surface-highest', 'data-[state=active]:bg-surface-highest',
      'size-8', 'text-sm', 'leading-none',
    ].join(' ');

    const img = document.createElement('img');
    img.src = chrome.runtime.getURL('imgs/kickpicker-ndrnhrdhrdh-e4ndt878.png');
    img.alt = '7tv';
    img.style.cssText = 'width:80px;height:50px;display:block;pointer-events:none;object-fit:contain;';
    btn.appendChild(img);

    btn.addEventListener('click', e => {
      e.stopPropagation();
      chrome.runtime.sendMessage({ type: 'OPEN_POPOUT' });
    });

    // ── Strategy 1: Insert before kick-bl-toggle (AutoBan Bot) ───────────────
    const blToggle = document.getElementById('kick-bl-toggle');
    if (blToggle) {
      blToggle.parentElement.insertBefore(btn, blToggle);
      return;
    }

    // ── Strategy 2: Find the .ml-auto buttons area near #send-message-button ──
    const sendBtn = document.getElementById('send-message-button');
    if (!sendBtn) return;

    // Walk up the DOM to find the flex row that contains both the send button
    // and the ml-auto actions div
    let el = sendBtn.parentElement;
    for (let i = 0; i < 6; i++) {
      if (!el) break;
      const mlAuto = el.querySelector('[class*="ml-auto"]');
      if (mlAuto) {
        mlAuto.insertBefore(btn, mlAuto.firstChild);
        return;
      }
      el = el.parentElement;
    }
    console.warn('[SEP] Could not find button insertion point');
  }

  
  // ─── CSS ────────────────────────────────────────────────────────────────────
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
    #${BTN_ID} {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 82px;
      height: 42px;
      border: none;
      border-radius: 4px;
      background: transparent;
      cursor: pointer;
      flex-shrink: 0;
      transition: background 0.15s;
      padding: 0;
    }
    #${BTN_ID}:hover {
      background: rgba(255,255,255,0.1);
    }
    #${BTN_ID} img {
      display: block;
      pointer-events: none;
      width: 80px;
      height: 40px;
      object-fit: contain;
    }

    /* ── Inline picker panel ─────────────────────────────────────── */
    #${PANEL_ID} {
      position: fixed;
      bottom: 80px;
      right: 20px;
      width: 340px;
      height: 420px;
      display: flex;
      flex-direction: column;
      background: #18181b;
      border: 1px solid #3a3a3d;
      border-radius: 6px;
      box-shadow: 0 4px 20px rgba(0,0,0,.6);
      z-index: 9000;
      font-family: Inter, Roobert, sans-serif;
      user-select: none;
      overflow: hidden;
    }
    #${PANEL_ID}.sep-hidden { display: none !important; }

    .sep-search-wrap { padding: 6px 8px; background: #0e0e10; }
    .sep-search {
      width: 100%; box-sizing: border-box;
      background: #1f1f23; border: 1px solid #3a3a3d;
      border-radius: 4px; color: #efeff1;
      font-size: 13px; padding: 5px 8px; outline: none;
    }
    .sep-tabs {
      display: flex; flex-wrap: wrap; gap: 2px;
      padding: 4px 6px; background: #0e0e10;
      border-bottom: 1px solid #3a3a3d;
    }
    .sep-tab {
      padding: 3px 8px; border-radius: 3px;
      font-size: 11px; cursor: pointer; color: #adadb8;
      background: transparent; transition: background .12s;
    }
    .sep-tab:hover { background: rgba(255,255,255,.07); }
    .sep-tab.sep-active { background: #53fc18; color: #000; font-weight: 600; }

    .sep-grid-wrap { flex: 1; overflow: hidden; }
    .sep-grid {
      display: flex; flex-wrap: wrap; gap: 2px;
      padding: 6px; overflow-y: auto; height: 100%;
      box-sizing: border-box; align-content: flex-start;
    }
    .sep-emote {
      width: 36px; height: 36px;
      display: flex; align-items: center; justify-content: center;
      border-radius: 4px; cursor: pointer; transition: background .1s;
    }
    .sep-emote:hover { background: rgba(255,255,255,.12); }
    .sep-emote img { max-width: 32px; max-height: 32px; object-fit: contain; }
    .sep-emote--zw { outline: 1px dashed #9147ff; }
    .sep-zw-badge {
      position: absolute; bottom: 0; right: 0;
      font-size: 8px; background: #9147ff; color: #fff;
      border-radius: 2px; padding: 0 2px; pointer-events: none;
    }
    .sep-state {
      width: 100%; padding: 20px; text-align: center;
      color: #adadb8; font-size: 13px;
    }
    .sep-pagination {
      display: flex; align-items: center; justify-content: center;
      gap: 8px; padding: 5px; border-top: 1px solid #2a2a2d;
      background: #0e0e10;
    }
    .sep-page-btn {
      background: #2a2a2d; border: none; color: #efeff1;
      border-radius: 4px; width: 26px; height: 22px;
      cursor: pointer; font-size: 11px;
    }
    .sep-page-btn:disabled { opacity: .35; cursor: default; }
    .sep-page-label { font-size: 12px; color: #adadb8; min-width: 40px; text-align: center; }

    /* ── Chat emote images ──────────────────────────────────────── */
    .sep-chat-emote {
      vertical-align: middle;
      max-height: 70px;
      width: auto;
      display: inline-block;
      margin: 0 1px;
    }
    .sep-emote-wrap {
      display: inline-block;
      position: relative;
      line-height: 0;
      vertical-align: middle;
    }
    .sep-emote-base {
       height: 54px;
      width: auto;
      display: block;
      position: relative;
      z-index: 0;
    }
    .sep-emote-overlay {
      position: absolute !important;
      pointer-events: none !important;
      top: 50% !important;
      left: 50% !important;
      transform: translate(-50%, -50%) !important;
      z-index: 1;
      max-height: none !important;
      height: auto !important;
      width: auto !important;
    }

    /* ── Emote modifier animations ──────────────────────────────── */
    .mod-h { transform: scaleX(-1); }
    .mod-v { transform: scaleY(-1); }
    .mod-l { transform: rotate(-90deg); }
    .mod-r { transform: rotate(90deg); }
    .mod-c { filter: grayscale(1) contrast(2); }
    .mod-s { animation: sep-shake 0.2s infinite; }
    .mod-p { animation: sep-pulse 0.5s infinite; }
    @keyframes sep-shake {
      0%   { transform: translate(1px, 1px); }
      50%  { transform: translate(-1px, -1px); }
      100% { transform: translate(1px, -1px); }
    }
    @keyframes sep-pulse {
      0%, 100% { opacity: 1; }
      50%       { opacity: .4; }
    }
    `;
    document.head.appendChild(s);
  }

  
  // ─── Emote map (name → {src, src2x, zeroWidth}) ─────────────────────────────
  let emoteMap = new Map();

  function buildEmoteMap() {
    emoteMap.clear();
    const order = [
      '7tv-gl', 'bttv-gl', 'bttv-ch', '7tv-ch',
    ];
    order.forEach(tab => {
      (state.emotesByTab[tab] || []).forEach(e => {
        emoteMap.set(e.name, {
          src: e.src,
          src2x: e.src4x || e.src,
          zeroWidth: !!e.zeroWidth,
        });
      });
    });
    console.log(`[SEP] ✓ emoteMap: ${emoteMap.size} emotes (ZW: ${[...emoteMap.values()].filter(v => v.zeroWidth).length})`);
    window.__sepAC?.update(() => emoteMap);
  }

  // ─── Chat rendering ──────────────────────────────────────────────────────────
  // Kick chat structure (from the provided HTML):
  //
  //  #chatroom-messages > .no-scrollbar >
  //    div[data-index] > div.group > div.betterhover > 
  //      [mod buttons][timestamp][username div]
  //      <span aria-hidden="true">⠀⠀⠀ </span>
  //      <span class="text-neutral leading-[1.55]">MESSAGE TEXT</span>

  function renderChatMessage(msgDiv) {
    // Skip if it's a system message (e.g. "Новые сообщения" banner)
    if (!msgDiv.classList.contains('group') && msgDiv.querySelector('.text-neutral')) {
      // This is a system banner div — skip
      const groupDiv = msgDiv.querySelector('div.group');
      if (!groupDiv) return;
    }

    // Find the text content span — it's the last .text-neutral in this message.
    // Use a broad search within the message's inner container.
    const innerDiv = msgDiv.querySelector('div.group');
    if (!innerDiv) return;

    const textSpan = innerDiv.querySelector('.font-normal.leading-\\[1\\.55\\]')
              || innerDiv.querySelector('span.font-normal');;
    if (!textSpan) return;

    // Don't re-process
    if (textSpan.hasAttribute(RENDERED_ATTR)) return;

    // Skip deleted messages (they have a line-through child)
    if (textSpan.querySelector('.line-through')) return;

    // Walk all text nodes within the span and replace emote names with images
    const changed = processTextNodesForEmotes(textSpan);
    if (changed) textSpan.setAttribute(RENDERED_ATTR, '1');
  }

  // Walk text nodes recursively, replacing emote tokens with <img> elements
  function processTextNodesForEmotes(container) {
    // Collect all text nodes first (don't modify while walking)
    const textNodes = [];
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) textNodes.push(node);

    let changed = false;

    for (const textNode of textNodes) {
      const text = textNode.textContent;
      if (!text.trim()) continue;

      const parts = text.split(/(\s+)/);
      let hasEmote = false;
      for (const p of parts) {
        if (emoteMap.has(p.trim())) { hasEmote = true; break; }
      }
      if (!hasEmote) continue;

      // Build replacement fragment
      const frag = document.createDocumentFragment();
      let prevWasEmote = false;

      for (const part of parts) {
        const trimmed = part.trim();
        const e = emoteMap.get(trimmed);

        if (e && trimmed) {
          const wrap = document.createElement('span');
          wrap.className = 'sep-emote-wrap';

          const img = document.createElement('img');
          img.src = e.src;
          if (e.src2x && e.src2x !== e.src) img.srcset = `${e.src} 2x, ${e.src2x} 2x`;
          img.alt   = trimmed;
          img.title = trimmed;
          img.className = 'sep-chat-emote sep-emote-base';
          img.onerror = function() { this.closest('.sep-emote-wrap')?.replaceWith(document.createTextNode(trimmed)); };
          wrap.appendChild(img);
          frag.appendChild(wrap);

          // Preserve trailing whitespace after the emote token
          const trailing = part.slice(trimmed.length);
          if (trailing) frag.appendChild(document.createTextNode(trailing));
          prevWasEmote = true;
          changed = true;
        } else {
          // Handle ZW emotes: if previous was an emote and this ZW emote follows
          if (e && !trimmed && prevWasEmote) {
            // zero-width spacer — keep as text
          }
          frag.appendChild(document.createTextNode(part));
          if (trimmed) prevWasEmote = false;
        }
      }

      textNode.parentNode.replaceChild(frag, textNode);
    }

    // Second pass: handle zero-width (ZW) emotes — attach them as overlays
    // ZW emotes should appear on top of the previous emote's wrap.
    // After the first pass, ZW emote names that were NOT in emoteMap as regular
    // emotes but ARE in emoteMap as zeroWidth=true will be rendered as sep-chat-emote.
    // We post-process to overlay them on the previous wrap.
    attachZeroWidthOverlays(container);

    return changed;
  }

  // Post-process: move ZW emotes as overlays on their preceding non-ZW wrap
  function attachZeroWidthOverlays(container) {
    const wraps = Array.from(container.querySelectorAll('.sep-emote-wrap'));
    for (let i = 1; i < wraps.length; i++) {
      const wrap = wraps[i];
      const img  = wrap.querySelector('.sep-emote-base');
      if (!img) continue;
      const e = emoteMap.get(img.alt);
      if (!e?.zeroWidth) continue;

      // Find the nearest preceding non-ZW wrap
      const prev = wraps[i - 1];
      if (!prev) continue;

      // Move img as overlay into prev wrap
      img.classList.remove('sep-emote-base', 'sep-chat-emote');
      img.classList.add('sep-emote-overlay');
      prev.appendChild(img);
      wrap.remove();
    }
  }

  // ─── Chat observer ───────────────────────────────────────────────────────────
  let chatObserver = null;

  function startChatRenderer() {
    if (chatObserver) chatObserver.disconnect();

    // Kick's chat container
    const chatRoot = document.querySelector('#chatroom-messages');
    if (!chatRoot) {
      setTimeout(startChatRenderer, 1500);
      return;
    }

    // The actual scrollable inner container
    const scrollContainer = chatRoot.querySelector('.no-scrollbar') || chatRoot;

    // Render already-visible messages
    scrollContainer.querySelectorAll('div[data-index]').forEach(renderChatMessage);

    chatObserver = new MutationObserver(mutations => {
      mutations.forEach(({ addedNodes }) => {
        addedNodes.forEach(node => {
          if (node.nodeType !== Node.ELEMENT_NODE) return;
          if (node.hasAttribute('data-index')) {
            renderChatMessage(node);
            return;
          }
          // Sometimes wrapped in an intermediate node
          node.querySelectorAll?.('div[data-index]').forEach(renderChatMessage);
        });
      });
    });

    chatObserver.observe(scrollContainer, { childList: true, subtree: false });
    console.log('[SEP] Chat renderer started on Kick');
  }

  // ─── Emote change monitor (7TV WebSocket events) ─────────────────────────────
  // emote-events.js handles the WebSocket subscription; here we just listen
  // for the custom DOM event it dispatches on emote set changes.
  function listenForEmoteSetChanges(channel) {
    let refreshDebounce = null;
    document.addEventListener('sep-7tv-motes-picker-emote-set-changed', () => {
      clearTimeout(refreshDebounce);
      refreshDebounce = setTimeout(() => refreshEmotes(channel), 500);
    });
  }

  // ─── Refresh emotes & re-render chat ─────────────────────────────────────────
  async function refreshEmotes(channel) {
    console.log('[SEP] 🔄 Refreshing emotes…');
    try {
      const result = await fetchAllEmotes(channel);
      applyFetchResult(result);
      buildEmoteMap();

      // Reset rendered flags so chat re-renders with new emote map
      const chatRoot = document.querySelector('#chatroom-messages');
      chatRoot?.querySelectorAll(`[${RENDERED_ATTR}]`).forEach(el => {
        el.removeAttribute(RENDERED_ATTR);
        // Restore text by reading alt attributes of emote images
        const parts = [];
        el.childNodes.forEach(child => {
          if (child.nodeType === Node.TEXT_NODE) {
            parts.push(child.textContent);
          } else if (child.classList?.contains('sep-emote-wrap')) {
            const base = child.querySelector('.sep-emote-base');
            if (base) parts.push(base.alt);
            child.querySelectorAll('.sep-emote-overlay').forEach(ov => parts.push(ov.alt));
          } else {
            parts.push(child.textContent);
          }
        });
        const restored = parts.join('');
        if (restored.trim()) el.textContent = restored;
      });

      // Re-render visible messages
      chatRoot?.querySelectorAll('div[data-index]').forEach(renderChatMessage);
      console.log('[SEP] ✅ Refresh complete');
    } catch (e) {
      console.error('[SEP] ❌ Refresh failed', e);
    }
  }

  // ─── Main initializer ────────────────────────────────────────────────────────
  async function main() {
    console.log('[SEP] ════ KICK EMOTE PICKER — INIT ════');
    injectStyle();

    const channel = getChannelName();
    if (!channel) {
      console.log('[SEP] Not a channel page, exiting');
      return;
    }
    console.log(`[SEP] Channel: ${channel}`);

    const panel = buildPanel();
    wirePanel(panel);

    // Wait for Kick's send button to appear (confirms chat is ready)
    try {
      await waitFor('#send-message-button', 20000);
    } catch {
      console.warn('[SEP] send-message-button not found — chat may not be loaded');
      return;
    }

    injectButton();

    // Re-inject button if Kick's React removes it (rare but possible)
    const reInjectObs = new MutationObserver(() => {
      if (!document.getElementById(BTN_ID)) injectButton();
    });
    reInjectObs.observe(document.body, { childList: true, subtree: true });

    // Fetch emotes
    try {
      const result = await fetchAllEmotes(channel);
      applyFetchResult(result);
      state.loaded = true;
      renderGrid(panel);
      buildEmoteMap();
      startChatRenderer();
      listenForEmoteSetChanges(channel);
      window.__sepAC?.init(() => emoteMap);
      console.log('[SEP] ✅ ════ INIT COMPLETE ════');
    } catch (e) {
      console.error('[SEP] Failed to load emotes:', e);
    }

    // ── SPA navigation: Kick is also a React SPA ────────────────────────────
    let lastUrl = location.href;
    setInterval(() => {
      if (location.href === lastUrl) return;
      lastUrl = location.href;
      const ch = getChannelName();
      if (!ch) return;
      console.log(`[SEP] 🚀 Navigation detected → ${ch}`);

      state.loaded = false;
      state.page   = 0;
      state.emotesByTab = { '7tv-ch': [], '7tv-gl': [], 'bttv-ch': [], 'bttv-gl': [] };
      renderGrid(panel);

      // Re-inject button after navigation (React re-renders the UI)
      setTimeout(() => {
        waitFor('#send-message-button', 10000)
          .then(() => { injectButton(); })
          .catch(() => {});
      }, 500);

      fetchAllEmotes(ch).then(result => {
        applyFetchResult(result);
        state.loaded = true;
        renderGrid(panel);
        buildEmoteMap();
        startChatRenderer();
        listenForEmoteSetChanges(ch);
        window.__sepAC?.update(() => emoteMap);
        console.log('[SEP] ✓ Channel nav complete');
      }).catch(e => console.error('[SEP] Emote reload failed:', e));
    }, 2000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', main);
  else main();

  // ─── Message bridge (for picker popout window) ────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'GET_EMOTES') {
      sendResponse({
        loaded: state.loaded,
        emotesByTab: state.emotesByTab,
        channel: getChannelName(),
      });
      return true;
    }
    if (msg.type === 'INSERT_EMOTE') {
      insertEmote(msg.name);
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === 'SEND_CHAT') {
      // Click Kick's send button
      document.getElementById('send-message-button')?.click();
      sendResponse({ ok: true });
    }
  });

})();