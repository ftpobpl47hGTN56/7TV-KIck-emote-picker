// picker-core.js — стейт, хранилище, избранное, поиск, рендер
// Зависит от: picker-data.js, picker-emoji.js
'use strict';

const params      = new URLSearchParams(location.search);
const twitchTabId = parseInt(params.get('tabId'), 10);

// ── DOM refs ──────────────────────────────────────────────────────────────────
const grid      = document.getElementById('grid');
const prevBtn   = document.getElementById('prev');
const nextBtn   = document.getElementById('next');
const pageLabel = document.getElementById('page-label');
const searchEl  = document.getElementById('search');
const tabsEl    = document.getElementById('tabs');
const headerCh  = document.getElementById('header-channel');

// ── Favorites ─────────────────────────────────────────────────────────────────
let channelName = '';
const favoritesMap = new Map();

function favsKey() { return 'favs_' + (channelName || '_global'); }

function loadFavorites() {
  return new Promise(resolve => {
    if (!chrome?.storage?.local) { resolve(); return; }
    try {
      chrome.storage.local.get(favsKey(), result => {
        if (chrome.runtime.lastError) { resolve(); return; }
        const arr = result[favsKey()] || [];
        favoritesMap.clear();
        arr.forEach(e => favoritesMap.set(e.name, e));
        resolve();
      });
    } catch { resolve(); }
  });
}

function saveFavorites() {
  if (!chrome?.storage?.local) return;
  chrome.storage.local.set({ [favsKey()]: [...favoritesMap.values()] });
}

function toggleFavorite(emote) {
  const scrollPos = grid.scrollTop;

  if (favoritesMap.has(emote.name)) favoritesMap.delete(emote.name);
  else favoritesMap.set(emote.name, emote);

  saveFavorites();
  state.emotesByTab.favs = [...favoritesMap.values()];

  renderGrid();

  grid.scrollTop = scrollPos;
}

// ── Emoji Category State ──────────────────────────────────────────────────────
const emojiCategoryState = {};
const EMOJI_STATE_KEY = 'emoji_category_state';

function loadEmojiCategoryState() {
  return new Promise(resolve => {
    if (!chrome?.storage?.local) { resolve(); return; }
    try {
      chrome.storage.local.get(EMOJI_STATE_KEY, result => {
        if (chrome.runtime.lastError) { resolve(); return; }
        const saved = result[EMOJI_STATE_KEY] || {};
        Object.keys(EMOJI_CATEGORIES).forEach(cat => {
          emojiCategoryState[cat] = saved[cat] !== undefined ? saved[cat] : true;
        });
        resolve();
      });
    } catch { resolve(); }
  });
}

async function loadKickEmotes(channel) {
  try {
    const res = await fetch(`https://kick.com/emotes/${channel}`, {
      headers: { 'accept': 'application/json', 'x-app-platform': 'web' },
      credentials: 'include',
    });
    if (!res.ok) throw new Error(`Kick API ${res.status} for channel="${channel}"`);
    const data = await res.json();

    for (const group of data) {
      if (typeof group.id === 'number') {
        state.emotesByTab['kick-ch'] = group.emotes.map(e => ({
          name : e.name,
          src  : `https://files.kick.com/emotes/${e.id}/fullsize`,
          id   : e.id,
        }));
      }
      if (group.name === 'Global') {
        state.emotesByTab['kick-gl'] = group.emotes.map(e => ({
          name : e.name,
          src  : `https://files.kick.com/emotes/${e.id}/fullsize`,
          id   : e.id,
        }));
      }
    }
    state.kickLoaded = true;
  } catch (err) {
    console.warn('[Kick] Failed to load emotes for channel:', channel, err);
    state.kickLoaded = true;
  }
}

function saveEmojiCategoryState() {
  if (!chrome?.storage?.local) return;
  chrome.storage.local.set({ [EMOJI_STATE_KEY]: emojiCategoryState });
}

function toggleEmojiCategory(categoryName) {
  emojiCategoryState[categoryName] = !emojiCategoryState[categoryName];
  saveEmojiCategoryState();
  renderEmojiCategories();
}

// ── App State ─────────────────────────────────────────────────────────────────
const state = {
  activeTab   : 'emoji',
  page        : 0,
  query       : '',
  emotesByTab : {
    favs      : [],
    '7tv-ch'  : [], '7tv-gl'  : [],
    'kick-ch' : [], 'kick-gl' : [],
    emoji     : [],
  },
  loaded     : false,
  kickLoaded : false,
};

// ── Unified Search ────────────────────────────────────────────────────────────
function getSearchResults(query) {
  const q = query.toLowerCase().trim();

  if (!q) {
    return (state.emotesByTab[state.activeTab] || []).map(e => ({ ...e, _src: state.activeTab }));
  }

  const results = [];
  const seen    = new Set();

  const emoteSources = [
    ['7tv-ch', '7TV Ch'], ['7tv-gl', '7TV Global'],
    ['kick-ch', 'Kick Ch'], ['kick-gl', 'Kick GL'],
    ['favs', '★'],
  ];

  emoteSources.forEach(([tabId, label]) => {
    (state.emotesByTab[tabId] || []).forEach(emote => {
      if (emote.name.toLowerCase().includes(q) && !seen.has(emote.name)) {
        seen.add(emote.name);
        results.push({ ...emote, _isEmoji: false, _srcLabel: label });
      }
    });
  });

  Object.values(EMOJI_CATEGORIES).flat().forEach(emoji => {
    const rawName = _emojiNames ? (_emojiNames.get(emoji) || '') : '';
    if (rawName.toLowerCase().includes(q)) {
      const key = 'emoji:' + emoji;
      if (!seen.has(key)) {
        seen.add(key);
        results.push({ name: emoji, _isEmoji: true, _srcLabel: 'Emoji', _emojiName: rawName });
      }
    }
  });

  return results;
}

// ── Render Emoji Categories ───────────────────────────────────────────────────
function renderEmojiCategories() {
  grid.innerHTML = '';
  grid.style.cssText = 'display: block; overflow-y: auto; padding: 8px 12px 12px;';

  const query = state.query.toLowerCase();

  // Skin-tone picker row
  const skinRow = document.createElement('div');
  skinRow.style.cssText = `
    display: flex; align-items: center; gap: 6px;
    padding: 6px 4px 10px; flex-wrap: wrap;
  `;

  const skinLabel = document.createElement('span');
  skinLabel.textContent = 'Skin tone:';
  skinLabel.style.cssText = `
    font-size: 11px; color: var(--color-text-alt2, #adadb8);
    white-space: nowrap; margin-right: 2px;
  `;
  skinRow.appendChild(skinLabel);

  SKIN_TONE_COLORS.forEach((color, i) => {
    const btn = document.createElement('button');
    btn.title = SKIN_TONE_LABELS[i];
    btn.style.cssText = `
      width: 22px; height: 22px; border-radius: 50%;
      background: ${color}; cursor: pointer; flex-shrink: 0;
      border: 2px solid ${i === selectedSkinTone
        ? 'var(--color-text-base, #efeff1)'
        : 'transparent'};
      box-shadow: ${i === selectedSkinTone
        ? '0 0 0 1px rgba(0,0,0,.5)'
        : '0 0 0 1px rgba(255,255,255,.12)'};
      transition: border-color .15s, box-shadow .15s; padding: 0;
    `;

    if (i === 0) {
      btn.innerHTML = `<svg viewBox="0 0 22 22" xmlns="http://www.w3.org/2000/svg"
        style="width:18px;height:18px;display:block;margin:auto;pointer-events:none">
        <circle cx="11" cy="11" r="9" fill="#ffcd42"/>
        <path d="M6.5 14c1-2 7-2 8 0" stroke="#333" stroke-width="1.2"
          stroke-linecap="round" fill="none"/>
        <circle cx="8.5" cy="10" r="1.2" fill="#333"/>
        <circle cx="13.5" cy="10" r="1.2" fill="#333"/>
      </svg>`;
    }

    btn.addEventListener('click', () => {
      saveSkinTone(i);
      renderEmojiCategories();
    });
    skinRow.appendChild(btn);
  });

  const preview = document.createElement('span');
  preview.style.cssText = 'margin-left: 4px; font-size: 18px; line-height: 1;';
  preview.appendChild(createTwemojiImg(applyTone('👋'), 20));
  skinRow.appendChild(preview);
  grid.appendChild(skinRow);

  // Categories
  Object.entries(EMOJI_CATEGORIES).forEach(([categoryName, emojis]) => {
    const filteredEmojis = query
      ? emojis.filter(e => categoryName.toLowerCase().includes(query))
      : emojis;

    if (!filteredEmojis.length && query) return;

    const categoryDiv = document.createElement('div');
    categoryDiv.className = 'emoji-category';
    categoryDiv.style.cssText = 'margin-bottom: 16px;';

    const header = document.createElement('div');
    header.className = 'emoji-category-header';
    header.style.cssText = `
      display: flex; align-items: center; gap: 8px; padding: 8px 4px;
      cursor: pointer; user-select: none; font-size: 13px;
      font-weight: 600; color: var(--color-text-base, #efeff1);
      border-bottom: 1px solid var(--color-border-base, #3a3a3d);
      margin-bottom: 8px;
    `;

    const isOpen = emojiCategoryState[categoryName];
    const chevron = document.createElement('span');
    chevron.textContent = isOpen ? '▼' : '▶';
    chevron.style.cssText = 'font-size: 10px; transition: transform 0.2s;';

    const title = document.createElement('span');
    title.textContent = categoryName;

    header.appendChild(chevron);
    header.appendChild(title);
    header.addEventListener('click', () => toggleEmojiCategory(categoryName));
    categoryDiv.appendChild(header);

    if (isOpen) {
      const emojiGrid = document.createElement('div');
      emojiGrid.className = 'emoji-grid';
      emojiGrid.style.cssText = `
        display: grid; grid-template-columns: repeat(auto-fill, minmax(36px, 1fr));
        gap: 4px; padding: 4px;
      `;

      filteredEmojis.forEach(emoji => {
        const toned = applyTone(emoji);
        const emojiBtn = document.createElement('button');
        emojiBtn.className = 'emoji-btn';
        emojiBtn.style.cssText = `
          width: 36px; height: 36px; border: none; background: transparent;
          cursor: pointer; border-radius: 4px; transition: background 0.15s;
          display: flex; align-items: center; justify-content: center; padding: 0;
        `;
        emojiBtn.title = toned;
        emojiBtn.appendChild(createTwemojiImg(toned, 28));

        emojiBtn.addEventListener('mouseenter', e => {
          emojiBtn.style.background =
            'var(--color-background-button-secondary-hover, rgba(255,255,255,.15))';
          showEmojiTooltip(e, toned);
        });
        emojiBtn.addEventListener('mousemove', _positionEmojiTooltip);
        emojiBtn.addEventListener('mouseleave', () => {
          emojiBtn.style.background = 'transparent';
          hideEmojiTooltip();
        });
        emojiBtn.addEventListener('click', async () => {
          await sendToContent({ type: 'INSERT_EMOTE', name: toned });
          chrome.tabs.update(twitchTabId, { active: true });
        });

        emojiGrid.appendChild(emojiBtn);
      });

      categoryDiv.appendChild(emojiGrid);
    }

    grid.appendChild(categoryDiv);
  });

  prevBtn.disabled = nextBtn.disabled = true;
  pageLabel.textContent = '';
}

// ── Render Grid (emotes) ──────────────────────────────────────────────────────
function renderGrid() {
  grid.style.cssText = '';

  if (state.activeTab === 'emoji' && !state.query) {
    renderEmojiCategories();
    return;
  }

  grid.innerHTML = '';

  const isGlobal = !!state.query;
  const isFavs   = state.activeTab === 'emoji';
  const all       = getSearchResults(state.query);

  const isKickTab = state.activeTab === 'kick-ch' || state.activeTab === 'kick-gl';
  const isLoading = isKickTab ? !state.kickLoaded : (!state.loaded && !isFavs && !isGlobal);

  if (isLoading) {
    grid.innerHTML = `<div class="state-msg">
      <div class="icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" opacity="0.25"/>
          <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round">
            <animateTransform attributeName="transform" type="rotate"
              from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
          </path>
        </svg>
      </div>Loading emotes…</div>`;
    prevBtn.disabled = nextBtn.disabled = true;
    pageLabel.textContent = '— / —';
    return;
  }

  const total = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  state.page  = Math.max(0, Math.min(state.page, total - 1));
  const slice = all.slice(state.page * PAGE_SIZE, (state.page + 1) * PAGE_SIZE);

  if (!slice.length) {
    grid.innerHTML = isFavs && !isGlobal
      ? `<div class="state-msg">
          <div class="icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg></div>
          No favourites yet.
          <span class="state-hint">Ctrl+Click any emote to save it here.</span>
        </div>`
      : `<div class="state-msg">
          <div class="icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg></div>
          No emotes found
        </div>`;
    prevBtn.disabled = nextBtn.disabled = true;
    pageLabel.textContent = '0 / 0';
    return;
  }

  const frag = document.createDocumentFragment();

  slice.forEach(emote => {
    const cell = document.createElement('div');

    if (emote._isEmoji) {
      const toned = applyTone(emote.name);
      cell.className = 'emote';
      cell.title = emote._emojiName
        ? emote._emojiName.charAt(0).toUpperCase() + emote._emojiName.slice(1)
        : toned;
      cell.appendChild(createTwemojiImg(toned, 28));

      if (isGlobal) {
        const badge = document.createElement('span');
        badge.className   = 'src-badge';
        badge.textContent = emote._srcLabel;
        badge.style.cssText =
          'position:absolute;bottom:1px;right:2px;font-size:8px;' +
          'color:rgba(255,255,255,.55);pointer-events:none;line-height:1;';
        cell.appendChild(badge);
      }

      cell.addEventListener('click', async () => {
        await sendToContent({ type: 'INSERT_EMOTE', name: toned });
        chrome.tabs.update(twitchTabId, { active: true });
      });

    } else {
      cell.className = 'emote' + (emote.zeroWidth ? ' emote--zw' : '');
      cell.setAttribute('data-name', emote.name);
      cell.title = emote.name + (emote.zeroWidth ? ' (zero-width overlay)' : '');
      if (favoritesMap.has(emote.name)) cell.classList.add('is-fav');

      const img   = document.createElement('img');
      img.src     = emote.src;
      const hires = emote.src2x || emote.src4x;
      if (hires) img.srcset = `${emote.src} 1x, ${hires} 2x`;
      img.alt     = emote.name;
      img.loading = 'lazy';
      img.onerror = function () { this.style.display = 'none'; };

      const starBadge = document.createElement('span');
      starBadge.className = 'fav-badge';
      starBadge.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 14 14">
        <path fill="none" stroke="#ffe97a" stroke-linecap="round" stroke-linejoin="round"
          d="M7.49 1.09L9.08 4.3a.51.51 0 0 0 .41.3l3.51.52a.54.54 0 0 1 .3.93l-2.53 2.51a.53.53 0 0 0-.16.48l.61 3.53a.55.55 0 0 1-.8.58l-3.16-1.67a.59.59 0 0 0-.52 0l-3.16 1.67a.55.55 0 0 1-.8-.58L3.39 9a.53.53 0 0 0-.16-.48L.67 6.05A.54.54 0 0 1 1 5.12l3.51-.52a.51.51 0 0 0 .41-.3l1.59-3.21a.54.54 0 0 1 .98 0Z"/>
      </svg>`;

      cell.appendChild(img);
      cell.appendChild(starBadge);

      if (emote.zeroWidth) {
        const badge = document.createElement('span');
        badge.className = 'zw-badge'; badge.textContent = 'ZW';
        cell.appendChild(badge);
      }

      if (isGlobal) {
        const srcBadge       = document.createElement('span');
        srcBadge.textContent = emote._srcLabel;
        srcBadge.style.cssText =
          'position:absolute;bottom:1px;right:2px;font-size:8px;' +
          'color:rgba(255,255,255,.55);pointer-events:none;line-height:1;';
        cell.appendChild(srcBadge);
      }

      cell.addEventListener('click', async e => {
        if (e.ctrlKey || e.metaKey) { e.preventDefault(); toggleFavorite(emote); return; }
        // Kick-эмоуты имеют числовой id, 7TV — строковый
        const insertName = (typeof emote.id === 'number')
          ? `[emote:${emote.id}:${emote.name}] `
          : emote.name + ' ';
        await sendToContent({ type: 'INSERT_EMOTE', name: insertName });
        chrome.tabs.update(twitchTabId, { active: true });
      });
    }

    frag.appendChild(cell);
  });

  grid.appendChild(frag);
  grid.scrollTop = 0;
  pageLabel.textContent = `${state.page + 1} / ${total}`;
  prevBtn.disabled  = state.page === 0;
  nextBtn.disabled  = state.page >= total - 1;
}