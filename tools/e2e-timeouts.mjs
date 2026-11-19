// One timeout scale for every browser suite (task 030). A CI runner draws the
// studio's WebGL (SwiftShader) several times slower than the dev container,
// so every wait limit in the suites goes through `tmo()`, and every browser
// context gets Playwright's 30 s defaults scaled the same way. Only how long
// a wait may take changes; no check asserts anything different. Fixed
// pauses (`waitForTimeout`) are not scaled.
//
//   E2E_TIMEOUT_SCALE=4 node apps/web/scripts/account-e2e.mjs --smoke
//
// Default 1 (the dev container); ci.yml sets it for the runners.

const raw = Number(process.env.E2E_TIMEOUT_SCALE ?? 1);
export const TIMEOUT_SCALE = Number.isFinite(raw) && raw > 0 ? raw : 1;

/** A wait limit in ms, scaled. */
export const tmo = (ms) => Math.round(ms * TIMEOUT_SCALE);

/** Playwright's default limits (30 s for actions, waits and navigations), scaled, on a context or a page. */
export function scaleDefaults(target) {
  target.setDefaultTimeout(tmo(30000));
  target.setDefaultNavigationTimeout(tmo(30000));
  return target;
}

/** Every context and page the browser makes from now on gets the scaled defaults. */
export function scaleBrowser(browser) {
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (opts) => scaleDefaults(await newContext(opts));
  const newPage = browser.newPage.bind(browser);
  browser.newPage = async (opts) => scaleDefaults(await newPage(opts));
  if (TIMEOUT_SCALE !== 1) console.log(`timeouts scaled x${TIMEOUT_SCALE} (E2E_TIMEOUT_SCALE)`);
  return browser;
}
