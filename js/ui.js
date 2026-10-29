// Общие помощники разметки: экранирование, деньги, даты, тосты, выдвижная форма.
'use strict';

const UI = (() => {
  const esc = (v) =>
    String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const usd = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const money = (v) => (v === null || v === undefined ? '—' : usd.format(v));

  const date = (iso) => (iso ? new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : '—');

  const ago = (iso) => {
    if (!iso) return 'никогда';
    const days = Math.floor((Date.now() - new Date(iso)) / 86400000);
    return days <= 0 ? 'сегодня' : days === 1 ? 'вчера' : days + ' дн. назад';
  };

  const STATUS = { prospect: 'Потенциальный', active: 'Рабочий', paused: 'На паузе', archived: 'Архив' };
  const STAGES = {
    new: 'Новая', contacted: 'Контакт', negotiation: 'Переговоры',
    onboarding: 'Подготовка к запуску', launched: 'Запущена', lost: 'Отказ',
  };
  const ALERTS = {
    low_balance: 'баланс ниже порога',
    runway: 'денег меньше чем на 7 дней',
    unchecked: 'баланс давно не проверяли',
  };
  const CATEGORIES = { payroll: 'ФОТ', subscription: 'Подписки', infrastructure: 'Инфраструктура', other: 'Прочее' };
  const PERIODS = { monthly: 'в месяц', yearly: 'в год', one_time: 'разово' };

  // Красный — денег мало, янтарь — нужно перепроверить баланс.
  const risk = (alerts) =>
    alerts.some((a) => a !== 'unchecked') ? 'risk' : alerts.length ? 'check' : '';

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

  // Выдвижная панель справа; закрывается кликом по фону или Esc.
  function drawer(html, bind) {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `<div class="drawer">${html}</div>`;
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
    bind(overlay.querySelector('.drawer'), close);
  }

  const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

  return { esc, money, date, ago, toast, options, drawer, num, risk, STATUS, STAGES, ALERTS, CATEGORIES, PERIODS };
})();
