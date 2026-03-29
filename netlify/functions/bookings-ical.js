// Generates an iCal feed from saved bookings for Airbnb to consume

async function getBookings(siteId, token, villa) {
  const url = `https://api.netlify.com/api/v1/blobs/${siteId}/bookings/${villa}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 404) return [];
  if (!r.ok) return [];
  try { return await r.json(); } catch(e) { return []; }
}

function toIcalDate(dateStr) {
  // Convert YYYY-MM-DD to YYYYMMDD
  return dateStr.replace(/-/g, '');
}

function generateIcal(villa, bookings) {
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  let cal = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Avani Bali Villas//Booking Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:Avani Bali Villas - ${villa}`,
    'X-WR-TIMEZONE:Asia/Makassar',
  ];

  for (const b of bookings) {
    // Airbnb expects DTEND to be the day after checkout for full-day blocks
    const checkOutDate = new Date(b.checkOut + 'T00:00:00');
    checkOutDate.setDate(checkOutDate.getDate() + 1);
    const checkOutStr = checkOutDate.toISOString().split('T')[0].replace(/-/g, '');

    cal = cal.concat([
      'BEGIN:VEVENT',
      `DTSTART;VALUE=DATE:${toIcalDate(b.checkIn)}`,
      `DTEND;VALUE=DATE:${checkOutStr}`,
      `SUMMARY:Reserved - Avani Bali Villas`,
      `DESCRIPTION:Booking via avanibalivillas.com`,
      `UID:${b.id}@avanibalivillas.com`,
      `DTSTAMP:${now}`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
    ]);
  }

  cal.push('END:VCALENDAR');
  return cal.join('\r\n');
}

exports.handler = async function(event) {
  const villa  = event.queryStringParameters && event.queryStringParameters.villa;
  const siteId = process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_API_TOKEN;

  if (!villa) {
    return { statusCode: 400, body: 'Missing villa parameter' };
  }

  if (!siteId || !token) {
    return { statusCode: 500, body: 'Missing env vars' };
  }

  try {
    const bookings = await getBookings(siteId, token, villa);
    const ical     = generateIcal(villa, bookings);
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="${villa}-bookings.ics"`,
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      },
      body: ical,
    };
  } catch(e) {
    return { statusCode: 500, body: `Error: ${e.message}` };
  }
};
