// Карточка компании в базе: всё о клиенте или сети на одной странице —
// деньги, контакты, сделки с этапами, путь по воронке и заметки.
'use strict';

const Profile = (() => {
  const {
    esc, money, days, date, ago, tag, problems, health, dealProblem, onStage,
    ICONS, STATUS, STATUS_TAG, STAGES, OPEN, KIND,
  } = UI;

  async function page(root, ctx, kind, id) {
    const c = await Api.company(id);
    const list = kind === 'advertiser' ? 'advertisers' : 'publishers';
    const issues = c.status === 'active' ? problems(c) : [];
    const daily = c.monthlySpend ? c.monthlySpend / 30 : null;
    const timeline = c.deals
      .flatMap((d) => d.history.map((h) => ({ ...h, deal: d.title })))
      .sort((a, b) => b.enteredAt.localeCompare(a.enteredAt));
    const open = c.deals.filter((d) => OPEN.includes(d.stage));

    root.innerHTML = `
      <a class="back" href="#${list}">${ICONS.back} ${kind === 'advertiser' ? 'Все рекламодатели' : 'Все сети'}</a>
      <div class="page-head"><div>
          <h1>${esc(c.name)}</h1>
          <p class="profile-tags">${KIND[kind]} · ${tag(STATUS[c.status], STATUS_TAG[c.status])} ${health(c)}
            ${c.website ? ` · <a class="link" href="${esc(c.website)}" target="_blank" rel="noopener noreferrer">${esc(c.website.replace(/^https?:\/\//, ''))}</a>` : ''}</p></div>
        <div class="tools"><button class="btn" data-edit>Редактировать</button>
          <button class="btn primary" data-deal>${ICONS.plus} Новая сделка</button></div></div>

      ${issues.map((p) => `<div class="callout ${p.level}"><b>${p.label}: ${esc(p.action.toLowerCase())}</b>${esc(p.text)}</div>`).join('')}

      <div class="kpis">
        <div class="kpi"><div class="kpi-label">${kind === 'advertiser' ? 'Баланс клиента' : 'Наш баланс в сети'}</div>
          <div class="kpi-value ${issues.some((p) => p.level === 'neg') ? 'neg-text' : ''}">${money(c.balance)}</div>
          <div class="kpi-note">сверен: ${c.balance === null ? '—' : ago(c.balanceCheckedAt)}</div></div>
        <div class="kpi"><div class="kpi-label">${kind === 'advertiser' ? 'Оборот' : 'Закупка'}</div>
          <div class="kpi-value">${money(c.monthlySpend)}<small>/мес</small></div>
          <div class="kpi-note">${daily ? money(daily) + ' в день' : 'не указан'}</div></div>
        <div class="kpi"><div class="kpi-label">Денег хватит на</div>
          <div class="kpi-value">${c.runwayDays === null ? '—' : c.runwayDays <= 0 ? '&lt; 1 дня' : days(c.runwayDays)}</div>
          <div class="kpi-note">тревога ниже ${money(c.lowBalance)} или &lt; 7 дней</div></div>
        <div class="kpi"><div class="kpi-label">Сделки</div>
          <div class="kpi-value">${open.length}<small> открыто</small></div>
          <div class="kpi-note">потенциал ${money(open.reduce((a, d) => a + (d.value || 0), 0))}/мес</div></div>
      </div>

      <div class="grid-2">
        <div>
          <div class="card"><div class="card-head"><h2>Сделки</h2></div>
            ${c.deals.length ? `<table><thead><tr><th>Сделка</th><th>Этап</th><th class="r">В месяц</th><th>Следующий шаг</th></tr></thead><tbody>
              ${c.deals.map((d) => {
                const p = dealProblem(d);
                return `<tr class="click ${p ? 'row-' + p.level : ''}" data-open="${d.id}">
                  <td class="name"><b>${esc(d.title)}</b><span>${OPEN.includes(d.stage) ? days(onStage(d)) + ' на этапе' : d.stage === 'lost' ? esc(d.lostReason) : ''}</span></td>
                  <td>${tag(STAGES[d.stage], d.stage === 'live' ? 'pos' : d.stage === 'lost' ? 'neg' : 'info')}</td>
                  <td class="r nowrap">${money(d.value)}</td>
                  <td>${p ? `<span class="${p.level}-text">${esc(p.text)}</span>` : esc(d.nextStep) || '<span class="muted">—</span>'}</td></tr>`;
              }).join('')}</tbody></table>` : '<div class="empty">Сделок нет — создайте первую</div>'}
          </div>
          <div class="card"><div class="card-head"><h2>Контакты</h2></div>
            ${c.contacts.length ? `<table><thead><tr><th>Имя</th><th>Telegram</th><th>Email</th></tr></thead><tbody>
              ${c.contacts.map((p) => `<tr><td class="name"><b>${esc(p.name)}</b><span>${esc(p.role)}</span></td>
                <td>${esc(p.telegram) || '—'}</td><td>${esc(p.email) || '—'}</td></tr>`).join('')}</tbody></table>`
              : '<div class="empty">Контактов нет</div>'}
          </div>
        </div>
        <div>
          <div class="card"><div class="card-head"><h2>Заметки</h2></div>
            <div class="notes">${c.notes ? esc(c.notes) : '<span class="muted">Пока пусто: условия, договорённости, история общения</span>'}</div></div>
          <div class="card"><div class="card-head"><h2>Путь по воронке</h2></div>
            ${timeline.length ? `<ol class="timeline pad">${timeline.map((h) =>
              `<li><b>${STAGES[h.stage] || h.stage}</b><span class="sub">${esc(h.deal)} · ${date(h.enteredAt)}</span></li>`).join('')}</ol>`
              : '<div class="empty">Движений по воронке нет</div>'}
          </div>
        </div>
      </div>`;

    root.querySelector('[data-edit]').addEventListener('click', () => Screens.companyForm(ctx, kind, id));
    root.querySelector('[data-deal]').addEventListener('click', () => Funnel.dealForm(ctx, { companyId: id, stage: 'lead' }));
    root.querySelectorAll('[data-open]').forEach((tr) =>
      tr.addEventListener('click', () => Funnel.dealForm(ctx, c.deals.find((d) => d.id === tr.dataset.open))));
  }

  return { page };
})();
