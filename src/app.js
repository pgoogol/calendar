// ════════════════════════════════════════════════
// CONFIG
// ════════════════════════════════════════════════
const ICS_URLS = [
  'https://calendar.google.com/calendar/ical/459c7aba9bb06fb9ebe829ce0ec57e20d9b01efd6b3e5c586a981f97f1707bb8%40group.calendar.google.com/public/basic.ics',
];
const PROXY = 'https://corsproxy.io/?';
const TZ_DISPLAY = 'Europe/Warsaw';

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
      <div class="card-title">${ev.summary || 'Bez nazwy'}</div>
      ${location ? `<div class="card-location">${pinSvg}${location}</div>` : ''}
      <div class="card-badges">
        ${city ? `<span class="card-city-chip">${city}</span>` : ''}
        ${badgesHTML(types)}
      </div>
    </div>`;
  card.addEventListener('click', () => openEventModal(ev, types, city));
  return card;
}

let ALL_EVENTS = [];
let UPCOMING_EVENTS = [];
let activeCat  = 'all';
let activeCity = 'all';

async function loadEvents() {
  const grid = document.getElementById('events-grid');
  const now  = new Date();
  const upcomingMax = new Date(now.getTime() + 90 * 24 * 3600 * 1000);
  const calMin      = new Date(now.getTime() - 180 * 24 * 3600 * 1000);
  const calMax      = new Date(now.getTime() + 365 * 24 * 3600 * 1000);

  try {
    const texts = await Promise.all(
      ICS_URLS.map(url =>
        fetch(PROXY + encodeURIComponent(url))
          .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); })
      )
    );

    const raw  = texts.flatMap(parseIcs);
    const seen = new Set();
    ALL_EVENTS = raw
      .filter(ev => ev.start >= calMin && ev.start <= calMax)
      .sort((a,b) => a.start - b.start)
      .filter(ev => {
        const key = ev.uid || (ev.summary + ev.start.toISOString());
        if (seen.has(key)) return false;
        seen.add(key); return true;
      });

    UPCOMING_EVENTS = ALL_EVENTS.filter(ev => ev.start >= now && ev.start <= upcomingMax);

    grid.innerHTML = '';
    if (!UPCOMING_EVENTS.length) {
      grid.innerHTML = '<div class="empty-msg">Brak nadchodzących eventów w ciągu najbliższych 90 dni.</div>';
    } else {
      UPCOMING_EVENTS.forEach(ev => grid.appendChild(makeCard(ev)));
    }
    buildCityFilter();
    initCalendar();
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
  renderCalendar();
}

// ════════════════════════════════════════════════
// CUSTOM CALENDAR
// ════════════════════════════════════════════════
let CAL_VIEW = null; // {year, month0}
const MONTH_NAMES_PL = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec',
                        'Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];

function dayKeyFromParts(y, m0, d) {
  return `${y}-${String(m0+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

function eventDayKeys(ev) {
  const keys = [];
  const startKey = wDayKey(ev.start);
  if (!ev.allDay || !ev.end) { keys.push(startKey); return keys; }
  const endExclusive = ev.end;
  const cursor = new Date(ev.start.getTime());
  let safety = 60;
  while (safety-- > 0) {
    const k = wDayKey(cursor);
    keys.push(k);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (cursor >= endExclusive) break;
  }
  return keys;
}

function eventMatchesFilters(ev) {
  const types = detectTypes(ev.summary, ev.location);
  if (activeCat !== 'all' && !types.includes(activeCat)) return false;
  if (activeCity !== 'all') {
    const city = detectCity(ev.location) || 'unknown';
    if (city !== activeCity) return false;
  }
  return true;
}

function initCalendar() {
  const today = new Date();
  CAL_VIEW = { year: today.getFullYear(), month0: today.getMonth() };

  document.getElementById('cal-prev').addEventListener('click', () => {
    let { year, month0 } = CAL_VIEW;
    month0 -= 1;
    if (month0 < 0) { month0 = 11; year -= 1; }
    CAL_VIEW = { year, month0 };
    renderCalendar();
  });
  document.getElementById('cal-next').addEventListener('click', () => {
    let { year, month0 } = CAL_VIEW;
    month0 += 1;
    if (month0 > 11) { month0 = 0; year += 1; }
    CAL_VIEW = { year, month0 };
    renderCalendar();
  });
  document.getElementById('cal-today').addEventListener('click', () => {
    const t = new Date();
    CAL_VIEW = { year: t.getFullYear(), month0: t.getMonth() };
    renderCalendar();
  });

  renderCalendar();
}

function renderCalendar() {
  if (!CAL_VIEW) return;
  const { year, month0 } = CAL_VIEW;
  const grid  = document.getElementById('cal-grid');
  const label = document.getElementById('cal-month-label');
  if (!grid || !label) return;

  label.textContent = `${MONTH_NAMES_PL[month0]} ${year}`;

  const eventsByDay = new Map();
  for (const ev of ALL_EVENTS) {
    if (!eventMatchesFilters(ev)) continue;
    for (const k of eventDayKeys(ev)) {
      if (!eventsByDay.has(k)) eventsByDay.set(k, []);
      eventsByDay.get(k).push(ev);
    }
  }

  const firstOfMonth = new Date(Date.UTC(year, month0, 1));
  const jsWeekday    = firstOfMonth.getUTCDay();
  const offset       = (jsWeekday + 6) % 7; // Monday-first
  const daysInMonth  = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  const totalCells   = Math.ceil((offset + daysInMonth) / 7) * 7;
  const todayKey     = wDayKey(new Date());

  grid.innerHTML = '';
  for (let i = 0; i < totalCells; i++) {
    const dayOffset = i - offset;
    const cellDate  = new Date(Date.UTC(year, month0, 1 + dayOffset));
    const cy = cellDate.getUTCFullYear();
    const cm = cellDate.getUTCMonth();
    const cd = cellDate.getUTCDate();
    const key = dayKeyFromParts(cy, cm, cd);
    const inMonth = cm === month0 && cy === year;
    const isToday = key === todayKey;
    const dayEvents = eventsByDay.get(key) || [];
    const dow = (i % 7); // 0=Mon ... 6=Sun

    const cell = document.createElement('div');
    cell.className = 'cal-day';
    if (!inMonth)  cell.classList.add('cal-day-out');
    if (isToday)   cell.classList.add('cal-day-today');
    if (dow >= 5)  cell.classList.add('cal-day-weekend');
    if (dayEvents.length) cell.classList.add('cal-day-has-events');

    const num = document.createElement('div');
    num.className = 'cal-day-num';
    num.textContent = cd;
    cell.appendChild(num);

    if (dayEvents.length) {
      const evList = document.createElement('div');
      evList.className = 'cal-day-events';
      const visible = dayEvents.slice(0, 3);
      for (const ev of visible) {
        const types = detectTypes(ev.summary, ev.location);
        const primary = types[0];
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'cal-event';
        chip.dataset.primary = primary;
        const timeLabel = ev.allDay ? '' : wTime(ev.start);
        const titleText = ev.summary || 'Bez nazwy';
        chip.innerHTML = `
          <span class="cal-event-dot" aria-hidden="true"></span>
          ${timeLabel ? `<span class="cal-event-time">${timeLabel}</span>` : ''}
          <span class="cal-event-title">${titleText}</span>
        `;
        chip.title = `${titleText}${ev.location ? ' · ' + ev.location : ''}`;
        chip.addEventListener('click', (e) => {
          e.stopPropagation();
          openEventModal(ev, types, detectCity(ev.location));
        });
        evList.appendChild(chip);
      }
      if (dayEvents.length > visible.length) {
        const more = document.createElement('button');
        more.type = 'button';
        more.className = 'cal-event-more';
        more.textContent = `+${dayEvents.length - visible.length} więcej`;
        more.addEventListener('click', (e) => {
          e.stopPropagation();
          cell.classList.toggle('cal-day-expanded');
          renderExpandedDay(cell, dayEvents);
        });
        evList.appendChild(more);
      }
      cell.appendChild(evList);

      const dotRow = document.createElement('div');
      dotRow.className = 'cal-day-dots';
      const seenCats = new Set();
      for (const ev of dayEvents) {
        const t = detectTypes(ev.summary, ev.location)[0];
        if (seenCats.has(t)) continue;
        seenCats.add(t);
        const d = document.createElement('span');
        d.className = 'cal-day-dot';
        d.dataset.primary = t;
        dotRow.appendChild(d);
      }
      cell.appendChild(dotRow);
    }

    grid.appendChild(cell);
  }
}

function renderExpandedDay(cell, dayEvents) {
  const list = cell.querySelector('.cal-day-events');
  if (!list) return;
  list.innerHTML = '';
  for (const ev of dayEvents) {
    const types = detectTypes(ev.summary, ev.location);
    const primary = types[0];
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'cal-event';
    chip.dataset.primary = primary;
    const timeLabel = ev.allDay ? '' : wTime(ev.start);
    const titleText = ev.summary || 'Bez nazwy';
    chip.innerHTML = `
      <span class="cal-event-dot" aria-hidden="true"></span>
      ${timeLabel ? `<span class="cal-event-time">${timeLabel}</span>` : ''}
      <span class="cal-event-title">${titleText}</span>
    `;
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      openEventModal(ev, types, detectCity(ev.location));
    });
    list.appendChild(chip);
  }
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
  document.getElementById('event-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeEventModal() {
  document.getElementById('event-overlay').classList.remove('open');
  document.body.style.overflow = '';
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
function downloadEventIcs() {
  const ev = currentEvent;
  if (!ev) return;
  const dtStart = ev.allDay ? `DTSTART;VALUE=DATE:${fmtIcsDate(ev.start,true)}` : `DTSTART:${fmtIcsDate(ev.start,false)}`;
  const dtEnd   = ev.end ? (ev.allDay ? `DTEND;VALUE=DATE:${fmtIcsDate(ev.end,true)}` : `DTEND:${fmtIcsDate(ev.end,false)}`) : '';
  const ics = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Sabor Latino//PL',
    'BEGIN:VEVENT',
    `UID:${ev.uid || Date.now()+'@sabor-latino'}`,
    `SUMMARY:${ev.summary||''}`, dtStart, dtEnd,
    ev.location ? `LOCATION:${ev.location}` : '',
    ev.desc ? `DESCRIPTION:${ev.desc.replace(/\n/g,'\\n')}` : '',
    'END:VEVENT','END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
  const url = URL.createObjectURL(new Blob([ics],{type:'text/calendar;charset=utf-8'}));
  const a   = Object.assign(document.createElement('a'),{href:url,download:(ev.summary||'event').replace(/[^a-z0-9]/gi,'_').toLowerCase()+'.ics'});
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

const ICS_FEED = ICS_URLS[0];

function openImportModal() {
  document.getElementById('gcal-sub-link').href  = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(ICS_FEED)}`;
  document.getElementById('ics-dl-link').href    = PROXY + encodeURIComponent(ICS_FEED);
  document.getElementById('ics-url-text').textContent = ICS_FEED;
  document.getElementById('import-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeImportModal() {
  document.getElementById('import-overlay').classList.remove('open');
  document.body.style.overflow = '';
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

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeEventModal(); closeImportModal(); }
});

// ════════════════════════════════════════════════
// THEME TOGGLE
// ════════════════════════════════════════════════
(function setupThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  const syncAria = () => {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    btn.setAttribute('aria-pressed', String(isLight));
    btn.setAttribute('aria-label', isLight ? 'Przełącz na motyw ciemny' : 'Przełącz na motyw jasny');
  };
  syncAria();
  btn.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) {}
    syncAria();
  });
})();

loadEvents();
