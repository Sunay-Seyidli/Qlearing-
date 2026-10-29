/*
 * XOX (Tic-Tac-Toe) — oyun mantığı ve Q-Learning ajanı
 *
 * Durum anahtarı, oynayan oyuncunun gözünden tahtayı kodlar:
 *   M = kendi işaretim, E = rakibin işareti, - = boş   (örn. "ME-E-M--")
 * Böylece ajan X veya O olarak oynasa da aynı Q-tablosunu kullanır.
 *
 * Ödül: kazanma +1, kaybetme -1, berabere 0.
 * Güncelleme: Q(s,a) ← Q(s,a) + α · [ hedef − Q(s,a) ]
 *   hedef = ödül                       (oyun bittiğinde)
 *   hedef = γ · max_a' Q(s', a')        (oyun devam ederken)
 */

const XOX_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];
const PLAYER_X = 1;
const PLAYER_O = 2;
const other = p => 3 - p;

// Oyun bitti mi? Kazanan: 1/2, berabere: 0
function evaluate(board) {
  for (const line of XOX_LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { done: true, winner: board[a], line };
    }
  }
  if (board.every(v => v !== 0)) return { done: true, winner: 0, line: null };
  return { done: false, winner: null, line: null };
}

// p oyuncusunun gözünden durum anahtarı
function stateKey(board, p) {
  let s = "";
  for (const v of board) s += v === 0 ? "-" : v === p ? "M" : "E";
  return s;
}

class XoxAgent {
  constructor(opts = {}) {
    this.alpha = opts.alpha ?? 0.3;
    this.gamma = opts.gamma ?? 0.9;
    this.epsilon = opts.epsilon ?? 0.35;
    this.table = {};
    this.games = 0;
    this.wins = 0;
    this.losses = 0;
    this.draws = 0;
  }

  row(key) {
    if (!this.table[key]) this.table[key] = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    return this.table[key];
  }

  // Bu durumda boş hücrelerdeki en iyi Q değeri (dolu hücreler yok sayılır)
  maxQ(key) {
    const r = this.table[key];
    if (!r) return 0;
    let m = -Infinity;
    let any = false;
    for (let i = 0; i < 9; i++) {
      if (key[i] === "-") {
        any = true;
        if (r[i] > m) m = r[i];
      }
    }
    return any ? m : 0;
  }

  learn(key, a, target) {
    const r = this.row(key);
    r[a] += this.alpha * (target - r[a]);
  }

  // ε-greedy hamle seçimi; eşit değerlerde rastgele seçer
  choose(board, p, eps) {
    const legal = [];
    for (let i = 0; i < 9; i++) if (board[i] === 0) legal.push(i);
    if (Math.random() < eps) return legal[Math.floor(Math.random() * legal.length)];

    const r = this.row(stateKey(board, p));
    let best = -Infinity;
    let cands = [];
    for (const i of legal) {
      if (r[i] > best + 1e-9) {
        best = r[i];
        cands = [i];
      } else if (Math.abs(r[i] - best) <= 1e-9) {
        cands.push(i);
      }
    }
    return cands[Math.floor(Math.random() * cands.length)];
  }

  knownStates() {
    return Object.keys(this.table).length;
  }

  toJSON() {
    return {
      table: this.table,
      games: this.games,
      wins: this.wins,
      losses: this.losses,
      draws: this.draws,
      epsilon: this.epsilon,
    };
  }

  static fromJSON(d, opts) {
    if (!d || typeof d !== "object" || !d.table || typeof d.table !== "object") return null;
    const a = new XoxAgent(opts);
    a.table = d.table;
    a.games = Number(d.games) || 0;
    a.wins = Number(d.wins) || 0;
    a.losses = Number(d.losses) || 0;
    a.draws = Number(d.draws) || 0;
    a.epsilon = typeof d.epsilon === "number" ? d.epsilon : a.epsilon;
    return a;
  }
}

// Tek bir oyun. learnSides: hangi oyuncular Q-tablosundan öğrensin
class Episode {
  constructor(agent, learnSides) {
    this.agent = agent;
    this.learnSides = learnSides;
    this.board = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    this.turn = PLAYER_X;
    this.pending = { 1: null, 2: null };
    this.over = false;
    this.winner = null;
    this.line = null;
  }

  applyMove(p, a) {
    if (this.over) throw new Error("Oyun bitti");
    if (p !== this.turn) throw new Error("Sıra bu oyuncuda değil");
    if (this.board[a] !== 0) throw new Error("Hücre dolu");

    const learn = this.learnSides.includes(p);
    const key = stateKey(this.board, p);
    const prev = this.pending[p];

    // Bir önceki kararın hedefi: şimdiki duruma bakarak güncellenir
    if (learn && prev) {
      this.agent.learn(prev.key, prev.a, this.agent.gamma * this.agent.maxQ(key));
    }

    this.board[a] = p;
    const st = evaluate(this.board);
    const opp = other(p);

    if (st.done) {
      this.over = true;
      this.winner = st.winner;
      this.line = st.line;
      if (learn) this.agent.learn(key, a, st.winner === p ? 1 : 0);
      // Rakibin bekleyen kararı: oyun bitti, kazanmadığı için -1 veya berabere 0
      const oppPrev = this.pending[opp];
      if (this.learnSides.includes(opp) && oppPrev) {
        this.agent.learn(oppPrev.key, oppPrev.a, st.winner === p ? -1 : 0);
      }
      this.pending = { 1: null, 2: null };
    } else {
      if (learn) this.pending[p] = { key, a };
      this.turn = opp;
    }
    return st;
  }
}

// Ajan kendi kendine oynar; eğitim süresince keşif oranı 0.5 → 0.05 düşer
function selfPlay(agent, games) {
  for (let g = 0; g < games; g++) {
    const eps = Math.max(0.05, 0.5 * (1 - g / games));
    const ep = new Episode(agent, [PLAYER_X, PLAYER_O]);
    while (!ep.over) {
      const p = ep.turn;
      ep.applyMove(p, agent.choose(ep.board, p, eps));
    }
  }
}
