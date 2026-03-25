const https = require('https');

const ICAL_URLS = {
  geya:   'https://www.airbnb.com/calendar/ical/1526553003171178696.ics?t=09864c30941f44438fbbfd5920d7e999',
  bellis: 'https://www.airbnb.com/calendar/ical/1356233435162290805.ics?t=b00c1920edfa4999bb43d76147a60f8d',
  // sandewa: 'https://www.airbnb.com/calendar/ical/XXXXXXXXX.ics?t=XXXXX',
  // linum:   'https://www.airbnb.com/calendar/ical/XXXXXXXXX.ics?t=XXXXX',
};

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/calendar,*/*',
      }
    };
    https.get(url, options, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Status ${res.statusCode}`));
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

exports.handler = async function(event) {
  const villa = event.queryStringParameters && event.queryStringParameters.villa;

  if (!villa || !ICAL_URLS[villa]) {
    return {
      statusCode: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Invalid or missing villa parameter' }),
    };
  }

  try {
    const icalText = await fetchUrl(ICAL_URLS[villa]);
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
      },
      body: icalText,
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: error.message }),
    };
  }
};
