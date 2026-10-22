// Ce qui mérite une notification, d'après data/data.json et l'état mémorisé au passage précédent.
import { kickoff, teamName, prettyName, prettyCity, matchPoints } from '../../assets/lib.js';

export const TOPICS = ['reminders', 'results', 'changes', 'referee'];

const HOUR = 3600e3;
const TZ = 'Europe/Paris';
const fmt = (d, o) => new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, ...o }).format(d);
const hour = t => (t ? `${+t.split(':')[0]}h${t.split(':')[1]}` : 'horaire à confirmer');
const clock = ms => fmt(new Date(ms), { hour: '2-digit', minute: '2-digit' }).replace(':', 'h');
const longDate = ms => fmt(new Date(ms), { weekday: 'long', day: 'numeric', month: 'long' });
const dur = min => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`);
const ord = n => (n === 1 ? '1er' : `${n}e`);

function dayBefore(iso) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Ce qu'on retient de chaque match pour repérer les changements. */
export function snapshot(data) {
  return Object.fromEntries(data.matches.map(m => [m.code, { d: m.date, t: m.time, v: m.venueName ?? null, p: Boolean(m.played) }]));
}

export function computeEvents(data, prev, now = Date.now()) {
  const c = data.config;
  const T = c.team;
  const N = t => teamName(t, c);
  const venue = m => (m.venue && data.venues[m.venue]) || (m.venueName ? { name: m.venueName } : null);
  const where = m => { const v = venue(m); return v ? `${prettyName(v.name)}${v.city ? ', ' + prettyCity(v.city) : ''}` : ''; };
  const homeCity = prettyCity(data.venues[data.homeVenue]?.city || 'Liévin');
  const buffer = c.arrivalBufferMinutes ?? 60;
  const advice = m => {
    const v = venue(m);
    if (!m.time) return '';
    if (m.home === T) return `arrivée conseillée ${clock(m.ko - buffer * 60e3)}`;
    if (v?.driveMin == null) return '';
    const leave = Math.floor((m.ko - (buffer + v.driveMin) * 60e3) / 300e3) * 300e3;
    return `départ de ${homeCity} conseillé à ${clock(leave)} (${dur(v.driveMin)} de route)`;
  };

  const matches = data.matches.map(m => ({ ...m, ko: kickoff(m).getTime() }));
  const ours = matches.filter(m => m.home === T || m.away === T);
  const sent = { ...(prev?.sent ?? {}) };
  const out = [];
  // Au tout premier passage on mémorise seulement : pas d'avalanche de vieilles nouvelles.
  const emit = (key, topic, payload) => {
    if (sent[key]) return;
    sent[key] = now;
    if (prev) out.push({ topic, ...payload });
  };

  // Résultats de l'équipe.
  const row = data.standings.find(s => s.team === T);
  for (const m of ours) {
    const was = prev?.matches?.[m.code];
    if (!m.played || !was || was.p) continue;
    const home = m.home === T;
    const [sf, sa] = home ? m.sets : [m.sets[1], m.sets[0]];
    const opp = home ? m.away : m.home;
    const pts = matchPoints(sf, sa);
    const verdict = sf > sa ? 'Victoire' : 'Défaite';
    const sets = m.setScores.map(s => (home ? s : [s[1], s[0]]).join('-')).join(' · ');
    emit(`res:${m.code}`, 'results', {
      title: `${verdict} ${sf}-${sa} ${home ? 'contre' : 'à'} ${N(opp)}`,
      body: `${sets}${pts ? ` · +${pts} pt${pts > 1 ? 's' : ''}` : ''}${row ? ` · ${N(T)} ${ord(row.rank)} (${row.pts} pts)` : ''}`,
      url: '#accueil', tag: `res-${m.code}`, badge: 1
    });
  }

  // Changement de date, d'heure ou de salle sur un match à venir.
  for (const m of ours) {
    const was = prev?.matches?.[m.code];
    if (!was || was.p || m.played || m.ko < now) continue;
    const moved = was.d !== m.date || was.t !== m.time;
    const newVenue = (was.v ?? null) !== (m.venueName ?? null) && m.venueName;
    if (!moved && !newVenue) continue;
    const before = kickoff({ date: was.d, time: was.t }).getTime();
    const parts = [];
    if (moved) parts.push(`Désormais ${longDate(m.ko)} à ${hour(m.time)} (au lieu de ${longDate(before)}${was.t ? ' à ' + hour(was.t) : ''})`);
    if (newVenue) parts.push(`Nouvelle salle : ${where(m)}`);
    emit(`chg:${m.code}:${m.date}:${m.time}:${m.venueName}`, 'changes', {
      title: `Changement : ${N(m.home)} – ${N(m.away)}`, body: parts.join('. '), url: '#calendrier', tag: `chg-${m.code}`
    });
  }

  // Rappels : la veille à 18h, puis 3 h avant le coup d'envoi.
  for (const m of ours) {
    if (m.played || !m.time) continue;
    const eve = kickoff({ date: dayBefore(m.date), time: '18:00' }).getTime();
    const vs = `${N(m.home)} – ${N(m.away)}`;
    if (now >= eve && now < Math.min(eve + 12 * HOUR, m.ko - 4 * HOUR)) {
      emit(`eve:${m.code}:${m.date}`, 'reminders', {
        title: `Demain ${hour(m.time)} : ${vs}`, body: [where(m), advice(m)].filter(Boolean).join(' · '), url: '#accueil', tag: `rem-${m.code}`
      });
    }
    const h = +m.time.split(':')[0];
    if (now >= m.ko - 3 * HOUR && now < m.ko) {
      emit(`day:${m.code}:${m.date}`, 'reminders', {
        title: `${h >= 17 ? 'Ce soir' : h >= 12 ? 'Cet après-midi' : 'Ce matin'} ${hour(m.time)} : ${vs}`,
        body: [where(m), advice(m)].filter(Boolean).join(' · '), url: '#accueil', tag: `rem-${m.code}`, urgency: 'high'
      });
    }
  }

  // Arbitrages confiés au club : rappel la veille à 18h.
  const token = (c.refereeToken || T.replace(/\s+\d+$/, '')).toUpperCase();
  for (const m of matches) {
    if (m.played || m.home === T || m.away === T || !m.referee) continue;
    if (!new RegExp(`(^|\\s)${token}(\\s|$)`, 'i').test(m.referee)) continue;
    const eve = kickoff({ date: dayBefore(m.date), time: '18:00' }).getTime();
    if (now >= eve && now < Math.min(eve + 12 * HOUR, m.ko)) {
      emit(`ref:${m.code}:${m.date}`, 'referee', {
        title: `Arbitrage demain : ${N(m.home)} – ${N(m.away)}`, body: [hour(m.time), where(m)].filter(Boolean).join(' · '), url: '#accueil', tag: `ref-${m.code}`
      });
    }
  }

  // On oublie ce qui date de plus de 90 jours.
  for (const [k, t] of Object.entries(sent)) if (now - t > 90 * 24 * HOUR) delete sent[k];

  return { notifications: out, state: { v: 1, matches: snapshot(data), sent } };
}
