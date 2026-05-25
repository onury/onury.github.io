# Codenames TR

Türkçe Codenames için iki cihazlı PWA. Board = iPad, Anlatıcı = iPhone.

## Hızlı bakış

- Tek HTML, no build, no backend
- WebRTC peer-to-peer — iki QR taraması ile eşleme, sonra tamamen offline
- 4×4 ve 5×5 board seçeneği
- Kullanılan kelimeler localStorage’da tutulur, oyunlar tekrarsız
- Ölüm kartı / hedef tamamlanması otomatik tespit

## Dosyalar

- `index.html` — uygulama
- `words.js` — Türkçe kelime havuzu (~450 kelime)
- `sw.js` — service worker (offline cache)
- `manifest.json` — PWA manifest

## Kurulum

iOS Safari’nin kameraya erişebilmesi için **HTTPS** gerekiyor. Üç kolay seçenek:

### Seçenek A: GitHub Pages

1. Yeni repo aç, dosyaları push et
1. Settings → Pages → main branch
1. `https://<username>.github.io/<repo>/` adresinden aç

### Seçenek B: Cloudflare Pages / Netlify drop

1. cloudflare.com/products/pages veya app.netlify.com → “drag & drop”
1. Klasörü sürükle bırak
1. Verilen HTTPS URL’i aç

### Seçenek C: Lokal test (Mac’te)

```
cd codenames
python3 -m http.server 8000
```

Sonra Mac’te `http://localhost:8000` ile bak. iPad’den kameraya erişmek için yine de HTTPS gerek — `ngrok http 8000` veya benzeri.

## iPad / iPhone’da kurulum

Her iki cihazda da:

1. Safari’de URL’i aç
1. Paylaş ikonu → “Ana Ekrana Ekle”
1. Açılan ikondan başlat (fullscreen, app gibi)

## Oyun başlatma

1. **iPad’de** “Board (iPad)” seç
1. **iPhone’da** “Anlatıcı (iPhone)” seç
1. iPad’de “Eşle” → “QR Oluştur” → QR ekrana gelir
1. iPhone’da “Eşle” → “QR Taramayı Başlat” → iPad’deki QR’a tut
1. iPhone’da cevap QR’ı oluşur
1. iPad’de “Cevap QR Tara” → iPhone’daki QR’a tut
1. Bağlandı! Artık otomatik senkron.

İlk eşleme bir defalık. Bağlantı sırasında sayfa kapanırsa eşlemeyi tekrarlamak gerekir.

## Oynama

- **Board (iPad)**: kelime tahtası, iki takım görür
- **Anlatıcı (iPhone)**: renkli harita, sadece anlatıcılar görür
- **Karta dokun (iPad)**: anlatıcıya sorulur, renk gelir, kart açılır
- **Karta uzun bas (iPad)**: manuel renk seçimi (bağlantı yoksa fallback)
- **Karta dokun (iPhone)**: o kartı board’da açar (anlatıcı yanlışlık fark ederse)
- **Yeni Oyun (iPad)**: yeni board oluşur, anlatıcıya gönderilir
- **Ölüm kartı**: oyun otomatik biter

## Kurallar (MVP)

- 5×5: 9 kırmızı, 8 mavi, 7 sarı, 1 ölüm. Kırmızı başlar (9 hedefi).
- 4×4: 6 kırmızı, 5 mavi, 4 sarı, 1 ölüm. Kırmızı başlar.
- Yanlış renk açılırsa sıra karşı takıma geçer.
- Ölüm kartı → açan takım kaybeder.
- Bir takımın tüm kelimeleri bulunduğunda o takım kazanır.

## Bilinen sınırlar (v1’de iyileştirilebilir)

- “Sıra” tamamen otomatik — ipucu sayısı vermek/turu manuel bitirmek yok
- Eşleme her oturum açılışında tekrar gerekir (oturum saklanmıyor)
- Kelime havuzu küçük, ~18 oyun tekrarsız
- QR sıkıştırma `CompressionStream` gerektirir (iOS 16.4+); eski sürümlerde QR çok büyük olabilir, o zaman metni elle yapıştırma fallback’i var

## Geliştirme notları

WebRTC SDP’sini QR’a sığdırmak için `CompressionStream` (deflate-raw) + base64 kullanıyoruz. Tarayıcıda bu yoksa raw JSON’a düşüyor — bu durumda QR çok büyük olabilir, alternatif olarak metni manuel kopyala-yapıştır UI’da var.

İki cihaz farklı ağlardaysa STUN sunucusu (Google’ınki) ICE candidate’ları çözer. Tamamen yerel ağda STUN bile gerekmiyor.

İletişim mesaj tipleri:

- `board_state` — board → spy (full state sync)
- `request_state` — spy → board (yeniden sync iste)
- `request_reveal {idx}` — board → spy (bu kartın rengi ne?)
- `reveal {idx, color}` — spy → board (cevap)
- `reveal_done {idx, color}` — board → spy (manuel açıldı bildir)
- `new_game {board, turn, size}` — board → spy