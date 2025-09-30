require('dotenv').config();
const express = require('express');
const path = require('path');
const fetch = global.fetch || ((...a) => import('node-fetch').then(({default: f}) => f(...a)));

const app = express();
const PORT = process.env.PORT || 3000;
const WU_API_KEY = process.env.WU_API_KEY;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/wu/history', async (req, res) => {
  try {
    const stationId = (req.query.stationId || '').trim();
    const date = (req.query.date || '').trim(); // YYYYMMDD
    if (!WU_API_KEY) return res.status(500).json({ error: 'Falta WU_API_KEY en .env' });
    if (!stationId) return res.status(400).json({ error: 'Falta stationId' });
    if (!/^\d{8}$/.test(date)) return res.status(400).json({ error: 'date debe ser YYYYMMDD' });

    const url = new URL('https://api.weather.com/v2/pws/history/all');
    url.searchParams.set('stationId', stationId);
    url.searchParams.set('date', date);
    url.searchParams.set('format', 'json');
    url.searchParams.set('units', 'm');
    url.searchParams.set('numericPrecision', 'decimal');
    url.searchParams.set('apiKey', WU_API_KEY);

    const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!r.ok) {
      const text = await r.text();
      return res.status(r.status).json({ error: 'WU error', status: r.status, body: text });
    }
    const json = await r.json();
    return res.json(json);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Proxy error', detail: String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor en http://localhost:${PORT}`);
});
