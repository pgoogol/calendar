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
 *      • "Link do wydarzenia"      — krótka odpowiedź, opcjonalne
 *                                    (FB event, strona organizatora itp.)
 *      • "Data"                    — data, opcjonalne
 *      • "Godzina rozpoczęcia"     — godzina, opcjonalne
 *      • "Godzina zakończenia"     — godzina, opcjonalne
 *      • "Miejsce"                 — krótka odpowiedź, opcjonalne
 *      • "Miasto"                  — krótka odpowiedź, opcjonalne
 *      • "Opis"                    — akapit, opcjonalne
 *      • "Kategoria"               — jednokrotny wybór: Salsa / Bachata /
 *                                    Warsztaty / Party / Festiwale
 *      • "Email kontaktowy"        — krótka odpowiedź, opcjonalne
 *
 *    Wskazówka: w opisie formularza warto napisać „Wystarczy wkleić link do
 *    wydarzenia z Facebooka — resztę uzupełnimy.". Jeśli zgłaszający poda
 *    tylko link, to PRZED zatwierdzeniem otwórz link i uzupełnij datę,
 *    godzinę i miejsce w odpowiednich kolumnach arkusza — bez tych pól nie
 *    da się utworzyć wydarzenia w kalendarzu.
 *
 * 2. Połącz formularz z arkuszem: Odpowiedzi → ikonka arkusza → "Utwórz arkusz".
 *
 * 3. W arkuszu otwórz Rozszerzenia → Apps Script. Wklej zawartość tego pliku
 *    jako Code.gs (nadpisując domyślną treść).
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
  DATE:        'Data',
  TIME_START:  'Godzina rozpoczęcia',
  TIME_END:    'Godzina zakończenia',
  LOCATION:    'Miejsce',
  CITY:        'Miasto',
  DESC:        'Opis',
  CATEGORY:    'Kategoria',
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
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
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

  SpreadsheetApp.getActiveSpreadsheet().toast('Kolumny gotowe. Dodaj triggery (instrukcja w pliku).', 'Setup OK', 6);
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
  const start = combineDateTime_(data[COL.DATE], data[COL.TIME_START]);
  if (!start) throw new Error('Brak prawidłowej daty lub godziny rozpoczęcia.');

  let end = combineDateTime_(data[COL.DATE], data[COL.TIME_END]);
  if (!end) {
    end = new Date(start.getTime() + CONFIG.DEFAULT_DURATION_HOURS * 3600 * 1000);
  } else if (end <= start) {
    // Godzina zakończenia wcześniejsza niż początek → wydarzenie kończy się następnego dnia.
    end = new Date(end.getTime() + 24 * 3600 * 1000);
  }

  const title = String(data[COL.TITLE] || '').trim() || '(bez tytułu)';
  const category = String(data[COL.CATEGORY] || '').trim();
  const finalTitle = (category && !title.toLowerCase().includes(category.toLowerCase()))
    ? `${title} [${category}]`
    : title;

  const location = [data[COL.LOCATION], data[COL.CITY]]
    .map(v => String(v || '').trim())
    .filter(Boolean)
    .join(', ');

  const descParts = [];
  if (data[COL.DESC])    descParts.push(String(data[COL.DESC]).trim());
  if (data[COL.LINK])    descParts.push(String(data[COL.LINK]).trim());
  if (data[COL.CONTACT]) descParts.push(`Kontakt: ${String(data[COL.CONTACT]).trim()}`);
  const description = descParts.join('\n\n');

  const calendar = CalendarApp.getCalendarById(CONFIG.CALENDAR_ID);
  if (!calendar) throw new Error(`Brak dostępu do kalendarza ${CONFIG.CALENDAR_ID}. Sprawdź, czy konto Apps Script ma uprawnienia edycji.`);

  const event = calendar.createEvent(finalTitle, start, end, {
    location: location,
    description: description,
  });
  return event.getId();
}

function deleteCalendarEvent_(eventId) {
  const calendar = CalendarApp.getCalendarById(CONFIG.CALENDAR_ID);
  if (!calendar) return;
  const event = calendar.getEventById(eventId);
  if (event) event.deleteEvent();
}

function combineDateTime_(dateValue, timeValue) {
  if (!dateValue) return null;
  const date = (dateValue instanceof Date) ? new Date(dateValue.getTime()) : new Date(dateValue);
  if (isNaN(date.getTime())) return null;

  if (timeValue === null || timeValue === undefined || timeValue === '') {
    return null;
  }

  let h = 0, m = 0;
  if (timeValue instanceof Date) {
    h = timeValue.getHours();
    m = timeValue.getMinutes();
  } else {
    const match = String(timeValue).match(/(\d{1,2})[:.](\d{2})/);
    if (!match) return null;
    h = parseInt(match[1], 10);
    m = parseInt(match[2], 10);
  }
  date.setHours(h, m, 0, 0);
  return date;
}

function notifyAdmin_(sheet, row, headers) {
  if (!CONFIG.ADMIN_EMAIL || CONFIG.ADMIN_EMAIL === 'YOUR_EMAIL@example.com') return;
  const data = readRow_(sheet, row, headers);

  const dateStr = data[COL.DATE]
    ? Utilities.formatDate(new Date(data[COL.DATE]), CONFIG.TIMEZONE, 'yyyy-MM-dd')
    : '?';
  const startStr = data[COL.TIME_START]
    ? (data[COL.TIME_START] instanceof Date
        ? Utilities.formatDate(data[COL.TIME_START], CONFIG.TIMEZONE, 'HH:mm')
        : String(data[COL.TIME_START]))
    : '?';
  const endStr = data[COL.TIME_END]
    ? (data[COL.TIME_END] instanceof Date
        ? Utilities.formatDate(data[COL.TIME_END], CONFIG.TIMEZONE, 'HH:mm')
        : String(data[COL.TIME_END]))
    : '?';

  const subject = `Nowe zgłoszenie: ${data[COL.TITLE] || '(bez tytułu)'}`;
  const body = [
    'Nowe zgłoszenie wydarzenia czeka na zatwierdzenie:',
    '',
    `Tytuł:     ${data[COL.TITLE] || ''}`,
    `Link:      ${data[COL.LINK] || '(brak)'}`,
    `Kiedy:     ${dateStr}, ${startStr} – ${endStr}`,
    `Miejsce:   ${data[COL.LOCATION] || ''}`,
    `Miasto:    ${data[COL.CITY] || ''}`,
    `Kategoria: ${data[COL.CATEGORY] || ''}`,
    `Kontakt:   ${data[COL.CONTACT] || '(brak)'}`,
    '',
    'Opis:',
    String(data[COL.DESC] || '(brak)'),
    '',
    `Arkusz: ${SpreadsheetApp.getActiveSpreadsheet().getUrl()}`,
    '',
    'Jeśli zgłaszający podał tylko link — otwórz go i uzupełnij datę,',
    'godzinę oraz miejsce w arkuszu PRZED zmianą statusu na "Approved".',
    '',
    'Aby opublikować — zmień Status na "Approved".',
    'Aby odrzucić    — zmień Status na "Rejected".',
  ].join('\n');

  MailApp.sendEmail(CONFIG.ADMIN_EMAIL, subject, body);
}

function formatNow_() {
  return Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm');
}
