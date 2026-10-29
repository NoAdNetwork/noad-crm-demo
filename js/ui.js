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
  const STAGES = {
    new: 'Новая', contacted: 'Первый контакт', negotiation: 'Переговоры',
    onboarding: 'Подготовка к запуску', launched: 'Запущена', lost: 'Отказ',
  };
  const OPEN = ['new', 'contacted', 'negotiation', 'onboarding'];
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
    if (!OPEN.includes(d.stage) || !d.nextStepOn || d.nextStepOn >= today()) return null;
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
    deals: I('<path d="M3 4h18l-7 8v6l-4 2v-8z"/>'),
    costs: I('<path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>'),
    search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    plus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    check: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></svg>',
    close: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    mark: '<svg width="18" height="18" viewBox="0 0 32 32"><circle cx="16" cy="16" r="9" fill="none" stroke="#B6E84A" stroke-width="3"/><line x1="9.6" y1="22.4" x2="22.4" y2="9.6" stroke="#B6E84A" stroke-width="3" stroke-linecap="round"/></svg>',
  };

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
    problems, health, dealProblem, ICONS,
    STATUS, STATUS_TAG, STAGES, OPEN, CATEGORIES, PERIODS, KIND,
  };
})();
