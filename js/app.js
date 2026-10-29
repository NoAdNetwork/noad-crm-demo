// Каркас админки: вход персонала, меню слева по разделам, маршрут по #hash.
'use strict';

(() => {
  const app = document.getElementById('app');
  const MENU = [
    ['Обзор', [['decisions', 'Центр решений']]],
    ['Продажи', [['funnel', 'Воронка'], ['deals', 'Все сделки']]],
    ['База', [['advertisers', 'Рекламодатели'], ['publishers', 'Сети и паблишеры']]],
    ['Финансы', [['costs', 'Расходы', 'admin']]],
  ];
  // Старые ссылки первой версии.
  const ALIASES = { summary: 'decisions' };
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

  // #advertisers/<id> — карточка компании внутри раздела базы.
  function current() {
    const [hash, id] = location.hash.slice(1).split('/');
    const route = ALIASES[hash] || hash;
    const known = allowed().some(([, items]) => items.some(([k]) => k === route));
    return known ? { route, id: ['advertisers', 'publishers'].includes(route) ? id : undefined } : { route: 'decisions' };
  }

  async function render() {
    const { route, id } = current();
    const key = route + '/' + (id || '');
    if (state.key !== key) {
      Object.keys(state).forEach((k) => delete state[k]);
      state.key = key;
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
      if (id) await Profile.page(screen, ctx, route === 'advertisers' ? 'advertiser' : 'publisher', id);
      else if (route === 'funnel') await Funnel.board(screen, ctx);
      else await Screens[route](screen, ctx);
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
    // Компания открывается страницей в базе, сделка — карточкой поверх текущего экрана.
    async open(kind, id) {
      if (kind === 'deal') return Funnel.openDeal(ctx, id);
      const company = await Api.company(id);
      location.hash = `${company.kind}s/${id}`;
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
      set('funnel', late || s.pipeline.open, late > 0);
    } catch (_) { /* счётчики необязательны */ }
  }

  window.addEventListener('hashchange', () => me && render());

  Api.me()
    .then((principal) => { me = principal; render(); })
    .catch(login);
})();
