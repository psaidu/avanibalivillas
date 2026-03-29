const ADMIN_PASSWORD = 'avani2025';

async function getBookings(siteId, token, villa) {
  const url = `https://api.netlify.com/api/v1/blobs/${siteId}/bookings/${villa}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 404) return [];
  if (!r.ok) return [];
  try { return await r.json(); } catch(e) { return []; }
}

async function saveBookings(siteId, token, villa, bookings) {
  const url = `https://api.netlify.com/api/v1/blobs/${siteId}/bookings/${villa}`;
  const r = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(bookings),
  });
  if (!r.ok) throw new Error(`Blob PUT failed: ${r.status}`);
}

exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Method not allowed' };

  const siteId = process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_API_TOKEN;

  let body;
  try { body = JSON.parse(event.body); } catch(e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { villa, password, bookingId, clearAll } = body;

  if (password !== ADMIN_PASSWORD) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Incorrect password' }) };
  }

  if (!villa) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing villa' }) };
  }

  try {
    let bookings = await getBookings(siteId, token, villa);

    if (clearAll) {
      // Clear all bookings for this villa
      bookings = [];
    } else if (bookingId) {
      // Remove specific booking by ID
      bookings = bookings.filter(function(b) { return b.id !== bookingId; });
    } else {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing bookingId or clearAll' }) };
    }

    await saveBookings(siteId, token, villa, bookings);
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, remaining: bookings.length }) };
  } catch(e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
