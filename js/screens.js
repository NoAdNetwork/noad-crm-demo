// Экраны CRM: сводка, рекламодатели и паблишеры, воронка сделок, расходы.
// Каждый экран — async (root, ctx) → рисует себя в root; ctx.refresh() перерисовывает текущий.
'use strict';

const Screens = (() => {
  const { esc, money, date, ago, options, drawer, num, risk, STATUS, STAGES, ALERTS, CATEGORIES, PERIODS } = UI;
  const OPEN = ['new', 'contacted', 'negotiation', 'onboarding'];

  function fieldErrors(error) {
    const entries = Object.entries(error.fields || {});
    return entries.length ? entries.map(([k, v]) => `${k}: ${v}`).join('; ') : 'не удалось сохранить';
  }

  /* ── Сводка ─────────────────────────────────────────── */

  async function summary(root, ctx) {
    const s = await Api.summary();
    const adv = s.advertisers, pub = s.publishers, pipe = s.pipeline;
    const tile = (label, value, sub, alert) =>
      `<div class="tile${alert ? ' alert' : ''}"><div class="label">${label}</div><div class="v">${value}</div><div class="sub">${sub}</div></div>`;
    const costs = s.costs;
    const maxStage = Math.max(1, ...Object.values(pipe.stages).map((x) => x.count));
    root.innerHTML = `
      <div class="head"><h1>Сводка</h1></div>
      <div class="tiles">
        ${tile('Рекламодатели', adv.active, `рабочих из ${adv.total}`)}
        ${tile('Баланс рекламодателей', money(adv.balance), 'на рабочих аккаунтах')}
        ${tile('Оборот в месяц', money(adv.monthlySpend), 'расход рабочих рекламодателей')}
        ${tile('Паблишеры', pub.active, `рабочих из ${pub.total}, баланс ${money(pub.balance)}`)}
        ${tile('Открытые сделки', pipe.open, `потенциал ${money(pipe.openValue)} в месяц`)}
        ${tile('Просроченные шаги', pipe.overdue, 'следующий шаг в прошлом', pipe.overdue > 0)}
        ${tile('Требуют проверки', s.atRisk.length, 'мало денег или старый баланс', s.atRisk.length > 0)}
        ${costs ? tile('Расходы в месяц', money(costs.monthly), 'ФОТ, подписки, инфраструктура') : ''}
      </div>
      <div class="cols">
        <div class="panel">
          <h2>Требуют внимания</h2>
          ${s.atRisk.length ? s.atRisk.map((c) => `
            <div class="list-link" data-company="${c.id}" data-kind="${c.kind}">
              <span>${esc(c.name)} <span class="muted">· ${c.kind === 'advertiser' ? 'рекламодатель' : 'паблишер'}</span></span>
              <span class="${risk(c.alerts) === 'risk' ? 'neg' : 'warn'}">${c.alerts.map((a) => ALERTS[a]).join(', ')}</span>
            </div>`).join('') : '<div class="muted">Всё в порядке: у рабочих аккаунтов денег хватает.</div>'}
        </div>
        <div class="panel">
          <h2>Воронка</h2>
          ${Object.entries(STAGES).map(([k, label]) => {
            const st = pipe.stages[k] || { count: 0, value: 0 };
            return `<div class="bar"><span>${label}</span><div class="track"><div class="fill" data-w="${(st.count / maxStage) * 100}"></div></div><span class="num r">${st.count} · ${money(st.value)}</span></div>`;
          }).join('')}
        </div>
        ${costs ? `<div class="panel">
          <h2>Расходы по статьям</h2>
          ${Object.entries(CATEGORIES).map(([k, label]) => `<div class="bar"><span>${label}</span><div class="track"><div class="fill" data-w="${costs.monthly ? ((costs.byCategory[k] || 0) / costs.monthly) * 100 : 0}"></div></div><span class="num r">${money(costs.byCategory[k] || 0)}</span></div>`).join('')}
        </div>` : ''}
      </div>`;
    root.querySelectorAll('[data-company]').forEach((el) =>
      el.addEventListener('click', () => companyForm(ctx, el.dataset.kind, el.dataset.company)));
  }

  /* ── Рекламодатели / паблишеры ─────────────────────── */

  function companies(kind) {
    const title = kind === 'advertiser' ? 'Рекламодатели' : 'Паблишеры';
    return async (root, ctx) => {
      const list = await Api.companies(kind);
      const filter = ctx.state.filter || 'work';
      const shown = list.filter((c) =>
        filter === 'all' ? true : filter === 'work' ? c.status !== 'archived' : c.status === filter);
      const active = list.filter((c) => c.status === 'active');
      root.innerHTML = `
        <div class="head">
          <h1>${title}</h1>
          <div class="tools">
            <div class="seg">${[['work', 'Все текущие'], ['active', 'Рабочие'], ['prospect', 'Потенциальные'], ['all', 'С архивом']]
              .map(([k, l]) => `<button data-filter="${k}" class="${k === filter ? 'on' : ''}">${l}</button>`).join('')}</div>
            <button class="btn primary" data-new>Добавить</button>
          </div>
        </div>
        <div class="totals">
          <div><span class="label">Рабочих</span><b>${active.length}</b></div>
          <div><span class="label">Баланс</span><b>${money(active.reduce((a, c) => a + (c.balance || 0), 0))}</b></div>
          <div><span class="label">Расход в месяц</span><b>${money(active.reduce((a, c) => a + (c.monthlySpend || 0), 0))}</b></div>
          <div><span class="label">Мало денег</span><b class="${active.some((c) => risk(c.alerts) === 'risk') ? 'neg' : ''}">${active.filter((c) => risk(c.alerts) === 'risk').length}</b></div>
        </div>
        ${shown.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Компания</th><th>Статус</th><th class="r">Баланс</th><th class="r">Расход / мес</th>
            <th class="r">Хватит на</th><th class="r">Порог</th><th>Проверен</th><th>Контакт</th><th class="r">Сделки</th></tr></thead>
          <tbody>${shown.map((c) => {
            const contact = c.contacts[0];
            return `<tr data-id="${c.id}" class="${c.status === 'archived' ? 'off' : risk(c.alerts)}" title="${esc(c.alerts.map((a) => ALERTS[a]).join(', '))}">
              <td><b>${esc(c.name)}</b>${c.website ? `<div class="muted">${esc(c.website.replace(/^https?:\/\//, ''))}</div>` : ''}</td>
              <td><span class="chip ${c.status}">${STATUS[c.status]}</span></td>
              <td class="r num ${c.alerts.includes('low_balance') || c.alerts.includes('runway') ? 'neg' : ''}">${money(c.balance)}</td>
              <td class="r num">${money(c.monthlySpend)}</td>
              <td class="r num ${c.alerts.includes('runway') ? 'neg' : ''}">${c.runwayDays === null ? '—' : c.runwayDays + ' дн.'}</td>
              <td class="r num muted">${money(c.lowBalance)}</td>
              <td class="${c.alerts.includes('unchecked') ? 'warn' : 'muted'}">${ago(c.balanceCheckedAt)}</td>
              <td>${contact ? esc(contact.name) + (contact.telegram ? ` <span class="muted">${esc(contact.telegram)}</span>` : '') : '<span class="muted">—</span>'}</td>
              <td class="r num">${c.openDeals || '—'}</td></tr>`;
          }).join('')}</tbody></table></div>`
          : `<div class="table-wrap"><div class="empty">Пока пусто. Добавьте первую компанию.</div></div>`}`;
      root.querySelector('[data-new]').addEventListener('click', () => companyForm(ctx, kind));
      root.querySelectorAll('[data-filter]').forEach((b) =>
        b.addEventListener('click', () => { ctx.state.filter = b.dataset.filter; ctx.refresh(); }));
      root.querySelectorAll('tr[data-id]').forEach((tr) =>
        tr.addEventListener('click', () => companyForm(ctx, kind, tr.dataset.id)));
    };
  }

  function contactRow(c = {}) {
    return `<div class="row" data-contact>
      <input data-k="name" placeholder="Имя" value="${esc(c.name)}">
      <input data-k="role" placeholder="Роль" value="${esc(c.role)}">
      <input data-k="email" placeholder="Email" value="${esc(c.email)}">
      <input data-k="telegram" placeholder="Telegram" value="${esc(c.telegram)}">
      <button class="btn sm ghost" data-remove title="Убрать">✕</button></div>`;
  }

  async function companyForm(ctx, kind, id) {
    const c = id ? await Api.company(id) : { kind, status: 'prospect', contacts: [], deals: [], alerts: [] };
    const noun = kind === 'advertiser' ? 'рекламодатель' : 'паблишер';
    drawer(`
      <h2>${id ? esc(c.name) : 'Новый ' + noun}</h2>
      ${c.alerts.length ? `<div class="note ${risk(c.alerts) === 'risk' ? 'red' : ''}">Проверить: ${c.alerts.map((a) => ALERTS[a]).join(', ')}.</div>` : ''}
      <div class="grid section">
        <div class="field full"><label class="label">Название</label><input name="name" value="${esc(c.name)}" required></div>
        <div class="field"><label class="label">Сайт</label><input name="website" value="${esc(c.website)}" placeholder="https://"></div>
        <div class="field"><label class="label">Статус</label><select name="status">${options(STATUS, c.status)}</select></div>
      </div>
      <div class="section"><div class="section-head"><span class="label">Деньги, USD</span>
        ${id && c.balance !== null ? `<span class="muted">проверен ${ago(c.balanceCheckedAt)}</span>` : ''}</div>
        <div class="grid">
          <div class="field"><label class="label">Баланс</label><input name="balance" type="number" step="0.01" value="${c.balance ?? ''}"></div>
          <div class="field"><label class="label">Расход в месяц</label><input name="monthlySpend" type="number" step="0.01" min="0" value="${c.monthlySpend ?? ''}"></div>
          <div class="field"><label class="label">Красный ниже</label><input name="lowBalance" type="number" step="0.01" min="0" value="${c.lowBalance ?? ''}"></div>
          <div class="field"><label class="label">Хватит на</label><input disabled value="${c.runwayDays === null || c.runwayDays === undefined ? '—' : c.runwayDays + ' дн.'}"></div>
        </div>
      </div>
      <div class="section"><div class="section-head"><span class="label">Контакты</span><button class="btn sm" data-add-contact>+ Контакт</button></div>
        <div data-contacts>${c.contacts.map(contactRow).join('')}</div></div>
      <div class="section field"><label class="label">Заметки</label><textarea name="notes">${esc(c.notes)}</textarea></div>
      ${id ? `<div class="section"><div class="section-head"><span class="label">Сделки</span><button class="btn sm" data-new-deal>+ Сделка</button></div>
        ${c.deals.length ? c.deals.map((d) => `<div class="list-link" data-deal="${d.id}"><span>${esc(d.title)}</span><span class="muted">${STAGES[d.stage]} · ${money(d.value)}</span></div>`).join('') : '<div class="muted">Сделок нет</div>'}</div>` : ''}
      <div class="actions">
        ${id && c.balance !== null ? '<button class="btn" data-checked>Баланс проверен</button>' : ''}
        <button class="btn ghost" data-close>Отмена</button>
        <button class="btn primary" data-save>Сохранить</button>
      </div>`, (el, close) => {
      const contacts = el.querySelector('[data-contacts]');
      el.querySelector('[data-add-contact]').addEventListener('click', () => contacts.insertAdjacentHTML('beforeend', contactRow()));
      contacts.addEventListener('click', (e) => e.target.closest('[data-remove]')?.closest('[data-contact]').remove());
      const collect = (checked) => ({
        id,
        kind,
        name: el.querySelector('[name=name]').value,
        website: el.querySelector('[name=website]').value,
        status: el.querySelector('[name=status]').value,
        notes: el.querySelector('[name=notes]').value,
        balance: num(el.querySelector('[name=balance]').value),
        monthlySpend: num(el.querySelector('[name=monthlySpend]').value),
        lowBalance: num(el.querySelector('[name=lowBalance]').value),
        balanceChecked: checked,
        contacts: [...contacts.querySelectorAll('[data-contact]')]
          .map((row) => Object.fromEntries([...row.querySelectorAll('[data-k]')].map((i) => [i.dataset.k, i.value])))
          .filter((x) => x.name.trim()),
      });
      const submit = async (checked) => {
        try {
          await Api.saveCompany(collect(checked));
          UI.toast('Сохранено');
          close();
          ctx.refresh();
        } catch (error) {
          UI.toast(fieldErrors(error), true);
        }
      };
      el.querySelector('[data-save]').addEventListener('click', () => submit(false));
      el.querySelector('[data-checked]')?.addEventListener('click', () => submit(true));
      el.querySelector('[data-new-deal]')?.addEventListener('click', () => { close(); dealForm(ctx, { companyId: id }); });
      el.querySelectorAll('[data-deal]').forEach((d) => d.addEventListener('click', async () => {
        close();
        dealForm(ctx, (await Api.deals()).find((x) => x.id === d.dataset.deal));
      }));
    });
  }

  /* ── Воронка ────────────────────────────────────────── */

  async function funnel(root, ctx) {
    const deals = await Api.deals();
    const today = new Date().toISOString().slice(0, 10);
    const showClosed = ctx.state.closed;
    const stages = Object.keys(STAGES).filter((s) => showClosed || OPEN.includes(s) || s === 'launched');
    root.innerHTML = `
      <div class="head"><h1>Воронка сделок</h1>
        <div class="tools">
          <button class="btn" data-closed>${showClosed ? 'Скрыть отказы' : 'Показать отказы'}</button>
          <button class="btn primary" data-new>Новая сделка</button></div></div>
      <div class="board" data-columns="${stages.length}">
        ${stages.map((stage) => {
          const own = deals.filter((d) => d.stage === stage);
          return `<div class="column"><h3><span>${STAGES[stage]}</span><span class="muted num">${own.length}</span></h3>
            ${own.map((d) => {
              const done = d.requirements.filter((r) => r.done).length;
              const overdue = OPEN.includes(d.stage) && d.nextStepOn && d.nextStepOn < today;
              const contact = d.contacts[0];
              return `<div class="card${overdue ? ' overdue' : ''}" data-id="${d.id}">
                <div class="t">${esc(d.title)}</div>
                <div class="c">${esc(d.companyName)} · ${d.companyKind === 'advertiser' ? 'рекл.' : 'пабл.'}${contact ? ' · ' + esc(contact.name) : ''}</div>
                ${d.nextStep ? `<div class="c ${overdue ? 'neg' : ''}">→ ${esc(d.nextStep)}${d.nextStepOn ? ' · ' + date(d.nextStepOn) : ''}</div>` : ''}
                ${d.requirements.length ? `<div class="progress"><i data-w="${(done / d.requirements.length) * 100}"></i></div>` : ''}
                <div class="meta"><span>${d.requirements.length ? `к запуску ${done}/${d.requirements.length}` : ''}</span><span class="num">${money(d.value)}</span></div>
              </div>`;
            }).join('') || '<div class="muted">—</div>'}</div>`;
        }).join('')}
      </div>`;
    root.querySelector('[data-new]').addEventListener('click', () => dealForm(ctx, {}));
    root.querySelector('[data-closed]').addEventListener('click', () => { ctx.state.closed = !showClosed; ctx.refresh(); });
    root.querySelectorAll('.card').forEach((card) =>
      card.addEventListener('click', () => dealForm(ctx, deals.find((d) => d.id === card.dataset.id))));
  }

  function reqRow(r = {}) {
    return `<div class="req" data-req><input type="checkbox" data-k="done"${r.done ? ' checked' : ''}>
      <input data-k="text" placeholder="Что нужно для запуска" value="${esc(r.text)}">
      <button class="btn sm ghost" data-remove>✕</button></div>`;
  }

  // Типовой чек-лист запуска: подставляется в новую сделку, менеджер правит под клиента.
  const LAUNCH_CHECKLIST = [
    'Проверка компании и вертикали', 'Договор подписан', 'Предоплата / баланс пополнен',
    'Офферы и лендинги согласованы', 'Постбек настроен и проверен', 'Таргетинг и ставки согласованы',
  ];

  async function dealForm(ctx, deal) {
    const companies = [...(await Api.companies('advertiser')), ...(await Api.companies('publisher'))]
      .filter((c) => c.status !== 'archived' || c.id === deal.companyId);
    if (!companies.length) {
      UI.toast('Сначала добавьте рекламодателя или паблишера', true);
      return;
    }
    const d = { stage: 'new', requirements: deal.id ? [] : LAUNCH_CHECKLIST.map((text) => ({ text, done: false })), ...deal };
    const company = companies.find((c) => c.id === d.companyId);
    drawer(`
      <h2>${d.id ? esc(d.title) : 'Новая сделка'}</h2>
      <div class="grid">
        <div class="field full"><label class="label">Название</label><input name="title" value="${esc(d.title)}"></div>
        <div class="field"><label class="label">Компания</label><select name="companyId">${companies
          .map((c) => `<option value="${c.id}"${c.id === d.companyId ? ' selected' : ''}>${esc(c.name)} — ${c.kind === 'advertiser' ? 'рекламодатель' : 'паблишер'}</option>`).join('')}</select></div>
        <div class="field"><label class="label">Этап</label><select name="stage">${options(STAGES, d.stage)}</select></div>
        <div class="field"><label class="label">Потенциал в месяц, USD</label><input name="value" type="number" min="0" step="0.01" value="${d.value ?? ''}"></div>
        <div class="field"><label class="label">Модель оплаты</label><input name="pricingModel" value="${esc(d.pricingModel)}" placeholder="CPA, CPM…"></div>
        <div class="field"><label class="label">Следующий шаг</label><input name="nextStep" value="${esc(d.nextStep)}"></div>
        <div class="field"><label class="label">Когда</label><input name="nextStepOn" type="date" value="${d.nextStepOn || ''}"></div>
      </div>
      ${company && company.contacts.length ? `<div class="section"><span class="label">Контакты компании</span>
        ${company.contacts.map((c) => `<div class="list-link"><span>${esc(c.name)} <span class="muted">${esc(c.role)}</span></span><span class="muted">${esc([c.telegram, c.email, c.phone].filter(Boolean).join(' · '))}</span></div>`).join('')}</div>` : ''}
      <div class="section"><div class="section-head"><span class="label">Что требуется для запуска</span><button class="btn sm" data-add>+ Пункт</button></div>
        <div data-reqs>${d.requirements.map(reqRow).join('')}</div></div>
      <div class="actions"><button class="btn ghost" data-close>Отмена</button><button class="btn primary" data-save>Сохранить</button></div>`,
    (el, close) => {
      const reqs = el.querySelector('[data-reqs]');
      el.querySelector('[data-add]').addEventListener('click', () => reqs.insertAdjacentHTML('beforeend', reqRow()));
      reqs.addEventListener('click', (e) => e.target.closest('[data-remove]')?.closest('[data-req]').remove());
      el.querySelector('[data-save]').addEventListener('click', async () => {
        const val = (n) => el.querySelector(`[name=${n}]`).value;
        try {
          await Api.saveDeal({
            id: d.id,
            title: val('title'),
            companyId: val('companyId'),
            stage: val('stage'),
            value: num(val('value')),
            pricingModel: val('pricingModel'),
            nextStep: val('nextStep'),
            nextStepOn: val('nextStepOn') || null,
            requirements: [...reqs.querySelectorAll('[data-req]')]
              .map((row) => ({ text: row.querySelector('[data-k=text]').value, done: row.querySelector('[data-k=done]').checked }))
              .filter((r) => r.text.trim()),
          });
          UI.toast('Сохранено');
          close();
          ctx.refresh();
        } catch (error) {
          UI.toast(fieldErrors(error), true);
        }
      });
    });
  }

  /* ── Расходы ────────────────────────────────────────── */

  async function costs(root, ctx) {
    const list = await Api.costs();
    const active = list.filter((c) => c.active);
    const total = active.reduce((a, c) => a + c.monthly, 0);
    const byCat = (k) => active.filter((c) => c.category === k).reduce((a, c) => a + c.monthly, 0);
    const oneTime = active.filter((c) => c.period === 'one_time').reduce((a, c) => a + c.amount, 0);
    root.innerHTML = `
      <div class="head"><h1>Расходы</h1><button class="btn primary" data-new>Добавить</button></div>
      <div class="totals">
        <div><span class="label">Всего в месяц</span><b>${money(total)}</b></div>
        ${Object.entries(CATEGORIES).map(([k, l]) => `<div><span class="label">${l}</span><b>${money(byCat(k))}</b></div>`).join('')}
        ${oneTime ? `<div><span class="label">Разовые</span><b>${money(oneTime)}</b></div>` : ''}
      </div>
      ${list.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Статья</th><th>Категория</th><th class="r">Сумма</th><th>Период</th><th class="r">В месяц</th><th>Заметка</th></tr></thead>
        <tbody>${list.map((c) => `<tr data-id="${c.id}" class="${c.active ? '' : 'off'}">
          <td><b>${esc(c.name)}</b>${c.active ? '' : ' <span class="chip">отключена</span>'}</td>
          <td>${CATEGORIES[c.category]}</td><td class="r num">${money(c.amount)}</td><td>${PERIODS[c.period]}</td>
          <td class="r num">${c.period === 'one_time' ? '—' : money(c.monthly)}</td><td class="muted">${esc(c.notes)}</td></tr>`).join('')}</tbody>
      </table></div>` : '<div class="table-wrap"><div class="empty">Расходов пока нет: ФОТ, подписки, инфраструктура.</div></div>'}`;
    root.querySelector('[data-new]').addEventListener('click', () => costForm(ctx, {}));
    root.querySelectorAll('tr[data-id]').forEach((tr) =>
      tr.addEventListener('click', () => costForm(ctx, list.find((c) => c.id === tr.dataset.id))));
  }

  function costForm(ctx, cost) {
    const c = { category: 'subscription', period: 'monthly', active: true, ...cost };
    drawer(`
      <h2>${c.id ? esc(c.name) : 'Новый расход'}</h2>
      <div class="grid">
        <div class="field full"><label class="label">Статья</label><input name="name" value="${esc(c.name)}" placeholder="Например, DigitalOcean"></div>
        <div class="field"><label class="label">Категория</label><select name="category">${options(CATEGORIES, c.category)}</select></div>
        <div class="field"><label class="label">Период</label><select name="period">${options(PERIODS, c.period)}</select></div>
        <div class="field"><label class="label">Сумма, USD</label><input name="amount" type="number" min="0" step="0.01" value="${c.amount ?? ''}"></div>
        <div class="field"><label class="label">&nbsp;</label><label><input type="checkbox" name="active"${c.active ? ' checked' : ''}> Действует</label></div>
        <div class="field full"><label class="label">Заметка</label><input name="notes" value="${esc(c.notes)}"></div>
      </div>
      <div class="actions"><button class="btn ghost" data-close>Отмена</button><button class="btn primary" data-save>Сохранить</button></div>`,
    (el, close) => {
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
          UI.toast(fieldErrors(error), true);
        }
      });
    });
  }

  return { summary, advertisers: companies('advertiser'), publishers: companies('publisher'), funnel, costs };
})();
