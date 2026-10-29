// Общие помощники: экранирование, деньги и даты, справочники, иконки, тосты, карточка записи
// и главное — перевод сигналов CRM в понятные проблемы «что не так → что сделать».
'use strict';

const UI = (() => {
  const esc = (v) =>
    String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const usd = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const money = (v) => (v === null || v === undefined ? '—' : usd.format(v));
  const plural = (n, one, few, many) => {
    const m10 = n % 10, m100 = n % 100;
    return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
  };
  const days = (n) => `${n} ${plural(n, 'день', 'дня', 'дней')}`;
  const date = (iso) => (iso ? new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : '—');
  const today = () => new Date().toISOString().slice(0, 10);
  const daysBetween = (fromIso, toIso) => Math.round((new Date(toIso) - new Date(fromIso)) / 86400000);
  const ago = (iso) => {
    if (!iso) return 'не сверяли';
    const n = Math.floor((Date.now() - new Date(iso)) / 86400000);
    return n <= 0 ? 'сегодня' : n === 1 ? 'вчера' : days(n) + ' назад';
  };
  const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

  const STATUS = { prospect: 'Потенциальный', active: 'Рабочий', paused: 'На паузе', archived: 'В архиве' };
  const STATUS_TAG = { prospect: 'info', active: 'pos', paused: 'warn', archived: '' };
  // Флоу рекламодателя: лид → … → работает; отказ возможен с любого этапа.
  const STAGES = {
    lead: 'Лид', qualification: 'Квалификация', negotiation: 'Переговоры', contract: 'Договор и оплата',
    setup: 'Настройка', test: 'Тест', live: 'Работает', lost: 'Отказ',
  };
  const OPEN = ['lead', 'qualification', 'negotiation', 'contract', 'setup', 'test'];
  const FLOW = [...OPEN, 'live'];
  // Что должно быть сделано, чтобы уйти с этапа дальше.
  const EXIT = {
    lead: ['Найден ЛПР и его контакт', 'Понятен продукт и вертикаль'],
    qualification: ['Вертикаль и гео нам подходят', 'Проверка компании пройдена', 'Бюджет не ниже минимального'],
    negotiation: ['Согласованы модель оплаты и ставка', 'Согласована наша наценка'],
    contract: ['Договор подписан', 'Предоплата получена'],
    setup: ['Офферы и лендинги получены', 'Постбек настроен и проверен', 'Кампании созданы в сетях'],
    test: ['Тестовый бюджет открутился', 'Конверсии приходят', 'Клиент подтвердил качество'],
  };
  // Что делаем на этапе — подсказка в канбане и в карточке сделки.
  const STAGE_HINT = {
    lead: 'Есть контакт и интерес. Находим ЛПР и понимаем, что за продукт.',
    qualification: 'Решаем, стоит ли работать: подходят ли вертикаль и гео, проходит ли компания проверку, хватает ли бюджета. Нет — сразу отказ.',
    negotiation: 'Договариваемся о модели оплаты, ставке и нашей наценке.',
    contract: 'Подписываем договор и получаем предоплату.',
    setup: 'Получаем офферы и лендинги, настраиваем постбек, создаём кампании в сетях.',
    test: 'Тестовый бюджет: проверяем, что конверсии приходят и клиент доволен качеством.',
    live: 'Клиент работает на постоянной основе.',
    lost: 'Сделка закрыта отказом.',
  };
  // Стоппер — явная причина, по которой сделка не может идти дальше.
  const BLOCKERS = {
    ad_account: 'Нужен рекламный кабинет в сети',
    pricing_model: 'Нужна другая модель оплаты (CPA и т.п.)',
    vertical: 'Вертикаль или гео не поддерживаем',
    budget: 'Бюджет ниже минимума',
    payment: 'Нет предоплаты или способа оплаты',
    legal: 'Юридическое: договор, KYC, юрлицо',
    tech: 'Техника: постбек, трекинг, интеграция',
    creative: 'Нет креативов или лендингов',
    other: 'Другое',
  };
  const SIDE = { us: 'за нами', client: 'за клиентом' };
  const activeBlockers = (d) => (d.blockers || []).filter((b) => !b.resolvedAt);
  const LOST_REASONS = [
    'Не подошла вертикаль или гео', 'Маленький бюджет', 'Не договорились по цене',
    'Ушёл к конкуренту', 'Пропал, не отвечает', 'Не прошёл проверку', 'Другое',
  ];
  // Дольше — сделка «зависла» на этапе.
  const STUCK_DAYS = 14;
  const onStage = (d) => (d.stageChangedAt ? Math.max(0, Math.floor((Date.now() - new Date(d.stageChangedAt)) / 86400000)) : 0);
  // Чек-лист этапа: пункты, привязанные к этапу, плюс шаблон EXIT для тех, что ещё не добавлены.
  // Паблишеры идут по тем же этапам, но смысл этапов другой: подключаем источник трафика.
  const PUB_STAGES = { qualification: 'Квалификация трафика', contract: 'Договор', setup: 'Интеграция', test: 'Тест трафика' };
  const PUB_HINT = {
    lead: 'Есть контакт сети, баера или аффилиата. Понимаем, какой у них трафик.',
    qualification: 'Проверяем трафик: форматы, гео, объёмы, качество, нет ли фрода. Не подходит — сразу отказ.',
    negotiation: 'Договариваемся о ставках, условиях оплаты (препей или постпей) и минимальном депозите.',
    contract: 'Подписываем договор или регистрируемся в кабинете сети.',
    setup: 'Интегрируемся: API или кабинет, постбек, наши кампании в их системе.',
    test: 'Тестовая закупка: смотрим качество трафика и конверсии у рекламодателей.',
    live: 'Закупаем трафик на постоянной основе.',
    lost: 'Подключение закрыто отказом.',
  };
  const PUB_EXIT = {
    lead: ['Понятно, какой трафик у источника', 'Есть контакт менеджера'],
    qualification: ['Форматы и гео нам подходят', 'Объёмы достаточные', 'Трафик проверен на фрод'],
    negotiation: ['Согласованы ставки', 'Согласованы условия оплаты (препей / постпей)'],
    contract: ['Договор подписан или аккаунт открыт', 'Пополнен депозит (если препей)'],
    setup: ['Доступ к API или кабинету', 'Постбек настроен и проверен'],
    test: ['Тестовая закупка проведена', 'Качество трафика подтверждено рекламодателями'],
  };
  const stageLabels = (kind) => (kind === 'publisher' ? { ...STAGES, ...PUB_STAGES } : STAGES);
  const stageHints = (kind) => (kind === 'publisher' ? PUB_HINT : STAGE_HINT);
  const PUBLISHER_TYPE = { network: 'Нетворк', buyer: 'Баер', affiliate: 'Аффилиат' };
  const PAYMENT = { prepay: 'Препей', postpay: 'Постпей' };
  // Имя сотрудника: из профиля команды, иначе из рабочего email (anna.petrova@… → Anna Petrova).
  const managerName = (email, fullName) => (fullName || (email ? email.split('@')[0].split(/[._-]/).filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1)).join(' ') : 'Не назначен'));
  const initials = (email, fullName) => (email || fullName ? managerName(email, fullName).split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase() : '—');
  const ROLE = { admin: 'Администратор', manager: 'Менеджер' };

  function stageChecklist(d, stage = d.stage) {
    const own = d.requirements.filter((r) => r.stage === stage);
    const missing = ((d.companyKind === 'publisher' ? PUB_EXIT : EXIT)[stage] || []).filter((t) => !own.some((r) => r.text === t)).map((text) => ({ text, done: false, stage }));
    return [...own, ...missing];
  }
  const CATEGORIES = { payroll: 'ФОТ', subscription: 'Подписки', infrastructure: 'Инфраструктура', other: 'Прочее' };
  const PERIODS = { monthly: 'Ежемесячно', yearly: 'Ежегодно', one_time: 'Разово' };
  const KIND = { advertiser: 'Рекламодатель', publisher: 'Сеть / паблишер' };

  // Проблемы рабочей компании простыми словами: уровень, что не так, что сделать.
  function problems(c) {
    const out = [];
    const daily = c.monthlySpend ? c.monthlySpend / 30 : 0;
    const refill = c.kind === 'advertiser' ? 'Запросить пополнение у клиента' : 'Пополнить наш баланс в сети';
    if (c.alerts.includes('low_balance') || c.alerts.includes('runway')) {
      const parts = [`Баланс ${money(c.balance)}`];
      if (daily) parts.push(`хватит на ${c.runwayDays <= 0 ? 'меньше дня' : '≈ ' + days(c.runwayDays)} при расходе ${money(daily)}/день`);
      if (c.alerts.includes('low_balance')) parts.push(`ниже порога ${money(c.lowBalance)}`);
      out.push({ level: 'neg', label: 'Мало денег', text: parts.join(', '), action: refill });
    }
    if (c.alerts.includes('unchecked')) {
      out.push({
        level: 'warn', label: 'Сверить баланс',
        text: c.balanceCheckedAt ? `Баланс не сверяли ${ago(c.balanceCheckedAt)}` : 'Баланс не внесён',
        action: c.kind === 'advertiser' ? 'Сверить баланс клиента' : 'Сверить баланс в кабинете сети',
      });
    }
    return out;
  }

  // Состояние компании одной меткой — для колонки «Состояние» в таблицах.
  function health(c) {
    if (c.status !== 'active') return '<span class="muted">—</span>';
    const p = problems(c)[0];
    return p ? `<span class="tag ${p.level}">${p.label}</span>` : '<span class="tag pos">В порядке</span>';
  }

  function dealProblem(d) {
    if (!OPEN.includes(d.stage)) return null;
    const stop = activeBlockers(d)[0];
    if (stop) {
      return {
        level: 'neg', label: 'Стоппер',
        text: `Стоппер: ${BLOCKERS[stop.type]}${stop.text ? ` — ${stop.text}` : ''} (${SIDE[stop.side]})`,
        action: stop.side === 'us' ? 'Решение за нами: снять стоппер или закрыть сделку' : 'Дожать клиента или закрыть отказом',
      };
    }
    if (!d.nextStepOn || d.nextStepOn >= today()) {
      const n = onStage(d);
      return n > STUCK_DAYS ? {
        level: 'warn', label: 'Зависла',
        text: `${days(n)} на этапе «${STAGES[d.stage]}» без движения`,
        action: 'Решить: двигать дальше или закрыть отказом',
      } : null;
    }
    const late = daysBetween(d.nextStepOn, today());
    const contact = d.contacts[0];
    return {
      level: 'neg', label: 'Просрочено',
      text: `${d.nextStep ? `«${d.nextStep}»` : 'Следующий шаг'} — просрочено на ${days(late)}`,
      action: contact ? `Связаться: ${contact.name}${contact.telegram ? ' ' + contact.telegram : ''}` : 'Назначить следующий шаг',
    };
  }

  const tag = (text, level = '') => `<span class="tag ${level}">${esc(text)}</span>`;

  const I = (d) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ICONS = {
    decisions: I('<path d="M3 12h4l3-8 4 16 3-8h4"/>'),
    advertisers: I('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'),
    publishers: I('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'),
    deals: I('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
    funnel: I('<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="11" rx="1"/><rect x="17" y="4" width="4" height="7" rx="1"/>'),
    back: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    stop: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg>',
    arrow: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    costs: I('<path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>'),
    search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    plus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    check: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></svg>',
    close: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    mark: '<svg width="18" height="18" viewBox="0 0 32 32"><circle cx="16" cy="16" r="9" fill="none" stroke="#B6E84A" stroke-width="3"/><line x1="9.6" y1="22.4" x2="22.4" y2="9.6" stroke="#B6E84A" stroke-width="3" stroke-linecap="round"/></svg>',
  };

  ICONS['publisher-funnel'] = ICONS.funnel;
  ICONS.team = I('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.5a5 5 0 0 1 5.5 5"/>');

  function toast(text, error = false) {
    const el = document.createElement('div');
    el.className = 'toast' + (error ? ' err' : '');
    el.textContent = text;
    document.getElementById('toasts').append(el);
    setTimeout(() => el.remove(), 3500);
  }

  function options(map, selected) {
    return Object.entries(map)
      .map(([k, v]) => `<option value="${k}"${k === selected ? ' selected' : ''}>${esc(v)}</option>`)
      .join('');
  }

  // Карточка записи справа: шапка, тело, закреплённые кнопки. Закрывается фоном или Esc.
  function drawer({ title, sub = '', body, foot }, bind) {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `<div class="drawer" role="dialog" aria-label="${esc(title)}">
      <div class="drawer-head"><h2>${esc(title)}</h2>${sub ? `<div class="sub">${sub}</div>` : ''}</div>
      <div class="drawer-body">${body}</div>
      <div class="drawer-foot">${foot}</div></div>`;
    const close = () => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
    };
    const onKey = (e) => e.key === 'Escape' && close();
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.closest('[data-close]')) close();
    });
    document.addEventListener('keydown', onKey);
    document.body.append(overlay);
    overlay.querySelector('input:not([disabled])')?.focus();
    bind(overlay.querySelector('.drawer'), close);
  }

  return {
    esc, money, days, date, ago, today, daysBetween, num, toast, options, drawer, tag,
    problems, health, dealProblem, ICONS, onStage, stageChecklist, activeBlockers,
    STAGE_HINT, BLOCKERS, SIDE, stageLabels, stageHints, PUBLISHER_TYPE, PAYMENT, managerName, initials, ROLE,
    STATUS, STATUS_TAG, STAGES, OPEN, FLOW, EXIT, LOST_REASONS, STUCK_DAYS, CATEGORIES, PERIODS, KIND,
  };
})();
