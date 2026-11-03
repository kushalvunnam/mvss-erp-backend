const https = require('https');

function request(method, path, body = null) {
  return new Promise((resolve) => {
    const postData = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'mvss-erp-backend.onrender.com',
      port: 443,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {})
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch(e) {}
        resolve({ path, status: res.statusCode, json, raw: data });
      });
    });
    req.on('error', err => resolve({ path, error: err.message }));
    if (postData) req.write(postData);
    req.end();
  });
}

async function run() {
  const tests = [
    { method: 'GET', path: '/' },
    { method: 'GET', path: '/api' },
    { method: 'GET', path: '/api/branches' },
    { method: 'GET', path: '/api/jobcards' },
    { method: 'GET', path: '/api/vehicles' },
    { method: 'GET', path: '/api/customers' },
    { method: 'GET', path: '/api/inventory' },
    { method: 'POST', path: '/api/auth/login', body: { email: 'invalid@test.com', password: 'wrong' } }
  ];

  console.log('=== TESTING LIVE RENDER API ROUTES ===');
  for (const t of tests) {
    const res = await request(t.method, t.path, t.body);
    console.log(`${t.method} ${t.path} -> HTTP ${res.status}`);
    if (res.json) {
      console.log('Response:', JSON.stringify(res.json).slice(0, 150));
    } else {
      console.log('Raw:', res.raw ? res.raw.slice(0, 150) : res.error);
    }
  }
}

run();
