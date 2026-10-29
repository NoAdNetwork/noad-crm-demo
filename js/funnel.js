// Воронка рекламодателей: канбан по этапам флоу, перетаскивание карточек между колонками
// и карточка сделки с условиями выхода с этапа, переходом дальше и отказом с причиной.
'use strict';

const Funnel = (() => {
  const {
    esc, money, days, date, num, options, drawer, tag, dealProblem, onStage, stageChecklist, activeBlockers,
    ICONS, STAGES, OPEN, FLOW, LOST_REASONS, STUCK_DAYS, KIND, STAGE_HINT, BLOCKERS, SIDE,
  } = UI;

  const next = (stage) => FLOW[FLOW.indexOf(stage) + 1];
  const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '—');
  const reached = (d, stage) => d.history.some((h) => h.stage === stage) || d.stage === stage;

  // Сохранение сделки на новом этапе: пункты этапа добавляются в чек-лист сразу при входе.
  async function move(ctx, deal, stage, lostReason = '') {
    const requirements = [...deal.requirements];
    for (const item of stageChecklist(deal, stage)) {
      if (!requirements.some((r) => r.stage === stage && r.text === item.text)) requirements.push(item);
    }
    await Api.saveDeal({ ...deal, stage, lostReason, requirements });
    UI.toast(stage === 'lost' ? 'Сделка закрыта отказом' : `Переведено: ${STAGES[stage]}`);
    ctx.refresh();
  }

  // Переход с незакрытыми условиями этапа требует подтверждения; в отказ — только с причиной.
  function requestMove(ctx, deal, stage) {
    if (stage === deal.stage) return;
    if (stage === 'lost') return lostForm(ctx, deal);
    const forward = FLOW.indexOf(stage) > FLOW.indexOf(deal.stage);
    const stop = activeBlockers(deal)[0];
    if (forward && FLOW.includes(deal.stage) && stop) {
      UI.toast(`Стоппер: ${BLOCKERS[stop.type]}. Сначала снимите его`, true);
      return ctx.refresh();
    }
    const open = stageChecklist(deal).filter((r) => !r.done);
    if (forward && deal.stage !== 'lost' && open.length &&
        !confirm(`На этапе «${STAGES[deal.stage]}» не выполнено:\n— ${open.map((r) => r.text).join('\n— ')}\n\nВсё равно перевести в «${STAGES[stage]}»?`)) {
      return ctx.refresh();
    }
    move(ctx, deal, stage).catch((e) => {
      UI.toast(e.status === 409 ? 'Сделка на стоппере: сначала снимите его' : 'Не удалось перевести', true);
      ctx.refresh();
    });
  }

  function lostForm(ctx, deal) {
    drawer({
      title: 'Закрыть отказом',
      sub: `${esc(deal.title)} · ${esc(deal.companyName)}`,
      body: `<div class="form">
        <div class="field full"><label for="l-reason">Причина отказа</label>
          <select id="l-reason" name="reason">${LOST_REASONS.map((r) => `<option>${esc(r)}</option>`).join('')}</select></div>
        <div class="field full"><label for="l-note">Комментарий</label><input id="l-note" name="note" placeholder="Что именно произошло"></div></div>`,
      foot: '<button class="btn ghost" data-close>Отмена</button><button class="btn primary" data-save>Закрыть отказом</button>',
    }, (el, close) => {
      el.querySelector('[data-close]').addEventListener('click', () => ctx.refresh());
      el.querySelector('[data-save]').addEventListener('click', async () => {
        const note = el.querySelector('[name=note]').value.trim();
        const reason = el.querySelector('[name=reason]').value + (note ? `: ${note}` : '');
        close();
        await move(ctx, deal, 'lost', reason).catch((e) => UI.toast(e.message, true));
      });
    });
  }

  /* ── Канбан ─────────────────────────────────────────── */

  async function board(root, ctx) {
    const all = (await Api.deals()).filter((d) => d.companyKind === 'advertiser');
    const showLost = ctx.state.lost;
    const columns = [...FLOW, ...(showLost ? ['lost'] : [])];
    const open = all.filter((d) => OPEN.includes(d.stage));
    const live = all.filter((d) => d.stage === 'live');
    const stuck = open.filter((d) => dealProblem(d));
    const blocked = open.filter((d) => activeBlockers(d).length);
    const cycle = live.map((d) => {
      const start = d.history[0]?.enteredAt;
      const end = [...d.history].reverse().find((h) => h.stage === 'live')?.enteredAt;
      return start && end ? (new Date(end) - new Date(start)) / 86400000 : null;
    }).filter((v) => v !== null);
    const avgCycle = cycle.length ? Math.round(cycle.reduce((a, v) => a + v, 0) / cycle.length) : null;
    const closed = all.filter((d) => d.stage === 'live' || d.stage === 'lost');

    root.innerHTML = `
      <div class="page-head"><div><h1>Воронка рекламодателей</h1>
        <p>Перетаскивайте карточки между этапами. Для каждого этапа заданы условия, без которых дальше не идём.</p></div>
        <div class="tools"><button class="btn" data-lost>${showLost ? 'Скрыть отказы' : 'Показать отказы'}</button>
          <button class="btn primary" data-new>${ICONS.plus} Новый лид</button></div></div>
      <div class="kpis">
        <div class="kpi"><div class="kpi-label">В воронке</div><div class="kpi-value">${open.length}</div><div class="kpi-note">потенциал ${money(open.reduce((a, d) => a + (d.value || 0), 0))}/мес</div></div>
        <div class="kpi"><div class="kpi-label">Конверсия в «Работает»</div><div class="kpi-value">${pct(live.length, closed.length)}</div><div class="kpi-note">${live.length} запущено из ${closed.length} закрытых</div></div>
        <div class="kpi"><div class="kpi-label">Срок от лида до запуска</div><div class="kpi-value">${avgCycle === null ? '—' : days(avgCycle)}</div><div class="kpi-note">в среднем по запущенным</div></div>
        <div class="kpi ${blocked.length ? 'neg' : ''}"><div class="kpi-label">Стоят на стоппере</div><div class="kpi-value">${blocked.length}</div><div class="kpi-note">${money(blocked.reduce((a, d) => a + (d.value || 0), 0))}/мес ждут решения</div></div>
        <div class="kpi"><div class="kpi-label">Требуют внимания</div><div class="kpi-value ${stuck.length - blocked.length > 0 ? 'neg-text' : ''}">${stuck.length - blocked.length}</div><div class="kpi-note">просрочен шаг или > ${STUCK_DAYS} дней на этапе</div></div>
      </div>
      <div class="board">${columns.map((stage) => {
        const own = all.filter((d) => d.stage === stage);
        const sum = own.reduce((a, d) => a + (d.value || 0), 0);
        const conv = stage !== 'lead' && stage !== 'lost'
          ? `<span class="col-conv" title="Дошли до этапа из всех сделок">дошли ${pct(all.filter((d) => reached(d, stage)).length, all.length)}</span>` : '';
        return `<section class="column ${stage}" data-stage="${stage}">
          <header class="column-head" title="${esc(STAGE_HINT[stage])}"><div><b>${STAGES[stage]} <span class="hint-mark">?</span></b><span class="count">${own.length}</span></div>
            <div class="column-sum">${money(sum)}/мес ${conv}</div></header>
          <div class="column-body">${own.map(card).join('') || '<div class="column-empty">Перетащите сюда</div>'}</div>
        </section>`;
      }).join('')}</div>`;

    root.querySelector('[data-new]').addEventListener('click', () => dealForm(ctx, { stage: 'lead' }, 'advertiser'));
    root.querySelector('[data-lost]').addEventListener('click', () => { ctx.state.lost = !showLost; ctx.refresh(); });
    root.querySelectorAll('.deal-card').forEach((el) => {
      const deal = all.find((d) => d.id === el.dataset.id);
      el.addEventListener('click', () => dealForm(ctx, deal));
      el.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', deal.id);
        e.dataTransfer.effectAllowed = 'move';
        requestAnimationFrame(() => el.classList.add('dragging'));
      });
      el.addEventListener('dragend', () => el.classList.remove('dragging'));
      el.querySelector('[data-next]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        requestMove(ctx, deal, next(deal.stage));
      });
    });
    root.querySelectorAll('.column').forEach((col) => {
      col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drop'); });
      col.addEventListener('dragleave', (e) => { if (!col.contains(e.relatedTarget)) col.classList.remove('drop'); });
      col.addEventListener('drop', (e) => {
        e.preventDefault();
        col.classList.remove('drop');
        const deal = all.find((d) => d.id === e.dataTransfer.getData('text/plain'));
        if (deal) requestMove(ctx, deal, col.dataset.stage);
      });
    });
  }

  function card(d) {
    const problem = dealProblem(d);
    const checklist = stageChecklist(d);
    const done = checklist.filter((r) => r.done).length;
    const stops = activeBlockers(d);
    const ready = checklist.length && done === checklist.length && !stops.length;
    const contact = d.contacts[0];
    const n = onStage(d);
    return `<article class="deal-card ${problem ? 'is-' + problem.level : ''}" draggable="true" data-id="${d.id}">
      <div class="deal-top"><b>${esc(d.companyName)}</b><span class="deal-value">${money(d.value)}</span></div>
      <div class="deal-title">${esc(d.title)}</div>
      ${contact ? `<div class="deal-meta">${esc(contact.name)}${contact.telegram ? ' · ' + esc(contact.telegram) : ''}</div>` : ''}
      ${d.stage === 'lost' ? `<div class="deal-meta">${esc(d.lostReason || 'Причина не указана')}</div>` : ''}
      ${OPEN.includes(d.stage) ? stops.map((b) => `<div class="stop">${ICONS.stop}<span><b>${esc(BLOCKERS[b.type])}</b>${b.text ? ' — ' + esc(b.text) : ''} · ${SIDE[b.side]}</span></div>`).join('') : ''}
      ${OPEN.includes(d.stage) && d.nextStep ? `<div class="deal-step ${problem?.label === 'Просрочено' ? 'neg-text' : ''}">${esc(d.nextStep)}${d.nextStepOn ? ' · ' + date(d.nextStepOn) : ''}</div>` : ''}
      <div class="deal-foot">
        <span class="${n > STUCK_DAYS && OPEN.includes(d.stage) ? 'warn-text' : 'muted'}">${n ? days(n) + ' на этапе' : 'сегодня'}</span>
        ${OPEN.includes(d.stage) ? (ready
          ? `<button class="btn sm ready" data-next title="Перевести в «${STAGES[next(d.stage)]}»">${STAGES[next(d.stage)]} ${ICONS.arrow}</button>`
          : stops.length ? '<span class="neg-text">стоп</span>' : `<span class="muted">${done} из ${checklist.length}</span>`) : ''}
      </div></article>`;
  }

  /* ── Карточка сделки ────────────────────────────────── */

  function checkRow(r) {
    return `<div class="check" data-req data-stage="${esc(r.stage || '')}"><input type="checkbox" data-k="done"${r.done ? ' checked' : ''} aria-label="Выполнено">
      <input data-k="text" value="${esc(r.text)}" placeholder="Условие" aria-label="Условие">
      <button class="icon-btn" data-remove title="Удалить" aria-label="Удалить">${ICONS.close}</button></div>`;
  }

  async function dealForm(ctx, deal, kind) {
    const companies = [...(await Api.companies('advertiser')), ...(await Api.companies('publisher'))]
      .filter((c) => (c.status !== 'archived' || c.id === deal.companyId) && (!kind || c.kind === kind));
    if (!companies.length) {
      UI.toast('Сначала добавьте компанию в базу', true);
      return;
    }
    const d = { stage: 'lead', requirements: [], history: [], contacts: [], blockers: [], ...deal };
    let blockers = (d.blockers || []).map((b) => ({ ...b }));
    const company = companies.find((c) => c.id === d.companyId);
    // Стоппер показан своим блоком — в плашке проблемы не повторяем.
    const problem = d.id && dealProblem(d)?.label !== 'Стоппер' ? dealProblem(d) : null;
    const isOpen = OPEN.includes(d.stage);
    const target = next(d.stage);
    const current = stageChecklist(d);
    const other = d.requirements.filter((r) => r.stage !== d.stage);
    const stepper = FLOW.map((s) => {
      const state = s === d.stage ? 'current' : d.stage !== 'lost' && FLOW.indexOf(s) < FLOW.indexOf(d.stage) ? 'done' : '';
      return `<li class="${state}">${STAGES[s]}</li>`;
    }).join('');
    drawer({
      title: d.id ? d.title : 'Новый лид',
      sub: d.id ? `${esc(d.companyName)} · ${tag(STAGES[d.stage], d.stage === 'lost' ? 'neg' : d.stage === 'live' ? 'pos' : 'info')}${isOpen ? ` · ${days(onStage(d))} на этапе` : ''}` : '',
      body: `
        ${d.id ? `<ol class="stepper">${stepper}</ol><p class="stage-hint">${esc(STAGE_HINT[d.stage])}</p>` : ''}
        ${d.stage !== 'live' ? `<div class="block"><div class="block-title">Стопперы <span class="sub">пока стоппер не снят, сделка дальше не идёт</span></div>
          <div data-blockers></div>
          <div class="stop-add">
            <select name="blockerType" aria-label="Тип стоппера">${options(BLOCKERS, 'ad_account')}</select>
            <select name="blockerSide" aria-label="За кем">${options({ us: 'Решение за нами', client: 'Ждём клиента' }, 'us')}</select>
            <input class="full" name="blockerText" placeholder="Подробнее: в какой сети нужен кабинет, какую модель хотят…" aria-label="Подробнее">
            <button class="btn" data-add-blocker>${ICONS.stop} Поставить стоппер</button>
          </div></div>` : ''}
        ${problem ? `<div class="callout ${problem.level}"><b>${esc(problem.text)}</b>${esc(problem.action)}</div>` : ''}
        ${d.stage === 'lost' ? `<div class="callout neg"><b>Отказ</b>${esc(d.lostReason || 'Причина не указана')}</div>` : ''}
        ${isOpen && d.id ? `<div class="block"><div class="block-title">Чтобы перейти в «${STAGES[target]}»
            <button class="btn sm" data-add>${ICONS.plus} Условие</button></div>
          <div data-reqs="current">${current.map(checkRow).join('')}</div></div>` : ''}
        <div class="block"><div class="block-title">Сделка</div><div class="form">
          <div class="field full"><label for="d-title">Название</label><input id="d-title" name="title" value="${esc(d.title)}" placeholder="Например, VPN — push CPA, Tier-1"></div>
          <div class="field full"><label for="d-company">Компания</label><select id="d-company" name="companyId">${companies
            .map((c) => `<option value="${c.id}"${c.id === d.companyId ? ' selected' : ''}>${esc(c.name)} — ${KIND[c.kind].toLowerCase()}</option>`).join('')}</select></div>
          <div class="field"><label for="d-value">Потенциал в месяц, USD</label><input id="d-value" name="value" type="number" min="0" step="0.01" value="${d.value ?? ''}"></div>
          <div class="field"><label for="d-model">Модель оплаты</label><input id="d-model" name="pricingModel" value="${esc(d.pricingModel)}" placeholder="CPA, CPM"></div>
          ${d.id ? '' : `<div class="field full"><label for="d-stage">Этап</label><select id="d-stage" name="stage">${options(Object.fromEntries(FLOW.map((s) => [s, STAGES[s]])), d.stage)}</select></div>`}
        </div></div>
        <div class="block"><div class="block-title">Следующий шаг</div><div class="form">
          <div class="field"><label for="d-step">Что сделать</label><input id="d-step" name="nextStep" value="${esc(d.nextStep)}" placeholder="Созвониться, отправить договор…"></div>
          <div class="field"><label for="d-on">Срок</label><input id="d-on" name="nextStepOn" type="date" value="${d.nextStepOn || ''}"></div>
        </div></div>
        ${company && company.contacts.length ? `<div class="block"><div class="block-title">Контакты</div>
          ${company.contacts.map((c) => `<div class="list-row"><b>${esc(c.name)} <span class="sub">${esc(c.role)}</span></b><span class="sub">${esc([c.telegram, c.email, c.phone].filter(Boolean).join(' · '))}</span></div>`).join('')}</div>` : ''}
        ${other.length ? `<div class="block"><div class="block-title">Условия других этапов</div>
          <div data-reqs="other">${other.map((r) => checkRow(r).replace('class="check"', `class="check" title="${esc(STAGES[r.stage] || 'Без этапа')}"`)).join('')}</div></div>` : ''}
        ${d.history.length ? `<div class="block"><div class="block-title">Путь по воронке</div>
          <ol class="timeline">${d.history.map((h, i) => {
            const until = d.history[i + 1]?.enteredAt;
            const spent = until ? Math.round((new Date(until) - new Date(h.enteredAt)) / 86400000) : null;
            return `<li><b>${STAGES[h.stage] || h.stage}</b><span class="sub">${date(h.enteredAt)}${spent !== null ? ` · ${days(spent)} на этапе` : ' · сейчас'}</span></li>`;
          }).join('')}</ol></div>` : ''}`,
      foot: `${d.id && d.stage !== 'lost' ? '<button class="btn left" data-lose>Отказ</button>' : ''}
        <button class="btn ghost" data-close>Отмена</button>
        <button class="btn ${isOpen && d.id ? '' : 'primary'}" data-save>Сохранить</button>
        ${isOpen && d.id ? `<button class="btn primary" data-move${activeBlockers(d).length ? ' disabled title="Сначала снимите стоппер"' : ''}>В «${STAGES[target]}» ${ICONS.arrow}</button>` : ''}
        ${d.stage === 'lost' ? '<button class="btn primary" data-revive>Вернуть в воронку</button>' : ''}`,
    }, (el, close) => {
      const reqs = el.querySelector('[data-reqs="current"]');
      const list = el.querySelector('[data-blockers]');
      const drawBlockers = () => {
        if (!list) return;
        const active = blockers.filter((b) => !b.resolvedAt);
        const resolved = blockers.filter((b) => b.resolvedAt);
        list.innerHTML = (active.length ? active.map((b) => `<div class="stop-row">
            <div>${ICONS.stop}<b>${esc(BLOCKERS[b.type])}</b>${b.text ? `<div class="sub">${esc(b.text)}</div>` : ''}
              <div class="sub">${SIDE[b.side]} · с ${date(b.createdAt || new Date().toISOString())}</div></div>
            <button class="btn sm" data-resolve="${esc(b.id)}">Снять</button></div>`).join('')
          : '<div class="sub">Стопперов нет</div>') +
          (resolved.length ? `<div class="stop-resolved">${resolved.map((b) => `<div class="sub">✓ ${esc(BLOCKERS[b.type])}${b.text ? ' — ' + esc(b.text) : ''} · снят ${date(b.resolvedAt)}</div>`).join('')}</div>` : '');
        const mv = el.querySelector('[data-move]');
        if (mv) mv.disabled = active.length > 0;
      };
      drawBlockers();
      list?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-resolve]');
        if (!btn) return;
        blockers = blockers.map((b) => (b.id === btn.dataset.resolve ? { ...b, resolvedAt: new Date().toISOString() } : b));
        drawBlockers();
      });
      el.querySelector('[data-add-blocker]')?.addEventListener('click', () => {
        blockers.push({
          id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
          type: el.querySelector('[name=blockerType]').value,
          text: el.querySelector('[name=blockerText]').value.trim(),
          side: el.querySelector('[name=blockerSide]').value,
          createdAt: new Date().toISOString(),
        });
        el.querySelector('[name=blockerText]').value = '';
        drawBlockers();
      });
      el.querySelector('[data-add]')?.addEventListener('click', () =>
        reqs.insertAdjacentHTML('beforeend', checkRow({ text: '', done: false, stage: d.stage })));
      el.addEventListener('click', (e) => e.target.closest('[data-remove]')?.closest('[data-req]').remove());
      const val = (n) => el.querySelector(`[name=${n}]`)?.value;
      const collect = () => ({
        ...d,
        title: val('title'), companyId: val('companyId'), stage: val('stage') || d.stage,
        value: num(val('value')), pricingModel: val('pricingModel'), nextStep: val('nextStep'),
        nextStepOn: val('nextStepOn') || null,
        blockers,
        requirements: [...el.querySelectorAll('[data-req]')]
          .map((row) => ({ text: row.querySelector('[data-k=text]').value.trim(), done: row.querySelector('[data-k=done]').checked, stage: row.dataset.stage }))
          .filter((r) => r.text),
      });
      const save = async (stage) => {
        try {
          const data = collect();
          if (!data.id) data.requirements = stageChecklist(data, data.stage);
          if (stage) {
            close();
            return requestMove(ctx, data, stage);
          }
          await Api.saveDeal(data);
          UI.toast('Сохранено');
          close();
          ctx.refresh();
        } catch (error) {
          UI.toast(Object.keys(error.fields || {}).length ? 'Проверьте название и компанию' : 'Не удалось сохранить', true);
        }
      };
      el.querySelector('[data-save]').addEventListener('click', () => save());
      el.querySelector('[data-move]')?.addEventListener('click', () => save(target));
      el.querySelector('[data-revive]')?.addEventListener('click', () => save([...d.history].reverse().find((h) => h.stage !== 'lost')?.stage || 'lead'));
      el.querySelector('[data-lose]')?.addEventListener('click', () => { close(); lostForm(ctx, collect()); });
    });
  }

  async function openDeal(ctx, id) {
    const deal = (await Api.deals()).find((d) => d.id === id);
    if (deal) dealForm(ctx, deal);
  }

  return { board, dealForm, openDeal };
})();
