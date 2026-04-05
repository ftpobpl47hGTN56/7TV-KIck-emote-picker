// ═══════════════════════════════════════════════════════════════════════
//  ДИАГНОСТИКА mod-actions — вставить целиком в DevTools Console на Kick
//  Покажет: fiber props, все куки, localStorage токены, структуру auth
// ═══════════════════════════════════════════════════════════════════════

(function diagnose() {

  console.clear();
  console.log('%c=== MOD-ACTIONS ДИАГНОСТИКА ===', 'font-size:16px;font-weight:bold;color:#53fc18');

  // ──────────────────────────────────────────────────────────────────────
  // 1. ВСЕ КУКИ — смотрим что вообще есть
  // ──────────────────────────────────────────────────────────────────────
  console.group('%c[1] ВСЕ КУКИ', 'color:#ffa94d;font-weight:bold');
  const cookies = document.cookie.split(';').map(c => c.trim());
  if (cookies.length === 0 || (cookies.length === 1 && cookies[0] === '')) {
    console.warn('❌ Куки пустые или недоступны (HttpOnly)');
  } else {
    cookies.forEach(c => console.log(c));
  }
  console.groupEnd();

  // ──────────────────────────────────────────────────────────────────────
  // 2. ТОКЕНЫ В localStorage
  // ──────────────────────────────────────────────────────────────────────
  console.group('%c[2] localStorage — все ключи', 'color:#ffa94d;font-weight:bold');
  const lsKeys = Object.keys(localStorage);
  if (lsKeys.length === 0) {
    console.warn('❌ localStorage пустой');
  } else {
    // Ищем потенциально полезные ключи
    const authKeys = lsKeys.filter(k =>
      /token|auth|user|kick|session|bearer|xsrf|csrf/i.test(k)
    );
    console.log('Все ключи:', lsKeys);
    if (authKeys.length > 0) {
      console.log('%cПотенциально полезные:', 'color:#69db7c');
      authKeys.forEach(k => {
        try {
          const val = localStorage.getItem(k);
          // Пробуем распарсить JSON
          try {
            const parsed = JSON.parse(val);
            console.log(`  ${k}:`, parsed);
          } catch {
            console.log(`  ${k}:`, val?.slice(0, 200));
          }
        } catch(e) {}
      });
    } else {
      console.warn('Ключей с auth/token/user не найдено');
    }
  }
  console.groupEnd();

  // ──────────────────────────────────────────────────────────────────────
  // 3. REACT FIBER — ищем message.id в строке чата
  // ──────────────────────────────────────────────────────────────────────
  console.group('%c[3] React Fiber — поиск message ID', 'color:#ffa94d;font-weight:bold');

  const line = document.querySelector('.chat-line-style--basic');
  if (!line) {
    console.error('❌ Строки чата (.chat-line-style--basic) не найдены');
  } else {
    console.log('Строка чата:', line);

    // Находим fiber ключ
    const fiberKey = Object.keys(line).find(k => k.startsWith('__reactFiber$'));
    console.log('Fiber ключ:', fiberKey ?? '❌ не найден');

    if (fiberKey) {
      // Проходим вверх по дереву и логируем каждый уровень с props.message
      let fiber = line[fiberKey];
      let depth = 0;
      let found = false;

      while (fiber && depth < 40) {
        const props = fiber.memoizedProps || fiber.pendingProps;
        if (props && props.message) {
          console.log(`%c✅ Нашли props.message на глубине ${depth}:`, 'color:#69db7c;font-weight:bold');
          console.log('props.message:', props.message);
          console.log('  id:', props.message.id);
          console.log('  content:', props.message.content);
          console.log('  sender:', props.message.sender);
          found = true;
          break;
        }
        fiber = fiber.return;
        depth++;
      }

      if (!found) {
        console.warn('❌ props.message не найден за 40 уровней вверх');
        console.log('Пробуем через дочерние узлы...');

        // Пробуем через дочерние элементы
        for (const child of line.querySelectorAll('*')) {
          const ck = Object.keys(child).find(k => k.startsWith('__reactFiber$'));
          if (!ck) continue;
          let f = child[ck];
          let d = 0;
          while (f && d < 20) {
            const p = f.memoizedProps || f.pendingProps;
            if (p?.message?.id) {
              console.log(`%c✅ Нашли через дочерний ${child.tagName}:`, 'color:#69db7c');
              console.log('props.message:', p.message);
              break;
            }
            f = f.return;
            d++;
          }
          if (found) break;
        }
      }

      // Независимо от результата — показываем все props верхнего уровня
      console.log('%cВсе memoizedProps на самой строке:', 'color:#74c0fc');
      console.log(line[fiberKey]?.memoizedProps);
    }
  }
  console.groupEnd();

  // ──────────────────────────────────────────────────────────────────────
  // 4. НАТИВНАЯ КНОПКА УДАЛЕНИЯ KICK — можем ли кликнуть?
  // ──────────────────────────────────────────────────────────────────────
  console.group('%c[4] Нативные кнопки Kick', 'color:#ffa94d;font-weight:bold');
  const hoverBar = document.querySelector('.betterhover\\:group-hover\\:flex');
  console.log('Hover bar найден:', hoverBar ? '✅' : '❌');
  if (hoverBar) {
    const btns = hoverBar.querySelectorAll('button');
    btns.forEach((b, i) => {
      console.log(`  Кнопка ${i}: aria-label="${b.getAttribute('aria-label')}", disabled=${b.disabled}`);
    });
    const delBtn = hoverBar.querySelector('[aria-label="Удалить"], [aria-label="Delete"]');
    console.log('Кнопка "Удалить":', delBtn ? '✅ найдена' : '❌ не найдена');
  }
  console.groupEnd();

  // ──────────────────────────────────────────────────────────────────────
  // 5. ПРОВЕРКА API — тест запрос к каналу
  // ──────────────────────────────────────────────────────────────────────
  console.group('%c[5] API тест — GET /api/v2/channels/{slug}', 'color:#ffa94d;font-weight:bold');
  const slug = location.pathname.match(/^\/([a-zA-Z0-9_\-]+)/)?.[1];
  console.log('slug:', slug);

  if (slug) {
    fetch(`https://kick.com/api/v2/channels/${slug}`, {
      credentials: 'include',
      headers: { accept: 'application/json' }
    })
    .then(r => {
      console.log('API статус:', r.status, r.statusText);
      return r.json();
    })
    .then(data => {
      console.log('role:', data.role);
      console.log('can_moderate:', data.can_moderate);
      console.log('user_id:', data.user_id);
      // Ищем любые поля связанные с auth/token
      const authFields = Object.entries(data).filter(([k]) =>
        /token|auth|xsrf|csrf|bearer/i.test(k)
      );
      if (authFields.length > 0) console.log('Auth поля:', authFields);
      console.log('Полный ответ:', data);
    })
    .catch(e => console.error('Fetch error:', e));
  }
  console.groupEnd();

  // ──────────────────────────────────────────────────────────────────────
  // 6. NETWORK — подсказка как найти токен вручную
  // ──────────────────────────────────────────────────────────────────────
  console.group('%c[6] Как найти auth токен вручную', 'color:#ffa94d;font-weight:bold');
  console.log(`%cЕсли токен нигде не нашёлся выше:
1. Открой DevTools → вкладка Network
2. Кликни на любое сообщение в чате (или отправь сообщение)
3. Найди XHR/Fetch запрос к kick.com/api/...
4. Открой вкладку "Headers" этого запроса
5. В разделе "Request Headers" ищи:
   - Authorization: Bearer xxxxx
   - X-XSRF-TOKEN: xxxxx
   - Cookie: (там могут быть httpOnly куки недоступные через JS)
`, 'color:#a9e34b;font-family:monospace');
  console.groupEnd();

  console.log('%c=== ДИАГНОСТИКА ЗАВЕРШЕНА ===', 'font-size:14px;font-weight:bold;color:#53fc18');
  console.log('Скопируй вывод и пришли — разберёмся что использовать для auth.');

})();
