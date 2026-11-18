#!/usr/bin/env node
// Image d'aperçu des liens (WhatsApp, Messenger, SMS…) : le prochain match de l'équipe, régénérée à chaque mise à jour.
// Écrit assets/og.png et met à jour les balises og: d'index.html (adresse versionnée pour contourner le cache des messageries).

import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { kickoff, teamName } from '../assets/lib.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(await readFile(path.join(ROOT, 'data', 'data.json'), 'utf8'));
const c = data.config;
const T = c.team;
const N = t => teamName(t, c);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const up = s => s.toLocaleUpperCase('fr-FR');
const fmt = (d, o) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', ...o }).format(d);

const now = Date.now();
const next = data.matches
  .filter(m => (m.home === T || m.away === T) && !m.played && kickoff(m).getTime() > now - 3 * 3600e3)
  .sort((a, b) => kickoff(a) - kickoff(b))[0];
const row = data.standings.find(s => s.team === T);

// Big Shoulders est très condensée : environ une demi-cadratin par capitale.
const fit = (text, max, width = 1060) => Math.min(max, Math.floor(width / (text.length * 0.5)));

let tag, lines;
if (next) {
  const home = next.home === T;
  const opp = home ? next.away : next.home;
  const when = fmt(kickoff(next), { weekday: 'long', day: 'numeric', month: 'long' });
  const hour = next.time ? ` · ${+next.time.split(':')[0]}H${next.time.split(':')[1]}` : '';
  tag = 'PROCHAIN MATCH';
  lines = { us: up(N(T)), sep: home ? 'REÇOIT' : 'CHEZ', them: up(N(opp)), info: `${up(when)}${hour} · JOURNÉE ${next.journee}` };
} else {
  tag = `SAISON ${data.source.season}`;
  lines = { us: up(N(T)), sep: '', them: '', info: row ? `${row.rank === 1 ? '1ER' : row.rank + 'E'} · ${row.pts} POINTS · ${row.won} VICTOIRES` : '' };
}

const usSize = fit(lines.us, 150);
const themSize = fit(lines.them, 112);
const tagW = Math.round(tag.length * 19 + 40);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#D3122B"/>
  <g transform="translate(760 330) rotate(-8)" fill="none" stroke="#FFFFFF" stroke-opacity="0.13" stroke-width="5">
    <rect x="-560" y="-280" width="1120" height="560"/><line x1="0" y1="-330" x2="0" y2="330" stroke-width="12"/>
    <line x1="-187" y1="-280" x2="-187" y2="280"/><line x1="187" y1="-280" x2="187" y2="280"/>
  </g>
  <text x="64" y="86" font-family="Big Shoulders Display" font-weight="900" font-size="46" fill="#FFFFFF">${esc(up(c.clubShort || 'VC Liévin'))}</text>
  <text x="64" y="120" font-family="Figtree" font-weight="600" font-size="22" fill="#FFFFFF">${esc(up(data.source.pouleLabel))}</text>
  <rect x="64" y="148" width="${tagW}" height="48" fill="#FFFFFF"/>
  <text x="84" y="185" font-family="Big Shoulders Display" font-weight="900" font-size="36" fill="#D3122B">${esc(tag)}</text>
  <text x="60" y="${196 + usSize * 0.95}" font-family="Big Shoulders Display" font-weight="900" font-size="${usSize}" fill="#FFFFFF">${esc(lines.us)}</text>
  ${lines.sep ? `<text x="66" y="${196 + usSize * 0.95 + 46}" font-family="Big Shoulders Display" font-weight="900" font-size="34" letter-spacing="6" fill="#FFFFFF">${esc(lines.sep)}</text>` : ''}
  ${lines.them ? `<text x="60" y="${196 + usSize * 0.95 + 46 + themSize * 0.92}" font-family="Big Shoulders Display" font-weight="900" font-size="${themSize}" fill="#FFFFFF" fill-opacity="0.86">${esc(lines.them)}</text>` : ''}
  <rect y="572" width="1200" height="58" fill="#FFFFFF"/>
  <text x="64" y="610" font-family="Figtree" font-weight="800" font-size="26" fill="#D3122B">${esc(lines.info)}</text>
  <text x="1136" y="610" text-anchor="end" font-family="Figtree" font-weight="600" font-size="22" fill="#17151B">Résultats · classement · rappels</text>
</svg>`;

const fontFiles = ['BigShouldersDisplay-Black.ttf', 'Figtree-SemiBold.ttf', 'Figtree-ExtraBold.ttf'].map(f => path.join(ROOT, 'assets', 'fonts', f));
const png = new Resvg(svg, { font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Figtree' }, fitTo: { mode: 'width', value: 1200 } }).render().asPng();
await writeFile(path.join(ROOT, 'assets', 'og.png'), png);

const version = createHash('sha1').update(png).digest('hex').slice(0, 10);
const site = c.siteUrl || '';
const block = `<!-- og:start (généré par scripts/og.mjs) -->
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(c.clubShort || 'VC Liévin')}">
<meta property="og:locale" content="fr_FR">
<meta property="og:url" content="${site}">
<meta property="og:title" content="${esc(`${c.clubShort || 'VC Liévin'} · ${N(T)}`)}">
<meta property="og:description" content="${esc(next ? `${lines.info.charAt(0) + lines.info.slice(1).toLowerCase()} : ${N(next.home)} – ${N(next.away)}. Résultats, classement et rappels de match.` : 'Résultats, classement et rappels de match.')}">
<meta property="og:image" content="${site}assets/og.png?v=${version}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(next ? `Prochain match : ${N(next.home)} contre ${N(next.away)}` : N(T))}">
<meta name="twitter:card" content="summary_large_image">
<!-- og:end -->`;
const htmlPath = path.join(ROOT, 'index.html');
const html = await readFile(htmlPath, 'utf8');
const updated = html.replace(/<!-- og:start[\s\S]*?<!-- og:end -->/, block);
if (updated === html && !html.includes('og:start')) throw new Error('Repères og:start / og:end absents d\'index.html');
if (updated !== html) await writeFile(htmlPath, updated);
console.log('• assets/og.png', next ? `(${N(next.home)} – ${N(next.away)})` : '(fin de saison)', `v=${version}`);
