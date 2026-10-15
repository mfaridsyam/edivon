# Klip

Editor video yang berjalan sepenuhnya di browser. Tidak ada server dan tidak ada unggahan: video dibaca, dipratinjau, dan diekspor di perangkatmu sendiri. Hasil build berupa situs statis yang bisa dihosting di Vercel.

## Fitur

- Impor video, audio, dan gambar lewat seret-lepas atau tombol **Pilih berkas**. Durasi, dimensi, dan thumbnail dibaca di browser.
- Timeline dengan lajur Teks, Video 2, Video 1, dan Audio 1. Kamu bisa menambah lajur video, audio, teks, atau efek. Klip bisa digeser antarlajur, menempel ke klip lain dan playhead, di-trim dari tepi, dibelah, dan dihapus. Ada juga zoom timeline.
- Alat: Pilih, Belah, Potong, Teks, Crop, Kecepatan, Volume, Efek, dan Hapus.
- Properti klip: skala, posisi, rotasi, opasitas, kecepatan (0,5× sampai 4×), kecerahan, kontras, saturasi, volume, dan tombol **Setel ulang**.
- Klip video, gambar, dan teks bisa dipilih langsung di pratinjau. Seret untuk memindahkannya (menempel ke garis tengah), atau tarik sudutnya untuk mengubah skala.
- Pratinjau dengan rasio 16:9, 9:16, atau 1:1, plus timecode dan layar penuh.
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

## Batasan browser

- **Ekspor butuh WebCodecs** (`VideoEncoder` dan `AudioEncoder`). Gunakan Chrome atau Edge versi terbaru di desktop. Kalau browser tidak mendukung, Klip menampilkan pesan dan pratinjau tetap bisa dipakai.
- Pilihan format dan resolusi di dialog ekspor mengikuti kemampuan encoder browser. Contohnya, 4K atau MP4 bisa tidak tersedia, dan WebM dipakai sebagai cadangan.
- Perkiraan ukuran di dialog ekspor dihitung dari bitrate encoder. Untuk video yang banyak bergerak, selisihnya dengan hasil biasanya di bawah 15%. Rekaman layar atau video yang banyak diam hasilnya bisa jauh lebih kecil.
- Ada berkas yang bisa diputar browser tetapi codec-nya tidak bisa didekode WebCodecs. Kartunya diberi keterangan "Belum bisa diekspor di browser ini".
- Video H.265 (HEVC), yang umum dipakai kamera CCTV/DVR, butuh dekoder HEVC hardware. Di Windows, pakai Chrome atau Brave. Edge baru bisa setelah ekstensi HEVC Video Extensions dari Microsoft Store dipasang.
- Banyak rekaman CCTV menyimpan parameter codec HEVC yang rusak. Klip tetap membacanya lewat dekoder toleran: parameter diperbaiki atau stream diubah ke Annex B. Karena `<video>` tidak bisa di-seek akurat untuk berkas seperti ini, gambar pratinjaunya juga didekode lewat WebCodecs supaya sama persis dengan hasil ekspor. Berkas sangat besar dengan indeks di akhir berkas butuh beberapa detik untuk tampil pertama kali.
- Hasil ekspor disimpan di memori sampai diunduh. Video 4K yang panjang bisa memakan banyak memori.
- Perubahan kecepatan juga mengubah pitch suara, baik di pratinjau maupun hasil ekspor.
- Proyek tidak disimpan otomatis. Menutup atau memuat ulang tab akan menghapus timeline dan media yang sudah diimpor.
- Belum tersedia: transisi, keyframe, multi-kamera, kolaborasi, dan akun.

## Privasi

- Berkas tidak pernah dikirim ke server. Video, audio, dan gambar hanya ada di memori tab sebagai `File`/`Blob` dan object URL (`blob:`).
- Tidak ada backend, API, analytics, cookie, atau skrip pihak ketiga. Font, ikon, dan pustaka di-self-host atau di-bundle.
- Build produksi memasang Content Security Policy yang hanya mengizinkan skrip, font, dan koneksi dari origin sendiri. Akibatnya, kode Klip juga tidak bisa mengirim data ke luar.
- Tidak ada yang disimpan di perangkat (IndexedDB atau localStorage tidak dipakai). Satu-satunya berkas yang ditulis adalah hasil ekspor yang kamu unduh sendiri.

## Pintasan keyboard

| Tombol | Aksi |
|---|---|
| V | Alat Pilih |
| S | Alat Belah |
| P | Alat Potong (trim) |
| T | Alat Teks |
| C | Alat Crop |
| K | Alat Kecepatan |
| A | Alat Volume |
| E | Alat Efek |
| Delete / Backspace | Hapus klip terpilih |
| Spasi | Putar / jeda |
| Ctrl/Cmd + Z | Urungkan |
| Ctrl/Cmd + Shift + Z | Ulangi |
| Home / End | Lompat ke awal / akhir |
| ← / → | Geser playhead satu frame (Shift: satu detik) |
| Esc | Tutup popover, kembali ke alat Pilih, atau hapus seleksi |

Untuk klip yang sedang difokus: Enter memilih atau menjalankan alat aktif, panah menggeser klip (dengan alat Potong, panah mengubah tepi kanan dan Alt + panah mengubah tepi kiri), dan Delete menghapus klip itu. Di pratinjau, panah menggeser klip terpilih 1 piksel (Shift: 10 piksel).

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
