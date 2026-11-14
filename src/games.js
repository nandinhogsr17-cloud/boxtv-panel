import { norm } from './m3u.js';
import { localDate, localTime } from './util.js';

const compact = (s) => norm(s).replace(/ /g, '');

// Dicionário inteligente de apelidos de times para cruzamento com canais PPV/mosaicos
const TEAM_ALIASES = {
  flamengo: ['fla', 'mengo', 'crf'],
  palmeiras: ['pal', 'verdao'],
  corinthians: ['timao', 'cor'],
  saopaulo: ['spfc', 'tricolor'],
  santos: ['peixe', 'san'],
  gremio: ['tricolorgaucho', 'gre'],
  internacional: ['inter', 'colorado'],
  atleticomg: ['galo', 'atletico mineiro', 'cam'],
  cruzeiro: ['cru', 'raposa'],
  botafogo: ['fogao', 'bfr'],
  fluminense: ['flu', 'nense'],
  vasco: ['vascodagama', 'crvg'],
  athleticopr: ['furacao', 'cap'],
  bahia: ['bahea', 'ecb'],
  vitoria: ['ecv', 'leaodabarra'],
  fortaleza: ['fec', 'leao'],
  ceara: ['vozao', 'csc'],
  sport: ['sportrecife', 'leaodailha'],
  realmadrid: ['real', 'madrid'],
  barcelona: ['barca'],
  manchestercity: ['mancity', 'city'],
  manchesterunited: ['manunited', 'united', 'mufc'],
  liverpool: ['lfc', 'reds'],
  arsenal: ['gunners'],
  chelsea: ['blues'],
  bayernmunich: ['bayern', 'munique', 'bayernmunchen'],
  parissaintgermain: ['psg', 'paris'],
  juventus: ['juve'],
  milan: ['acmilan', 'rossoneri'],
  intermilan: ['interdemilao', 'nerazzurri'],
  argentina: ['albiceleste', 'arg'],
  brasil: ['selecao', 'canarinho', 'bra'],
  uruguai: ['uruguay', 'celeste'],
  colombia: ['cafeteros'],
  portugal: ['selecao das quinas'],
  alemanha: ['germany', 'alemanha'],
  franca: ['france', 'franca', 'les bleus'],
  espanha: ['spain', 'espanha', 'furia'],
  italia: ['italy', 'italia', 'azzurra'],
  holanda: ['netherlands', 'holanda', 'laranja'],
  inglaterra: ['england', 'inglaterra']
};

// Aliases de canais e emissoras para match inteligente
const BROADCASTER_ALIASES = {
  sportv: ['sporttv', 'sport tv', 'sportv1', 'sportv 1', 'sportv2', 'sportv 2', 'sportv3', 'sportv 3'],
  premiere: ['premierefc', 'premiere club', 'premiere 2', 'premiere 3', 'premiere 4', 'premiere 5', 'premiere 6', 'premiere 7', 'premiere 8'],
  espn: ['espnbrasil', 'espn 1', 'espn 2', 'espn 3', 'espn 4', 'espn 5', 'espn 6', 'espn extra', 'star+', 'disney+'],
  tnt: ['tntsports', 'tnt sports', 'space'],
  paramount: ['paramount+', 'conmebol paramount'],
  max: ['hbo max', 'hbomax'],
  caze: ['cazetv', 'caze tv'],
  goat: ['canal goat', 'goat tv'],
  globo: ['tv globo', 'rede globo'],
  sbt: ['rede sbt', 'tv sbt'],
  record: ['rede record', 'tv record'],
  band: ['rede band', 'bandsports', 'band sports']
};

// 22 Grandes Ligas e Competições monitoradas automaticamente pela ESPN API
const ESPN_LEAGUES = [
  { code: 'bra.1', name: 'Brasileirão Série A' },
  { code: 'bra.2', name: 'Brasileirão Série B' },
  { code: 'bra.copa_do_brasil', name: 'Copa do Brasil' },
  { code: 'uefa.nations', name: 'UEFA Nations League' },
  { code: 'fifa.friendly', name: 'Amistosos / Seleções' },
  { code: 'conmebol.worldq', name: 'Eliminatórias Sul-Americanas' },
  { code: 'uefa.euroq', name: 'Eliminatórias Eurocopa' },
  { code: 'conmebol.libertadores', name: 'Libertadores' },
  { code: 'conmebol.sudamericana', name: 'Sul-Americana' },
  { code: 'uefa.champions', name: 'Champions League' },
  { code: 'uefa.europa', name: 'Europa League' },
  { code: 'uefa.conference', name: 'Conference League' },
  { code: 'eng.1', name: 'Premier League' },
  { code: 'esp.1', name: 'LaLiga' },
  { code: 'ita.1', name: 'Serie A Italiana' },
  { code: 'ger.1', name: 'Bundesliga' },
  { code: 'fra.1', name: 'Ligue 1' },
  { code: 'por.1', name: 'Liga Portugal' },
  { code: 'arg.1', name: 'Campeonato Argentino' },
  { code: 'ksa.1', name: 'Liga Saudita' },
  { code: 'usa.1', name: 'Major League Soccer' },
  { code: 'fifa.world', name: 'Copa do Mundo / Eliminatórias' }
];

function splitBroadcasters(text) {
  return String(text || '')
    .split(/[,;/]|\s+e\s+|\s+\+\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

export class GamesService {
  constructor({ store, tz = 'America/Sao_Paulo', token = '', competitions = '', fetchFn = fetch }) {
    this.store = store;
    this.tz = tz;
    this.token = token;
    this.competitions = competitions;
    this.fetchFn = fetchFn;
    this.cache = new Map();
  }

  today() {
    return localDate(this.tz);
  }

  /**
   * Puxa jogos por data específica (YYYY-MM-DD) ou 'all' (semana completa: ontem, hoje, amanhã e próximos dias)
   */
  async forDate(dateParam = this.today()) {
    if (dateParam === 'all') {
      return this.allWeekly();
    }

    const date = dateParam || this.today();

    // 1. Jogos manuais cadastrados no painel admin
    const manual = this.store.listManualGames(date).map((g) => ({
      id: 'm' + g.id,
      date: g.date,
      time: g.time,
      kickoff: null,
      competition: g.competition,
      home: g.home,
      away: g.away,
      homeCrest: null,
      awayCrest: null,
      status: 'SCHEDULED',
      statusDetail: 'Agendado',
      isLive: false,
      score: null,
      broadcasters: splitBroadcasters(g.channels),
      source: 'painel',
    }));

    // 2. Coletar jogos da ESPN API (gratuita, sem chave, com 22 ligas)
    let espnGames = [];
    try {
      espnGames = await this._fetchEspn(date);
    } catch {
      espnGames = [];
    }

    // 3. Se tiver token do football-data.org, tenta complementar
    let fdGames = [];
    if (this.token) {
      try {
        fdGames = await this._fetchFootballData(date);
      } catch {
        fdGames = [];
      }
    }

    const key = (g) => compact(g.home) + '|' + compact(g.away);
    const existingKeys = new Set(manual.map(key));

    const combined = [...manual];
    for (const g of [...espnGames, ...fdGames]) {
      const k = key(g);
      if (!existingKeys.has(k)) {
        existingKeys.add(k);
        combined.push(g);
      }
    }

    // Ordenação inteligente: AO VIVO primeiro, depois por horário, depois por nome
    const rankStatus = (s) => {
      const st = String(s || '').toUpperCase();
      if (st.includes('IN_PLAY') || st.includes('PROGRESS') || st.includes('LIVE') || st.includes('1ST') || st.includes('2ND') || st.includes('HT')) return 0;
      if (st.includes('SCHEDULED') || st.includes('TIMED') || st.includes('PRE')) return 1;
      return 2; // FINISHED / POST
    };

    combined.sort((a, b) => {
      const rA = rankStatus(a.status);
      const rB = rankStatus(b.status);
      if (rA !== rB) return rA - rB;
      return a.time.localeCompare(b.time) || a.home.localeCompare(b.home);
    });

    return combined;
  }

  /**
   * Puxa todos os jogos disponíveis na semana (ontem, hoje, amanhã, +2 e +3 dias)
   */
  async allWeekly() {
    const dates = [];
    const base = new Date();
    // Ontem, Hoje, Amanhã, +2, +3
    for (let offset = -1; offset <= 3; offset++) {
      const d = new Date(base.getTime() + offset * 24 * 3600 * 1000);
      dates.push(localDate(this.tz, d));
    }

    const allGames = [];
    const seen = new Set();

    for (const d of dates) {
      const games = await this.forDate(d);
      for (const g of games) {
        const k = (g.date || d) + '|' + compact(g.home) + '|' + compact(g.away);
        if (!seen.has(k)) {
          seen.add(k);
          allGames.push({ ...g, date: g.date || d });
        }
      }
    }

    return allGames;
  }

  async _fetchEspn(targetDate) {
    const cached = this.cache.get('espn_' + targetDate);
    if (cached && Date.now() - cached.at < 2 * 60 * 1000) return cached.games;

    const dtParam = targetDate.replace(/-/g, '');
    const results = [];

    await Promise.all(
      ESPN_LEAGUES.map(async (l) => {
        try {
          const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${l.code}/scoreboard?dates=${dtParam}`;
          const res = await this.fetchFn(url, { signal: AbortSignal.timeout(6000) });
          if (!res.ok) return;
          const data = await res.json();
          for (const ev of data.events || []) {
            const comp = ev.competitions?.[0];
            if (!comp) continue;

            const homeC = comp.competitors?.find((c) => c.homeAway === 'home');
            const awayC = comp.competitors?.find((c) => c.homeAway === 'away');
            if (!homeC || !awayC) continue;

            const stDesc = comp.status?.type?.description || 'Agendado';
            const stState = comp.status?.type?.state || 'pre';
            const detail = comp.status?.type?.shortDetail || '';

            const isLive = stState === 'in';
            const isFinished = stState === 'post';

            let statusStr = 'SCHEDULED';
            if (isLive) statusStr = 'IN_PLAY';
            else if (isFinished) statusStr = 'FINISHED';

            const homeScore = homeC.score != null ? String(homeC.score) : '';
            const awayScore = awayC.score != null ? String(awayC.score) : '';
            let scoreStr = null;
            if ((isLive || isFinished) && homeScore !== '' && awayScore !== '') {
              scoreStr = `${homeScore} × ${awayScore}`;
            }

            // Emissoras informadas pela ESPN
            const broadcasts = (comp.broadcasts || [])
              .flatMap((b) => b.names || [])
              .filter(Boolean);

            // Inferência inteligente de emissoras conforme o campeonato
            if (l.code.startsWith('bra') && !broadcasts.length) {
              broadcasts.push('Premiere', 'SporTV', 'Globo');
            } else if (l.code.includes('champions') && !broadcasts.length) {
              broadcasts.push('TNT', 'Space', 'Max');
            } else if (l.code.includes('libertadores') && !broadcasts.length) {
              broadcasts.push('Paramount+', 'ESPN', 'Globo');
            } else if (l.code.includes('eng.1') && !broadcasts.length) {
              broadcasts.push('ESPN', 'Disney+');
            } else if (l.code.includes('nations') && !broadcasts.length) {
              broadcasts.push('SporTV', 'ESPN', 'Disney+');
            } else if (l.code.includes('friendly') && !broadcasts.length) {
              broadcasts.push('SporTV', 'ESPN', 'Globo');
            }

            const evDate = new Date(ev.date);
            const gameDate = localDate(this.tz, evDate);

            results.push({
              id: 'espn_' + ev.id,
              date: gameDate,
              time: localTime(this.tz, evDate),
              kickoff: ev.date,
              competition: l.name,
              home: homeC.team?.displayName || homeC.team?.name || '?',
              away: awayC.team?.displayName || awayC.team?.name || '?',
              homeCrest: homeC.team?.logo || null,
              awayCrest: awayC.team?.logo || null,
              status: statusStr,
              statusDetail: isLive ? (detail || 'AO VIVO') : isFinished ? 'Encerrado' : (detail || stDesc),
              isLive,
              score: scoreStr,
              broadcasters: broadcasts,
              source: 'espn'
            });
          }
        } catch { }
      })
    );

    this.cache.set('espn_' + targetDate, { at: Date.now(), games: results });
    return results;
  }

  async _fetchFootballData(date) {
    const cached = this.cache.get('fd_' + date);
    if (cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.games;
    try {
      const d = new Date(date + 'T12:00:00Z');
      d.setUTCDate(d.getUTCDate() + 1);
      const nextD = d.toISOString().slice(0, 10);
      let url = `https://api.football-data.org/v4/matches?dateFrom=${date}&dateTo=${nextD}`;
      if (this.competitions) url += `&competitions=${encodeURIComponent(this.competitions)}`;
      const res = await this.fetchFn(url, {
        headers: { 'X-Auth-Token': this.token },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const games = (data.matches || [])
        .filter((m) => localDate(this.tz, new Date(m.utcDate)) === date)
        .map((m) => {
          const st = m.status === 'TIMED' ? 'SCHEDULED' : m.status;
          const h = m.score?.fullTime?.home;
          const a = m.score?.fullTime?.away;
          const live = ['IN_PLAY', 'PAUSED'].includes(st);
          const finished = st === 'FINISHED';
          return {
            id: 'fd' + m.id,
            date,
            time: localTime(this.tz, new Date(m.utcDate)),
            kickoff: m.utcDate,
            competition: m.competition?.name || '',
            home: m.homeTeam?.shortName || m.homeTeam?.name || '?',
            away: m.awayTeam?.shortName || m.awayTeam?.name || '?',
            homeCrest: m.homeTeam?.crest || null,
            awayCrest: m.awayTeam?.crest || null,
            status: live ? 'IN_PLAY' : st,
            statusDetail: live ? 'AO VIVO' : finished ? 'Encerrado' : 'Agendado',
            isLive: live,
            score: (live || finished) && h != null && a != null ? `${h} × ${a}` : null,
            broadcasters: ['Premiere', 'SporTV', 'ESPN'],
            source: 'api',
          };
        });
      this.cache.set('fd_' + date, { at: Date.now(), games });
      return games;
    } catch (err) {
      if (cached) return cached.games;
      throw err;
    }
  }
}

/**
 * Match inteligente avançado: cruza o jogo (times, torneio, emissoras) com os canais ao vivo disponíveis na lista
 */
export function matchChannels(game, liveItems, limit = 6) {
  const wantedBroadcasters = new Set();
  for (const b of game.broadcasters || []) {
    const c = compact(b);
    if (!c) continue;
    wantedBroadcasters.add(c);
    for (const [key, aliasList] of Object.entries(BROADCASTER_ALIASES)) {
      if (c.includes(key) || key.includes(c)) {
        aliasList.forEach((a) => wantedBroadcasters.add(compact(a)));
      }
    }
  }

  const cleanHome = compact(game.home);
  const cleanAway = compact(game.away);
  const homeAliases = [cleanHome, ...(TEAM_ALIASES[cleanHome] || [])].filter((t) => t.length >= 3);
  const awayAliases = [cleanAway, ...(TEAM_ALIASES[cleanAway] || [])].filter((t) => t.length >= 3);

  const scored = [];

  for (const ch of liveItems) {
    const chNorm = norm(ch.title);
    const chCompact = compact(ch.title);
    let s = 0;

    // 1. Match direto dos dois times no título do canal (ex: canal PPV/mosaico "Flamengo x Vasco")
    const hasHome = homeAliases.some((t) => chCompact.includes(t));
    const hasAway = awayAliases.some((t) => chCompact.includes(t));

    if (hasHome && hasAway) {
      s += 100; // Canal dedicado exatamente a este jogo!
    } else if (hasHome || hasAway) {
      s += 35; // Canal mencionando um dos times
    }

    // 2. Match de emissora / broadcaster oficial
    for (const w of wantedBroadcasters) {
      if (chCompact.includes(w)) {
        s += 25;
        break;
      }
    }

    // 3. Se for canal de categoria esportiva, pontua
    if (ch.group && /esporte|sport|futebol|ppv|premiere|espn|tnt|dazn/i.test(ch.group)) {
      s += 5;
    }

    // 4. Bônus por qualidade técnica (4K / FHD > HD > SD)
    if (s > 0) {
      if (/\b(4k|uhd)\b/.test(chNorm)) s += 4;
      else if (/\bfhd\b/.test(chNorm)) s += 3;
      else if (/\bhd\b/.test(chNorm)) s += 2;

      scored.push({ ch, s });
    }
  }

  scored.sort((a, b) => b.s - a.s);

  // Retorna os melhores canais ordenados por relevância e resolução
  const results = [];
  const seenIds = new Set();
  for (const item of scored) {
    if (!seenIds.has(item.ch.id)) {
      seenIds.add(item.ch.id);
      results.push(item.ch);
      if (results.length >= limit) break;
    }
  }

  return results;
}
