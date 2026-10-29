// Каркас админки: вход персонала, меню, маршрут по #hash.
'use strict';

(() => {
  const app = document.getElementById('app');
  const NAV = [
    ['summary', 'Сводка'],
    ['advertisers', 'Рекламодатели'],
    ['publishers', 'Паблишеры'],
    ['funnel', 'Воронка'],
    ['costs', 'Расходы', 'admin'],
  ];
  let me = null;
  const state = {};

  function login() {
    app.innerHTML = `<div class="login">
      <img src="favicon.svg" alt="" width="48" height="48">
      <h1>CRM noad.network</h1>
      <p class="muted">Вход для персонала через Google Workspace.</p>
      <a class="btn primary" href="/auth/staff/login">Войти</a></div>`;
  }

  async function render() {
    const allowed = NAV.filter(([, , role]) => !role || me.role === role);
    const route = allowed.some(([k]) => k === location.hash.slice(1)) ? location.hash.slice(1) : 'summary';
    if (state.route !== route) {
      Object.keys(state).forEach((k) => delete state[k]);
      state.route = route;
    }
    app.innerHTML = `
      <aside class="side">
        <div class="brand"><img src="favicon.svg" alt="">noad <span>CRM</span></div>
        ${allowed.map(([k, label]) => `<a class="nav${k === route ? ' on' : ''}" href="#${k}">${label}<span data-badge="${k}"></span></a>`).join('')}
        <div class="who">${Api.demo ? '<span class="chip amber">Демо: данные в браузере</span><br>' : ''}${me.role === 'admin' ? 'Администратор' : 'Менеджер'}<br>
          <button class="btn sm ghost" data-logout>${Api.demo ? 'Сбросить демо' : 'Выйти'}</button></div>
      </aside>
      <main class="main" id="screen"><div class="muted">Загрузка…</div></main>`;
    app.querySelector('[data-logout]').addEventListener('click', async () => {
      if (Api.demo) Api.reset();
      else await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' });
      location.reload();
    });
    const screen = document.getElementById('screen');
    const ctx = { me, state, refresh: render };
    try {
      await Screens[route](screen, ctx);
    } catch (error) {
      if (error.status === 401) return login();
      screen.innerHTML = `<div class="note red">Не удалось загрузить: ${UI.esc(error.message)}</div>`;
    }
    applySizes(screen);
    badges();
  }

  // Ширины полос задаются через CSSOM, а не атрибутом style: CSP админки без 'unsafe-inline'.
  function applySizes(root) {
    root.querySelectorAll('[data-w]').forEach((el) => { el.style.width = el.dataset.w + '%'; });
    root.querySelectorAll('[data-columns]').forEach((el) => {
      el.style.gridTemplateColumns = `repeat(${el.dataset.columns}, minmax(220px, 1fr))`;
    });
  }

  // Красная метка в меню — сколько рабочих компаний требуют проверки.
  async function badges() {
    try {
      const s = await Api.summary();
      for (const kind of ['advertiser', 'publisher']) {
        const n = s.atRisk.filter((c) => c.kind === kind).length;
        const el = app.querySelector(`[data-badge="${kind}s"]`);
        if (el) el.outerHTML = n ? `<span class="badge">${n}</span>` : '';
      }
    } catch (_) { /* метки необязательны */ }
  }

  window.addEventListener('hashchange', () => me && render());

  Api.me()
    .then((principal) => { me = principal; render(); })
    .catch(login);
})();
