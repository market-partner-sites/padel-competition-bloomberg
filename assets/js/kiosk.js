/* Padel Courtside — touchscreen kiosk.
   Reads the tournament from the Market Partner event platform (bbgevent.app):
     agendas              → one agenda per court + knockout_stages, one Session per match
     content-relationships → Session → Custom:score entity, Session → home_team / away_team registration
     content/entities     → Custom:score: home_team_points, away_team_points, match_status
     registrations        → teams (profile.first_name = team name, player_1/2 names, charity)
   Live API first; falls back to the same-origin snapshots in data/ (kept fresh by the GitHub Action).
   Settings live in assets/js/config.js. */
(function(){
'use strict';
const CFG = window.KIOSK_CONFIG;
const params = new URLSearchParams(location.search);

/* ===================== STATE ===================== */
let T = { fixtures: [], teams: [] };   // filled by loadAll()
let FX = {}, TEAM_GROUP = {};
let SCORES = {};                        // match id -> {hs, as, status, home?, away?}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt12 = hm => { const [h,m] = hm.split(':').map(Number); return ((h+11)%12+1)+':'+String(m).padStart(2,'0')+(h>=12?' pm':' am'); };
/* ===================== DERIVED TOURNAMENT ===================== */
function statusOf(id){ return (SCORES[id] && SCORES[id].status) || 'scheduled'; }
function num(v){ return (v === '' || v == null || isNaN(+v)) ? null : +v; }

function standings(groupId){
  const rows = {};
  const teams = Object.keys(TEAM_GROUP).filter(t => !groupId || TEAM_GROUP[t] === groupId);
  teams.forEach(t => rows[t] = {team:t, group:TEAM_GROUP[t], P:0,W:0,L:0,D:0,F:0,A:0});
  T.fixtures.filter(f => f.stage !== 'ko' && (!groupId || f.stage === groupId)).forEach(f => {
    const s = SCORES[f.id]; if (!s || s.status !== 'final') return;
    const hs = num(s.hs), as = num(s.as); if (hs == null || as == null) return;
    [[f.home,hs,as],[f.away,as,hs]].forEach(([t,a,b]) => { const r = rows[t]; if (!r) return;
      r.P++; r.F += a; r.A += b; if (a > b) r.W++; else if (a < b) r.L++; else r.D++; });
  });
  const list = Object.values(rows).map(r => ({...r, Diff:r.F-r.A, Pts:r.W*CFG.points.win + r.D*CFG.points.draw}));
  list.sort((a,b) => b.Pts-a.Pts || b.Diff-a.Diff || b.F-a.F || a.team.localeCompare(b.team));
  return list;
}
function groupsComplete(){ return T.fixtures.filter(f => f.stage !== 'ko').every(f => statusOf(f.id) === 'final'); }
function qualifiers(){
  const w = [], r = [];
  CFG.groups.forEach(g => { const s = standings(g.id); if (s[0]) w.push(s[0]); if (s[1]) r.push(s[1]); });
  const cmp = (a,b) => b.Pts-a.Pts || b.Diff-a.Diff || b.F-a.F;
  w.sort(cmp); r.sort(cmp);
  return w.slice(0, CFG.qualifiers.winners).concat(r.slice(0, CFG.qualifiers.bestRunnersUp));
}
function winnerLoser(id){
  const s = SCORES[id], t = koTeams(id);
  if (!s || s.status !== 'final' || !t.home || !t.away) return {};
  const hs = num(s.hs), as = num(s.as); if (hs == null || as == null || hs === as) return {};
  return hs > as ? {W:t.home, L:t.away} : {W:t.away, L:t.home};
}
function koTeams(id){
  const s = SCORES[id] || {}, def = CFG.ko[id];
  if (s.home && s.away) return {home:s.home, away:s.away};
  let home = s.home || null, away = s.away || null, hint = ['',''];
  if (def.from){
    def.from.forEach(([k,src],i) => { const r = winnerLoser(src)[k] || null;
      if (i===0 && !home) home = r; if (i===1 && !away) away = r;
      hint[i] = (k==='W'?'Winner ':'Loser ') + CFG.ko[src].label; });
  } else {
    const pair = CFG.seedPairs[id];
    if (groupsComplete()){ const q = qualifiers(); home = home || (q[pair[0]-1]||{}).team || null; away = away || (q[pair[1]-1]||{}).team || null; }
    hint = ['Seed '+pair[0], 'Seed '+pair[1]];
  }
  return {home, away, hint};
}
function match(id){
  const f = FX[id], s = SCORES[id] || {};
  const t = f.stage === 'ko' ? koTeams(id) : {home:f.home, away:f.away, hint:['','']};
  const hs = num(s.hs), as = num(s.as), status = s.status || 'scheduled';
  let win = null;
  if (status === 'final' && hs != null && as != null && hs !== as) win = hs > as ? 'home' : 'away';
  return {...f, home:t.home, away:t.away, hint:t.hint||['',''], hs, as, status, win,
    label: f.stage === 'ko' ? CFG.ko[id].label : f.label,
    stageName: f.stage === 'ko' ? CFG.ko[id].round : 'Court '+f.court+' · Round robin'};
}
const allMatches = () => T.fixtures.map(f => match(f.id));
const byTime = (a,b) => a.time.localeCompare(b.time) || a.court - b.court;

/* ===================== KIOSK RENDER ===================== */
const $ = id => document.getElementById(id);
function teamName(m, side){ return m[side] || m.hint[side==='home'?0:1] || 'To be decided'; }
function stateChip(m){
  if (m.status === 'live') return '<span class="chip chip--live"><span class="dot"></span>Live</span>';
  if (m.status === 'final') return '<span class="chip chip--final">Final</span>';
  return '<span class="chip chip--next num">'+fmt12(m.time)+'</span>';
}
function courtFocus(ms, court){
  const on = ms.filter(m => m.court === court).sort(byTime);
  return on.find(m => m.status === 'live') || on.find(m => m.status === 'scheduled') || on[on.length-1];
}
function renderHome(){
  const ms = allMatches();
  const live = ms.filter(m => m.status === 'live'), done = ms.filter(m => m.status === 'final');
  const final = match('final');
  $('home-title').textContent = final.status === 'final' ? 'Tournament complete' : (live.length ? 'On court now' : 'Welcome');
  let strip = '';
  if (live.length) strip += '<span class="pill pill--live"><span class="dot"></span>'+live.length+' live</span>';
  strip += '<span class="pill num">'+done.length+' of '+ms.length+' matches played</span>';
  strip += '<span class="pill">'+(groupsComplete() ? 'Knockout stage' : 'Round robin')+'</span>';
  $('home-status').innerHTML = strip;

  $('home-champion').innerHTML = final.status === 'final' && final.win ? (
    '<div class="champion pattern"><svg viewBox="0 0 24 24"><path d="M7 3h10v2h4v3a5 5 0 0 1-5 5h-.3A5 5 0 0 1 13 15.9V18h3v3H8v-3h3v-2.1A5 5 0 0 1 8.3 13H8a5 5 0 0 1-5-5V5h4V3zm-2 4v1a3 3 0 0 0 2.2 2.9A5 5 0 0 1 7 10V7H5zm12 0v3c0 .3 0 .6-.1.9A3 3 0 0 0 19 8V7h-2z"/></svg>'+
    '<div><span>Champions</span><b>'+esc(final[final.win])+'</b><small class="num">Beat '+esc(final[final.win==='home'?'away':'home'])+' '+Math.max(final.hs,final.as)+'–'+Math.min(final.hs,final.as)+' in the final</small></div></div>') : '';

  $('courts-meta').textContent = live.length ? 'Tap a court for its results' : 'Latest on each court';
  $('home-courts').innerHTML = [1,2,3,4,5].map(c => {
    const m = courtFocus(ms, c); if (!m) return '';
    const hl = m.win === 'away' ? ' lost' : '', al = m.win === 'home' ? ' lost' : '';
    const sc = v => m.status === 'scheduled' ? '' : (v ?? '–');
    return '<button class="court-row" type="button" data-court="'+c+'">'+
      '<div class="court-row__tag"><small>Court</small><b>'+c+'</b></div>'+
      '<div class="court-row__match"><div class="court-row__meta">'+esc(m.stage==='ko'?m.label:m.label+' · Round robin')+'</div>'+
      '<div class="court-row__side'+hl+'"><span class="t">'+esc(teamName(m,'home'))+'</span><span class="s num">'+sc(m.hs)+'</span></div>'+
      '<div class="court-row__side'+al+'"><span class="t">'+esc(teamName(m,'away'))+'</span><span class="s num">'+sc(m.as)+'</span></div></div>'+
      '<div class="court-row__state">'+stateChip(m)+'</div></button>';
  }).join('');

  const focused = new Set([1,2,3,4,5].map(c => (courtFocus(ms,c)||{}).id));
  const next = ms.filter(m => m.status === 'scheduled' && !focused.has(m.id)).sort(byTime).slice(0,4);
  $('home-next-wrap').hidden = !next.length;
  $('home-next').innerHTML = next.map(m =>
    '<div class="mini"><div class="mini__meta"><span class="num">'+fmt12(m.time)+' · Court '+m.court+'</span><span>'+esc(m.label)+'</span></div>'+
    '<div class="mini__teams">'+esc(teamName(m,'home'))+'<i>v</i>'+esc(teamName(m,'away'))+'</div></div>').join('');
}

function mcard(m){
  const hl = m.win === 'away' ? ' lost' : '', al = m.win === 'home' ? ' lost' : '';
  return '<div class="mcard"><div class="mcard__meta"><span class="num">'+fmt12(m.time)+'</span><em>Court '+m.court+'</em></div>'+
    '<div class="mcard__label" style="display:flex;justify-content:space-between;align-items:center;gap:10px"><span>'+esc(m.stage==='ko'?m.label:'C'+m.court+' · '+m.label)+'</span>'+(m.status==='live'?stateChip(m):'')+'</div>'+
    '<div class="mcard__row'+hl+'"><span>'+esc(teamName(m,'home'))+'</span><span class="s num">'+(m.hs ?? '–')+'</span></div>'+
    '<div class="mcard__row'+al+'"><span>'+esc(teamName(m,'away'))+'</span><span class="s num">'+(m.as ?? '–')+'</span></div></div>';
}
const STAGE_TABS = [{id:'all',name:'All'}].concat(CFG.groups.map(g => ({id:g.id,name:g.name})), [{id:'ko',name:'Knockout'}]);
let resultsTab = 'all', groupTab = 'c1', teamsTab = 'all';
function segs(el, tabs, cur, attr){ el.innerHTML = tabs.map(t => '<button type="button" class="seg'+(t.id===cur?' is-on':'')+'" data-'+attr+'="'+t.id+'">'+esc(t.name)+'</button>').join(''); }
function renderResults(){
  segs($('results-toggle'), STAGE_TABS, resultsTab, 'rtab');
  const ms = allMatches().filter(m => m.status !== 'scheduled' && (resultsTab==='all' || m.stage===resultsTab))
    .sort((a,b) => (a.status==='live'?0:1)-(b.status==='live'?0:1) || b.time.localeCompare(a.time) || a.court-b.court);
  $('results-body').innerHTML = ms.length ? '<div class="cards">'+ms.map(mcard).join('')+'</div>' : '<div class="empty">No results yet.</div>';
}
function tableHTML(rows, qset, tap){
  return '<table class="table num"><thead><tr><th>Team</th><th>P</th><th>W</th><th>L</th><th>D</th><th>F</th><th>A</th><th>Diff</th><th>Pts</th></tr></thead><tbody>'+
    rows.map(r => '<tr class="'+(qset.has(r.team)?'q ':'')+(tap?'is-tap':'')+'" data-team="'+esc(r.team)+'"><td>'+esc(r.team)+'</td><td>'+r.P+'</td><td>'+r.W+'</td><td>'+r.L+'</td><td>'+r.D+'</td><td>'+r.F+'</td><td>'+r.A+'</td><td>'+(r.Diff>0?'+':'')+r.Diff+'</td><td class="pts">'+r.Pts+'</td></tr>').join('')+
    '</tbody></table>';
}
function qSet(){ return groupsComplete() ? new Set(qualifiers().map(q => q.team)) : new Set(); }
function renderStandings(){
  segs($('group-toggle'), CFG.groups, groupTab, 'gtab');
  const rows = standings(groupTab), g = CFG.groups.find(x => x.id === groupTab);
  const fx = allMatches().filter(m => m.stage === groupTab).sort(byTime);
  $('standings-body').innerHTML =
    '<div>'+tableHTML(rows, qSet(), true)+'<p class="note">Win 3 points. Ties split on points difference, then points won. Group winners and the three best runners-up (<b>Q</b>) go through to the quarter finals.</p></div>'+
    '<div><h3>'+esc(g.name)+' matches</h3><div class="cards">'+fx.map(mcard).join('')+'</div></div>';
}
function bm(m, cls){
  const row = side => { const t = m[side], lost = m.win && m.win !== side;
    return '<div class="bm__row'+(t?'':' tbd')+(lost?' lost':'')+'"><span class="t">'+esc(teamName(m,side))+'</span><span class="num">'+((side==='home'?m.hs:m.as) ?? '')+'</span></div>'; };
  return '<div class="bm '+(cls||'')+'"><div class="bm__meta"><span class="num">'+fmt12(m.time)+'</span><span>'+(m.status==='live'?'<span style="color:var(--live)">● Live</span> · ':'')+'Court '+m.court+'</span></div>'+row('home')+row('away')+'</div>';
}
function renderKnockout(){
  const col = (title, ids, cls) => '<div class="bracket__col"><h4>'+title+'</h4>'+ids.map(id => bm(match(id), cls)).join('')+'</div>';
  const all = standings(null), q = qSet();
  $('knockout-body').innerHTML =
    '<div><h3>Draw</h3><div class="bracket">'+col('Quarter finals',['qf1','qf2','qf3','qf4'])+col('Semi finals',['sf1','sf2'])+col('3rd / 4th',['bronze'])+col('Final',['final'],'bm--final')+'</div></div>'+
    '<div><h3>Qualifying standings</h3>'+tableHTML(all, q, true)+'<p class="note">Round-robin matches only.</p></div>';
}
function renderTeams(){
  segs($('teams-toggle'), [{id:'all',name:'All'}].concat(CFG.groups), teamsTab, 'ttab');
  const st = Object.fromEntries(standings(null).map(r => [r.team, r]));
  $('teams-body').innerHTML = T.teams.filter(t => teamsTab==='all' || TEAM_GROUP[t.name]===teamsTab).map(t => { const r = st[t.name] || {W:0,L:0,P:0};
    return '<button type="button" class="tcard" data-team="'+esc(t.name)+'"><span class="tcard__court">'+esc((CFG.groups.find(g=>g.id===TEAM_GROUP[t.name])||{}).name||'')+'</span>'+
      '<span class="tcard__name">'+esc(t.name)+'</span><span class="tcard__players">'+t.players.map(esc).join('<br>')+'</span>'+
      '<span class="tcard__rec num">'+r.W+'W '+r.L+'L</span></button>'; }).join('');
}
function openTeam(name){
  const t = T.teams.find(x => x.name === name); if (!t) return;
  const r = standings(null).find(x => x.team === name) || {P:0,W:0,L:0,Diff:0,Pts:0};
  const ms = allMatches().filter(m => m.home === name || m.away === name).sort(byTime);
  openSheet('<h2>'+esc(name)+'</h2><p class="sheet__sub">'+t.players.map(esc).join(' &amp; ')+' · '+esc((CFG.groups.find(g=>g.id===TEAM_GROUP[name])||{}).name||'')+'</p>'+
    '<div class="sheet__stats num"><div class="stat"><b>'+r.W+'–'+r.L+'</b><span>Won–lost</span></div><div class="stat"><b>'+r.Pts+'</b><span>Group pts</span></div><div class="stat"><b>'+(r.Diff>0?'+':'')+r.Diff+'</b><span>Diff</span></div><div class="stat"><b>'+ms.filter(m=>m.stage==='ko').length+'</b><span>KO matches</span></div></div>'+
    '<div class="cards">'+ms.map(mcard).join('')+'</div>');
}
function openCourt(c){
  const ms = allMatches().filter(m => m.court === c).sort(byTime);
  openSheet('<h2>Court '+c+'</h2><p class="sheet__sub">'+ms.filter(m=>m.status==='final').length+' of '+ms.length+' matches played</p><div class="cards">'+ms.map(mcard).join('')+'</div>');
}

/* Map (layout from the venue plan) */
const COURTS = CFG.map.courts;
let mapSel = null;
function renderMap(){
  const ms = allMatches();
  let s = '<rect x="0" y="0" width="395" height="305" fill="#9dd6c0"/>';
  CFG.map.areas.forEach(a => { s += '<rect x="'+a.x+'" y="'+a.y+'" width="'+a.w+'" height="'+a.h+'" rx="3" fill="#d6d0cd"/>'+(a.doors||[]).map(d => '<rect x="'+d.x+'" y="'+d.y+'" width="'+d.w+'" height="'+d.h+'" fill="#2f9b4a"/>').join('')+
    '<text x="'+(a.x+a.w/2)+'" y="'+(a.y+a.h/2+3)+'" text-anchor="middle" font-size="9" font-weight="700" fill="#5b5552">'+esc(a.label)+'</text>'; });
  COURTS.forEach(k => {
    const on = ms.some(m => m.court === k.c && m.status === 'live');
    const sel = mapSel === k.c;
    let lines = '';
    if (k.o === 'v'){ const my = k.y+k.h/2, s1 = k.y+k.h*.2, s2 = k.y+k.h*.8, cx = k.x+k.w/2;
      lines = '<line x1="'+k.x+'" y1="'+my+'" x2="'+(k.x+k.w)+'" y2="'+my+'" stroke-width="2.2"/><line x1="'+k.x+'" y1="'+s1+'" x2="'+(k.x+k.w)+'" y2="'+s1+'"/><line x1="'+k.x+'" y1="'+s2+'" x2="'+(k.x+k.w)+'" y2="'+s2+'"/><line x1="'+cx+'" y1="'+s1+'" x2="'+cx+'" y2="'+s2+'"/>';
    } else { const mx = k.x+k.w/2, s1 = k.x+k.w*.2, s2 = k.x+k.w*.8, cy = k.y+k.h/2;
      lines = '<line x1="'+mx+'" y1="'+k.y+'" x2="'+mx+'" y2="'+(k.y+k.h)+'" stroke-width="2.2"/><line x1="'+s1+'" y1="'+k.y+'" x2="'+s1+'" y2="'+(k.y+k.h)+'"/><line x1="'+s2+'" y1="'+k.y+'" x2="'+s2+'" y2="'+(k.y+k.h)+'"/><line x1="'+s1+'" y1="'+cy+'" x2="'+s2+'" y2="'+cy+'"/>'; }
    const lx = k.x+k.w/2, ly = k.y+k.h/2;
    s += '<g class="court-z'+(sel?' is-on':'')+'" data-court="'+k.c+'" role="button" aria-label="Court '+k.c+'">'+
      '<rect class="base" x="'+k.x+'" y="'+k.y+'" width="'+k.w+'" height="'+k.h+'" rx="3" fill="'+(sel?'#16357a':'#1f4fae')+'"/>'+
      '<g stroke="#e8eefc" stroke-width="1" opacity=".75">'+lines+'</g>'+
      '<rect x="'+(lx-30)+'" y="'+(ly-12)+'" width="60" height="24" rx="12" fill="#0f2d1b" opacity=".85"/>'+
      '<text x="'+lx+'" y="'+(ly+4.5)+'" text-anchor="middle" font-size="12" font-weight="800" fill="#fff">COURT '+k.c+'</text>'+
      (on ? '<circle cx="'+(k.x+k.w-9)+'" cy="'+(k.y+9)+'" r="5" fill="#d9412b" stroke="#fff" stroke-width="1.5"><animate attributeName="opacity" values="1;.3;1" dur="1.4s" repeatCount="indefinite"/></circle>' : '')+
      '</g>';
  });
  $('map-svg').innerHTML = s;
  if (mapSel){
    const m = courtFocus(ms, mapSel);
    $('zone-card').innerHTML = '<h3>Court '+mapSel+'</h3><p>'+(m.status==='live'?'Playing now':m.status==='scheduled'?'Next up':'Last result')+'</p><div style="margin-top:18px">'+mcard(m)+'</div>';
  }
}

function renderAttract(){
  const ms = allMatches(), final = match('final');
  const cards = [];
  const live = ms.filter(m => m.status === 'live').sort(byTime);
  if (live.length) cards.push('<h3>Live now</h3>'+live.map(m => '<div class="ac-row"><div><small>Court '+m.court+' · '+esc(m.label)+'</small>'+esc(teamName(m,'home'))+' v '+esc(teamName(m,'away'))+'</div><b class="num">'+(m.hs??0)+' – '+(m.as??0)+'</b></div>').join(''));
  if (final.status === 'final' && final.win) cards.push('<h3>Champions</h3><div class="ac-row"><div><small>Final · Court '+final.court+'</small>'+esc(final[final.win])+'</div><b class="num">'+Math.max(final.hs,final.as)+' – '+Math.min(final.hs,final.as)+'</b></div>'+
    ['bronze','sf1','sf2'].map(id => { const m = match(id); return m.status==='final' ? '<div class="ac-row"><div><small>'+esc(m.label)+'</small>'+esc(teamName(m,'home'))+' v '+esc(teamName(m,'away'))+'</div><b class="num">'+m.hs+' – '+m.as+'</b></div>' : ''; }).join(''));
  cards.push('<h3>Group leaders</h3>'+CFG.groups.map(g => { const s = standings(g.id)[0]; return s ? '<div class="ac-row"><div><small>'+esc(g.name)+'</small>'+esc(s.team)+'</div><b class="num">'+s.Pts+' pts</b></div>' : ''; }).join(''));
  const next = ms.filter(m => m.status === 'scheduled').sort(byTime).slice(0,5);
  if (next.length) cards.push('<h3>Coming up</h3>'+next.map(m => '<div class="ac-row"><div><small class="num">'+fmt12(m.time)+' · Court '+m.court+'</small>'+esc(teamName(m,'home'))+' v '+esc(teamName(m,'away'))+'</div></div>').join(''));
  return cards;
}
let attractIdx = 0, attractTimer = null;
function cycleAttract(){ const cards = renderAttract(); attractIdx = (attractIdx+1) % cards.length; const el = $('attract-card'); el.style.opacity = 0; setTimeout(() => { el.innerHTML = cards[attractIdx]; el.style.opacity = 1; }, 400); }

/* Navigation, sheet, idle */
let current = 'home';
const RENDER = {home:renderHome, standings:renderStandings, results:renderResults, knockout:renderKnockout, teams:renderTeams, map:renderMap};
function go(v){ current = v; document.querySelectorAll('.view').forEach(e => e.classList.toggle('is-active', e.id === 'view-'+v));
  document.querySelectorAll('.dock__btn').forEach(b => b.classList.toggle('is-active', b.dataset.go === v)); closeSheet(); RENDER[v](); }
function renderAll(){ if (!T.fixtures.length) return; RENDER[current](); if ($('attract').classList.contains('is-on') && !$('attract-card').innerHTML) $('attract-card').innerHTML = renderAttract()[0]; }
function openSheet(html){ $('sheet-body').innerHTML = html; $('sheet-body').scrollTop = 0; $('sheet').classList.add('is-open'); $('sheet').setAttribute('aria-hidden','false'); }
function closeSheet(){ $('sheet').classList.remove('is-open'); $('sheet').setAttribute('aria-hidden','true'); }
function showAttract(){ closeSheet(); mapSel = null; go('home'); $('attract-card').innerHTML = renderAttract()[0]; attractIdx = 0; $('attract').classList.add('is-on'); clearInterval(attractTimer); attractTimer = setInterval(cycleAttract, 9000); }
function hideAttract(){ $('attract').classList.remove('is-on'); clearInterval(attractTimer); }
let idleT = null;
function bump(){ clearTimeout(idleT); idleT = setTimeout(showAttract, CFG.idleSeconds*1000); }

$('stage').addEventListener('click', e => {
  if ($('attract').classList.contains('is-on')) { hideAttract(); bump(); return; }
  const g = e.target.closest('[data-go]'); if (g) return go(g.dataset.go);
  if (e.target.closest('#brand')) return showAttract();
  if (e.target.closest('[data-close]')) return closeSheet();
  const rt = e.target.closest('[data-rtab]'); if (rt) { resultsTab = rt.dataset.rtab; return renderResults(); }
  const gt = e.target.closest('[data-gtab]'); if (gt) { groupTab = gt.dataset.gtab; return renderStandings(); }
  const tt = e.target.closest('[data-ttab]'); if (tt) { teamsTab = tt.dataset.ttab; return renderTeams(); }
  const cz = e.target.closest('.court-z'); if (cz) { mapSel = +cz.dataset.court; return renderMap(); }
  const cr = e.target.closest('.court-row'); if (cr) return openCourt(+cr.dataset.court);
  const tm = e.target.closest('[data-team]'); if (tm) return openTeam(tm.dataset.team);
});
['pointerdown','keydown','wheel'].forEach(ev => window.addEventListener(ev, bump, {passive:true}));
document.addEventListener('contextmenu', e => { e.preventDefault(); });

function fit(){ const s = Math.min(innerWidth/1080, innerHeight/1920); const st = $('stage');
  st.style.transform = 'scale('+s+')'; st.style.left = ((innerWidth-1080*s)/2)+'px'; st.style.top = ((innerHeight-1920*s)/2)+'px'; }
addEventListener('resize', fit);
function tick(){ const d = new Date();
  const t = d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/London'});
  $('clock-time').textContent = t; $('attract-clock').textContent = t;
  $('clock-date').textContent = d.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',timeZone:'Europe/London'}); }

/* ===================== DATA ===================== */
function fetchJson(url){ return fetch(url, {cache:'no-store'}).then(r => { if (!r.ok) throw new Error(r.status+' '+url); return r.json(); }); }
function load(key){
  if (params.has('snapshot')) return fetchJson(CFG.snapshot[key]).then(d => ({d, live:false}));
  return fetchJson(CFG.api[key]).then(d => ({d, live:true})).catch(() => fetchJson(CFG.snapshot[key]).then(d => ({d, live:false})));
}
function statusFrom(raw, hs, as){
  const s = String(raw || '').toLowerCase();
  if (CFG.statusWords.final.some(w => s.includes(w))) return 'final';
  if (CFG.statusWords.live.some(w => s.includes(w))) return 'live';
  if (s === '' && (hs != null || as != null) && (hs || as)) return 'live';
  return 'scheduled';
}
function koId(name){
  const n = String(name || '').trim();
  let m;
  if ((m = n.match(/^QF\s*(\d)/i))) return 'qf'+m[1];
  if ((m = n.match(/^SF\s*(\d)/i))) return 'sf'+m[1];
  if (/3rd|4th|third|bronze/i.test(n)) return 'bronze';
  if (/^final/i.test(n)) return 'final';
  return null;
}
function build(agendas, rels, ents, regs){
  const teamById = {};
  T.teams = regs.filter(r => !CFG.teamCategory || r.categoryId === CFG.teamCategory).map(r => {
    const p = r.profile || {};
    const t = { id:r.id, name:String(p.first_name||'').trim(),
      players:[[p.player_1_first_name,p.player_1_last_name],[p.player_2_first_name,p.player_2_last_name]].map(x => x.filter(Boolean).map(s => String(s).trim()).join(' ')).filter(Boolean),
      charity:p.charity||'' };
    teamById[r.id] = t; return t;
  }).filter(t => t.name).sort((a,b) => a.name.localeCompare(b.name, 'en', {numeric:true}));
  const bySession = {};
  rels.forEach(x => { if (x.left.type !== 'Session') return; const s = bySession[x.left.contentId] || (bySession[x.left.contentId] = {});
    const cat = x.right.categoryId, id = x.right.contentId;
    if (cat === 'home_team') s.home = id; else if (cat === 'away_team') s.away = id; else if (/^Custom:score/.test(id)) s.score = id; });
  const scoreById = {}; ents.forEach(e => { if (e.typeId === 'Custom:score') scoreById[e.id] = e.fields || {}; });
  const courtNo = loc => { const m = String(loc||'').match(/(\d+)/); return m ? +m[1] : 0; };
  const fixtures = [], scores = {};
  agendas.forEach(a => {
    const isKo = a.id === CFG.knockoutAgendaId;
    (a.items || []).filter(i => i.type === 'Session').forEach(i => {
      const rel = bySession[i.id] || {};
      const home = (teamById[rel.home]||{}).name || null, away = (teamById[rel.away]||{}).name || null;
      let id, f;
      const time = String(i.localStart||'').slice(11,16);
      if (isKo) { id = koId(i.name); if (!id || !CFG.ko[id]) return;
        f = {id, stage:'ko', court:courtNo(i.locationId), time, label:CFG.ko[id].label};
      } else {
        const court = courtNo(i.locationId || a.id), mm = String(i.name).match(/match\s*(\d+)/i);
        id = 'c'+court+'-m'+String(mm ? mm[1] : fixtures.length+1).padStart(2,'0');
        f = {id, stage:'c'+court, court, time, label: mm ? 'Match '+mm[1] : i.name, home, away};
      }
      fixtures.push(f);
      const sc = scoreById[rel.score] || {};
      const hs = num(sc.home_team_points), as = num(sc.away_team_points);
      scores[id] = {hs, as, status:statusFrom(sc.match_status, hs, as)};
      if (isKo) { if (home) scores[id].home = home; if (away) scores[id].away = away; }
    });
  });
  fixtures.sort((a,b) => a.time.localeCompare(b.time) || a.court-b.court);
  T.fixtures = fixtures; FX = Object.fromEntries(fixtures.map(f => [f.id, f]));
  TEAM_GROUP = {}; fixtures.forEach(f => { if (f.stage !== 'ko') { if (f.home) TEAM_GROUP[f.home] = f.stage; if (f.away) TEAM_GROUP[f.away] = f.stage; } });
  SCORES = scores;
}
let lastLive = null;
async function loadAll(){
  try {
    const [a, r, e, g] = await Promise.all(['agendas','relationships','entities','registrations'].map(load));
    build(a.d, r.d, e.d, g.d);
    const allLive = a.live && r.live && e.live && g.live;
    if (allLive) lastLive = new Date();
    let note = '';
    if (!allLive) {
      let when = '';
      try { const meta = await fetchJson(CFG.snapshot.meta); if (meta.fetchedAt) when = ' from '+new Date(meta.fetchedAt).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:CFG.timezone}); } catch (err) {}
      note = 'Showing saved scores'+when+'. Live scores will appear as soon as the connection returns.';
    }
    $('offline').textContent = note; $('offline').classList.toggle('is-on', !!note);
    renderAll();
  } catch (err) {
    console.error('[kiosk] data load failed', err);
    $('offline').textContent = "Scores can't be loaded right now. Retrying…"; $('offline').classList.add('is-on');
  }
}

/* ===================== BOOT ===================== */
if (params.get('cursor') === 'hide') document.body.classList.add('no-cursor');
fit(); tick(); setInterval(tick, 15000);
const startView = params.get('view');
loadAll().then(() => { go(RENDER[startView] ? startView : 'home'); if (params.get('attract') === '1') showAttract(); bump(); });
setInterval(loadAll, CFG.dataRefreshSeconds * 1000);
setInterval(() => { const d = new Date(); if (d.getHours() === CFG.nightlyReloadHour && d.getMinutes() === 0) location.reload(); }, 60000);
try { navigator.wakeLock && navigator.wakeLock.request('screen').catch(() => {}); } catch (e) {}
document.addEventListener('gesturestart', e => e.preventDefault());
})();
