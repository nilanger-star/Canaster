/* ===================== Spielregeln (reine Logik, ohne DOM) ===================== */
const Canasta = (() => {
  const SUITS = ['S','H','D','C'];
  const RANKS = ['3','4','5','6','7','8','9','10','J','Q','K','A','2'];
  const ORDER = {'3':0,'4':1,'5':2,'6':3,'7':4,'8':5,'9':6,'10':7,'J':8,'Q':9,'K':10,'A':11,'2':12,'X':13};
  const SUITSYM = {S:'♠',H:'♥',D:'♦',C:'♣',X:'★'};
  const TARGET = 5000;
  const E = m => { const e = new Error(m); e.game = true; return e; };

  const rank = c => c.slice(0,-2);
  const suit = c => c.slice(-2,-1);
  const isWild = c => { const r = rank(c); return r === '2' || r === 'X'; };
  const isRed3 = c => rank(c) === '3' && (suit(c) === 'H' || suit(c) === 'D');
  const isBlack3 = c => rank(c) === '3' && (suit(c) === 'S' || suit(c) === 'C');
  function points(c){
    const r = rank(c);
    if (r === 'X') return 50;
    if (r === '2' || r === 'A') return 20;
    if (['K','Q','J','10','9','8'].includes(r)) return 10;
    if (r === '3') return isRed3(c) ? 100 : 5;
    return 5;
  }
  const sum = cs => cs.reduce((s,c) => s + points(c), 0);
  const label = c => rank(c) === 'X' ? 'Joker' : rank(c) + SUITSYM[suit(c)];
  const rankName = r => r === 'B3' ? 'Schwarze 3' : r === 'W' ? 'Wildkarten' : r;
  const handValue = c => isBlack3(c) ? 100 : points(c);   // Hausregel: schwarze 3 auf der Hand −100

  function newDeck(){
    const d = [];
    for (let k = 0; k < 2; k++) for (const s of SUITS) for (const r of RANKS) d.push(r + s + k);
    for (let j = 0; j < 4; j++) d.push('XX' + j);
    return d;
  }
  function rnd(n){
    if (typeof crypto !== 'undefined' && crypto.getRandomValues){ const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; }
    return Math.floor(Math.random() * n);
  }
  function shuffle(a){ for (let i = a.length - 1; i > 0; i--){ const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function sortHand(h){ return h.slice().sort((a,b) => (ORDER[rank(a)] - ORDER[rank(b)]) || suit(a).localeCompare(suit(b)) || a.localeCompare(b)); }

  const nSides = st => st.n === 4 ? 2 : st.n;
  const sideOf = (st, seat) => st.n === 4 ? seat % 2 : seat;
  const seatsOf = (st, side) => [...Array(st.n).keys()].filter(s => sideOf(st, s) === side);
  const canastasNeeded = st => 1;
  const isCanasta = m => m.cards.length >= 7;
  const canastaCount = (st, side) => st.hand.melds[side].filter(isCanasta).length;
  function minMeld(score){ if (score < 1500) return 50; if (score < 3000) return 90; return 120; }
  function sideName(st, side){
    if (st.n === 4) return 'Team ' + (side === 0 ? 'A' : 'B') + ' (' + seatsOf(st, side).map(s => st.players[s].name).join(' & ') + ')';
    return st.players[side].name;
  }
  function log(st, text){ st.log = (st.log || []).concat(text).slice(-40); }

  function checkGroup(cards){
    if (cards.length < 3) throw E('Eine neue Kombination braucht mindestens 3 Karten.');
    const nat = cards.filter(c => !isWild(c)), wild = cards.filter(isWild);
    if (nat.some(isRed3)) throw E('Rote Dreien werden automatisch abgelegt und können nicht kombiniert werden.');
    if (!nat.length) return { rank: 'W' };   // Hausregel: Kombination nur aus Wildkarten
    if (nat.length && nat.every(isBlack3)){
      if (wild.length) throw E('Schwarze Dreien dürfen nicht mit Jokern oder Zweien kombiniert werden.');
      return { rank: 'B3' };
    }
    if (nat.some(isBlack3)) throw E('Schwarze Dreien dürfen nur untereinander kombiniert werden.');
    if (nat.length < 2) throw E('Eine Kombination braucht mindestens 2 natürliche Karten.');
    const r = rank(nat[0]);
    if (nat.some(c => rank(c) !== r)) throw E('Alle natürlichen Karten einer Kombination müssen denselben Rang haben.');
    if (wild.length > 3) throw E('Höchstens 3 Joker/Zweien pro Kombination.');
    return { rank: r };
  }
  function checkAdd(meld, cards){
    if (meld.rank === 'B3') throw E('An schwarze Dreien kann nicht angelegt werden.');
    if (meld.rank === 'W'){
      if (cards.some(c => !isWild(c))) throw E('An die Wildkarten-Kombination passen nur Joker und Zweien.');
      return;
    }
    for (const c of cards){
      if (!isWild(c) && rank(c) !== meld.rank) throw E(label(c) + ' passt nicht zur Kombination ' + rankName(meld.rank) + '.');
    }
    const w = meld.cards.concat(cards).filter(isWild).length;
    if (w > 3) throw E('Höchstens 3 Joker/Zweien pro Kombination.');
  }

  /* Gemeinsame Prüfung + Ausführung von Auslagen.
     groups: [[karten]], adds: [{meldId, cards}], o: {external:[karten nicht aus der Hand], gain, extraAdd:{meldId,card}} */
  function meldOps(st, seat, groups, adds, o){
    o = o || {};
    const H = st.hand, side = sideOf(st, seat), hand = H.hands[seat], melds = H.melds[side];
    const ext = new Set(o.external || []);
    const used = [];
    const all = groups.flat().concat(adds.flatMap(a => a.cards));
    const allX = o.extraAdd ? all.concat(o.extraAdd.card) : all;
    if (new Set(allX).size !== allX.length) throw E('Eine Karte wurde doppelt verwendet.');
    for (const c of all){
      if (ext.has(c)) continue;
      if (!hand.includes(c)) throw E('Diese Karte hast du nicht auf der Hand: ' + label(c));
      if (used.includes(c)) throw E('Eine Karte wurde doppelt verwendet.');
      used.push(c);
    }
    const infos = groups.map(g => Object.assign(checkGroup(g), { cards: g.slice(), concealed: g.length >= 7 && !g.some(c => ext.has(c)) }));
    const ranksSeen = new Set(melds.map(m => m.rank));
    for (const i of infos){
      if (ranksSeen.has(i.rank)) throw E('Ihr habt schon eine Kombination ' + rankName(i.rank) + ' – lege dort an, statt eine neue zu beginnen.');
      ranksSeen.add(i.rank);
    }
    const addMap = {};
    for (const a of adds){ if (a.cards.length) (addMap[a.meldId] = addMap[a.meldId] || []).push(...a.cards); }
    if (o.extraAdd) (addMap[o.extraAdd.meldId] = addMap[o.extraAdd.meldId] || []).push(o.extraAdd.card);
    for (const id in addMap){
      const m = melds.find(x => x.id === id);
      if (!m) throw E('Diese Kombination gehört nicht zu deiner Seite.');
      checkAdd(m, addMap[id]);
    }
    if (!infos.length && !Object.keys(addMap).length) throw E('Nichts zum Auslegen vorgemerkt.');
    if (!melds.length){
      const pts = infos.reduce((s,i) => s + sum(i.cards), 0);
      const need = minMeld(st.scores[side]);
      if (pts < need) throw E('Das erste Auslegen braucht mindestens ' + need + ' Punkte – vorgemerkt sind ' + pts + '.');
    }
    const after = hand.length - used.length + (o.gain || 0);
    const can = melds.filter(m => m.cards.length + (addMap[m.id] ? addMap[m.id].length : 0) >= 7).length
              + infos.filter(i => i.rank !== 'B3' && i.cards.length >= 7).length;
    const canOut = can >= canastasNeeded(st);
    if (infos.some(i => i.rank === 'B3') && !(canOut && after <= 1))
      throw E('Schwarze Dreien darfst du nur auslegen, wenn du damit ausgehst.');
    if (!canOut && after < 2)
      throw E('Ihr habt noch keinen Canasta – du musst mindestens 2 Karten behalten (eine zum Abwerfen).');
    if (after === 0) assertMayGoOut(st, seat);
    // ausführen
    H.hands[seat] = hand.filter(c => !used.includes(c));
    for (const id in addMap) melds.find(x => x.id === id).cards.push(...addMap[id]);
    for (const i of infos) melds.push({ id: 'm' + (H.mc++), rank: i.rank, cards: i.cards, concealed: i.concealed });
    return { after, canOut, newCount: infos.length, addCount: Object.keys(addMap).length };
  }

  // Hausregel: Zu viert muss der Partner dem Ausgehen zustimmen.
  const partnerOf = (st, seat) => (seat + 2) % 4;
  function assertMayGoOut(st, seat){
    if (st.n !== 4) return;
    const r = st.hand.outReq;
    if (r && r.seat === seat && r.answer === 'yes') return;
    if (r && r.seat === seat && r.answer === 'no') throw E('Dein Partner hat das Ausgehen in diesem Zug abgelehnt.');
    if (r && r.seat === seat) throw E('Warte auf die Antwort deines Partners.');
    throw E('Zu viert musst du zuerst deinen Partner fragen: „Darf ich ausgehen?“');
  }
  function askOut(st, seat){
    assertTurn(st, seat);
    if (st.n !== 4) throw E('Nur im Teamspiel nötig.');
    const H = st.hand;
    if (H.outReq && H.outReq.seat === seat) throw E('Du hast in diesem Zug schon gefragt.');
    H.outReq = { seat, answer: null };
    log(st, st.players[seat].name + ' fragt: Darf ich ausgehen?');
  }
  function answerOut(st, seat, yes){
    if (st.status !== 'playing' || st.n !== 4) throw E('Gerade gibt es keine Frage.');
    const H = st.hand, r = H.outReq;
    if (!r || r.answer !== null || r.seat !== H.turn) throw E('Gerade gibt es keine Frage.');
    if (seat !== partnerOf(st, r.seat)) throw E('Nur der Partner darf antworten.');
    r.answer = yes ? 'yes' : 'no';
    log(st, st.players[seat].name + (yes ? ' sagt: Ja, geh raus!' : ' sagt: Nein, noch nicht.'));
  }

  function assertTurn(st, seat, phase){
    if (st.status !== 'playing') throw E('Gerade läuft keine Runde.');
    if (st.hand.turn !== seat) throw E('Du bist nicht am Zug.');
    if (phase && st.hand.phase !== phase) throw E(phase === 'draw' ? 'Du hast schon gezogen.' : 'Zieh zuerst eine Karte oder nimm den Ablagestapel.');
  }

  function deal(st){
    const n = st.n, per = 13;   // Hausregel: immer 13 Karten
    const stock = shuffle(newDeck());
    const H = { stock, discard: [], hands: {}, melds: {}, red: {}, frozen: false, mc: 0,
                turn: (st.dealer + 1) % n, phase: 'draw', tookPile: false, turnStartMelded: false, startDraws: 0 };
    for (let s = 0; s < nSides(st); s++){ H.melds[s] = []; H.red[s] = []; }
    for (let p = 0; p < n; p++) H.hands[p] = [];
    for (let i = 0; i < per; i++) for (let p = 0; p < n; p++) H.hands[p].push(stock.pop());
    for (let p = 0; p < n; p++){
      let reds;
      while ((reds = H.hands[p].filter(isRed3)).length){
        for (const r of reds){ H.hands[p].splice(H.hands[p].indexOf(r), 1); H.red[sideOf(st,p)].push(r); H.hands[p].push(stock.pop()); }
      }
    }
    let up = stock.pop(); H.discard.push(up);
    while (isWild(up) || isRed3(up)){ H.frozen = true; up = stock.pop(); H.discard.push(up); }
    st.hand = H; st.status = 'playing'; st.handNo = (st.handNo || 0) + 1; st.lastResult = null;
    log(st, '— Runde ' + st.handNo + ' — ' + st.players[H.turn].name + ' beginnt.');
  }

  function nextTurn(st){
    const H = st.hand;
    H.turn = (H.turn + 1) % st.n; H.phase = 'draw'; H.tookPile = false; H.outReq = null;
    H.turnStartMelded = H.melds[sideOf(st, H.turn)].length > 0;
  }

  function drawStock(st, seat){
    assertTurn(st, seat, 'draw');
    const H = st.hand;
    if (!H.stock.length) throw E('Der Talon ist leer.');
    H.turnStartMelded = H.melds[sideOf(st, seat)].length > 0;
    const k = 1; let got = 0, reds = 0;
    while (got < k && H.stock.length){
      const c = H.stock.pop();
      if (isRed3(c)){ H.red[sideOf(st, seat)].push(c); reds++; continue; }
      H.hands[seat].push(c); got++;
    }
    H.phase = 'play';
    log(st, st.players[seat].name + ' zieht vom Talon' + (reds ? ' und legt ' + reds + ' rote Drei' + (reds > 1 ? 'en' : '') + ' ab' : '') + '.');
    if (got === 0){ log(st, 'Der Talon ist aufgebraucht.'); endHand(st, null); }
  }

  function takePile(st, seat, staged){
    assertTurn(st, seat, 'draw');
    const H = st.hand, pile = H.discard;
    if (!pile.length) throw E('Der Ablagestapel ist leer.');
    const top = pile[pile.length - 1];
    if (isWild(top)) throw E('Oben liegt ein Joker/eine Zwei – der Stapel kann nicht genommen werden.');
    if (isBlack3(top)) throw E('Eine schwarze Drei sperrt den Ablagestapel für diesen Zug.');
    const side = sideOf(st, seat), melds = H.melds[side];
    H.turnStartMelded = melds.length > 0;
    const frozen = H.frozen || !melds.length;
    const groups = (staged.groups || []).map(g => g.slice());
    const adds = staged.adds || [];
    const gi = groups.findIndex(g => g.some(c => !isWild(c) && rank(c) === rank(top)));
    let extraAdd = null;
    if (gi >= 0){
      const nat = groups[gi].filter(c => !isWild(c) && rank(c) === rank(top)).length;
      if (frozen && nat < 2) throw E('Der Stapel ist ' + (H.frozen ? 'eingefroren' : 'für euch noch gesperrt (erstes Auslegen)') + ': Du brauchst ein natürliches Paar ' + rankName(rank(top)) + ' aus der Hand.');
      groups[gi].push(top);
    } else {
      if (frozen) throw E('Merke ein natürliches Paar ' + rankName(rank(top)) + ' als neue Kombination vor, um den Stapel zu nehmen.');
      const m = melds.find(x => x.rank === rank(top));
      if (!m) throw E('Die oberste Karte (' + label(top) + ') passt zu keiner eurer Kombinationen. Merke passende Karten aus der Hand vor.');
      extraAdd = { meldId: m.id, card: top };
    }
    if (groups.some(g => { try { return checkGroup(g).rank === 'B3'; } catch(e){ return false; } })) throw E('Schwarze Dreien können nicht mit dem Stapel ausgelegt werden.');
    const rest = pile.slice(0, -1);
    const restReds = rest.filter(isRed3), restCards = rest.filter(c => !isRed3(c));
    const res = meldOps(st, seat, groups, adds, { external: [top], gain: restCards.length, extraAdd });
    H.hands[seat].push(...restCards);
    H.red[side].push(...restReds);
    H.discard = []; H.frozen = false; H.tookPile = true; H.phase = 'play';
    log(st, st.players[seat].name + ' nimmt den Ablagestapel (' + pile.length + ' Karten).');
    if (res.after === 0) { log(st, st.players[seat].name + ' geht aus!'); endHand(st, seat); }
  }

  function commit(st, seat, staged){
    assertTurn(st, seat, 'play');
    const res = meldOps(st, seat, staged.groups || [], staged.adds || [], {});
    log(st, st.players[seat].name + ' legt aus' + (res.newCount ? ' (' + res.newCount + ' neu)' : '') + (res.addCount ? ' und legt an' : '') + '.');
    if (res.after === 0){ log(st, st.players[seat].name + ' geht aus!'); endHand(st, seat); }
  }

  function discard(st, seat, card){
    assertTurn(st, seat, 'play');
    const H = st.hand, hand = H.hands[seat];
    if (!hand.includes(card)) throw E('Diese Karte hast du nicht.');
    const canOut = canastaCount(st, sideOf(st, seat)) >= canastasNeeded(st);
    if (hand.length === 1 && !canOut) throw E('Zum Ausgehen fehlt ein Canasta.');
    if (hand.length === 1) assertMayGoOut(st, seat);
    hand.splice(hand.indexOf(card), 1);
    H.discard.push(card);
    if (isWild(card)) H.frozen = true;
    log(st, st.players[seat].name + ' wirft ' + label(card) + ' ab.');
    if (!hand.length){ log(st, st.players[seat].name + ' geht aus!'); return endHand(st, seat); }
    nextTurn(st);
  }

  function stockOut(st, seat){
    assertTurn(st, seat, 'draw');
    if (st.hand.stock.length) throw E('Der Talon ist noch nicht leer.');
    log(st, 'Der Talon ist leer – die Runde endet.');
    endHand(st, null);
  }

  function endHand(st, outSeat){
    const H = st.hand;
    const concealed = outSeat != null && !H.turnStartMelded && !H.tookPile;
    const rows = [];
    for (let s = 0; s < nSides(st); s++){
      const melds = H.melds[s], has = melds.length > 0;
      let meldPts = 0, bonus = 0, nat = 0, mix = 0, wild = 0, conc = 0;
      for (const m of melds){
        meldPts += sum(m.cards);
        if (isCanasta(m)){
          if (m.rank === 'W'){ bonus += 1000; wild++; }
          else if (m.cards.some(isWild)){ bonus += 300; mix++; }
          else { bonus += 400; nat++; }
          if (m.concealed){ bonus += 100; conc++; }
        }
      }
      const rc = H.red[s].length; let red = rc * 100; if (!melds.some(isCanasta) && red) red = -red;   // Hausregel: nur mit Canasta positiv
      const out = (outSeat != null && sideOf(st, outSeat) === s) ? (concealed ? 200 : 100) : 0;
      let handPts = 0; for (const p of seatsOf(st, s)) for (const c of H.hands[p]) handPts += handValue(c);
      const total = meldPts + bonus + red + out - handPts;
      st.scores[s] += total;
      rows.push({ side: s, meldPts, bonus, nat, mix, wild, conc, red, out, handPts, total, score: st.scores[s] });
    }
    st.lastResult = { rows, outSeat: outSeat == null ? -1 : outSeat, concealed, handNo: st.handNo };
    st.history = (st.history || []).concat({ handNo: st.handNo, totals: rows.map(r => r.total) }).slice(-30);
    st.dealer = (st.dealer + 1) % st.n;
    const max = Math.max(...st.scores);
    st.status = max >= TARGET ? 'finished' : 'handover';
    log(st, 'Runde ' + st.handNo + ' beendet.');
  }

  function newGame(code, n, host, name){
    return { code, n, hostId: host, players: [{ id: host, name }], playerIds: [host], status: 'lobby',
             scores: [], dealer: 0, handNo: 0, log: [], rev: 0, createdAt: Date.now(), updatedAt: Date.now() };
  }
  function startGame(st){
    if (st.players.length !== st.n) throw E('Es fehlen noch Spieler.');
    st.scores = Array(nSides(st)).fill(0); st.dealer = rnd(st.n); st.history = [];
    deal(st);
  }

  return { SUITSYM, TARGET, rank, suit, isWild, isRed3, isBlack3, points, sum, label, rankName, sortHand, nSides, sideOf, seatsOf,
           canastasNeeded, canastaCount, isCanasta, minMeld, sideName, checkGroup, checkAdd, deal, drawStock, takePile, commit, discard, askOut, answerOut, partnerOf,
           stockOut, endHand, newGame, startGame, newDeck, shuffle };
})();

/* ===================== Aktionen & Ansichten (Server, claude.ai und lokal gemeinsam) ===================== */
(function(C){
  const fail = m => { const e = new Error(m); e.game = true; throw e; };
  C.cleanName = n => String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 18) || 'Gast';
  const strArr = x => Array.isArray(x) ? x.filter(c => typeof c === 'string').slice(0, 60) : [];
  C.cleanStaged = s => {
    s = s && typeof s === 'object' ? s : {};
    return {
      groups: Array.isArray(s.groups) ? s.groups.slice(0, 15).map(strArr) : [],
      adds: Array.isArray(s.adds) ? s.adds.slice(0, 15).map(a => ({ meldId: String((a && a.meldId) || ''), cards: strArr(a && a.cards) })) : []
    };
  };
  // Führt eine Aktion des Spielers pid auf dem Spielstand g aus (wirft bei Regelverstoß).
  C.apply = function(g, pid, a, args){
    args = Array.isArray(args) ? args : [];
    const seat = g.playerIds.indexOf(pid), seated = seat >= 0;
    switch (a){
      case 'join':
        if (seated) return;
        if (g.status !== 'lobby') fail('Das Spiel läuft schon.');
        if (g.players.length >= g.n) fail('Der Tisch ist voll.');
        g.players.push({ id: pid, name: C.cleanName(args[0]) }); g.playerIds.push(pid); return;
      case 'rename':
        if (seated) g.players[seat].name = C.cleanName(args[0]); return;
      case 'leave':
        if (!seated || g.status !== 'lobby') return;
        g.players.splice(seat, 1); g.playerIds.splice(seat, 1);
        if (g.hostId === pid && g.players.length) g.hostId = g.players[0].id;
        return;
      case 'shuffleTeams':
        if (g.hostId !== pid || g.status !== 'lobby') fail('Nur der Gastgeber kann die Plätze mischen.');
        { const o = g.players.map((p, i) => i); C.shuffle(o); g.players = o.map(i => g.players[i]); g.playerIds = g.players.map(p => p.id); }
        return;
      case 'start':
        if (g.hostId !== pid) fail('Nur der Gastgeber kann das Spiel starten.');
        if (g.status !== 'lobby') return;
        C.startGame(g); return;
    }
    if (!seated) fail('Du sitzt nicht an diesem Tisch.');
    switch (a){
      case 'drawStock': return C.drawStock(g, seat);
      case 'takePile': return C.takePile(g, seat, C.cleanStaged(args[0]));
      case 'commit': return C.commit(g, seat, C.cleanStaged(args[0]));
      case 'discard': return C.discard(g, seat, String(args[0]));
      case 'stockOut': return C.stockOut(g, seat);
      case 'askOut': return C.askOut(g, seat);
      case 'answerOut': return C.answerOut(g, seat, !!args[0]);
      case 'nexthand': if (g.status === 'handover') C.deal(g); return;
      case 'rematch': if (g.status === 'finished'){ g.handNo = 0; g.log = []; C.startGame(g); } return;
      default: fail('Unbekannte Aktion.');
    }
  };
  // Ansicht für einen Spieler: fremde Karten und der Talon sind verdeckt.
  C.view = function(g, pid, isOnline){
    const v = JSON.parse(JSON.stringify(g));
    const seat = g.playerIds.indexOf(pid);
    v.youSeat = seat; v.youHost = g.hostId === pid;
    v.players = g.players.map(p => ({ name: p.name, host: p.id === g.hostId, online: isOnline ? isOnline(p.id) : null }));
    delete v.playerIds; delete v.hostId;
    if (v.hand){
      for (const k of Object.keys(v.hand.hands)) if (+k !== seat) v.hand.hands[k] = v.hand.hands[k].map(() => '?');
      v.hand.stock = v.hand.stock.map(() => '?');
    }
    return v;
  };
  C.listItem = (g, pid) => ({ code: g.code, n: g.n, status: g.status, handNo: g.handNo, updatedAt: g.updatedAt || 0,
    players: g.players.map(p => ({ name: p.name })), you: g.playerIds.includes(pid) });
})(Canasta);
if (typeof module !== 'undefined') module.exports = Canasta;
