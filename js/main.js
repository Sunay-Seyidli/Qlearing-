/*
 * XOX arayüzü: oyun akışı, Q-Learning ajanı, Vercel API üzerinden MongoDB kaydı.
 * Veritabanı yanıt vermese bile oyun çevrimdışı çalışır.
 */
(function () {
  "use strict";

  const API = "/api/xox";
  const LOAD_TIMEOUT_MS = 5000;
  const SAVE_TIMEOUT_MS = 10000;
  const TOTAL_STATES_ESTIMATE = 5500;
  const TRAIN_GAMES = 100000;

  const $ = id => document.getElementById(id);
  const el = {
    board: $("board"),
    result: $("result"),
    turn: $("turn"),
    player: $("player-score"),
    draw: $("draw-score"),
    ai: $("ai-score"),
    games: $("games"),
    winRate: $("win-rate"),
    known: $("known"),
    epsilon: $("epsilon"),
    bar: $("learn-bar"),
    syncText: $("sync-text"),
    dot: $("status-dot"),
    newGame: $("new-game"),
    train: $("train-btn"),
    reset: $("reset-btn"),
    burger: $("burger"),
    drawer: $("drawer"),
    backdrop: $("backdrop"),
    closeDrawer: $("close-drawer"),
    sideBtns: document.querySelectorAll(".side-btn"),
  };

  const session = { player: 0, ai: 0, draw: 0 };
  let agent = new XoxAgent();
  let humanSide = PLAYER_X;
  let ep = null;
  let winCells = [];
  let busy = true;      // yükleme bitene kadar oynanamaz
  let gid = 0;          // oyun kimliği: eski zamanlayıcıları geçersiz kılar
  let saveChain = Promise.resolve();

  const aiSide = () => other(humanSide);

  // ---------- Hücreler ----------
  const cells = [];
  for (let i = 0; i < 9; i++) {
    const btn = document.createElement("button");
    btn.className = "cell";
    btn.dataset.i = String(i);
    btn.dataset.v = "0";
    btn.setAttribute("aria-label", `Hücre ${i + 1}`);
    btn.addEventListener("click", () => onCell(i));
    el.board.appendChild(btn);
    cells.push(btn);
  }

  function markSVG(v) {
    if (v === PLAYER_X) {
      return '<svg viewBox="0 0 100 100"><path class="mark x" pathLength="100" d="M24 24 L76 76 M76 24 L24 76"/></svg>';
    }
    if (v === PLAYER_O) {
      return '<svg viewBox="0 0 100 100"><circle class="mark o" pathLength="100" cx="50" cy="50" r="28"/></svg>';
    }
    return "";
  }

  function canHumanMove() {
    return !!ep && !ep.over && !busy && ep.turn === humanSide;
  }

  function renderBoard() {
    cells.forEach((btn, i) => {
      const v = ep ? ep.board[i] : 0;
      // Sadece değişen hücreyi yeniden çiz; böylece işaret animasyonu bir kez oynar
      if (btn.dataset.v !== String(v)) {
        btn.dataset.v = String(v);
        btn.innerHTML = markSVG(v);
      }
      btn.classList.toggle("win", winCells.includes(i));
      btn.disabled = v !== 0 || !canHumanMove();
    });
  }

  function renderTurn() {
    if (!ep || ep.over) {
      el.turn.textContent = "";
    } else if (ep.turn === humanSide) {
      el.turn.textContent = "Sıra sende";
    } else {
      el.turn.textContent = "AI düşünüyor…";
    }
  }

  // ---------- Sunucu (Vercel API → MongoDB) ----------
  async function fetchWithTimeout(url, opts = {}, ms = LOAD_TIMEOUT_MS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      return await fetch(url, { ...opts, cache: "no-store", signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async function loadAgent() {
    const res = await fetchWithTimeout(API);
    if (res.status === 404) return new XoxAgent();
    if (!res.ok) throw new Error("HTTP " + res.status);
    return XoxAgent.fromJSON(await res.json()) || new XoxAgent();
  }

  async function saveAgent() {
    const res = await fetchWithTimeout(
      API,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(agent.toJSON()),
      },
      SAVE_TIMEOUT_MS
    );
    if (!res.ok) throw new Error("HTTP " + res.status);
  }

  async function clearAgent() {
    const res = await fetchWithTimeout(API, { method: "DELETE" }, SAVE_TIMEOUT_MS);
    if (!res.ok && res.status !== 404) throw new Error("HTTP " + res.status);
  }

  // Kayıtları sırayla gönderir; en son durum her zaman en son gider
  function queue(task) {
    saveChain = saveChain.then(task).then(
      () => setStatus("ok", "Veritabanına kaydedildi"),
      err => {
        console.error(err);
        setStatus("err", "Kayıt yapılamadı (çevrimdışı)");
      }
    );
    return saveChain;
  }

  function setStatus(state, text) {
    el.dot.className = "status-dot" + (state ? " " + state : "");
    el.syncText.textContent = text;
  }

  // ---------- Arayüz ----------
  function updateScore() {
    el.player.textContent = session.player;
    el.draw.textContent = session.draw;
    el.ai.textContent = session.ai;
  }

  function renderStats() {
    el.games.textContent = agent.games;
    el.winRate.textContent = agent.games ? "%" + Math.round((agent.wins / agent.games) * 100) : "-";
    const known = agent.knownStates();
    el.known.textContent = known;
    el.bar.style.width = Math.min(100, (known / TOTAL_STATES_ESTIMATE) * 100) + "%";
    el.epsilon.textContent = "%" + Math.round(agent.epsilon * 100);
  }

  function setSideButtons() {
    el.sideBtns.forEach(b => {
      const active = Number(b.dataset.side) === humanSide;
      b.classList.toggle("active", active);
      b.setAttribute("aria-pressed", String(active));
    });
  }

  function openDrawer() {
    el.drawer.classList.add("open");
    el.backdrop.classList.add("open");
    el.drawer.setAttribute("aria-hidden", "false");
    el.burger.setAttribute("aria-expanded", "true");
  }

  function closeDrawer() {
    el.drawer.classList.remove("open");
    el.backdrop.classList.remove("open");
    el.drawer.setAttribute("aria-hidden", "true");
    el.burger.setAttribute("aria-expanded", "false");
  }

  // ---------- Oyun akışı ----------
  function startGame() {
    gid++;
    const my = gid;
    busy = false;
    ep = new Episode(agent, [aiSide()]); // AI öğrenir, insan hamleleri öğretilmez
    winCells = [];
    el.result.className = "result";
    el.result.textContent = "";
    renderBoard();
    renderTurn();

    if (ep.turn === aiSide()) {
      busy = true;
      setTimeout(() => {
        if (my === gid) aiMove();
      }, 450);
    }
  }

  function aiMove() {
    if (!ep || ep.over) {
      busy = false;
      return;
    }
    const a = agent.choose(ep.board, aiSide(), agent.epsilon);
    ep.applyMove(aiSide(), a);
    renderBoard();
    renderTurn();
    if (ep.over) {
      finish();
    } else {
      busy = false;
      renderBoard();
    }
  }

  function onCell(i) {
    if (!canHumanMove() || ep.board[i] !== 0) return;
    ep.applyMove(humanSide, i);
    renderBoard();
    renderTurn();
    if (ep.over) {
      finish();
      return;
    }
    busy = true;
    renderBoard();
    const my = gid;
    setTimeout(() => {
      if (my === gid) aiMove();
    }, 380);
  }

  function finish() {
    busy = false;
    winCells = ep.line || [];
    renderBoard();
    renderTurn();

    let text, cls;
    if (ep.winner === aiSide()) {
      agent.wins++;
      session.ai++;
      text = "AI kazandı. Bir dahaki oyunda bu hamleyi daha iyi okuyacak.";
      cls = "lose";
    } else if (ep.winner === 0) {
      agent.draws++;
      session.draw++;
      text = "Berabere! İkiniz de iyi oynadınız.";
      cls = "draw";
    } else {
      agent.losses++;
      session.player++;
      text = "Kazandın! AI bu hamlelerden ders çıkardı.";
      cls = "win";
    }
    agent.games++;
    agent.epsilon = Math.max(0.02, agent.epsilon * 0.98);

    updateScore();
    renderStats();
    queue(saveAgent);

    el.result.textContent = text;
    el.result.className = "result " + cls;
  }

  // ---------- Olaylar ----------
  el.sideBtns.forEach(b =>
    b.addEventListener("click", () => {
      const side = Number(b.dataset.side);
      if (side === humanSide) return;
      humanSide = side;
      setSideButtons();
      startGame();
    })
  );

  el.newGame.addEventListener("click", startGame);

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") return closeDrawer();
    const n = Number(e.key);
    if (n >= 1 && n <= 9) onCell(n - 1);
  });

  el.burger.addEventListener("click", openDrawer);
  el.closeDrawer.addEventListener("click", closeDrawer);
  el.backdrop.addEventListener("click", closeDrawer);

  el.train.addEventListener("click", () => {
    if (busy) return;
    busy = true;
    el.train.disabled = true;
    el.result.className = "result";
    el.result.textContent = "AI kendi kendine oynuyor…";
    // Arayüzün boyanması için kısa bir gecikme
    setTimeout(() => {
      selfPlay(agent, TRAIN_GAMES);
      queue(saveAgent);
      renderStats();
      el.train.disabled = false;
      el.result.textContent = `${TRAIN_GAMES.toLocaleString("tr-TR")} oyun tamamlandı. AI daha güçlü!`;
      startGame();
    }, 60);
  });

  el.reset.addEventListener("click", () => {
    if (busy) return;
    if (!confirm("AI'nin tüm öğrenmesi veritabanından silinsin mi?")) return;
    agent = new XoxAgent();
    session.player = session.ai = session.draw = 0;
    updateScore();
    renderStats();
    queue(clearAgent);
    startGame();
    el.result.textContent = "Öğrenme sıfırlandı. AI yeniden başlıyor.";
  });

  // ---------- Başlatma ----------
  updateScore();
  setSideButtons();
  setStatus("", "Veritabanına bağlanılıyor…");
  el.turn.textContent = "Yükleniyor…";
  busy = true;

  loadAgent()
    .then(loaded => {
      agent = loaded;
      setStatus("ok", "Veritabanına bağlı");
    })
    .catch(err => {
      console.error(err);
      setStatus("err", "Çevrimdışı: öğrenme kaydedilmiyor");
    })
    .finally(() => {
      renderStats();
      startGame();
    });
})();
