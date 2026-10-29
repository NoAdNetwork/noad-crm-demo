// API CRM на хосте админки (/api/staff/crm, ADR-0035). Сессия — cookie __Host-session,
// изменения подтверждаются double-submit: значение __Host-csrf уходит в X-CSRF-Token.
'use strict';

const Api = (() => {
  const BASE = '/api/staff/crm';

  function csrf() {
    const pair = document.cookie.split('; ').find((c) => c.startsWith('__Host-csrf='));
    return pair ? decodeURIComponent(pair.slice('__Host-csrf='.length)) : '';
  }

  class ApiError extends Error {
    constructor(status, body) {
      super(body && body.error ? body.error : 'http_' + status);
      this.status = status;
      this.fields = (body && body.fields) || {};
    }
  }

  async function request(method, path, body) {
    const init = { method, credentials: 'same-origin', headers: { Accept: 'application/json' } };
    if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.headers['X-CSRF-Token'] = csrf();
      init.body = JSON.stringify(body);
    }
    const res = await fetch(BASE + path, init);
    const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
    if (!res.ok) throw new ApiError(res.status, data);
    return data;
  }

  // Новая запись — POST, существующая — PUT целиком: форма всегда отправляет все поля.
  const save = (path, record) =>
    record.id ? request('PUT', `${path}/${record.id}`, record) : request('POST', path, record);

  // На GitHub Pages вместо сервера — демо-данные в браузере (js/demo.js).
  if (typeof Demo !== 'undefined' && Demo) return Demo;

  return {
    ApiError,
    me: () => request('GET', '/me'),
    staff: () => request('GET', '/staff'),
    saveProfile: (id, profile) => request('PUT', '/staff/' + id, profile),
    summary: () => request('GET', '/summary'),
    companies: (kind) => request('GET', '/companies?kind=' + encodeURIComponent(kind)),
    company: (id) => request('GET', '/companies/' + id),
    saveCompany: (c) => save('/companies', c),
    deals: () => request('GET', '/deals'),
    saveDeal: (d) => save('/deals', d),
    costs: () => request('GET', '/costs'),
    saveCost: (c) => save('/costs', c),
  };
})();
