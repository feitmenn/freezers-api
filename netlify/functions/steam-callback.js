var crypto = require('crypto');

exports.handler = async function(event) {
  var SITE_ORIGIN = process.env.SITE_ORIGIN || 'https://freezers-esport.eu';
  var SESSION_SECRET = process.env.SESSION_SECRET;
  var USERS_URL = 'https://raw.githubusercontent.com/feitmenn/freezers/main/users.json';
  var TOKEN_TTL = 7 * 24 * 3600;

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(SITE_ORIGIN), body: '' };
  }

  var params = new URLSearchParams(event.rawQuery || '');
  var returnTo = decodeURIComponent(params.get('returnTo') || SITE_ORIGIN);

  if (!returnTo.startsWith(SITE_ORIGIN)) {
    return errorPage('Neplatny navratovy odkaz.', SITE_ORIGIN);
  }

  try {
    var isValid = await verifySteamOpenID(params);
    if (!isValid) {
      return errorPage('Steam overeni selhalo. Zkus to prosim znovu.', SITE_ORIGIN);
    }

    var claimedId = params.get('openid.claimed_id') || '';
    var steamId64 = extractSteamID64(claimedId);
    if (!steamId64) {
      return errorPage('Nepodarilo se ziskat SteamID.', SITE_ORIGIN);
    }

    var users = await fetchUsers(USERS_URL);
    var user = users.find(function(u) { return u.steamId64 === steamId64; });
    if (!user) {
      return errorPage(
        'Tvuj Steam ucet (' + steamId64 + ') neni prirazeny k zadnemu uctu na webu. Kontaktuj staff.',
        SITE_ORIGIN
      );
    }

    var token = createSessionToken(user, SESSION_SECRET, TOKEN_TTL);
    var separator = returnTo.includes('#') ? '&' : '#';
    var redirectUrl = returnTo + separator + 'steam_token=' + token;

    return {
      statusCode: 302,
      headers: Object.assign({ Location: redirectUrl }, corsHeaders(SITE_ORIGIN)),
      body: ''
    };
  } catch (err) {
    console.error('Steam callback error:', err);
    return errorPage('Chyba pri prihlaseni pres Steam: ' + err.message, SITE_ORIGIN);
  }
};

async function verifySteamOpenID(params) {
  var verifyParams = new URLSearchParams();
  for (var entry of params.entries()) {
    verifyParams.set(entry[0], entry[1]);
  }
  verifyParams.set('openid.mode', 'check_authentication');

  var res = await fetch('https://steamcommunity.com/openid/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: verifyParams.toString()
  });

  var text = await res.text();
  return text.includes('is_valid:true');
}

function extractSteamID64(claimedId) {
  var match = claimedId.match(/\/(\d{17})$/);
  return match ? match[1] : null;
}

async function fetchUsers(url) {
  var res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch users.json');
  return res.json();
}

function createSessionToken(user, secret, ttl) {
  var payload = {
    steamId64: user.steamId64,
    username: user.username,
    displayName: user.displayName || user.username,
    role: user.role || 'member',
    category: user.category || 'main',
    permissions: user.permissions || null,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + ttl
  };

  var payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  var sig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return payloadB64 + '.' + sig;
}

function errorPage(message, origin) {
  return {
    statusCode: 200,
    headers: Object.assign({ 'Content-Type': 'text/html; charset=utf-8' }, corsHeaders(origin)),
    body: '<!DOCTYPE html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>Chyba prihlaseni</title>' +
      '<style>body{font-family:sans-serif;background:#0b0b0c;color:#e4e8ee;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;text-align:center}' +
      '.box{max-width:480px;padding:32px;border-radius:16px;border:1px solid rgba(255,255,255,.12);background:rgba(18,18,20,.9)}' +
      'h2{color:#ff5555;margin:0 0 12px}p{margin:0 0 20px;line-height:1.6}' +
      'a{color:#2fe0c9;text-decoration:none;font-weight:600}</style></head>' +
      '<body><div class="box"><h2>Chyba prihlaseni</h2><p>' + escapeHtml(message) + '</p>' +
      '<a href="' + origin + '">Zpet na web</a></div></body></html>'
  };
}

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };
}
