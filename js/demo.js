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

  const KEY = 'noad-crm-demo-v1';
  const OPEN = ['new', 'contacted', 'negotiation', 'onboarding'];
  const RUNWAY_DAYS = 7;
  const STALE_MS = 3 * 86400000;
  const role = params.get('role') === 'manager' ? 'manager' : 'admin';

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
      { balance: 420, monthlySpend: 9000, lowBalance: 1000, balanceCheckedAt: daysAgo(0) },
      [{ name: 'Анна Петрова', role: 'Media buyer', email: 'anna@acme.io', telegram: '@anna_p', phone: '' }],
      { website: 'https://acme.io' });
    const beta = c('advertiser', 'BetaApps', 'active',
      { balance: 18500, monthlySpend: 12000, lowBalance: 2000, balanceCheckedAt: daysAgo(1) },
      [{ name: 'Олег', role: 'CEO', email: '', telegram: '@oleg_b', phone: '' }]);
    const game = c('advertiser', 'GameHub', 'active',
      { balance: 6400, monthlySpend: 4000, lowBalance: 500, balanceCheckedAt: daysAgo(5) });
    const vpn = c('advertiser', 'VPN Shield', 'prospect', {},
      [{ name: 'Mark', role: 'Affiliate manager', email: 'mark@vpnshield.example', telegram: '', phone: '' }]);
    const propeller = c('publisher', 'PropellerAds', 'active',
      { balance: 2300, monthlySpend: 15000, lowBalance: 3000, balanceCheckedAt: daysAgo(0) },
      [{ name: 'Account manager', role: '', email: '', telegram: '@propeller_am', phone: '' }]);
    const exo = c('publisher', 'ExoClick', 'active',
      { balance: 9800, monthlySpend: 6000, lowBalance: 2000, balanceCheckedAt: daysAgo(1) });
    const adsterra = c('publisher', 'Adsterra', 'prospect');
    const r = (text, done = false) => ({ text, done });
    const d = (company, title, stage, extra = {}) => ({
      id: id(), companyId: company.id, title, stage, value: null, pricingModel: '',
      requirements: [], nextStep: '', nextStepOn: null, ...extra, updatedAt: now(),
    });
    const cost = (category, name, amount, period = 'monthly') => ({
      id: id(), category, name, amount, period, active: true, notes: '', updatedAt: now(),
    });
    return {
      companies: [acme, beta, game, vpn, propeller, exo, adsterra],
      deals: [
        d(vpn, 'VPN — push CPA', 'negotiation', {
          value: 8000, pricingModel: 'CPA', nextStep: 'Согласовать payout', nextStepOn: day(-2),
          requirements: [r('Проверка компании и вертикали', true), r('Договор подписан'), r('Постбек настроен и проверен')],
        }),
        d(acme, 'Acme — расширение на LATAM', 'onboarding', {
          value: 5000, pricingModel: 'CPM', nextStep: 'Пополнить баланс', nextStepOn: day(1),
          requirements: [r('Договор подписан', true), r('Предоплата / баланс пополнен'), r('Таргетинг и ставки согласованы', true)],
        }),
        d(beta, 'BetaApps — iOS', 'launched', { value: 12000, pricingModel: 'CPA' }),
        d(adsterra, 'Adsterra — API аккаунт', 'contacted', { nextStep: 'Запросить API-ключ', nextStepOn: day(3) }),
        d(game, 'GameHub — новый оффер', 'new', { value: 3000 }),
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
    };
  }

  function dealView(d) {
    const c = db.companies.find((x) => x.id === d.companyId);
    return { ...copy(d), companyName: c.name, companyKind: c.kind, contacts: copy(c.contacts) };
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
      const checkedAt = data.balance === null ? null
        : !old || balanceChecked || old.balance !== data.balance ? now() : old.balanceCheckedAt;
      return companyView(upsert(db.companies, { ...data, balanceCheckedAt: checkedAt }));
    },
    async deals() {
      return db.deals.map(dealView).sort((a, b) =>
        (a.nextStepOn || '9999').localeCompare(b.nextStepOn || '9999') || b.updatedAt.localeCompare(a.updatedAt));
    },
    async saveDeal(input) {
      required(input.title, 'title');
      if (!db.companies.some((c) => c.id === input.companyId)) throw new DemoError(404, 'not_found');
      return dealView(upsert(db.deals, input));
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
