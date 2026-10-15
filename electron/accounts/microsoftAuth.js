const { clipboard, shell } = require('electron');
const { Authflow, Titles } = require('prismarine-auth');

function createMemoryCache(initial = {}) {
  const state = JSON.parse(JSON.stringify(initial || {}));
  const factory = ({ cacheName }) => ({
    async reset() {
      state[cacheName] = {};
      return state[cacheName];
    },
    async getCached() {
      if (!state[cacheName]) state[cacheName] = {};
      return state[cacheName];
    },
    async setCached(value) {
      state[cacheName] = value || {};
    },
    async setCachedPartial(value) {
      state[cacheName] = { ...(state[cacheName] || {}), ...(value || {}) };
    },
  });
  return { factory, state };
}

function tokenExpiry(token, cacheState) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    if (payload.exp) return payload.exp * 1000;
  } catch {}
  const cached = cacheState?.mca?.mca;
  if (cached?.obtainedOn && cached?.expires_in) return cached.obtainedOn + cached.expires_in * 1000;
  return Date.now() + 23 * 60 * 60 * 1000;
}

function friendly(message) {
  const err = new Error(message);
  err.friendly = true;
  return err;
}

const XSTS_MESSAGES = {
  2148916233: 'This Microsoft account has no Xbox profile yet. Sign in once at xbox.com, then try again.',
  2148916238: 'This is a child account and needs an adult family member to approve Xbox sign-in first.',
};

function classifyAuthError(err) {
  if (err?.friendly) return err.message;
  const raw = err?.message || String(err || '');
  const short = raw.length > 300 ? `${raw.slice(0, 300)}…` : raw;
  const xerr = raw.match(/XErr:\s*(\d+)/)?.[1];
  if (xerr && XSTS_MESSAGES[xerr]) return XSTS_MESSAGES[xerr];
  if (/Authentication failed, timed out/.test(raw)) {
    return 'Microsoft sign-in timed out - the code expired before sign-in completed. Please try again.';
  }
  if (/access_denied|authorization_denied|user.?cancelled|user.?denied/i.test(raw)) {
    return 'Microsoft sign-in was not approved in the browser. Please try again and approve the request.';
  }
  if (/ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ETIMEDOUT|fetch failed|Failed to fetch|network/i.test(raw)) {
    return "Couldn't reach Microsoft's servers. Check your internet connection and try again.";
  }
  if (/(^|\s)40[13](\s|$)/.test(raw)) {
    return 'Microsoft rejected this sign-in. This usually means the account does not own Minecraft: Java Edition.';
  }
  return `Microsoft sign-in failed: ${short}`;
}

// True when the error means the saved session is unusable (as opposed to a
// transient network problem). Used at launch time to pick SESSION_EXPIRED.
function isSessionError(err) {
  const raw = err?.message || String(err || '');
  return /XErr:| 40[13] |session expired|retired Microsoft login|credentials are missing|credential storage|Java Edition profile/i
    .test(` ${raw} `);
}

function tokenXuid(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return payload.xuid || payload.yuid || '';
  } catch {
    return '';
  }
}

function createFlow(cacheState, onStatus, interactive, onCodeValue) {
  const memory = createMemoryCache(cacheState);
  const onCode = response => {
    if (!interactive) {
      throw friendly('Microsoft session expired. Open Account Manager and refresh the account to sign in again.');
    }
    const code = response?.user_code || '';
    try { if (code) clipboard.writeText(code); } catch {}
    onCodeValue?.(code);
    onStatus?.(`Enter Microsoft code ${code} at microsoft.com/link. The code was copied to your clipboard.`);
    shell.openExternal('https://www.microsoft.com/link').then(
      () => {},
      () => onStatus?.(`Enter Microsoft code ${code} at microsoft.com/link (code copied). Your browser did not open automatically - please open the page yourself.`),
    );
  };
  const flow = new Authflow(
    'omega-launcher-account',
    memory.factory,
    { flow: 'live', authTitle: Titles.MinecraftNintendoSwitch, deviceType: 'Nintendo' },
    onCode,
  );
  return { flow, memory };
}

async function authenticate(cacheState, onStatus, interactive, onCodeValue) {
  const { flow, memory } = createFlow(cacheState, onStatus, interactive, onCodeValue);
  onStatus?.(interactive ? 'Requesting a secure Microsoft device code...' : 'Refreshing Microsoft session...');
  const minecraft = await flow.getMinecraftJavaToken({ fetchEntitlements: true, fetchProfile: true });
  if (!minecraft?.token) throw friendly('Microsoft did not return a Minecraft access token. Please try again.');
  if (!minecraft.profile?.id || !minecraft.profile?.name) {
    throw friendly('This Microsoft account does not have a Minecraft: Java Edition profile.');
  }
  return {
    profile: { id: minecraft.profile.id, name: minecraft.profile.name },
    tokens: {
      authCache: memory.state,
      accessToken: minecraft.token,
      expiresAt: tokenExpiry(minecraft.token, memory.state),
      userProperties: {},
      xuid: tokenXuid(minecraft.token),
    },
  };
}

async function startMicrosoftLogin(onStatus, onCodeValue) {
  return authenticate({}, onStatus, true, onCodeValue);
}

async function refreshMicrosoft(tokens, onStatus, onCodeValue) {
  if (!tokens?.authCache) throw friendly('This account uses the retired Microsoft login format. Remove it and sign in again.');
  const cache = JSON.parse(JSON.stringify(tokens.authCache));
  cache.mca = {};
  return authenticate(cache, onStatus, Boolean(onStatus), onCodeValue);
}

module.exports = { refreshMicrosoft, startMicrosoftLogin, classifyAuthError, isSessionError };
