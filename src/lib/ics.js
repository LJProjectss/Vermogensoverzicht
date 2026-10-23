// Maandelijkse herinnering als agenda-afspraak (.ics). Werkt in Google Agenda, Outlook en Apple Agenda,
// zonder server of pushmeldingen.

const pad = (n) => String(n).padStart(2, '0');
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

// Eerstvolgende datum (vandaag of later) op dag `day` van de maand
function firstOccurrence(day, now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), day);
  if (d < new Date(now.getFullYear(), now.getMonth(), now.getDate())) d.setMonth(d.getMonth() + 1);
  return d;
}

export function reminderIcs({ day = 1, time = '19:00', url }) {
  const [hh, mm] = time.split(':').map(Number);
  const start = firstOccurrence(day);
  const dt = `${start.getFullYear()}${pad(start.getMonth() + 1)}${pad(start.getDate())}T${pad(hh)}${pad(mm)}00`;
  const endMin = hh * 60 + mm + 15;
  const dtEnd = `${start.getFullYear()}${pad(start.getMonth() + 1)}${pad(start.getDate())}T${pad(Math.floor(endMin / 60) % 24)}${pad(endMin % 60)}00`;
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}00Z`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Vermogensoverzicht//NL',
    'CALSCALE:GREGORIAN',
    'BEGIN:VTIMEZONE',
    'TZID:Europe/Amsterdam',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:+0100',
    'TZOFFSETTO:+0200',
    'TZNAME:CEST',
    'DTSTART:19700329T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0200',
    'TZOFFSETTO:+0100',
    'TZNAME:CET',
    'DTSTART:19701025T030000',
    'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
    'END:STANDARD',
    'END:VTIMEZONE',
    'BEGIN:VEVENT',
    `UID:vermogensoverzicht-maandstand-${day}@${new URL(url).host}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=Europe/Amsterdam:${dt}`,
    `DTEND;TZID=Europe/Amsterdam:${dtEnd}`,
    // dag 29-31 bestaat niet elke maand; daarom maximaal dag 28 in de instellingen
    `RRULE:FREQ=MONTHLY;BYMONTHDAY=${day}`,
    `SUMMARY:${esc('Vermogensoverzicht: maandstanden invullen')}`,
    `DESCRIPTION:${esc(`Vul je maandstanden in: ${url}`)}`,
    `URL:${url}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc('Maandstanden invullen')}`,
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n') + '\r\n';
}
