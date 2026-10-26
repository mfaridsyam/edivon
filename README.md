# Klip

Editor video yang berjalan sepenuhnya di browser. Tidak ada server dan tidak ada unggahan: video dibaca, dipratinjau, dan diekspor di perangkatmu sendiri. Hasil build berupa situs statis yang bisa dihosting di Vercel.

## Fitur

- Impor video, audio, dan gambar lewat seret-lepas atau tombol **Pilih berkas**. Durasi, dimensi, dan thumbnail dibaca di browser.
- Timeline dengan lajur Teks, Video 2, Video 1, dan Audio 1. Kamu bisa menambah lajur video, audio, teks, atau efek. Klip bisa digeser antarlajur, menempel ke klip lain dan playhead, di-trim dari tepi, dibelah, dan dihapus. Ada juga zoom timeline.
- Video 1 adalah lajur utama yang magnetis: klipnya selalu rapat ke kiri mulai 0:00 tanpa celah, baik saat ditambah, diseret (urutannya bertukar), dipotong, diubah kecepatannya, maupun dihapus. Lajur lain (Video 2, Teks, Audio, Efek) bebas diatur posisinya.
- Alat: Pilih, Teks, Crop, Kecepatan, Volume, Efek, dan Hapus. Dengan alat Pilih, tarik ujung klip untuk memendekkan atau memanjangkannya.
- Aksi di garis merah (playhead): **Potong kiri** (Q) membuang bagian klip sebelum garis, **Belah** (W) membelah klip di garis, dan **Potong kanan** (E) membuang bagian sesudah garis. Yang dikenai adalah klip terpilih di bawah garis. Tanpa pilihan, Belah mengenai semua klip di bawah garis, sedangkan Potong kiri/kanan hanya klip Video 1 supaya musik dan teks tetap sinkron.
- Properti klip: skala, posisi, rotasi, opasitas, kecepatan (0,5× sampai 4×), kecerahan, kontras, saturasi, volume, dan tombol **Setel ulang**.
- Klip video, gambar, dan teks bisa dipilih langsung di pratinjau. Seret untuk memindahkannya (menempel ke garis tengah), atau tarik sudutnya untuk mengubah skala.
- Pratinjau dengan rasio 16:9, 4:3, 1:1, 4:5, 3:4, atau 9:16, plus timecode dan layar penuh.
- Preset ekspor untuk media sosial: Status WhatsApp, Feed Instagram, serta Story & Reels Instagram. Semuanya MP4 H.264 + AAC 30 fps dengan bitrate yang cocok untuk aplikasinya. Rasio tidak dipaksakan: bawaannya mengikuti rasio proyek, dengan pilihan "penuh layar" (9:16 atau 4:5) dan resolusi 720p atau 1080p. Feed Instagram memotong video yang lebih tegak dari 4:5, jadi proyek seperti itu diberi latar hitam di bingkai 4:5.
- Ekspor ke MP4 (H.264 + AAC) atau WebM (VP9 + Opus) dalam 720p, 1080p, atau 4K bila browser mendukung. Sebelum mulai, dialog menampilkan perkiraan ukuran berkas. Selama ekspor, progres dan estimasi sisa waktu ditampilkan, dan ekspor bisa dibatalkan.
- Undo/redo dan pintasan keyboard untuk semua alat.

## Menjalankan di komputer sendiri

Butuh Node.js 22.12 atau lebih baru.

```bash
npm install
npm run dev        # server pengembangan di http://localhost:5173
npm run build      # build statis ke dist/
npm run preview    # menyajikan dist/ secara lokal
```

Halaman internal komponen tersedia di `/ui/`.

### Pengujian

```bash
npm run test       # Vitest: logika timeline (model, snap, belah, trim, undo/redo)

npx playwright install chromium   # sekali saja
npm run test:e2e   # Playwright: impor dua berkas, belah, urutkan, ekspor
```

Video contoh untuk tes end-to-end dibuat otomatis di browser pada saat tes dan disimpan di `e2e/.fixtures/` (diabaikan git). Tidak ada berkas media di repo.

## Deploy ke Vercel

1. Push repo ini ke GitHub, GitLab, atau Bitbucket.
2. Di Vercel, pilih **Add New → Project**, lalu impor repo tersebut.
3. Framework preset: **Vite** (biasanya terdeteksi otomatis). Perintah build dan folder keluaran sudah diatur di `vercel.json` (`npm run build` → `dist`).
4. Klik **Deploy**. Tidak ada variabel lingkungan yang perlu diisi.

Setiap push ke branch utama akan memicu deploy baru.

## Memasang sebagai aplikasi

Klip adalah web app yang bisa dipasang (PWA). Setelah dipasang, Klip terbuka di jendelanya sendiri dan tetap bisa dipakai tanpa internet.

- **Chrome, Edge, atau Brave (desktop dan Android):** pakai ikon pasang di bilah alamat, menu **Pasang aplikasi**, atau tombol **Pasang aplikasi** di panel Media.
- **iPhone atau iPad (Safari):** ketuk **Bagikan**, lalu pilih **Tambahkan ke Layar Utama**.

Service worker dibuat saat build dari `src/sw-template.js`, dan menyimpan semua berkas aplikasi untuk dipakai tanpa internet. Setiap deploy menghasilkan versi cache baru, dan versi lama dihapus otomatis. Ikon dibuat dengan `node scripts/generate-icons.mjs`.

## Di ponsel

- Buka panel lewat tombol **Media**. Ketuk kartu media untuk menambahkannya di garis merah; panel menutup sendiri supaya hasilnya langsung terlihat.
- Usap timeline untuk menggulir. **Tekan-tahan** klip sebentar untuk memindahkannya, atau tekan-tahan ujungnya untuk memendekkan.
- Cubit timeline dengan dua jari untuk zoom, atau pakai tombol **−** dan **+**.
- Properti klip ada di laci **Properti** di bilah atas.
- Halaman tidak ikut di-zoom dengan cubit atau ketuk dua kali, supaya terasa seperti aplikasi. Cubit di timeline hanya mengubah zoom timeline.
- **Layar penuh** menampilkan pratinjau beserta tombol putar dan keluar. Di Android, video lanskap otomatis diputar mendatar. iPhone tidak punya layar penuh untuk halaman web, jadi pratinjau dibentangkan memenuhi layar.

## Batasan browser

- **Ekspor butuh WebCodecs** (`VideoEncoder` dan `AudioEncoder`). Gunakan Chrome atau Edge versi terbaru di desktop. Kalau browser tidak mendukung, Klip menampilkan pesan dan pratinjau tetap bisa dipakai.
- Pilihan format dan resolusi di dialog ekspor mengikuti kemampuan encoder browser. Contohnya, 4K atau MP4 bisa tidak tersedia, dan WebM dipakai sebagai cadangan.
- Perkiraan ukuran di dialog ekspor dihitung dari bitrate encoder. Untuk video yang banyak bergerak, selisihnya dengan hasil biasanya di bawah 15%. Rekaman layar atau video yang banyak diam hasilnya bisa jauh lebih kecil.
- Ada berkas yang bisa diputar browser tetapi codec-nya tidak bisa didekode WebCodecs. Kartunya diberi keterangan "Belum bisa diekspor di browser ini".
- Video H.265 (HEVC), yang umum dipakai kamera CCTV/DVR, butuh dekoder HEVC hardware. Di Windows, pakai Chrome atau Brave. Edge baru bisa setelah ekstensi HEVC Video Extensions dari Microsoft Store dipasang.
- Banyak rekaman CCTV menyimpan parameter codec HEVC yang rusak. Klip tetap membacanya lewat dekoder toleran: parameter diperbaiki atau stream diubah ke Annex B. Karena `<video>` tidak bisa di-seek akurat untuk berkas seperti ini, gambar pratinjaunya juga didekode lewat WebCodecs supaya sama persis dengan hasil ekspor. Berkas sangat besar dengan indeks di akhir berkas butuh beberapa detik untuk tampil pertama kali.
- Bitrate ekspor dihitung dari resolusi dan kualitas (1080p: sekitar 4, 6, atau 10 Mbps untuk Rendah, Sedang, dan Tinggi). Hasil tidak bisa lebih tajam dari sumbernya. Rekaman CCTV yang sudah sangat terkompresi tetap akan menampakkan blok dari kameranya.
- Hasil ekspor disimpan di memori sampai diunduh. Video 4K yang panjang bisa memakan banyak memori.
- Perubahan kecepatan juga mengubah pitch suara, baik di pratinjau maupun hasil ekspor.
- Proyek tidak disimpan otomatis. Menutup atau memuat ulang tab akan menghapus timeline dan media yang sudah diimpor.
- Belum tersedia: transisi, keyframe, multi-kamera, kolaborasi, dan akun.

## Privasi

- Berkas tidak pernah dikirim ke server. Video, audio, dan gambar hanya ada di memori tab sebagai `File`/`Blob` dan object URL (`blob:`).
- Tidak ada backend, API, analytics, cookie, atau skrip pihak ketiga. Font, ikon, dan pustaka di-self-host atau di-bundle.
- Build produksi memasang Content Security Policy yang hanya mengizinkan skrip, font, dan koneksi dari origin sendiri. Akibatnya, kode Klip juga tidak bisa mengirim data ke luar.
- Media dan proyekmu tidak disimpan di perangkat (IndexedDB atau localStorage tidak dipakai). Yang disimpan browser hanya salinan berkas aplikasi Klip lewat service worker, supaya bisa dibuka tanpa internet. Media dibaca lewat `blob:` URL yang tidak melewati service worker. Satu-satunya berkas yang ditulis adalah hasil ekspor yang kamu unduh sendiri.

## Pintasan keyboard

| Tombol | Aksi |
|---|---|
| V | Alat Pilih |
| T | Alat Teks |
| C | Alat Crop |
| K | Alat Kecepatan |
| A | Alat Volume |
| F | Alat Efek |
| Q | Potong kiri: buang bagian klip sebelum garis merah |
| W | Belah klip di garis merah |
| E | Potong kanan: buang bagian klip sesudah garis merah |
| Delete / Backspace | Hapus klip terpilih |
| Spasi | Putar / jeda |
| Ctrl/Cmd + Z | Urungkan |
| Ctrl/Cmd + Shift + Z | Ulangi |
| Home / End | Lompat ke awal / akhir |
| ← / → | Geser playhead satu frame (Shift: satu detik) |
| Esc | Tutup popover, kembali ke alat Pilih, atau hapus seleksi |

Untuk klip yang sedang difokus: Enter memilih atau menjalankan alat aktif, panah menggeser klip (di Video 1: menukar urutannya dengan klip di sebelahnya), dan Delete menghapus klip itu. Di pratinjau, panah menggeser klip terpilih 1 piksel (Shift: 10 piksel).

## Struktur

```
src/
  app/        App, bilah atas, pintasan, keadaan tata letak
  state/      store Zustand, riwayat undo/redo, aksi, impor media
  timeline/   model klip, snap, trim, belah (logika murni + tes)
  engine/     compositor kanvas, mesin pratinjau dan audio, thumbnail, probe
  export/     worker encoder, mixer audio, protokol, deteksi dukungan
  ui/         komponen dasar (Button, Tabs, Slider, Dialog, ikon) + galeri /ui
  panels/     MediaBin, Inspector, Stage, Toolbar, Timeline, dialog Ekspor
  styles/     tokens.css, fonts.css, base.css
public/fonts/ Figtree dan IBM Plex Mono (SIL Open Font License)
e2e/          tes Playwright dan pembuat video contoh
```

## Pustaka

- [React 18](https://react.dev), [Zustand](https://zustand.docs.pmnd.rs), [Vite](https://vite.dev)
- [Mediabunny](https://mediabunny.dev) untuk membaca dan menulis kontainer MP4/WebM di atas WebCodecs
- [Vitest](https://vitest.dev) dan [Playwright](https://playwright.dev) untuk pengujian
