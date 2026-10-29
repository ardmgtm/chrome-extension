# New Tab

Extension Manifest V3 sederhana yang mengganti halaman tab baru di Google Chrome dan Brave.

## Fitur

- Baris pertama berisi tile lanskap dengan PNG logo untuk Netflix, Prime Video, YouTube, Spotify, Disney+, dan Google Drive.
- Baris kedua mengambil situs yang sering dikunjungi dari API `topSites` browser, menampilkan favicon, judul, dan alamat situs.
- Jam, tanggal, dan sapaan sesuai waktu setempat. Pencarian web tersedia di kolom pencarian pada area utama.
- Widget cuaca menampilkan suhu, kondisi, serta suhu maksimum/minimum hari ini untuk kota pilihan.
- Cuaca dan jadwal Sholat berhasil disimpan di `chrome.storage.local`, ditampilkan kembali saat offline, dan dicoba muat ulang setiap halaman tab baru dibuka. Ikon info menampilkan waktu terakhir data berhasil disimpan.
- Pencarian Google aktif kembali; tekan `/` untuk memfokuskan kolom pencarian.
- Widget waktu Sholat menampilkan Subuh, Dzuhur, Asar, Maghrib, Isya, hitung mundur ke Sholat berikutnya, dan highlight waktu aktif menggunakan metode 20 Kementerian Agama melalui AlAdhan. Highlight Subuh berakhir saat Sunrise; setelah Sunrise sampai Dzuhur tidak ada waktu yang disorot.
- Navigasi Home/Setting memakai tab mengambang; perpindahan halaman memiliki transisi halus dan tetap mendukung pengaturan reduced motion.
- Pengaturan berada di halaman yang sama (SPA): buka **Setting**, cari kota, pilih hasilnya, atau hapus lokasi tersimpan.
- Dari **Pengaturan**, unggah wallpaper JPG, PNG, atau WebP (maksimal 10 MB). Gambar diperkecil sebelum disimpan di browser; pratinjau dan tombol hapus tersedia untuk kembali ke latar bawaan.
- Footer tetap menempel di bawah tampilan, dan kartu situs yang sering dikunjungi berukuran sama dengan kartu aplikasi.
- Layout responsif dengan rak horizontal; gunakan tombol panah kiri/kanan pada kartu untuk berpindah.
- Kartu situs menggunakan warna dominan favicon saat browser mengizinkan pembacaan warna; jika tidak, gunakan warna deterministik dari nama host.
- Tidak membutuhkan build atau dependensi JavaScript. Pencarian kota dan cuaca memerlukan Open-Meteo; jadwal Sholat memerlukan AlAdhan.

## Instalasi di Chrome

1. Buka `chrome://extensions`.
2. Aktifkan **Developer mode**.
3. Klik **Load unpacked**.
4. Pilih folder extension ini.

## Instalasi di Brave

1. Buka `brave://extensions`.
2. Aktifkan **Developer mode**.
3. Klik **Load unpacked**.
4. Pilih folder extension ini.

Kedua browser menggunakan folder extension yang sama. Jika Momentum atau extension lain sudah mengambil alih New Tab, nonaktifkan fitur pengganti New Tab pada extension tersebut agar extension ini bisa tampil. Hanya satu extension yang dapat mengendalikan halaman New Tab pada satu waktu.

## Izin dan data

Izin `topSites` digunakan untuk menampilkan shortcut situs yang sering dikunjungi, `favicon` untuk memuat ikon situs, dan `storage` untuk menyimpan kota pilihan serta wallpaper di browser lokal. Wallpaper tidak dikirim ke layanan cuaca. Extension meminta akses jaringan ke `geocoding-api.open-meteo.com` untuk pencarian kota, `api.open-meteo.com` untuk prakiraan cuaca, dan `api.aladhan.com` untuk jadwal Sholat metode 20 (Kementerian Agama Republik Indonesia). Koordinat serta tanggal lokal kota pilihan dikirim ke AlAdhan; nama kota yang dicari dan koordinat kota pilihan dikirim ke Open-Meteo. Lokasi perangkat dan riwayat browser tidak diakses. Pencarian web melalui kolom pencarian menggunakan Google. Widget cuaca dan Sholat menampilkan status bila lokasi belum dipilih atau data layanan tidak tersedia.

## Aset PNG aplikasi populer

PNG lokal disimpan di `assets/brands/` agar tidak perlu diunduh saat New Tab dibuka. Sumber dan metadata file:

| Layanan | Sumber | Catatan lisensi/kecocokan |
| --- | --- | --- |
| Netflix | [Netflix Logomark](https://commons.wikimedia.org/wiki/File:Netflix_Logomark.png) | 1800×756, wordmark; Commons menandai public domain untuk hak cipta dan tetap menyatakan merek dagang. |
| Prime Video | [Logo white prime](https://commons.wikimedia.org/wiki/File:Logo_white_prime.png) | 3840×1182, PNG landscape; kontributor menyatakan CC0. |
| Prime Video (putih transparan) | Dibuat dari `primevideo.png` lokal | Aset turunan lokal dengan kanal transparansi dan logo putih untuk tile biru. |
| YouTube | [YouTube Logo 2017](https://commons.wikimedia.org/wiki/File:YouTube_Logo_2017.svg) | PNG 960 px hasil render SVG; wordmark era 2017–2025 (bukan logo terkini); Commons menandai public domain/trademark. |
| Spotify | [Spotify 2013 logo](https://commons.wikimedia.org/wiki/File:Spotify_2013_(logo).png) | 557×183, wordmark lama; Commons menandai public domain/trademark. |
| Disney+ | [Disney+ logo](https://commons.wikimedia.org/wiki/File:Disney%2B_logo.svg) | PNG 960 px hasil render SVG; Commons menandai public domain/trademark. |
| Google Drive | [Google Drive New Logo](https://commons.wikimedia.org/wiki/File:Google_Drive_-_New_Logo.png) | 640×172, wordmark; Commons menandai public domain/trademark. |

Public domain di atas merujuk pada status hak cipta logo teks/geometris menurut halaman Commons; itu **bukan** pelepasan hak merek dagang dan bukan jaminan izin penggunaan untuk semua tujuan. Logo tetap milik masing-masing pemegang merek. Periksa halaman sumber dan panduan merek sebelum distribusi publik atau komersial.