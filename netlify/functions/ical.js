exports.handler = async function(event) {
  const villa = event.queryStringParameters && event.queryStringParameters.villa;

  const ICAL_URLS = {
    geya:    'https://www.airbnb.com/calendar/ical/1526553003171178696.ics?t=09864c30941f44438fbbfd5920d7e999',
    bellis:  'https://www.airbnb.com/calendar/ical/1356233435162290805.ics?t=b00c1920edfa4999bb43d76147a60f8d',
    // Add sandewa and linum iCal URLs here when ready:
    // sandewa: 'https://www.airbnb.com/calendar/ical/XXXXXXXXX.ics?t=XXXXX',
    // linum:   'https://www.airbnb.com/calendar/ical/XXXXXXXXX.ics?t=XXXXX',
  };

  if (!villa || !ICAL_URLS[villa]) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid or missing villa parameter' }),
    };
  }

  try {
    const response = await fetch(ICAL_URLS[villa], {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AvaniVillas/1.0)' }
    });

    if (!response.ok) {
      throw new Error(`Airbnb returned ${response.status}`);
    }

    const icalText = await response.text();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600', // cache 1 hour
      },
      body: icalText,
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
