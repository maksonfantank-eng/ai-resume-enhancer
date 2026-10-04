// Cloudflare Worker: CORS-прокси для Atria AI API + бэкенд онлайн-эквайринга (ЮKassa).
// Деплой: Dashboard -> Workers & Pages -> Create Worker -> вставить этот файл -> Deploy.
// СЕКРЕТЫ (SHOP_ID, SECRET_KEY из кабинета ЮKassa) задаются ТОЛЬКО в
// Dashboard -> Workers -> Settings -> Variables and Secrets. В git их класть НЕЛЬЗЯ.

var CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400'
};

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

async function yookassa(path, env, body, idemKey) {
  var auth = btoa(env.SHOP_ID + ':' + env.SECRET_KEY);
  var headers = { 'Content-Type': 'application/json', 'Authorization': 'Basic ' + auth };
  if (idemKey) headers['Idempotence-Key'] = idemKey;
  var res = await fetch('https://api.yookassa.ru/v3' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  var data = {};
  try { data = await res.json(); } catch (e) { data = {}; }
  return { status: res.status, data: data };
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }
    var url = new URL(request.url);

    // --- ЮKassa: создать платёж, вернуть ссылку на страницу оплаты ---
    if (url.pathname === '/create-payment' && request.method === 'POST') {
      if (!env.SHOP_ID || !env.SECRET_KEY) return json({ error: 'acquiring_not_configured' }, 500);
      var payload = {};
      try { payload = await request.json(); } catch (e) { return json({ error: 'bad_request' }, 400); }
      var amount = Math.floor(Number(payload.amount) || 0);
      if (!amount || amount < 50 || amount > 500000) return json({ error: 'bad_amount' }, 400);
      var email = String(payload.email || '').slice(0, 128);
      var returnUrl = String(payload.returnUrl || '');
      if (!/^https:\/\//.test(returnUrl)) return json({ error: 'bad_return_url' }, 400);
      var value = amount.toFixed(2);
      var body = {
        amount: { value: value, currency: 'RUB' },
        capture: true,
        confirmation: { type: 'redirect', return_url: returnUrl },
        description: 'Пополнение баланса Naimis-bot' + (email ? ' (' + email + ')' : ''),
        metadata: { email: email, source: 'naimis-bot' }
      };
      // Чек для самозанятого (54-ФЗ). Без email чек не сформировать — такие
      // платежи отклоняем, т.к. на сайте оплата только для залогиненных (email есть всегда).
      if (!email || email.indexOf('@') === -1) return json({ error: 'email_required' }, 400);
      body.receipt = {
        customer: { email: email },
        items: [{
          description: 'Пополнение баланса Naimis-bot',
          quantity: '1.00',
          amount: { value: value, currency: 'RUB' },
          vat_code: 1,
          payment_subject: 'service',
          payment_mode: 'full_payment'
        }]
      };
      var created = await yookassa('/payments', env, body, crypto.randomUUID());
      if ((created.status !== 200 && created.status !== 201) || !created.data.confirmation) {
        return json({ error: 'provider_error' }, 502);
      }
      return json({
        payment_id: created.data.id,
        confirmation_url: created.data.confirmation.confirmation_url,
        amount: amount
      });
    }

    // --- ЮKassa: проверить статус платежа после возврата пользователя ---
    if (url.pathname === '/check-payment' && request.method === 'GET') {
      if (!env.SHOP_ID || !env.SECRET_KEY) return json({ error: 'acquiring_not_configured' }, 500);
      var pid = url.searchParams.get('payment_id') || '';
      if (!/^[0-9a-f-]{10,60}$/i.test(pid)) return json({ error: 'bad_id' }, 400);
      var checked = await yookassa('/payments/' + pid, env);
      if (checked.status !== 200) return json({ error: 'provider_error' }, 502);
      return json({
        status: checked.data.status,
        paid: checked.data.status === 'succeeded',
        amount: checked.data.amount ? checked.data.amount.value : '0'
      });
    }

    // --- ЮKassa: webhook уведомлений (URL прописать в кабинете ЮKassa) ---
    if (url.pathname === '/yookassa-webhook' && request.method === 'POST') {
      try { await request.json(); } catch (e) { /* только подтверждаем приём */ }
      return json({ ok: true });
    }

    // --- Старое поведение: CORS-прокси для Atria AI API ---
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }
    var targetUrl = 'https://api.atria-asi.ai' + url.pathname;
    var headers = new Headers();
    var auth = request.headers.get('Authorization');
    if (auth) headers.set('Authorization', auth);
    headers.set('Content-Type', 'application/json');
    var reqBody = await request.text();
    var response = await fetch(targetUrl, { method: 'POST', headers: headers, body: reqBody });
    var respHeaders = new Headers();
    respHeaders.set('Access-Control-Allow-Origin', '*');
    respHeaders.set('Content-Type', 'application/json');
    return new Response(await response.text(), { status: response.status, headers: respHeaders });
  }
};
