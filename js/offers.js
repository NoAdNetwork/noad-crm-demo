// Офферы × сети: рабочая таблица размещений, как в Google Sheets, но с деньгами из Бинома.
// Строки — офферы рекламодателей (один оффер CRM объединяет офферы Бинома по гео и т.п.),
// колонки — паблишеры, ячейка — статус размещения, заметка (капа) и деньги за период.
'use strict';

const Offers = (() => {
  const { esc, money, drawer, options, ICONS, managerName } = UI;

  const PLACEMENT = {
    live: 'Запущено', wait: 'Ждём', restart: 'Перезапустить', not_compliant: 'Не комплаент',
    skip: 'Не заводим', wait_geo: 'Ждём другие гео', no_cap: 'Нет капы', limit: 'Лимит / гео занято',
    not_converting: 'Не конвертит', other: 'Другое',
  };
  const SHORT = {
    live: 'v', wait: 'wait', restart: 'перезапуск', not_compliant: 'не комплаент', skip: 'не заводим',
    wait_geo: 'ждём гео', no_cap: 'no cap', limit: 'лимит', not_converting: 'не конвертит', other: '',
  };
  const PERIODS = { today: 'Сегодня', yesterday: 'Вчера', week: '7 дней', month: 'С начала месяца', d30: '30 дней' };

  function period(key) {
    const iso = (d) => d.toISOString().slice(0, 10);
    const now = new Date();
    const back = (n) => iso(new Date(now.getTime() - n * 86400000));
    return {
      today: [iso(now), iso(now)], yesterday: [back(1), back(1)], week: [back(6), iso(now)],
      month: [iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))), iso(now)],
      d30: [back(29), iso(now)],
    }[key];
  }

  // Та же логика, что у сервера (placement_status): для предпросмотра импорта.
  function parseCell(raw) {
    const value = raw.trim();
    const low = value.toLowerCase();
    if (!value) return null;
    if (/^v(\s|\d|$)/.test(low)) return ['live', value.slice(1).trim()];
    const rules = [
      [['комплаент', 'compliant'], 'not_compliant'], [['не заводим'], 'skip'], [['перезапуст', 'restart'], 'restart'],
      [['другие гео', 'other geo'], 'wait_geo'], [['no cap', 'нет кап'], 'no_cap'], [['лимит', 'limit', 'гео занято'], 'limit'],
      [['не конверт', 'not convert'], 'not_converting'], [['wait', 'ждем', 'ждём'], 'wait'],
    ];
    for (const [needles, status] of rules) if (needles.some((n) => low.includes(n))) return [status, value];
    return [low === 'no' ? 'skip' : 'other', value];
  }

  // TSV из Google Sheets: ячейки через Tab, многострочные ячейки — в кавычках.
  function parseTsv(text) {
    const rows = [[]];
    let cell = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
      } else if (ch === '"' && cell === '') quoted = true;
      else if (ch === '\t') { rows[rows.length - 1].push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        rows[rows.length - 1].push(cell); cell = ''; rows.push([]);
      } else cell += ch;
    }
    rows[rows.length - 1].push(cell);
    return rows.map((r) => r.map((c) => c.replace(/\s+/g, ' ').trim()));
  }

  // Матрица из таблицы: строка-шапка с сетями, строки-рекламодатели (одна ячейка) и офферы.
  function readSheet(text) {
    const rows = parseTsv(text).filter((r) => r.some(Boolean));
    const headerAt = rows.findIndex((r) => r.slice(1).filter(Boolean).length >= 2);
    if (headerAt < 0) return null;
    const networks = rows[headerAt].slice(1);
    while (networks.length && !networks[networks.length - 1]) networks.pop();
    const items = [];
    let advertiser = '';
    for (const r of rows.slice(headerAt + 1)) {
      const [first, ...cells] = r;
      if (!first) continue;
      if (!cells.slice(0, networks.length).some(Boolean) && !items.some((x) => x.advertiser === first)) {
        advertiser = first;
        continue;
      }
      if (advertiser) items.push({ advertiser, offer: first, cells: cells.slice(0, networks.length) });
    }
    return { networks, rows: items };
  }

  async function load(ctx) {
    const [start, end] = period(ctx.state.period || 'month');
    const [offers, advertisers, publishers, cash, binomOffers] = await Promise.all([
      Api.offers(), Api.companies('advertiser'), Api.companies('publisher'),
      Api.binomMoney(start, end).catch(() => null), Api.binomOffers().catch(() => []),
    ]);
    return { offers, advertisers, publishers, cash, binomOffers };
  }

  /* ── Матрица ────────────────────────────────────────── */

  async function matrix(root, ctx) {
    const st = ctx.state;
    const data = await load(ctx);
    const { offers, advertisers, publishers, cash, binomOffers } = data;
    const cells = new Map((cash?.cells || []).map((c) => [`${c.offerId}|${c.publisherId}`, c]));
    const used = new Set(offers.flatMap((o) => o.placements.map((p) => p.publisherId)));
    const columns = publishers.filter((p) => p.status === 'active' || used.has(p.id))
      .sort((a, b) => ((b.binom?.cost || 0) - (a.binom?.cost || 0)) || a.name.localeCompare(b.name));
    const byAdvertiser = new Map(advertisers.map((a) => [a.id, a]));
    const visible = offers.filter((o) => (st.archived || o.status !== 'archived')
      && (!st.manager || (st.manager === 'mine' ? byAdvertiser.get(o.companyId)?.managerId === ctx.me.id : byAdvertiser.get(o.companyId)?.managerId === st.manager)));
    const groups = [...new Set(visible.map((o) => o.companyId))].map((id) => byAdvertiser.get(id)).filter(Boolean)
      .sort((a, b) => ((b.binom?.revenue || 0) - (a.binom?.revenue || 0)) || a.name.localeCompare(b.name));
    const rowMoney = (o) => columns.reduce((acc, p) => {
      const c = cells.get(`${o.id}|${p.id}`);
      return c ? { revenue: acc.revenue + c.revenue, profit: acc.profit + c.profit } : acc;
    }, { revenue: 0, profit: 0 });
    const unlinked = Object.entries(cash?.unlinkedOffers || {}).filter(([, m]) => m.revenue > 0)
      .map(([id, m]) => ({ ...binomOffers.find((b) => String(b.binomId) === id), binomId: Number(id), ...m }))
      .sort((a, b) => b.revenue - a.revenue);
    const total = (cash?.days || []).reduce((a, d) => ({ revenue: a.revenue + d.revenue, cost: a.cost + d.cost, profit: a.profit + d.profit }), { revenue: 0, cost: 0, profit: 0 });
    const live = visible.reduce((n, o) => n + o.placements.filter((p) => p.status === 'live').length, 0);

    root.innerHTML = `
      <div class="page-head"><div><h1>Офферы и сети</h1>
        <p>Где какой оффер запущен, что ждём и сколько он приносит. Деньги — из Бинома${cash?.syncedAt ? `, обновлено ${new Date(cash.syncedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}.</p></div>
        <div class="tools">
          <select data-pick="period" aria-label="Период">${options(PERIODS, st.period || 'month')}</select>
          <select data-pick="manager" aria-label="Менеджер">${options({ '': 'Все менеджеры', mine: 'Мои', ...Object.fromEntries(ctx.staff.map((m) => [m.id, managerName(m.email, m.fullName)])) }, st.manager || '')}</select>
          <button class="btn" data-import>Импорт из таблицы</button>
          <button class="btn primary" data-new>${ICONS.plus} Оффер</button></div></div>
      <div class="kpis">
        <div class="kpi"><div class="kpi-label">Оборот за период</div><div class="kpi-value">${money(total.revenue)}</div><div class="kpi-note">платят рекламодатели</div></div>
        <div class="kpi"><div class="kpi-label">Закупка трафика</div><div class="kpi-value">${money(total.cost)}</div><div class="kpi-note">платим сетям</div></div>
        <div class="kpi"><div class="kpi-label">Валовая прибыль</div><div class="kpi-value ${total.profit < 0 ? 'neg-text' : ''}">${money(total.profit)}</div><div class="kpi-note">маржа ${total.revenue ? Math.round((total.profit / total.revenue) * 100) : 0}%</div></div>
        <div class="kpi"><div class="kpi-label">Размещения</div><div class="kpi-value">${live}</div><div class="kpi-note">запущено у ${visible.length} офферов</div></div>
        <div class="kpi ${unlinked.length ? 'neg' : ''}"><div class="kpi-label">Офферы Бинома без строки</div><div class="kpi-value">${unlinked.length}</div><div class="kpi-note">${money(unlinked.reduce((a, u) => a + u.revenue, 0))} не попадает в матрицу</div></div>
      </div>
      ${visible.length ? `<div class="card matrix-card"><div class="table-wrap"><table class="matrix">
        <thead><tr><th class="sticky">Рекламодатель / оффер</th><th class="r">Прибыль</th>${columns.map((p) =>
          `<th title="${esc(p.publisherType ? p.name : p.name)}">${esc(p.name)}</th>`).join('')}</tr></thead>
        <tbody>${groups.map((a) => `
          <tr class="group"><td class="sticky"><a class="link" href="#advertisers/${a.id}">${esc(a.name)}</a> <span class="sub">${esc(managerName(a.managerEmail, a.managerName))}</span></td>
            <td class="r">${a.binom ? money(a.binom.profit) + '<span class="sub"> / 30 дн.</span>' : ''}</td><td colspan="${columns.length}"></td></tr>
          ${visible.filter((o) => o.companyId === a.id).map((o) => {
            const m = rowMoney(o);
            return `<tr class="${o.status === 'archived' ? 'archived' : ''}">
              <td class="sticky offer-cell" data-offer="${o.id}"><b>${esc(o.name)}</b>${o.terms && o.terms !== o.name ? `<span>${esc(o.terms)}</span>` : ''}
                ${o.binomOfferIds.length ? `<span class="sub">Бином: ${o.binomOfferIds.length} офф.</span>` : '<span class="warn-text">не привязан к Биному</span>'}</td>
              <td class="r nowrap ${m.profit < 0 ? 'neg-text' : ''}">${m.revenue ? money(m.profit) : '—'}</td>
              ${columns.map((p) => {
                const pl = o.placements.find((x) => x.publisherId === p.id);
                const c = cells.get(`${o.id}|${p.id}`);
                return `<td class="pl ${pl ? 'pl-' + pl.status : ''}" data-cell="${o.id}|${p.id}" title="${esc(pl ? PLACEMENT[pl.status] + (pl.note ? ': ' + pl.note : '') : 'Нажмите, чтобы задать статус')}">
                  ${pl ? `<b>${esc(SHORT[pl.status] || pl.note)}</b>${pl.note && pl.status !== 'other' && SHORT[pl.status] !== pl.note.toLowerCase() ? `<span>${esc(pl.note)}</span>` : ''}` : ''}
                  ${c && (c.revenue || c.cost) ? `<em class="${c.profit < 0 ? 'neg-text' : ''}">${money(c.profit)}</em>` : ''}</td>`;
              }).join('')}</tr>`;
          }).join('')}`).join('')}</tbody></table></div></div>`
        : `<div class="card"><div class="empty">Офферов пока нет. Нажмите «Импорт из таблицы» и вставьте вашу Google-таблицу целиком — CRM разберёт рекламодателей, офферы, сети и статусы.</div></div>`}
      ${unlinked.length ? `<div class="card"><div class="card-head"><div><h2>Офферы Бинома без строки в матрице</h2><p>Трафик идёт, но оффер не привязан к офферу CRM — его деньги не видны в таблице</p></div></div>
        <table><thead><tr><th>Оффер в Биноме</th><th>Рекламодатель</th><th class="r">Оборот</th><th class="r">Прибыль</th><th></th></tr></thead><tbody>
        ${unlinked.slice(0, 50).map((u) => `<tr><td><b>${esc(u.name || '#' + u.binomId)}</b></td><td>${esc(u.network || '—')}</td>
          <td class="r nowrap">${money(u.revenue)}</td><td class="r nowrap">${money(u.profit)}</td>
          <td class="r"><button class="btn sm" data-link="${u.binomId}">Привязать</button></td></tr>`).join('')}</tbody></table></div>` : ''}`;

    root.querySelectorAll('[data-pick]').forEach((el) => el.addEventListener('change', () => { st[el.dataset.pick] = el.value; ctx.refresh(); }));
    root.querySelector('[data-new]').addEventListener('click', () => offerForm(ctx, data, {}));
    root.querySelector('[data-import]').addEventListener('click', () => importForm(ctx));
    root.querySelectorAll('[data-offer]').forEach((el) => el.addEventListener('click', () =>
      offerForm(ctx, data, offers.find((o) => o.id === el.dataset.offer))));
    root.querySelectorAll('[data-cell]').forEach((el) => el.addEventListener('click', () => {
      const [offerId, publisherId] = el.dataset.cell.split('|');
      cellForm(ctx, offers.find((o) => o.id === offerId), publishers.find((p) => p.id === publisherId), cells.get(el.dataset.cell));
    }));
    root.querySelectorAll('[data-link]').forEach((el) => el.addEventListener('click', () => {
      const b = binomOffers.find((x) => String(x.binomId) === el.dataset.link) || { binomId: Number(el.dataset.link) };
      linkForm(ctx, data, b);
    }));
  }

  function cellForm(ctx, offer, publisher, cash) {
    const pl = offer.placements.find((p) => p.publisherId === publisher.id);
    drawer({
      title: `${offer.name}`,
      sub: `в сети <b>${esc(publisher.name)}</b>${cash ? ` · за период: оборот ${money(cash.revenue)}, закупка ${money(cash.cost)}, прибыль ${money(cash.profit)}, лидов ${cash.leads}` : ''}`,
      body: `<div class="form">
        <div class="field full"><label for="c-status">Статус размещения</label>
          <select id="c-status" name="status">${options({ '': '— пусто —', ...PLACEMENT }, pl?.status || '')}</select></div>
        <div class="field full"><label for="c-note">Заметка</label>
          <input id="c-note" name="note" value="${esc(pl?.note || '')}" placeholder="25 daily · 100$ total · ждём след. недели"></div></div>`,
      foot: '<button class="btn ghost" data-close>Отмена</button><button class="btn primary" data-save>Сохранить</button>',
    }, (el, close) => {
      el.querySelector('[data-save]').addEventListener('click', async () => {
        const status = el.querySelector('[name=status]').value || null;
        try {
          await Api.savePlacement(offer.id, publisher.id, { status, note: el.querySelector('[name=note]').value.trim() });
          close();
          ctx.refresh();
        } catch (_) { UI.toast('Не удалось сохранить', true); }
      });
    });
  }

  // Похожесть названий для подсказки привязки: доля общих слов.
  const words = (s) => new Set(String(s).toLowerCase().split(/[^0-9a-zа-яё]+/i).filter((w) => w.length > 1));
  const similar = (a, b) => {
    const x = words(a), y = words(b);
    const common = [...x].filter((w) => y.has(w)).length;
    return x.size && y.size ? common / Math.min(x.size, y.size) : 0;
  };

  function offerForm(ctx, data, offer) {
    const o = { status: 'active', binomOfferIds: [], terms: '', ...offer };
    const advertisers = data.advertisers.filter((a) => a.status !== 'archived' || a.id === o.companyId);
    const binomFor = (companyId) => data.binomOffers.filter((b) => b.companyId === companyId && (!b.offerId || b.offerId === o.id));
    const list = (companyId) => {
      const candidates = binomFor(companyId).map((b) => ({ ...b, score: similar(o.name || '', b.name) }))
        .sort((a, b) => (o.binomOfferIds.includes(b.binomId) - o.binomOfferIds.includes(a.binomId)) || b.score - a.score || a.name.localeCompare(b.name));
      return candidates.length ? candidates.map((b) => `<label class="check-row"><input type="checkbox" value="${b.binomId}"${o.binomOfferIds.includes(b.binomId) ? ' checked' : ''}>
        <span>${esc(b.name)}</span>${b.score >= 0.5 && !o.binomOfferIds.includes(b.binomId) ? '<span class="tag info plain">похоже</span>' : ''}</label>`).join('')
        : '<div class="sub">У рекламодателя нет свободных офферов в Биноме</div>';
    };
    drawer({
      title: o.id ? o.name : 'Новый оффер',
      sub: o.id ? esc(o.companyName) : '',
      body: `<div class="form">
        <div class="field full"><label for="o-company">Рекламодатель</label><select id="o-company" name="companyId">${options(Object.fromEntries(advertisers.map((a) => [a.id, a.name])), o.companyId || advertisers[0]?.id)}</select></div>
        <div class="field full"><label for="o-name">Оффер</label><input id="o-name" name="name" value="${esc(o.name || '')}" placeholder="PING VPN 3$ CPI Android US"></div>
        <div class="field full"><label for="o-terms">Условия</label><input id="o-terms" name="terms" value="${esc(o.terms)}" placeholder="ставка, модель, гео, капа, преленд"></div>
        <div class="field"><label for="o-status">Статус</label><select id="o-status" name="status">${options({ active: 'Работает', paused: 'Пауза', archived: 'Архив' }, o.status)}</select></div></div>
        <div class="block"><div class="block-title">Офферы в Биноме <span class="sub">отметьте все, что относятся к этой строке (гео, преленды)</span></div>
          <div data-binom class="check-list">${list(o.companyId || advertisers[0]?.id)}</div></div>`,
      foot: '<button class="btn ghost" data-close>Отмена</button><button class="btn primary" data-save>Сохранить</button>',
    }, (el, close) => {
      el.querySelector('[name=companyId]').addEventListener('change', (e) => { el.querySelector('[data-binom]').innerHTML = list(e.target.value); });
      el.querySelector('[data-save]').addEventListener('click', async () => {
        const val = (n) => el.querySelector(`[name=${n}]`).value.trim();
        try {
          await Api.saveOffer({
            id: o.id, companyId: val('companyId'), name: val('name'), terms: val('terms'), status: val('status'),
            binomOfferIds: [...el.querySelectorAll('[data-binom] input:checked')].map((i) => Number(i.value)),
          });
          UI.toast('Сохранено');
          close();
          ctx.refresh();
        } catch (_) { UI.toast('Проверьте рекламодателя и название', true); }
      });
    });
  }

  // Привязать оффер Бинома к существующей строке или создать новую строку из него.
  function linkForm(ctx, data, binom) {
    const own = data.offers.filter((o) => o.companyId === binom.companyId && o.status !== 'archived');
    drawer({
      title: binom.name || `Оффер Бинома #${binom.binomId}`,
      sub: esc(binom.network || 'рекламодатель не определён'),
      body: `<div class="form"><div class="field full"><label for="l-offer">Строка в матрице</label>
        <select id="l-offer" name="offer">${options({ '': '+ Новая строка с этим названием', ...Object.fromEntries(own.map((o) => [o.id, o.name])) }, own.map((o) => [o.id, similar(o.name, binom.name)]).sort((a, b) => b[1] - a[1])[0]?.[1] >= 0.5 ? own.map((o) => [o.id, similar(o.name, binom.name)]).sort((a, b) => b[1] - a[1])[0][0] : '')}</select></div></div>`,
      foot: '<button class="btn ghost" data-close>Отмена</button><button class="btn primary" data-save>Привязать</button>',
    }, (el, close) => {
      el.querySelector('[data-save]').addEventListener('click', async () => {
        const target = own.find((o) => o.id === el.querySelector('[name=offer]').value);
        if (!binom.companyId && !target) return UI.toast('Сначала привяжите аффилиата Бинома к рекламодателю', true);
        try {
          await Api.saveOffer(target
            ? { ...target, binomOfferIds: [...target.binomOfferIds, binom.binomId] }
            : { companyId: binom.companyId, name: binom.name, terms: '', status: 'active', binomOfferIds: [binom.binomId] });
          close();
          ctx.refresh();
        } catch (_) { UI.toast('Не удалось привязать', true); }
      });
    });
  }

  function importForm(ctx) {
    drawer({
      title: 'Импорт из таблицы',
      sub: 'Выделите в Google Sheets всю таблицу вместе с шапкой сетей, скопируйте и вставьте сюда',
      body: `<textarea name="sheet" class="sheet-input" placeholder="Рекл+офер: Нетворк:\tPropellerAds\tHillTopAds\t…"></textarea>
        <div data-preview class="block"></div>`,
      foot: '<button class="btn ghost" data-close>Отмена</button><button class="btn primary" data-save disabled>Импортировать</button>',
    }, (el, close) => {
      let parsed = null;
      const preview = el.querySelector('[data-preview]');
      const button = el.querySelector('[data-save]');
      el.querySelector('[name=sheet]').addEventListener('input', (e) => {
        parsed = readSheet(e.target.value);
        button.disabled = !parsed || !parsed.rows.length;
        if (!parsed) { preview.innerHTML = '<div class="sub">Не нашёл строку с названиями сетей</div>'; return; }
        const advertisers = [...new Set(parsed.rows.map((r) => r.advertiser))];
        const placed = parsed.rows.reduce((n, r) => n + r.cells.filter((c) => parseCell(c)).length, 0);
        preview.innerHTML = `<div class="callout"><b>Распознано: ${advertisers.length} рекламодателей, ${parsed.rows.length} офферов, ${parsed.networks.filter(Boolean).length} сетей, ${placed} статусов</b>
          Сети: ${esc(parsed.networks.filter(Boolean).join(', '))}</div>
          <div class="table-wrap"><table class="matrix small"><thead><tr><th>Оффер</th>${parsed.networks.map((n) => `<th>${esc(n)}</th>`).join('')}</tr></thead><tbody>
          ${advertisers.map((a) => `<tr class="group"><td colspan="${parsed.networks.length + 1}">${esc(a)}</td></tr>` + parsed.rows.filter((r) => r.advertiser === a).map((r) =>
            `<tr><td>${esc(r.offer)}</td>${parsed.networks.map((_, i) => { const p = parseCell(r.cells[i] || ''); return `<td class="pl ${p ? 'pl-' + p[0] : ''}">${p ? `<b>${esc(SHORT[p[0]] || p[1])}</b>` : ''}</td>`; }).join('')}</tr>`).join('')).join('')}
          </tbody></table></div>`;
      });
      button.addEventListener('click', async () => {
        try {
          const r = await Api.importSheet(parsed);
          UI.toast(`Импортировано: офферов ${r.offers} новых, статусов ${r.placements}; новых рекламодателей ${r.advertisers}, сетей ${r.publishers}`);
          close();
          ctx.refresh();
        } catch (_) { UI.toast('Не удалось импортировать', true); }
      });
    });
  }

  return { matrix, period, parseCell, PLACEMENT };
})();
