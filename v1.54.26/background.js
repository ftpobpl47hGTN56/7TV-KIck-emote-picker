// background.js — service worker (Kick version)

// Map<kickTabId, pickerWindowId>
const pickerWindows = new Map();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (msg.type === 'OPEN_POPOUT') {
    const kickTabId = sender.tab?.id;
    if (!kickTabId) return;

    const existingWindowId = pickerWindows.get(kickTabId);

    if (existingWindowId !== undefined) {
      chrome.windows.get(existingWindowId, {}, (win) => {
        if (chrome.runtime.lastError || !win) {
          pickerWindows.delete(kickTabId);
          openWindow(kickTabId);
        } else {
          chrome.windows.update(existingWindowId, { focused: true });
        }
      });
    } else {
      openWindow(kickTabId);
    }

    sendResponse({ ok: true });
    return true;
  }

});

function openWindow(kickTabId) {
  const url = chrome.runtime.getURL(`picker.html?tabId=${kickTabId}`);

  chrome.windows.create({
    url    : url,
    type   : 'popup',
    width  : 565,
    height : 570,
    focused: true,
  }, (win) => {
    pickerWindows.set(kickTabId, win.id);

    chrome.windows.onRemoved.addListener(function onRemoved(windowId) {
      if (windowId === win.id) {
        pickerWindows.delete(kickTabId);
        chrome.windows.onRemoved.removeListener(onRemoved);
      }
    });
  });
}