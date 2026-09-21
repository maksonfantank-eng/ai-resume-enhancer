// Cloudflare Worker - CORS Proxy for Atria AI API
// Deploy at: https://workers.cloudflare.com/
// After deployment, update PROXY_URL in app.js

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400'
        }
      });
    }
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }
    const url = new URL(request.url);
    const targetUrl = 'https://api.atria-asi.ai' + url.pathname;
    const headers = new Headers();
    const auth = request.headers.get('Authorization');
    if (auth) headers.set('Authorization', auth);
    headers.set('Content-Type', 'application/json');
    const body = await request.text();
    const response = await fetch(targetUrl, { method: 'POST', headers, body });
    const respHeaders = new Headers();
    respHeaders.set('Access-Control-Allow-Origin', '*');
    respHeaders.set('Content-Type', 'application/json');
    return new Response(await response.text(), { status: response.status, headers: respHeaders });
  }
};