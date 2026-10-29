// Команда: список сотрудников с их портфелем и страница сотрудника — его клиенты,
// паблишеры и сделки. Профиль (имя, должность, контакты) правит админ или сам сотрудник.
'use strict';

const Team = (() => {
  const {
    esc, money, days, tag, drawer, problems, health, dealProblem, onStage,
    ICONS, STATUS, STATUS_TAG, OPEN, KIND, stageLabels, PUBLISHER_TYPE, PAYMENT, managerName, initials, ROLE,
  } = UI;

  // Портфель сотрудника по компаниям и открытым сделкам.
  function portfolio(memberId, companies, deals) {
    const own = companies.filter((c) => c.managerId === memberId);
    const advertisers = own.filter((c) => c.kind === 'advertiser');
    const publishers = own.filter((c) => c.kind === 'publisher');
    const working = advertisers.filter((c) => c.status === 'active');
    const open = deals.filter((d) => d.managerId === memberId && OPEN.includes(d.stage));
    return {
      advertisers, publishers, working, open,
      turnover: working.reduce((a, c) => a + (c.monthlySpend || 0), 0),
      purchase: publishers.filter((c) => c.status === 'active').reduce((a, c) => a + (c.monthlySpend || 0), 0),
      potential: open.reduce((a, d) => a + (d.value || 0), 0),
      issues: own.filter((c) => c.status === 'active' && problems(c).length).length + open.filter((d) => dealProblem(d)).length,
    };
  }

  async function load() {
    const [staff, advertisers, publishers, deals] = await Promise.all([
      Api.staff(), Api.companies('advertiser'), Api.companies('publisher'), Api.deals(),
    ]);
    return { staff, companies: [...advertisers, ...publishers], deals };
  }

  /* ── Список ─────────────────────────────────────────── */

  async function list(root, ctx) {
    const { staff, companies, deals } = await load();
    const rows = staff.map((m) => ({ m, p: portfolio(m.id, companies, deals) }))
      .sort((a, b) => b.p.turnover - a.p.turnover || b.p.potential - a.p.potential);
    const unassigned = companies.filter((c) => !c.managerId && c.status !== 'archived');

    root.innerHTML = `
      <div class="page-head"><div><h1>Команда</h1><p>Менеджеры, за кем какие клиенты и сколько денег они ведут</p></div></div>
      <div class="kpis">
        <div class="kpi"><div class="kpi-label">В команде</div><div class="kpi-value">${staff.length}</div>
          <div class="kpi-note">${staff.filter((m) => m.role === 'manager').length} менеджеров · ${staff.filter((m) => m.role === 'admin').length} админов</div></div>
        <div class="kpi"><div class="kpi-label">Оборот клиентов за командой</div><div class="kpi-value">${money(rows.reduce((a, r) => a + r.p.turnover, 0))}<small>/мес</small></div>
          <div class="kpi-note">по рабочим рекламодателям</div></div>
        <div class="kpi"><div class="kpi-label">Открытые сделки</div><div class="kpi-value">${rows.reduce((a, r) => a + r.p.open.length, 0)}</div>
          <div class="kpi-note">потенциал ${money(rows.reduce((a, r) => a + r.p.potential, 0))}/мес</div></div>
        <div class="kpi ${unassigned.length ? 'neg' : ''}"><div class="kpi-label">Без менеджера</div><div class="kpi-value">${unassigned.length}</div>
          <div class="kpi-note">${unassigned.length ? 'компаний ни за кем не закреплено' : 'все компании закреплены'}</div></div>
      </div>
      <div class="card"><div class="table-wrap"><table>
        <thead><tr><th>Сотрудник</th><th>Роль</th><th>Контакты</th><th class="r">Рекламодатели</th><th class="r">Паблишеры</th>
          <th class="r">Оборот клиентов</th><th class="r">Открытые сделки</th><th class="r">Потенциал</th><th class="r">Требуют решения</th></tr></thead>
        <tbody>${rows.map(({ m, p }) => `<tr class="click" data-member="${m.id}">
          <td><div class="person"><span class="avatar">${esc(initials(m.email, m.fullName))}</span>
            <div class="name"><b>${esc(managerName(m.email, m.fullName))}${m.id === ctx.me.id ? ' <span class="sub">(вы)</span>' : ''}</b><span>${esc(m.title || 'должность не указана')}</span></div></div></td>
          <td>${tag(ROLE[m.role] || m.role, m.role === 'admin' ? 'info' : '')}</td>
          <td class="name"><b>${esc(m.telegram || '—')}</b><span>${esc(m.email)}</span></td>
          <td class="r">${p.working.length}<span class="muted"> / ${p.advertisers.length}</span></td>
          <td class="r">${p.publishers.length}</td>
          <td class="r nowrap">${money(p.turnover)}/мес</td>
          <td class="r">${p.open.length}</td>
          <td class="r nowrap">${money(p.potential)}/мес</td>
          <td class="r">${p.issues ? `<span class="neg-text">${p.issues}</span>` : '0'}</td></tr>`).join('')}</tbody></table></div></div>
      ${ctx.me.role === 'admin' ? `<div class="callout"><b>Как добавить сотрудника</b>
        Учётку создаёт оператор командой <code>python -m noad.staff_admin</code>: сотрудник входит через Google Workspace,
        роль (менеджер или админ) назначается там же. После первого входа он появится в этом списке — заполните имя и должность.</div>` : ''}`;
    root.querySelectorAll('[data-member]').forEach((tr) =>
      tr.addEventListener('click', () => { location.hash = `team/${tr.dataset.member}`; }));
  }

  /* ── Сотрудник ──────────────────────────────────────── */

  async function member(root, ctx, id) {
    const { staff, companies, deals } = await load();
    const m = staff.find((x) => x.id === id);
    if (!m) {
      root.innerHTML = '<a class="back" href="#team">← Команда</a><div class="callout neg"><b>Сотрудник не найден</b>Возможно, учётка отключена.</div>';
      return;
    }
    const p = portfolio(m.id, companies, deals);
    const canEdit = ctx.me.role === 'admin' || ctx.me.id === m.id;
    const companyRows = (list, publisher) => list.length ? `<table><thead><tr><th>Компания</th>${publisher ? '<th>Тип</th><th>Оплата</th>' : ''}<th>Статус</th><th>Состояние</th><th class="r">${publisher ? 'Закупка' : 'Оборот'}</th></tr></thead><tbody>
      ${list.map((c) => `<tr class="click" data-company="${c.id}" data-kind="${c.kind}">
        <td class="name"><b>${esc(c.name)}</b></td>
        ${publisher ? `<td>${c.publisherType ? esc(PUBLISHER_TYPE[c.publisherType]) : '—'}</td><td>${c.paymentTerms ? tag(PAYMENT[c.paymentTerms], c.paymentTerms === 'prepay' ? 'warn' : 'info') : '—'}</td>` : ''}
        <td>${tag(STATUS[c.status], STATUS_TAG[c.status])}</td><td>${health(c)}</td>
        <td class="r nowrap">${c.monthlySpend ? money(c.monthlySpend) + '/мес' : '—'}</td></tr>`).join('')}</tbody></table>`
      : '<div class="empty">Нет закреплённых компаний</div>';

    root.innerHTML = `
      <a class="back" href="#team">${ICONS.back} Команда</a>
      <div class="page-head"><div class="person big"><span class="avatar">${esc(initials(m.email, m.fullName))}</span><div>
          <h1>${esc(managerName(m.email, m.fullName))}</h1>
          <p class="profile-tags">${esc(m.title || 'Должность не указана')} · ${tag(ROLE[m.role] || m.role, m.role === 'admin' ? 'info' : '')}
            · ${esc(m.email)}${m.telegram ? ' · ' + esc(m.telegram) : ''}${m.phone ? ' · ' + esc(m.phone) : ''}</p></div></div>
        <div class="tools">${canEdit ? '<button class="btn" data-edit>Редактировать профиль</button>' : ''}</div></div>
      <div class="kpis">
        <div class="kpi"><div class="kpi-label">Рабочих клиентов</div><div class="kpi-value">${p.working.length}<small> из ${p.advertisers.length}</small></div><div class="kpi-note">рекламодателей за сотрудником</div></div>
        <div class="kpi"><div class="kpi-label">Оборот клиентов</div><div class="kpi-value">${money(p.turnover)}<small>/мес</small></div><div class="kpi-note">закупка у его паблишеров ${money(p.purchase)}/мес</div></div>
        <div class="kpi"><div class="kpi-label">Открытые сделки</div><div class="kpi-value">${p.open.length}</div><div class="kpi-note">потенциал ${money(p.potential)}/мес</div></div>
        <div class="kpi ${p.issues ? 'neg' : ''}"><div class="kpi-label">Требуют решения</div><div class="kpi-value">${p.issues}</div><div class="kpi-note">мало денег, стопперы, просрочки</div></div>
      </div>
      <div class="card"><div class="card-head"><h2>Открытые сделки</h2></div>
        ${p.open.length ? `<table><thead><tr><th>Сделка</th><th>Этап</th><th class="r">В месяц</th><th>Что не так / следующий шаг</th></tr></thead><tbody>
          ${p.open.map((d) => {
            const prob = dealProblem(d);
            return `<tr class="click ${prob ? 'row-' + prob.level : ''}" data-deal="${d.id}">
              <td class="name"><b>${esc(d.title)}</b><span>${esc(d.companyName)} · ${d.companyKind === 'publisher' ? 'паблишер' : 'рекламодатель'}</span></td>
              <td>${tag(stageLabels(d.companyKind)[d.stage], 'info')} <span class="sub">${days(onStage(d))}</span></td>
              <td class="r nowrap">${money(d.value)}</td>
              <td>${prob ? `<span class="${prob.level}-text">${esc(prob.text)}</span>` : esc(d.nextStep) || '<span class="muted">—</span>'}</td></tr>`;
          }).join('')}</tbody></table>` : '<div class="empty">Открытых сделок нет</div>'}</div>
      <div class="grid-2">
        <div class="card"><div class="card-head"><h2>Рекламодатели</h2></div>${companyRows(p.advertisers, false)}</div>
        <div class="card"><div class="card-head"><h2>Паблишеры</h2></div>${companyRows(p.publishers, true)}</div>
      </div>`;

    root.querySelector('[data-edit]')?.addEventListener('click', () => profileForm(ctx, m));
    root.querySelectorAll('[data-company]').forEach((tr) =>
      tr.addEventListener('click', () => { location.hash = `${tr.dataset.kind}s/${tr.dataset.company}`; }));
    root.querySelectorAll('[data-deal]').forEach((tr) =>
      tr.addEventListener('click', () => Funnel.dealForm(ctx, p.open.find((d) => d.id === tr.dataset.deal))));
  }

  function profileForm(ctx, m) {
    const field = (name, label, value, placeholder = '') =>
      `<div class="field"><label for="p-${name}">${label}</label><input id="p-${name}" name="${name}" value="${esc(value)}" placeholder="${placeholder}"></div>`;
    drawer({
      title: 'Профиль сотрудника',
      sub: esc(m.email),
      body: `<div class="form">
        ${field('fullName', 'Имя и фамилия', m.fullName, 'Анна Соколова')}
        ${field('title', 'Должность', m.title, 'Аккаунт-менеджер')}
        ${field('telegram', 'Telegram', m.telegram, '@username')}
        ${field('phone', 'Телефон', m.phone, '+7…')}</div>
        <p class="hint">Почта и роль приходят из учётки Google Workspace и здесь не меняются.</p>`,
      foot: '<button class="btn ghost" data-close>Отмена</button><button class="btn primary" data-save>Сохранить</button>',
    }, (el, close) => {
      el.querySelector('[data-save]').addEventListener('click', async () => {
        const val = (n) => el.querySelector(`[name=${n}]`).value.trim();
        try {
          await Api.saveProfile(m.id, { fullName: val('fullName'), title: val('title'), telegram: val('telegram'), phone: val('phone') });
          ctx.staff = await Api.staff();
          UI.toast('Профиль сохранён');
          close();
          ctx.refresh();
        } catch (error) {
          UI.toast(error.status === 403 ? 'Можно менять только свой профиль' : 'Не удалось сохранить', true);
        }
      });
    });
  }

  return { list, member };
})();
