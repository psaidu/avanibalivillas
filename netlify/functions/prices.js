const { getStore } = require('@netlify/blobs');

const ADMIN_PASSWORD = 'avani2025';

exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const store = getStore('custom-prices');

  // GET — return all custom prices for a villa
  if (event.httpMethod === 'GET') {
    const villa = event.queryStringParameters && event.queryStringParameters.villa;
    if (!villa) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing villa' }) };
    try {
      const data = await store.get(`prices-${villa}`, { type: 'json' });
      return { statusCode: 200, headers, body: JSON.stringify(data || {}) };
    } catch(e) {
      return { statusCode: 200, headers, body: JSON.stringify({}) };
    }
  }

  // POST — save custom prices (admin only)
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
      // Get existing prices
      let existing = {};
      try { existing = await store.get(`prices-${villa}`, { type: 'json' }) || {}; } catch(e) {}

      if (price === null || price === '') {
        // Delete the custom price for this date
        delete existing[date];
      } else {
        existing[date] = parseInt(price, 10);
      }
      await store.setJSON(`prices-${villa}`, existing);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, prices: existing }) };
    } catch(e) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
    }
  }

  return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
};
