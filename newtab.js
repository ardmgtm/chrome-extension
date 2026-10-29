(() => {
  'use strict';

  const apps = [
    { name: 'Netflix', url: 'https://www.netflix.com/', theme: 'netflix', icon: 'netflix' },
    { name: 'Prime Video', url: 'https://www.primevideo.com/', theme: 'prime', icon: 'primevideo-white' },
    { name: 'YouTube', url: 'https://www.youtube.com/', theme: 'youtube', icon: 'youtube' },
    { name: 'Spotify', url: 'https://open.spotify.com/', theme: 'spotify', icon: 'spotify' },
    { name: 'Disney+', url: 'https://www.disneyplus.com/', theme: 'disney', icon: 'disneyplus' },
    { name: 'Google Drive', url: 'https://drive.google.com/', theme: 'drive', icon: 'googledrive' }
  ];

  const appGrid = document.getElementById('app-grid');
  const siteGrid = document.getElementById('site-grid');
  const locationInput = document.getElementById('location-input');
  const locationResults = document.getElementById('location-results');
  const locationStatus = document.getElementById('location-status');
  let savedCity = null;
  let weatherRequestId = 0;
  let cityRequestId = 0;
  let wallpaperRequestId = 0;
  let prayerRequestId = 0;
  let prayerSchedule = null;
  let prayerClockTimer = null;
  let weatherLastUpdated = null;
  let prayerLastUpdated = null;

  const prayerNames = { Fajr: 'Subuh', Dhuhr: 'Dzuhur', Asr: 'Asar', Maghrib: 'Maghrib', Isha: 'Isya' };
  const prayerOrder = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
  const WEATHER_CACHE_KEY = 'weatherCache';
  const PRAYER_CACHE_KEY = 'prayerCache';

  function formatLastUpdated(timestamp) {
    if (!Number.isFinite(timestamp)) return 'Belum ada data berhasil dimuat.';
    return `Terakhir diperbarui: ${new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'medium', timeStyle: 'short'
    }).format(new Date(timestamp))}`;
  }

  function showLastUpdated(widget, timestamp) {
    const text = formatLastUpdated(timestamp);
    document.getElementById(`${widget}-last-updated`).textContent = text;
    document.getElementById(`${widget}-last-updated`).setAttribute('aria-label', text);
  }

  function cityCacheKey(city) {
    return `${city.latitude.toFixed(4)},${city.longitude.toFixed(4)}`;
  }

  function readCachedWidget(key, city, isValid, apply) {
    chrome.storage.local.get(key, (items) => {
      if (chrome.runtime.lastError || !cityIsValid(city) || !isValid(items[key], city)) return;
      apply(items[key]);
    });
  }

  function validWallpaper(data) {
    return typeof data === 'string' && data.length <= 1_500_000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(data);
  }

  function showWallpaper(data) {
    const preview = document.getElementById('wallpaper-preview');
    const image = document.getElementById('wallpaper-preview-image');
    if (validWallpaper(data)) {
      document.body.classList.add('wallpaper-active');
      document.body.style.setProperty('--wallpaper-image', `url("${data}")`);
      image.src = data;
      preview.hidden = false;
      document.getElementById('wallpaper-status').textContent = 'Wallpaper aktif.';
    } else {
      document.body.classList.remove('wallpaper-active');
      document.body.style.removeProperty('--wallpaper-image');
      image.removeAttribute('src');
      preview.hidden = true;
      document.getElementById('wallpaper-status').textContent = 'Menggunakan latar bawaan.';
    }
  }

  function loadWallpaper() {
    const request = wallpaperRequestId;
    chrome.storage.local.get('wallpaperImage', (items) => {
      if (request !== wallpaperRequestId || chrome.runtime.lastError) return;
      showWallpaper(items.wallpaperImage);
    });
  }

  async function uploadWallpaper(event) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    const status = document.getElementById('wallpaper-status');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
      status.textContent = 'Pilih gambar JPG, PNG, atau WebP berukuran maksimal 10 MB.';
      input.value = '';
      return;
    }
    const request = ++wallpaperRequestId;
    status.textContent = 'Memproses gambar...';
    input.disabled = true;
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
      if (request !== wallpaperRequestId) return;
      if (!bitmap.width || !bitmap.height) throw new Error('Invalid image');
      const scale = Math.min(1, 1600 / bitmap.width, 900 / bitmap.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas unavailable');
      context.fillStyle = '#170c12';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL('image/jpeg', 0.78);
      if (!validWallpaper(data)) throw new Error('Image too large');
      chrome.storage.local.set({ wallpaperImage: data }, () => {
        if (request !== wallpaperRequestId) return;
        if (chrome.runtime.lastError) {
          status.textContent = 'Gambar gagal disimpan. Coba gambar lain.';
        } else {
          showWallpaper(data);
        }
        input.disabled = false;
      });
    } catch {
      if (request === wallpaperRequestId) {
        status.textContent = 'Gambar tidak bisa diproses atau terlalu besar. Coba gambar lain.';
        input.disabled = false;
      }
    } finally {
      bitmap?.close();
      input.value = '';
    }
  }

  function clearWallpaper() {
    const request = ++wallpaperRequestId;
    const input = document.getElementById('wallpaper-input');
    input.disabled = false;
    chrome.storage.local.remove('wallpaperImage', () => {
      if (request !== wallpaperRequestId) return;
      if (chrome.runtime.lastError) {
        document.getElementById('wallpaper-status').textContent = 'Wallpaper gagal dihapus. Coba lagi.';
        return;
      }
      showWallpaper(null);
    });
  }

  function cityIsValid(city) {
    return city && typeof city.name === 'string' && city.name.length > 0 &&
      Number.isFinite(city.latitude) && Math.abs(city.latitude) <= 90 &&
      Number.isFinite(city.longitude) && Math.abs(city.longitude) <= 180;
  }

  function cityLabel(city) {
    return [city.name, city.admin1 && city.admin1 !== city.name ? city.admin1 : null, city.country].filter(Boolean).join(', ');
  }

  function showView() {
    const settings = location.hash === '#settings';
    const updateView = () => {
      document.getElementById('home-view').hidden = settings;
      document.getElementById('settings-view').hidden = !settings;
      document.getElementById('home-trigger').setAttribute('aria-current', settings ? 'false' : 'page');
      document.getElementById('settings-trigger').setAttribute('aria-current', settings ? 'page' : 'false');
    };
    if (document.startViewTransition) document.startViewTransition(updateView);
    else updateView();
    if (settings) locationInput.focus();
  }

  function showSavedCity() {
    const panel = document.getElementById('current-location');
    panel.hidden = !savedCity;
    document.getElementById('saved-location').textContent = savedCity ? cityLabel(savedCity) : '';
    document.getElementById('weather-city').textContent = savedCity ? savedCity.name.toLocaleUpperCase('id-ID') : 'PILIH LOKASI';
    document.getElementById('prayer-location').textContent = savedCity ? savedCity.name : 'Pilih lokasi';
  }

  function weatherCacheIsValid(cache, city) {
    return cache?.locationKey === cityCacheKey(city) && Number.isFinite(cache.updatedAt) &&
      Number.isFinite(cache.temperature) && Number.isFinite(cache.code) &&
      Number.isFinite(cache.high) && Number.isFinite(cache.low);
  }

  function applyWeatherData(data, isCached = false) {
    const [condition, symbol] = weatherDescription(data.code);
    document.getElementById('weather-symbol').textContent = symbol;
    document.getElementById('weather-temperature').textContent = `${Math.round(data.temperature)}°`;
    document.getElementById('weather-condition').textContent = condition;
    document.getElementById('weather-high').textContent = `${Math.round(data.high)}°`;
    document.getElementById('weather-low').textContent = `${Math.round(data.low)}°`;
    document.getElementById('weather-updated').textContent = isCached ? 'Tersimpan · Open-Meteo' : 'Sumber: Open-Meteo';
    document.getElementById('weather-details').hidden = false;
    showLastUpdated('weather', weatherLastUpdated);
  }

  function saveWeatherCache(data) {
    chrome.storage.local.set({ [WEATHER_CACHE_KEY]: data }, () => {});
  }

  function restoreWeatherCache(city) {
    if (!cityIsValid(city)) return;
    readCachedWidget(WEATHER_CACHE_KEY, city, weatherCacheIsValid, (cache) => {
      if (savedCity && cityCacheKey(savedCity) === cache.locationKey) {
        weatherLastUpdated = cache.updatedAt;
        applyWeatherData(cache, true);
      }
    });
  }

  function clearPrayerHighlight() {
    document.querySelectorAll('.prayer-row').forEach((row) => row.classList.remove('is-current'));
  }

  function resetPrayerWidget(message) {
    prayerSchedule = null;
    clearPrayerHighlight();
    document.getElementById('prayer-status').textContent = message;
    document.getElementById('prayer-countdown-label').textContent = 'Sholat berikutnya';
    document.getElementById('prayer-countdown-value').textContent = '--:--:--';
    document.querySelectorAll('.prayer-row time').forEach((time) => { time.textContent = '--:--'; });
  }

  function parsePrayerTime(value) {
    const match = typeof value === 'string' && value.match(/^(\d{1,2}):(\d{2})/);
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    return hour <= 23 && minute <= 59 ? hour * 60 + minute : null;
  }

  function localDateParts(date, timeZone) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date);
    return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  }

  function dateKey(parts) {
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  function shiftDateKey(key, offset) {
    const [year, month, day] = key.split('-').map(Number);
    const shifted = new Date(Date.UTC(year, month - 1, day + offset));
    return dateKey({ year: shifted.getUTCFullYear(), month: String(shifted.getUTCMonth() + 1).padStart(2, '0'), day: String(shifted.getUTCDate()).padStart(2, '0') });
  }

  function dateForOffset(date, timeZone, offset) {
    const parts = localDateParts(date, timeZone);
    const utcDate = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + offset));
    return `${utcDate.getUTCDate().toString().padStart(2, '0')}-${(utcDate.getUTCMonth() + 1).toString().padStart(2, '0')}-${utcDate.getUTCFullYear()}`;
  }

  function dateStringForKey(key) {
    const [year, month, day] = key.split('-');
    return `${day}-${month}-${year}`;
  }

  function zonedDateTime(dateKeyValue, minutes, timeZone) {
    const [year, month, day] = dateKeyValue.split('-').map(Number);
    const targetHour = Math.floor(minutes / 60);
    const targetMinute = minutes % 60;
    const utcGuess = Date.UTC(year, month - 1, day, targetHour, targetMinute);
    const represented = new Intl.DateTimeFormat('en-GB', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date(utcGuess));
    const values = Object.fromEntries(represented.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
    const representedUtc = Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute);
    return new Date(utcGuess + utcGuess - representedUtc);
  }

  function buildPrayerSchedule(timingsByDate, timeZone) {
    const schedule = [];
    for (const [key, timings] of timingsByDate) {
      const entries = {};
      for (const prayer of prayerOrder) {
        const minutes = parsePrayerTime(timings?.[prayer]);
        if (minutes === null) throw new Error(`Waktu ${prayerNames[prayer]} tidak tersedia`);
        entries[prayer] = zonedDateTime(key, minutes, timeZone);
      }
      const sunriseMinutes = parsePrayerTime(timings?.Sunrise);
      if (sunriseMinutes === null) throw new Error('Waktu matahari terbit tidak tersedia');
      schedule.push({ key, timings, entries, sunrise: zonedDateTime(key, sunriseMinutes, timeZone), timeZone });
    }
    return schedule.sort((left, right) => left.entries.Fajr - right.entries.Fajr);
  }

  function prayerCacheIsValid(cache, city) {
    return cache?.locationKey === cityCacheKey(city) && typeof cache.timeZone === 'string' &&
      typeof cache.baseDate === 'string' && Number.isFinite(cache.updatedAt) &&
      cache.timingsByDate && typeof cache.timingsByDate === 'object' &&
      [-1, 0, 1].every((offset) => {
        const timings = cache.timingsByDate[shiftDateKey(cache.baseDate, offset)];
        return prayerOrder.every((prayer) => parsePrayerTime(timings?.[prayer]) !== null) && parsePrayerTime(timings?.Sunrise) !== null;
      });
  }

  function applyPrayerCache(cache) {
    const timingsByDate = new Map(Object.entries(cache.timingsByDate));
    const schedule = buildPrayerSchedule(timingsByDate, cache.timeZone);
    prayerSchedule = schedule;
    const todayKey = dateKey(localDateParts(new Date(), cache.timeZone));
    const todayTimings = cache.timingsByDate[todayKey];
    if (!todayTimings) return false;
    for (const prayer of prayerOrder) {
      document.querySelector(`.prayer-row[data-prayer="${prayer}"]`).querySelector('time').textContent = todayTimings[prayer].match(/^\d{1,2}:\d{2}/)[0].padStart(5, '0');
    }
    prayerLastUpdated = cache.updatedAt;
    document.getElementById('prayer-status').textContent = `Metode Kemenag | ${cache.timeZone} | Tersimpan`;
    showLastUpdated('prayer', prayerLastUpdated);
    updatePrayerClock();
    return true;
  }

  function restorePrayerCache(city) {
    if (!cityIsValid(city)) return;
    readCachedWidget(PRAYER_CACHE_KEY, city, prayerCacheIsValid, (cache) => {
      if (!savedCity || cityCacheKey(savedCity) !== cache.locationKey) return;
      try {
        if (applyPrayerCache(cache) && prayerClockTimer === null) prayerClockTimer = window.setInterval(updatePrayerClock, 1000);
      } catch {
        prayerSchedule = null;
      }
    });
  }

  function savePrayerCache(cache) {
    chrome.storage.local.set({ [PRAYER_CACHE_KEY]: cache }, () => {});
  }

  function updatePrayerClock(now = new Date()) {
    if (!prayerSchedule?.length) return;
    const todayKey = dateKey(localDateParts(now, prayerSchedule[0].timeZone));
    const today = prayerSchedule.find((day) => day.key === todayKey);
    if (!today) return;
    const allPrayers = prayerSchedule.flatMap((day) => prayerOrder
      .map((prayer) => ({ prayer, at: day.entries[prayer], dayKey: day.key })));
    const upcoming = allPrayers
      .filter((prayer) => prayer.at > now)
      .sort((left, right) => left.at - right.at)[0];
    if (!upcoming) {
      document.getElementById('prayer-countdown-label').textContent = 'Sholat berikutnya';
      document.getElementById('prayer-countdown-value').textContent = '--:--:--';
      clearPrayerHighlight();
      return;
    }

    document.getElementById('prayer-countdown-label').textContent = `Menuju ${prayerNames[upcoming.prayer]}`;
    const secondsLeft = Math.max(0, Math.floor((upcoming.at.getTime() - now.getTime()) / 1000));
    const hours = Math.floor(secondsLeft / 3600).toString().padStart(2, '0');
    const minutes = Math.floor((secondsLeft % 3600) / 60).toString().padStart(2, '0');
    const seconds = (secondsLeft % 60).toString().padStart(2, '0');
    document.getElementById('prayer-countdown-value').textContent = `${hours}:${minutes}:${seconds}`;

    let current = null;
    const upcomingIndex = prayerOrder.indexOf(upcoming.prayer);
    const previousPrayer = prayerOrder[(upcomingIndex + prayerOrder.length - 1) % prayerOrder.length];
    const previousDayKey = previousPrayer === 'Isha' ? shiftDateKey(upcoming.dayKey, -1) : upcoming.dayKey;
    const previousDay = prayerSchedule.find((day) => day.key === previousDayKey) || (previousDayKey === todayKey ? today : null);
    if (previousDay) {
      const previousTime = previousDay.entries[previousPrayer];
      const isFajrWindow = previousPrayer === 'Fajr';
      const windowEnd = isFajrWindow ? previousDay.sunrise : upcoming.at;
      if (previousTime <= now && now < windowEnd) current = previousPrayer;
    }
    clearPrayerHighlight();
    if (current) {
      document.querySelector(`.prayer-row[data-prayer="${current}"]`)?.classList.add('is-current');
    }
  }

  async function refreshPrayerTimes() {
    const activeRequest = ++prayerRequestId;
    if (prayerClockTimer !== null) window.clearInterval(prayerClockTimer);
    prayerClockTimer = null;
    if (!savedCity) {
      resetPrayerWidget('Atur lokasi di Pengaturan untuk melihat waktu Sholat.');
      return;
    }

    const hadSchedule = Boolean(prayerSchedule);
    if (!hadSchedule) document.getElementById('prayer-status').textContent = 'Memuat jadwal waktu Sholat...';
    try {
      const requestDate = new Date();
      const timeZone = savedCity.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      const requestDateString = dateForOffset(requestDate, timeZone, 0);
      const responseToday = await fetchPrayerDay(savedCity, requestDateString);
      if (!responseToday.ok) throw new Error('Prayer service unavailable');
      const dataToday = await responseToday.json();
      if (activeRequest !== prayerRequestId) return;
      const todayData = dataToday?.data;
      const apiTimeZone = todayData?.meta?.timezone;
      if (dataToday?.code !== 200 || !todayData?.timings || typeof apiTimeZone !== 'string' || todayData.meta.method?.id !== 20) throw new Error('Incomplete prayer data');

      const todayParts = localDateParts(requestDate, timeZone);
      const todayKey = dateKey(todayParts);
      const timingsByDate = new Map([[todayKey, todayData.timings]]);
      const adjacentDates = [-1, 1].map((offset) => shiftDateKey(todayKey, offset));
      const adjacentResults = await Promise.all(adjacentDates.map(async (key) => {
        try {
          const response = await fetchPrayerDay(savedCity, dateStringForKey(key));
          if (!response.ok) return null;
          const result = await response.json();
          return result?.code === 200 && result?.data?.timings ? { key, timings: result.data.timings } : null;
        } catch {
          return null;
        }
      }));
      if (activeRequest !== prayerRequestId) return;
      adjacentResults.filter(Boolean).forEach(({ key, timings }) => timingsByDate.set(key, timings));
      const schedule = buildPrayerSchedule(timingsByDate, timeZone);
      if (activeRequest !== prayerRequestId) return;
      const updatedAt = Date.now();
      const prayerCache = {
        locationKey: cityCacheKey(savedCity),
        timeZone,
        baseDate: todayKey,
        timingsByDate: Object.fromEntries(timingsByDate),
        updatedAt
      };
      await new Promise((resolve, reject) => {
        chrome.storage.local.set({ [PRAYER_CACHE_KEY]: prayerCache }, () => {
          if (chrome.runtime.lastError) reject(new Error('Prayer cache could not be saved'));
          else resolve();
        });
      });
      if (activeRequest !== prayerRequestId || !savedCity || cityCacheKey(savedCity) !== prayerCache.locationKey) return;
      prayerSchedule = schedule;
      for (const prayer of prayerOrder) {
        const row = document.querySelector(`.prayer-row[data-prayer="${prayer}"]`);
        row.querySelector('time').textContent = todayData.timings[prayer].match(/^\d{1,2}:\d{2}/)[0].padStart(5, '0');
      }
      document.getElementById('prayer-status').textContent = `Metode Kemenag | ${apiTimeZone}`;
      prayerLastUpdated = updatedAt;
      showLastUpdated('prayer', prayerLastUpdated);
      updatePrayerClock();
      prayerClockTimer = window.setInterval(updatePrayerClock, 1000);
    } catch (error) {
      if (activeRequest !== prayerRequestId) return;
      const hasCachedSchedule = Boolean(prayerSchedule);
      if (!hasCachedSchedule) resetPrayerWidget(`Jadwal Sholat tidak tersedia (${error.message}). Periksa koneksi lalu coba lagi.`);
      const status = document.getElementById('prayer-status');
      if (hasCachedSchedule) {
        status.textContent = `Offline · jadwal tersimpan (${prayerSchedule[0].timeZone})`;
      } else {
        status.replaceChildren();
        status.textContent = 'Jadwal Sholat tidak tersedia. ';
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'prayer-retry';
        retry.textContent = 'Coba lagi';
        retry.addEventListener('click', refreshPrayerTimes);
        status.append(retry);
      }
    }
  }

  function fetchPrayerDay(city, date) {
    const params = new URLSearchParams({
      latitude: String(city.latitude), longitude: String(city.longitude), method: '20'
    });
    return fetch(`https://api.aladhan.com/v1/timings/${date}?${params}`);
  }

  function weatherDescription(code) {
    if (code === 0) return ['Cerah', '☀'];
    if (code <= 3) return ['Berawan sebagian', '⛅'];
    if (code <= 48) return ['Berkabut', '☁'];
    if (code <= 57) return ['Gerimis', '☂'];
    if (code <= 67) return ['Hujan', '☂'];
    if (code <= 77) return ['Salju', '❄'];
    if (code <= 82) return ['Hujan deras', '☂'];
    if (code <= 86) return ['Salju', '❄'];
    if (code <= 99) return ['Badai petir', '⚡'];
    return ['Cuaca tidak diketahui', '☁'];
  }

  async function refreshWeather() {
    const activeRequest = ++weatherRequestId;
    const message = document.getElementById('weather-message');
    const details = document.getElementById('weather-details');
    message.replaceChildren();

    if (!savedCity) {
      details.hidden = true;
      document.getElementById('weather-symbol').textContent = '◌';
      document.getElementById('weather-temperature').textContent = '--°';
      document.getElementById('weather-condition').textContent = 'Atur kota untuk melihat cuaca';
      const link = document.createElement('a');
      link.href = '#settings';
      link.textContent = 'Pilih lokasi di Pengaturan →';
      message.append(link);
      return;
    }

    const hasCachedWeather = !details.hidden;
    if (hasCachedWeather) {
      document.getElementById('weather-updated').textContent = 'Memperbarui · data tersimpan';
    } else {
      document.getElementById('weather-condition').textContent = 'Memuat cuaca...';
    }

    const params = new URLSearchParams({
      latitude: String(savedCity.latitude), longitude: String(savedCity.longitude),
      current: 'temperature_2m,weather_code', daily: 'temperature_2m_max,temperature_2m_min',
      timezone: 'auto', forecast_days: '1'
    });
    try {
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
      if (!response.ok) throw new Error('Weather service unavailable');
      const data = await response.json();
      if (activeRequest !== weatherRequestId) return;

      const temperature = data.current?.temperature_2m;
      const code = data.current?.weather_code;
      const high = data.daily?.temperature_2m_max?.[0];
      const low = data.daily?.temperature_2m_min?.[0];
      if (![temperature, code, high, low].every(Number.isFinite)) throw new Error('Incomplete weather data');

      const cache = { locationKey: cityCacheKey(savedCity), temperature, code, high, low, updatedAt: Date.now() };
      await new Promise((resolve, reject) => {
        chrome.storage.local.set({ [WEATHER_CACHE_KEY]: cache }, () => {
          if (chrome.runtime.lastError) reject(new Error('Weather cache could not be saved'));
          else resolve();
        });
      });
      if (activeRequest !== weatherRequestId || !savedCity || cityCacheKey(savedCity) !== cache.locationKey) return;
      weatherLastUpdated = cache.updatedAt;
      applyWeatherData(cache);
      document.getElementById('weather-updated').textContent = 'Sumber: Open-Meteo';
    } catch {
      if (activeRequest !== weatherRequestId) return;
      if (hasCachedWeather) {
        document.getElementById('weather-updated').textContent = 'Offline · data tersimpan';
      } else {
        document.getElementById('weather-condition').textContent = 'Cuaca tidak tersedia';
      }
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.textContent = 'Coba lagi';
      retry.addEventListener('click', refreshWeather);
      message.append(retry);
    }
  }

  function saveCity(city) {
    if (!cityIsValid(city)) return;
    ++cityRequestId;
      const selection = {
      name: city.name, admin1: city.admin1 || '', country: city.country || '',
      latitude: city.latitude, longitude: city.longitude,
      ...(typeof city.timezone === 'string' ? { timezone: city.timezone } : {})
      };
    chrome.storage.local.set({ weatherCity: selection }, () => {
      if (chrome.runtime.lastError) {
        locationStatus.textContent = 'Lokasi gagal disimpan. Coba lagi.';
        return;
      }
      savedCity = selection;
      showSavedCity();
      locationStatus.textContent = `Lokasi disimpan: ${cityLabel(selection)}`;
      locationResults.replaceChildren();
      location.hash = '#home';
      refreshWeather();
      refreshPrayerTimes();
    });
  }

  async function searchCity(event) {
    event.preventDefault();
    const query = locationInput.value.trim();
    if (query.length < 2) {
      locationStatus.textContent = 'Masukkan setidaknya dua huruf nama kota.';
      return;
    }
    const activeRequest = ++cityRequestId;
    locationStatus.textContent = 'Mencari kota...';
    locationResults.replaceChildren();
    document.getElementById('location-search').disabled = true;
    try {
      const params = new URLSearchParams({ name: query, count: '6', language: 'id', format: 'json' });
      const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
      if (!response.ok) throw new Error('Geocoding service unavailable');
      const data = await response.json();
      if (activeRequest !== cityRequestId) return;
      const cities = Array.isArray(data.results) ? data.results.filter(cityIsValid) : [];
      locationStatus.textContent = cities.length ? 'Pilih kota yang sesuai:' : 'Kota tidak ditemukan. Coba nama lain.';
      const fragment = document.createDocumentFragment();
      cities.forEach((city) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'location-result';
        button.textContent = cityLabel(city);
        button.addEventListener('click', () => saveCity(city));
        fragment.append(button);
      });
      locationResults.replaceChildren(fragment);
    } catch {
      if (activeRequest === cityRequestId) locationStatus.textContent = 'Pencarian lokasi gagal. Periksa koneksi dan coba lagi.';
    } finally {
      if (activeRequest === cityRequestId) document.getElementById('location-search').disabled = false;
    }
  }

  function loadSavedCity() {
    chrome.storage.local.get('weatherCity', (items) => {
      if (!chrome.runtime.lastError && cityIsValid(items.weatherCity)) savedCity = items.weatherCity;
      showSavedCity();
      if (savedCity) {
        restoreWeatherCache(savedCity);
        restorePrayerCache(savedCity);
      }
      refreshWeather();
      refreshPrayerTimes();
    });
  }

  function faviconUrl(url, size = 64) {
    if (!globalThis.chrome?.runtime?.getURL) return '';
    const favicon = new URL(chrome.runtime.getURL('/_favicon/'));
    favicon.searchParams.set('pageUrl', url);
    favicon.searchParams.set('size', String(size));
    return favicon.toString();
  }

  function addImageFallback(image, fallback, display = 'inline') {
    image.addEventListener('error', () => {
      image.hidden = true;
      fallback.style.display = display;
    }, { once: true });
  }

  function fallbackSiteColor(url) {
    const host = hostnameLabel(url).toLowerCase();
    let hash = 0;
    for (let index = 0; index < host.length; index += 1) hash = ((hash << 5) - hash + host.charCodeAt(index)) | 0;
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue} 58% 46%)`;
  }

  function applyFaviconColor(image, card, url) {
    card.style.setProperty('--site-accent', fallbackSiteColor(url));
    image.addEventListener('load', () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 20;
        canvas.height = 20;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) return;
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let red = 0;
        let green = 0;
        let blue = 0;
        let count = 0;
        for (let index = 0; index < pixels.length; index += 4) {
          const alpha = pixels[index + 3];
          const r = pixels[index];
          const g = pixels[index + 1];
          const b = pixels[index + 2];
          const brightness = (r + g + b) / 3;
          const saturation = Math.max(r, g, b) - Math.min(r, g, b);
          if (alpha < 96 || brightness < 35 || brightness > 244 || saturation < 18) continue;
          red += r;
          green += g;
          blue += b;
          count += 1;
        }
        if (count) card.style.setProperty('--site-accent', `rgb(${Math.round(red / count)} ${Math.round(green / count)} ${Math.round(blue / count)})`);
      } catch {
        // Favicon pixel access can be blocked by browser origin isolation; keep the deterministic color.
      }
    }, { once: true });
  }

  function renderApps() {
    const fragment = document.createDocumentFragment();
    apps.forEach((app) => {
      const item = document.createElement('div');
      item.className = 'app-item';
      const link = document.createElement('a');
      link.className = `app-card ${app.theme}`;
      link.href = app.url;
      link.setAttribute('aria-label', `Buka ${app.name}`);
      const icon = document.createElement('img');
      icon.className = 'app-icon';
      icon.src = app.icon ? `assets/brands/${app.icon}.png` : faviconUrl(app.url, 128);
      icon.alt = '';
      icon.setAttribute('aria-hidden', 'true');
      const logo = document.createElement('span');
      logo.className = 'app-logo-fallback';
      logo.textContent = app.name.slice(0, 1);
      addImageFallback(icon, logo, 'grid');
      const visual = document.createElement('span');
      visual.className = 'app-visual';
      visual.append(icon, logo);
      const label = document.createElement('span');
      label.className = 'app-label';
      label.textContent = app.name;
      link.append(visual);
      item.append(link, label);
      fragment.append(item);
    });
    appGrid.replaceChildren(fragment);
  }

  function hostnameLabel(url) {
    try {
      return new URL(url).hostname.replace(/^www\./i, '');
    } catch {
      return url;
    }
  }

  function renderSites(sites) {
    const usableSites = sites.filter((site) => site && site.url && /^https?:\/\//i.test(site.url));
    if (usableSites.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      const icon = document.createElement('span');
      icon.className = 'empty-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '⌕';
      const message = document.createElement('span');
      message.textContent = 'Situs yang sering Anda kunjungi akan muncul di sini setelah browser memiliki cukup riwayat penjelajahan.';
      empty.append(icon, message);
      siteGrid.replaceChildren(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    usableSites.slice(0, 8).forEach((site) => {
      const label = site.title && site.title.trim() ? site.title.trim() : hostnameLabel(site.url);
      const item = document.createElement('div');
      item.className = 'site-item';
      const link = document.createElement('a');
      link.className = 'site-card';
      link.href = site.url;
      link.title = site.url;
      link.setAttribute('aria-label', `Buka ${label}`);

      const iconWrap = document.createElement('span');
      iconWrap.className = 'site-icon-wrap';
      const image = document.createElement('img');
      image.className = 'site-icon';
      image.src = faviconUrl(site.url, 48);
      image.alt = '';
      image.loading = 'lazy';
      const fallback = document.createElement('span');
      fallback.className = 'site-fallback';
      fallback.textContent = label.slice(0, 1);
      addImageFallback(image, fallback);
      if (!image.src) {
        image.hidden = true;
        fallback.style.display = 'inline';
      }
      applyFaviconColor(image, link, site.url);
      iconWrap.append(image, fallback);
      const visual = document.createElement('span');
      visual.className = 'site-visual';
      visual.append(iconWrap);

      const copy = document.createElement('span');
      copy.className = 'site-copy';
      const name = document.createElement('span');
      name.className = 'site-name';
      name.textContent = label;
      const url = document.createElement('span');
      url.className = 'site-url';
      url.textContent = hostnameLabel(site.url);
      copy.append(name, url);
      link.append(visual);
      item.append(link, copy);
      fragment.append(item);
    });
    siteGrid.replaceChildren(fragment);
  }

  function updateClock() {
    const now = new Date();
    document.getElementById('clock').textContent = new Intl.DateTimeFormat('id-ID', {
      hour: '2-digit', minute: '2-digit', hour12: false
    }).format(now);
    document.getElementById('date').textContent = new Intl.DateTimeFormat('id-ID', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    }).format(now);
    const hour = now.getHours();
    const greeting = hour < 11 ? 'SELAMAT PAGI' : hour < 15 ? 'SELAMAT SIANG' : hour < 18 ? 'SELAMAT SORE' : 'SELAMAT MALAM';
    document.getElementById('greeting').textContent = greeting;
  }

  function loadTopSites() {
    if (!globalThis.chrome?.topSites?.get) {
      renderSites([]);
      return;
    }
    chrome.topSites.get((sites) => {
      if (chrome.runtime.lastError) {
        renderSites([]);
        return;
      }
      renderSites(sites || []);
    });
  }

  document.getElementById('search-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const query = document.getElementById('search-input').value.trim();
    if (query) location.href = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  });

  document.getElementById('location-form').addEventListener('submit', searchCity);
  document.getElementById('wallpaper-input').addEventListener('change', uploadWallpaper);
  document.getElementById('clear-wallpaper').addEventListener('click', clearWallpaper);
  document.getElementById('clear-location').addEventListener('click', () => {
    ++weatherRequestId;
    ++cityRequestId;
    document.getElementById('location-search').disabled = false;
    locationResults.replaceChildren();
    chrome.storage.local.remove('weatherCity', () => {
      if (chrome.runtime.lastError) {
        locationStatus.textContent = 'Lokasi gagal dihapus. Coba lagi.';
        return;
      }
      savedCity = null;
      showSavedCity();
      refreshWeather();
      ++prayerRequestId;
      if (prayerClockTimer !== null) window.clearInterval(prayerClockTimer);
      prayerClockTimer = null;
      resetPrayerWidget('Atur lokasi di Pengaturan untuk melihat waktu Sholat.');
      locationStatus.textContent = 'Lokasi dihapus.';
    });
  });
  window.addEventListener('hashchange', showView);

  document.addEventListener('keydown', (event) => {
    const target = event.target;
    const typing = target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
    if (!typing && event.key === '/' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      event.preventDefault();
      document.getElementById('search-input').focus();
      return;
    }
    if (!typing && ['ArrowLeft', 'ArrowRight'].includes(event.key) && target?.closest) {
      const track = target.closest('.shelf-track');
      if (!track) return;
      const cards = Array.from(track.querySelectorAll('a'));
      const next = cards[cards.indexOf(target) + (event.key === 'ArrowRight' ? 1 : -1)];
      if (next) {
        event.preventDefault();
        next.focus();
        next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    }
  });

  renderApps();
  showView();
  loadSavedCity();
  loadWallpaper();
  updateClock();
  window.setInterval(updateClock, 30_000);
  window.setInterval(() => { if (savedCity) refreshWeather(); }, 30 * 60_000);
  window.setInterval(() => { if (savedCity) refreshPrayerTimes(); }, 30 * 60_000);
  loadTopSites();
})();