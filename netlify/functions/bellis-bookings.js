const { handler: baseHandler } = require('./bookings-ical');

exports.handler = async function(event, context) {
  event.queryStringParameters = event.queryStringParameters || {};
  event.queryStringParameters.villa = 'bellis';
  return baseHandler(event, context);
};
