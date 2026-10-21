import {
  kickoff, teamName, shortName, prettyName, prettyCity, computeStandings, compareRows, applyResult, matchPoints, buildIcs, matchEvent
} from './lib.js';

// ---------- Petits outils ----------

const TZ = 'Europe/Paris';
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const fmt = (d, o) => new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, ...o }).format(d);
const isoParis = d => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const longDate = m => cap(fmt(m.ko, { weekday: 'long', day: 'numeric', month: 'long' }));
const shortDate = m => fmt(m.ko, { weekday: 'short', day: 'numeric', month: 'short' });
const hour = t => { if (!t) return 'horaire à confirmer'; const [h, mi] = t.split(':'); return `${+h}h${mi}`; };
const clock = t => fmt(new Date(t), { hour: '2-digit', minute: '2-digit' }).replace(':', 'h');
const dur = min => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`);
const plural = (n, one, many = one + 's') => `${n} ${n > 1 ? many : one}`;
const ord = n => (n === 1 ? '1<sup>er</sup>' : `${n}<sup>e</sup>`);
const ordTxt = n => (n === 1 ? '1er' : `${n}e`);
const coef = (a, b) => (b === 0 ? (a > 0 ? '∞' : '–') : (a / b).toFixed(3));
const store = {
  get(k) { try { return localStorage.getItem('vcl:' + k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('vcl:' + k, v); } catch { /* stockage indisponible */ } }
};

const ICONS = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  calplus: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M12 13v5M9.5 15.5h5"/>',
  podium: '<path d="M3 21h18M5 21v-6h4v6M10 21V8h4v13M15 21v-9h4v9"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.2a5 5 0 0 1 5.5 4.8"/>',
  bars: '<path d="M4 20V11M10 20V5M16 20v-6M2 20h20"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  nav: '<path d="M3 11l18-8-8 18-2-8z"/>',
  share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
  car: '<path d="M5 16l1.5-5a2 2 0 0 1 2-1.5h7a2 2 0 0 1 2 1.5L19 16M3 16h18v3H3zM7 19v2M17 19v2"/>',
  sheet: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h7"/>',
  whistle: '<circle cx="8" cy="14" r="5"/><path d="M11.5 10.5L21 7v4l-6.5 1.8"/><circle cx="8" cy="14" r="1.2"/>'
};
const icon = (n, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;

const COURT = `<svg viewBox="0 0 200 112" fill="none" stroke="#fff" stroke-width="1.4"><rect x="10" y="11" width="180" height="90"/><path d="M100 3v106" stroke-width="3"/><path d="M70 11v90M130 11v90"/><path d="M70 101v9M130 101v9M70 2v9M130 2v9" stroke-dasharray="2 2"/><circle cx="148" cy="40" r="9"/><path d="M139.5 37c5 2 12 2 17-1M141 46c4-4 11-6 16-5M146 31c-1 5 1 13 6 17"/></svg>`;

const VIEWS = [
  { id: 'accueil', label: 'Accueil', icon: 'home' },
  { id: 'calendrier', label: 'Calendrier', icon: 'calendar' },
  { id: 'classement', label: 'Classement', icon: 'podium' },
  { id: 'adversaires', label: 'Adversaires', icon: 'users' },
  { id: 'stats', label: 'Stats', icon: 'bars' }
];

const RES = {
  W: { label: 'Victoire', letter: 'V', chip: 'win' },
  W2: { label: 'Victoire au tie-break', letter: 'V', chip: 'win' },
  L1: { label: 'Défaite au tie-break', letter: 'D', chip: 'bonus' },
  L: { label: 'Défaite', letter: 'D', chip: 'loss' }
};

let D; // données brutes (data/data.json)
let M; // modèle dérivé
const state = {
  view: 'accueil',
  calMode: store.get('calMode') || 'team',
  calFilter: 'all',
  pouleJ: null,
  pouleTeam: '',
  showAll: false,
  simJ: null,
  sim: {}
};

// ---------- Modèle ----------

const N = t => teamName(t, D.config);
const S = t => shortName(t, D.config);

function persp(m, team = M.T) {
  const home = m.home === team;
  const r = { home, opp: home ? m.away : m.home };
  if (m.played) {
    r.sf = home ? m.sets[0] : m.sets[1];
    r.sa = home ? m.sets[1] : m.sets[0];
    r.pf = home ? m.points[0] : m.points[1];
    r.pa = home ? m.points[1] : m.points[0];
    r.sets = m.setScores.map(s => (home ? s : [s[1], s[0]]));
    r.win = r.sf > r.sa;
    r.pts = matchPoints(r.sf, r.sa);
    r.code = r.win ? (r.pts === 3 ? 'W' : 'W2') : (r.pts === 1 ? 'L1' : 'L');
  }
  return r;
}

function buildModel() {
  const T = D.config.team;
  const now = Date.now();
  const teams = D.standings.map(s => s.team);
  const matches = D.matches.map(m => ({ ...m, ko: kickoff(m) })).sort((a, b) => a.ko - b.ko);
  const LIVE = 3 * 3600e3;
  const isOurs = m => m.home === T || m.away === T;
  const ours = matches.filter(isOurs);
  const played = matches.filter(m => m.played);
  const model = {
    T, now, teams, matches, ours, played, isOurs,
    byCode: new Map(matches.map(m => [m.code, m])),
    row: t => D.standings.find(s => s.team === t),
    next: ours.find(m => !m.played && m.ko.getTime() > now - LIVE),
    pending: ours.filter(m => !m.played && m.ko.getTime() <= now - LIVE),
    last: ours.filter(m => m.played).at(-1),
    journees: [...new Set(matches.map(m => m.journee))].sort((a, b) => a - b)
  };
  model.history = rankHistory(model);
  // Contrôle : notre recalcul doit retrouver l'ordre officiel (sinon pénalités, forfaits…).
  const recomputed = computeStandings(teams, played).map(r => r.team).join('|');
  model.officialMatches = recomputed === D.standings.map(s => s.team).join('|');
  return model;
}

/** Rang de chaque équipe après chaque semaine où des matchs ont été joués. */
function rankHistory(model) {
  const weekOf = iso => {
    const d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  };
  const weeks = [...new Set(model.played.map(m => weekOf(m.date)))].sort();
  return weeks.map(w => {
    const upTo = model.played.filter(m => weekOf(m.date) <= w);
    const inWeek = upTo.filter(m => weekOf(m.date) === w);
    const st = computeStandings(model.teams, upTo);
    return {
      week: w,
      label: fmt(inWeek.at(-1).ko, { day: 'numeric', month: 'short' }),
      rows: Object.fromEntries(st.map(r => [r.team, r]))
    };
  });
}

function form(team, n = 5) {
  return M.played.filter(m => m.home === team || m.away === team).slice(-n).map(m => ({ m, ...persp(m, team) }));
}

function formHTML(team, n = 5, pad = true) {
  const f = form(team, n);
  const cells = f.map(x => `<i class="${x.code}" title="${esc(`${RES[x.code].label} ${x.sf}-${x.sa} ${x.home ? 'contre' : 'à'} ${N(x.opp)} (${shortDate(x.m)})`)}">${RES[x.code].letter}</i>`);
  while (pad && cells.length < n) cells.unshift('<i class="N" title="Pas encore joué">·</i>');
  return `<span class="form" aria-label="Forme : ${esc(f.map(x => RES[x.code].letter).join(' ') || 'aucun match')}">${cells.join('')}</span>`;
}

const venueOf = m => (m.venue && D.venues[m.venue]) || (m.venueName ? { name: m.venueName } : null);
const vName = v => prettyName(v.name);
const vAddr = v => [v.street && prettyName(v.street), v.postcode && `${v.postcode} ${prettyCity(v.city)}`].filter(Boolean).join(', ');
const vCity = v => (v.city ? prettyCity(v.city) : '');
const mapsUrl = v => (v.lat != null
  ? `https://www.google.com/maps/dir/?api=1&destination=${v.lat},${v.lon}`
  : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${vName(v)} ${vAddr(v)}`)}`);
const wazeUrl = v => (v.lat != null ? `https://waze.com/ul?ll=${v.lat},${v.lon}&navigate=yes` : null);
const homeCity = () => prettyCity(D.venues[D.homeVenue]?.city || 'Liévin');
const floorTxt = f => (f ? cap(f.replace(/^type\s+/i, '').toLowerCase()) : null);

function travel(m) {
  if (!m.time) return null;
  const v = venueOf(m);
  const buf = D.config.arrivalBufferMinutes ?? 60;
  if (persp(m).home) return { label: 'Arrivée conseillée', at: m.ko.getTime() - buf * 60e3, buf };
  if (v?.driveMin == null) return null;
  const at = Math.floor((m.ko.getTime() - (buf + v.driveMin) * 60e3) / 300e3) * 300e3;
  return { label: `Départ de ${homeCity()} conseillé`, at, buf, drive: v.driveMin, km: v.driveKm, est: v.routeSource !== 'osrm' };
}

const refToken = () => D.config.refereeToken || D.config.team.replace(/\s+\d+$/, '');
const refDuties = () => M.matches.filter(m => !m.played && !M.isOurs(m) && m.referee
  && new RegExp(`(^|\\s)${refToken()}(\\s|$)`, 'i').test(m.referee) && m.ko.getTime() > M.now - 3 * 3600e3);

function daysFromToday(m) {
  return Math.round((Date.parse(m.date) - Date.parse(isoParis(new Date()))) / 864e5);
}
/** « Ce samedi 24 octobre », « Demain, samedi 24 octobre » ou « Samedi 24 octobre ». */
function whenText(m) {
  const rd = relDay(m);
  const day = fmt(m.ko, { day: 'numeric', month: 'long' });
  if (rd.startsWith('Ce ')) return `${rd} ${day}`;
  return rd ? `${rd}, ${longDate(m).toLowerCase()}` : longDate(m);
}
function relDay(m) {
  const d = daysFromToday(m);
  if (d === 0) return 'Aujourd\'hui';
  if (d === 1) return 'Demain';
  if (d === -1) return 'Hier';
  if (d > 1 && d < 7) return 'Ce ' + fmt(m.ko, { weekday: 'long' });
  return '';
}

// ---------- Couleurs des clubs ----------

const COLORS = {
  ROUGE: '#D3122B', BLANC: '#FFFFFF', BLEU: '#1D4E9E', MARINE: '#13254B', CIEL: '#5AA9E6', NOIR: '#18171B', JAUNE: '#F4C400',
  OR: '#C9A227', VERT: '#1C7C3E', ORANGE: '#EF7A14', VIOLET: '#6B3FA0', GRIS: '#8C8C8C', BORDEAUX: '#7B1E2E', GRENAT: '#7A1E2A',
  ROSE: '#E2679A', TURQUOISE: '#19A7A0', ARGENT: '#B8B8B8'
};
function clubColors(team) {
  const raw = (D.teams[team]?.colors || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/BLEU\s+MARINE/g, 'MARINE').replace(/BLEU\s+CIEL/g, 'CIEL');
  const list = raw.split(/[^A-Z]+/).filter(w => COLORS[w]).map(w => COLORS[w]);
  const c1 = list[0] || '#77727E';
  return [c1, list[1] || (c1 === '#FFFFFF' ? '#18171B' : '#FFFFFF')];
}
function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
}
function badge(team, size = '') {
  const [c1, c2] = clubColors(team);
  const fg = luminance(c1) > 0.4 ? '#17151B' : '#FFFFFF';
  return `<span class="badge${size ? ' badge--' + size : ''}" style="--c1:${c1};--c2:${c2};--fg:${fg}" aria-hidden="true">${esc(S(team))}</span>`;
}
function teamHTML(team, { size = 'sm', link = true, right = false } = {}) {
  const inner = right
    ? `<span class="team__name">${esc(N(team))}</span>${badge(team, size)}`
    : `${badge(team, size)}<span class="team__name">${esc(N(team))}</span>`;
  const cls = `team${team === M.T ? ' is-us' : ''}${right ? ' t-r' : ''}`;
  return link ? `<button type="button" class="${cls} tlink" data-team="${esc(team)}">${inner}</button>` : `<span class="${cls}">${inner}</span>`;
}

// ---------- Composants ----------

function setsHTML(p) {
  return `<div class="sets" role="list" aria-label="Score des sets">${p.sets.map((s, i) => `
    <span class="set${s[0] > s[1] ? ' set--won' : ''}" role="listitem" title="Set ${i + 1} : ${s[0]}-${s[1]}"><b>${s[0]}</b><span>${s[1]}</span><small>${i === 4 ? 'TB' : 'S' + (i + 1)}</small></span>`).join('')}
  </div>`;
}

function resultChip(p) {
  const r = RES[p.code];
  const bonus = p.code === 'L1' ? ' · +1 pt' : p.code === 'W2' ? ' · 2 pts' : '';
  return `<span class="chip chip--${r.chip}">${r.letter} ${p.sf}-${p.sa}${bonus}</span>`;
}

function ha(m) {
  return persp(m).home ? '<span class="chip chip--home">Domicile</span>' : '<span class="chip">Extérieur</span>';
}

function previousMeeting(m) {
  const p = persp(m);
  return M.ours.find(x => x !== m && x.code !== m.code && persp(x).opp === p.opp && x.ko < m.ko);
}

// ---------- Rendu général ----------

function render() {
  const v = VIEWS.find(x => x.id === state.view) ? state.view : 'accueil';
  document.querySelectorAll('[data-nav]').forEach(a => a.setAttribute('aria-current', a.dataset.nav === v ? 'page' : 'false'));
  const html = { accueil: viewHome, calendrier: viewCalendar, classement: viewStandings, adversaires: viewOpponents, stats: viewStats }[v]();
  $('#app').innerHTML = `<div class="view">${html}</div>`;
  drawCharts();
  document.title = v === 'accueil' ? `${D.config.clubShort ?? 'VC Liévin'} R1` : `${VIEWS.find(x => x.id === v).label} · ${N(M.T)}`;
  tick();
}

function renderChrome() {
  const fresh = $('#fresh');
  const age = (Date.now() - Date.parse(D.generatedAt)) / 36e5;
  const ago = age < 1 ? 'il y a moins d\'1 h' : age < 24 ? `il y a ${Math.floor(age)} h` : `le ${fmt(new Date(D.generatedAt), { day: 'numeric', month: 'short' })}`;
  fresh.dataset.state = age > 36 ? 'late' : 'ok';
  fresh.href = D.source.calendarUrl;
  fresh.title = `Données FFVB récupérées le ${fmt(new Date(D.generatedAt), { dateStyle: 'full', timeStyle: 'short' })}`;
  fresh.innerHTML = `<span>Mis à jour ${ago}</span>`;
  $('#brand-sub').textContent = D.source.pouleLabel.replace('Régionale 1 Masculins', 'R1 Masculins');
  $('#brand-name').textContent = N(M.T);
  const v = D.venues[D.homeVenue];
  $('#foot').innerHTML = `
    <span>${esc(D.teams[M.T]?.clubName || '')}${D.teams[M.T]?.colors ? ' · ' + esc(cap(D.teams[M.T].colors.toLowerCase())) : ''}${v ? ' · ' + esc(vName(v)) + ', ' + esc(vCity(v)) : ''}</span>
    <span>Données officielles FFVB, mises à jour chaque jour · <a href="${esc(D.source.calendarUrl)}" target="_blank" rel="noopener">Page FFVB de la poule</a></span>`;
}

// ---------- Accueil ----------

function viewHome() {
  return `
  <div class="cols cols--home">
    <div class="stack">
      ${heroHTML()}
      ${M.pending.map(m => `<div class="alert">${icon('clock')}<div><b>Résultat en attente</b> · ${esc(N(m.home))} – ${esc(N(m.away))} (${esc(shortDate(m))}). La FFVB ne l'a pas encore publié ; il apparaîtra ici dès sa saisie.</div></div>`).join('')}
      <div class="cols cols--2">
        ${lastResultCard()}
        ${scoutCard()}
      </div>
      ${journeeCard()}
    </div>
    <div class="stack">
      ${positionCard()}
      ${seasonCard()}
      ${refCard()}
      ${subscribeCard()}
    </div>
  </div>`;
}

function heroHTML() {
  const m = M.next;
  if (!m) {
    const r = M.row(M.T);
    return `<section class="hero hero--quiet"><div class="hero__court">${COURT}</div>
      <div class="hero__top"><span class="chip chip--solid">Saison terminée</span></div>
      <div class="hero__teams"><div class="hero__team"><b>${esc(N(M.T))}</b></div></div>
      <p class="hero__when">${ordTxt(r.rank)} · ${plural(r.pts, 'point')} · ${r.won} V – ${r.lost} D</p></section>`;
  }
  const p = persp(m);
  const v = venueOf(m);
  const us = M.row(M.T), them = M.row(p.opp);
  const t = travel(m);
  const prev = previousMeeting(m);
  const rd = relDay(m);
  const live = Date.now() >= m.ko.getTime();
  const left = `<div class="hero__team"><b>${esc(N(m.home))}</b><span class="rank">${ordTxt(M.row(m.home).rank)}</span></div>`;
  const right = `<div class="hero__team"><b>${esc(N(m.away))}</b><span class="rank">${ordTxt(M.row(m.away).rank)}</span></div>`;
  const facts = [
    `<span>Classement <b>${ordTxt(us.rank)}</b> (${plural(us.pts, 'pt')}) contre <b>${ordTxt(them.rank)}</b> (${plural(them.pts, 'pt')})</span>`,
    m.referee ? `<span>Arbitrage <b>${esc(prettyName(m.referee))}</b></span>` : '',
    prev?.played ? `<span>Match aller <b>${esc(`${RES[persp(prev).code].letter} ${persp(prev).sf}-${persp(prev).sa}`)}</b></span>` : '',
    t ? `<span>${esc(t.label)} <b>${clock(t.at)}</b>${t.drive ? ` (${dur(t.drive)} de route${t.est ? ' estimée' : ''})` : ` (${t.buf} min avant)`}</span>` : ''
  ].filter(Boolean).join('');
  return `
  <section class="hero" aria-labelledby="hero-title">
    <div class="hero__court">${COURT}</div>
    <div class="hero__top">
      <span class="chip ${live ? 'chip--live' : 'chip--solid'}">${live ? 'Match en cours' : 'Prochain match'}</span>
      <span>Journée ${m.journee}</span><span aria-hidden="true">·</span>
      <span>${p.home ? 'À domicile' : 'À l\'extérieur'}</span>
    </div>
    <h2 id="hero-title" class="sr">Prochain match : ${esc(N(m.home))} contre ${esc(N(m.away))}</h2>
    <p class="hero__when">${esc(whenText(m))} · ${esc(hour(m.time))}</p>
    <div class="hero__teams">${left}<span class="hero__vs">CONTRE</span>${right}</div>
    <div class="hero__row">
      <div>
        <div class="count__label">${live ? 'Coup d\'envoi donné à ' + esc(hour(m.time)) : 'Coup d\'envoi dans'}</div>
        <div class="count" data-count="${m.ko.getTime()}" aria-live="off">${countCells(m.ko.getTime())}</div>
      </div>
      ${v ? `<div class="hero__place">
        <strong>${icon('pin', 'i-inline')} ${esc(vName(v))}</strong>
        <span class="sub">${esc(vAddr(v) || vCity(v))}${v.driveMin && !p.home ? ` · ${dur(v.driveMin)} · ${Math.round(v.driveKm)} km` : ''}</span>
      </div>` : ''}
    </div>
    <div class="btns">
      ${v ? `<a class="btn btn--light" href="${esc(mapsUrl(v))}" target="_blank" rel="noopener">${icon('nav')}Itinéraire</a>` : ''}
      ${v && wazeUrl(v) ? `<a class="btn" href="${esc(wazeUrl(v))}" target="_blank" rel="noopener">${icon('car')}Waze</a>` : ''}
      <button class="btn" type="button" data-action="agenda" data-code="${m.code}">${icon('calplus')}Agenda</button>
      <button class="btn" type="button" data-action="share" data-code="${m.code}">${icon('share')}Partager</button>
      <button class="btn" type="button" data-action="poster" data-kind="next" data-code="${m.code}">${icon('image')}Affiche</button>
    </div>
    <div class="hero__facts">${facts}</div>
  </section>`;
}

function drawCharts() {
  const b = $('[data-chart="bump"]');
  if (b) b.innerHTML = bumpChart(M.history, b.clientWidth);
  const r = $('[data-chart="rose"]');
  if (r) r.innerHTML = roseChart(r.clientWidth);
}
let resizeT;
window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => M && drawCharts(), 150); });

function countCells(ko) {
  let s = Math.max(0, Math.floor((ko - Date.now()) / 1000));
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const mi = Math.floor(s / 60); s -= mi * 60;
  const cell = (v, l) => `<span class="count__cell"><b>${String(v).padStart(2, '0')}</b><span>${l}</span></span>`;
  return cell(d, d > 1 ? 'jours' : 'jour') + cell(h, 'h') + cell(mi, 'min') + cell(s, 's');
}

function tick() {
  document.querySelectorAll('[data-count]').forEach(el => { el.innerHTML = countCells(+el.dataset.count); });
}

function lastResultCard() {
  const m = M.last;
  if (!m) return `<section class="card"><div class="card__head"><h2 class="card__title">Dernier résultat</h2></div><p class="empty">Aucun match joué pour l'instant.</p></section>`;
  const p = persp(m);
  return `
  <section class="card" aria-labelledby="last-t">
    <div class="card__head"><h2 class="card__title" id="last-t">Dernier résultat</h2><span class="eyebrow">J${m.journee} · ${esc(shortDate(m))}</span></div>
    <div class="vsline">
      <div class="result-line">${teamHTML(m.home)}<b class="score__big num" style="font-size:30px">${m.sets[0]}</b></div>
      <div class="result-line">${teamHTML(m.away)}<b class="score__big num" style="font-size:30px">${m.sets[1]}</b></div>
    </div>
    <hr class="divider">
    <div class="stack" style="gap:10px">
      <div class="result-line">${resultChip(p)}<span class="small muted num">${p.pf} – ${p.pa} pts</span></div>
      ${setsHTML(p)}
      <div class="btns">
        ${m.sheetUrl ? `<a class="btn btn--sm" href="${esc(m.sheetUrl)}" target="_blank" rel="noopener">${icon('sheet')}Feuille de match</a>` : ''}
        <button class="btn btn--sm" type="button" data-action="poster" data-kind="result" data-code="${m.code}">${icon('image')}Affiche</button>
      </div>
    </div>
  </section>`;
}

function scoutCard() {
  const m = M.next;
  if (!m) return '';
  const opp = persp(m).opp;
  const r = M.row(opp);
  const theirs = form(opp, 3).reverse();
  const common = M.teams.filter(t => t !== opp && t !== M.T).map(t => {
    const ourM = M.played.filter(x => M.isOurs(x) && persp(x).opp === t).at(-1);
    const theirM = M.played.filter(x => (x.home === opp || x.away === opp) && persp(x, opp).opp === t).at(-1);
    return ourM && theirM ? { t, us: persp(ourM), them: persp(theirM, opp) } : null;
  }).filter(Boolean);
  return `
  <section class="card" aria-labelledby="scout-t">
    <div class="card__head"><h2 class="card__title" id="scout-t">L'adversaire</h2><button class="link tlink" type="button" data-team="${esc(opp)}">Fiche complète</button></div>
    <div class="tcard__head">${badge(opp, 'lg')}<div><div class="tcard__name">${esc(N(opp))}</div><div class="tcard__club">${esc(D.teams[opp]?.clubName || '')}</div></div></div>
    <div class="kpis" style="margin-top:14px">
      <div class="kpi"><b>${ord(r.rank)}</b><span>${plural(r.pts, 'point')}</span></div>
      <div class="kpi"><b class="num">${r.won}–${r.lost}</b><span>victoires – défaites</span></div>
      <div class="kpi"><b class="num">${r.setsFor}–${r.setsAgainst}</b><span>sets</span></div>
    </div>
    <div class="stack" style="gap:8px;margin-top:14px">
      <div class="result-line"><span class="eyebrow">Forme</span>${formHTML(opp)}</div>
      ${theirs.map(x => `<div class="result-line small"><span>${x.home ? 'contre' : 'à'} ${esc(N(x.opp))}</span>${resultChip(x)}</div>`).join('')}
      ${common.length ? `<hr class="divider" style="margin:6px 0"><span class="eyebrow">Adversaires communs</span>
        ${common.map(c => `<div class="result-line small"><span>${esc(N(c.t))}</span><span class="btns" style="gap:6px"><span class="muted">nous</span>${resultChip(c.us)}<span class="muted">eux</span>${resultChip(c.them)}</span></div>`).join('')}` : ''}
    </div>
  </section>`;
}

function prowHTML(m) {
  const us = M.isOurs(m);
  const mid = m.played
    ? `<b>${m.sets[0]}<span class="muted"> - </span>${m.sets[1]}</b><span class="when">${esc(shortDate(m))}</span>`
    : `<b class="small" style="font:700 15px var(--body)">${esc(hour(m.time))}</b><span class="when">${esc(shortDate(m))}</span>`;
  const v = venueOf(m);
  return `<div class="prow${us ? ' is-us' : ''}">
    <span class="when mono">${esc(m.code)}</span>
    ${teamHTML(m.home, { right: true })}
    <span class="mid">${mid}</span>
    ${teamHTML(m.away)}
    ${!m.played && v ? `<span class="when" style="grid-column:2/-1">${icon('pin', 'i-inline')} ${esc(vName(v))}${v.city ? ', ' + esc(vCity(v)) : ''}${m.referee ? ` · Arbitrage : ${esc(prettyName(m.referee))}` : ''}</span>` : ''}
  </div>`;
}

function journeeCard() {
  const j = M.next?.journee ?? M.last?.journee;
  if (!j) return '';
  const list = M.matches.filter(m => m.journee === j);
  return `
  <section class="card card--flush" aria-labelledby="jt">
    <div class="card__head"><h2 class="card__title" id="jt">Journée ${j} dans la poule</h2><a class="link" href="#calendrier" data-goto-poule="${j}">Toutes les journées</a></div>
    <div class="mlist" style="margin-top:6px">${list.map(prowHTML).join('')}</div>
  </section>`;
}

function positionCard() {
  const st = D.standings;
  const r = M.row(M.T);
  const leader = st[0];
  const above = st[r.rank - 2], below = st[r.rank];
  const i = r.rank - 1;
  const from = Math.max(0, Math.min(i - 2, st.length - 5));
  const slice = st.slice(from, from + 5);
  const gaps = [
    r.rank > 1 ? `<span>À <b>${plural(leader.pts - r.pts, 'pt')}</b> du leader (${esc(N(leader.team))})</span>` : `<span><b>En tête</b> de la poule</span>`,
    above && r.rank > 2 ? (above.pts === r.pts
      ? `<span><b>À égalité</b> avec le ${ordTxt(above.rank)} (${esc(N(above.team))})</span>`
      : `<span>À <b>${plural(above.pts - r.pts, 'pt')}</b> de la ${ordTxt(above.rank)} place</span>`) : '',
    below ? (below.pts === r.pts
      ? `<span><b>À égalité</b> avec le ${ordTxt(below.rank)} (${esc(N(below.team))})</span>`
      : `<span><b>${plural(r.pts - below.pts, 'pt')}</b> d'avance sur le ${ordTxt(below.rank)}</span>`) : ''
  ].filter(Boolean).join('');
  return `
  <section class="card card--flush" aria-labelledby="pos-t">
    <div class="card__head"><h2 class="card__title" id="pos-t">Au classement</h2><a class="link" href="#classement">Complet</a></div>
    <div style="padding:6px 18px 14px" class="stack">
      <div class="posbox"><div class="posbox__rank">${ord(r.rank)}</div><div class="gaps">${gaps}</div></div>
      <div class="result-line"><span class="eyebrow">Forme</span>${formHTML(M.T)}</div>
    </div>
    <div class="tablewrap"><table>
      <thead><tr><th class="t-left" colspan="2">Équipe</th><th>Pts</th><th>J</th><th>V-D</th></tr></thead>
      <tbody>${slice.map(s => `<tr class="mini${s.team === M.T ? ' us' : ''}"><td class="rk">${s.rank}</td><td class="t-left">${teamHTML(s.team)}</td><td class="pts">${s.pts}</td><td>${s.played}</td><td>${s.won}-${s.lost}</td></tr>`).join('')}</tbody>
    </table></div>
  </section>`;
}

function seasonCard() {
  const ours = M.ours;
  const nPlayed = ours.filter(m => m.played).length;
  const home = ours.filter(m => persp(m).home).length;
  const r = M.row(M.T);
  return `
  <section class="card" aria-labelledby="season-t">
    <div class="card__head"><h2 class="card__title" id="season-t">La saison</h2><a class="link" href="#calendrier">Calendrier</a></div>
    ${progressHTML()}
    <div class="kpis" style="margin-top:14px">
      <div class="kpi"><b class="num">${nPlayed}<small>/${ours.length}</small></b><span>matchs joués</span></div>
      <div class="kpi"><b class="num">${r.setsFor}–${r.setsAgainst}</b><span>sets</span></div>
      <div class="kpi"><b class="num">${home}</b><span>matchs à domicile</span></div>
    </div>
  </section>`;
}

function progressHTML() {
  const segs = M.ours.map(m => {
    const p = persp(m);
    const cls = m.played ? (p.win ? 'W' : p.code === 'L1' ? 'L1' : 'L') : (m === M.next ? 'next' : '');
    const tip = m.played ? `J${m.journee} · ${RES[p.code].label} ${p.sf}-${p.sa} ${p.home ? 'contre' : 'à'} ${N(p.opp)}` : `J${m.journee} · ${shortDate(m)} ${p.home ? 'contre' : 'à'} ${N(p.opp)}`;
    return `<i class="${cls}" title="${esc(tip)}"></i>`;
  });
  return `<div class="progress"><div class="progress__bar" role="img" aria-label="${M.ours.filter(m => m.played).length} matchs joués sur ${M.ours.length}">${segs.join('')}</div>
    <div class="legend"><span><i class="form"><i class="W">V</i></i>Victoire</span><span><i class="form"><i class="L1">D</i></i>Défaite 2-3 (1 pt)</span><span><i class="form"><i class="L">D</i></i>Défaite</span></div></div>`;
}

function refCard() {
  const list = refDuties();
  if (!list.length) return '';
  return `
  <section class="card" aria-labelledby="ref-t">
    <div class="card__head"><h2 class="card__title" id="ref-t">Arbitrages du club</h2>${icon('whistle', 'i-head')}</div>
    <p class="note" style="margin-bottom:10px">La FFVB désigne le club « ${esc(prettyName(refToken()))} » pour arbitrer ${list.length > 1 ? 'ces matchs' : 'ce match'} de la poule.</p>
    <div class="stack" style="gap:10px">${list.map(m => {
      const v = venueOf(m);
      return `<div class="vsline small"><b>${esc(N(m.home))} – ${esc(N(m.away))}</b><span class="muted">${esc(longDate(m))} · ${esc(hour(m.time))}${v ? ' · ' + esc(vName(v)) + (v.city ? ', ' + esc(vCity(v)) : '') : ''}</span></div>`;
    }).join('')}</div>
  </section>`;
}

function calUrls() {
  const slug = D.config.team.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  // L'adresse publique du site (siteUrl) sert aussi depuis un aperçu hébergé ailleurs.
  const https = new URL(`calendar/${slug}.ics`, D.config.siteUrl || location.href).href;
  return { https, webcal: https.replace(/^https?:/, 'webcal:'), google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(https.replace(/^https?:/, 'webcal:'))}` };
}

function subscribeCard() {
  const u = calUrls();
  return `
  <section class="card" aria-labelledby="sub-t">
    <div class="card__head"><h2 class="card__title" id="sub-t">Dans votre agenda</h2>${icon('calendar', 'i-head')}</div>
    <p class="small" style="margin-bottom:12px">Abonnez-vous une fois : les ${M.ours.length} matchs s'ajoutent à votre téléphone et les changements d'horaire se mettent à jour tout seuls.</p>
    <div class="btns">
      <a class="btn btn--primary" href="${esc(u.webcal)}">${icon('calplus')}iPhone, Mac, Outlook</a>
      <a class="btn" href="${esc(u.google)}" target="_blank" rel="noopener">Google Agenda</a>
      <button class="btn" type="button" data-action="copy" data-text="${esc(u.https)}">Copier le lien</button>
    </div>
  </section>`;
}

// ---------- Calendrier ----------

function viewCalendar() {
  const team = state.calMode === 'team';
  return `
  <div class="pagehead">
    <div><h1>Calendrier</h1><p>${team ? `Les ${M.ours.length} matchs de ${esc(N(M.T))}. Touchez un match pour la salle, l'itinéraire et le détail des sets.` : `Les ${M.matches.length} matchs de la poule, journée par journée.`}</p></div>
    <div class="seg" role="group" aria-label="Affichage">
      <button type="button" data-calmode="team" aria-pressed="${team}">${esc(N(M.T))}</button>
      <button type="button" data-calmode="poule" aria-pressed="${!team}">Toute la poule</button>
    </div>
  </div>
  ${team ? teamCalendar() : pouleCalendar()}`;
}

function teamCalendar() {
  const filters = [['all', 'Tous'], ['next', 'À venir'], ['played', 'Joués'], ['home', 'Domicile'], ['away', 'Extérieur']];
  const keep = {
    all: () => true, next: m => !m.played, played: m => m.played, home: m => persp(m).home, away: m => !persp(m).home
  }[state.calFilter];
  const list = M.ours.filter(keep);
  let month = '';
  const rows = list.map(m => {
    const mo = cap(fmt(m.ko, { month: 'long', year: 'numeric' }));
    const head = mo !== month ? `<div class="monthhead">${esc(mo)}</div>` : '';
    month = mo;
    return head + matchRow(m);
  }).join('');
  return `
  <div class="cols cols--home">
    <section class="card card--flush">
      <div class="toolbar" style="padding:14px 18px;border-bottom:1px solid var(--line)">
        <div class="filters" role="group" aria-label="Filtrer les matchs">${filters.map(([k, l]) => `<button type="button" data-filter="${k}" aria-pressed="${state.calFilter === k}">${l}</button>`).join('')}</div>
        <span class="small muted">${plural(list.length, 'match', 'matchs')}</span>
      </div>
      <div class="mlist">${rows || '<p class="empty">Aucun match pour ce filtre.</p>'}</div>
    </section>
    <div class="stack">
      <section class="card"><div class="card__head"><h2 class="card__title">Progression</h2></div>${progressHTML()}</section>
      ${subscribeCard()}
      ${tripsCard()}
    </div>
  </div>`;
}

function matchRow(m) {
  const p = persp(m);
  const v = venueOf(m);
  const isNext = m === M.next;
  const right = m.played
    ? `<span class="mrow__res">${resultChip(p)}<span class="small muted num">${p.pf}-${p.pa}</span></span>`
    : `<span class="mrow__res"><b style="font-size:19px">${esc(m.time ? hour(m.time) : '–')}</b>${isNext ? '<span class="chip chip--live">Prochain</span>' : `<span class="small muted">${esc(relDay(m) || (daysFromToday(m) > 0 ? `dans ${daysFromToday(m)} j` : ''))}</span>`}</span>`;
  return `
  <details class="mrow"${isNext ? ' open' : ''}>
    <summary class="mrow__sum">
      <span class="datebox${isNext ? ' is-next' : ''}"><span>${esc(fmt(m.ko, { weekday: 'short' }).replace('.', ''))}</span><b>${esc(fmt(m.ko, { day: 'numeric' }))}</b><span>${esc(fmt(m.ko, { month: 'short' }).replace('.', ''))}</span></span>
      <span class="mrow__main">
        <span class="mrow__line">${ha(m)}<span class="team">${badge(p.opp, 'sm')}<span class="team__name">${p.home ? '' : 'à '}${esc(N(p.opp))}</span></span></span>
        <span class="mrow__meta"><span>J${m.journee}</span>${v ? `<span>${esc(vName(v))}${v.city ? ', ' + esc(vCity(v)) : ''}</span>` : ''}${!p.home && v?.driveMin ? `<span>${icon('car', 'i-inline')} ${dur(v.driveMin)}</span>` : ''}</span>
      </span>
      ${right}
    </summary>
    <div class="mrow__body">${matchDetail(m)}</div>
  </details>`;
}

function matchDetail(m) {
  const p = persp(m);
  const v = venueOf(m);
  const t = travel(m);
  const prev = previousMeeting(m);
  const facts = [];
  if (v) {
    facts.push(['Salle', `${esc(vName(v))}${m.venueGuessed ? ' <span class="muted">(salle habituelle)</span>' : ''}<br><span class="muted">${esc(vAddr(v))}${v.note ? ' · ' + esc(cap(v.note.toLowerCase())) : ''}</span>`]);
    const extra = [floorTxt(v.floor) && `Sol ${floorTxt(v.floor)}`, v.capacity && `${v.capacity} places`].filter(Boolean).join(' · ');
    if (extra) facts.push(['Infos salle', esc(extra)]);
  }
  if (!m.played && t) facts.push([t.label, `<b>${clock(t.at)}</b>${t.drive ? `<br><span class="muted">${dur(t.drive)} de route${t.est ? ' (estimation)' : ''} · ${Math.round(t.km)} km · arrivée ${t.buf} min avant</span>` : `<br><span class="muted">${t.buf} min avant le coup d'envoi</span>`}`]);
  if (m.referee) facts.push(['Arbitrage', esc(prettyName(m.referee))]);
  if (prev) {
    const pp = persp(prev);
    facts.push(['Match aller', prev.played ? `${resultChip(pp)} <span class="muted">${esc(shortDate(prev))}</span>` : esc(shortDate(prev))]);
  }
  facts.push(['Match', `<span class="mono">${esc(m.code)}</span> · ${esc(longDate(m))}`]);
  return `
    ${m.played ? `<div class="stack" style="gap:8px">${setsHTML(p)}</div>` : ''}
    <dl class="facts">${facts.map(([k, val]) => `<div><dt>${esc(k)}</dt><dd>${val}</dd></div>`).join('')}</dl>
    <div class="btns">
      ${v ? `<a class="btn btn--sm" href="${esc(mapsUrl(v))}" target="_blank" rel="noopener">${icon('nav')}Itinéraire</a>` : ''}
      ${v && wazeUrl(v) ? `<a class="btn btn--sm" href="${esc(wazeUrl(v))}" target="_blank" rel="noopener">${icon('car')}Waze</a>` : ''}
      ${!m.played ? `<button class="btn btn--sm" type="button" data-action="agenda" data-code="${m.code}">${icon('calplus')}Agenda</button>
        <button class="btn btn--sm" type="button" data-action="share" data-code="${m.code}">${icon('share')}Partager</button>` : ''}
      ${m.sheetUrl ? `<a class="btn btn--sm" href="${esc(m.sheetUrl)}" target="_blank" rel="noopener">${icon('sheet')}Feuille de match</a>` : ''}
      <button class="btn btn--sm" type="button" data-action="poster" data-kind="${m.played ? 'result' : 'next'}" data-code="${m.code}">${icon('image')}Affiche</button>
    </div>`;
}

function pouleCalendar() {
  const current = M.next?.journee ?? M.journees.find(j => M.matches.some(m => m.journee === j && !m.played)) ?? M.journees.at(-1);
  const j = state.pouleJ ?? current;
  const list = M.matches.filter(m => (state.pouleTeam ? m.home === state.pouleTeam || m.away === state.pouleTeam : m.journee === j));
  return `
  <section class="card card--flush">
    <div class="toolbar" style="padding:14px 18px;border-bottom:1px solid var(--line)">
      ${state.pouleTeam ? `<span class="small"><b>${esc(N(state.pouleTeam))}</b> · ${plural(list.length, 'match', 'matchs')}</span>` : `<div class="jtabs" role="group" aria-label="Journée">${M.journees.map(x => {
        const done = M.matches.filter(m => m.journee === x).every(m => m.played);
        return `<button type="button" data-j="${x}" aria-pressed="${x === j}" class="${done ? 'done' : ''}" title="Journée ${x}">J${x}</button>`;
      }).join('')}</div>`}
      <label class="small"><span class="sr">Filtrer par équipe</span>
        <select id="poule-team"><option value="">Toutes les équipes</option>${M.teams.map(t => `<option value="${esc(t)}"${state.pouleTeam === t ? ' selected' : ''}>${esc(N(t))}</option>`).join('')}</select>
      </label>
    </div>
    <div class="mlist">${list.map(prowHTML).join('')}</div>
  </section>`;
}

// ---------- Classement ----------

function viewStandings() {
  const hist = M.history;
  const prev = hist.length > 1 ? hist.at(-2).rows : null;
  const z = D.config.zones || {};
  const n = D.standings.length;
  const rows = D.standings.map(s => {
    const was = prev?.[s.team]?.rank;
    const delta = was ? was - s.rank : 0;
    const zone = z.promotion && s.rank <= z.promotion ? ' zone-up' : z.relegation && s.rank > n - z.relegation ? ' zone-down' : '';
    return `<tr class="${s.team === M.T ? 'us' : ''}${zone}">
      <td class="rk">${s.rank}${delta ? `<span class="delta ${delta > 0 ? 'up' : 'down'}" title="${delta > 0 ? 'Gagne' : 'Perd'} ${Math.abs(delta)} place${Math.abs(delta) > 1 ? 's' : ''} depuis la semaine précédente">${delta > 0 ? '▲' : '▼'}${Math.abs(delta)}</span>` : ''}</td>
      <td class="t-left">${teamHTML(s.team)}</td>
      <td class="pts">${s.pts}</td><td>${s.played}</td><td>${s.won}</td><td>${s.lost}</td>
      <td class="col-x">${s.r30 || '·'}</td><td class="col-x">${s.r31 || '·'}</td><td class="col-x">${s.r32 || '·'}</td><td class="col-x">${s.r23 || '·'}</td><td class="col-x">${s.r13 || '·'}</td><td class="col-x">${s.r03 || '·'}</td>
      <td class="col-x">${s.setsFor}-${s.setsAgainst}</td><td class="col-x">${s.setsRatio != null ? s.setsRatio.toFixed(3) : coef(s.setsFor, s.setsAgainst)}</td>
      <td class="col-x">${s.ptsFor}-${s.ptsAgainst}</td><td class="col-x">${s.ptsRatio != null ? s.ptsRatio.toFixed(3) : coef(s.ptsFor, s.ptsAgainst)}</td>
      <td class="t-left">${formHTML(s.team)}</td>
    </tr>`;
  }).join('');
  return `
  <div class="pagehead">
    <div><h1>Classement</h1><p>${esc(D.source.pouleLabel)} · ${plural(M.played.length, 'match joué', 'matchs joués')} sur ${M.matches.length}.</p></div>
    <button type="button" class="btn btn--sm only-mobile" data-action="showall" aria-pressed="${state.showAll}">${state.showAll ? 'Vue compacte' : 'Toutes les colonnes'}</button>
  </div>
  <section class="card card--flush">
    <div class="tablewrap${state.showAll ? ' show-all' : ''}"><table>
      <thead><tr><th>#</th><th class="t-left">Équipe</th><th title="Points">Pts</th><th title="Joués">J</th><th title="Victoires">V</th><th title="Défaites">D</th>
        <th class="col-x">3-0</th><th class="col-x">3-1</th><th class="col-x">3-2</th><th class="col-x">2-3</th><th class="col-x">1-3</th><th class="col-x">0-3</th>
        <th class="col-x" title="Sets pour – contre">Sets</th><th class="col-x" title="Coefficient sets">Coef S</th><th class="col-x" title="Points pour – contre">Points</th><th class="col-x" title="Coefficient points">Coef P</th><th class="t-left">Forme</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <div style="padding:12px 18px;border-top:1px solid var(--line)" class="legend">
      <span><span class="form"><i class="W">V</i></span>3-0 / 3-1 · 3 pts</span><span><span class="form"><i class="W2">V</i></span>3-2 · 2 pts</span><span><span class="form"><i class="L1">D</i></span>2-3 · 1 pt</span><span><span class="form"><i class="L">D</i></span>1-3 / 0-3 · 0 pt</span>
    </div>
  </section>
  <section class="card"><div class="card__head"><h2 class="card__title">Évolution des places</h2><span class="eyebrow">Semaine après semaine</span></div>
    ${hist.length > 1 ? `<div class="chartbox" id="bump" data-chart="bump"></div><p class="note" style="margin-top:8px">Survolez ou touchez une équipe pour suivre sa courbe. Recalcul à partir des résultats officiels.</p>` : '<p class="empty">La courbe apparaîtra après la deuxième semaine de matchs.</p>'}
  </section>
  ${simCard()}
  <section class="card"><div class="card__head"><h2 class="card__title">Comment se fait le classement</h2></div>
    <div class="facts">
      <div><dt>Points par match</dt><dd>Victoire 3-0 ou 3-1 : 3 pts · Victoire 3-2 : 2 pts · Défaite 2-3 : 1 pt · Défaite 1-3 ou 0-3 : 0 pt</dd></div>
      <div><dt>En cas d'égalité</dt><dd>1. nombre de victoires · 2. coefficient sets (gagnés ÷ perdus) · 3. coefficient points (marqués ÷ encaissés)</dd></div>
    </div>
    ${M.officialMatches ? '' : '<p class="note" style="margin-top:10px">Le classement officiel diffère du simple calcul des résultats (pénalité ou forfait possible) : la colonne Pts reprend toujours la FFVB.</p>'}
  </section>`;
}

function bumpChart(hist, width) {
  const W = Math.max(300, Math.round(width)), narrow = W < 520;
  const H = Math.round(Math.min(340, Math.max(250, W * 0.42))), pl = 26, pr = narrow ? 46 : 140, pt = 12, pb = 30;
  const n = M.teams.length, k = hist.length;
  const x = i => pl + 8 + i * ((W - pr - pl - 16) / (k - 1));
  const y = r => pt + (r - 1) * ((H - pt - pb) / (n - 1));
  const order = [...M.teams.filter(t => t !== M.T), M.T];
  const grid = Array.from({ length: n }, (_, i) => `<line class="grid" x1="${pl}" x2="${W - pr + 4}" y1="${y(i + 1)}" y2="${y(i + 1)}"/><text x="${pl - 8}" y="${y(i + 1) + 4}" text-anchor="end">${i + 1}</text>`).join('');
  const xl = hist.map((h, i) => `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(h.label)}</text>`).join('');
  const lines = order.map(t => {
    const pts = hist.map((h, i) => [x(i), y(h.rows[t].rank), h.rows[t]]);
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
    const us = t === M.T;
    const last = pts.at(-1);
    return `<g class="tl${us ? ' us' : ''}" data-hl="${esc(t)}">
      <path class="tline" d="${d}"/>
      ${pts.map((p, i) => `<circle class="tdot" cx="${p[0]}" cy="${p[1]}" r="${us ? 4.5 : 3.5}"/><circle class="hit" cx="${p[0]}" cy="${p[1]}" r="11" data-tip="${esc(`<b>${N(t)}</b><br>${ordTxt(p[2].rank)} après le ${hist[i].label} · ${plural(p[2].pts, 'pt')}`)}"/>`).join('')}
      <text x="${W - pr + 12}" y="${last[1] + 4}" class="${us ? 'lbl-us' : ''}">${esc(narrow ? S(t) : N(t))}</text>
    </g>`;
  }).join('');
  return `<svg class="chart bump" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Évolution du classement de chaque équipe">${grid}${xl}${lines}</svg>`;
}

const SIM_RESULTS = ['3-0', '3-1', '3-2', '2-3', '1-3', '0-3'];

function simCard() {
  const open = M.journees.filter(j => M.matches.some(m => m.journee === j && !m.played));
  if (!open.length) return '';
  const j = state.simJ ?? M.next?.journee ?? open[0];
  const list = M.matches.filter(m => m.journee === j && !m.played);
  const base = D.standings.map(s => ({ ...s }));
  const rows = new Map(base.map(r => [r.team, r]));
  const simulated = Object.entries(state.sim).filter(([code]) => M.byCode.get(code));
  for (const [code, res] of simulated) {
    const m = M.byCode.get(code);
    const [a, b] = res.split('-').map(Number);
    applyResult(rows.get(m.home), a, b);
    applyResult(rows.get(m.away), b, a);
  }
  const proj = [...rows.values()].sort(compareRows);
  return `
  <section class="card" aria-labelledby="sim-t">
    <div class="card__head"><h2 class="card__title" id="sim-t">Et si… ?</h2>
      <label class="small"><span class="sr">Journée à simuler</span><select id="sim-j">${open.map(x => `<option value="${x}"${x === j ? ' selected' : ''}>Journée ${x}</option>`).join('')}</select></label>
    </div>
    <div class="cols cols--2" style="gap:24px"><div>
    <p class="note" style="margin-bottom:6px">Choisissez un score pour chaque match et voyez le classement bouger. Vous pouvez enchaîner plusieurs journées.</p>
    <div>${list.map(m => `<div class="simrow">${teamHTML(m.home, { right: true, link: false })}
      <div class="seg" role="group" aria-label="Score ${esc(N(m.home))} – ${esc(N(m.away))}">${SIM_RESULTS.map(r => `<button type="button" data-sim="${m.code}" data-res="${r}" aria-pressed="${state.sim[m.code] === r}">${r}</button>`).join('')}</div>
      ${teamHTML(m.away, { link: false })}</div>`).join('')}</div>
    </div><div>
    <div class="toolbar" style="margin-bottom:6px"><span class="eyebrow">Classement projeté · ${plural(simulated.length, 'match simulé', 'matchs simulés')}</span>
      ${simulated.length ? '<button type="button" class="link tlink" data-action="simreset">Réinitialiser</button>' : ''}</div>
    <div class="tablewrap"><table>
      <tbody>${proj.map((r, i) => {
        const d = r.rank - (i + 1);
        return `<tr class="mini${r.team === M.T ? ' us' : ''}"><td class="rk">${i + 1}</td><td class="t-left">${teamHTML(r.team, { link: false })}</td><td class="pts">${r.pts}</td>
          <td>${d ? `<span class="delta ${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'}${Math.abs(d)}</span>` : '<span class="muted">=</span>'}</td></tr>`;
      }).join('')}</tbody>
    </table></div>
    <p class="note" style="margin-top:8px">Simulation sur les points, victoires et sets. Le coefficient points n'est pas simulé.</p>
    </div></div>
  </section>`;
}

// ---------- Adversaires ----------

function viewOpponents() {
  const opps = M.teams.filter(t => t !== M.T);
  const nextVs = t => M.ours.find(m => !m.played && persp(m).opp === t)?.ko ?? Infinity;
  opps.sort((a, b) => nextVs(a) - nextVs(b));
  return `
  <div class="pagehead"><div><h1>Adversaires</h1><p>Les ${opps.length} équipes de la poule, dans l'ordre de nos prochaines rencontres.</p></div></div>
  <div class="cols cols--2">
    <section class="card"><div class="card__head"><h2 class="card__title">Rose des déplacements</h2><span class="eyebrow">Depuis ${esc(homeCity())}</span></div>
      <div class="chartbox" id="rose" data-chart="rose"></div>
      <p class="note" style="margin-top:6px">Position réelle des salles (nord en haut), à vol d'oiseau. Le temps indiqué est le trajet en voiture.</p>
    </section>
    ${tripsCard()}
  </div>
  <div class="teams-grid">${opps.map(teamCard).join('')}</div>`;
}

function teamCard(t) {
  const r = M.row(t);
  const v = D.venues[D.teams[t]?.mainVenue];
  const meet = M.ours.filter(m => persp(m).opp === t);
  return `
  <button type="button" class="card tcard" data-team="${esc(t)}">
    <span class="tcard__head">${badge(t, 'lg')}<span><span class="tcard__name">${esc(N(t))}</span><br><span class="tcard__club">${esc(D.teams[t]?.clubName || '')}</span></span>
      <span class="tcard__rank"><b>${ord(r.rank)}</b><span>${plural(r.pts, 'pt')}</span></span></span>
    <span class="tcard__row"><span class="eyebrow">Forme</span>${formHTML(t)}</span>
    <span class="tcard__row"><span class="eyebrow">Face à nous</span><span class="h2h">${meet.map(m => {
      const p = persp(m);
      return m.played ? resultChip(p) : `<span class="chip${p.home ? ' chip--home' : ''}">${esc(fmt(m.ko, { day: 'numeric', month: 'short' }))} · ${p.home ? 'dom.' : 'ext.'}</span>`;
    }).join('')}</span></span>
    ${v ? `<span class="tcard__row small"><span class="muted">${icon('pin', 'i-inline')} ${esc(vName(v))}, ${esc(vCity(v))}</span>${v.driveMin ? `<span class="num" style="white-space:nowrap">${dur(v.driveMin)}</span>` : ''}</span>` : ''}
  </button>`;
}

function tripsCard() {
  const trips = M.ours.filter(m => !persp(m).home).map(m => ({ m, v: venueOf(m) })).filter(x => x.v);
  const km = trips.reduce((s, x) => s + (x.v.driveKm || 0) * 2, 0);
  const min = trips.reduce((s, x) => s + (x.v.driveMin || 0) * 2, 0);
  const left = trips.filter(x => !x.m.played);
  return `
  <section class="card card--flush" aria-labelledby="trip-t">
    <div class="card__head"><h2 class="card__title" id="trip-t">Déplacements</h2><span class="eyebrow">${trips.length} à l'extérieur</span></div>
    <div class="kpis" style="margin:12px 18px 6px">
      <div class="kpi"><b class="num">${Math.round(km).toLocaleString('fr-FR')}<small>km</small></b><span>aller-retour sur la saison</span></div>
      <div class="kpi"><b class="num">${Math.round(min / 60)}<small>h</small></b><span>de route au total</span></div>
    </div>
    <div class="tablewrap"><table class="t-wrap">
      <thead><tr><th class="t-left">Date</th><th class="t-left">Chez</th><th>Route</th><th>Départ</th></tr></thead>
      <tbody>${(left.length ? left : trips).map(({ m, v }) => {
        const t = travel(m);
        return `<tr><td class="t-left">${esc(fmt(m.ko, { day: 'numeric', month: 'short' }))}</td><td class="t-left">${teamHTML(persp(m).opp)}</td><td>${v.driveMin ? dur(v.driveMin) : '–'}</td><td><b>${t ? clock(t.at) : '–'}</b></td></tr>`;
      }).join('')}</tbody>
    </table></div>
    <p class="note" style="padding:10px 18px 14px">Départ calculé pour arriver ${D.config.arrivalBufferMinutes ?? 60} min avant le coup d'envoi, trajet depuis ${esc(vName(D.venues[D.homeVenue] || { name: homeCity() }))}.</p>
  </section>`;
}

function roseChart(width) {
  const o = D.venues[D.homeVenue];
  if (o?.lat == null) return '<p class="empty">Coordonnées des salles indisponibles.</p>';
  const W = Math.max(290, Math.round(width)), Hh = Math.min(W, 440), CX = W / 2, C = Hh / 2, R = C - 22;
  const pts = M.teams.filter(t => t !== M.T).map(t => {
    const v = D.venues[D.teams[t]?.mainVenue];
    if (v?.lat == null) return null;
    const kx = (v.lon - o.lon) * 111.32 * Math.cos((o.lat * Math.PI) / 180), ky = (v.lat - o.lat) * 110.57;
    return { t, v, kx, ky, d: Math.hypot(kx, ky) };
  }).filter(Boolean);
  const max = Math.max(25, Math.ceil(Math.max(...pts.map(p => p.d)) / 25) * 25);
  const sc = R / max;
  for (const p of pts) {
    p.x = CX + p.kx * sc; p.y = C - p.ky * sc; p.ly = p.y + 4;
    p.tw = (S(p.t).length + (p.v.driveMin ? dur(p.v.driveMin).length : 0)) * 7 + 12;
    p.right = p.x >= CX ? p.x + 9 + p.tw < W : p.x - 9 - p.tw < 0;
  }
  // Écarte les étiquettes qui se chevauchent, de chaque côté.
  for (const side of [true, false]) {
    const s = pts.filter(p => p.right === side).sort((a, b) => a.ly - b.ly);
    for (let i = 1; i < s.length; i++) {
      const a = s[i - 1], b = s[i];
      if (b.ly - a.ly < 15 && Math.abs(b.x - a.x) < 90) {
        b.ly = a.ly + 15;
        // Salles voisines : les étiquettes s'alignent à l'extérieur du groupe.
        const edge = side ? Math.max(a.lx ?? a.x, b.x) : Math.min(a.lx ?? a.x, b.x);
        a.lx = b.lx = edge;
      }
    }
  }
  const rings = [];
  for (let d = 25; d <= max; d += 25) rings.push(`<circle class="ring" cx="${CX}" cy="${C}" r="${d * sc}"/><text x="${CX + 4}" y="${C + d * sc + 13}">${d} km</text>`);
  const dots = pts.map(p => {
    const lx = (p.lx ?? p.x) + (p.right ? 10 : -10);
    const tip = `<b>${N(p.t)}</b><br>${vName(p.v)}, ${vCity(p.v)}<br>${p.v.driveMin ? `${dur(p.v.driveMin)} · ${Math.round(p.v.driveKm)} km en voiture` : `${Math.round(p.d)} km à vol d'oiseau`}`;
    return `<g>${Math.abs(p.ly - 4 - p.y) > 3 || (p.lx ?? p.x) !== p.x ? `<path d="M${p.x},${p.y}L${lx - (p.right ? 3 : -3)},${p.ly - 4}" stroke="var(--line-strong)"/>` : ''}
      <circle cx="${p.x}" cy="${p.y}" r="5" fill="var(--ink)" stroke="var(--card)" stroke-width="2"/>
      <text x="${lx}" y="${p.ly}" text-anchor="${p.right ? 'start' : 'end'}" class="lbl-strong">${esc(S(p.t))}<tspan class="muted-t" dx="5">${p.v.driveMin ? dur(p.v.driveMin) : ''}</tspan></text>
      <circle class="hit" cx="${p.x}" cy="${p.y}" r="13" data-tip="${esc(tip)}"/></g>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${Hh}" width="${W}" height="${Hh}" role="img" aria-label="Carte des salles adverses autour de ${esc(homeCity())}">
    ${rings.join('')}
    <path class="axis" d="M${CX},${C - R - 6}V${C + R + 6}M${CX - R - 6},${C}H${CX + R + 6}" stroke-dasharray="1 5"/>
    <text x="${CX}" y="12" text-anchor="middle" class="lbl-strong">N</text>
    ${dots}
    <circle cx="${CX}" cy="${C}" r="7" fill="var(--red)" stroke="var(--card)" stroke-width="2.5"/>
    <text x="${CX + 11}" y="${C + 17}" class="lbl-us">${esc(homeCity())}</text>
  </svg>`;
}

function openTeam(t) {
  const r = M.row(t);
  const info = D.teams[t] || {};
  const list = M.matches.filter(m => m.home === t || m.away === t);
  const venues = [info.mainVenue, info.backupVenue].filter(Boolean).map(k => D.venues[k]).filter(Boolean);
  const meet = M.ours.filter(m => persp(m).opp === t);
  const dlg = $('#sheet');
  dlg.innerHTML = `<div class="sheet__in">
    <button type="button" class="iconbtn sheet__close" data-action="close" aria-label="Fermer">${icon('x')}</button>
    <div class="tcard__head">${badge(t, 'lg')}<div><h2 class="tcard__name" style="font-size:30px">${esc(N(t))}</h2><div class="tcard__club">${esc(info.clubName || '')}${info.colors ? ' · ' + esc(cap(info.colors.toLowerCase())) : ''}</div></div></div>
    <div class="kpis">
      <div class="kpi"><b>${ord(r.rank)}</b><span>${plural(r.pts, 'point')}</span></div>
      <div class="kpi"><b class="num">${r.won}–${r.lost}</b><span>V – D</span></div>
      <div class="kpi"><b class="num">${r.setsFor}–${r.setsAgainst}</b><span>sets</span></div>
      <div class="kpi"><b class="num">${r.ptsFor}–${r.ptsAgainst}</b><span>points</span></div>
    </div>
    <div class="result-line"><span class="eyebrow">Forme</span>${formHTML(t)}</div>
    ${t !== M.T && meet.length ? `<div class="stack" style="gap:8px"><span class="eyebrow">Face à ${esc(N(M.T))}</span>${meet.map(m => {
      const p = persp(m);
      return `<div class="result-line small"><span>${esc(longDate(m))} · ${p.home ? 'chez nous' : 'chez eux'}</span>${m.played ? resultChip(p) : `<span>${esc(hour(m.time))}</span>`}</div>`;
    }).join('')}</div>` : ''}
    ${venues.length ? `<div class="stack" style="gap:10px"><span class="eyebrow">Salles</span>${venues.map((v, i) => `
      <div class="vsline small"><b>${esc(vName(v))}${i ? ' <span class="muted">(repli)</span>' : ''}</b><span class="muted">${esc(vAddr(v))}${[floorTxt(v.floor), v.capacity && v.capacity + ' places'].filter(Boolean).map(x => ' · ' + esc(x)).join('')}</span>
      <span class="btns"><a class="btn btn--sm" href="${esc(mapsUrl(v))}" target="_blank" rel="noopener">${icon('nav')}Itinéraire</a>${v.driveMin && t !== M.T ? `<span class="small muted" style="align-self:center">${dur(v.driveMin)} depuis ${esc(homeCity())}</span>` : ''}</span></div>`).join('')}</div>` : ''}
    <div class="card card--flush"><div class="card__head"><h3 class="card__title" style="font-size:18px">Leur saison</h3></div><div class="mlist" style="margin-top:6px">${list.map(prowHTML).join('')}</div></div>
    ${info.website ? `<a class="btn" href="${esc(info.website)}" target="_blank" rel="noopener">${icon('ext')}Site du club</a>` : ''}
  </div>`;
  if (!dlg.open) dlg.showModal();
  dlg.scrollTop = 0;
}

// ---------- Statistiques ----------

function viewStats() {
  const ours = M.ours.filter(m => m.played).map(m => ({ m, ...persp(m) }));
  if (!ours.length) return `<div class="pagehead"><div><h1>Statistiques</h1></div></div><section class="card"><p class="empty">Les statistiques apparaîtront après le premier match.</p></section>`;
  const sets = ours.flatMap(x => x.sets.map((s, i) => ({ s, i, x })));
  const sw = sets.filter(z => z.s[0] > z.s[1]).length;
  const pf = ours.reduce((a, x) => a + x.pf, 0), pa = ours.reduce((a, x) => a + x.pa, 0);
  const tb = ours.filter(x => x.sets.length === 5);
  const close = sets.filter(z => Math.abs(z.s[0] - z.s[1]) <= 2);
  const split = home => { const l = ours.filter(x => x.home === home); return { n: l.length, w: l.filter(x => x.win).length, pts: l.reduce((a, x) => a + x.pts, 0), sf: l.reduce((a, x) => a + x.sf, 0), sa: l.reduce((a, x) => a + x.sa, 0) }; };
  const H = split(true), A = split(false);
  const bySet = [0, 1, 2, 3, 4].map(i => { const l = sets.filter(z => z.i === i); return { i, n: l.length, w: l.filter(z => z.s[0] > z.s[1]).length }; }).filter(b => b.n);
  const r = M.row(M.T);
  return `
  <div class="pagehead"><div><h1>Statistiques</h1><p>${esc(N(M.T))} · ${plural(ours.length, 'match joué', 'matchs joués')} · saison ${esc(D.source.season)}</p></div></div>
  <div class="kpis">
    <div class="kpi"><b class="num">${r.won}–${r.lost}</b><span>victoires – défaites</span></div>
    <div class="kpi"><b class="num">${r.pts}</b><span>points au classement</span></div>
    <div class="kpi"><b class="num">${sw}–${sets.length - sw}</b><span>sets gagnés – perdus (${Math.round((sw / sets.length) * 100)} %)</span></div>
    <div class="kpi"><b class="num">${(pf / sets.length).toFixed(1)}</b><span>points marqués par set</span></div>
    <div class="kpi"><b class="num">${(pa / sets.length).toFixed(1)}</b><span>points encaissés par set</span></div>
    <div class="kpi"><b class="num">${tb.filter(x => x.win).length}–${tb.filter(x => !x.win).length}</b><span>tie-breaks gagnés – perdus</span></div>
    <div class="kpi"><b class="num">${close.filter(z => z.s[0] > z.s[1]).length}–${close.filter(z => z.s[0] < z.s[1]).length}</b><span>sets serrés (2 pts d'écart)</span></div>
  </div>
  <section class="card"><div class="card__head"><h2 class="card__title">Écart de points, set par set</h2><span class="eyebrow">Au-dessus : set gagné</span></div>
    <div class="tablewrap"><div class="chartbox" id="margins">${marginChart(ours)}</div></div>
  </section>
  <div class="cols cols--3">
    <section class="card"><div class="card__head"><h2 class="card__title">Domicile / extérieur</h2></div>
      <div class="tablewrap"><table><thead><tr><th class="t-left"></th><th>Matchs</th><th>V</th><th>Pts</th><th>Sets</th></tr></thead><tbody>
        <tr><td class="t-left">Domicile</td><td>${H.n}</td><td>${H.w}</td><td>${H.pts}</td><td>${H.sf}-${H.sa}</td></tr>
        <tr><td class="t-left">Extérieur</td><td>${A.n}</td><td>${A.w}</td><td>${A.pts}</td><td>${A.sf}-${A.sa}</td></tr>
      </tbody></table></div>
    </section>
    <section class="card"><div class="card__head"><h2 class="card__title">Set par set</h2><span class="eyebrow">Sets gagnés</span></div>
      <div class="bars">${bySet.map(b => `<div class="bar"><span>${b.i === 4 ? 'Tie-break' : `Set ${b.i + 1}`}</span><span class="bar__track"><span class="bar__fill" style="width:${(b.w / b.n) * 100}%;background:var(--win)"></span></span><span class="bar__val">${b.w}/${b.n}</span></div>`).join('')}</div>
    </section>
    ${recordsCard(true)}
  </div>
  <div class="cols cols--2">
    ${rankBars('Attaque', 'Points marqués par set', s => s.ptsFor / Math.max(1, s.setsFor + s.setsAgainst), true)}
    ${rankBars('Défense', 'Points encaissés par set (moins = mieux)', s => s.ptsAgainst / Math.max(1, s.setsFor + s.setsAgainst), false)}
  </div>
  ${recordsCard(false)}`;
}

function marginChart(list) {
  const bw = 16, gap = 4, mg = 26, pl = 30, pt = 10, pb = 44, H = 230;
  let maxAbs = 10;
  for (const x of list) for (const s of x.sets) maxAbs = Math.max(maxAbs, Math.abs(s[0] - s[1]));
  maxAbs = Math.ceil(maxAbs / 5) * 5;
  const y0 = pt + (H - pt - pb) / 2, k = (H - pt - pb) / 2 / maxAbs;
  const yv = v => y0 - v * k;
  let cx = pl + 6;
  const groups = list.map(x => {
    const start = cx;
    const bars = x.sets.map((s, i) => {
      const v = s[0] - s[1];
      const bx = cx; cx += bw + gap;
      const y1 = yv(v), r = Math.min(4, Math.abs(y1 - y0));
      const d = v >= 0
        ? `M${bx},${y0}V${y1 + r}Q${bx},${y1} ${bx + r},${y1}H${bx + bw - r}Q${bx + bw},${y1} ${bx + bw},${y1 + r}V${y0}Z`
        : `M${bx},${y0}V${y1 - r}Q${bx},${y1} ${bx + r},${y1}H${bx + bw - r}Q${bx + bw},${y1} ${bx + bw},${y1 - r}V${y0}Z`;
      const tip = `<b>${i === 4 ? 'Tie-break' : 'Set ' + (i + 1)} · ${s[0]}-${s[1]}</b><br>${x.home ? 'contre' : 'à'} ${N(x.opp)}, ${shortDate(x.m)}`;
      return `<path d="${d}" fill="${v > 0 ? 'var(--win)' : 'var(--loss)'}"/><rect class="hit" x="${bx - 2}" y="${pt}" width="${bw + 4}" height="${H - pt - pb}" data-tip="${esc(tip)}"/>`;
    }).join('');
    const mid = (start + cx - gap) / 2;
    cx += mg - gap;
    return `${bars}<text x="${mid}" y="${H - pb + 18}" text-anchor="middle" class="lbl-strong">${esc(S(x.opp))}</text><text x="${mid}" y="${H - pb + 32}" text-anchor="middle">${RES[x.code].letter} ${x.sf}-${x.sa}</text>`;
  }).join('');
  const W = Math.max(cx, 320);
  const ticks = [];
  for (let v = -maxAbs; v <= maxAbs; v += 5) ticks.push(`<line class="${v === 0 ? 'axis' : 'grid'}" x1="${pl}" x2="${W}" y1="${yv(v)}" y2="${yv(v)}"/><text x="${pl - 6}" y="${yv(v) + 4}" text-anchor="end">${v > 0 ? '+' + v : v}</text>`);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="width:${W}px;max-width:none" role="img" aria-label="Écart de points de chaque set joué">${ticks.join('')}${groups}</svg>`;
}

function rankBars(title, sub, val, highIsGood) {
  const rows = D.standings.filter(s => s.played).map(s => ({ t: s.team, v: val(s) })).sort((a, b) => (highIsGood ? b.v - a.v : a.v - b.v));
  if (!rows.length) return '';
  const max = Math.max(...rows.map(r => r.v));
  const min = Math.min(...rows.map(r => r.v)) * 0.9;
  return `<section class="card"><div class="card__head"><h2 class="card__title">${esc(title)}</h2><span class="eyebrow">${esc(sub)}</span></div>
    <div class="bars">${rows.map((r, i) => `<div class="bar${r.t === M.T ? ' is-us' : ''}"><span class="team__name">${i + 1}. ${esc(N(r.t))}</span><span class="bar__track"><span class="bar__fill" style="width:${((r.v - min) / (max - min || 1)) * 100}%"></span></span><span class="bar__val">${r.v.toFixed(1)}</span></div>`).join('')}</div>
  </section>`;
}

function bigWin(m) {
  const homeWon = m.sets[0] > m.sets[1];
  const [w, l] = homeWon ? [m.home, m.away] : [m.away, m.home];
  const [sw, sl] = homeWon ? m.sets : [m.sets[1], m.sets[0]];
  const [pw, pl] = homeWon ? m.points : [m.points[1], m.points[0]];
  return ['Plus large victoire', `${sw}-${sl}`, `${N(w)} ${homeWon ? 'contre' : 'à'} ${N(l)} · J${m.journee} (${pw}-${pl})`];
}

function recordsCard(ours) {
  const pool = ours ? M.played.filter(M.isOurs) : M.played;
  if (!pool.length) return '';
  const allSets = pool.flatMap(m => m.setScores.map((s, i) => ({ m, s, i })));
  const longest = allSets.reduce((a, b) => (b.s[0] + b.s[1] > a.s[0] + a.s[1] ? b : a));
  const margin = m => Math.abs(m.points[0] - m.points[1]);
  const closest = pool.reduce((a, b) => (margin(b) < margin(a) ? b : a));
  const big = pool.reduce((a, b) => (Math.abs(b.sets[0] - b.sets[1]) * 1000 + margin(b) > Math.abs(a.sets[0] - a.sets[1]) * 1000 + margin(a) ? b : a));
  const five = pool.filter(m => m.setScores.length === 5).length;
  const lbl = m => `${N(m.home)} – ${N(m.away)} · J${m.journee}`;
  const items = [
    ['Set le plus long', `${longest.s[0]}-${longest.s[1]}`, `${lbl(longest.m)}, ${longest.i === 4 ? 'tie-break' : 'set ' + (longest.i + 1)}`],
    ['Match le plus serré', `${closest.points[0]}-${closest.points[1]}`, `${lbl(closest)} (${closest.sets[0]}-${closest.sets[1]})`],
    ...(ours ? [] : [bigWin(big)]),
    ['Matchs en 5 sets', `${five}/${pool.length}`, ours ? 'matchs de Liévin allés au tie-break' : 'matchs de la poule allés au tie-break']
  ];
  return `<section class="card"><div class="card__head"><h2 class="card__title">${ours ? 'Nos records' : 'Records de la poule'}</h2></div>
    <div class="records">${items.map(([k, v, s]) => `<div class="record"><span class="eyebrow">${esc(k)}</span><b class="num">${esc(v)}</b><span class="small muted">${esc(s)}</span></div>`).join('')}</div></section>`;
}

// ---------- Actions ----------

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2600);
}

async function copy(text, done = 'Lien copié') {
  try { await navigator.clipboard.writeText(text); toast(done); } catch { window.prompt?.('Copiez ce texte :', text); }
}

function shareText(m) {
  const v = venueOf(m);
  return [`🏐 ${N(m.home)} – ${N(m.away)}`, `${longDate(m)} · ${hour(m.time)} · Journée ${m.journee}`, v ? `${vName(v)}, ${vAddr(v)}` : '', D.config.siteUrl || location.href.split('#')[0]].filter(Boolean).join('\n');
}

async function share(m) {
  const text = shareText(m);
  if (navigator.share) {
    try { await navigator.share({ title: `${N(m.home)} – ${N(m.away)}`, text }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  copy(text, 'Infos du match copiées');
}

function download(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function agendaMenu(m) {
  const end = new Date(m.ko.getTime() + (D.config.matchDurationMinutes || 120) * 60e3);
  const z = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const ev = matchEvent(m, D);
  const g = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(ev.summary)}&dates=${z(m.ko)}/${z(end)}&location=${encodeURIComponent(ev.location)}&details=${encodeURIComponent(ev.description)}`;
  const dlg = $('#sheet');
  dlg.innerHTML = `<div class="sheet__in">
    <button type="button" class="iconbtn sheet__close" data-action="close" aria-label="Fermer">${icon('x')}</button>
    <h2 class="card__title" style="font-size:28px">Ajouter à l'agenda</h2>
    <p>${esc(N(m.home))} – ${esc(N(m.away))}<br><span class="muted">${esc(longDate(m))} · ${esc(hour(m.time))}</span></p>
    <div class="btns">
      <a class="btn btn--primary" href="${esc(g)}" target="_blank" rel="noopener">Google Agenda</a>
      <button class="btn" type="button" data-action="ics" data-code="${m.code}">${icon('download')}Apple, Outlook (.ics)</button>
    </div>
    <hr class="divider">
    <p class="small">Pour avoir <b>toute la saison</b> et les changements d'horaire automatiquement :</p>
    <div class="btns"><a class="btn" href="${esc(calUrls().webcal)}">${icon('calplus')}S'abonner au calendrier</a><a class="btn" href="${esc(calUrls().google)}" target="_blank" rel="noopener">Abonnement Google</a></div>
  </div>`;
  if (!dlg.open) dlg.showModal();
}

// ---------- Affiches (réseaux sociaux) ----------

async function poster(kind, m) {
  const dlg = $('#poster');
  dlg.innerHTML = `<div class="poster__in"><img alt="Affiche en préparation"><p class="small muted">Préparation de l'affiche…</p></div>`;
  if (!dlg.open) dlg.showModal();
  try { await Promise.all(['900 120px "Big Shoulders Display"', '800 60px "Big Shoulders Display"', '600 30px Figtree', '700 30px "JetBrains Mono"'].map(f => document.fonts.load(f))); } catch { /* polices de secours */ }
  const c = document.createElement('canvas');
  c.width = 1080; c.height = 1350;
  const g = c.getContext('2d');
  const RED = '#D3122B', W = '#FFFFFF';
  const disp = (w, s) => `${w} ${s}px "Big Shoulders Display", "Arial Narrow", Impact, sans-serif`;
  const body = (w, s) => `${w} ${s}px Figtree, system-ui, sans-serif`;
  const fit = (txt, font, max, size) => { let s = size; do { g.font = font(s); s -= 4; } while (g.measureText(txt).width > max && s > 20); return s + 4; };
  g.fillStyle = RED; g.fillRect(0, 0, 1080, 1350);
  // Terrain stylisé en filigrane.
  g.save(); g.globalAlpha = 0.13; g.strokeStyle = W; g.lineWidth = 6; g.translate(600, 760); g.rotate((-8 * Math.PI) / 180);
  g.strokeRect(-620, -310, 1240, 620); g.lineWidth = 14; g.beginPath(); g.moveTo(0, -360); g.lineTo(0, 360); g.stroke();
  g.lineWidth = 6; g.beginPath(); g.moveTo(-207, -310); g.lineTo(-207, 310); g.moveTo(207, -310); g.lineTo(207, 310); g.stroke(); g.restore();
  g.fillStyle = W; g.fillRect(0, 1290, 1080, 60);
  g.fillStyle = W; g.textBaseline = 'alphabetic';
  g.font = disp(900, 54); g.fillText((D.config.clubShort || 'VC Liévin').toUpperCase(), 72, 120);
  g.globalAlpha = 0.85; g.font = body(600, 28); g.fillText(D.source.pouleLabel.toUpperCase(), 72, 164); g.globalAlpha = 1;
  const p = persp(m);
  const tagBox = (txt, y) => { g.font = disp(900, 50); const w = g.measureText(txt).width + 44; g.fillStyle = W; g.fillRect(72, y - 50, w, 66); g.fillStyle = RED; g.fillText(txt, 94, y); g.fillStyle = W; };
  if (kind === 'result' && m.played) {
    tagBox(p.win ? 'VICTOIRE' : 'DÉFAITE', 330);
    const names = [N(m.home), N(m.away)].map(s => s.toUpperCase());
    const s = Math.min(fit(names[0], x => disp(900, x), 700, 130), fit(names[1], x => disp(900, x), 700, 130));
    [[names[0], m.sets[0], 560], [names[1], m.sets[1], 760]].forEach(([n, v, y], i) => {
      g.globalAlpha = (i === 0) === (m.home === M.T) ? 1 : 0.78;
      g.font = disp(900, s); g.fillText(n, 72, y);
      g.font = disp(900, 190); g.textAlign = 'right'; g.fillText(String(v), 1008, y + 10); g.textAlign = 'left';
    });
    g.globalAlpha = 1;
    g.font = '700 46px "JetBrains Mono", ui-monospace, monospace';
    const line = m.setScores.map(x => `${x[0]}-${x[1]}`).join('  ');
    g.fillText(line, 72, 905);
    g.font = body(600, 34); g.globalAlpha = 0.9;
    g.fillText(`${longDate(m)} · Journée ${m.journee} · ${m.points[0]}-${m.points[1]} pts`, 72, 970);
    g.globalAlpha = 1; g.font = disp(900, 84);
    g.fillText(p.win ? 'BRAVO LES GARS !' : p.code === 'L1' ? 'UN POINT DE PRIS.' : 'ON SE RELÈVE.', 72, 1180);
  } else {
    tagBox(daysFromToday(m) === 0 ? 'JOUR DE MATCH' : 'PROCHAIN MATCH', 300);
    const names = [N(m.home), N(m.away)].map(s => s.toUpperCase());
    const s = Math.min(fit(names[0], x => disp(900, x), 936, 236), fit(names[1], x => disp(900, x), 936, 236));
    const y1 = 330 + s * 0.86, y2 = y1 + 74 + s * 0.86;
    g.font = disp(900, s); g.globalAlpha = m.home === M.T ? 1 : 0.8; g.fillText(names[0], 68, y1);
    g.globalAlpha = 0.7; g.font = disp(800, 42); g.fillText('CONTRE', 76, y1 + 58);
    g.font = disp(900, s); g.globalAlpha = m.away === M.T ? 1 : 0.8; g.fillText(names[1], 68, y2);
    g.globalAlpha = 1;
    const yDate = 980;
    g.font = disp(900, 76); g.fillText(`${longDate(m)} · ${hour(m.time)}`.toUpperCase(), 72, yDate);
    const v = venueOf(m);
    if (v) { g.font = body(600, 36); g.globalAlpha = 0.92; g.fillText(`${vName(v)}${v.city ? ', ' + vCity(v) : ''}`, 72, yDate + 64); g.globalAlpha = 1; }
    g.font = disp(900, 84); g.fillText(p.home ? 'VENEZ NOMBREUX !' : `ALLEZ ${prettyCity(M.T.replace(/\s+\d+$/, '')).toUpperCase()} !`, 72, 1180);
  }
  g.fillStyle = RED; g.font = body(700, 26); g.fillText(`${N(M.T).toUpperCase()} · SAISON ${D.source.season}`, 72, 1330);
  const url = c.toDataURL('image/png');
  const file = `affiche-${m.code}-${kind}.png`;
  dlg.innerHTML = `<div class="poster__in">
    <img src="${url}" alt="Affiche ${esc(N(m.home))} – ${esc(N(m.away))}" width="1080" height="1350">
    <div class="btns">
      <a class="btn btn--primary" href="${url}" download="${file}">${icon('download')}Télécharger</a>
      <button class="btn" type="button" data-action="poster-share" data-file="${file}">${icon('share')}Partager</button>
      <button class="btn" type="button" data-action="close">Fermer</button>
    </div>
    <p class="note">Format 1080 × 1350, prêt pour Instagram et Facebook. Sur téléphone, un appui long sur l'image permet aussi de l'enregistrer.</p>
  </div>`;
  dlg._canvas = c;
}

async function sharePoster(file) {
  const c = $('#poster')._canvas;
  if (!c) return;
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const f = new File([blob], file, { type: 'image/png' });
  if (navigator.canShare?.({ files: [f] })) {
    try { await navigator.share({ files: [f] }); } catch { /* annulé */ }
  } else download(file, blob);
}

// ---------- Événements ----------

function go(view) {
  state.view = view;
  if (location.hash.slice(1) !== view) history.replaceState(null, '', '#' + view);
  render();
  window.scrollTo({ top: 0 });
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-team],[data-action],[data-filter],[data-calmode],[data-j],[data-sim],[data-goto-poule]');
  if (!el) return;
  const code = el.dataset.code && M.byCode.get(el.dataset.code);
  if (el.dataset.gotoPoule) { state.calMode = 'poule'; state.pouleJ = +el.dataset.gotoPoule; state.pouleTeam = ''; return; }
  if (el.dataset.team && !el.dataset.action) { e.preventDefault(); openTeam(el.dataset.team); return; }
  if (el.dataset.filter) { state.calFilter = el.dataset.filter; render(); return; }
  if (el.dataset.calmode) { state.calMode = el.dataset.calmode; store.set('calMode', state.calMode); render(); return; }
  if (el.dataset.j) { state.pouleJ = +el.dataset.j; render(); return; }
  if (el.dataset.sim) {
    state.sim[el.dataset.sim] = state.sim[el.dataset.sim] === el.dataset.res ? undefined : el.dataset.res;
    if (!state.sim[el.dataset.sim]) delete state.sim[el.dataset.sim];
    render(); return;
  }
  switch (el.dataset.action) {
    case 'share': share(code); break;
    case 'agenda': agendaMenu(code); break;
    case 'ics': download(`${code.code}.ics`, new Blob([buildIcs({ name: N(M.T), events: [matchEvent(code, D)] })], { type: 'text/calendar' })); break;
    case 'poster': poster(el.dataset.kind, code); break;
    case 'poster-share': sharePoster(el.dataset.file); break;
    case 'copy': copy(el.dataset.text); break;
    case 'close': el.closest('dialog')?.close(); break;
    case 'showall': state.showAll = !state.showAll; render(); break;
    case 'simreset': state.sim = {}; render(); break;
    case 'theme': toggleTheme(); break;
  }
});

document.addEventListener('change', e => {
  if (e.target.id === 'poule-team') { state.pouleTeam = e.target.value; render(); }
  if (e.target.id === 'sim-j') { state.simJ = +e.target.value; render(); }
});

// Fermer une feuille en touchant le fond.
document.addEventListener('click', e => { if (e.target.tagName === 'DIALOG') e.target.close(); });

// Infobulles des graphiques + mise en avant d'une équipe dans la courbe.
let tipEl = null;
function showTip(target) {
  const box = target.closest('.chartbox');
  if (!box) return;
  tipEl ??= Object.assign(document.createElement('div'), { className: 'tip', role: 'tooltip' });
  box.append(tipEl);
  tipEl.innerHTML = target.dataset.tip;
  const r = target.getBoundingClientRect(), b = box.getBoundingClientRect();
  const x = Math.min(Math.max(r.left + r.width / 2 - b.left, 70), b.width - 70);
  tipEl.style.left = `${x}px`;
  tipEl.style.top = `${r.top - b.top + (target.tagName === 'rect' ? r.height / 2 : 0)}px`;
  const g = target.closest('[data-hl]');
  const svg = target.closest('svg.bump');
  if (svg) { svg.classList.add('hl'); svg.querySelectorAll('.tl').forEach(n => n.classList.toggle('on', n === g)); }
}
function hideTip() {
  tipEl?.remove();
  document.querySelectorAll('svg.bump.hl').forEach(s => { s.classList.remove('hl'); s.querySelectorAll('.on').forEach(n => n.classList.remove('on')); });
}
document.addEventListener('pointerover', e => { const t = e.target.closest?.('[data-tip]'); if (t) showTip(t); });
document.addEventListener('pointerout', e => { if (e.target.closest?.('[data-tip]')) hideTip(); });

function applyTheme(t) {
  if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  const dark = t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  const btn = $('#theme');
  if (btn) { btn.innerHTML = icon(dark ? 'sun' : 'moon'); btn.setAttribute('aria-label', dark ? 'Passer en thème clair' : 'Passer en thème sombre'); }
}
function toggleTheme() {
  const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = cur === 'dark' ? 'light' : 'dark';
  store.set('theme', next);
  applyTheme(next);
}

window.addEventListener('hashchange', () => {
  const v = location.hash.slice(1);
  if (VIEWS.some(x => x.id === v) && v !== state.view) { state.view = v; render(); window.scrollTo({ top: 0 }); }
});

// ---------- Démarrage ----------

async function start() {
  applyTheme(store.get('theme'));
  document.querySelectorAll('[data-nav]').forEach(a => {
    const v = VIEWS.find(x => x.id === a.dataset.nav);
    if (a.closest('.tabbar')) a.innerHTML = `${icon(v.icon)}<span>${v.label}</span>`;
  });
  const hv = location.hash.slice(1);
  if (VIEWS.some(x => x.id === hv)) state.view = hv;
  try {
    const res = await fetch('data/data.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    D = await res.json();
  } catch (e) {
    $('#app').innerHTML = `<div class="card"><p><b>Impossible de charger les données.</b></p><p class="small muted">Vérifiez votre connexion puis rechargez la page.</p></div>`;
    return;
  }
  M = buildModel();
  renderChrome();
  render();
  setInterval(tick, 1000);
  // Recalcule les états « prochain match », « en cours »… toutes les 10 minutes.
  setInterval(() => { M = buildModel(); if (!document.querySelector('dialog[open]')) render(); }, 600e3);
  if ('serviceWorker' in navigator && /^https:|^http:\/\/localhost/.test(location.href) && window.top === window) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

start();
