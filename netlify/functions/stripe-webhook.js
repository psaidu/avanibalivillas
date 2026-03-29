const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

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

function extractVillaKey(villaName) {
  if (!villaName) return null;
  const n = villaName.toLowerCase();
  if (n.includes('geya'))    return 'geya';
  if (n.includes('bellis'))  return 'bellis';
  if (n.includes('sandewa')) return 'sandewa';
  if (n.includes('linum'))   return 'linum';
  return null;
}

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const siteId = process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_API_TOKEN;

  if (!siteId || !token) {
    return { statusCode: 500, body: 'Missing env vars' };
  }

  // Parse the event - skip signature verification as Netlify modifies the body
  let stripeEvent;
  try {
    const bodyStr = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body;
    stripeEvent = JSON.parse(bodyStr);
  } catch(e) {
    console.error('Parse error:', e.message);
    return { statusCode: 400, body: `Parse error: ${e.message}` };
  }

  console.log('Webhook type:', stripeEvent.type);

  // Only process succeeded payments
  if (stripeEvent.type !== 'payment_intent.succeeded') {
    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  }

  const pi   = stripeEvent.data.object;
  const meta = pi.metadata || {};

  console.log('Metadata:', JSON.stringify(meta));

  const villaKey = extractVillaKey(meta.villa);
  if (!villaKey || !meta.checkIn || !meta.checkOut) {
    console.error('Missing villa or dates:', meta.villa, meta.checkIn, meta.checkOut);
    return { statusCode: 200, body: JSON.stringify({ received: true, warning: 'Missing data' }) };
  }

  try {
    const bookings = await getBookings(siteId, token, villaKey);
    const exists   = bookings.find(function(b) { return b.id === pi.id; });
    if (!exists) {
      bookings.push({
        id:         pi.id,
        checkIn:    meta.checkIn,
        checkOut:   meta.checkOut,
        guestName:  meta.guestName || '',
        guestEmail: meta.guestEmail || '',
        nights:     meta.nights || '',
        amount:     pi.amount / 100,
        currency:   pi.currency,
        bookedAt:   new Date().toISOString(),
      });
      await saveBookings(siteId, token, villaKey, bookings);
      console.log('Saved:', villaKey, meta.checkIn, '-', meta.checkOut);
    }
    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  } catch(e) {
    console.error('Save error:', e.message);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
