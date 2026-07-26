// ════════════════════════════════════════════════
// CONFIG
// ════════════════════════════════════════════════
const ICS_FEED = 'https://calendar.google.com/calendar/ical/459c7aba9bb06fb9ebe829ce0ec57e20d9b01efd6b3e5c586a981f97f1707bb8%40group.calendar.google.com/public/basic.ics';
const ICS_PROXY = '/api/ics';
const TZ_DISPLAY = 'Europe/Warsaw';

// Google Form for submitting events. Replace these with your form URLs after creating it
// (see apps-script/Code.gs for setup instructions).
//   FORM_URL       — public share link from "Send" → "Link" tab (used as fallback when iframe is blocked)
//   FORM_EMBED_URL — `src` attribute from "Send" → "<>" (Embed) tab; ends with `?embedded=true`
const FORM_URL       = 'https://forms.gle/iSA5wcozKqmcD5Ad6';
const FORM_EMBED_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSe5CHOQV2CyM7GCbEqlV-jFASByplZKIX1JdN6al5jkG1avUw/viewform?embedded=true';

function escapeHTML(str) {
  return (str || '').replace(/[&<>"']/g, ch =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

function normalisePL(str) {
  return (str || '').toLowerCase()
    .replace(/ą/g,'a').replace(/ć/g,'c').replace(/ę/g,'e')
    .replace(/ł/g,'l').replace(/ń/g,'n').replace(/ó/g,'o')
    .replace(/ś/g,'s').replace(/ź/g,'z').replace(/ż/g,'z');
}

function parseIcs(text) {
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const events   = [];
  const blocks   = unfolded.split(/BEGIN:VEVENT/i).slice(1);
  for (const block of blocks) {
    const get = (key) => {
      const re = new RegExp(`^${key}(?:;[^:]+)?:(.+)$`, 'im');
      const m  = block.match(re);
      return m ? m[1].trim() : '';
    };
    const rawStart = get('DTSTART');
    const rawEnd   = get('DTEND');
    if (!rawStart) continue;
    const valPart = rawStart.includes(':') ? rawStart.split(':').pop() : rawStart;
    const allDay  = !/T/.test(valPart);
    const start = parseIcsDate(rawStart, allDay);
    const end   = rawEnd ? parseIcsDate(rawEnd, allDay) : null;
    if (!start || isNaN(start.getTime())) continue;
    events.push({
      uid:      get('UID'),
      summary:  unescapeIcs(get('SUMMARY')),
      location: unescapeIcs(get('LOCATION')),
      desc:     unescapeIcs(get('DESCRIPTION')),
      start, end, allDay,
    });
  }
  return events;
}

function unescapeIcs(s) {
  return (s || '').replace(/\\,/g,',').replace(/\\;/g,';')
                  .replace(/\\n/g,'\n').replace(/\\\\/g,'\\').trim();
}

function warsawOffsetH(year, month0, day) {
  if (month0 > 2 && month0 < 9) return 2;
  if (month0 < 2 || month0 > 9) return 1;
  const lastSun = (() => {
    const last = new Date(Date.UTC(year, month0 + 1, 0));
    return last.getUTCDate() - last.getUTCDay();
  })();
  if (month0 === 2) return day >= lastSun ? 2 : 1;
  if (month0 === 9) return day <  lastSun ? 2 : 1;
  return 1;
}

function parseIcsDate(raw, allDay) {
  const val = raw.includes(':') ? raw.split(':').pop() : raw;
  const v   = val.replace(/[^0-9TZ]/g,'');
  if (allDay || /^\d{8}$/.test(v)) {
    return new Date(Date.UTC(+v.slice(0,4), +v.slice(4,6)-1, +v.slice(6,8)));
  }
  const y  = +v.slice(0,4), mo = +v.slice(4,6)-1, d  = +v.slice(6,8);
  const hh = +v.slice(9,11), mm = +v.slice(11,13), ss = +(v.slice(13,15)||'0');
  if (v.endsWith('Z')) {
    return new Date(Date.UTC(y, mo, d, hh, mm, ss));
  }
  const offset = warsawOffsetH(y, mo, d);
  return new Date(Date.UTC(y, mo, d, hh - offset, mm, ss));
}

const TZ = 'Europe/Warsaw';
function wTime(date) { return date.toLocaleTimeString('pl-PL', {hour:'2-digit', minute:'2-digit', timeZone: TZ}); }
function wDayNum(date) { return new Intl.DateTimeFormat('pl-PL', {timeZone: TZ, day: '2-digit'}).format(date); }
function wDayName(date) {
  const en = new Intl.DateTimeFormat('en', {timeZone: TZ, weekday: 'short'}).format(date);
  return {Sun:'Nd',Mon:'Pn',Tue:'Wt',Wed:'Śr',Thu:'Cz',Fri:'Pt',Sat:'Sb'}[en] || en;
}
function wMonthShort(date) {
  const en = new Intl.DateTimeFormat('en', {timeZone: TZ, month: 'short'}).format(date);
  return {Jan:'Sty',Feb:'Lut',Mar:'Mar',Apr:'Kwi',May:'Maj',Jun:'Cze',
          Jul:'Lip',Aug:'Sie',Sep:'Wrz',Oct:'Paź',Nov:'Lis',Dec:'Gru'}[en] || en;
}
function wMonthFull(date) {
  const en = new Intl.DateTimeFormat('en', {timeZone: TZ, month: 'long'}).format(date);
  return {January:'Stycznia',February:'Lutego',March:'Marca',April:'Kwietnia',
          May:'Maja',June:'Czerwca',July:'Lipca',August:'Sierpnia',
          September:'Września',October:'Października',November:'Listopada',December:'Grudnia'}[en] || en;
}
function wFullDate(date) {
  const day  = new Intl.DateTimeFormat('pl-PL', {timeZone: TZ, day: 'numeric'}).format(date);
  const year = new Intl.DateTimeFormat('pl-PL', {timeZone: TZ, year: 'numeric'}).format(date);
  return `${day} ${wMonthFull(date)} ${year} (${wDayName(date)})`;
}
function wDayKey(date) { return new Intl.DateTimeFormat('en-CA', {timeZone: TZ}).format(date); }

function formatEventDateTime(ev) {
  const startFull = wFullDate(ev.start);
  if (ev.allDay) {
    if (!ev.end) return `<strong>${startFull}</strong>`;
    const endInclusive = new Date(ev.end.getTime() - 24 * 3600 * 1000);
    if (wDayKey(ev.start) === wDayKey(endInclusive)) return `<strong>${startFull}</strong>`;
    return `<strong>${startFull}&nbsp;–&nbsp;${wFullDate(endInclusive)}</strong>`;
  }
  const sTime = wTime(ev.start);
  if (!ev.end) return `<strong>${startFull}&nbsp;${sTime}</strong>`;
  const eTime = wTime(ev.end);
  if (wDayKey(ev.start) === wDayKey(ev.end)) return `<strong>${startFull}&nbsp;${sTime}&nbsp;–&nbsp;${eTime}</strong>`;
  return `<strong>${startFull},&nbsp;${sTime}&nbsp;–&nbsp;${wFullDate(ev.end)},&nbsp;${eTime}</strong>`;
}

const CAT_RULES = [
  { cat: 'festiwale', re: /festiwal|festival|kongres|congress/ },
  { cat: 'warsztaty', re: /warsztat|kurs|lekcj|class|workshop|szkoleni|training|nauka/ },
  { cat: 'party',     re: /party|social|potancowk|practica|practis|wieczor taneczn|noc salsy|noc tanca/ },
  { cat: 'bachata',   re: /bachata/ },
  { cat: 'salsa',     re: /salsa|timba|casino|rueda|son cubano|mambo/ },
];

function detectTypes(summary, location) {
  const t     = normalisePL(summary) + ' ' + normalisePL(location);
  const types = CAT_RULES.filter(r => r.re.test(t)).map(r => r.cat);
  return types.length ? types : ['salsa'];
}

const KNOWN_CITIES = [
  'Białystok','Warszawa','Kraków','Gdańsk','Gdynia','Poznań','Wrocław','Łódź',
  'Katowice','Lublin','Bydgoszcz','Szczecin','Rzeszów','Olsztyn','Toruń',
  'Kielce','Gorzów','Zielona Góra','Opole','Częstochowa',
];

function detectCity(location) {
  if (!location) return null;
  const locNorm = normalisePL(location);
  for (const c of KNOWN_CITIES) {
    if (locNorm.includes(normalisePL(c))) return c;
  }
  const parts = location.split(',').map(p => p.trim()).filter(Boolean);
  const last  = parts[parts.length - 1];
  if (last && last.length > 2 && last.length < 40 && !/\d/.test(last)) {
    return last.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  }
  return null;
}

const LABELS = { salsa:'Salsa', bachata:'Bachata', warsztaty:'Warsztaty', festiwale:'Festiwale', party:'Party' };

function badgesHTML(types, extraStyle) {
  return types.map(t =>
    `<span class="card-badge badge-${t}"${extraStyle ? ` style="${extraStyle}"` : ''}>${LABELS[t] || t}</span>`
  ).join('');
}

function makeCard(ev) {
  const types    = detectTypes(ev.summary, ev.location);
  const primary  = types[0];
  const city     = detectCity(ev.location);
  const d        = ev.start;
  const dayNum   = wDayNum(d);
  const dayName  = wDayName(d);
  const month    = wMonthShort(d);

  let timeStr;
  if (ev.allDay) {
    timeStr = 'Cały dzień';
  } else {
    timeStr = wTime(d);
    if (ev.end) timeStr += ` – ${wTime(ev.end)}`;
  }

  let endLine = '';
  if (ev.end) {
    const endDate = ev.allDay ? new Date(ev.end.getTime() - 86400000) : ev.end;
    if (wDayKey(d) !== wDayKey(endDate)) {
      endLine = `<div class="card-day-end">– ${wDayNum(endDate)} · ${wDayName(endDate)} · ${wMonthShort(endDate)}</div>`;
    }
  }

  const location = ev.location ? ev.location.split(',')[0] : '';
  const pinSvg   = `<svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
    <path d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
    <path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
  </svg>`;

  const card = document.createElement('div');
  card.className       = 'event-card';
  card.dataset.primary = primary;
  card.dataset.types   = JSON.stringify(types);
  card.dataset.city    = city || 'unknown';
  card.innerHTML = `
    <div class="card-top">
      <div class="card-day-block">
        <div class="card-day-num">${dayNum}</div>
        <div class="card-day-name">${dayName} · ${month}</div>
        ${endLine}
      </div>
      <div class="card-divider"></div>
      <div class="card-time">${timeStr}</div>
      <div class="card-dot"></div>
    </div>
    <div class="card-body">
      <div class="card-title">${escapeHTML(ev.summary) || 'Bez nazwy'}</div>
      ${location ? `<div class="card-location">${pinSvg}${escapeHTML(location)}</div>` : ''}
      <div class="card-badges">
        ${city ? `<span class="card-city-chip">${escapeHTML(city)}</span>` : ''}
        ${badgesHTML(types)}
      </div>
    </div>`;
  card.addEventListener('click', () => openEventModal(ev, types, city));
  return card;
}

let ALL_EVENTS = [];
let activeCat  = 'all';
let activeCity = 'all';

async function loadEvents() {
  const grid = document.getElementById('events-grid');
  const now  = new Date();
  const max  = new Date(now.getTime() + 90 * 24 * 3600 * 1000);

  try {
    const r = await fetch(ICS_PROXY);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const text = await r.text();
    const raw = parseIcs(text);
    const seen = new Set();
    ALL_EVENTS = raw
      .filter(ev => (ev.end || ev.start) >= now && ev.start <= max)
      .sort((a,b) => a.start - b.start)
      .filter(ev => {
        const key = ev.uid || (ev.summary + ev.start.toISOString());
        if (seen.has(key)) return false;
        seen.add(key); return true;
      });

    grid.innerHTML = '';
    if (!ALL_EVENTS.length) {
      grid.innerHTML = '<div class="empty-msg">Brak nadchodzących eventów w ciągu najbliższych 90 dni.</div>';
      return;
    }
    buildCityFilter();
    ALL_EVENTS.forEach(ev => grid.appendChild(makeCard(ev)));
    applyFilters();
  } catch (err) {
    console.error(err);
    grid.innerHTML = `<div class="empty-msg">Nie udało się załadować eventów (${err.message}).</div>`;
  }
}

function buildCityFilter() {
  const cities = [...new Set(ALL_EVENTS.map(ev => detectCity(ev.location)).filter(Boolean))].sort();
  if (!cities.length) return;
  const sel = document.getElementById('city-select');
  cities.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = c;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', () => { activeCity = sel.value; applyFilters(); });
  document.getElementById('city-row').style.display = 'flex';
}

function applyFilters() {
  document.querySelectorAll('.event-card').forEach(c => {
    const types  = JSON.parse(c.dataset.types || '[]');
    const catOk  = activeCat === 'all' || types.includes(activeCat);
    const cityOk = activeCity === 'all' || c.dataset.city === activeCity;
    c.classList.toggle('hidden', !(catOk && cityOk));
  });
}

document.querySelectorAll('#cat-pills .pill').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#cat-pills .pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeCat = btn.dataset.cat;
    applyFilters();
  });
});

let currentEvent = null;
let lastFocused  = null;

function openOverlay(id) {
  const overlay = document.getElementById(id);
  lastFocused = document.activeElement;
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  const dialog = overlay.querySelector('[role="dialog"]');
  if (dialog) dialog.focus();
}
function closeOverlay(id) {
  const overlay = document.getElementById(id);
  if (!overlay.classList.contains('open')) return;
  overlay.classList.remove('open');
  document.body.style.overflow = '';
  if (lastFocused && document.contains(lastFocused)) lastFocused.focus();
  lastFocused = null;
}

function openEventModal(ev, types, city) {
  currentEvent = ev;
  const modal  = document.getElementById('event-modal');
  modal.dataset.primary = types[0];
  document.getElementById('m-badges').innerHTML = badgesHTML(types, 'font-size:.62rem;padding:3px 9px');
  document.getElementById('m-title').textContent = ev.summary || 'Bez nazwy';
  document.getElementById('m-datetime').innerHTML = formatEventDateTime(ev);
  const locRow = document.getElementById('m-location-row');
  if (ev.location) {
    document.getElementById('m-location').textContent = ev.location;
    locRow.style.display = 'flex';
  } else {
    locRow.style.display = 'none';
  }
  const descEl = document.getElementById('m-desc');
  if (ev.desc) { descEl.textContent = ev.desc; descEl.style.display = 'block'; }
  else         { descEl.style.display = 'none'; }
  document.getElementById('m-gcal-link').href = buildGcalLink(ev);
  modal.querySelector('.modal-body').scrollTop = 0;
  openOverlay('event-overlay');
}

function closeEventModal() {
  closeOverlay('event-overlay');
}
function handleOverlayClick(e) {
  if (e.target === document.getElementById('event-overlay')) closeEventModal();
}

function fmtGcalDate(d, allDay) {
  if (allDay) return d.toISOString().slice(0,10).replace(/-/g,'');
  return d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
}
function buildGcalLink(ev) {
  const base  = 'https://calendar.google.com/calendar/render?action=TEMPLATE';
  const start = fmtGcalDate(ev.start, ev.allDay);
  const end   = ev.end ? fmtGcalDate(ev.end, ev.allDay)
                       : fmtGcalDate(new Date(ev.start.getTime() + 3600000), ev.allDay);
  return `${base}&text=${encodeURIComponent(ev.summary||'')}&dates=${start}/${end}&location=${encodeURIComponent(ev.location||'')}&details=${encodeURIComponent(ev.desc||'')}`;
}

function fmtIcsDate(d, allDay) {
  if (allDay) return d.toISOString().slice(0,10).replace(/-/g,'');
  return d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
}
function escapeIcs(s) {
  return (s || '').replace(/\\/g,'\\\\').replace(/;/g,'\\;')
                  .replace(/,/g,'\\,').replace(/\r?\n/g,'\\n');
}
function downloadEventIcs() {
  const ev = currentEvent;
  if (!ev) return;
  const dtStart = ev.allDay ? `DTSTART;VALUE=DATE:${fmtIcsDate(ev.start,true)}` : `DTSTART:${fmtIcsDate(ev.start,false)}`;
  const dtEnd   = ev.end ? (ev.allDay ? `DTEND;VALUE=DATE:${fmtIcsDate(ev.end,true)}` : `DTEND:${fmtIcsDate(ev.end,false)}`) : '';
  const ics = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Sabor Latino//PL',
    'BEGIN:VEVENT',
    `UID:${ev.uid || Date.now()+'@sabor-latino'}`,
    `DTSTAMP:${fmtIcsDate(new Date(),false)}`,
    `SUMMARY:${escapeIcs(ev.summary)}`, dtStart, dtEnd,
    ev.location ? `LOCATION:${escapeIcs(ev.location)}` : '',
    ev.desc ? `DESCRIPTION:${escapeIcs(ev.desc)}` : '',
    'END:VEVENT','END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
  const url = URL.createObjectURL(new Blob([ics],{type:'text/calendar;charset=utf-8'}));
  const a   = Object.assign(document.createElement('a'),{href:url,download:(ev.summary||'event').replace(/[^a-z0-9]/gi,'_').toLowerCase()+'.ics'});
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

function openImportModal() {
  document.getElementById('gcal-sub-link').href  = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(ICS_FEED)}`;
  document.getElementById('ics-dl-link').href    = ICS_PROXY;
  document.getElementById('ics-url-text').textContent = ICS_FEED;
  openOverlay('import-overlay');
}
function closeImportModal() {
  closeOverlay('import-overlay');
}
function handleImportOverlayClick(e) {
  if (e.target === document.getElementById('import-overlay')) closeImportModal();
}
function copyIcsUrl() {
  navigator.clipboard.writeText(ICS_FEED).then(() => {
    const btn = document.getElementById('copy-url-btn');
    btn.textContent = '✓ Skopiowano'; btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'Kopiuj'; btn.classList.remove('copied'); }, 2000);
  });
}

function openSubmitModal() {
  const frame = document.getElementById('submit-frame');
  if (frame.dataset.loaded !== '1') {
    frame.src = FORM_EMBED_URL;
    frame.dataset.loaded = '1';
  }
  document.getElementById('submit-external-link').href = FORM_URL;
  openOverlay('submit-overlay');
}
function closeSubmitModal() {
  closeOverlay('submit-overlay');
}
function handleSubmitOverlayClick(e) {
  if (e.target === document.getElementById('submit-overlay')) closeSubmitModal();
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeEventModal(); closeImportModal(); closeSubmitModal(); }
  if (e.key === 'Tab') {
    const overlay = document.querySelector('.modal-overlay.open');
    if (!overlay) return;
    const focusables = [...overlay.querySelectorAll(
      'a[href], button:not([disabled]), select, input, textarea, iframe'
    )].filter(el => el.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0];
    const last  = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !overlay.contains(active))) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && (active === last || !overlay.contains(active))) {
      e.preventDefault(); first.focus();
    }
  }
});

// ════════════════════════════════════════════════
// EVENTS SECTION COLLAPSE
// ════════════════════════════════════════════════
(function setupEventsToggle() {
  const btn = document.getElementById('events-toggle');
  const grid = document.getElementById('events-grid');
  if (!btn || !grid) return;
  const STORAGE_KEY = 'events-collapsed';
  let collapsed = false;
  try { collapsed = localStorage.getItem(STORAGE_KEY) === '1'; } catch (e) {}
  const apply = () => {
    btn.setAttribute('aria-expanded', String(!collapsed));
    grid.classList.toggle('collapsed', collapsed);
  };
  apply();
  btn.addEventListener('click', () => {
    collapsed = !collapsed;
    try { localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0'); } catch (e) {}
    apply();
  });
})();

// ════════════════════════════════════════════════
// THEME TOGGLE
// ════════════════════════════════════════════════
function syncCalendarTheme() {
  const frame = document.getElementById('gcal-frame');
  if (!frame) return;
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const bg  = isLight ? '%23fbf5e3' : '%23171f3d';
  const src = frame.getAttribute('src').replace(/bgcolor=%23[0-9a-fA-F]{6}/, `bgcolor=${bg}`);
  if (src !== frame.getAttribute('src')) frame.src = src;
}

(function setupThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  const syncAria = () => {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    btn.setAttribute('aria-pressed', String(isLight));
    btn.setAttribute('aria-label', isLight ? 'Przełącz na motyw ciemny' : 'Przełącz na motyw jasny');
  };
  syncAria();
  syncCalendarTheme();
  btn.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) {}
    syncAria();
    syncCalendarTheme();
  });
})();

loadEvents();
