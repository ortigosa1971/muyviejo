/*
  app.js — Correcciones + parser con fallbacks
  - Hora Europe/Madrid (solo HH:mm)
  - Parser robusto para números (NA, --, unidades, comas)
*/

function fmt(n, digits = 0) {
  const v = Number(n);
  if (n === null || n === undefined || Number.isNaN(v)) {
    return (digits > 0 ? (0).toFixed(digits) : '0');
  }
  return v.toFixed(digits);
}

function toMadridTime(isoLike) {
  if (!isoLike) return '—';
  const d = new Date(isoLike);
  try {
    const formatted = new Intl.DateTimeFormat('es-ES', {
      timeZone: 'Europe/Madrid',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(d);
    const m = String(formatted).match(/(\d{1,2}):(\d{2})/);
    if (m) {
      const hh = m[1].padStart(2, '0');
      const mm = m[2];
      return `${hh}:${mm}`;
    }
  } catch {}
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function yyyymmddFromInput(value) {
  const m = value && value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? (m[1] + m[2] + m[3]) : null;
}

function parseWUResponse(raw) {
  const out = [];
  if (!raw) return out;
  const obs = Array.isArray(raw) ? raw : (raw.observations || []);

  const num = (v) => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v === 'string') {
      const s = v.trim();
      if (s === '' || s === '--' || s === '—' || s.toLowerCase() === 'na' || s.toLowerCase() === 'null') return null;
      const cleaned = s.replace(',', '.').replace(/[^0-9+\-\.eE]/g, '');
      const n = Number(cleaned);
      return Number.isFinite(n) ? n : null;
    }
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const pick = (...cands) => {
    for (const c of cands) {
      const n = num(c);
      if (n !== null) return n;
    }
    return null;
  };

  for (const o of obs) {
    const m = o.metric || o;
    const whenISO =
      o.obsTimeUtc || o.validTimeUtc ||
      o.obsTimeLocal || o.validTimeLocal ||
      o.dateTimeIso || o.dateTime || null;

    const temp = pick(m.temp, o.temp, m.tempAvg, o.tempAvg, m.temperature, o.temperature);
    const dew  = pick(m.dewPt, m.dewpoint, o.dewPt, o.dewpoint, m.dewPoint, o.dewPoint, m.dewpt, o.dewpt);
    const humidity = pick(m.humidity, o.humidity, m.humidityAvg, o.humidityAvg);
    const pres = pick(m.pressure, o.pressure, m.pressureAvg, o.pressureAvg, m.pressureMean);
    const wind = pick(m.windSpeed, o.windSpeed, m.windSpeedAvg, o.windSpeedAvg, m.windAvg, o.windAvg);
    const gust = pick(m.windGust, o.windGust, m.windGustMax, o.windGustMax, m.windHigh, o.windHigh);
    const dirDeg = pick(o.winddir, o.windDir, o.windDirection, m.winddir, m.windDirection);
    const precipRate = pick(m.precipRate, o.precipRate, m.precipRateMax, o.precipRateMax);
    const precipTotal = pick(
      m.precipTotal, o.precipTotal,
      m.precipAccum, o.precipAccum,
      m.precipRateSum, o.precipRateSum,
      m.precipTotalDaily, o.precipTotalDaily
    );
    const uv  = pick(m.uv, o.uv, m.uvHigh, o.uvHigh);
    const rad = pick(m.solarRadiation, o.solarRadiation, m.solarRadiationHigh, o.solarRadiationHigh);

    out.push({
      whenISO,
      whenMadrid: toMadridTime(whenISO),
      temp, dew, humidity, pres, wind, gust, dirDeg, precipRate, precipTotal, uv, rad
    });
  }
  return out;
}

function renderTable(rows) {
  const tbody = document.querySelector('#dataTable tbody');
  if (!tbody) return;
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td class="whitespace-nowrap">${r.whenMadrid}</td>
      <td class="text-right">${fmt(r.temp, 2)}</td>
      <td class="text-right">${fmt(r.dew, 2)}</td>
      <td class="text-right">${fmt(r.humidity, 0)}</td>
      <td class="text-right">${fmt(r.pres, 1)}</td>
      <td class="text-right">${fmt(r.wind, 1)}</td>
      <td class="text-right">${fmt(r.gust, 1)}</td>
      <td class="text-right">${fmt(r.dirDeg, 0)}</td>
      <td class="text-right">${fmt(r.precipRate, 2)}</td>
      <td class="text-right">${fmt(r.precipTotal, 2)}</td>
      <td class="text-right">${fmt(r.uv, 1)}</td>
      <td class="text-right">${fmt(r.rad, 0)}</td>
    </tr>`).join('');

  const countEl = document.getElementById('kpiCount');
  const minEl = document.getElementById('kpiMin');
  const maxEl = document.getElementById('kpiMax');
  if (countEl) countEl.textContent = String(rows.length || '—');
  const temps = rows.map(r => (typeof r.temp === 'number' ? r.temp : null)).filter(v => v !== null);
  if (temps.length) {
    if (minEl) minEl.textContent = fmt(Math.min(...temps), 2);
    if (maxEl) maxEl.textContent = fmt(Math.max(...temps), 2);
  } else {
    if (minEl) minEl.textContent = '—';
    if (maxEl) maxEl.textContent = '—';
  }
}

async function loadFromBackend(stationId, yyyymmdd) {
  const url = `/api/wu/history?stationId=${encodeURIComponent(stationId)}&date=${encodeURIComponent(yyyymmdd)}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function handleLoadClick() {
  const statusEl = document.getElementById('status');
  const station = (document.getElementById('stationId') || {}).value || '';
  const dateValue = (document.getElementById('date') || {}).value || '';
  const yyyymmdd = yyyymmddFromInput(dateValue);

  if (!station || !yyyymmdd) {
    if (statusEl) statusEl.textContent = 'Selecciona fecha primero.';
    return;
  }

  if (statusEl) statusEl.textContent = 'Cargando…';
  try {
    const json = await loadFromBackend(station, yyyymmdd);
    const rows = parseWUResponse(json);
    renderTable(rows);
    if (statusEl) statusEl.textContent = `Listo (${rows.length} registros)`;
  } catch (e) {
    console.error(e);
    if (statusEl) statusEl.textContent = 'Error al cargar';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('loadBtn');
  if (btn) btn.addEventListener('click', handleLoadClick);
});

window.__app_fixed__ = { fmt, toMadridTime, yyyymmddFromInput, parseWUResponse, renderTable, handleLoadClick };
