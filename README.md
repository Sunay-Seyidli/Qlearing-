# XOX — Q-Learning AI (Vercel + MongoDB)

Klasik XOX (üç taşlı) oyununun, Q-Learning ile öğrenen bir yapay zekâya karşı oynandığı
sürüm. AI kendi kendine oynayarak ön eğitim alır ve senin oyunlarından da öğrenmeye devam eder.
Q-tablosu **MongoDB Atlas**'ta saklanır, uygulama **Vercel**'de yayınlanır.

## Proje yapısı

```
xox-qlearning/
├── index.html        # Arayüz (tam ekran, hamburger menü, Hakkında)
├── css/style.css     # Tema ve yerleşim
├── js/
│   ├── xox.js        # Oyun mantığı + Q-Learning ajanı + kendi kendine oynama
│   └── main.js       # Oyun akışı, kayıt, menü
├── api/
│   └── xox.js        # Vercel serverless API (GET / PUT / DELETE)
├── lib/
│   └── mongo.js      # MongoDB bağlantısı (önbellekli)
├── package.json
├── .env.example
└── .gitignore
```

## 1) MongoDB Atlas

1. **Database Access**: bir kullanıcı oluştur veya şifreyi değiştir.
2. **Network Access**: `0.0.0.0/0` ekle. Vercel'in IP'leri sabit olmadığı için gereklidir.
3. Bağlantı dizesini (`mongodb+srv://...`) al. Koleksiyon `xox_agent` olarak otomatik oluşur.

## 2) GitHub'a yükle

```bash
cd ~/xox-qlearning
git init -b main
git add .
git commit -m "İlk sürüm: XOX Q-Learning"
git remote add origin git@github.com:KULLANICI/xox-qlearning.git
git push -u origin main
```

`.env` dosyası `.gitignore` içinde olduğu için commit'e girmez.

## 3) Vercel'e deploy et

1. vercel.com → **Add New… → Project** → GitHub reposunu seç.
2. **Framework Preset:** `Other`. Build command, output directory ve install command boş kalır.
3. **Environment Variables**:

   | Ad | Değer |
   |----|-------|
   | `MONGODB_URI` | Yeni şifrenle hazırlanmış `mongodb+srv://...` bağlantı dizesi |
   | `MONGODB_DB`  | `rps` (veya istediğin veritabanı adı) |

4. **Deploy**. Sonra `https://senin-adres.vercel.app/api/xox` adresini aç: ilk kullanımda `{"error":"kayıt yok"}` normaldir.

Ortam değişkenini sonradan değiştirirsen **Redeploy** gerekir.

## Yerel geliştirme

```bash
npm install
cp .env.example .env     # KULLANICI ve SIFRE alanlarını doldur
npx vercel dev           # http://localhost:3000
```

## Nasıl çalışıyor?

- **Durum:** AI tahtayı kendi gözünden kodlar: `M` kendi işaretin, `E` rakibin, `-` boş.
  Böylece X veya O olarak oynasa aynı tablo kullanılır.
- **Ödül:** Kazanma +1, kaybetme −1, berabere 0.
- **Güncelleme:** `Q(s,a) ← Q(s,a) + α·[hedef − Q(s,a)]`, hedef oyun devam ediyorsa `γ·max Q(s',·)`.
- **Keşif:** ε-greedy. Oynanan her oyunda ε küçülür (minimum %2).
- **Eğitim:** "AI'yi 100.000 oyunla eğit" butonu AI'yi kendi kendine oynatır. Keşif oranı 0.5'ten 0.05'e düşer.

## API

| Metot  | Yol        | Açıklama |
|--------|------------|----------|
| GET    | /api/xox   | Kayıtlı durumu döndürür (yoksa 404) |
| PUT    | /api/xox   | Durumu kaydeder (doğrulanır) |
| DELETE | /api/xox   | Durumu siler |

## Kısayollar

- `1`–`9`: hücreleri seçer (1 sol üst, 9 sağ alt)
- `Esc`: menüyü kapatır
