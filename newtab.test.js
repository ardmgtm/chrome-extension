const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'newtab.js'), 'utf8');

test('widget carousel keeps both cards in one equal-height sliding grid and respects reduced motion', () => {
  const html = fs.readFileSync(path.join(__dirname, 'newtab.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
  assert.match(html, /class="widget-carousel-track"[^>]*>[\s\S]*?class="prayer-widget"[\s\S]*?class="todo-widget"/);
  assert.match(css, /\.widget-carousel-track\s*\{[^}]*display:\s*grid;[^}]*width:\s*200%;[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);[^}]*align-items:\s*stretch;[^}]*transition:\s*transform/);
  assert.match(css, /\.widget-carousel-track\.is-todo\s*\{\s*transform:\s*translateX\(-50%\);/);
  assert.match(css, /\.widget-carousel \.prayer-widget, \.widget-carousel \.todo-widget\s*\{[^}]*height:\s*100%;/);
  assert.match(css, /prefers-reduced-motion:\s*reduce\)\s*\{\s*\.widget-carousel-track\s*\{\s*transition:\s*none;/);
});

class Element {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.listeners = {};
    this.attributes = {};
    this.style = { setProperty: (key, value) => { this.style[key] = value; }, removeProperty: (key) => { delete this.style[key]; } };
    this.classList = { values: new Set(), add: (value) => this.classList.values.add(value), remove: (value) => this.classList.values.delete(value), contains: (value) => this.classList.values.has(value) };
    this.textContent = '';
    this.value = '';
    this.hidden = false;
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
  setAttribute(key, value) { this.attributes[key] = value; }
  removeAttribute(key) { delete this.attributes[key]; if (key === 'src') this.src = ''; }
  querySelector(selector) { return selector === 'time' ? this.children.find((child) => child.tagName === 'TIME') || null : null; }
  focus() { this.focused = true; }
  async fire(type, event = {}) {
    for (const listener of this.listeners[type] || []) await listener({ target: this, preventDefault() {}, ...event });
  }
}

function setup({ savedCity = null, savedWallpaper = null, savedWeatherCache = null, savedPrayerCache = null, savedTodo = null, fetchImpl = async () => ({ ok: false }), bitmapImpl, faviconPixels, clock = { now: Date.now() } } = {}) {
  const ids = {};
  for (const id of ['app-grid', 'site-grid', 'location-input', 'location-results', 'location-status', 'home-view', 'settings-view', 'home-trigger', 'settings-trigger', 'current-location', 'saved-location', 'weather-city', 'weather-message', 'weather-details', 'weather-temperature', 'weather-condition', 'weather-symbol', 'weather-high', 'weather-low', 'weather-updated', 'weather-last-updated', 'prayer-status', 'prayer-location', 'prayer-last-updated', 'prayer-list', 'prayer-countdown-label', 'prayer-countdown-value', 'location-search', 'search-form', 'search-trigger', 'search-input', 'location-form', 'clear-location', 'wallpaper-input', 'wallpaper-status', 'wallpaper-preview', 'wallpaper-preview-image', 'clear-wallpaper', 'greeting', 'clock', 'date']) ids[id] = new Element();
  ids['weather-details'].hidden = true;
  const location = { _hash: '', href: '' };
  const window = { listeners: {}, intervals: [], addEventListener(type, listener) { this.listeners[type] = listener; }, setInterval(listener) { this.intervals.push(listener); return this.intervals.length; }, clearInterval() {} };
  Object.defineProperty(location, 'hash', {
    get() { return this._hash; },
    set(value) { this._hash = value; window.listeners.hashchange?.(); }
  });
  const storage = { weatherCity: savedCity, wallpaperImage: savedWallpaper };
  if (savedWeatherCache) storage.weatherCache = savedWeatherCache;
  if (savedPrayerCache) storage.prayerCache = savedPrayerCache;
  if (savedTodo) storage.todoItems = savedTodo;
  const chrome = {
    runtime: { lastError: null, getURL: (value) => `chrome-extension://test${value}` },
    topSites: { get: (callback) => callback([{ title: 'Contoh', url: 'https://example.com/' }]) },
    storage: { local: {
      get: (_, callback) => callback(storage),
      set: (values, callback) => { Object.assign(storage, values); callback?.(); },
      remove: (key, callback) => { delete storage[key]; callback(); }
    } }
  };
  const document = {
    listeners: {},
    body: new Element('body'),
    getElementById: (id) => ids[id],
    createElement: (tag) => tag === 'canvas' ? {
      width: 0, height: 0,
      getContext: () => ({ fillRect() {}, drawImage() {}, getImageData: () => ({ data: faviconPixels || new Uint8ClampedArray(20 * 20 * 4) }), set fillStyle(value) {} }),
      toDataURL: () => 'data:image/jpeg;base64,YWJj'
    } : new Element(tag),
    createElementNS: (_, tag) => new Element(tag),
    createDocumentFragment: () => new Element('fragment'),
    querySelectorAll: (selector) => selector === '.prayer-row' ? ids['prayer-list'].children
      : selector === '.prayer-row time' ? ids['prayer-list'].children.map((row) => row.children[1]) : [],
    querySelector: (selector) => {
      const match = selector.match(/data-prayer="([^"]+)"/);
      return match ? ids['prayer-list'].children.find((row) => row.attributes['data-prayer'] === match[1]) || null : null;
    },
    addEventListener(type, listener) { this.listeners[type] = listener; }
  };
  ids['prayer-list'].replaceChildren(...[['Fajr', 'Subuh'], ['Dhuhr', 'Dzuhur'], ['Asr', 'Asar'], ['Maghrib', 'Maghrib'], ['Isha', 'Isya']].map(([name, label]) => {
    const row = new Element('li');
    row.className = 'prayer-row';
    row.setAttribute('data-prayer', name);
    const title = new Element('span');
    title.textContent = label;
    row.append(title, new Element('time'));
    return row;
  }));
  for (const id of ['todo-widget', 'todo-form', 'todo-input', 'todo-count', 'todo-status', 'todo-list', 'todo-empty', 'widget-prev', 'widget-next', 'widget-position', 'widget-carousel-track']) ids[id] = new Element();
  const prayerWidget = new Element('section');
  ids['todo-widget'].inert = true;
  ids['todo-widget'].setAttribute('aria-hidden', 'true');
  const originalQuerySelector = document.querySelector;
  document.querySelector = (selector) => selector === '.prayer-widget' ? prayerWidget : originalQuerySelector(selector);
  class TestDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock.now])); }
    static now() { return clock.now; }
  }
  vm.runInNewContext(source, { document, window, chrome, location, fetch: fetchImpl, createImageBitmap: bitmapImpl || (async () => ({ width: 1920, height: 1080, close() {} })), URL, URLSearchParams, Intl, Date: TestDate, HTMLElement: Element }, { timeout: 2000 });
  return { ids, location, storage, window, document, clock, prayerWidget };
}

async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
}

test('widget carousel only changes slides with manual controls and wraps around', async () => {
  const { ids, prayerWidget, window } = setup();
  assert.equal(ids['widget-carousel-track'].classList.contains('is-todo'), false);
  assert.equal(ids['todo-widget'].inert, true);
  assert.equal(ids['todo-widget'].attributes['aria-hidden'], 'true');
  await ids['widget-next'].fire('click');
  assert.equal(ids['widget-carousel-track'].classList.contains('is-todo'), true);
  assert.equal(prayerWidget.inert, true);
  assert.equal(prayerWidget.attributes['aria-hidden'], 'true');
  assert.equal(ids['todo-widget'].inert, false);
  assert.equal(ids['todo-widget'].attributes['aria-hidden'], 'false');
  assert.equal(ids['widget-position'].textContent, '2 / 2 · Todo');
  for (const tick of window.intervals) tick();
  assert.equal(ids['widget-carousel-track'].classList.contains('is-todo'), true);
  await ids['widget-next'].fire('click');
  assert.equal(ids['widget-carousel-track'].classList.contains('is-todo'), false);
  assert.equal(prayerWidget.inert, false);
  assert.equal(prayerWidget.attributes['aria-hidden'], 'false');
  await ids['widget-prev'].fire('click');
  assert.equal(ids['widget-carousel-track'].classList.contains('is-todo'), true);
});

test('todo can be added, edited, completed, deleted, and restored from storage', async () => {
  const { ids, storage } = setup();
  ids['todo-input'].value = '  Belajar  ';
  await ids['todo-form'].fire('submit');
  await settle();
  assert.equal(storage.todoItems[0].text, 'Belajar');
  assert.equal(ids['todo-empty'].hidden, true);
  const actions = ids['todo-list'].children[0].children;
  assert.equal(actions[2].attributes['aria-label'], 'Edit Belajar');
  assert.equal(actions[3].attributes['aria-label'], 'Hapus Belajar');
  for (const button of [actions[2], actions[3]]) {
    assert.equal(button.textContent, '');
    assert.equal(button.children[0].tagName, 'SVG');
    assert.equal(button.children[0].attributes['aria-hidden'], 'true');
    assert.equal(button.children[0].children[0].tagName, 'PATH');
  }
  assert.notEqual(actions[2].children[0].children[0].attributes.d, actions[3].children[0].children[0].attributes.d);
  await ids['todo-list'].children[0].children[2].fire('click');
  const editForm = ids['todo-list'].children[0].children[0];
  editForm.children[0].value = 'Baca buku';
  await editForm.fire('submit');
  await settle();
  assert.equal(storage.todoItems[0].text, 'Baca buku');
  const checkbox = ids['todo-list'].children[0].children[0];
  checkbox.checked = true;
  await checkbox.fire('change');
  await settle();
  assert.equal(storage.todoItems[0].done, true);
  const restored = setup({ savedTodo: storage.todoItems });
  assert.equal(restored.ids['todo-list'].children[0].children[1].textContent, 'Baca buku');
  assert.equal(restored.ids['todo-list'].children[0].children[0].checked, true);
  await restored.ids['todo-list'].children[0].children[3].fire('click');
  await settle();
  assert.equal(restored.storage.todoItems.length, 0);
  assert.equal(restored.ids['todo-empty'].hidden, false);
});

test('todo ignores blank entries and invalid saved data without changing storage', async () => {
  const { ids, storage } = setup({ savedTodo: [{ id: 'a', text: 'valid', done: false }, { id: 'b', text: '', done: true }] });
  assert.equal(ids['todo-list'].children.length, 1);
  ids['todo-input'].value = '   ';
  await ids['todo-form'].fire('submit');
  await settle();
  assert.equal(storage.todoItems.length, 2);
  assert.equal(ids['todo-list'].children.length, 1);
  await ids['todo-list'].children[0].children[2].fire('click');
  const edit = ids['todo-list'].children[0].children[0];
  edit.children[0].value = '  ';
  await edit.fire('submit');
  assert.equal(ids['todo-list'].children[0].children[0], edit);
  await edit.children[2].fire('click');
  assert.equal(ids['todo-list'].children[0].children[1].textContent, 'valid');
});

test('home loads tiles and prompts for location when unset; settings remains in same page', () => {
  const { ids, location, window } = setup();
  assert.equal(ids['app-grid'].children[0].children.length, 6);
  const netflixItem = ids['app-grid'].children[0].children[0];
  assert.equal(netflixItem.className, 'app-item');
  assert.equal(netflixItem.children.length, 2);
  const netflix = netflixItem.children[0];
  assert.equal(netflix.className, 'app-card netflix');
  assert.equal(netflix.href, 'https://www.netflix.com/');
  assert.equal(netflix.children[0].className, 'app-visual');
  assert.equal(netflix.children[0].children[0].tagName, 'IMG');
  assert.match(netflix.children[0].children[0].src, /assets\/brands\/netflix\.png/);
  assert.equal(netflix.children.length, 1);
  assert.equal(netflixItem.children[1].className, 'app-label');
  assert.equal(netflixItem.children[1].textContent, 'Netflix');
  const primeVideoItem = ids['app-grid'].children[0].children[1];
  const primeVideo = primeVideoItem.children[0];
  assert.match(primeVideo.children[0].children[0].src, /assets\/brands\/primevideo-white\.png/);
  assert.equal(primeVideoItem.children[1].textContent, 'Prime Video');
  assert.equal(ids['site-grid'].children[0].children.length, 1);
  const siteItem = ids['site-grid'].children[0].children[0];
  assert.equal(siteItem.className, 'site-item');
  assert.equal(siteItem.children.length, 2);
  const siteCard = siteItem.children[0];
  assert.match(siteCard.style['--site-accent'], /^hsl\(\d+ 58% 46%\)$/);
  assert.equal(siteCard.children[0].className, 'site-visual');
  assert.match(siteCard.children[0].children[0].children[0].src, /_favicon/);
  assert.equal(siteCard.children.length, 1);
  assert.equal(siteItem.children[1].className, 'site-copy');
  assert.equal(siteItem.children[1].children[0].textContent, 'Contoh');
  assert.match(ids['weather-message'].children[0].textContent, /Pilih lokasi/);
  location.hash = '#settings';
  assert.equal(ids['home-view'].hidden, true);
  assert.equal(ids['settings-view'].hidden, false);
  assert.equal(ids['home-trigger'].attributes['aria-current'], 'false');
  assert.equal(ids['settings-trigger'].attributes['aria-current'], 'page');
  assert.equal(ids['location-input'].focused, true);
  assert.equal(typeof window.listeners.hashchange, 'function');
  location.hash = '#home';
  assert.equal(ids['home-view'].hidden, false);
  assert.equal(ids['settings-view'].hidden, true);
  assert.equal(ids['home-trigger'].attributes['aria-current'], 'page');
});

test('site favicon dominant color updates tile; protected icon keeps stable color fallback', async () => {
  const pixels = new Uint8ClampedArray(20 * 20 * 4);
  pixels.set([205, 34, 56, 255], 0);
  const { ids } = setup({ faviconPixels: pixels });
  const card = ids['site-grid'].children[0].children[0].children[0];
  const icon = card.children[0].children[0].children[0];
  await icon.fire('load');
  assert.equal(card.style['--site-accent'], 'rgb(205 34 56)');
  assert.match(card.style['--site-accent'], /^rgb\(/);
});

test('cached weather and prayer schedule remain visible offline while opening the page still refreshes both APIs', async () => {
  const clock = { now: Date.parse('2026-10-21T21:00:00Z') };
  const city = { name: 'Jakarta', latitude: -6.2, longitude: 106.8, timezone: 'Asia/Jakarta' };
  const locationKey = `${city.latitude.toFixed(4)},${city.longitude.toFixed(4)}`;
  const updatedAt = clock.now - 60_000;
  const prayerDay = { Fajr: '04:30', Sunrise: '05:45', Dhuhr: '11:45', Asr: '15:00', Maghrib: '17:45', Isha: '19:00' };
  const baseDate = '2026-10-22';
  const timingsByDate = {
    '2026-10-21': prayerDay,
    [baseDate]: prayerDay,
    '2026-10-23': prayerDay
  };
  const calls = [];
  const { ids, storage } = setup({
    savedCity: city,
    savedWeatherCache: { locationKey, temperature: 25, code: 51, high: 31, low: 24, updatedAt },
    savedPrayerCache: { locationKey, timeZone: city.timezone, baseDate, timingsByDate, updatedAt },
    fetchImpl: async (url) => { calls.push(url); throw new Error('offline'); },
    clock
  });

  await settle();
  assert.equal(ids['weather-temperature'].textContent, '25°');
  assert.equal(ids['weather-condition'].textContent, 'Gerimis');
  assert.equal(ids['weather-last-updated'].textContent, `Terakhir diperbarui: ${new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(updatedAt))}`);
  assert.deepEqual(ids['prayer-list'].children.map((row) => row.children[1].textContent), ['04:30', '11:45', '15:00', '17:45', '19:00']);
  assert.match(ids['prayer-status'].textContent, /Offline|Kemenag/);
  assert.equal(ids['prayer-last-updated'].textContent.startsWith('Terakhir diperbarui:'), true);
  assert.equal(ids['weather-updated'].textContent, 'Offline · data tersimpan');
  assert.equal(calls.filter((url) => url.includes('api.open-meteo.com')).length, 1);
  assert.equal(calls.filter((url) => url.includes('api.aladhan.com')).length, 1);
  assert.equal(storage.weatherCache.updatedAt, updatedAt);
  assert.equal(storage.prayerCache.updatedAt, updatedAt);
});

test('slash focuses search, Google search form submits query, and favicon tile background is half-transparent', async () => {
  const { ids, document, location } = setup();
  let prevented = false;
  await document.listeners.keydown({
    key: '/', target: document.body, preventDefault() { prevented = true; }
  });
  assert.equal(prevented, true);
  assert.equal(ids['search-input'].focused, true);

  ids['search-input'].value = 'resep nasi goreng';
  await ids['search-form'].fire('submit');
  assert.equal(location.href, 'https://www.google.com/search?q=resep%20nasi%20goreng');

  const css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
  assert.match(css, /\.site-icon-wrap \{[^}]*background: rgba\(255,255,255,\.5\)/);
  assert.match(css, /\.info-control:hover \.info-popover/);
});

test('extension metadata and page copy contain no removed smart TV branding', () => {
  const html = fs.readFileSync(path.join(__dirname, 'newtab.html'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));
  assert.equal(html.includes('Smart TV'), false);
  assert.equal(html.includes('SMART TV'), false);
  assert.equal(manifest.name, 'New Tab');
  assert.doesNotMatch(manifest.description, /smart tv/i);
  assert.match(html, /<h2 id="apps-heading">Website populer<\/h2>/);
  assert.match(html, /id="search-submit"/);
  assert.ok(manifest.host_permissions.includes('https://api.aladhan.com/*'));
  assert.match(fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8'), /\.page-shell/);
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8'), /\.tv-(?:shell|header|footer)/);
});

test('popular service PNG assets are bundled, including a transparent white Prime Video logo', () => {
  const root = __dirname;
  for (const icon of ['netflix', 'primevideo', 'primevideo-white', 'youtube', 'spotify', 'disneyplus', 'googledrive']) {
    const png = fs.readFileSync(path.join(root, 'assets', 'brands', `${icon}.png`));
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    if (icon === 'primevideo-white') assert.equal(png[25], 6, 'white Prime Video logo PNG must preserve an alpha channel');
  }
  const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
  assert.match(css, /\.app-item, \.site-item \{ flex: 0 0 auto; width: clamp\(190px, 21\.5vw, 300px\);/);
  assert.match(css, /\.app-card, \.site-card \{ position: relative; display: flex; width: 100%; height: clamp\(132px, 12vw, 170px\);/);
  assert.match(css, /\.site-card \{ --site-accent:/);
  assert.match(css, /\.app-card\.spotify \{ --tile: #b9f3c4; \}/);
  assert.match(css, /\.app-card\.disney \{ --tile: #b9e7ff; \}/);
  assert.match(css, /\.page-tabs \{ position: static;/);
  assert.match(css, /\.page-footer \{ position: fixed; right: 0; bottom: 0; left: 0;/);
  assert.match(css, /\.app-visual/);
  assert.match(css, /\.site-visual/);
  assert.match(css, /::view-transition-new\(page-view\)/);
  const html = fs.readFileSync(path.join(root, 'newtab.html'), 'utf8');
  assert.match(html, /<nav class="page-tabs"[\s\S]*?<header class="page-header">/);
  assert.doesNotMatch(html, /class="floating-tabs"/);
  assert.match(html, /id="home-trigger"/);
  assert.match(html, /id="settings-trigger"/);
  assert.doesNotMatch(html, /PILIH APLIKASI FAVORITMU|DARI BROWSER ANDA|id="search-trigger"/);
});

test('search city, save selection, fetch current weather and clear saved city', async () => {
  const requests = [];
  const fetchImpl = async (url) => {
    requests.push(url);
    return { ok: true, json: async () => url.includes('/v1/search')
      ? { results: [{ name: 'Yogyakarta', admin1: 'Daerah Istimewa Yogyakarta', country: 'Indonesia', latitude: -7.8, longitude: 110.36, timezone: 'Asia/Jakarta' }] }
      : url.includes('api.aladhan.com')
        ? { code: 200, data: { timings: { Fajr: '04:30', Sunrise: '05:45', Dhuhr: '11:45', Asr: '15:00', Maghrib: '17:45', Isha: '19:00' }, meta: { timezone: 'Asia/Jakarta', method: { id: 20 } } } }
        : { current: { temperature_2m: 25.3, weather_code: 51 }, daily: { temperature_2m_max: [31], temperature_2m_min: [24] } } };
  };
  const { ids, location, storage } = setup({ fetchImpl });
  location.hash = '#settings';
  ids['location-input'].value = 'Yogyakarta';
  await ids['location-form'].fire('submit');
  assert.match(requests[0], /geocoding-api\.open-meteo\.com/);
  const result = ids['location-results'].children[0].children[0];
  assert.match(result.textContent, /Yogyakarta/);
  await result.fire('click');
  await settle();
  assert.equal(storage.weatherCity.name, 'Yogyakarta');
  assert.equal(location.hash, '#home');
  assert.match(requests[1], /api\.open-meteo\.com/);
  assert.ok(requests.some((url) => /api\.aladhan\.com\/v1\/timings\/\d{2}-\d{2}-\d{4}/.test(url) && /method=20/.test(url)));
  assert.equal(storage.weatherCity.timezone, 'Asia/Jakarta');
  assert.ok(Number.isFinite(storage.weatherCache.updatedAt));
  assert.ok(Number.isFinite(storage.prayerCache.updatedAt));
  assert.equal(ids['weather-last-updated'].textContent.startsWith('Terakhir diperbarui:'), true);
  assert.equal(ids['prayer-last-updated'].textContent.startsWith('Terakhir diperbarui:'), true);
  assert.equal(ids['weather-temperature'].textContent, '25°');
  assert.equal(ids['weather-condition'].textContent, 'Gerimis');
  assert.equal(ids['weather-high'].textContent, '31°');
  assert.equal(ids['weather-details'].hidden, false);
  await ids['clear-location'].fire('click');
  assert.equal(storage.weatherCity, undefined);
  assert.equal(ids['weather-details'].hidden, true);
  assert.equal(ids['prayer-countdown-value'].textContent, '--:--:--');
});

test('prayer widget uses Kemenag timings and highlights only within the requested prayer windows', async () => {
  const clock = { now: Date.parse('2026-10-21T21:00:00Z') }; // 04:00 in Asia/Jakarta
  const requests = [];
  const timings = { Fajr: '04:30 (WIB)', Sunrise: '05:45 (WIB)', Dhuhr: '11:45 (WIB)', Asr: '15:00 (WIB)', Maghrib: '17:45 (WIB)', Isha: '19:00 (WIB)' };
  const fetchImpl = async (url) => {
    requests.push(url);
    return { ok: true, json: async () => ({ code: 200, data: { timings, meta: { timezone: 'Asia/Jakarta', method: { id: 20 } } } }) };
  };
  const { ids, window } = setup({ savedCity: { name: 'Jakarta', latitude: -6.2, longitude: 106.8, timezone: 'Asia/Jakarta' }, fetchImpl, clock });
  await settle();

  const prayerRequests = requests.filter((url) => url.includes('api.aladhan.com'));
  assert.equal(prayerRequests.length, 3, `prayer requests: ${prayerRequests.join(' | ')}; status: ${ids['prayer-status'].textContent}`);
  assert.equal(ids['prayer-status'].textContent, 'Metode Kemenag | Asia/Jakarta');
  assert.deepEqual(ids['prayer-list'].children.map((row) => row.children[0].textContent), ['Subuh', 'Dzuhur', 'Asar', 'Maghrib', 'Isya']);
  assert.deepEqual(ids['prayer-list'].children.map((row) => row.children[1].textContent), ['04:30', '11:45', '15:00', '17:45', '19:00']);
  assert.ok(prayerRequests.every((url) => /method=20/.test(url)));
  assert.equal(ids['prayer-countdown-label'].textContent, 'Menuju Subuh');
  assert.equal(ids['prayer-countdown-value'].textContent, '00:30:00');

  const highlighted = () => ids['prayer-list'].children.find((row) => row.classList.contains('is-current'))?.attributes['data-prayer'] || null;
  assert.equal(highlighted(), 'Isha');
  const tick = window.intervals.find((callback) => callback.name === 'updatePrayerClock');
  assert.equal(typeof tick, 'function');

  clock.now = Date.parse('2026-10-21T21:30:00Z'); // 04:30, Fajr starts
  tick();
  assert.equal(highlighted(), 'Fajr');
  clock.now = Date.parse('2026-10-21T22:45:00Z'); // 05:45, sunrise ends Fajr highlight
  tick();
  assert.equal(highlighted(), null);

  clock.now = Date.parse('2026-10-22T00:00:00Z'); // 07:00, between sunrise and dhuhr
  tick();
  assert.equal(highlighted(), null);
  assert.equal(ids['prayer-countdown-label'].textContent, 'Menuju Dzuhur');

  clock.now = Date.parse('2026-10-22T06:00:00Z'); // 13:00, dhuhr through asr
  tick();
  assert.equal(highlighted(), 'Dhuhr');

  clock.now = Date.parse('2026-10-22T12:00:00Z'); // 19:00, exact Isha time
  tick();
  assert.equal(highlighted(), 'Isha');
  assert.equal(ids['prayer-countdown-label'].textContent, 'Menuju Subuh');
});

test('failed weather requests show a retry action without fake weather values', async () => {
  const city = { name: 'Bandung', latitude: -6.9, longitude: 107.6 };
  const { ids, storage } = setup({ savedCity: city });
  await settle();
  assert.equal(storage.weatherCity.name, city.name);
  assert.equal(ids['weather-condition'].textContent, 'Cuaca tidak tersedia');
  assert.equal(ids['weather-message'].children[0].textContent, 'Coba lagi');
});

test('geocoding failure and empty results keep settings usable', async () => {
  const { ids } = setup({ fetchImpl: async () => { throw new Error('offline'); } });
  ids['location-input'].value = 'Bandung';
  await ids['location-form'].fire('submit');
  assert.match(ids['location-status'].textContent, /gagal/);
  assert.equal(ids['location-search'].disabled, false);
  assert.equal(ids['location-results'].children.length, 0);
  ids['location-input'].value = 'A';
  await ids['location-form'].fire('submit');
  assert.match(ids['location-status'].textContent, /setidaknya dua huruf/);
});

test('stored wallpaper is applied on load and can be removed', async () => {
  const image = 'data:image/jpeg;base64,YWJj';
  const { ids, storage, document } = setup({ savedWallpaper: image });
  assert.equal(document.body.classList.contains('wallpaper-active'), true);
  assert.equal(ids['wallpaper-preview-image'].src, image);
  assert.equal(ids['wallpaper-preview'].hidden, false);
  await ids['clear-wallpaper'].fire('click');
  assert.equal(storage.wallpaperImage, undefined);
  assert.equal(document.body.classList.contains('wallpaper-active'), false);
  assert.equal(ids['wallpaper-preview'].hidden, true);
});

test('valid uploaded image is scaled, stored and previewed', async () => {
  const { ids, storage, document } = setup();
  ids['wallpaper-input'].files = [{ type: 'image/png', size: 5000 }];
  await ids['wallpaper-input'].fire('change');
  assert.equal(storage.wallpaperImage, 'data:image/jpeg;base64,YWJj');
  assert.equal(document.body.classList.contains('wallpaper-active'), true);
  assert.equal(ids['wallpaper-preview'].hidden, false);
});

test('invalid or oversized wallpaper is rejected without replacing saved image', async () => {
  const image = 'data:image/jpeg;base64,YWJj';
  const { ids, storage } = setup({ savedWallpaper: image });
  ids['wallpaper-input'].files = [{ type: 'image/svg+xml', size: 100 }];
  await ids['wallpaper-input'].fire('change');
  assert.match(ids['wallpaper-status'].textContent, /Pilih gambar/);
  assert.equal(storage.wallpaperImage, image);
  ids['wallpaper-input'].files = [{ type: 'image/jpeg', size: 11 * 1024 * 1024 }];
  await ids['wallpaper-input'].fire('change');
  assert.equal(storage.wallpaperImage, image);
});