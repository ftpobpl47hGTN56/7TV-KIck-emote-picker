// chat/mod-actions.js v4
(function () {
  'use strict';
  let isModerator = false;
  let channelId = null;
  let chatroomId = null;
  let currentSlug = null;
  let observer = null;
  let scanTimer = null;
  // ─── Slug ──────────────────────────────────────────────────────────────────
  function getSlug() {
    const m = location.pathname.match(/^\/([^/?#]+)/);
    if (!m) return null;
    const slug = m[1].toLowerCase();
    const skip = ['dashboard','settings','login','signup','search','browse','categories',''];
    return skip.includes(slug) ? null : slug;
  }
  // ─── XSRF ──────────────────────────────────────────────────────────────────
  function xsrf() {
    const m = document.cookie.match(/XSRF-TOKEN=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  }
  function apiHeaders() {
  return {
    'accept': 'application/json',
    'content-type': 'application/json',
    'authorization': 'Bearer ' + getSessionToken(),
    'x-app-platform': 'web'
  };
}

function getSessionToken() {
  const m = document.cookie.match(/session_token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

  // ─── Role check ────────────────────────────────────────────────────────────
  async function checkChannelRole(slug) {
    try {
      const res = await fetch(`https://kick.com/api/v2/channels/${slug}`, {
        credentials: 'include', headers: { accept: 'application/json' }
      });
      if (!res.ok) return;
      const data = await res.json();
      const role = data.role;
      console.debug(`[KickMod] role=${role}, channelId=${data.id}, chatroomId=${data.chatroom?.id}`);
      if (role === 'Moderator' || role === 'Broadcaster' || role === 'Owner') {
        isModerator = true;
        channelId = data.id;
        chatroomId = data.chatroom?.id ?? data.id;
        ensureStyles();
        startObserver();
        processAll();
        startPeriodicScan();
      } else {
        isModerator = false;
      }
    } catch (e) { console.error('[KickMod]', e); }
  }
  
 
  
  
async function apiBan(username) {
  const r = await fetch(`https://kick.com/api/v2/channels/${currentSlug}/bans`, {
    method: 'POST',
    credentials: 'include',
    headers: apiHeaders(),
    body: JSON.stringify({
      permanent: true,
      banned_username: username
    }),
  });

  const text = await r.text();
  console.log('[KickMod] ban', r.status, text);
  return r.ok;
}


async function apiTimeout(username, seconds) {
  const r = await fetch(`https://kick.com/api/v2/channels/${currentSlug}/bans`, {
    method: 'POST',
    credentials: 'include',
    headers: apiHeaders(),
    body: JSON.stringify({
      permanent: false,
      duration: seconds,
      banned_username: username
    }),
  });

  const text = await r.text();
  console.log('[KickMod] timeout', r.status, text);
  return r.ok;
}



  // ─── Delete через нативную Kick-кнопку ────────────────────────────────────
  // Не нужен Fiber/messageId — просто находим и кликаем нативную кнопку.
  // Она уже есть в DOM каждой строки (скрыта через CSS, но кликабельна).
  function nativeDelete(lineEl) {
    // aria-label на русском или английском (зависит от локали)
    const btn = lineEl.querySelector(
      '[aria-label="Удалить"], [aria-label="Delete"], [aria-label="delete"], [aria-label="удалить"]'
    );
    if (btn) {
      btn.click();
      return true;
    }
    console.warn('[KickMod] native delete button not found in line');
    return false;
  }
  // ─── Timeout picker ────────────────────────────────────────────────────────
  const DURATIONS = [
    {label:'1m',s:60},{label:'5m',s:300},{label:'10m',s:600},
    {label:'30m',s:1800},{label:'1h',s:3600},{label:'24h',s:86400},{label:'7d',s:604800},
  ];
  function openTimeoutPicker(username, anchor) {
    document.querySelector('.kex-to-picker')?.remove();
    const picker = document.createElement('div');
    picker.className = 'kex-to-picker';
    DURATIONS.forEach(({label, s}) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.onclick = async () => { picker.remove(); await apiTimeout(username, s); };
      picker.appendChild(b);
    });
    const r = anchor.getBoundingClientRect();
    picker.style.cssText = `top:${r.bottom + 4}px;left:${r.left}px;`;
    document.body.appendChild(picker);
    const hide = e => {
      if (!picker.contains(e.target)) {
        picker.remove();
        document.removeEventListener('mousedown', hide, true);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', hide, true), 0);
  }
  // ─── SVG ───────────────────────────────────────────────────────────────────
  const SVG = {
  del: `<svg width="34" height="34" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" fill="orange">
      <path d="M22.6786 6.21429V3H9.82143V6.21429H5V9.42857H27.5V6.21429H22.6786Z"/>
      <path d="M8.21429 12.6429V28.7143H24.2857V12.6429H8.21429ZM11.4286 25.5V15.8571H14.6429V25.5H11.4286ZM17.8571 25.5V15.8571H21.0714V25.5H17.8571Z"/>
    </svg>`,

    ban: `<svg width="34" height="34" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" fill="orange">
      <path fill-rule="evenodd" d="M16 7C12.14 7 9 10.14 9 14c0 1.2.34 2.32.86 3.3L19.3 7.86C18.32 7.32 17.2 7 16 7Z"/>
      <path fill-rule="evenodd" d="M12.7 20.14C13.68 20.68 14.8 21 16 21c3.86 0 7-3.14 7-7 0-1.2-.34-2.32-.86-3.3L12.7 20.14Z"/>
      <path fill-rule="evenodd" d="M2 0v23.34L16 32l14-8.66V0H2Zm14 25c-6.06 0-11-4.94-11-11S9.94 3 16 3s11 4.94 11 11-4.94 11-11 11Z"/>
    </svg>`,

    to: `<svg width="34" height="34" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" fill="orange">
      <path d="M28 0H4v4l10 12L4 28v4h24v-4L18 16 28 4V0Zm-12 12.16L9.2 4h13.58L15.98 12.16H16Z"/>
    </svg>`,
  };
  // ─── mkBtn ─────────────────────────────────────────────────────────────────
  function mkBtn(cls, title, svg) {
    const b = document.createElement('button');
    b.className = `kex-mod-btn ${cls}`;
    b.title = title;
    b.innerHTML = svg;
    return b;
  }
  // ─── injectFromUserBtn ─────────────────────────────────────────────────────
  function injectFromUserBtn(userBtn) {
    const username = userBtn.textContent.trim();
    if (!username) return;
    const contentDiv = userBtn.closest('[class*="break-words"]');
    if (!contentDiv) return;
    if (contentDiv.hasAttribute('data-kex-mod')) return;
    contentDiv.setAttribute('data-kex-mod', '1');
    // lineEl = [data-index] — нужен для поиска нативной кнопки delete
    const lineEl = contentDiv.closest('[data-index]') ?? contentDiv.parentElement;
    const wrap = document.createElement('div');
    wrap.className = 'kex-mod-wrap';
    // Delete — кликаем нативную Kick-кнопку
    const delBtn = mkBtn('kex-mod-btn--del', 'Delete', SVG.del);
    delBtn.onclick = e => {
      e.stopPropagation();
      nativeDelete(lineEl ?? contentDiv);
    };
    // Timeout
    const toBtn = mkBtn('kex-mod-btn--to', 'Timeout', SVG.to);
    toBtn.onclick = e => { e.stopPropagation(); openTimeoutPicker(username, toBtn); };
    // Ban
    const banBtn = mkBtn('kex-mod-btn--ban', 'Ban', SVG.ban);
 banBtn.onclick = async e => {
  e.stopPropagation();
  const ok = await apiBan(username);
  if (ok) (lineEl ?? contentDiv).style.opacity = '0.7';
};
    wrap.append(delBtn, toBtn, banBtn);
    contentDiv.insertBefore(wrap, contentDiv.firstChild);
  }
  // ─── processAll / Observer ─────────────────────────────────────────────────
  function processAll() {
    document.querySelectorAll('button[data-prevent-expand="true"]').forEach(injectFromUserBtn);
  }
  function startObserver() {
    observer?.disconnect();
    observer = new MutationObserver(muts => {
      if (!isModerator) return;
      for (const m of muts) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.matches?.('button[data-prevent-expand="true"]')) { injectFromUserBtn(node); continue; }
          node.querySelectorAll?.('button[data-prevent-expand="true"]').forEach(injectFromUserBtn);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
  function startPeriodicScan() {
    clearInterval(scanTimer);
    // Раз в 2s снимаем маркер data-kex-mod с узлов, которые virtual-scroll
    // переиспользовал под новые сообщения (username изменился, маркер остался)
    scanTimer = setInterval(() => {
      document.querySelectorAll('[data-kex-mod]').forEach(div => {
        const btn = div.querySelector('button[data-prevent-expand="true"]');
        const wrap = div.querySelector('.kex-mod-wrap');
        if (wrap && btn) {
          // username на кнопке мог смениться (virtual scroll) — сбрасываем
          const currentUser = btn.textContent.trim();
          const lastUser = wrap.dataset.kexUser;
          if (lastUser && lastUser !== currentUser) {
            wrap.remove();
            div.removeAttribute('data-kex-mod');
          } else {
            wrap.dataset.kexUser = currentUser;
          }
        }
      });
      processAll();
    }, 2000);
  }
  // ─── Styles ────────────────────────────────────────────────────────────────
  let stylesInited = false;
  function ensureStyles() {
    if (stylesInited) return;
    stylesInited = true;
    const s = document.createElement('style');
    s.id = 'kex-mod-styles';
    s.textContent = `
      .kex-mod-wrap {
        display: inline-flex; align-items: center;
        gap: 1px; margin-right: 3px;
        vertical-align: middle; flex-shrink: 0;
      }
      .kex-mod-btn {
        display: inline-flex; align-items: center; justify-content: center;
        width: 20px; height: 20px; padding: 0; border: none;
        border-radius: 3px; background: transparent;
        cursor: pointer; flex-shrink: 0; transition: background 0.1s;
      }
      .kex-mod-btn svg {
        width: 30px;
         height: 30px;
         fill: rgb(200 167 74);
        display: block; 
        pointer-events:   none; 
        transition: fill 0.12s;
      }
      .kex-mod-btn:hover { 
      background: #ffb700; 
      }
      .kex-mod-btn--del:hover svg { 
      fill: #aaa;
       }
      .kex-mod-btn--to:hover svg {
       fill: #ffb700; 
      }
      .kex-mod-btn--ban:hover svg { 
      fill: #ff4d4d; 
      }
      .kex-to-picker {
        position: fixed; display: flex; gap: 3px;
        background: #1f2326; border: 1px solid #3a3f42;
        border-radius: 6px; padding: 5px;
        z-index: 100000; box-shadow: 0 4px 16px rgba(0,0,0,.65);
      }
      .kex-to-picker button {
        padding: 2px 8px; border: none; border-radius: 4px;
        background: #2e3437; color: #e0e0e0;
        font-size: 11px; font-weight: 700; cursor: pointer;
        transition: background 0.1s;
      }
      .kex-to-picker button:hover { background: #ffb700; color: #000;
       }
      .kex-mod-btn {
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          width: 24px !important;
          height: 24px !important;
          padding: 0 !important;
          border: 1px green !important;
          border-radius: 3px !important;
          background:rgb(35, 34, 72) !important;
          cursor: pointer !important;
          flex-shrink: 0 !important;
          transition: background 0.1s !important;
      }
    `;
    document.head.appendChild(s);
  }
  // ─── SPA ───────────────────────────────────────────────────────────────────
  async function onNavigate() {
    const slug = getSlug();
    if (!slug || slug === currentSlug) return;
    currentSlug = slug;
    isModerator = false; channelId = null; chatroomId = null;
    observer?.disconnect(); observer = null;
    clearInterval(scanTimer);
    setTimeout(() => checkChannelRole(slug), 600);
  }
  ['pushState','replaceState'].forEach(m => {
    const orig = history[m].bind(history);
    history[m] = function(...a) { orig(...a); onNavigate(); };
  });
  window.addEventListener('popstate', onNavigate);
  // ─── Boot ──────────────────────────────────────────────────────────────────
  function boot() {
    currentSlug = getSlug();
    if (!currentSlug) return;
    checkChannelRole(currentSlug);
  }
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', boot)
    : boot();
})();