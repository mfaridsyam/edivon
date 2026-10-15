# Klip

Editor video yang berjalan sepenuhnya di browser. Tidak ada server dan tidak ada unggahan: video dibaca, dipratinjau, dan diekspor di perangkatmu sendiri. Hasil build berupa situs statis yang bisa dihosting di Vercel.

## Fitur

- Impor video, audio, dan gambar lewat seret-lepas atau tombol **Pilih berkas**. Durasi, dimensi, dan thumbnail dibaca di browser.
- Tempel link YouTube, pilih **MP4** atau **MP3**, lalu unduh. Hasilnya masuk ke panel Media/Audio dan bisa diseret ke timeline seperti berkas biasa. Fitur ini butuh helper lokal (lihat [Video dari YouTube](#video-dari-youtube)).
- Timeline dengan lajur Teks, Video 2, Video 1, dan Audio 1. Kamu bisa menambah lajur video, audio, teks, atau efek. Klip bisa digeser antarlajur, menempel ke klip lain dan playhead, di-trim dari tepi, dibelah, dan dihapus. Ada juga zoom timeline.
- Alat: Pilih, Belah, Potong, Teks, Crop, Kecepatan, Volume, Efek, dan Hapus.
- Properti klip: skala, posisi, rotasi, opasitas, kecepatan (0,5× sampai 4×), kecerahan, kontras, saturasi, volume, dan tombol **Setel ulang**.
- Pratinjau dengan rasio 16:9, 9:16, atau 1:1, plus timecode dan layar penuh.
- Ekspor ke MP4 (H.264 + AAC) atau WebM (VP9 + Opus) dalam 720p, 1080p, atau 4K bila browser mendukung. Progres dan estimasi sisa waktu ditampilkan, dan ekspor bisa dibatalkan.
- Undo/redo dan pintasan keyboard untuk semua alat.

## Menjalankan di komputer sendiri

Butuh Node.js 22.12 atau lebih baru.

```bash
npm install
npm run dev        # server pengembangan di http://localhost:5173
npm run build      # build statis ke dist/
npm run preview    # menyajikan dist/ secara lokal
npm run yt         # helper YouTube lokal (opsional, lihat di bawah)
```

Halaman internal komponen tersedia di `/ui/`.

### Pengujian

```bash
npm run test       # Vitest: logika timeline (model, snap, belah, trim, undo/redo), link YouTube, keluaran yt-dlp

npx playwright install chromium   # sekali saja
npm run test:e2e   # Playwright: impor dua berkas, belah, urutkan, ekspor; unduh dari YouTube (helper ditiru)
```

Video contoh untuk tes end-to-end dibuat otomatis di browser pada saat tes dan disimpan di `e2e/.fixtures/` (diabaikan git). Tidak ada berkas media di repo.

## Video dari YouTube

Browser tidak bisa mengambil video dari YouTube sendiri. Karena itu Klip memakai helper kecil, [`tools/yt-helper.mjs`](tools/yt-helper.mjs), yang berjalan di komputermu dan memanggil [yt-dlp](https://github.com/yt-dlp/yt-dlp). Helper hanya mendengarkan di `127.0.0.1:7878`, dan hanya melayani Klip.

### Persiapan (sekali saja)

```bash
winget install yt-dlp.yt-dlp      # ikut memasang FFmpeg dan Deno
```

Setelah itu buka terminal baru supaya `PATH` terbarui. Di macOS/Linux, pasang `yt-dlp` dan `ffmpeg` lewat package manager masing-masing. yt-dlp minimal versi 2025.11.12. Node yang menjalankan helper dipakai sebagai JavaScript runtime untuk YouTube.

### Pemakaian

1. Di folder proyek, jalankan `npm run yt` dan biarkan terminalnya terbuka.
2. Di Klip, tempel link YouTube di bagian **Dari YouTube** pada tab Media atau Audio. Judul, channel, dan durasi akan tampil.
3. Pilih **MP4** (video + suara) atau **MP3** (suara saja), lalu klik **Unduh**.
4. Setelah selesai, hasilnya muncul sebagai kartu media. Seret ke timeline atau klik dua kali.

Saat Klip versi online (mis. `edivon.vercel.app`) menghubungi helper untuk pertama kali, Chrome/Brave akan meminta izin mengakses perangkat di jaringan lokal. Pilih **Izinkan**.

### Catatan

- MP4 memakai H.264 + AAC dengan resolusi sampai 1080p, supaya mudah didekode browser dan hemat memori. MP3 memakai kualitas terbaik.
- Hanya satu video yang diunduh. Parameter `list=` dan `si=` diabaikan. Link playlist, channel, dan siaran langsung ditolak.
- Berkas hasil disimpan sementara di folder temp sistem, lalu dihapus begitu sudah diambil Klip atau dibatalkan.
- Kalau YouTube berubah dan unduhan mulai gagal, perbarui yt-dlp dengan `winget upgrade yt-dlp.yt-dlp` (atau `yt-dlp -U`).
- Variabel lingkungan opsional:
  - `YTDLP` untuk lokasi yt-dlp.
  - `FFMPEG` untuk lokasi ffmpeg atau foldernya.
  - `KLIP_ORIGINS` untuk domain Klip lain yang boleh memakai helper, dipisah koma. Bawaannya `https://edivon.vercel.app` dan localhost.
- Ketentuan YouTube melarang mengunduh video tanpa izin, dan sebagian besar video dilindungi hak cipta. Pakai fitur ini untuk video milikmu sendiri, video berlisensi bebas, atau keperluan pribadi. Video hasil suntingan dari konten orang lain kemungkinan besar kena klaim kalau diunggah ulang.

## Deploy ke Vercel

1. Push repo ini ke GitHub, GitLab, atau Bitbucket.
2. Di Vercel, pilih **Add New → Project**, lalu impor repo tersebut.
3. Framework preset: **Vite** (biasanya terdeteksi otomatis). Perintah build dan folder keluaran sudah diatur di `vercel.json` (`npm run build` → `dist`).
4. Klik **Deploy**. Tidak ada variabel lingkungan yang perlu diisi.

Setiap push ke branch utama akan memicu deploy baru.

## Batasan browser

- **Ekspor butuh WebCodecs** (`VideoEncoder` dan `AudioEncoder`). Gunakan Chrome atau Edge versi terbaru di desktop. Kalau browser tidak mendukung, Klip menampilkan pesan dan pratinjau tetap bisa dipakai.
- Pilihan format dan resolusi di dialog ekspor mengikuti kemampuan encoder browser. Contohnya, 4K atau MP4 bisa tidak tersedia, dan WebM dipakai sebagai cadangan.
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
- Fitur YouTube memakai helper yang berjalan di komputermu sendiri (`127.0.0.1:7878`), bukan server. Klip baru menghubunginya setelah kamu menempel link. Yang dikirim hanya ID video dan format yang dipilih. Thumbnail pratinjau diambil langsung dari `i.ytimg.com`.
- Build produksi memasang Content Security Policy yang hanya mengizinkan skrip, font, dan koneksi dari origin sendiri, ditambah helper lokal dan thumbnail YouTube tadi. Akibatnya, kode Klip tidak bisa mengirim data ke tempat lain.
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

Untuk klip yang sedang difokus: Enter memilih atau menjalankan alat aktif, panah menggeser klip (dengan alat Potong, panah mengubah tepi kanan dan Alt + panah mengubah tepi kiri), dan Delete menghapus klip itu.

## Struktur

```
src/
  app/        App, bilah atas, pintasan, keadaan tata letak
  state/      store Zustand, riwayat undo/redo, aksi, impor media, unduhan YouTube
  timeline/   model klip, snap, trim, belah (logika murni + tes)
  engine/     compositor kanvas, mesin pratinjau dan audio, thumbnail, probe
  export/     worker encoder, mixer audio, protokol, deteksi dukungan
  ui/         komponen dasar (Button, Tabs, Slider, Dialog, ikon) + galeri /ui
  panels/     MediaBin, Inspector, Stage, Toolbar, Timeline, dialog Ekspor
  styles/     tokens.css, fonts.css, base.css
public/fonts/ Figtree dan IBM Plex Mono (SIL Open Font License)
e2e/          tes Playwright dan pembuat video contoh
tools/        helper YouTube lokal (yt-dlp), dijalankan dengan npm run yt
```

## Pustaka

- [React 18](https://react.dev), [Zustand](https://zustand.docs.pmnd.rs), [Vite](https://vite.dev)
- [Mediabunny](https://mediabunny.dev) untuk membaca dan menulis kontainer MP4/WebM di atas WebCodecs
- [Vitest](https://vitest.dev) dan [Playwright](https://playwright.dev) untuk pengujian
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) dan [FFmpeg](https://ffmpeg.org), dipanggil helper YouTube di komputermu (tidak di-bundle)
