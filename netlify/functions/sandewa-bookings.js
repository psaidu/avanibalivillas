const { handler: baseHandler } = require('./bookings-ical');

exports.handler = async function(event, context) {
  event.queryStringParameters = event.queryStringParameters || {};
  event.queryStringParameters.villa = 'sandewa';
  return baseHandler(event, context);
};
