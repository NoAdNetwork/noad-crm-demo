// Каркас админки: вход персонала, меню слева по разделам, маршрут по #hash.
'use strict';

(() => {
  const app = document.getElementById('app');
  const MENU = [
    ['Обзор', [['decisions', 'Центр решений']]],
    ['Клиенты', [['advertisers', 'Рекламодатели'], ['publishers', 'Сети и паблишеры']]],
    ['Продажи', [['deals', 'Сделки']]],
    ['Финансы', [['costs', 'Расходы', 'admin']]],
  ];
  // Старые ссылки первой версии.
  const ALIASES = { summary: 'decisions', funnel: 'deals' };
  let me = null;
  const state = {};

  function login() {
    app.innerHTML = `<div class="login"><div class="login-box">
      <div class="brand-mark">${UI.ICONS.mark}</div>
      <h1>CRM noad.network</h1>
      <p class="sub">Вход для сотрудников через Google Workspace</p>
      <a class="btn primary" href="/auth/staff/login">Войти через Google</a></div></div>`;
  }

  const allowed = () => MENU.map(([title, items]) => [title, items.filter(([, , role]) => !role || me.role === role)])
    .filter(([, items]) => items.length);

  function current() {
    const hash = location.hash.slice(1);
    const route = ALIASES[hash] || hash;
    return allowed().some(([, items]) => items.some(([k]) => k === route)) ? route : 'decisions';
  }

  async function render() {
    const route = current();
    if (state.route !== route) {
      Object.keys(state).forEach((k) => delete state[k]);
      state.route = route;
    }
    app.innerHTML = `
      <aside class="side">
        <div class="brand"><div class="brand-mark">${UI.ICONS.mark}</div>
          <div class="brand-name">noad.network<small>CRM правления</small></div></div>
        ${allowed().map(([title, items]) => `<nav class="nav-group" aria-label="${title}">
          <div class="nav-title">${title}</div>
          ${items.map(([k, label]) => `<a class="nav${k === route ? ' on' : ''}" href="#${k}" title="${label}">
            ${UI.ICONS[k]}<span class="label">${label}</span><span data-count="${k}"></span></a>`).join('')}
        </nav>`).join('')}
        <div class="side-foot">
          ${Api.demo ? '<div class="demo-flag"><span class="tag warn">Демо: данные в браузере</span></div>' : ''}
          <div class="who"><div class="avatar">${me.role === 'admin' ? 'A' : 'M'}</div>
            <div><b>${me.role === 'admin' ? 'Администратор' : 'Менеджер'}</b>
              <button class="btn ghost sm" data-logout>${Api.demo ? 'Сбросить демо' : 'Выйти'}</button></div></div>
        </div>
      </aside>
      <main class="main" id="screen"><div class="muted">Загрузка…</div></main>`;
    app.querySelector('[data-logout]').addEventListener('click', async () => {
      if (Api.demo) Api.reset();
      else await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' });
      location.reload();
    });
    const screen = document.getElementById('screen');
    try {
      await Screens[route](screen, ctx);
    } catch (error) {
      if (error.status === 401) return login();
      screen.innerHTML = `<div class="callout neg"><b>Не удалось загрузить данные</b>${UI.esc(error.message)}</div>`;
    }
    counts();
  }

  const ctx = {
    get me() { return me; },
    state,
    refresh: render,
    open(kind, id) {
      if (kind === 'company') Screens.companyForm(ctx, null, id);
      else if (kind === 'deal') Screens.openDeal(ctx, id);
    },
  };

  // Счётчики в меню: красный — сколько требуют решения, серый — сколько открытых сделок.
  async function counts() {
    try {
      const [s, deals] = await Promise.all([Api.summary(), Api.deals()]);
      const late = deals.filter((d) => UI.dealProblem(d)).length;
      const issues = (k) => s.atRisk.filter((c) => c.kind === k).length;
      const set = (route, n, neg) => {
        const el = app.querySelector(`[data-count="${route}"]`);
        if (el) el.outerHTML = n ? `<span class="count${neg ? ' neg' : ''}">${n}</span>` : '';
      };
      set('decisions', s.atRisk.length + late, true);
      set('advertisers', issues('advertiser'), true);
      set('publishers', issues('publisher'), true);
      set('deals', late || s.pipeline.open, late > 0);
    } catch (_) { /* счётчики необязательны */ }
  }

  window.addEventListener('hashchange', () => me && render());

  Api.me()
    .then((principal) => { me = principal; render(); })
    .catch(login);
})();
