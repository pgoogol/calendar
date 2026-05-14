import { createHash } from 'crypto';

const ICS_URL = 'https://calendar.google.com/calendar/ical/459c7aba9bb06fb9ebe829ce0ec57e20d9b01efd6b3e5c586a981f97f1707bb8%40group.calendar.google.com/public/basic.ics';
const CACHE_TTL = 2 * 60 * 1000;

let cache = { text: null, etag: null, fetchedAt: 0 };

export default async function handler(req, res) {
  try {
    if (!cache.text || (Date.now() - cache.fetchedAt) > CACHE_TTL) {
      const upstream = await fetch(ICS_URL);
      if (!upstream.ok) {
        res.status(upstream.status).send(`Upstream HTTP ${upstream.status}`);
        return;
      }
      const text = await upstream.text();
      const etag = '"' + createHash('md5').update(text).digest('hex') + '"';
      cache = { text, etag, fetchedAt: Date.now() };
    }

    const clientEtag = req.headers['if-none-match'];
    if (clientEtag && clientEtag === cache.etag) {
      res.status(304).end();
      return;
    }

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('ETag', cache.etag);
    res.setHeader('Cache-Control', 'no-cache');
    res.status(200).send(cache.text);
  } catch (err) {
    res.status(502).send(`Fetch failed: ${err.message}`);
  }
}
