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


async function sendBookingEmail(villaKey, meta, amount, currency) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) { console.log('No RESEND_API_KEY set'); return; }

  const villaNames = {
    geya:    'Geya Villa',
    bellis:  'Bellis 68',
    sandewa: 'Sandewa Villa',
    linum:   'Linum Villa',
  };
  const villaName  = villaNames[villaKey] || villaKey;
  const guestName  = meta.guestName  || 'Guest';
  const guestEmail = meta.guestEmail || '';
  const checkIn    = meta.checkIn    || '';
  const checkOut   = meta.checkOut   || '';
  const nights     = meta.nights     || '';

  const fmt = function(ds) {
    if (!ds) return ds;
    var d = new Date(ds + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday:'short', day:'numeric', month:'long', year:'numeric' });
  };

  const subject = `New Booking: ${villaName} · ${fmt(checkIn)} · ${guestName}`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1712">
      <div style="background:#2d4a35;padding:2rem;text-align:center">
        <h1 style="color:#b8943a;font-size:1.6rem;margin:0;font-weight:300;letter-spacing:0.1em">AVANI BALI VILLAS</h1>
        <p style="color:#8fa898;margin:0.5rem 0 0;font-size:0.85rem;letter-spacing:0.15em;text-transform:uppercase">New Booking Confirmed</p>
      </div>
      <div style="background:#f9f5ec;padding:2rem">
        <h2 style="font-size:1.3rem;font-weight:400;color:#1a1712;margin:0 0 1.5rem">${villaName}</h2>
        <table style="width:100%;border-collapse:collapse;font-size:0.9rem">
          <tr style="border-bottom:1px solid #e8dcc8">
            <td style="padding:0.7rem 0;color:#888;width:140px">Guest Name</td>
            <td style="padding:0.7rem 0;font-weight:500">${guestName}</td>
          </tr>
          <tr style="border-bottom:1px solid #e8dcc8">
            <td style="padding:0.7rem 0;color:#888">Guest Email</td>
            <td style="padding:0.7rem 0">${guestEmail}</td>
          </tr>
          <tr style="border-bottom:1px solid #e8dcc8">
            <td style="padding:0.7rem 0;color:#888">Check-in</td>
            <td style="padding:0.7rem 0;font-weight:500;color:#2d4a35">${fmt(checkIn)}</td>
          </tr>
          <tr style="border-bottom:1px solid #e8dcc8">
            <td style="padding:0.7rem 0;color:#888">Check-out</td>
            <td style="padding:0.7rem 0;font-weight:500;color:#2d4a35">${fmt(checkOut)}</td>
          </tr>
          <tr style="border-bottom:1px solid #e8dcc8">
            <td style="padding:0.7rem 0;color:#888">Nights</td>
            <td style="padding:0.7rem 0">${nights}</td>
          </tr>
          <tr style="border-bottom:1px solid #e8dcc8">
            <td style="padding:0.7rem 0;color:#888">Amount Paid</td>
            <td style="padding:0.7rem 0;font-weight:500;color:#c0714a">${currency} $${amount}</td>
          </tr>
        </table>
        <div style="margin-top:1.5rem;padding:1rem;background:#fff;border-left:3px solid #c0714a;font-size:0.85rem;color:#666">
          <strong style="color:#1a1712">Next steps:</strong><br>
          1. Confirm the booking with the guest at ${guestEmail}<br>
          2. Block dates on Airbnb if not auto-synced yet<br>
          3. Contact guest 1 day before check-in
        </div>
      </div>
      <div style="background:#1a1712;padding:1rem 2rem;text-align:center">
        <p style="color:#8fa898;font-size:0.75rem;margin:0">Avani Bali Villas · avanibalivillas.com</p>
      </div>
    </div>
  `;

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + RESEND_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from:    'Avani Bali Villas <onboarding@resend.dev>',
      to:      ['psaidu@gmail.com'],
      subject: subject,
      html:    html,
    }),
  });

  if (!r.ok) {
    const err = await r.text();
    throw new Error('Resend error: ' + err);
  }
  console.log('Email sent successfully');
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

      // Send email notification
      try {
        await sendBookingEmail(villaKey, meta, pi.amount / 100, pi.currency.toUpperCase());
      } catch(e) {
        console.error('Email error (non-fatal):', e.message);
      }
    }
    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  } catch(e) {
    console.error('Save error:', e.message);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
