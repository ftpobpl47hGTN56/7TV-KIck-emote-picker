// ==UserScript==
// @name         Chatroom Deleted Messages - Opacity 0.5
// @namespace    https://github.com/yourname
// @version      1.0
// @description  Применяет opacity 0.5 к сообщениям с пометкой (Deleted)
// @author       Grok
// @match        *://*/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // ==================== CSS СТИЛИ ====================
    const css = `
        /* Основной контейнер сообщения с пометкой Deleted */
        div:has(> span > span.font-semibold:contains("(Deleted)")) {
            opacity: 0.5 !important;
            transition: opacity 0.2s ease !important;
        }

        /* Дополнительно — если есть line-through внутри deleted-сообщения */
        div:has(> span > span.line-through[data-custom-seen="1"]) {
            opacity: 0.5 !important;
        }

        /* Чуть более точный селектор по тексту (Deleted) */
        .text-neutral span.font-semibold:where(:contains("(Deleted)")) {
            opacity: 0.5 !important;
        }

        /* Если нужно сделать весь блок сообщения чуть тусклее при наведении */
        div:has(> span > span.font-semibold:contains("(Deleted)")):hover {
            opacity: 0.65 !important;
        }
    `;

    // ==================== ВСТАВКА СТИЛЕЙ ====================
    function injectStyles() {
        const style = document.createElement('style');
        style.id = 'deleted-messages-opacity-style';
        style.textContent = css;
        document.head.appendChild(style);
    }

    // ==================== ЗАПУСК ====================
    if (document.head) {
        injectStyles();
    } else {
        const observer = new MutationObserver(() => {
            if (document.head) {
                injectStyles();
                observer.disconnect();
            }
        });
        observer.observe(document.documentElement, { childList: true });
    }

})();