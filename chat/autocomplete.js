// ============================================================
//  7tv-motes-picker Emote Autocomplete — autocomplete.js (Kick version)
//  Shows a dropdown of matching emotes as you type in Kick chat.
 // ============================================================
(function () {
  'use strict';

  const MAX_ITEMS   = 120;
  const MIN_QUERY   = 1;
  const DEBOUNCE_MS = 100;
  const POPUP_ID    = 'sep-ac-popup';

  let getEmotesFn   = null;
  let debounceTimer = null;
  let selectedIdx   = 0;
  let items         = [];

  // Kick chat input selector
  const INPUT_SEL = '[data-lexical-editor="true"], [data-testid="chat-input"], .editor-input[contenteditable="true"]';

  // ── Public API (called by content.js) ────────────────────────────────────
  window.__sepAC = {
    init  : (fn) => { getEmotesFn = fn; attachInput(); },
    update: (fn) => { getEmotesFn = fn; },
  };

  // ── Get current caret word ────────────────────────────────────────────────
  function getCaretWord(input) {
    if (input.contentEditable === 'true') {
      const sel = window.getSelection();
      if (!sel.rangeCount) return '';
      const range = sel.getRangeAt(0).cloneRange();
      range.collapse(true);
      // Get text before caret
      const textBefore = range.startContainer.textContent?.slice(0, range.startOffset) || '';
      const match = textBefore.match(/\S+$/);
      return match ? match[0] : '';
    }
    return '';
  }

  function replaceCaretWord(input, word, replacement) {
    if (input.contentEditable !== 'true') return;
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0).cloneRange();
    range.collapse(true);

    const node   = range.startContainer;
    const offset = range.startOffset;
    const text   = node.textContent || '';
    const before = text.slice(0, offset);
    const idx    = before.lastIndexOf(word);
    if (idx === -1) return;

    // Replace in the text node
    node.textContent = text.slice(0, idx) + replacement + ' ' + text.slice(offset);
    // Move cursor after replacement
    const newOffset = idx + replacement.length + 1;
    const newRange  = document.createRange();
    newRange.setStart(node, Math.min(newOffset, node.textContent.length));
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);

    // Trigger Lexical update
    input.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
  }

  // ── Popup ─────────────────────────────────────────────────────────────────
  function ensurePopup() {
    let el = document.getElementById(POPUP_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = POPUP_ID;
      el.style.cssText = `
        position: fixed;
        z-index: 9999;
        background:rgb(8, 8, 45);
        border: 1px solid rgb(240, 188, 93);
        border-radius: 6px;
        box-shadow: 0 4px 16px rgba(0,0,0,.6);
        padding: 5px 0;
        max-height: 480px;
        overflow-y: auto;
        min-width: 200px;
        font-family: Inter, Roobert, sans-serif;
        font-size: 14px;
      `;
      document.body.appendChild(el);
    }
    return el;
  }

  function hidePopup() {
    const el = document.getElementById(POPUP_ID);
    if (el) el.style.display = 'none';
    items = []; selectedIdx = 0;
  }

  function showPopup(input, word) {
    if (!getEmotesFn) return;
    const emoteMap = getEmotesFn();
    if (!emoteMap || emoteMap.size === 0) return;

    const q = word.toLowerCase();
    items = [...emoteMap.entries()]
      .filter(([name]) => name.toLowerCase().includes(q))
      .slice(0, MAX_ITEMS)
      .map(([name, e]) => ({ name, src: e.src }));

    if (!items.length) { hidePopup(); return; }
    selectedIdx = 0;

    const popup = ensurePopup();
    popup.innerHTML = '';
    items.forEach((item, i) => {
      const row = document.createElement('div');
      row.style.cssText = `
        display: flex; align-items: center; gap: 8px;
        padding: 4px 10px; cursor: pointer;
        background: ${i === selectedIdx ? '#2a2a2d' : 'transparent'};
        color: #efeff1;
      `;
      row.dataset.idx = i;
      const img = document.createElement('img');
      img.src = item.src; img.alt = item.name;
      img.style.cssText = 'width:22px;height:22px;object-fit:contain;';
      const span = document.createElement('span');
      span.textContent = item.name;
      row.appendChild(img); row.appendChild(span);
      row.addEventListener('mousedown', e => {
        e.preventDefault();
        selectItem(input, i);
      });
      popup.appendChild(row);
    });

    // Position above the input
    const rect = input.getBoundingClientRect();
    popup.style.display  = 'block';
    popup.style.left     = `${rect.left}px`;
    popup.style.bottom   = `${window.innerHeight - rect.top + 4}px`;
    popup.style.top      = '';
  }

  function selectItem(input, idx) {
    const item = items[idx];
    if (!item) return;
    const word = getCaretWord(input);
    replaceCaretWord(input, word, item.name);
    hidePopup();
  }

  function updateSelection(popup) {
    Array.from(popup.children).forEach((row, i) => {
      row.style.background = i === selectedIdx ? '#2a2a2d' : 'transparent';
    });
    popup.children[selectedIdx]?.scrollIntoView({ block: 'nearest' });
  }

  // ── Attach to Kick input ──────────────────────────────────────────────────
  function attachInput() {
    // Wait for the input to appear
    const tryAttach = () => {
      const input = document.querySelector(INPUT_SEL);
      if (!input) { setTimeout(tryAttach, 1000); return; }
      bindInput(input);
    };
    tryAttach();

    // Also observe for input re-creation after SPA navigation
    new MutationObserver(() => {
      const input = document.querySelector(INPUT_SEL);
      if (input && !input.dataset.sepAcBound) bindInput(input);
    }).observe(document.body, { childList: true, subtree: true });
  }

  function bindInput(input) {
    if (input.dataset.sepAcBound) return;
    input.dataset.sepAcBound = 'true';

    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const word = getCaretWord(input);
        if (word.length < MIN_QUERY + 1) { hidePopup(); return; }
        showPopup(input, word);
      }, DEBOUNCE_MS);
    });

    input.addEventListener('keydown', e => {
      const popup = document.getElementById(POPUP_ID);
      if (!popup || popup.style.display === 'none' || !items.length) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIdx = Math.min(selectedIdx + 1, items.length - 1);
        updateSelection(popup);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIdx = Math.max(selectedIdx - 1, 0);
        updateSelection(popup);
      } else if (e.key === 'Tab' || e.key === 'Enter') {
        if (items.length) {
          e.preventDefault();
          selectItem(input, selectedIdx);
        }
      } else if (e.key === 'Escape') {
        hidePopup();
      }
    });

    input.addEventListener('blur', () => setTimeout(hidePopup, 150));
  }

  console.log('[SEP AC] Kick autocomplete loaded ✓');
})();