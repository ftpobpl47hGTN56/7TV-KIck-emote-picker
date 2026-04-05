// ============================================================
//  7TV Emote Events Tracker — emote-events.js (Kick version)
//  Subscribes to 7TV WebSocket API to detect emote set changes.
//  Dispatches a custom DOM event 'sep-7tv-motes-picker-emote-set-changed'
//  which content.js listens to for triggering a refresh.
// ============================================================

(function () {
  'use strict';

  const WEBSOCKET_URL      = 'wss://events.7tv.io/v3';
  const RECONNECT_DELAY    = 5000;
  const HEARTBEAT_INTERVAL = 30000;

  let ws                = null;
  let heartbeatTimer    = null;
  let reconnectTimer    = null;
  let currentChannel    = null;
  let currentEmoteSetId = null;
  let isConnected       = false;

  // ── Channel detection (Kick URLs) ────────────────────────────────────────
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

  // ── Get 7TV emote set ID for this Kick channel ───────────────────────────
  async function getEmoteSetId(channelName) {
    try {
      // First get Kick user ID
      const kickRes = await fetch(`https://kick.com/api/v2/channels/${channelName}`, {
        headers: { 'Accept': 'application/json' },
      });
      if (!kickRes.ok) return null;
      const kickData = await kickRes.json();
      const kickUserId = kickData.user_id || kickData.id;
      if (!kickUserId) return null;

      // Then get 7TV user by Kick ID
      const tvRes = await fetch(`https://7tv.io/v3/users/kick/${kickUserId}`);
      if (!tvRes.ok) return null;
      const tvData = await tvRes.json();
      return tvData.emote_set?.id || null;
    } catch (e) {
      console.warn('[SEP Events] Failed to get emote set ID:', e);
      return null;
    }
  }

  // ── WebSocket lifecycle ───────────────────────────────────────────────────
  function connect() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

    ws = new WebSocket(WEBSOCKET_URL);

    ws.onopen = () => {
      isConnected = true;
      console.log('[SEP Events] 7TV WebSocket connected');
      if (currentEmoteSetId) subscribe(currentEmoteSetId);
      startHeartbeat();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleMessage(msg);
      } catch (e) { /* ignore */ }
    };

    ws.onclose = () => {
      isConnected = false;
      stopHeartbeat();
      console.log('[SEP Events] 7TV WebSocket disconnected, reconnecting…');
      reconnectTimer = setTimeout(connect, RECONNECT_DELAY);
    };

    ws.onerror = (e) => {
      console.warn('[SEP Events] WebSocket error:', e);
      ws.close();
    };
  }

  function subscribe(emoteSetId) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
      op: 35,
      d: {
        type: 'emote_set.update',
        condition: { object_id: emoteSetId },
      },
    }));
    console.log(`[SEP Events] Subscribed to emote set: ${emoteSetId}`);
  }

  function unsubscribe(emoteSetId) {
    if (!ws || ws.readyState !== WebSocket.OPEN || !emoteSetId) return;
    ws.send(JSON.stringify({
      op: 36,
      d: {
        type: 'emote_set.update',
        condition: { object_id: emoteSetId },
      },
    }));
  }

  function startHeartbeat() {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ op: 2 }));
      }
    }, HEARTBEAT_INTERVAL);
  }

  function stopHeartbeat() {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  // ── Message handler ───────────────────────────────────────────────────────
  function handleMessage(msg) {
    // op 0 = DISPATCH (data events)
    if (msg.op !== 0) return;

    const type = msg.d?.type;
    if (type === 'emote_set.update') {
      const pushed  = msg.d?.body?.pushed?.length  || 0;
      const pulled  = msg.d?.body?.pulled?.length  || 0;
      const updated = msg.d?.body?.updated?.length || 0;

      if (pushed + pulled + updated > 0) {
        console.log(`[SEP Events] Emote set changed: +${pushed} -${pulled} ~${updated}`);
        // Notify content.js
        document.dispatchEvent(new CustomEvent('sep-7tv-motes-picker-emote-set-changed', {
          detail: { pushed, pulled, updated },
        }));
      }
    }
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  async function init() {
    const channelName = getChannelName();
    if (!channelName) return;

    currentChannel = channelName;
    console.log(`[SEP Events] Initializing for Kick channel: ${channelName}`);

    const emoteSetId = await getEmoteSetId(channelName);
    if (emoteSetId) {
      currentEmoteSetId = emoteSetId;
      connect();
    } else {
      console.warn('[SEP Events] No 7TV emote set found for this channel');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  console.log('[SEP Events] Kick version loaded ✓');
})();