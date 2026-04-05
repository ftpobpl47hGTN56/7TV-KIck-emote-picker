// ======= send_in-chat_from-popup-emote.js (Kick version) ======== //
// Defines sendToChat() for the "send" button in sep-emote-popup.
// Uses Kick's Lexical editor input selector.

(function () {
    'use strict';

    const DEBUG = false;
    const log  = (...args) => DEBUG && console.log('[SendFromSepPopup]', ...args);
    const warn = (...args) => console.warn('[SendFromSepPopup]', ...args);

    // ── 1. Find the visible Kick chat input ─────────────────────────────────
    function getChatInput() {
        // Kick uses a Lexical contenteditable div as the chat input
        const selectors = [
            '[data-lexical-editor="true"]',
            '[data-testid="chat-input"]',
            '.editor-input[contenteditable="true"]',
        ];
        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el) {
                const s = window.getComputedStyle(el);
                if (s.display !== 'none' && s.visibility !== 'hidden') return el;
            }
        }
        return null;
    }

    // ── 2. Insert text into Kick's Lexical editor ───────────────────────────
    function insertTextIntoInput(input, text) {
        input.focus();

        if (input.contentEditable === 'true') {
            // Move cursor to end
            const sel   = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(input);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);

            // execCommand('insertText') is intercepted by Lexical's beforeinput handler
            document.execCommand('insertText', false, text);
        } else if (input.tagName.toLowerCase() === 'textarea') {
            const cur   = input.value || '';
            const start = input.selectionStart ?? cur.length;
            const end   = input.selectionEnd   ?? cur.length;
            input.value = cur.slice(0, start) + text + cur.slice(end);
            const pos = start + text.length;
            input.setSelectionRange(pos, pos);
        }
    }

    // ── 3. Press Enter to send the message ──────────────────────────────────
    function pressEnter(input) {
        return input.dispatchEvent(new KeyboardEvent('keydown', {
            bubbles: true, cancelable: true,
            key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
        }));
    }

    // ── 4. Main function: insert + send ─────────────────────────────────────
    function sendToChat(text) {
        if (!text?.trim()) { warn('Empty text'); return false; }

        const input = getChatInput();
        if (!input) { warn('Chat input not found'); return false; }

        try {
            insertTextIntoInput(input, text);
            const sent = pressEnter(input);
            log(sent ? 'Sent:' : 'Enter cancelled:', text.trim());
            return sent;
        } catch (err) {
            warn('Error sending:', err);
            return false;
        }
    }

    window.sendToChat = sendToChat;

    // ── 5. Patch visual feedback on the send button in sep-emote-popup ───────
    function patchSendButton(popup) {
        const btn = popup.querySelector('#sendemt-in-chat-4nrd5e');
        if (!btn || btn.dataset.patched) return;
        btn.dataset.patched = 'true';

        btn.addEventListener('click', () => {
            setTimeout(() => {
                if (btn.textContent.trim() === '✓ sent') return;
                btn.style.color = 'rgba(85,255,127,0.9)';
                btn.textContent = '✓ sent';
            }, 50);
        }, { capture: false });

        log('send button patched');
    }

    // Watch for sep-emote-popup appearing in the DOM
    function watchForPopup() {
        const existing = document.getElementById('sep-emote-popup');
        if (existing) patchSendButton(existing);

        new MutationObserver(mutations => {
            for (const m of mutations) {
                for (const node of m.addedNodes) {
                    if (node.nodeType !== 1) continue;
                    if (node.id === 'sep-emote-popup') { patchSendButton(node); continue; }
                    const inner = node.querySelector?.('#sep-emote-popup');
                    if (inner) patchSendButton(inner);
                }
            }
        }).observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchForPopup);
    else watchForPopup();

    console.log('[SendFromSepPopup] Kick version loaded ✓');
})();