const ADMIN_PASSWORD = 'avani2025';

// Use Netlify Blobs via the newer REST API approach
// This avoids the require('@netlify/blobs') bundling issues entirely
async function getBlob(siteId, token, key) {
  const url = `https://api.netlify.com/api/v1/blobs/${siteId}/custom-prices/${key}`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (r.status === 404) return {};
  if (!r.ok) throw new Error(`Blob GET failed: ${r.status}`);
  try { return await r.json(); } catch(e) { return {}; }
}

async function setBlob(siteId, token, key, data) {
  const url = `https://api.netlify.com/api/v1/blobs/${siteId}/custom-prices/${key}`;
  const r = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(`Blob PUT failed: ${r.status} ${await r.text()}`);
}

exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const siteId = process.env.SITE_ID || process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_API_TOKEN;

  if (!siteId || !token) {
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ error: 'Missing NETLIFY_SITE_ID or NETLIFY_API_TOKEN env vars' })
    };
  }

  // GET
  if (event.httpMethod === 'GET') {
    const villa = event.queryStringParameters && event.queryStringParameters.villa;
    if (!villa) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing villa' }) };
    try {
      const data = await getBlob(siteId, token, villa);
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    } catch(e) {
      return { statusCode: 200, headers, body: JSON.stringify({}) };
    }
  }

  // POST
  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body); } catch(e) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
    }
    const { villa, password, date, price } = body;
    if (password !== ADMIN_PASSWORD) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Incorrect password' }) };
    }
    if (!villa || !date) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing villa or date' }) };
    }
    try {
      let existing = {};
      try { existing = await getBlob(siteId, token, villa); } catch(e) {}
      if (price === null || price === '') {
        delete existing[date];
      } else {
        existing[date] = parseInt(price, 10);
      }
      await setBlob(siteId, token, villa, existing);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, prices: existing }) };
    } catch(e) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
    }
  }

  return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
};
