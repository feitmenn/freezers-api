exports.handler = async function(event) {
  var SITE_ORIGIN = process.env.SITE_ORIGIN || 'https://freezers-esport.eu';
  
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(SITE_ORIGIN), body: '' };
  }

  var params = new URLSearchParams(event.rawQuery || '');
  var returnTo = params.get('returnTo') || SITE_ORIGIN;

  if (!returnTo.startsWith(SITE_ORIGIN)) {
    return { statusCode: 400, body: 'Invalid returnTo origin' };
  }

  var netlifySite = event.headers.host
    ? 'https://' + event.headers.host
    : '';

  var callbackUrl = netlifySite + '/.netlify/functions/steam-callback?returnTo=' + encodeURIComponent(returnTo);

  var steamParams = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'checkid_setup',
    'openid.return_to': callbackUrl,
    'openid.realm': SITE_ORIGIN,
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select'
  });

  return {
    statusCode: 302,
    headers: Object.assign({
      Location: 'https://steamcommunity.com/openid/login?' + steamParams
    }, corsHeaders(SITE_ORIGIN)),
    body: ''
  };
};

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };
}
