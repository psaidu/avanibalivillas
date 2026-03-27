const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try { body = JSON.parse(event.body); } catch(e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { amount, currency, villa, checkIn, checkOut, guestName, guestEmail, nights } = body;

  if (!amount || !villa || !checkIn || !checkOut || !guestEmail) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing required fields' }) };
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Stripe uses cents
      currency: currency || 'usd',
      metadata: {
        villa,
        checkIn,
        checkOut,
        guestName: guestName || '',
        guestEmail,
        nights: String(nights),
      },
      receipt_email: guestEmail,
      description: `Avani Bali Villas — ${villa} · ${checkIn} to ${checkOut} (${nights} nights)`,
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ clientSecret: paymentIntent.client_secret }),
    };
  } catch(e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: e.message }),
    };
  }
};
