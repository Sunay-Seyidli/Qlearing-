/*
 * Vercel serverless API: XOX ajanının Q-tablosunu MongoDB'de saklar.
 *
 *   GET    /api/xox  → kayıtlı durum (yoksa 404)
 *   PUT    /api/xox  → durumu kaydet (JSON, doğrulanır)
 *   DELETE /api/xox  → durumu sil (öğrenmeyi sıfırla)
 *
 * Koleksiyon: xox_agent, belge: { _id: "main", table, games, wins, losses, draws, epsilon, updatedAt }
 */
const { getDb } = require("../lib/mongo");

const DOC_ID = "main";
const KEY_RE = /^[ME-]{9}$/;
const MAX_STATES = 20000;

function isNum(x) {
  return typeof x === "number" && Number.isFinite(x) && Math.abs(x) <= 10;
}

function nonNegInt(x) {
  return Number.isInteger(x) && x >= 0;
}

function validate(d) {
  if (!d || typeof d !== "object") throw new Error("Geçersiz veri biçimi");

  const table = d.table;
  if (!table || typeof table !== "object" || Array.isArray(table)) {
    throw new Error("table geçersiz");
  }
  const keys = Object.keys(table);
  if (keys.length > MAX_STATES) throw new Error("Çok fazla durum");

  const clean = {};
  for (const k of keys) {
    if (!KEY_RE.test(k)) throw new Error("Durum anahtarı geçersiz");
    const row = table[k];
    if (!Array.isArray(row) || row.length !== 9 || !row.every(isNum)) {
      throw new Error("Q satırı geçersiz");
    }
    clean[k] = row;
  }

  const out = { table: clean };
  for (const s of ["games", "wins", "losses", "draws"]) {
    const v = d[s] === undefined ? 0 : d[s];
    if (!nonNegInt(v)) throw new Error(s + " geçersiz");
    out[s] = v;
  }

  const eps = d.epsilon === undefined ? 0.35 : d.epsilon;
  if (typeof eps !== "number" || !(eps >= 0 && eps <= 1)) throw new Error("epsilon geçersiz");
  out.epsilon = eps;

  return out;
}

module.exports = async (req, res) => {
  try {
    const db = await getDb();
    const col = db.collection("xox_agent");

    if (req.method === "GET") {
      const doc = await col.findOne({ _id: DOC_ID }, { projection: { _id: 0, updatedAt: 0 } });
      if (!doc) return res.status(404).json({ error: "kayıt yok" });
      return res.status(200).json(doc);
    }

    if (req.method === "PUT") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      let clean;
      try {
        clean = validate(body);
      } catch (e) {
        return res.status(400).json({ error: e.message });
      }
      await col.replaceOne(
        { _id: DOC_ID },
        { _id: DOC_ID, ...clean, updatedAt: new Date() },
        { upsert: true }
      );
      return res.status(200).json({ ok: true });
    }

    if (req.method === "DELETE") {
      await col.deleteOne({ _id: DOC_ID });
      return res.status(204).end();
    }

    res.setHeader("Allow", "GET, PUT, DELETE");
    return res.status(405).json({ error: "izin verilmeyen metod" });
  } catch (err) {
    console.error("xox API hatası:", err);
    return res.status(500).json({ error: "sunucu hatası" });
  }
};
