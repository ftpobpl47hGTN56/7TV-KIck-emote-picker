// picker-main.js — точка входа: события, сообщения, инициализация, модальное окно
// Зависит от: picker-data.js, picker-emoji.js, picker-core.js
'use strict';

// ── Messaging ─────────────────────────────────────────────────────────────────
function sendToContent(msg) {
  return new Promise(resolve => {
    chrome.tabs.sendMessage(twitchTabId, msg, resp => {
      if (chrome.runtime.lastError) resolve(null);
      else resolve(resp);
    });
  });
}

// ── Apply fetch result ────────────────────────────────────────────────────────
function applyResponse(r) {
  state.emotesByTab['7tv-ch']    = r.emotesByTab['7tv-ch']    || [];
  state.emotesByTab['7tv-gl']    = r.emotesByTab['7tv-gl']    || [];
   state.loaded = r.loaded;
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
tabsEl.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    tabsEl.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    state.activeTab = tab.dataset.tab;
    state.page = 0; state.query = '';
    searchEl.value = '';
    renderGrid();
  });
});

// ── Pagination ────────────────────────────────────────────────────────────────
prevBtn.addEventListener('click', () => { state.page--; renderGrid(); });
nextBtn.addEventListener('click', () => { state.page++; renderGrid(); });

// ── Send chat ─────────────────────────────────────────────────────────────────
document.getElementById('send-chat').addEventListener('click', async () => {
  await sendToContent({ type: 'SEND_CHAT' });
  chrome.tabs.update(twitchTabId, { active: true });
});

// ── Search ────────────────────────────────────────────────────────────────────
let searchTimer;
searchEl.addEventListener('input', e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.query = e.target.value.trim();
    state.page  = 0;
    renderGrid();
  }, 200);
});

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  loadEmojiNames(); // фоновая загрузка, не блокируем UI

  if (!twitchTabId) {
    grid.innerHTML = `<div class="state-msg">
      <div class="icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      </div>
      No Twitch tab found.<br>Open from the chat button.
    </div>`;
    return;
  }

  await new Promise(resolve => {
    chrome.tabs.get(twitchTabId, tab => {
      if (!chrome.runtime.lastError && tab) {
      const m = tab.url?.match(/kick\.com\/popout\/([^/?#]+)/)
             || tab.url?.match(/kick\.com\/([^/?#]+)/);
        if (m) {
          channelName = m[1].toLowerCase();
          headerCh.textContent = m[1];
          document.title = `7tv-motes-picker — ${m[1]}`;
        }
      }
      resolve();
    });
  });

  await loadFavorites();
  await loadEmojiCategoryState();
  await loadSkinTone();
  state.emotesByTab.favs = [...favoritesMap.values()];
  renderGrid();

  // Kick emotes — грузим параллельно, не блокируем UI
  if (channelName) {
    loadKickEmotes(channelName).then(() => {
      if (state.activeTab === 'kick-ch' || state.activeTab === 'kick-gl') {
        renderGrid();
      }
    });
  } else {
    state.kickLoaded = true; // нет канала — разблокируем сразу
  }

  const resp = await sendToContent({ type: 'GET_EMOTES' });
  if (!resp) {
    if (state.activeTab !== '7tv-ch' && state.activeTab !== 'emoji') {
      grid.innerHTML = `<div class="state-msg">
        <div class="icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        Could not reach Twitch page.<br>Reload and try again.
      </div>`;
    }
    return;
  }

  applyResponse(resp);
  renderGrid();

  if (!state.loaded) {
    const poll = setInterval(async () => {
      const r = await sendToContent({ type: 'GET_EMOTES' });
      if (r?.loaded) { clearInterval(poll); applyResponse(r); renderGrid(); }
    }, 500);
  }
}
init();

// ── Privacy Policy Modal ──────────────────────────────────────────────────────
(function initPrivacyModal() {
  const privacyBtn   = document.getElementById('privacy-btn');
  const privacyModal = document.getElementById('privacy-modal');
  const closePrivacy = document.getElementById('close-privacy');
  const privacyTitle = document.getElementById('privacy-title');
  const langButtons  = document.querySelectorAll('.lang-btn');
  const contentRu    = document.querySelector('.content-ru');
  const contentEn    = document.querySelector('.content-en');

  if (!privacyBtn || !privacyModal) return;

  privacyBtn.addEventListener('click', () => privacyModal.showModal());
  closePrivacy.addEventListener('click', () => privacyModal.close());

  privacyModal.addEventListener('click', e => {
    if (e.target === privacyModal) privacyModal.close();
  });

  langButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const lang = btn.dataset.lang;
      langButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (lang === 'ru') {
        privacyTitle.textContent = 'Политика конфиденциальности';
        contentRu.classList.add('active');
        contentEn.classList.remove('active');
      } else {
        privacyTitle.textContent = 'Privacy Policy';
        contentEn.classList.add('active');
        contentRu.classList.remove('active');
      }
    });
  });
})();