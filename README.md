# Bahan Ajar SIG — Kota Bandung

Halaman `/` langsung membuka peta interaktif Bandung. Tiga layer menampilkan batas administrasi, raster penduduk, dan titik sarana kesehatan. Card kiri memuat kontrol layer serta pengaturan analisis; hasil dan grafik tampil di Card kanan. Berkas asli tetap dapat dibaca melalui API, tanpa menu unduhan pada panel.

## Menjalankan

Gunakan Node.js 24 dan jalankan `npm install`.

Sediakan `DATABASE_URL` Neon pada `.env.development.local` untuk pengembangan. Jangan memasukkan kredensial ke Git atau menggunakan awalan `NEXT_PUBLIC_`. Untuk produksi, atur `DATABASE_URL` di lingkungan hosting.

```sh
npm run db:import
npm run dev
```

Buka http://localhost:3000. Build produksi: `npm run build`, kemudian `npm start`.

## Data Neon

`npm run db:import` membaca kelima berkas dari `Materi/Materi/Bahan`, mengaktifkan PostGIS, dan menyimpan file asli sebagai `bytea` pada tabel `bahan_ajar_materials`. GeoJSON untuk peta disimpan terpisah sebagai `jsonb` dalam EPSG:4326; data UTM EPSG:32748 dikonversi dengan PostGIS. Raster TIFF EPSG:4326 dibaca dari Neon dengan GeoTIFF.js, diberi warna berdasarkan jumlah penduduk per piksel, lalu ditampilkan sebagai canvas MapLibre di bawah batas dan titik. Piksel NoData transparan, skala warna mengikuti rentang data. Uji raster: `npm run test:raster`.

Impor dapat diulang: file dengan nama yang sama diperbarui dalam satu transaksi. Skrip memverifikasi hash SHA-256 file yang tersimpan, jumlah fitur, dan rentang koordinat Bandung. Folder `Hasil` tidak diimpor.

`GET /api/materials/[filename]` menyediakan GeoJSON peta. Tambahkan `?download=1` untuk mengambil berkas asli. Hanya lima nama bahan yang diizinkan. Bahan ini dapat dibaca publik melalui aplikasi; kredensial dan operasi tulis tetap di server/skrip impor.

Peta dasar memakai tile OpenStreetMap dan memerlukan koneksi internet serta browser dengan WebGL.

## Analisis buffer dan isochrone

Panel analisis di bawah kontrol layer mendukung semua 57 titik atau satu fasilitas. Fasilitas juga dapat dipilih dengan mengeklik titik di peta; karena data asli tidak memuat nama, pilihan ditandai sebagai Titik 01–57.

Buffer tersedia pada 500 m, 800 m, 1,5 km, 3 km, atau custom 1–50.000 m. Endpoint `POST /api/analysis/buffer` menghitung buffer dalam UTM EPSG:32748 di PostGIS dan menggabungkan area yang tumpang tindih. Hasil biru ditampilkan di atas raster dan di bawah batas administrasi serta titik.

Isochrone tersedia pada 5, 10, 15, 30, 45 menit, atau custom 1–120 menit, dengan moda jalan kaki, mobil, dan sepeda. Hasil ungu mengikuti jaringan jalan melalui Valhalla, bukan perkiraan lingkaran berdasarkan kecepatan.

Konfigurasikan `VALHALLA_URL` pada server. Pengembangan lokal telah menggunakan `https://valhalla1.openstreetmap.de` atas izin pengguna untuk mengirim koordinat fasilitas ke layanan tersebut. Untuk produksi, atur variabel ini di hosting atau gunakan server Valhalla sendiri. Server demo publik menerapkan fair use dan dapat membatasi permintaan; jangan memperlakukannya sebagai layanan dengan jaminan ketersediaan.

Endpoint `POST /api/analysis/isochrone` memproses satu titik per permintaan dengan batas waktu 25 detik. Pilihan semua titik berjalan berurutan dengan jeda minimal 1,1 detik, menampilkan progres, dan dapat dibatalkan. Hasil sementara dibersihkan jika proses gagal atau dibatalkan. Mengganti titik menghapus hasil sebelumnya. Tombol Hapus analisis menghapus kedua hasil tanpa mengubah data Neon.

Kedua endpoint menerima JSON `{ "pointId": "all" | 0, "value": 500, "mode": "pedestrian" | "auto" | "bicycle" }`. `value` adalah meter untuk buffer dan menit untuk isochrone; isochrone hanya menerima indeks titik, dan aplikasi mengatur pemrosesan semua titik. Uji validasi: `npm run test:analysis`.

## Overlay penduduk

Setiap analisis yang selesai menampilkan jumlah penduduk termasuk, tidak termasuk, total raster, dan persentase cakupan. Hasil buffer dan isochrone ditampilkan terpisah, dengan parameter analisisnya, dan tetap terlihat saat pengaturannya dilipat.

Hitungan menggunakan nilai asli raster dari Neon, bukan warna gambar. Setiap piksel valid diwakili pusatnya; jika pusat berada di dalam atau pada batas setidaknya satu poligon hasil, seluruh nilai penduduk piksel tersebut termasuk. Lubang poligon diperhitungkan. Area yang tumpang tindih tidak menggandakan hitungan. NoData dan nilai negatif tidak dihitung.

Angka ini estimasi pada resolusi sekitar 100 m, tanpa pembobotan luas untuk piksel yang terpotong batas. Total hanya mencakup piksel valid dalam raster yang tersedia, bukan wilayah di luar cakupan raster. Nilai pecahan dijumlahkan sebelum dibulatkan; jumlah tidak termasuk dihitung dari selisih total dan termasuk agar angka tampilan konsisten. Menyembunyikan layer raster tidak mengubah hitungan. Pembatalan, kegagalan, penggantian titik, dan Hapus analisis membersihkan ringkasan terkait agar tidak menampilkan hasil parsial sebagai hasil akhir.

Uji perhitungan overlay, pusat piksel, NoData, lubang poligon, dan area tumpang tindih: `npm run test:raster`.

## Dua metode analisis

Pilihan ISO 37120:2018 mempertahankan analisis cakupan proyek: buffer atau isochrone, jumlah penduduk terlayani/tidak terlayani, serta grafik persentase. Penyebut kedua persentase adalah total penduduk pada raster valid; bukan rasio tidak terlayani dibagi terlayani. Nama pilihan mengikuti acuan proyek dan tidak menyatakan pemeriksaan kepatuhan seluruh indikator ISO 37120:2018.

Pilihan SNI 03-1733-2004 menggunakan dua pasangan dari [Tabel 12, halaman 29 dokumen / halaman 35 PDF](https://pupr.payakumbuhkota.go.id/wp-content/uploads/2020/09/Tata-Cara-Perencanaan-Lingkungan-Perumahan-di-Perkotaan-_-SNI-03-1733-2004.pdf#page=35), sesuai ruang lingkup yang diminta:

| Radius buffer | Asumsi jenis sarana | Penduduk pendukung per unit |
| --- | --- | --- |
| 1.500 m | Puskesmas Pembantu dan Balai Pengobatan Lingkungan | 30.000 jiwa |
| 3.000 m | Puskesmas dan Balai Pengobatan | 120.000 jiwa |

Pada SNI, isochrone dan radius lain tidak tersedia. `POST /api/analysis/sni` menerima `{ "pointId": "all" | 0, "radius": 1500 | 3000 }`, memvalidasi radius di server, dan mengembalikan satu buffer per titik (bukan gabungan buffer). Pada pilihan satu titik, seluruh penduduk dengan pusat piksel di dalam buffer dihitung seperti overlay sebelumnya. Ini merupakan potensi penduduk dalam radius tanpa pembagian beban ke fasilitas lain.

Data fasilitas belum berjenis spesifik. Karena itu, setiap titik diasumsikan satu unit sarana dengan jenis yang mengikuti radius pilihan. Analisis membandingkan penduduk dalam radius dengan acuan per unit: jika lebih besar, ditandai overcapacity; sama dengan acuan belum dianggap melebihi. Kebutuhan unit adalah `ceil(penduduk / penduduk pendukung per unit)`. Tambahan unit adalah `max(0, kebutuhan - 1)`. Acuan SNI ini dipakai sebagai skenario kebutuhan sarana, bukan ukuran kapasitas operasional medis atau jumlah kunjungan.

Untuk semua titik, setiap pusat piksel diproyeksikan ke UTM EPSG:32748, lalu dialokasikan tepat sekali ke fasilitas terdekat dalam radius. Jarak yang sama diputuskan dengan ID terkecil agar urutan input tidak mengubah hasil. Piksel di luar jangkauan semua fasilitas dihitung sebagai tidak terjangkau. NoData dan nilai penduduk negatif diabaikan. Tidak ada pemindahan penduduk karena fasilitas penuh; status kapasitas baru dievaluasi setelah alokasi selesai.

Hasil semua titik menampilkan penduduk alokasi, persentase beban, status dan estimasi tambahan unit per fasilitas. Ringkasan memuat teralokasi, tidak terjangkau dan total raster. Nilai pecahan dijumlahkan lebih dulu; pembulatan metode sisa terbesar memastikan jumlah alokasi seluruh fasilitas + tidak terjangkau = total raster pada angka tampilan. Sisa pecahan yang sama dibedakan dengan ID, dengan toleransi 1e-9 untuk galat bilangan pecahan. Status kapasitas dan kebutuhan unit dihitung dari nilai sebelum pembulatan.

Peta menandai garis radius fasilitas yang melebihi acuan dengan merah dan yang masih dalam acuan dengan hijau. Untuk semua titik, isian lingkaran dinonaktifkan agar tumpang tindih tidak terbaca sebagai wilayah alokasi; garis tetap menggambarkan radius, bukan batas Voronoi. Alokasi dihitung langsung per piksel tanpa membangun poligon Voronoi. Tambahan unit masih merupakan indikasi per fasilitas, bukan optimasi penempatan fasilitas baru maupun alokasi dengan pemindahan beban ke kapasitas tersisa. Pergantian metode, radius SNI, atau titik membersihkan hasil sebelumnya. Pilihan metode dan radius SNI dipertahankan saat mengganti titik.

Uji pasangan radius, batas kapasitas, pembulatan kebutuhan unit, input tidak valid, alokasi terdekat, tumpang tindih, tie-break ID, konservasi jumlah, dan piksel tidak terjangkau: `npm run test:analysis`.
