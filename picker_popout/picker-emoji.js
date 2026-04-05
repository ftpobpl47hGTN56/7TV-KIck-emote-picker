// picker-emoji.js — утилиты: Twemoji, тултип, скин-тон
// Зависит от: picker-data.js
'use strict';

// ── Emoji Name Dictionary ─────────────────────────────────────────────────────
let _emojiNames = null;

async function loadEmojiNames() {
  if (_emojiNames) return;
  try {
    const resp = await fetch(
      'https://cdn.jsdelivr.net/npm/unicode-emoji-json@0.6.0/data-by-emoji.json'
    );
    const data = await resp.json();
    _emojiNames = new Map(
      Object.entries(data).map(([emoji, info]) => [emoji, info.name])
    );
  } catch (err) {
    console.warn('[EmojiTooltip] Failed to load emoji names:', err);
    _emojiNames = new Map();
  }
}

function getEmojiName(emoji) {
  if (!_emojiNames) return emoji;
  let name = _emojiNames.get(emoji);
  if (name) return name;
  const base = emoji.replace(/[\u{1F3FB}-\u{1F3FF}]/gu, '');
  name = _emojiNames.get(base);
  return name || emoji;
}

// ── Custom Emoji Tooltip ──────────────────────────────────────────────────────
const _emojiTooltip = (() => {
  const el = document.createElement('div');
  el.id = 'emoji-tooltip';
  el.style.cssText = `
    position: fixed; z-index: 99999; display: none;
    align-items: center; gap: 8px; padding: 5px 10px 5px 7px;
    background: #1b1c39; color: #f3edb4; font-size: 13px;
    font-family: Inter, system-ui, sans-serif;
    border: 1px solid rgba(200,180,80,.35); border-radius: 4px;
    box-shadow: 0 3px 10px rgba(0,0,0,.55);
    pointer-events: none; white-space: nowrap; line-height: 1;
  `;
  document.body.appendChild(el);
  return el;
})();

function _positionEmojiTooltip(e) {
  const tw = _emojiTooltip.offsetWidth  || 80;
  const th = _emojiTooltip.offsetHeight || 28;
  const margin = 8;
  let x = e.clientX + 14;
  let y = e.clientY - th - 8;
  if (x + tw > window.innerWidth  - margin) x = e.clientX - tw - 10;
  if (y < margin)                            y = e.clientY + 18;
  _emojiTooltip.style.left = x + 'px';
  _emojiTooltip.style.top  = y + 'px';
}

function showEmojiTooltip(e, emoji) {
  _emojiTooltip.innerHTML = '';
  const img = createTwemojiImg(emoji, 22);
  img.style.cssText = 'flex-shrink:0; display:block;';
  _emojiTooltip.appendChild(img);
  const rawName = getEmojiName(emoji);
  const name = rawName.charAt(0).toUpperCase() + rawName.slice(1);
  const label = document.createElement('span');
  label.textContent = name;
  _emojiTooltip.appendChild(label);
  _emojiTooltip.style.display = 'flex';
  _positionEmojiTooltip(e);
}

function hideEmojiTooltip() {
  _emojiTooltip.style.display = 'none';
}

// ── Skin Tone State ───────────────────────────────────────────────────────────
let selectedSkinTone = 0;

function loadSkinTone() {
  return new Promise(resolve => {
    if (!chrome?.storage?.local) { resolve(); return; }
    try {
      chrome.storage.local.get(SKIN_TONE_KEY, result => {
        if (chrome.runtime.lastError) { resolve(); return; }
        const saved = result[SKIN_TONE_KEY];
        if (typeof saved === 'number' && saved >= 0 && saved < SKIN_TONE_MODIFIERS.length) {
          selectedSkinTone = saved;
        }
        resolve();
      });
    } catch { resolve(); }
  });
}

function saveSkinTone(index) {
  selectedSkinTone = index;
  if (!chrome?.storage?.local) return;
  chrome.storage.local.set({ [SKIN_TONE_KEY]: index });
}

function applyTone(emoji) {
  if (!selectedSkinTone) return emoji;
  const modifier = SKIN_TONE_MODIFIERS[selectedSkinTone];
  const baseCheck = emoji.split('\u200D')[0].replace(/\uFE0F$/g, '');
  if (!SKIN_TONE_ELIGIBLE.has(emoji) && !SKIN_TONE_ELIGIBLE.has(baseCheck)) return emoji;
  const chars = [...emoji];
  let insertPos = 1;
  while (insertPos < chars.length && chars[insertPos] === '\uFE0F') insertPos++;
  return chars.slice(0, insertPos).join('') + modifier + chars.slice(insertPos).join('');
}

// ── Twemoji Helpers ───────────────────────────────────────────────────────────
function emojiToTwemojiUrl(emoji) {
  const hex = [...emoji].map(ch => ch.codePointAt(0).toString(16)).join('-');
  let normalized;
  if (hex.includes('200d')) {
    normalized = hex;
  } else {
    normalized = hex
      .replace(/-fe0f/g, '').replace(/^fe0f-/, '')
      .replace(/-+/g, '-').replace(/^-|-$/g, '');
  }
  return `https://cdn.jsdelivr.net/gh/jdecked/twemoji@14.0.0/assets/72x72/${normalized}.png`;
}

function showTextFallback(imgElement, emoji, size) {
  const span = document.createElement('span');
  span.className = 'emoji-text-fallback';
  span.style.cssText = `
    display: inline-block; font-size: ${size}px; line-height: 1;
    font-family: "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif;
  `;
  span.textContent = emoji;
  span.title = emoji + ' (image not available)';
  imgElement.replaceWith(span);
}

function createTwemojiImg(emoji, size = 24) {
  const img = document.createElement('img');
  img.className = 'twemoji';
  img.alt = emoji;
  img.title = emoji;
  img.loading = 'lazy';
  img.style.cssText = `width: ${size}px; height: ${size}px; vertical-align: middle;`;
  img.dataset.originalEmoji = emoji;
  img.dataset.fallbackAttempts = '0';
  img.src = emojiToTwemojiUrl(emoji);

  img.onerror = function () {
    const attempts = parseInt(this.dataset.fallbackAttempts || '0');
    if (attempts >= 2) {
      console.warn('[Twemoji] All fallbacks failed for:', emoji);
      showTextFallback(this, emoji, size);
      return;
    }
    this.dataset.fallbackAttempts = String(attempts + 1);
    if (attempts === 0) {
      const emojiWithoutTone = emoji.replace(/[\u{1F3FB}-\u{1F3FF}]/gu, '');
      if (emojiWithoutTone !== emoji) {
        this.src = emojiToTwemojiUrl(emojiWithoutTone);
        return;
      }
    }
    showTextFallback(this, emoji, size);
  };

  return img;
}
