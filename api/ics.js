const ICS_URL = 'https://calendar.google.com/calendar/ical/459c7aba9bb06fb9ebe829ce0ec57e20d9b01efd6b3e5c586a981f97f1707bb8%40group.calendar.google.com/public/basic.ics';

export default async function handler(req, res) {
  try {
    const upstream = await fetch(ICS_URL);
    if (!upstream.ok) {
      res.status(upstream.status).send(`Upstream HTTP ${upstream.status}`);
      return;
    }
    const text = await upstream.text();
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(text);
  } catch (err) {
    res.status(502).send(`Fetch failed: ${err.message}`);
  }
}