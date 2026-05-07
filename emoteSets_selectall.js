
// ==UserScript==
// @name         7TV Select All Emotes
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Кнопка "выбрать все / снять все" на странице эмоутов 7TV
// @match        https://7tv.app/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // ─── Состояние ───────────────────────────────────────────────────────────────
  let allSelected = false;

  // ─── Создаём кнопку ─────────────────────────────────────────────────────────
  function createBtn() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'stv-select-all-btn';
    // Копируем классы с соседней кнопки Select
    btn.className = 'button svelte-tqxzvk secondary has-text icon-right';
    btn.style.cssText = 'cursor:pointer;';
    updateBtnLabel(btn);

    btn.addEventListener('click', () => {
      allSelected = !allSelected;
      // Кликаем по всем чекбоксам эмоутов (label.svelte-1rdsy0t > input[type=checkbox])
      const checkboxes = document.querySelectorAll('a.emote input[type="checkbox"]');
      checkboxes.forEach(cb => {
        if (cb.checked !== allSelected) cb.click();
      });
      updateBtnLabel(btn);
    });

    return btn;
  }

  // ─── Обновляем текст/иконку кнопки ──────────────────────────────────────────
  function updateBtnLabel(btn) {
    btn.innerHTML = allSelected
      ? `Deselect all <svg xmlns="http://www.w3.org/2000/svg" width="19.2" height="19.2"
           fill="currentColor" viewBox="0 0 256 256" style="flex-shrink:0">
           <rect width="256" height="256" fill="none"></rect>
           <path d="M173.66,98.34a8,8,0,0,1,0,11.32l-56,56a8,8,0,0,1-11.32,0l-24-24
             a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35A8,8,0,0,1,173.66,98.34ZM232,128
             A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-16,0
             a88,88,0,1,0-88,88A88.1,88.1,0,0,0,216,128Z"></path>
         </svg>`
      : `Select all <svg xmlns="http://www.w3.org/2000/svg" width="19.2" height="19.2"
           fill="currentColor" viewBox="0 0 256 256" style="flex-shrink:0">
           <rect width="256" height="256" fill="none"></rect>
           <path d="M173.66,98.34a8,8,0,0,1,0,11.32l-56,56a8,8,0,0,1-11.32,0l-24-24
             a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35A8,8,0,0,1,173.66,98.34ZM232,128
             A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-16,0
             a88,88,0,1,0-88,88A88.1,88.1,0,0,0,216,128Z"></path>
         </svg>`;
  }

  // ─── Вставляем кнопку в контейнер ───────────────────────────────────────────
  function inject() {
    if (document.getElementById('stv-select-all-btn')) return;

    // Первый .buttons внутри .controls — там где Edit/Select
    const controlsDiv = document.querySelector('div.controls');
    if (!controlsDiv) return;
    const firstButtons = controlsDiv.querySelector('div.buttons');
    if (!firstButtons) return;

    // Вставляем перед Select-кнопкой (последний button в первом .buttons)
    const selectBtn = firstButtons.querySelector('button:last-of-type');
    firstButtons.insertBefore(createBtn(), selectBtn ?? null);
    console.log('[7TV-SA] ✓ Кнопка Select All вставлена');
  }

  // ─── Сброс состояния при навигации (SPA) ────────────────────────────────────
  function resetState() {
    allSelected = false;
    const btn = document.getElementById('stv-select-all-btn');
    if (btn) updateBtnLabel(btn);
  }

  // ─── MutationObserver — ждём появления controls ──────────────────────────────
  const obs = new MutationObserver(() => {
    inject();
    // Если кнопку убрал Svelte после SPA-перехода — сбрасываем состояние
    if (!document.getElementById('stv-select-all-btn')) resetState();
  });
  obs.observe(document.body, { childList: true, subtree: true });

  // ─── Первичный запуск ────────────────────────────────────────────────────────
  inject();

})();
