const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Store booking using Netlify Blobs REST API (same pattern as prices.js)
async function getBookings(siteId, token, villa) {
  const url = `https://api.netlify.com/api/v1/blobs/${siteId}/bookings/${villa}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 404) return [];
  if (!r.ok) throw new Error(`Blob GET failed: ${r.status}`);
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
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const siteId        = process.env.NETLIFY_SITE_ID;
  const token         = process.env.NETLIFY_API_TOKEN;

  if (!siteId || !token) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing env vars' }) };
  }

  let stripeEvent;
  try {
    if (webhookSecret) {
      const sig = event.headers['stripe-signature'];
      stripeEvent = stripe.webhooks.constructEvent(event.body, sig, webhookSecret);
    } else {
      stripeEvent = JSON.parse(event.body);
    }
  } catch(e) {
    return { statusCode: 400, body: `Webhook error: ${e.message}` };
  }

  if (stripeEvent.type === 'payment_intent.succeeded') {
    const pi       = stripeEvent.data.object;
    const meta     = pi.metadata;
    const villa    = meta.villa ? meta.villa.toLowerCase().replace(/\s+/g,'').replace('68','').replace('villa','') : null;

    // Map villa name to key
    const villaMap = {
      'geya': 'geya',
      'bellis': 'bellis',
      'sandewa': 'sandewa',
      'linum': 'linum',
    };

    // Try to match villa from metadata
    let villaKey = null;
    for (const [key, val] of Object.entries(villaMap)) {
      if (meta.villa && meta.villa.toLowerCase().includes(key)) {
        villaKey = key;
        break;
      }
    }

    if (villaKey && meta.checkIn && meta.checkOut) {
      try {
        const bookings = await getBookings(siteId, token, villaKey);
        bookings.push({
          id:          pi.id,
          checkIn:     meta.checkIn,
          checkOut:    meta.checkOut,
          guestName:   meta.guestName || '',
          guestEmail:  meta.guestEmail || '',
          nights:      meta.nights || '',
          amount:      pi.amount / 100,
          currency:    pi.currency,
          bookedAt:    new Date().toISOString(),
        });
        await saveBookings(siteId, token, villaKey, bookings);
        console.log(`Booking saved for ${villaKey}: ${meta.checkIn} - ${meta.checkOut}`);
      } catch(e) {
        console.error('Error saving booking:', e.message);
        return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
      }
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
