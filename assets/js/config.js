/* Padel Courtside — touchscreen kiosk settings.
   Everything event staff might need to change lives in this one file.
   URL options:  ?cursor=hide   hide the pointer on the totem
                 ?view=standings|results|knockout|teams|map   open on a screen
                 ?attract=1     start on the welcome loop
                 ?snapshot=1    skip the live API and use data/ only (testing) */
window.KIOSK_CONFIG = {

  /* ---- Behaviour ---- */
  idleSeconds: 90,            // back to the welcome loop after this long untouched
  dataRefreshSeconds: 60,     // re-read scores this often
  nightlyReloadHour: 4,       // full page reload at 04:00
  timezone: 'Europe/London',

  /* ---- Live data (Market Partner event platform) ----
     Tried first; if the call fails (CORS / offline) the kiosk uses the
     same-origin snapshots in data/, refreshed by .github/workflows/refresh-data.yml. */
  api: {
    agendas:       'https://bbgevent.app/api/clients/bloomberg_padel/events/tournament_2026/agendas',
    relationships: 'https://bbgevent.app/api/clients/bloomberg_padel/events/tournament_2026/content-relationships',
    entities:      'https://bbgevent.app/api/clients/bloomberg_padel/events/tournament_2026/content/entities',
    registrations: 'https://bbgevent.app/api/clients/bloomberg_padel/events/tournament_2026/registrations?categoryType=Speaker'
  },
  snapshot: {
    agendas: 'data/agendas.json', relationships: 'data/relationships.json',
    entities: 'data/entities.json', registrations: 'data/registrations.json',
    meta: 'data/meta.json'
  },
  knockoutAgendaId: 'knockout_stages',
  teamCategory: 'team',

  /* Words in a score's "match status" field (case-insensitive) */
  statusWords: {
    final: ['complete', 'final', 'finished', 'result'],
    live:  ['live', 'progress', 'playing', 'started']
  },

  /* ---- Tournament rules ---- */
  points: { win: 3, draw: 1, loss: 0 },
  groups: [1, 2, 3, 4, 5].map(n => ({ id: 'c' + n, name: 'Court ' + n, court: n })),
  qualifiers: { winners: 5, bestRunnersUp: 3 },
  // Knockout feeds. If teams are set on the platform they win; otherwise the kiosk fills them in.
  ko: {
    qf1: { round: 'Quarter finals', label: 'QF 1' }, qf2: { round: 'Quarter finals', label: 'QF 2' },
    qf3: { round: 'Quarter finals', label: 'QF 3' }, qf4: { round: 'Quarter finals', label: 'QF 4' },
    sf1: { round: 'Semi finals', label: 'SF 1', from: [['W', 'qf1'], ['W', 'qf2']] },
    sf2: { round: 'Semi finals', label: 'SF 2', from: [['W', 'qf3'], ['W', 'qf4']] },
    bronze: { round: '3rd / 4th', label: '3rd place', from: [['L', 'sf1'], ['L', 'sf2']] },
    final: { round: 'Final', label: 'Final', from: [['W', 'sf1'], ['W', 'sf2']] }
  },
  seedPairs: { qf1: [1, 8], qf2: [4, 5], qf3: [3, 6], qf4: [2, 7] },

  /* ---- Court map (units of a 395 × 305 plan, traced from the venue map) ----
     TODO: confirm the two area labels with the venue. */
  map: {
    courts: [
      { c: 1, x: 22, y: 21, w: 76, h: 168, o: 'v' }, { c: 2, x: 125, y: 21, w: 76, h: 168, o: 'v' },
      { c: 3, x: 230, y: 21, w: 153, h: 77, o: 'h' }, { c: 4, x: 304, y: 121, w: 77, h: 153, o: 'v' },
      { c: 5, x: 125, y: 199, w: 153, h: 77, o: 'h' }
    ],
    areas: [
      { label: 'Lounge', x: 22, y: 232, w: 77, h: 44 },
      { label: 'Entrance', x: 232, y: 121, w: 53, h: 54, doors: [{ x: 224, y: 126, w: 6, h: 14 }, { x: 224, y: 156, w: 6, h: 14 }] }
    ]
  }
};
