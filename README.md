# Depong — Web App Ala Locket (Foto & Video 7 Detik)

Aplikasi web mobile-first bergaya **Locket Dark Aesthetic** dengan dukungan **Foto** & **Video 7 Detik**, **Feed Realtime + Reaksi Emoji Melayang**, serta **Memories & Kalender Bulanan**.

---

## Fitur Utama
- **Kamera Foto & Video 7 Detik:** Buka kamera langsung di browser (`getUserMedia` + `MediaRecorder`), rekam video otomatis berhenti di **7 detik** dengan indikator *gold progress ring*, atau pilih dari galeri.
- **Mode Demo Instan:** Bisa langsung dicoba di browser tanpa login terlebih dahulu.
- **Feed Momen & Reaksi Cepat:** Auto-play video 7 detik (loop), balas pesan singkat, dan animasi emoji melayang (`💛 🔥 😍`).
- **Memories & Kalender Visual:** Grid kolase momen dan kalender bulanan otomatis terisi foto/video di setiap tanggal.
- **Sistem Sahabat (Close Friends):** Tambah sahabat lewat kode/link undangan (maksimal 20 sahabat).
- **PWA Ready:** Dilengkapi `manifest.webmanifest` & ikon agar bisa di-*Add to Home Screen* di Android maupun iOS.

---

## 1. Cara Menjalankan di Laptop (Lokal)

```bash
npm install
npm run dev
```

Buka `http://localhost:3000` di browser. Kamu bisa langsung klik **Buka Demo** untuk mencoba kamera, video 7 detik, feed, dan kalender tanpa perlu mengisi database dulu.

---

## 2. Setup Backend & Storage Gratis (Supabase)

1. Buat akun & project gratis di [supabase.com](https://supabase.com).
2. Buka menu **SQL Editor** di dashboard Supabase, lalu *copy-paste* seluruh isi file [`supabase/schema.sql`](./supabase/schema.sql) dan klik **Run**.
   - Script ini otomatis membuat tabel `profiles`, `friendships`, `moments`, `reactions`, `replies`, mengaktifkan *Row Level Security (RLS)*, *Realtime*, serta membuat bucket storage `moments` (mendukung foto & video hingga 10 MB).
3. Buka **Project Settings → API**, salin **Project URL** dan **anon / publishable key**.
4. Duplikat file `.env.example` menjadi `.env.local`, lalu isi nilainya:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
   ```
5. Restart `npm run dev`.

---

## 3. Cara Push ke GitHub & Deploy Gratis di Vercel

### Push ke GitHub
```bash
git add .
git commit -m "feat: initial Depong web app (Locket dark + 7s video)"
git branch -M main
git remote add origin https://github.com/USERNAME_ANDA/NAMA_REPO.git
git push -u origin main
```

### Deploy Gratis di Vercel
1. Masuk ke [vercel.com](https://vercel.com) menggunakan akun GitHub Anda.
2. Klik **Add New… → Project**, lalu pilih repository GitHub ini.
3. Pada bagian **Environment Variables**, tambahkan:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Klik **Deploy**. Setelah selesai, Anda akan mendapatkan domain `https://....vercel.app` (sudah HTTPS sehingga kamera & mikrofon langsung berfungsi di HP).
