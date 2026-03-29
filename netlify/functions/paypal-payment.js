const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_SECRET    = process.env.PAYPAL_SECRET;
const PAYPAL_BASE      = 'https://api-m.paypal.com'; // Live

async function getAccessToken() {
  const creds = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`).toString('base64');
  const r = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await r.json();
  if (!r.ok) throw new Error('PayPal auth failed: ' + JSON.stringify(data));
  return data.access_token;
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

  let body;
  try { body = JSON.parse(event.body); } catch(e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { action, orderID, amount, currency, villa, checkIn, checkOut, guestName, guestEmail, nights } = body;

  try {
    const token = await getAccessToken();

    // CREATE order
    if (action === 'create') {
      const r = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'PayPal-Request-Id': `avani-${Date.now()}`,
        },
        body: JSON.stringify({
          intent: 'CAPTURE',
          purchase_units: [{
            amount: {
              currency_code: currency || 'USD',
              value: String(amount),
            },
            description: `Avani Bali Villas — ${villa} · ${checkIn} to ${checkOut} (${nights} nights)`,
            custom_id: JSON.stringify({ villa, checkIn, checkOut, guestName, guestEmail, nights }),
          }],
          application_context: {
            brand_name: 'Avani Bali Villas',
            landing_page: 'NO_PREFERENCE',
            user_action: 'PAY_NOW',
          },
        }),
      });
      const order = await r.json();
      if (!r.ok) throw new Error('Create order failed: ' + JSON.stringify(order));
      return { statusCode: 200, headers, body: JSON.stringify({ orderID: order.id }) };
    }

    // CAPTURE order
    if (action === 'capture') {
      const r = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${orderID}/capture`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      const capture = await r.json();
      if (!r.ok) throw new Error('Capture failed: ' + JSON.stringify(capture));
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, capture }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid action' }) };
  } catch(e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
