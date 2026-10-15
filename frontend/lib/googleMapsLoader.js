/**
 * Google Maps JavaScript API dynamic loader.
 * Loads the Maps JS API at runtime using the official inline bootstrap loader
 * and google.maps.importLibrary().
 * 
 * Strictly zero external dependencies.
 * Key and Map ID are obtained at runtime from GET /v1/client-config (never from build or git).
 */

let loaderPromise = null;
let authFailed = false;

if (typeof window !== 'undefined') {
  // Catch Google Maps invalid key / referrer rejection
  const prevAuthFailure = window.gm_authFailure;
  window.gm_authFailure = () => {
    authFailed = true;
    if (typeof prevAuthFailure === 'function') {
      try { prevAuthFailure(); } catch (_) {}
    }
    window.dispatchEvent(new CustomEvent('google-maps-auth-failure'));
  };
}

export function isAuthFailed() {
  return authFailed;
}

/**
 * Injects Google Maps inline bootstrap loader.
 * Official bootstrap loader snippet:
 * (g=>{var h,a,k,p="The Google Maps JavaScript API",c="google",l="importLibrary",q="__ib__",m=document,b=window;b=b[c]||(b[c]={});var d=b.maps||(b.maps={}),r=new Set,e=new URLSearchParams,u=()=>h||(h=new Promise(async(f,n)=>{await (a=m.createElement("script"));e.set("libraries",[...r]+"");for(k in g)e.set(k.replace(/[A-Z]/g,t=>"_"+t[0].toLowerCase()),g[k]);e.set("callback",c+".maps."+q);a.src=`https://maps.${c}apis.com/maps/api/js?`+e;d[q]=f;a.onerror=()=>h=n(Error(p+" could not load."));a.nonce=m.querySelector("script[nonce]")?.nonce||"";m.head.append(a)}));d[l]?console.warn(p+" only loads once. Ignoring:",g):d[l]=(f,...n)=>r.add(f)&&u().then(()=>d[l](f,...n))})
 */
function injectBootstrapLoader(config) {
  if (typeof window === 'undefined') return;
  if (window.google?.maps?.importLibrary) return;

  const g = {
    key: config.apiKey,
    v: config.version || 'weekly',
    language: config.language || 'vi',
    region: config.region || 'VN'
  };

  const h = null;
  const p = 'The Google Maps JavaScript API';
  const c = 'google';
  const l = 'importLibrary';
  const q = '__ib__';
  const m = document;
  const b = window;

  b[c] = b[c] || {};
  const d = b[c].maps || (b[c].maps = {});
  const r = new Set();
  const e = new URLSearchParams();

  let scriptPromise = null;
  const u = () => scriptPromise || (scriptPromise = new Promise(async (f, n) => {
    const a = m.createElement('script');
    e.set('libraries', [...r] + '');
    for (const k in g) {
      if (g[k]) {
        e.set(k.replace(/[A-Z]/g, (t) => '_' + t[0].toLowerCase()), g[k]);
      }
    }
    e.set('callback', c + '.maps.' + q);
    a.src = `https://maps.${c}apis.com/maps/api/js?` + e.toString();
    d[q] = f;
    a.onerror = () => {
      scriptPromise = n(new Error(p + ' could not load. (blocked or network failure)'));
    };
    a.nonce = m.querySelector('script[nonce]')?.nonce || '';
    m.head.append(a);
  }));

  if (!d[l]) {
    d[l] = (f, ...n) => {
      r.add(f);
      return u().then(() => d[l](f, ...n));
    };
  }
}

/**
 * Loads required Google Maps libraries using importLibrary.
 * Returns an object containing the requested libraries:
 * { maps, marker, places }
 */
export async function loadGoogleMaps({
  apiKey,
  libraries = ['maps', 'marker', 'places'],
  language = 'vi',
  region = 'VN',
  version = 'weekly'
}) {
  if (typeof window === 'undefined') {
    throw new Error('Google Maps can only be loaded in a browser environment');
  }

  if (authFailed) {
    const err = new Error('Google Maps authentication failed (key rejected or unauthorized referrer)');
    err.code = 'KEY_REJECTED';
    throw err;
  }

  // If already loaded or injected by a test suite
  if (window.google?.maps?.importLibrary) {
    try {
      const results = {};
      for (const lib of libraries) {
        results[lib] = await window.google.maps.importLibrary(lib);
      }
      return results;
    } catch (e) {
      if (authFailed) {
        const err = new Error('Google Maps authentication failed (key rejected)');
        err.code = 'KEY_REJECTED';
        throw err;
      }
      throw e;
    }
  }

  if (!apiKey) {
    const err = new Error('No Google Maps API key provided');
    err.code = 'NOT_CONFIGURED';
    throw err;
  }

  if (!loaderPromise) {
    loaderPromise = (async () => {
      injectBootstrapLoader({ apiKey, language, region, version });

      // Load all requested libraries in parallel
      const results = {};
      const loadPromises = libraries.map(async (lib) => {
        results[lib] = await window.google.maps.importLibrary(lib);
      });

      await Promise.all(loadPromises);
      return results;
    })().catch((err) => {
      loaderPromise = null; // allow retry if failed
      if (authFailed || err?.message?.includes('authFailure')) {
        const error = new Error('Google Maps authentication failed (key rejected)');
        error.code = 'KEY_REJECTED';
        throw error;
      }
      if (err?.message?.includes('could not load')) {
        const error = new Error('Google Maps script blocked or network unavailable');
        error.code = 'SCRIPT_BLOCKED';
        throw error;
      }
      throw err;
    });
  }

  return loaderPromise;
}
