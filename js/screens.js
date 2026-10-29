// Экраны CRM правления: центр решений, рекламодатели, сети, сделки, расходы.
// Каждый экран — async (root, ctx) → рисует себя в root; ctx.refresh() перерисовывает текущий.
'use strict';

const Screens = (() => {
  const {
    esc, money, days, date, ago, today, daysBetween, num, options, drawer, tag,
    problems, health, dealProblem, ICONS, STATUS, STATUS_TAG, STAGES, OPEN, CATEGORIES, PERIODS, KIND,
    activeBlockers, BLOCKERS, SIDE, PUBLISHER_TYPE, PAYMENT, managerName,
  } = UI;
  // Отбор по менеджеру: все / мои / без менеджера / конкретный.
  const byManager = (ctx, managerId) => {
    const m = ctx.state.manager;
    return !m || (m === 'mine' ? managerId === ctx.me.id : m === 'none' ? !managerId : managerId === m);
  };
  const managerSelect = (ctx) => `<select data-pick="manager" aria-label="Менеджер">${[
    ['', 'Все менеджеры'], ['mine', 'Мои'], ['none', 'Без менеджера'],
    ...ctx.staff.map((s) => [s.id, managerName(s.email, s.fullName)]),
  ].map(([k, v]) => `<option value="${k}"${k === (ctx.state.manager || '') ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select>`;
  const pick = (name, map, value, all) => `<select data-pick="${name}" aria-label="${all}">${[['', all], ...Object.entries(map)]
    .map(([k, v]) => `<option value="${k}"${k === (value || '') ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select>`;

  const failure = (error) => {
    const entries = Object.entries(error.fields || {});
    return entries.length ? 'Проверьте поля: ' + entries.map(([k]) => k).join(', ') : 'Не удалось сохранить';
  };
  const kpi = (label, value, note = '', level = '') =>
    `<div class="kpi ${level}"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-note">${note}</div></div>`;
  const perMonth = (v) => `${money(v)}<small>/мес</small>`;
  const head = (title, text, tools = '') =>
    `<div class="page-head"><div><h1>${title}</h1>${text ? `<p>${text}</p>` : ''}</div><div class="tools">${tools}</div></div>`;
  const tabs = (items, current) =>
    `<div class="tabs">${items.map(([k, label, n, level]) =>
      `<button data-tab="${k}" class="${k === current ? 'on' : ''}">${label}${n !== undefined ? `<span class="count ${level || ''}">${n}</span>` : ''}</button>`).join('')}</div>`;
  const search = (value, placeholder) =>
    `<label class="search">${ICONS.search}<input data-search type="search" placeholder="${placeholder}" value="${esc(value || '')}"></label>`;
  const match = (q, ...fields) => !q || fields.join(' ').toLowerCase().includes(q.toLowerCase());
  const runway = (v) => (v === null || v === undefined ? '—' : v <= 0 ? 'меньше дня' : days(v));

  // Таблица перерисовывается отдельно от экрана, чтобы поиск не терял фокус.
  function bindList(root, ctx, draw) {
    const body = root.querySelector('[data-list]');
    const redraw = () => { body.innerHTML = draw(); bindRows(); };
    const bindRows = () => body.querySelectorAll('[data-open]').forEach((el) =>
      el.addEventListener('click', () => ctx.open(el.dataset.open, el.dataset.id)));
    root.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
      ctx.state.tab = b.dataset.tab;
      ctx.refresh();
    }));
    root.querySelector('[data-search]')?.addEventListener('input', (e) => {
      ctx.state.q = e.target.value;
      redraw();
    });
    redraw();
  }

  /* ── Центр решений ──────────────────────────────────── */

  async function decisions(root, ctx) {
    const [month0, today0] = Offers.period('month');
    const [s, advertisers, publishers, deals, cash] = await Promise.all([
      Api.summary(), Api.companies('advertiser'), Api.companies('publisher'), Api.deals(),
      Api.binomMoney(month0, today0).catch(() => null),
    ]);
    const adv = s.advertisers, pub = s.publishers, pipe = s.pipeline;
    const runwayOf = (balance, monthly) => (monthly ? Math.floor(balance / (monthly / 30)) : null);
    const issues = [
      ...[...advertisers, ...publishers].filter((c) => c.status === 'active')
        .flatMap((c) => problems(c).map((p) => ({ ...p, who: c.name, kind: KIND[c.kind], open: 'company', id: c.id }))),
      ...deals.map((d) => [d, dealProblem(d)]).filter(([, p]) => p)
        .map(([d, p]) => ({ ...p, who: d.title, kind: `Сделка · ${d.companyName}`, open: 'deal', id: d.id })),
    ].sort((a, b) => (a.level === b.level ? 0 : a.level === 'neg' ? -1 : 1));
    const urgent = issues.filter((i) => i.level === 'neg').length;
    const open = deals.filter((d) => OPEN.includes(d.stage)).sort((a, b) => (b.value || 0) - (a.value || 0));
    const costs = s.costs;
    const advRunway = runwayOf(adv.balance, adv.monthlySpend);
    const pubRunway = runwayOf(pub.balance, pub.monthlySpend);
    const stamp = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

    // Прибыль — оценка по оборотам из карточек: рекламодатели платят нам, мы платим сетям,
    // сверху расходы компании. День = месяц / 30, как и запас денег в днях.
    const now = new Date();
    const elapsed = now.getDate();
    const monthDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const monthName = now.toLocaleDateString('ru-RU', { month: 'long' });
    const grossDay = (adv.monthlySpend - pub.monthlySpend) / 30;
    const costDay = costs ? costs.monthly / 30 : 0;
    const netDay = grossDay - costDay;
    const marginPct = adv.monthlySpend ? Math.round(((grossDay * 30) / adv.monthlySpend) * 100) : null;
    const signed = (v) => `<span class="${v < 0 ? 'neg-text' : ''}">${v < 0 ? '−' : ''}${money(Math.abs(Math.round(v)))}</span>`;
    // Факт из Бинома, когда синк работает: прибыль по дням текущего месяца минус расходы компании.
    const fact = cash && cash.days.length ? (() => {
      const sum = (key, list) => list.reduce((a, d) => a + d[key], 0);
      const byDay = Object.fromEntries(cash.days.map((d) => [d.day, d]));
      const iso = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
      const gross = sum('profit', cash.days);
      const avg = gross / elapsed;
      return { gross, revenue: sum('revenue', cash.days), cost: sum('cost', cash.days), avg,
        today: byDay[iso(0)]?.profit || 0, yesterday: byDay[iso(1)]?.profit || 0 };
    })() : null;
    const factBlock = fact ? `
      <div class="profit">
        <div class="profit-item"><div class="kpi-label">${costs ? 'Чистая' : 'Валовая'} прибыль за ${monthName}</div>
          <div class="profit-value">${signed(fact.gross - costDay * elapsed)}</div>
          <div class="kpi-note">валовая ${signed(fact.gross)}${costs ? ` − расходы ${money(Math.round(costDay * elapsed))}` : ''} · ${days(elapsed)}</div></div>
        <div class="profit-item"><div class="kpi-label">${costs ? 'Чистая' : 'Валовая'} прибыль в день</div>
          <div class="profit-value">${signed(fact.avg - costDay)}</div>
          <div class="kpi-note">вчера ${signed(fact.yesterday - costDay)} · сегодня пока ${signed(fact.today)}</div></div>
        <div class="profit-item"><div class="kpi-label">Прогноз за ${monthName}</div>
          <div class="profit-value">${signed((fact.avg - costDay) * monthDays)}</div>
          <div class="kpi-note">оборот ${money(fact.revenue)} · закупка ${money(fact.cost)} · маржа ${fact.revenue ? Math.round((fact.gross / fact.revenue) * 100) : 0}%</div></div>
        <p class="profit-note">Факт по Биному${cash.syncedAt ? ` на ${new Date(cash.syncedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}: что заплатили рекламодатели − что заплатили сетям${costs ? ' − расходы компании из раздела «Расходы»' : ''}.</p>
      </div>` : '';
    const profit = factBlock || (costs ? `
      <div class="profit">
        <div class="profit-item"><div class="kpi-label">Чистая прибыль за ${monthName}</div>
          <div class="profit-value">${signed(netDay * elapsed)}</div>
          <div class="kpi-note">с 1 по ${elapsed} ${now.toLocaleDateString('ru-RU', { month: 'long', day: 'numeric' }).split(' ')[1]} · ${days(elapsed)}</div></div>
        <div class="profit-item"><div class="kpi-label">Чистая прибыль в день сейчас</div>
          <div class="profit-value">${signed(netDay)}</div>
          <div class="kpi-note">валовая ${signed(grossDay)} − расходы ${money(Math.round(costDay))}</div></div>
        <div class="profit-item"><div class="kpi-label">Прогноз за ${monthName}</div>
          <div class="profit-value">${signed(netDay * monthDays)}</div>
          <div class="kpi-note">валовая маржа ${marginPct === null ? '—' : marginPct + '%'} от оборота</div></div>
        <p class="profit-note">Оценка по текущим оборотам из карточек: оборот рекламодателей − закупка трафика в сетях − расходы компании. Не факт из трекера.</p>
      </div>` : `
      <div class="profit">
        <div class="profit-item"><div class="kpi-label">Валовая прибыль за ${monthName}</div>
          <div class="profit-value">${signed(grossDay * elapsed)}</div><div class="kpi-note">с 1-го числа · ${days(elapsed)}</div></div>
        <div class="profit-item"><div class="kpi-label">Валовая прибыль в день сейчас</div>
          <div class="profit-value">${signed(grossDay)}</div><div class="kpi-note">маржа ${marginPct === null ? '—' : marginPct + '%'} от оборота</div></div>
        <p class="profit-note">Оценка: оборот рекламодателей − закупка трафика в сетях. Чистую прибыль с расходами компании видит администратор.</p>
      </div>`);

    // На чём стоим: активные стопперы открытых сделок по типам — вопросы к правлению.
    const stops = {};
    for (const d of open) {
      for (const b of activeBlockers(d)) {
        const g = (stops[b.type] ||= { count: 0, value: 0, us: 0, deals: [] });
        g.count += 1;
        g.value += d.value || 0;
        if (b.side === 'us') g.us += 1;
        g.deals.push(d.companyName);
      }
    }
    const stopRows = Object.entries(stops).sort((a, b) => b[1].value - a[1].value);

    // По менеджерам: за кем какие деньги, сделки и проблемы.
    const companies = [...advertisers, ...publishers];
    const people = [...ctx.staff.map((m) => [m.id, m.email, m.fullName, m.title]), [null, null, '', '']].map(([mid, email, fullName, title]) => {
      const own = companies.filter((c) => (c.managerId || null) === mid);
      const ownDeals = open.filter((d) => (d.managerId || null) === mid);
      const working = own.filter((c) => c.kind === 'advertiser' && c.status === 'active');
      return {
        mid, email, fullName, title,
        clients: working.length,
        turnover: working.reduce((a, c) => a + (c.monthlySpend || 0), 0),
        publishers: own.filter((c) => c.kind === 'publisher' && c.status === 'active').length,
        deals: ownDeals.length,
        potential: ownDeals.reduce((a, d) => a + (d.value || 0), 0),
        issues: own.filter((c) => c.status === 'active' && problems(c).length).length + ownDeals.filter((d) => dealProblem(d)).length,
        any: own.length + ownDeals.length,
      };
    }).filter((p) => p.any).sort((a, b) => b.turnover - a.turnover || b.potential - a.potential);

    root.innerHTML = `
      ${head('Центр решений', `Положение на ${stamp}`)}
      ${profit}
      <div class="kpis">
        ${kpi('Оборот рекламодателей', perMonth(adv.monthlySpend), `${adv.active} ${adv.active === 1 ? 'рабочий клиент' : 'рабочих клиентов'}`)}
        ${kpi('Деньги клиентов на балансах', money(adv.balance), advRunway === null ? 'расход не указан' : `≈ ${days(advRunway)} работы при текущем обороте`)}
        ${kpi('Наши деньги в сетях', money(pub.balance), pubRunway === null ? 'расход не указан' : `≈ ${days(pubRunway)} закупки трафика`, pubRunway !== null && pubRunway < 7 ? 'neg' : '')}
        ${costs ? kpi('Расходы компании', perMonth(costs.monthly), Object.entries(CATEGORIES).filter(([k]) => costs.byCategory[k]).map(([k, l]) => `${l} ${money(costs.byCategory[k])}`).join(' · ')) : ''}
        ${kpi('Потенциал новых сделок', perMonth(pipe.openValue), `${pipe.open} ${pipe.open === 1 ? 'открытая сделка' : 'открытых сделок'}`)}
      </div>

      <div class="card">
        <div class="card-head"><div><h2>Требует решения</h2>
          <p>${issues.length ? `${urgent} срочно · ${issues.length - urgent} проверить` : 'Сигналов нет'}</p></div></div>
        ${issues.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Приоритет</th><th>Кто</th><th>Что не так</th><th>Что сделать</th></tr></thead>
          <tbody>${issues.map((i) => `<tr class="click row-${i.level}" data-open="${i.open}" data-id="${i.id}">
            <td>${tag(i.level === 'neg' ? 'Срочно' : 'Проверить', i.level)}</td>
            <td class="name"><b>${esc(i.who)}</b><span>${esc(i.kind)}</span></td>
            <td>${esc(i.text)}</td>
            <td class="action">${esc(i.action)}</td></tr>`).join('')}</tbody></table></div>`
          : `<div class="ok-box">${ICONS.check} Все рабочие клиенты и сети при деньгах, просроченных шагов нет.</div>`}
      </div>

      ${stopRows.length ? `<div class="card">
        <div class="card-head"><div><h2>На чём стоим</h2><p>Стопперы открытых сделок: что нужно решить, чтобы сделки пошли дальше</p></div>
          <a class="btn sm" href="#funnel">Воронка</a></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Стоппер</th><th class="r">Сделок</th><th class="r">Ждёт в месяц</th><th>За кем</th><th>Компании</th></tr></thead>
          <tbody>${stopRows.map(([type, g]) => `<tr>
            <td><b>${esc(BLOCKERS[type])}</b></td><td class="r">${g.count}</td><td class="r nowrap">${money(g.value)}</td>
            <td class="nowrap">${g.us === g.count ? SIDE.us : g.us ? `${g.us} за нами, ${g.count - g.us} за клиентом` : SIDE.client}</td>
            <td>${esc([...new Set(g.deals)].join(', '))}</td></tr>`).join('')}</tbody></table></div>
      </div>` : ''}

      ${people.length ? `<div class="card">
        <div class="card-head"><div><h2>По менеджерам</h2><p>Кто ведёт каких клиентов, сколько денег за ними и где проблемы</p></div></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Менеджер</th><th class="r">Рабочих клиентов</th><th class="r">Оборот клиентов</th><th class="r">Паблишеров</th>
            <th class="r">Открытых сделок</th><th class="r">Потенциал</th><th class="r">Требуют решения</th></tr></thead>
          <tbody>${people.map((p) => `<tr class="click" data-manager="${p.mid || 'none'}">
            <td class="name"><b>${esc(managerName(p.email, p.fullName))}</b><span>${esc(p.title || p.email || 'компании и сделки без менеджера')}</span></td>
            <td class="r">${p.clients}</td><td class="r nowrap">${money(p.turnover)}/мес</td><td class="r">${p.publishers}</td>
            <td class="r">${p.deals}</td><td class="r nowrap">${money(p.potential)}/мес</td>
            <td class="r">${p.issues ? `<span class="neg-text">${p.issues}</span>` : '0'}</td></tr>`).join('')}</tbody></table></div>
      </div>` : ''}

      <div class="grid-2">
        <div class="card">
          <div class="card-head"><div><h2>Воронка продаж</h2><p>Сколько сделок на каждом этапе и сколько они принесут в месяц</p></div>
            <a class="btn sm" href="#deals">Все сделки</a></div>
          <table><thead><tr><th>Этап</th><th class="r">Сделок</th><th class="r">Потенциал в месяц</th></tr></thead>
            <tbody>${Object.entries(STAGES).map(([k, label]) => {
              const st = pipe.stages[k] || { count: 0, value: 0 };
              return `<tr class="${st.count ? '' : 'archived'}"><td>${label}</td><td class="r">${st.count}</td><td class="r">${money(st.value)}</td></tr>`;
            }).join('')}
            <tr class="total"><td>Открытые (без запущенных и отказов)</td><td class="r">${pipe.open}</td><td class="r">${money(pipe.openValue)}</td></tr></tbody></table>
        </div>
        <div class="card">
          <div class="card-head"><div><h2>Крупнейшие открытые сделки</h2><p>Где решение правления даст больше всего денег</p></div></div>
          ${open.length ? `<table><thead><tr><th>Сделка</th><th>Этап</th><th class="r">В месяц</th></tr></thead>
            <tbody>${open.slice(0, 6).map((d) => `<tr class="click" data-open="deal" data-id="${d.id}">
              <td class="name"><b>${esc(d.title)}</b><span>${esc(d.companyName)}</span></td>
              <td>${STAGES[d.stage]}</td><td class="r nowrap">${money(d.value)}</td></tr>`).join('')}</tbody></table>`
            : '<div class="empty">Открытых сделок нет</div>'}
        </div>
      </div>`;
    root.querySelectorAll('[data-open]').forEach((el) =>
      el.addEventListener('click', () => ctx.open(el.dataset.open, el.dataset.id)));
    // Клик по менеджеру — его страница в команде; «без менеджера» — такие клиенты в базе.
    root.querySelectorAll('[data-manager]').forEach((el) => el.addEventListener('click', () => {
      if (el.dataset.manager !== 'none') return void (location.hash = `team/${el.dataset.manager}`);
      try { sessionStorage.setItem('crm-manager', 'none'); } catch (_) { /* без фильтра */ }
      location.hash = 'advertisers';
    }));
  }

  /* ── Рекламодатели и сети ───────────────────────────── */

  function companies(kind) {
    const advertiser = kind === 'advertiser';
    return async (root, ctx) => {
      const list = await Api.companies(kind);
      const rank = (c) => {
        const p = c.status === 'active' ? problems(c)[0] : null;
        return p ? (p.level === 'neg' ? 0 : 1) : c.status === 'active' ? 2 : c.status === 'prospect' ? 3 : c.status === 'paused' ? 4 : 5;
      };
      list.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
      const active = list.filter((c) => c.status === 'active');
      const flagged = active.filter((c) => problems(c).length);
      const urgent = flagged.filter((c) => problems(c)[0].level === 'neg');
      const tab = ctx.state.tab || 'current';
      const FILTERS = {
        current: (c) => c.status !== 'archived',
        issues: (c) => c.status === 'active' && problems(c).length,
        active: (c) => c.status === 'active',
        prospect: (c) => c.status === 'prospect',
        paused: (c) => c.status === 'paused',
        archived: (c) => c.status === 'archived',
      };
      const count = (k) => list.filter(FILTERS[k]).length;
      const balance = active.reduce((a, c) => a + (c.balance || 0), 0);
      const spend = active.reduce((a, c) => a + (c.monthlySpend || 0), 0);

      root.innerHTML = `
        ${head(advertiser ? 'Рекламодатели' : 'Паблишеры',
          advertiser ? 'База клиентов: менеджер, деньги на балансе, контакты' : 'Источники трафика — нетворки, баеры, аффилиаты: менеджер, условия оплаты, наши балансы',
          `<button class="btn primary" data-new>${ICONS.plus} ${advertiser ? 'Добавить рекламодателя' : 'Добавить паблишера'}</button>`)}
        <div class="kpis">
          ${kpi('Рабочих', `${active.length}<small> из ${count('current')}</small>`, advertiser ? 'клиентов с открытым трафиком' : 'сетей, где мы закупаем')}
          ${kpi(advertiser ? 'Деньги клиентов на балансах' : 'Наши деньги в сетях', money(balance), 'по рабочим')}
          ${kpi(advertiser ? 'Оборот' : 'Закупка трафика', perMonth(spend), spend ? `${money(spend / 30)} в день` : 'расход не указан')}
          ${kpi('Требуют действий', `${flagged.length}`, urgent.length ? `${urgent.length} — мало денег` : flagged.length ? 'сверить балансы' : 'всё в порядке', urgent.length ? 'neg' : '')}
        </div>
        <div class="card">
          ${tabs([
            ['current', 'Все текущие', count('current')],
            ['issues', 'Требуют действий', count('issues'), urgent.length ? 'neg' : ''],
            ['active', 'Рабочие', count('active')],
            ['prospect', 'Потенциальные', count('prospect')],
            ['paused', 'На паузе', count('paused')],
            ['archived', 'Архив', count('archived')],
          ], tab)}
          <div class="card-head"><div class="tools">${search(ctx.state.q, 'Поиск по названию или контакту')}${managerSelect(ctx)}
            ${advertiser ? '' : pick('ptype', PUBLISHER_TYPE, ctx.state.ptype, 'Все типы') + pick('terms', PAYMENT, ctx.state.terms, 'Препей и постпей')}</div>
            <span class="sub">Строки с проблемами — сверху</span></div>
          <div class="table-wrap"><table>
            <thead><tr><th>Компания</th><th>Менеджер</th>${advertiser ? '' : '<th>Тип</th><th>Оплата</th>'}<th>Статус</th><th>Состояние</th><th class="r">Баланс</th><th class="r">Расход в день</th>
              <th class="r">Денег хватит на</th><th class="r">Порог</th><th>Баланс сверен</th><th>Контакт</th><th class="r">Сделки</th></tr></thead>
            <tbody data-list></tbody></table></div>
        </div>`;
      root.querySelector('[data-new]').addEventListener('click', () => companyForm(ctx, kind));
      root.querySelectorAll('[data-pick]').forEach((el) => el.addEventListener('change', () => {
        ctx.state[el.dataset.pick] = el.value;
        ctx.refresh();
      }));
      bindList(root, ctx, () => {
        const shown = list.filter(FILTERS[tab]).filter((c) => byManager(ctx, c.managerId)
          && (!ctx.state.ptype || c.publisherType === ctx.state.ptype) && (!ctx.state.terms || c.paymentTerms === ctx.state.terms)
          && match(ctx.state.q, c.name, c.website, ...c.contacts.map((p) => `${p.name} ${p.email} ${p.telegram}`)));
        if (!shown.length) return `<tr><td colspan="13" class="empty">${list.length ? 'Ничего не найдено' : 'Пока пусто — добавьте первую компанию'}</td></tr>`;
        return shown.map((c) => {
          const p = c.status === 'active' ? problems(c)[0] : null;
          const contact = c.contacts[0];
          const low = c.alerts.includes('low_balance') || c.alerts.includes('runway');
          return `<tr class="click ${p ? 'row-' + p.level : ''} ${c.status === 'archived' ? 'archived' : ''}" data-open="company" data-id="${c.id}">
            <td class="name"><b>${esc(c.name)}</b>${c.website ? `<span>${esc(c.website.replace(/^https?:\/\//, ''))}</span>` : ''}</td>
            <td class="nowrap ${c.managerId ? '' : 'muted'}">${esc(managerName(c.managerEmail, c.managerName))}</td>
            ${advertiser ? '' : `<td>${c.publisherType ? esc(PUBLISHER_TYPE[c.publisherType]) : '<span class="muted">—</span>'}</td>
              <td>${c.paymentTerms ? tag(PAYMENT[c.paymentTerms], c.paymentTerms === 'prepay' ? 'warn' : 'info') : '<span class="muted">—</span>'}</td>`}
            <td>${tag(STATUS[c.status], STATUS_TAG[c.status])}</td>
            <td>${health(c)}</td>
            <td class="r nowrap ${low ? 'neg-text' : ''}">${money(c.balance)}</td>
            <td class="r nowrap">${c.monthlySpend ? money(c.monthlySpend / 30) : '—'}</td>
            <td class="r nowrap ${c.alerts.includes('runway') ? 'neg-text' : ''}">${runway(c.runwayDays)}</td>
            <td class="r nowrap muted">${money(c.lowBalance)}</td>
            <td class="nowrap ${c.alerts.includes('unchecked') ? 'warn-text' : 'muted'}">${c.balance === null ? '—' : ago(c.balanceCheckedAt)}</td>
            <td class="name">${contact ? `<b>${esc(contact.name)}</b><span>${esc(contact.telegram || contact.email || contact.role)}</span>` : '<span>—</span>'}</td>
            <td class="r">${c.openDeals || '—'}</td></tr>`;
        }).join('');
      });
    };
  }

  function contactRow(c = {}) {
    return `<div class="contact" data-contact>
      <input data-k="name" placeholder="Имя" value="${esc(c.name)}" aria-label="Имя">
      <input data-k="role" placeholder="Должность" value="${esc(c.role)}" aria-label="Должность">
      <input data-k="telegram" placeholder="Telegram" value="${esc(c.telegram)}" aria-label="Telegram">
      <input data-k="email" placeholder="Email" value="${esc(c.email)}" aria-label="Email">
      <button class="icon-btn" data-remove title="Удалить контакт" aria-label="Удалить контакт">${ICONS.close}</button></div>`;
  }

  async function companyForm(ctx, kind, id) {
    // Новая компания по умолчанию закрепляется за тем, кто её заводит.
    const c = id ? await Api.company(id) : { kind, status: 'prospect', contacts: [], deals: [], alerts: [], balance: null, managerId: ctx.me.id };
    kind = c.kind;
    const issues = c.status === 'active' ? problems(c) : [];
    const field = (name, label, value, attrs = '', hint = '') =>
      `<div class="field"><label for="f-${name}">${label}</label><input id="f-${name}" name="${name}" value="${esc(value ?? '')}" ${attrs}>${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
    drawer({
      title: id ? c.name : kind === 'advertiser' ? 'Новый рекламодатель' : 'Новая сеть',
      sub: id ? `${KIND[kind]} · ${tag(STATUS[c.status], STATUS_TAG[c.status])}` : KIND[kind],
      body: `
        ${issues.map((p) => `<div class="callout ${p.level}"><b>${p.label}: ${esc(p.action.toLowerCase())}</b>${esc(p.text)}</div>`).join('')}
        <div class="block"><div class="block-title">Компания</div><div class="form">
          <div class="field full"><label for="f-name">Название</label><input id="f-name" name="name" value="${esc(c.name)}" required></div>
          ${field('website', 'Сайт', c.website, 'placeholder="https://"')}
          <div class="field"><label for="f-status">Статус</label><select id="f-status" name="status">${options(STATUS, c.status)}</select></div>
          <div class="field"><label for="f-manager">Менеджер</label><select id="f-manager" name="managerId">${options(
            { '': 'Не назначен', ...Object.fromEntries(ctx.staff.map((m) => [m.id, managerName(m.email, m.fullName)])) }, c.managerId || '')}</select></div>
          ${kind === 'publisher' ? `
          <div class="field"><label for="f-ptype">Тип паблишера</label><select id="f-ptype" name="publisherType">${options({ '': 'Не указан', ...PUBLISHER_TYPE }, c.publisherType || '')}</select></div>
          <div class="field"><label for="f-terms">Оплата паблишеру</label><select id="f-terms" name="paymentTerms">${options({ '': 'Не указана', ...PAYMENT }, c.paymentTerms || '')}</select>
            <div class="hint">Препей — пополняем до закупки, постпей — платим по счёту после</div></div>` : ''}
        </div></div>
        <div class="block"><div class="block-title">Деньги, USD ${c.balance !== null && id ? `<span class="sub">баланс сверен: ${ago(c.balanceCheckedAt)}</span>` : ''}</div><div class="form">
          ${field('balance', kind === 'advertiser' ? 'Баланс клиента' : 'Наш баланс в сети', c.balance, 'type="number" step="0.01"')}
          ${field('monthlySpend', kind === 'advertiser' ? 'Оборот в месяц' : 'Закупка в месяц',
            c.manualMonthlySpend !== undefined ? c.manualMonthlySpend : c.monthlySpend, 'type="number" step="0.01" min="0"' + (c.binom ? ' placeholder="из Бинома"' : ''),
            c.binom ? `Пусто — берём из Бинома: ${money(kind === 'advertiser' ? c.binom.revenue : c.binom.cost)} за 30 дней` : '')}
          ${field('lowBalance', 'Тревога, если баланс ниже', c.lowBalance, 'type="number" step="0.01" min="0"', 'А также если денег меньше чем на 7 дней')}
          ${field('runway', 'Денег хватит на', runway(c.runwayDays), 'disabled')}
        </div></div>
        <div class="block"><div class="block-title">Контакты <button class="btn sm" data-add-contact>${ICONS.plus} Контакт</button></div>
          <div data-contacts>${(c.contacts.length ? c.contacts : id ? [] : [{}]).map(contactRow).join('')}</div>
          ${c.contacts.length || !id ? '' : '<div class="sub">Контактов нет</div>'}</div>
        <div class="block"><div class="block-title">Заметки</div><textarea name="notes" aria-label="Заметки" placeholder="Условия, договорённости, история">${esc(c.notes)}</textarea></div>
        ${id ? `<div class="block"><div class="block-title">Сделки <button class="btn sm" data-new-deal>${ICONS.plus} Сделка</button></div>
          ${c.deals.length ? c.deals.map((d) => `<div class="list-row click" data-deal="${d.id}"><b>${esc(d.title)}</b><span class="sub">${STAGES[d.stage]} · ${money(d.value)}/мес</span></div>`).join('') : '<div class="sub">Сделок нет</div>'}</div>` : ''}`,
      foot: `${id && c.balance !== null ? '<button class="btn left" data-checked>Баланс сверен, всё верно</button>' : ''}
        <button class="btn ghost" data-close>Отмена</button><button class="btn primary" data-save>Сохранить</button>`,
    }, (el, close) => {
      const contacts = el.querySelector('[data-contacts]');
      el.querySelector('[data-add-contact]').addEventListener('click', () => contacts.insertAdjacentHTML('beforeend', contactRow()));
      contacts.addEventListener('click', (e) => e.target.closest('[data-remove]')?.closest('[data-contact]').remove());
      const val = (n) => el.querySelector(`[name=${n}]`).value;
      const submit = async (checked) => {
        try {
          await Api.saveCompany({
            id, kind, name: val('name'), website: val('website'), status: val('status'), notes: val('notes'),
            balance: num(val('balance')), monthlySpend: num(val('monthlySpend')), lowBalance: num(val('lowBalance')),
            balanceChecked: checked,
            managerId: val('managerId') || null,
            publisherType: kind === 'publisher' ? val('publisherType') || null : null,
            paymentTerms: kind === 'publisher' ? val('paymentTerms') || null : null,
            contacts: [...contacts.querySelectorAll('[data-contact]')]
              .map((row) => Object.fromEntries([...row.querySelectorAll('[data-k]')].map((i) => [i.dataset.k, i.value.trim()])))
              .filter((x) => x.name),
          });
          UI.toast('Сохранено');
          close();
          ctx.refresh();
        } catch (error) {
          UI.toast(failure(error), true);
        }
      };
      el.querySelector('[data-save]').addEventListener('click', () => submit(false));
      el.querySelector('[data-checked]')?.addEventListener('click', () => submit(true));
      el.querySelector('[data-new-deal]')?.addEventListener('click', () => { close(); Funnel.dealForm(ctx, { companyId: id, stage: 'lead' }); });
      el.querySelectorAll('[data-deal]').forEach((d) => d.addEventListener('click', () => { close(); ctx.open('deal', d.dataset.deal); }));
    });
  }

  /* ── Сделки ─────────────────────────────────────────── */

  async function deals(root, ctx) {
    const list = await Api.deals();
    const tab = ctx.state.tab || 'open';
    const FILTERS = {
      open: (d) => OPEN.includes(d.stage),
      live: (d) => d.stage === 'live',
      lost: (d) => d.stage === 'lost',
      all: () => true,
    };
    const open = list.filter(FILTERS.open);
    const overdue = open.filter((d) => dealProblem(d));
    const launched = list.filter(FILTERS.live);
    root.innerHTML = `
      ${head('Все сделки', 'Список сделок с рекламодателями и сетями: этап, следующий шаг и готовность этапа',
        `<button class="btn primary" data-new>${ICONS.plus} Новая сделка</button>`)}
      <div class="kpis">
        ${kpi('Открытых сделок', `${open.length}`, 'в работе у менеджеров')}
        ${kpi('Потенциал открытых', perMonth(open.reduce((a, d) => a + (d.value || 0), 0)), 'если все дойдут до запуска')}
        ${kpi('Просрочено', `${overdue.length}`, overdue.length ? 'следующий шаг не сделан в срок' : 'все шаги в срок', overdue.length ? 'neg' : '')}
        ${kpi('Работают', `${launched.length}`, `${money(launched.reduce((a, d) => a + (d.value || 0), 0))} в месяц`)}
      </div>
      <div class="card">
        ${tabs([
          ['open', 'Открытые', open.length, overdue.length ? 'neg' : ''],
          ['live', 'Работают', launched.length],
          ['lost', 'Отказы', list.filter(FILTERS.lost).length],
          ['all', 'Все', list.length],
        ], tab)}
        <div class="card-head">${search(ctx.state.q, 'Поиск по сделке, компании, контакту')}<span class="sub">Сгруппировано по этапам</span></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Сделка</th><th>Контакт</th><th class="r">Потенциал в месяц</th><th>Следующий шаг</th><th>Срок</th><th>Условия этапа</th></tr></thead>
          <tbody data-list></tbody></table></div>
      </div>`;
    root.querySelector('[data-new]').addEventListener('click', () => Funnel.dealForm(ctx, { stage: 'lead' }));
    bindList(root, ctx, () => {
      const shown = list.filter(FILTERS[tab]).filter((d) =>
        match(ctx.state.q, d.title, d.companyName, ...d.contacts.map((p) => p.name)));
      if (!shown.length) return `<tr><td colspan="6" class="empty">${list.length ? 'Ничего не найдено' : 'Сделок пока нет'}</td></tr>`;
      return Object.keys(STAGES).map((stage) => {
        const own = shown.filter((d) => d.stage === stage);
        if (!own.length) return '';
        const sum = own.reduce((a, d) => a + (d.value || 0), 0);
        return `<tr class="group"><td colspan="6">${STAGES[stage]} · ${own.length} · ${money(sum)}/мес</td></tr>` +
          own.map((d) => {
            const late = dealProblem(d);
            const checklist = UI.stageChecklist(d);
            const done = checklist.filter((r) => r.done).length;
            const contact = d.contacts[0];
            return `<tr class="click ${late ? 'row-' + late.level : ''}" data-open="deal" data-id="${d.id}">
              <td class="name"><b>${esc(d.title)}</b><span>${esc(d.companyName)} · ${d.companyKind === 'advertiser' ? 'рекламодатель' : 'сеть'}</span></td>
              <td class="name">${contact ? `<b>${esc(contact.name)}</b><span>${esc(contact.telegram || contact.email)}</span>` : '<span>—</span>'}</td>
              <td class="r nowrap">${money(d.value)}</td>
              <td>${esc(d.nextStep) || '<span class="muted">не назначен</span>'}</td>
              <td class="nowrap">${late && late.level === 'neg' ? `<span class="neg-text">просрочено на ${days(daysBetween(d.nextStepOn, today()))}</span>` : late ? `<span class="warn-text">${late.label}</span>` : date(d.nextStepOn)}</td>
              <td class="nowrap">${OPEN.includes(d.stage) && checklist.length ? (done === checklist.length ? tag('Можно дальше', 'pos') : `${done} из ${checklist.length}`) : '<span class="muted">—</span>'}</td></tr>`;
          }).join('');
      }).join('');
    });
  }

  /* ── Расходы ────────────────────────────────────────── */

  async function costs(root, ctx) {
    const list = await Api.costs();
    const active = list.filter((c) => c.active);
    const total = active.reduce((a, c) => a + c.monthly, 0);
    const oneTime = active.filter((c) => c.period === 'one_time').reduce((a, c) => a + c.amount, 0);
    const byCat = (k) => active.filter((c) => c.category === k).reduce((a, c) => a + c.monthly, 0);
    const share = (v) => (total ? Math.round((v / total) * 100) + '%' : '—');
    const row = (c) => `<tr class="click ${c.active ? '' : 'archived'}" data-open="cost" data-id="${c.id}">
      <td class="name"><b>${esc(c.name)}</b>${c.notes ? `<span>${esc(c.notes)}</span>` : ''}</td>
      <td>${PERIODS[c.period]}</td><td class="r nowrap">${money(c.amount)}</td>
      <td class="r nowrap">${c.period === 'one_time' ? '<span class="muted">разово</span>' : money(c.monthly)}</td>
      <td class="r">${c.active && c.period !== 'one_time' ? share(c.monthly) : '—'}</td></tr>`;
    root.innerHTML = `
      ${head('Расходы компании', 'ФОТ, подписки и инфраструктура. Годовые платежи пересчитаны в месяц',
        `<button class="btn primary" data-new>${ICONS.plus} Добавить расход</button>`)}
      <div class="kpis">
        ${kpi('Всего в месяц', money(total), `≈ ${money(total * 12)} в год`)}
        ${Object.entries(CATEGORIES).filter(([k]) => byCat(k) || k !== 'other').map(([k, l]) => kpi(l, money(byCat(k)), `${share(byCat(k))} расходов`)).join('')}
        ${oneTime ? kpi('Разовые', money(oneTime), 'не входят в месячную сумму') : ''}
      </div>
      <div class="card"><div class="table-wrap"><table>
        <thead><tr><th>Статья</th><th>Периодичность</th><th class="r">Сумма платежа</th><th class="r">В месяц</th><th class="r">Доля</th></tr></thead>
        <tbody>${list.length ? Object.entries(CATEGORIES).map(([k, label]) => {
          const own = active.filter((c) => c.category === k);
          return own.length ? `<tr class="group"><td colspan="3">${label}</td><td class="r">${money(byCat(k))}</td><td class="r">${share(byCat(k))}</td></tr>` + own.map(row).join('') : '';
        }).join('') + (list.some((c) => !c.active) ? `<tr class="group"><td colspan="5">Отключённые</td></tr>${list.filter((c) => !c.active).map(row).join('')}` : '')
          + `<tr class="total"><td colspan="3">Итого в месяц</td><td class="r">${money(total)}</td><td class="r">100%</td></tr>`
          : '<tr><td colspan="5" class="empty">Расходов пока нет: добавьте ФОТ, подписки, инфраструктуру</td></tr>'}</tbody>
      </table></div></div>`;
    root.querySelector('[data-new]').addEventListener('click', () => costForm(ctx, {}));
    root.querySelectorAll('[data-open]').forEach((tr) =>
      tr.addEventListener('click', () => costForm(ctx, list.find((c) => c.id === tr.dataset.id))));
  }

  function costForm(ctx, cost) {
    const c = { category: 'subscription', period: 'monthly', active: true, ...cost };
    drawer({
      title: c.id ? c.name : 'Новый расход',
      sub: c.id ? `${CATEGORIES[c.category]} · ${money(c.monthly)} в месяц` : '',
      body: `<div class="form">
        <div class="field full"><label for="c-name">Статья</label><input id="c-name" name="name" value="${esc(c.name)}" placeholder="Например, DigitalOcean"></div>
        <div class="field"><label for="c-cat">Категория</label><select id="c-cat" name="category">${options(CATEGORIES, c.category)}</select></div>
        <div class="field"><label for="c-period">Периодичность</label><select id="c-period" name="period">${options(PERIODS, c.period)}</select></div>
        <div class="field"><label for="c-amount">Сумма платежа, USD</label><input id="c-amount" name="amount" type="number" min="0" step="0.01" value="${c.amount ?? ''}"></div>
        <div class="field"><label>Состояние</label><label class="nowrap"><input type="checkbox" name="active"${c.active ? ' checked' : ''}> Действует</label></div>
        <div class="field full"><label for="c-notes">Заметка</label><input id="c-notes" name="notes" value="${esc(c.notes)}"></div></div>`,
      foot: '<button class="btn ghost" data-close>Отмена</button><button class="btn primary" data-save>Сохранить</button>',
    }, (el, close) => {
      el.querySelector('[data-save]').addEventListener('click', async () => {
        const val = (n) => el.querySelector(`[name=${n}]`).value;
        try {
          await Api.saveCost({
            id: c.id, name: val('name'), category: val('category'), period: val('period'),
            amount: num(val('amount')), notes: val('notes'), active: el.querySelector('[name=active]').checked,
          });
          UI.toast('Сохранено');
          close();
          ctx.refresh();
        } catch (error) {
          UI.toast(failure(error), true);
        }
      });
    });
  }

  return {
    decisions, advertisers: companies('advertiser'), publishers: companies('publisher'), deals, costs,
    companyForm,
  };
})();
