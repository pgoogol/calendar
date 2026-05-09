/**
 * ============================================================================
 * Sabor Latino — backend zgłaszania wydarzeń
 * ============================================================================
 *
 * Co to robi:
 *   1. Użytkownik wypełnia Formularz Google osadzony na stronie.
 *   2. Każde zgłoszenie ląduje w arkuszu z kolumną Status = "Pending".
 *   3. Admin dostaje maila i zatwierdza w arkuszu (Status → "Approved").
 *   4. Skrypt automatycznie tworzy wydarzenie w istniejącym kalendarzu Google.
 *   5. Strona od razu pokazuje wydarzenie (czyta ten sam kalendarz przez ICS).
 *
 * ----------------------------------------------------------------------------
 * INSTRUKCJA WDROŻENIA (jednorazowo)
 * ----------------------------------------------------------------------------
 *
 * 1. Stwórz Formularz Google z polami (nazwy muszą się zgadzać z obiektem COL
 *    poniżej — najprościej skopiować je 1:1). Tylko "Tytuł wydarzenia" jest
 *    technicznie wymagany — pozostałe zostaw OPCJONALNE, dzięki czemu zgłaszający
 *    może podać albo pełne dane, albo sam link do wydarzenia z Facebooka.
 *
 *      • "Tytuł wydarzenia"        — krótka odpowiedź, wymagane
 *                                    (warto wpleść słowo wskazujące typ —
 *                                    np. "Salsa", "Bachata", "Warsztaty",
 *                                    "Party", "Festiwal" — strona automatycznie
 *                                    przypisze tag na podstawie tytułu)
 *      • "Link do wydarzenia"      — krótka odpowiedź, opcjonalne
 *                                    (FB event, strona organizatora itp.)
 *      • "Data rozpoczęcia"        — data, opcjonalne
 *      • "Data zakończenia"        — data, opcjonalne
 *                                    (zostaw puste dla wydarzeń jednodniowych;
 *                                    wpisz OSTATNI dzień festiwalu — np.
 *                                    festiwal 1–3 maja: data zakończenia = 3 maja)
 *      • "Godzina rozpoczęcia"     — godzina, opcjonalne
 *                                    (puste = wydarzenie całodniowe)
 *      • "Godzina zakończenia"     — godzina, opcjonalne
 *      • "Miejsce"                 — krótka odpowiedź, opcjonalne
 *                                    (np. "Klub XYZ, Białystok" — miasto
 *                                    wpisz po przecinku, strona sama je
 *                                    rozpozna i pokaże filtr po miastach)
 *      • "Opis"                    — akapit, opcjonalne
 *      • "Email kontaktowy"        — krótka odpowiedź, opcjonalne
 *
 *    Wskazówka: w opisie formularza warto napisać „Wystarczy wkleić link do
 *    wydarzenia z Facebooka — resztę uzupełnimy.". Jeśli zgłaszający poda
 *    tylko link, to PRZED zatwierdzeniem otwórz link i uzupełnij datę,
 *    godzinę i miejsce w odpowiednich kolumnach arkusza — bez daty rozpoczęcia
 *    nie da się utworzyć wydarzenia w kalendarzu.
 *
 *    Obsługiwane warianty:
 *      a) jednodniowe z godzinami (np. potańcówka 22:00–04:00)
 *      b) jednodniowe całodniowe (open day; brak godziny rozpoczęcia)
 *      c) wielodniowe całodniowe (festiwal 1–3 maja; brak godzin)
 *      d) wielodniowe z godzinami (np. kongres pt 18:00 → nd 14:00)
 *
 * 2. Połącz formularz z arkuszem: Odpowiedzi → ikonka arkusza → "Utwórz arkusz".
 *
 * 3. W arkuszu otwórz Rozszerzenia → Apps Script (TAK zalecane — to tworzy
 *    projekt "container-bound", powiązany z arkuszem; setupApprovalColumns()
 *    sam znajdzie arkusz). Wklej zawartość tego pliku jako Code.gs.
 *
 *    Jeśli zamiast tego stworzyłeś projekt na script.google.com (standalone),
 *    setupApprovalColumns rzuci `Cannot read properties of null (reading
 *    'getSheets')` — wtedy wpisz ID arkusza w CONFIG.SPREADSHEET_ID poniżej
 *    (ID weź z URL arkusza: …/spreadsheets/d/<ID>/edit).
 *
 * 4. Ustaw strefę czasową projektu na Europe/Warsaw:
 *    Apps Script → ⚙ Settings → "Time zone" → Warsaw.
 *
 * 5. Uzupełnij CONFIG poniżej (ID kalendarza i e-mail admina).
 *
 * 6. Uruchom raz funkcję `setupApprovalColumns` (przycisk Run u góry edytora).
 *    Apps Script poprosi o uprawnienia — zaakceptuj. Doda kolumny
 *    "Status", "Calendar Event ID", "Notatka admina".
 *
 * 7. Dodaj triggery: ikonka zegara (Triggers) → "+ Add Trigger":
 *      a) Function: onFormSubmitTrigger
 *         Event source: From spreadsheet
 *         Event type:   On form submit
 *      b) Function: onEditTrigger
 *         Event source: From spreadsheet
 *         Event type:   On edit
 *
 * 8. Skopiuj linki do formularza z menu "Wyślij" (prawy górny róg formularza):
 *      • zakładka "Link"  →  wklej do FORM_URL       w src/app.js
 *      • zakładka "<>"    →  ze srcs="..." iframe — wklej do FORM_EMBED_URL
 *
 * Po tych krokach: nowe zgłoszenia pojawiają się w arkuszu, admin zmienia
 * Status z "Pending" na "Approved" i — voilà — wydarzenie jest w kalendarzu
 * i na stronie.
 *
 * ----------------------------------------------------------------------------
 * EDYCJA / USUWANIE OPUBLIKOWANYCH WYDARZEŃ
 * ----------------------------------------------------------------------------
 *
 * Po publikacji wydarzenia kolumna "Calendar Event ID" przechowuje jego ID.
 * Aby usunąć: zmień Status na "Rejected" — skrypt skasuje wpis z kalendarza.
 * Aby zmienić: zmień Status na "Pending" + popraw dane + ponownie "Approved"
 * (najpierw skasuje stare wydarzenie i utworzy nowe).
 */

// ============================================================================
// CONFIG — uzupełnij przed użyciem
// ============================================================================

const CONFIG = {
  // ID kalendarza, na który mają trafiać zatwierdzone wydarzenia.
  // Znajdziesz w Google Calendar: ustawienia kalendarza → "Integracja kalendarza"
  // → "Identyfikator kalendarza".
  CALENDAR_ID: '459c7aba9bb06fb9ebe829ce0ec57e20d9b01efd6b3e5c586a981f97f1707bb8@group.calendar.google.com',

  // Adres, na który leci powiadomienie o nowym zgłoszeniu.
  ADMIN_EMAIL: 'YOUR_EMAIL@example.com',

  // ID arkusza z odpowiedziami formularza. Wymagane gdy projekt Apps Script jest
  // STANDALONE (utworzony z script.google.com); dla projektu container-bound
  // (otwartego przez Rozszerzenia → Apps Script wewnątrz arkusza) można zostawić
  // pusty string — wtedy skrypt sięgnie po aktywny arkusz automatycznie.
  // ID weź z URL arkusza: https://docs.google.com/spreadsheets/d/<ID-TUTAJ>/edit
  SPREADSHEET_ID: '',

  // Strefa czasowa wyświetlana w mailach. Powinna pasować do strefy projektu.
  TIMEZONE: 'Europe/Warsaw',

  // Domyślny czas trwania, gdy zgłaszający nie poda godziny zakończenia (w godzinach).
  DEFAULT_DURATION_HOURS: 2,
};

// Nazwy kolumn — muszą się zgadzać z pytaniami w formularzu.
// Jeśli zmieniasz pytania, zmień też te stringi.
const COL = {
  TIMESTAMP:   'Sygnatura czasowa',          // dodawane automatycznie przez Google Forms
  TITLE:       'Tytuł wydarzenia',
  LINK:        'Link do wydarzenia',
  DATE_START:  'Data rozpoczęcia',
  DATE_END:    'Data zakończenia',
  TIME_START:  'Godzina rozpoczęcia',
  TIME_END:    'Godzina zakończenia',
  LOCATION:    'Miejsce',
  DESC:        'Opis',
  CONTACT:     'Email kontaktowy',
  STATUS:      'Status',
  CALENDAR_ID: 'Calendar Event ID',
  NOTES:       'Notatka admina',
};

const STATUS = {
  PENDING:   'Pending',
  APPROVED:  'Approved',
  REJECTED:  'Rejected',
  PUBLISHED: 'Published',
};

// ============================================================================
// SETUP — uruchom raz po wklejeniu kodu
// ============================================================================

function setupApprovalColumns() {
  const ss = getSpreadsheet_();
  if (!ss) {
    throw new Error('Nie znaleziono arkusza. Otwórz skrypt przez "Rozszerzenia → Apps Script" wewnątrz arkusza, albo wpisz ID arkusza w CONFIG.SPREADSHEET_ID.');
  }
  const sheet = ss.getSheets()[0];
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  const toAdd = [COL.STATUS, COL.CALENDAR_ID, COL.NOTES].filter(h => !headers.includes(h));
  if (toAdd.length) {
    sheet.getRange(1, lastCol + 1, 1, toAdd.length).setValues([toAdd]);
    sheet.getRange(1, 1, 1, sheet.getLastColumn()).setFontWeight('bold');
  }

  // Walidacja kolumny Status
  const updatedHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const statusColIdx = updatedHeaders.indexOf(COL.STATUS) + 1;
  if (statusColIdx > 0) {
    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInList([STATUS.PENDING, STATUS.APPROVED, STATUS.REJECTED, STATUS.PUBLISHED], true)
      .setAllowInvalid(false)
      .build();
    sheet.getRange(2, statusColIdx, Math.max(sheet.getMaxRows() - 1, 1)).setDataValidation(rule);
  }

  const msg = 'Kolumny gotowe. Dodaj triggery (instrukcja w pliku).';
  try { ss.toast(msg, 'Setup OK', 6); }
  catch (e) { Logger.log('Setup OK — ' + msg); }
}

// ============================================================================
// TRIGGERS
// ============================================================================

/** Trigger: On form submit — ustawia Status=Pending i wysyła maila. */
function onFormSubmitTrigger(e) {
  const sheet = e.range.getSheet();
  const row = e.range.getRow();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  const statusColIdx = headers.indexOf(COL.STATUS) + 1;
  if (statusColIdx > 0 && !sheet.getRange(row, statusColIdx).getValue()) {
    sheet.getRange(row, statusColIdx).setValue(STATUS.PENDING);
  }

  notifyAdmin_(sheet, row, headers);
}

/** Trigger: On edit — reaguje na zmiany w kolumnie Status. */
function onEditTrigger(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const statusColIdx = headers.indexOf(COL.STATUS) + 1;
  if (e.range.getColumn() !== statusColIdx) return;

  const row = e.range.getRow();
  if (row < 2) return;

  const newStatus = String(e.value || '').trim();
  const calIdColIdx = headers.indexOf(COL.CALENDAR_ID) + 1;
  const notesColIdx = headers.indexOf(COL.NOTES) + 1;
  const existingEventId = calIdColIdx > 0 ? String(sheet.getRange(row, calIdColIdx).getValue() || '').trim() : '';

  try {
    if (newStatus === STATUS.APPROVED && !existingEventId) {
      const data = readRow_(sheet, row, headers);
      const eventId = createCalendarEvent_(data);
      sheet.getRange(row, calIdColIdx).setValue(eventId);
      sheet.getRange(row, statusColIdx).setValue(STATUS.PUBLISHED);
      if (notesColIdx > 0) {
        sheet.getRange(row, notesColIdx).setValue(`Opublikowano ${formatNow_()}`);
      }
    } else if (newStatus === STATUS.REJECTED && existingEventId) {
      deleteCalendarEvent_(existingEventId);
      sheet.getRange(row, calIdColIdx).clearContent();
      if (notesColIdx > 0) {
        sheet.getRange(row, notesColIdx).setValue(`Usunięto z kalendarza ${formatNow_()}`);
      }
    } else if (newStatus === STATUS.PENDING && existingEventId) {
      // Cofnięcie publikacji — kasujemy stare wydarzenie, czekamy na ponowne Approved.
      deleteCalendarEvent_(existingEventId);
      sheet.getRange(row, calIdColIdx).clearContent();
      if (notesColIdx > 0) {
        sheet.getRange(row, notesColIdx).setValue(`Cofnięto publikację ${formatNow_()}`);
      }
    }
  } catch (err) {
    if (notesColIdx > 0) {
      sheet.getRange(row, notesColIdx).setValue(`Błąd: ${err.message}`);
    }
    throw err;
  }
}

// ============================================================================
// LOGIKA
// ============================================================================

function readRow_(sheet, row, headers) {
  const values = sheet.getRange(row, 1, 1, headers.length).getValues()[0];
  const out = {};
  headers.forEach((h, i) => { out[h] = values[i]; });
  return out;
}

function createCalendarEvent_(data) {
  const startDate = parseDate_(data[COL.DATE_START]);
  if (!startDate) throw new Error('Brak prawidłowej daty rozpoczęcia.');
  const endDate = parseDate_(data[COL.DATE_END]) || new Date(startDate.getTime());
  if (endDate < startDate) throw new Error('Data zakończenia jest wcześniejsza niż data rozpoczęcia.');

  const startTime = parseTimeOfDay_(data[COL.TIME_START]);
  const endTime   = parseTimeOfDay_(data[COL.TIME_END]);

  const finalTitle = String(data[COL.TITLE] || '').trim() || '(bez tytułu)';
  const location = String(data[COL.LOCATION] || '').trim();

  const descParts = [];
  if (data[COL.DESC])    descParts.push(String(data[COL.DESC]).trim());
  if (data[COL.LINK])    descParts.push(String(data[COL.LINK]).trim());
  if (data[COL.CONTACT]) descParts.push(`Kontakt: ${String(data[COL.CONTACT]).trim()}`);
  const description = descParts.join('\n\n');

  const calendar = CalendarApp.getCalendarById(CONFIG.CALENDAR_ID);
  if (!calendar) throw new Error(`Brak dostępu do kalendarza ${CONFIG.CALENDAR_ID}. Sprawdź, czy konto Apps Script ma uprawnienia edycji.`);

  const opts = { location: location, description: description };
  let event;

  if (!startTime) {
    // Wydarzenie całodniowe — jedno- lub wielodniowe.
    // CalendarApp traktuje endDate w createAllDayEvent jako WYŁĄCZNĄ
    // (event widoczny do dnia poprzedniego), więc dodajemy 1 dzień,
    // żeby ostatni dzień festiwalu też się pokazał.
    if (sameDay_(startDate, endDate)) {
      event = calendar.createAllDayEvent(finalTitle, startDate, opts);
    } else {
      const exclusiveEnd = new Date(endDate.getTime() + 24 * 3600 * 1000);
      event = calendar.createAllDayEvent(finalTitle, startDate, exclusiveEnd, opts);
    }
  } else {
    // Wydarzenie z godzinami.
    const start = withTime_(startDate, startTime);
    let end;
    if (endTime) {
      end = withTime_(endDate, endTime);
      // Jednodniowe i koniec ≤ start → wydarzenie wpada w noc, kończy się następnego dnia.
      if (sameDay_(startDate, endDate) && end <= start) {
        end = new Date(end.getTime() + 24 * 3600 * 1000);
      }
    } else if (sameDay_(startDate, endDate)) {
      end = new Date(start.getTime() + CONFIG.DEFAULT_DURATION_HOURS * 3600 * 1000);
    } else {
      // Wielodniowe z godziną startu, bez końca → kończy się o tej samej godzinie ostatniego dnia.
      end = withTime_(endDate, startTime);
    }
    if (end <= start) throw new Error('Koniec wydarzenia wypada przed jego rozpoczęciem.');
    event = calendar.createEvent(finalTitle, start, end, opts);
  }

  return event.getId();
}

function deleteCalendarEvent_(eventId) {
  const calendar = CalendarApp.getCalendarById(CONFIG.CALENDAR_ID);
  if (!calendar) return;
  const event = calendar.getEventById(eventId);
  if (event) event.deleteEvent();
}

function parseDate_(value) {
  if (!value) return null;
  const d = (value instanceof Date) ? new Date(value.getTime()) : new Date(value);
  if (isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseTimeOfDay_(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    return { h: value.getHours(), m: value.getMinutes() };
  }
  const match = String(value).match(/(\d{1,2})[:.](\d{2})/);
  if (!match) return null;
  return { h: parseInt(match[1], 10), m: parseInt(match[2], 10) };
}

function withTime_(date, time) {
  const d = new Date(date.getTime());
  d.setHours(time.h, time.m, 0, 0);
  return d;
}

function sameDay_(a, b) {
  return a.getFullYear() === b.getFullYear()
      && a.getMonth()    === b.getMonth()
      && a.getDate()     === b.getDate();
}

function notifyAdmin_(sheet, row, headers) {
  if (!CONFIG.ADMIN_EMAIL || CONFIG.ADMIN_EMAIL === 'YOUR_EMAIL@example.com') return;
  const data = readRow_(sheet, row, headers);

  const fmtDate = v => v
    ? Utilities.formatDate(new Date(v), CONFIG.TIMEZONE, 'yyyy-MM-dd')
    : '';
  const fmtTime = v => {
    if (!v) return '';
    if (v instanceof Date) return Utilities.formatDate(v, CONFIG.TIMEZONE, 'HH:mm');
    return String(v);
  };

  const dStart = fmtDate(data[COL.DATE_START]);
  const dEnd   = fmtDate(data[COL.DATE_END]);
  const tStart = fmtTime(data[COL.TIME_START]);
  const tEnd   = fmtTime(data[COL.TIME_END]);

  const dateRange = dEnd && dEnd !== dStart
    ? `${dStart || '?'} → ${dEnd}`
    : (dStart || '?');
  const timeRange = (tStart || tEnd)
    ? `${tStart || '?'} – ${tEnd || '?'}`
    : '(całodniowe)';

  const subject = `Nowe zgłoszenie: ${data[COL.TITLE] || '(bez tytułu)'}`;
  const body = [
    'Nowe zgłoszenie wydarzenia czeka na zatwierdzenie:',
    '',
    `Tytuł:    ${data[COL.TITLE] || ''}`,
    `Link:     ${data[COL.LINK] || '(brak)'}`,
    `Kiedy:    ${dateRange}, ${timeRange}`,
    `Miejsce:  ${data[COL.LOCATION] || ''}`,
    `Kontakt:  ${data[COL.CONTACT] || '(brak)'}`,
    '',
    'Opis:',
    String(data[COL.DESC] || '(brak)'),
    '',
    `Arkusz: ${sheet.getParent().getUrl()}`,
    '',
    'Jeśli zgłaszający podał tylko link — otwórz go i uzupełnij datę,',
    'godzinę oraz miejsce w arkuszu PRZED zmianą statusu na "Approved".',
    'Wydarzenia kilkudniowe: wpisz "Datę zakończenia" jako OSTATNI dzień',
    '(skrypt sam doda 1 dzień przy tworzeniu wydarzenia całodniowego).',
    '',
    'Aby opublikować — zmień Status na "Approved".',
    'Aby odrzucić    — zmień Status na "Rejected".',
  ].join('\n');

  MailApp.sendEmail(CONFIG.ADMIN_EMAIL, subject, body);
}

function formatNow_() {
  return Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm');
}

function getSpreadsheet_() {
  if (CONFIG.SPREADSHEET_ID) {
    try { return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID); }
    catch (e) { /* spróbujemy aktywnego poniżej */ }
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}
