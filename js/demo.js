// Демо-режим для GitHub Pages: тот же интерфейс, что у Api, но данные живут в localStorage
// браузера. Правила подсветки и сводки повторяют noad/crm.py. Включается только на
// *.github.io или на localhost с ?demo — на хосте админки работает настоящий API.
'use strict';

const Demo = (() => {
  const params = new URLSearchParams(location.search);
  const enabled =
    location.hostname.endsWith('github.io') ||
    (['localhost', '127.0.0.1'].includes(location.hostname) && params.has('demo'));
  if (!enabled) return null;

  const KEY = 'noad-crm-demo-v6';
  const OPEN = ['lead', 'qualification', 'negotiation', 'contract', 'setup', 'test'];
  const FLOW = [...OPEN, 'live'];
  const RUNWAY_DAYS = 7;
  const STALE_MS = 3 * 86400000;
  const role = params.get('role') === 'manager' ? 'manager' : 'admin';
  // Сотрудники демо: текущий пользователь и два менеджера.
  const person = (id, email, r, fullName, title, telegram) => ({ id, email, role: r, fullName, title, telegram, phone: '' });
  const STAFF = [
    role === 'admin'
      ? person('demo', 'il@noad.network', 'admin', 'Илья', 'Руководитель', '@il_noad')
      : person('demo', 'demo.manager@noad.network', 'manager', '', '', ''),
    person('m-anna', 'anna.sokolova@noad.network', 'manager', 'Анна Соколова', 'Аккаунт-менеджер', '@anna_noad'),
    person('m-ivan', 'ivan.petrov@noad.network', 'manager', 'Иван Петров', 'Менеджер по паблишерам', '@ivan_noad'),
  ];
  // Профили команды правятся в демо и живут вместе с остальными данными.
  const profileOf = (managerId) => ({ ...STAFF.find((m) => m.id === managerId), ...(db?.profiles?.[managerId] || {}) });
  const emailOf = (managerId) => STAFF.find((m) => m.id === managerId)?.email || null;
  const nameOf = (managerId) => (managerId ? profileOf(managerId).fullName || '' : '');

  const now = () => new Date().toISOString();
  const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const id = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));

  function seed() {
    const c = (kind, name, status, money = {}, contacts = [], extra = {}) => ({
      id: id(), kind, name, status, contacts, website: '', notes: '',
      balance: null, monthlySpend: null, lowBalance: null, balanceCheckedAt: null,
      ...money, ...extra, updatedAt: now(),
    });
    const acme = c('advertiser', 'Acme Media', 'active',
      { balance: 420, monthlySpend: 14000, lowBalance: 1000, balanceCheckedAt: daysAgo(0) },
      [{ name: 'Анна Петрова', role: 'Media buyer', email: 'anna@acme.io', telegram: '@anna_p', phone: '' }],
      { website: 'https://acme.io' });
    const beta = c('advertiser', 'BetaApps', 'active',
      { balance: 18500, monthlySpend: 22000, lowBalance: 2000, balanceCheckedAt: daysAgo(1) },
      [{ name: 'Олег', role: 'CEO', email: '', telegram: '@oleg_b', phone: '' }]);
    const game = c('advertiser', 'GameHub', 'active',
      { balance: 6400, monthlySpend: 7000, lowBalance: 500, balanceCheckedAt: daysAgo(5) });
    const vpn = c('advertiser', 'VPN Shield', 'prospect', {},
      [{ name: 'Mark', role: 'Affiliate manager', email: 'mark@vpnshield.example', telegram: '', phone: '' }]);
    const propeller = c('publisher', 'PropellerAds', 'active',
      { balance: 2300, monthlySpend: 20000, lowBalance: 3000, balanceCheckedAt: daysAgo(0) },
      [{ name: 'Account manager', role: '', email: '', telegram: '@propeller_am', phone: '' }]);
    const exo = c('publisher', 'ExoClick', 'active',
      { balance: 9800, monthlySpend: 10000, lowBalance: 2000, balanceCheckedAt: daysAgo(1) });
    const adsterra = c('publisher', 'Adsterra', 'prospect');
    const coin = c('advertiser', 'CoinPulse', 'prospect', {},
      [{ name: 'Дмитрий', role: 'Head of UA', email: '', telegram: '@dima_cp', phone: '' }]);
    const dating = c('advertiser', 'LoveMatch', 'prospect', {},
      [{ name: 'Sofia', role: 'Partnerships', email: 'sofia@lovematch.example', telegram: '', phone: '' }]);
    const shop = c('advertiser', 'ShopNow', 'prospect');
    const bet = c('advertiser', 'BetZone', 'prospect',
      {}, [{ name: 'Игорь', role: 'Affiliate manager', email: '', telegram: '@igor_bz', phone: '' }]);
    const ed = c('advertiser', 'EduPro', 'prospect');
    const buyers = c('publisher', 'Arbitrage Lab', 'prospect',
      {}, [{ name: 'Саша', role: 'Тимлид баеров', email: '', telegram: '@sasha_arb', phone: '' }]);
    const affs = c('publisher', 'AffBoost', 'prospect',
      {}, [{ name: 'Kate', role: 'Affiliate manager', email: 'kate@affboost.example', telegram: '', phone: '' }]);
    const team = { 'm-anna': [acme, beta, vpn, coin, propeller, buyers], 'm-ivan': [game, dating, bet, exo, affs], demo: [shop, adsterra] };
    for (const [managerId, list] of Object.entries(team)) for (const x of list) x.managerId = managerId;
    Object.assign(propeller, { publisherType: 'network', paymentTerms: 'prepay' });
    Object.assign(exo, { publisherType: 'network', paymentTerms: 'prepay' });
    Object.assign(adsterra, { publisherType: 'network', paymentTerms: 'postpay' });
    Object.assign(buyers, { publisherType: 'buyer', paymentTerms: 'postpay' });
    Object.assign(affs, { publisherType: 'affiliate', paymentTerms: 'postpay' });
    const r = (text, stage, done = false) => ({ text, done, stage });
    // Сделка, прошедшая этапы `path` с интервалом `every` дней и стоящая на последнем `stuck` дней.
    const d = (company, title, path, extra = {}, every = 4, stuck = 2) => {
      const total = (path.length - 1) * every + stuck;
      const history = path.map((stage, i) => ({ stage, enteredAt: daysAgo(total - i * every) }));
      return {
        id: id(), companyId: company.id, title, stage: path[path.length - 1], value: null, pricingModel: '',
        requirements: [], nextStep: '', nextStepOn: null, lostReason: '', blockers: [], ...extra,
        history, stageChangedAt: history[history.length - 1].enteredAt, updatedAt: now(),
      };
    };
    const stop = (type, text, side = 'us', ago = 3) => ({ id: id(), type, text, side, createdAt: daysAgo(ago), resolvedAt: null });
    const upTo = (stage) => FLOW.slice(0, FLOW.indexOf(stage) + 1);
    const cost = (category, name, amount, period = 'monthly') => ({
      id: id(), category, name, amount, period, active: true, notes: '', updatedAt: now(),
    });
    return {
      companies: [acme, beta, game, vpn, coin, dating, shop, bet, ed, propeller, exo, adsterra, buyers, affs],
      deals: [
        d(ed, 'EduPro — курсы, Tier-2', ['lead'], { value: 2000 }, 0, 1),
        d(shop, 'ShopNow — e-com, RU/KZ', ['lead'], { value: 4000, nextStep: 'Найти ЛПР', nextStepOn: day(2) }, 0, 3),
        d(coin, 'CoinPulse — крипто-приложение', upTo('qualification'), {
          value: 15000, pricingModel: 'CPA', nextStep: 'Проверить лицензию и гео', nextStepOn: day(1),
          requirements: [r('Вертикаль и гео нам подходят', 'qualification', true), r('Проверка компании пройдена', 'qualification')],
          blockers: [stop('ad_account', 'Нужен кабинет в PropellerAds с допуском крипто-вертикали', 'us', 4)],
        }),
        d(vpn, 'VPN Shield — push CPA', upTo('negotiation'), {
          value: 8000, pricingModel: 'CPA', nextStep: 'Согласовать payout', nextStepOn: day(-2),
          requirements: [r('Согласованы модель оплаты и ставка', 'negotiation'), r('Согласована наша наценка', 'negotiation')],
          blockers: [stop('pricing_model', 'Работают только по CPA, мы стартуем с CPM', 'us', 6)],
        }),
        d(dating, 'LoveMatch — дейтинг, Tier-1', upTo('negotiation'), {
          value: 6000, pricingModel: 'CPM',
          blockers: [stop('pricing_model', 'Хотят CPA с холдом 30 дней', 'us', 10)],
        }, 3, 18),
        d(bet, 'BetZone — беттинг, LATAM', upTo('contract'), {
          value: 10000, pricingModel: 'CPA', nextStep: 'Получить предоплату', nextStepOn: day(3),
          requirements: [r('Договор подписан', 'contract', true), r('Предоплата получена', 'contract')],
          blockers: [stop('payment', 'Ждём предоплату 5 000 $', 'client', 2)],
        }),
        d(acme, 'Acme — расширение на LATAM', upTo('setup'), {
          value: 5000, pricingModel: 'CPM', nextStep: 'Настроить постбек', nextStepOn: day(1),
          requirements: [r('Офферы и лендинги получены', 'setup', true), r('Постбек настроен и проверен', 'setup', true), r('Кампании созданы в сетях', 'setup', true)],
        }),
        d(game, 'GameHub — новый оффер', upTo('test'), {
          value: 3000, pricingModel: 'CPA', nextStep: 'Разобрать конверсии с клиентом', nextStepOn: day(0),
          requirements: [r('Тестовый бюджет открутился', 'test', true), r('Конверсии приходят', 'test')],
        }),
        d(beta, 'BetaApps — iOS', upTo('live'), { value: 12000, pricingModel: 'CPA' }, 5, 20),
        d(acme, 'Acme — Tier-1 push', upTo('live'), { value: 9000, pricingModel: 'CPM' }, 6, 40),
        d(shop, 'ShopNow — первый заход', ['lead', 'qualification', 'lost'], { value: 1500, lostReason: 'Маленький бюджет' }, 5, 30),
        d(adsterra, 'Adsterra — API аккаунт', ['lead', 'qualification', 'negotiation'], {
          nextStep: 'Согласовать постпей 30 дней', nextStepOn: day(3),
          blockers: [stop('ad_account', 'Нужен отдельный кабинет под push-формат', 'us', 5)],
        }),
        d(buyers, 'Arbitrage Lab — команда баеров', ['lead', 'qualification'], {
          value: 8000, nextStep: 'Проверить трафик на фрод', nextStepOn: day(2),
          requirements: [r('Форматы и гео нам подходят', 'qualification', true)],
        }),
        d(affs, 'AffBoost — аффилиаты Tier-1', ['lead'], { value: 5000, nextStep: 'Созвон по объёмам', nextStepOn: day(1) }),
        d(exo, 'ExoClick — подключение', upTo('live'), { value: 10000 }, 7, 60),
        d(propeller, 'PropellerAds — подключение', upTo('live'), { value: 20000 }, 7, 90),
      ],
      costs: [
        cost('payroll', 'Менеджер по работе с клиентами', 2500),
        cost('payroll', 'Разработчик', 4000),
        cost('subscription', 'Binom', 1188, 'yearly'),
        cost('subscription', 'Google Workspace', 36),
        cost('infrastructure', 'DigitalOcean', 180),
        cost('infrastructure', 'Zitadel Cloud', 100),
      ],
    };
  }

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY));
      if (saved && saved.companies) return saved;
    } catch (_) { /* пустое или недоступное хранилище — начинаем с демо-данных */ }
    return seed();
  }
  let db = load();
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (_) { /* только в памяти */ } };
  const copy = (v) => JSON.parse(JSON.stringify(v));

  function alerts(c) {
    if (c.status !== 'active') return [];
    if (c.balance === null) return ['unchecked'];
    const found = [];
    if (c.lowBalance !== null && c.balance < c.lowBalance) found.push('low_balance');
    if (c.monthlySpend && c.balance < (c.monthlySpend / 30) * RUNWAY_DAYS) found.push('runway');
    if (!c.balanceCheckedAt || Date.now() - new Date(c.balanceCheckedAt) > STALE_MS) found.push('unchecked');
    return found;
  }

  const monthly = (c) => (c.period === 'monthly' ? c.amount : c.period === 'yearly' ? Math.round((c.amount / 12) * 100) / 100 : 0);

  function companyView(c) {
    const daily = c.monthlySpend ? c.monthlySpend / 30 : null;
    return {
      ...copy(c),
      runwayDays: daily && c.balance !== null ? Math.floor(c.balance / daily) : null,
      alerts: alerts(c),
      openDeals: db.deals.filter((d) => d.companyId === c.id && OPEN.includes(d.stage)).length,
      managerId: c.managerId || null,
      managerEmail: emailOf(c.managerId),
      managerName: nameOf(c.managerId),
      publisherType: c.publisherType || null,
      paymentTerms: c.paymentTerms || null,
    };
  }

  function dealView(d) {
    const c = db.companies.find((x) => x.id === d.companyId);
    return {
      ...copy(d), companyName: c.name, companyKind: c.kind, contacts: copy(c.contacts),
      managerId: c.managerId || null, managerEmail: emailOf(c.managerId), managerName: nameOf(c.managerId),
      publisherType: c.publisherType || null, paymentTerms: c.paymentTerms || null,
    };
  }

  class DemoError extends Error {
    constructor(status, error, fields = {}) { super(error); this.status = status; this.fields = fields; }
  }
  const required = (value, field) => {
    if (!String(value ?? '').trim()) throw new DemoError(422, 'invalid', { [field]: 'обязательное поле' });
  };
  const adminOnly = () => { if (role !== 'admin') throw new DemoError(403, 'forbidden'); };

  function upsert(list, record) {
    const i = list.findIndex((x) => x.id === record.id);
    if (record.id && i < 0) throw new DemoError(404, 'not_found');
    const saved = { ...record, id: record.id || id(), updatedAt: now() };
    if (i < 0) list.push(saved); else list[i] = saved;
    persist();
    return saved;
  }

  const byName = (a, b) => (a.status === 'archived') - (b.status === 'archived') || a.name.localeCompare(b.name);

  const api = {
    demo: true,
    role,
    reset() { db = seed(); persist(); },
    async me() { return { id: 'demo', role }; },
    async staff() { return STAFF.map((m) => copy(profileOf(m.id))); },
    async saveProfile(staffId, profile) {
      if (!STAFF.some((m) => m.id === staffId)) throw new DemoError(404, 'not_found');
      if (role !== 'admin' && staffId !== 'demo') throw new DemoError(403, 'forbidden');
      db.profiles = { ...(db.profiles || {}), [staffId]: { ...profile } };
      persist();
      return copy(profileOf(staffId));
    },
    async companies(kind) {
      return db.companies.filter((c) => !kind || c.kind === kind).sort(byName).map(companyView);
    },
    async company(companyId) {
      const c = db.companies.find((x) => x.id === companyId);
      if (!c) throw new DemoError(404, 'not_found');
      return { ...companyView(c), deals: db.deals.filter((d) => d.companyId === c.id).map(dealView) };
    },
    async saveCompany(input) {
      required(input.name, 'name');
      const old = db.companies.find((x) => x.id === input.id);
      const { balanceChecked, ...data } = input;
      if (data.managerId && !STAFF.some((m) => m.id === data.managerId)) {
        throw new DemoError(422, 'invalid', { managerId: 'not an active staff member' });
      }
      if (data.kind !== 'publisher') Object.assign(data, { publisherType: null, paymentTerms: null });
      const checkedAt = data.balance === null ? null
        : !old || balanceChecked || old.balance !== data.balance ? now() : old.balanceCheckedAt;
      return companyView(upsert(db.companies, { ...data, balanceCheckedAt: checkedAt }));
    },
    async deals() {
      return db.deals.map(dealView).sort((a, b) =>
        (a.nextStepOn || '9999').localeCompare(b.nextStepOn || '9999') || b.updatedAt.localeCompare(a.updatedAt));
    },
    // Как на сервере: смена этапа пишет историю, «Работает» делает потенциального клиента рабочим.
    async saveDeal(input) {
      required(input.title, 'title');
      const company = db.companies.find((c) => c.id === input.companyId);
      if (!company) throw new DemoError(404, 'not_found');
      const old = db.deals.find((x) => x.id === input.id);
      const moved = !old || old.stage !== input.stage;
      const forward = old && FLOW.includes(old.stage) && FLOW.indexOf(input.stage) > FLOW.indexOf(old.stage);
      if (forward && (input.blockers || []).some((b) => !b.resolvedAt)) throw new DemoError(409, 'blocked');
      const { companyName, companyKind, contacts, ...data } = input;
      const history = [...(old?.history || [])];
      if (moved) history.push({ stage: data.stage, enteredAt: now() });
      const saved = upsert(db.deals, {
        ...data, blockers: (data.blockers || []).map((b) => ({ ...b, createdAt: b.createdAt || now() })),
        history, lostReason: data.stage === 'lost' ? data.lostReason || '' : '',
        stageChangedAt: moved ? now() : old.stageChangedAt,
      });
      if (moved && data.stage === 'live' && company.status === 'prospect') {
        company.status = 'active';
        persist();
      }
      return dealView(saved);
    },
    async costs() {
      adminOnly();
      return db.costs.map((c) => ({ ...copy(c), monthly: monthly(c) }));
    },
    async saveCost(input) {
      adminOnly();
      required(input.name, 'name');
      if (input.amount === null || input.amount < 0) throw new DemoError(422, 'invalid', { amount: 'не меньше 0' });
      const saved = upsert(db.costs, input);
      return { ...copy(saved), monthly: monthly(saved) };
    },
    async summary() {
      const companies = db.companies.map(companyView);
      const result = {};
      for (const kind of ['advertiser', 'publisher']) {
        const own = companies.filter((c) => c.kind === kind);
        const active = own.filter((c) => c.status === 'active');
        result[kind + 's'] = {
          total: own.filter((c) => c.status !== 'archived').length,
          active: active.length,
          balance: active.reduce((a, c) => a + (c.balance || 0), 0),
          monthlySpend: active.reduce((a, c) => a + (c.monthlySpend || 0), 0),
          atRisk: active.filter((c) => c.alerts.length).length,
        };
      }
      const stages = {};
      for (const d of db.deals) {
        const s = (stages[d.stage] ||= { count: 0, value: 0 });
        s.count += 1;
        s.value += d.value || 0;
      }
      const today = new Date().toISOString().slice(0, 10);
      result.pipeline = {
        stages,
        open: OPEN.reduce((a, s) => a + (stages[s]?.count || 0), 0),
        openValue: OPEN.reduce((a, s) => a + (stages[s]?.value || 0), 0),
        overdue: db.deals.filter((d) => OPEN.includes(d.stage) && d.nextStepOn && d.nextStepOn < today).length,
      };
      result.atRisk = companies.filter((c) => c.alerts.length)
        .map((c) => ({ id: c.id, kind: c.kind, name: c.name, alerts: c.alerts }));
      if (role === 'admin') {
        const byCategory = {};
        for (const c of db.costs.filter((x) => x.active)) byCategory[c.category] = (byCategory[c.category] || 0) + monthly(c);
        result.costs = { monthly: Object.values(byCategory).reduce((a, v) => a + v, 0), byCategory };
      }
      return result;
    },
  };
  return api;
})();
