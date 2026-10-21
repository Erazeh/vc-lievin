// Fonctions partagées entre le navigateur (assets/app.js) et le script de mise à jour (scripts/update.mjs).

// ---------- Noms propres ----------

const ACCENTS = {
  LIEVIN: 'Liévin', NOEL: 'Noël', JOSEPHE: 'Josèphe', LYCEE: 'Lycée', LEO: 'Léo', COEUR: 'Cœur',
  BETHUNE: 'Béthune', HENIN: 'Hénin', EVIN: 'Évin', MERICOURT: 'Méricourt', GENERAL: 'Général',
  ECOLE: 'École', ETOILE: 'Étoile', OMNISPORTS: 'Omnisports', REPUBLIQUE: 'République',
  ELYSEE: 'Élysée', FREDERIC: 'Frédéric', GERARD: 'Gérard', HELENE: 'Hélène', EUGENE: 'Eugène',
  AGGLOMERATION: 'Agglomération', MEDIATHEQUE: 'Médiathèque', ALLEE: 'Allée', CITE: 'Cité',
  REGIONALE: 'Régionale', PRENATIONALE: 'Prénationale', FEMININES: 'Féminines', DEPARTEMENTALE: 'Départementale'
};
const SMALL = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'sur', 'sous', 'en', 'et', 'aux', 'au', 'à']);
const ACRONYMS = new Set(['VB', 'VC', 'SES', 'FLJEP', 'SP', 'RI', 'ASPTT', 'US', 'AS', 'RC', 'ES', 'USO', 'HDF', 'VBC', 'CS', 'SC', 'AL', 'ASL', 'UV', 'II', 'III']);

function word(w, i) {
  if (!w) return w;
  if (/^\d/.test(w)) return w;
  if (ACRONYMS.has(w) || w.includes('.')) return w;
  const elided = w.match(/^([DL])'(.+)$/);
  if (elided) return elided[1].toLowerCase() + "'" + word(elided[2], 1);
  const low = w.toLowerCase();
  if (i > 0 && SMALL.has(low)) return low;
  if (low === 'eme' || low === 'ème') return 'e';
  if (ACCENTS[w]) return ACCENTS[w];
  return low.charAt(0).toUpperCase() + low.slice(1);
}

/** "SALLE NOEL JOSEPHE" → "Salle Noël Josèphe" */
export function prettyName(s) {
  if (!s) return s;
  return s.trim().replace(/\b([DL]) (?=[AEIOUYHÉ])/g, "$1'").split(/\s+/)
    .map((w, i) => w.split('-').map((p, k) => word(p, i + k)).join('-')).join(' ');
}

/** "SAINT POL SUR MER" → "Saint-Pol-sur-Mer" (convention des noms de communes) */
export function prettyCity(s) {
  if (!s) return s;
  return s.trim().split(/[\s-]+/).map(word).join('-');
}

export function teamName(team, config) {
  return config?.displayNames?.[team] ?? prettyName(team);
}

export function shortName(team, config) {
  if (config?.shortNames?.[team]) return config.shortNames[team];
  const w = team.replace(/\s+\d+$/, '').split(/\s+/).filter(x => !SMALL.has(x.toLowerCase()));
  return (w.length > 1 ? w.map(x => x[0]).join('').slice(0, 3) : w[0].slice(0, 3)).toUpperCase();
}

// ---------- Dates (toujours en heure de Paris) ----------

const TZ = 'Europe/Paris';

function parisOffsetMinutes(utcMs) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(new Date(utcMs)).map(x => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - utcMs) / 60000);
}

/** Date + heure locales de Paris → Date absolue. Sans heure : midi (pour trier sans ambiguïté). */
export function kickoff(m) {
  const [y, mo, d] = m.date.split('-').map(Number);
  const [h, mi] = (m.time || '12:00').split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  return new Date(guess - parisOffsetMinutes(guess) * 60000);
}

// ---------- Règles FFVB ----------

/** Points au classement : 3-0 / 3-1 = 3, 3-2 = 2, 2-3 = 1, 1-3 / 0-3 = 0. */
export function matchPoints(setsWon, setsLost) {
  if (setsWon === 3) return setsLost === 2 ? 2 : 3;
  return setsWon === 2 ? 1 : 0;
}

const ratio = (a, b) => (b === 0 ? (a > 0 ? Infinity : 0) : a / b);

/** Départage FFVB : points, victoires, coefficient sets, coefficient points. */
export function compareRows(a, b) {
  return b.pts - a.pts || b.won - a.won || ratio(b.setsFor, b.setsAgainst) - ratio(a.setsFor, a.setsAgainst)
    || ratio(b.ptsFor, b.ptsAgainst) - ratio(a.ptsFor, a.ptsAgainst) || a.team.localeCompare(b.team);
}

export function emptyRow(team) {
  return { team, pts: 0, played: 0, won: 0, lost: 0, setsFor: 0, setsAgainst: 0, ptsFor: 0, ptsAgainst: 0 };
}

export function applyResult(row, setsFor, setsAgainst, ptsFor = 0, ptsAgainst = 0) {
  row.played++;
  row.pts += matchPoints(setsFor, setsAgainst);
  if (setsFor > setsAgainst) row.won++; else row.lost++;
  row.setsFor += setsFor; row.setsAgainst += setsAgainst;
  row.ptsFor += ptsFor; row.ptsAgainst += ptsAgainst;
}

/** Classement recalculé à partir des matchs joués (sert à l'évolution et au simulateur). */
export function computeStandings(teams, matches) {
  const rows = new Map(teams.map(t => [t, emptyRow(t)]));
  for (const m of matches) {
    if (!m.played) continue;
    const [sh, sa] = m.sets, [ph, pa] = m.points || [0, 0];
    applyResult(rows.get(m.home) ?? rows.set(m.home, emptyRow(m.home)).get(m.home), sh, sa, ph, pa);
    applyResult(rows.get(m.away) ?? rows.set(m.away, emptyRow(m.away)).get(m.away), sa, sh, pa, ph);
  }
  return [...rows.values()].sort(compareRows).map((r, i) => ({ ...r, rank: i + 1 }));
}

// ---------- Calendrier .ics ----------

const icsEscape = s => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

function fold(line) {
  // Lignes de 75 octets maximum (RFC 5545), sans couper un caractère UTF-8.
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out = []; let cur = '';
  for (const ch of line) {
    if (enc.encode(cur + ch).length > (out.length ? 74 : 75)) { out.push(cur); cur = ''; }
    cur += ch;
  }
  out.push(cur);
  return out.join('\r\n ');
}

const pad = n => String(n).padStart(2, '0');
const icsLocal = (y, mo, d, h, mi) => `${y}${pad(mo)}${pad(d)}T${pad(h)}${pad(mi)}00`;

const VTIMEZONE = [
  'BEGIN:VTIMEZONE', 'TZID:Europe/Paris',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
  'END:VTIMEZONE'
];

/**
 * events: [{ uid, date:'YYYY-MM-DD', time:'HH:MM'|null, durationMin, summary, description, location, geo:[lat,lon]|null, url }]
 */
export function buildIcs({ name, events, now = new Date() }) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//VC Lievin//Calendrier R1//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(name)}`, 'X-WR-TIMEZONE:Europe/Paris', 'REFRESH-INTERVAL;VALUE=DURATION:PT12H', 'X-PUBLISHED-TTL:PT12H', ...VTIMEZONE];
  for (const e of events) {
    const [y, mo, d] = e.date.split('-').map(Number);
    L.push('BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${stamp}`);
    if (e.time) {
      const [h, mi] = e.time.split(':').map(Number);
      const end = new Date(Date.UTC(y, mo - 1, d, h, mi) + (e.durationMin || 120) * 60000);
      L.push(`DTSTART;TZID=Europe/Paris:${icsLocal(y, mo, d, h, mi)}`,
        `DTEND;TZID=Europe/Paris:${icsLocal(end.getUTCFullYear(), end.getUTCMonth() + 1, end.getUTCDate(), end.getUTCHours(), end.getUTCMinutes())}`);
    } else {
      const next = new Date(Date.UTC(y, mo - 1, d + 1));
      L.push(`DTSTART;VALUE=DATE:${y}${pad(mo)}${pad(d)}`, `DTEND;VALUE=DATE:${next.getUTCFullYear()}${pad(next.getUTCMonth() + 1)}${pad(next.getUTCDate())}`);
    }
    L.push(`SUMMARY:${icsEscape(e.summary)}`);
    if (e.location) L.push(`LOCATION:${icsEscape(e.location)}`);
    if (e.geo) L.push(`GEO:${e.geo[0].toFixed(6)};${e.geo[1].toFixed(6)}`);
    if (e.description) L.push(`DESCRIPTION:${icsEscape(e.description)}`);
    if (e.url) L.push(`URL:${e.url}`);
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.map(fold).join('\r\n') + '\r\n';
}

/** Évènement .ics d'un match, à partir des données du site. */
export function matchEvent(m, data, { emoji = true } = {}) {
  const c = data.config;
  const v = m.venue ? data.venues[m.venue] : null;
  const home = teamName(m.home, c), away = teamName(m.away, c);
  const summary = m.played
    ? `${home} ${m.sets[0]}-${m.sets[1]} ${away}`
    : `${emoji ? '🏐 ' : ''}${home} – ${away}`;
  const lines = [`${data.source.pouleLabel} · Journée ${m.journee}`];
  if (v) lines.push(`${prettyName(v.name)}${v.street ? ' — ' + prettyName(v.street) : ''}${v.city ? ', ' + v.postcode + ' ' + prettyCity(v.city) : ''}`);
  else if (m.venueName) lines.push(prettyName(m.venueName));
  if (m.referee) lines.push(`Arbitrage : ${prettyName(m.referee)}`);
  if (m.played && m.setScores?.length) lines.push(`Sets : ${m.setScores.map(s => s.join('-')).join(', ')}`);
  if (m.sheetUrl) lines.push(`Feuille de match : ${m.sheetUrl}`);
  if (c.siteUrl) lines.push(`Toutes les infos : ${c.siteUrl}`);
  const location = v
    ? [prettyName(v.name), v.street && prettyName(v.street), v.postcode && `${v.postcode} ${prettyCity(v.city)}`].filter(Boolean).join(', ')
    : (m.venueName ? prettyName(m.venueName) : '');
  return {
    uid: `${m.code}-${data.source.season.replace('/', '-')}@vc-lievin-r1`,
    date: m.date, time: m.time, durationMin: c.matchDurationMinutes,
    summary, description: lines.join('\n'), location,
    geo: v?.lat != null ? [v.lat, v.lon] : null,
    url: c.siteUrl || null
  };
}
