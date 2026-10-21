#!/usr/bin/env node
// Mise à jour quotidienne : lit le calendrier officiel FFVB de la poule, complète avec les fiches de match
// (adresses des salles, couleurs des clubs), géolocalise les salles, calcule les trajets depuis Liévin,
// puis écrit data/data.json et les calendriers .ics. Aucune dépendance : Node 20+ suffit.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIcs, matchEvent, teamName, prettyName } from '../assets/lib.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FFVB = 'https://www.ffvbbeach.org/ffvbapp';
const UA = 'Mozilla/5.0 (compatible; vc-lievin-r1/1.0; site de club)';
const DATA_FILE = path.join(ROOT, 'data', 'data.json');

const config = JSON.parse(await readFile(path.join(ROOT, 'site.config.json'), 'utf8'));
const { season, codent, poule } = config;
const previous = await readJson(DATA_FILE);
const log = (...a) => console.log('•', ...a);

async function readJson(file) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return null; }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchBuffer(url, opts = {}, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { ...opts, headers: { 'User-Agent': UA, ...opts.headers }, signal: AbortSignal.timeout(25000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      if (i >= tries) throw new Error(`${url} → ${e.message}`);
      await sleep(2000 * i);
    }
  }
}

// ---------- HTML FFVB ----------

const decodeEntities = s => s
  .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#0*39;|&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&');
const cellText = h => decodeEntities(h.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const clean = s => (s && s.trim() ? s.trim() : null);

function htmlRows(html) {
  // Le HTML FFVB intercale des <form> entre les cellules : on découpe chaque <tr> jusqu'au suivant.
  return [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)(?=<tr\b|<\/table>|$)/gi)].map(m => ({
    raw: m[1],
    cells: [...m[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(c => cellText(c[1]))
  }));
}

const num = t => (t === '' || t == null ? 0 : Number(t));
const coef = t => (t && !Number.isNaN(Number(t)) ? Number(t) : null);
const isoDate = d => { const [dd, mm, yy] = d.split('/'); return `${yy.length === 2 ? '20' + yy : yy}-${mm}-${dd}`; };

function parseStandings(rows) {
  return rows.filter(r => r.cells.length >= 19 && /^\d+\.$/.test(r.cells[0]) && r.cells[1]).map(({ raw, cells: c }) => ({
    rank: parseInt(c[0], 10), team: c[1], pts: num(c[2]), played: num(c[3]), won: num(c[4]), lost: num(c[5]), forfeits: num(c[6]),
    r30: num(c[7]), r31: num(c[8]), r32: num(c[9]), r23: num(c[10]), r13: num(c[11]), r03: num(c[12]),
    setsFor: num(c[13]), setsAgainst: num(c[14]), setsRatio: coef(c[15]), ptsFor: num(c[16]), ptsAgainst: num(c[17]), ptsRatio: coef(c[18]),
    equipe: raw.match(/name=equipe value='?(\d+)/)?.[1] ?? null,
    clubId: raw.match(/name=cnclub value='?(\d+)/)?.[1] ?? null,
    website: raw.match(/<a href='([^']+)'[^>]*class='lienquestion'/)?.[1] ?? null
  }));
}

function parseMatches(rows) {
  let journee = null;
  const out = [];
  for (const { cells: c } of rows) {
    const head = c[0] ?? '';
    const j = head.match(/^Journ\S*e\s+(\d+)/i);
    if (j && c.length <= 2) { journee = Number(j[1]); continue; }
    if (!/^[A-Z0-9]{2,4}\d{3}$/.test(head) || c.length < 6 || !/^\d{2}\/\d{2}\/\d{2,4}$/.test(c[1])) continue;
    const m = { code: head, journee, date: isoDate(c[1]), time: /^\d{1,2}:\d{2}$/.test(c[2]) ? c[2].padStart(5, '0') : null, home: c[3], away: c[5] };
    if (/^\d+$/.test(c[6] ?? '') && /^\d+$/.test(c[7] ?? '')) {
      const detail = c[8] ?? '';
      m.played = true;
      m.sets = [Number(c[6]), Number(c[7])];
      m.setScores = [...detail.matchAll(/(\d+)\s*:\s*(\d+)/g)].map(x => [Number(x[1]), Number(x[2])]);
      const total = (c[9] ?? '').match(/(\d+)\s*-\s*(\d+)/);
      m.points = total ? [Number(total[1]), Number(total[2])]
        : m.setScores.reduce((a, s) => [a[0] + s[0], a[1] + s[1]], [0, 0]);
      m.forfeit = /forfait/i.test(detail) || (m.setScores.length > 0 && m.setScores.every(s => Math.min(...s) === 0));
      m.referee = clean(c[10]);
      m.sheetUrl = `${FFVB}/resu/ffvolley_fdme.php?saison=${season}&codent=${codent}&codmatch=${head}`;
    } else {
      m.played = false;
      m.venueName = clean(c[7]);
      m.referee = clean(c[9]);
    }
    out.push(m);
  }
  return out;
}

// ---------- Fiches de match (PDF) ----------

function unescapePdf(s) {
  return s.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_, e) => {
    if (/^[0-7]/.test(e)) return String.fromCharCode(parseInt(e, 8));
    return { n: '\n', r: '\r', t: '\t', b: '', f: '', '(': '(', ')': ')', '\\': '\\' }[e];
  });
}

function pdfLines(buf) {
  const s = buf.toString('latin1');
  const lines = [];
  const re = /(?<!end)stream\r?\n/g;
  let m;
  while ((m = re.exec(s))) {
    const start = m.index + m[0].length;
    const end = s.indexOf('endstream', start);
    if (end < 0) break;
    re.lastIndex = end + 9;
    let content;
    try { content = inflateSync(buf.subarray(start, end)).toString('latin1'); } catch { continue; }
    for (const t of content.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)) lines.push(unescapePdf(t[1]));
  }
  return lines.map(l => decodeEntities(l).replace(/ï¿½|�/g, '').replace(/\s+/g, ' ').trim());
}

const CLUB_HEADER = /^(\d+) - (\d{7})$/;

function readVenue(arr, i) {
  while (i < arr.length && !arr[i]) i++;
  const name = arr[i];
  // Pas de salle renseignée : on tomberait sur le pied de page de la ligue ou sur le club suivant.
  if (!name || /^Ligue\b/i.test(name) || CLUB_HEADER.test(name)) return null;
  const street = [];
  for (let j = i + 1; j < arr.length && j <= i + 4; j++) {
    const pc = arr[j].match(/^(\d{5})\s+(.+)$/);
    if (pc) {
      const [, city, note] = pc[2].match(/^(.+?)\s*(?:\((.+)\))?$/);
      const v = { name, street: street.join(', ') || null, postcode: pc[1], city, note: note ?? null };
      for (let k = j + 1; k < Math.min(arr.length, j + 9); k++) {
        const l = arr[k];
        if (/^Salle (de repli|principale)/.test(l) || CLUB_HEADER.test(l) || l === 'Arbitre.s') break;
        let x;
        if ((x = l.match(/^Sol\s*:\s*(.*)$/))) v.floor = clean(x[1] || arr[k + 1]);
        if ((x = l.match(/^Capacit\S*\s*:\s*(.*)$/))) v.capacity = parseInt(x[1] || arr[k + 1], 10) || null;
      }
      return v;
    }
    if (arr[j]) street.push(arr[j]);
  }
  return { name, street: null, postcode: null, city: null };
}

function parseFiche(lines) {
  const out = { venue: null, clubs: [] };
  const iSalle = lines.indexOf('Salle');
  if (iSalle >= 0) out.venue = readVenue(lines, iSalle + 1);
  const heads = lines.map((l, i) => (CLUB_HEADER.test(l) ? i : -1)).filter(i => i >= 0);
  heads.forEach((i, n) => {
    const [, equipe, clubId] = lines[i].match(CLUB_HEADER);
    const block = lines.slice(i + 1, n + 1 < heads.length ? heads[n + 1] - 1 : lines.length);
    const colors = block.find(l => l.startsWith('Couleurs'));
    const ip = block.findIndex(l => /^Salle principale/.test(l));
    const ir = block.findIndex(l => /^Salle de repli/.test(l));
    out.clubs.push({
      equipe, clubId, clubName: lines[i - 1],
      colors: colors ? clean(colors.replace(/^Couleurs\s*:\s*/, '').split(/\s+-\s+/)[0]) : null,
      mainVenue: ip >= 0 ? readVenue(block, ip + 1) : null,
      backupVenue: ir >= 0 ? readVenue(block, ir + 1) : null
    });
  });
  return out;
}

async function fetchFiche(code) {
  const body = new URLSearchParams({ wss_saison: season, codmatch: code, codent });
  const buf = await fetchBuffer(`${FFVB}/adressier/fiche_match_ffvb.php`, {
    method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  if (buf.subarray(0, 4).toString() !== '%PDF') throw new Error(`fiche ${code} : réponse inattendue`);
  return parseFiche(pdfLines(buf));
}

// ---------- Salles : géolocalisation et trajets ----------

const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const venueKey = v => norm(`${v.name} ${v.postcode || v.city || ''}`).toLowerCase().replace(/ /g, '-');

async function geocode(v) {
  const queries = [];
  if (v.street) queries.push(`${v.street} ${v.postcode || ''} ${v.city || ''}`);
  queries.push(`${v.city || v.name}`);
  for (const [n, q] of queries.entries()) {
    for (const base of ['https://api-adresse.data.gouv.fr/search/', 'https://data.geopf.fr/geocodage/search']) {
      try {
        const params = new URLSearchParams({ q, limit: '1' });
        if (v.postcode) params.set('postcode', v.postcode);
        if (n > 0) params.set('type', 'municipality');
        const json = JSON.parse((await fetchBuffer(`${base}?${params}`, {}, 2)).toString('utf8'));
        const f = json.features?.[0];
        if (f && (n > 0 || f.properties.score >= 0.4)) {
          return { lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], geoPrecision: n === 0 ? f.properties.type : 'ville' };
        }
        break;
      } catch { /* on essaie le service suivant */ }
    }
  }
  return null;
}

const toRad = d => (d * Math.PI) / 180;
function haversineKm(a, b) {
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

async function route(from, to) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false`;
    const json = JSON.parse((await fetchBuffer(url, {}, 2)).toString('utf8'));
    const r = json.routes?.[0];
    if (json.code === 'Ok' && r) return { driveKm: Math.round(r.distance / 100) / 10, driveMin: Math.round(r.duration / 60), routeSource: 'osrm' };
  } catch { /* estimation ci-dessous */ }
  const km = haversineKm(from, to) * 1.3;
  return { driveKm: Math.round(km), driveMin: Math.round((km / 70) * 60 + 5), routeSource: 'estimation' };
}

// ---------- Programme principal ----------

const calendarUrl = `${FFVB}/resu/vbspo_calendrier.php?saison=${season}&codent=${codent}&poule=${poule}`;
log('Calendrier FFVB', calendarUrl);
const html = new TextDecoder('windows-1252').decode(await fetchBuffer(calendarUrl));
const rows = htmlRows(html);
const standings = parseStandings(rows);
const matches = parseMatches(rows);
const pouleTitle = cellText(html.match(/class='titreblanc'[^>]*>([^<]+)</)?.[1] ?? poule);

if (standings.length < 4 || matches.length < standings.length) {
  throw new Error(`Page FFVB illisible (${standings.length} équipes, ${matches.length} matchs) : données précédentes conservées.`);
}
if (!standings.some(s => s.team === config.team)) {
  throw new Error(`Équipe « ${config.team} » absente de la poule ${poule} : vérifier site.config.json.`);
}
log(`${standings.length} équipes, ${matches.length} matchs dont ${matches.filter(m => m.played).length} joués`);

// Clubs et salles : on repart des données de la veille, puis on rafraîchit avec les fiches du jour.
const teams = {};
const venues = { ...(previous?.venues ?? {}) };
for (const s of standings) {
  teams[s.team] = { ...(previous?.teams?.[s.team] ?? {}), equipe: s.equipe, clubId: s.clubId, website: s.website };
}
const byEquipe = Object.fromEntries(Object.entries(teams).map(([t, v]) => [v.equipe, t]));

function addVenue(v) {
  if (!v?.name) return null;
  const key = venueKey(v);
  const old = venues[key];
  const sameAddress = old && old.street === v.street && old.postcode === v.postcode;
  venues[key] = { ...(sameAddress ? old : {}), ...Object.fromEntries(Object.entries(v).filter(([, x]) => x != null)) };
  return key;
}

const now = Date.now();
const upcoming = matches.filter(m => !m.played).sort((a, b) => a.date.localeCompare(b.date));
const ficheCodes = [];
const covered = new Set();
const isOurs = m => m.home === config.team || m.away === config.team;
// Les 3 prochains matchs de l'équipe, puis de quoi couvrir tous les clubs de la poule.
for (const m of upcoming.filter(isOurs).slice(0, 3)) { ficheCodes.push(m.code); covered.add(m.home).add(m.away); }
for (const m of upcoming) {
  if (covered.size >= standings.length) break;
  if (!covered.has(m.home) || !covered.has(m.away)) { ficheCodes.push(m.code); covered.add(m.home).add(m.away); }
}

const ficheVenues = {};
for (const code of ficheCodes) {
  try {
    const f = await fetchFiche(code);
    if (f.venue) ficheVenues[code] = addVenue(f.venue);
    for (const c of f.clubs) {
      const team = byEquipe[c.equipe];
      if (!team) continue;
      Object.assign(teams[team], {
        clubName: c.clubName ? prettyName(c.clubName) : teams[team].clubName,
        colors: c.colors ?? teams[team].colors,
        mainVenue: addVenue(c.mainVenue) ?? teams[team].mainVenue,
        backupVenue: addVenue(c.backupVenue)
      });
    }
  } catch (e) {
    console.warn('! fiche', code, e.message);
  }
  await sleep(400);
}
log(`${ficheCodes.length} fiches de match lues`);

// Salle de chaque match.
const prevMatches = Object.fromEntries((previous?.matches ?? []).map(m => [m.code, m]));
function findVenueByName(name, team) {
  const n = norm(name);
  const own = [teams[team]?.mainVenue, teams[team]?.backupVenue].filter(Boolean);
  return own.find(k => norm(venues[k]?.name) === n) ?? Object.keys(venues).find(k => norm(venues[k].name) === n) ?? null;
}
const missing = [];
for (const m of matches) {
  if (m.played) {
    const prev = prevMatches[m.code];
    m.venue = prev?.venue ?? teams[m.home]?.mainVenue ?? null;
    m.venueGuessed = prev ? Boolean(prev.venueGuessed) : true;
    if (prev?.venueName) m.venueName = prev.venueName;
  } else {
    m.venue = ficheVenues[m.code] ?? (m.venueName ? findVenueByName(m.venueName, m.home) : null);
    if (!m.venue && m.venueName) missing.push(m);
  }
}
for (const m of missing.slice(0, 10)) {
  try {
    const f = await fetchFiche(m.code);
    m.venue = addVenue(f.venue);
  } catch (e) { console.warn('! salle', m.code, e.message); }
  await sleep(400);
}

// Géolocalisation (une seule fois par adresse) puis trajet depuis la salle principale de l'équipe.
const homeVenue = teams[config.team]?.mainVenue ?? previous?.homeVenue ?? null;
for (const [key, v] of Object.entries(venues)) {
  if (v.lat == null) {
    const g = await geocode(v);
    if (g) Object.assign(v, g);
    else console.warn('! adresse introuvable', key);
    await sleep(150);
  }
}
const home = homeVenue && venues[homeVenue];
if (home?.lat != null) {
  for (const v of Object.values(venues)) {
    if (v.lat == null) continue;
    const fromKey = `${home.lat.toFixed(5)},${home.lon.toFixed(5)}`;
    if (v.routeFrom === fromKey && v.driveMin != null && v.routeSource === 'osrm') continue;
    Object.assign(v, v === home ? { driveKm: 0, driveMin: 0, routeSource: 'osrm' } : await route(home, v), { routeFrom: fromKey });
    await sleep(300);
  }
}

// On ne garde que les salles réellement utilisées.
const used = new Set([homeVenue, ...matches.map(m => m.venue), ...Object.values(teams).flatMap(t => [t.mainVenue, t.backupVenue])].filter(Boolean));
for (const k of Object.keys(venues)) if (!used.has(k)) delete venues[k];

const pouleLabel = prettyName(pouleTitle.replace(/^\S+\s+-\s+/, '')).replace(/\bPoule\b/, '· Poule');
const data = {
  version: 1,
  generatedAt: new Date(now).toISOString(),
  config,
  source: { season, codent, poule, calendarUrl, pouleTitle, pouleLabel },
  homeVenue,
  standings,
  teams,
  venues,
  matches
};

await mkdir(path.join(ROOT, 'data'), { recursive: true });
await writeFile(DATA_FILE, JSON.stringify(data, null, 1) + '\n');
log('data/data.json écrit');

// Calendriers .ics : l'équipe (abonnement) et toute la poule.
await mkdir(path.join(ROOT, 'calendar'), { recursive: true });
const ours = matches.filter(isOurs);
const slug = config.team.toLowerCase().replace(/[^a-z0-9]+/g, '-');
await writeFile(path.join(ROOT, 'calendar', `${slug}.ics`),
  buildIcs({ name: `${teamName(config.team, config)} · Volley R1`, events: ours.map(m => matchEvent(m, data)) }));
await writeFile(path.join(ROOT, 'calendar', `poule-${poule.toLowerCase()}.ics`),
  buildIcs({ name: `${pouleLabel} · Volley`, events: matches.map(m => matchEvent(m, data, { emoji: false })) }));
log(`calendar/${slug}.ics et calendar/poule-${poule.toLowerCase()}.ics écrits`);
