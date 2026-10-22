# e-Muzakki Bahrul Ulum — Backend Apps Script

`Code.gs` ialah satu-satunya pintu masuk ke pangkalan data (Google Sheet).
Sheet **tidak lagi diterbitkan ke web**; portal awam dan dashboard admin kedua-duanya
bercakap dengan Apps Script sahaja.

## Setup client baharu (guna akaun Google CLIENT)

Sheet, skrip dan folder resit mesti dimiliki akaun client. "Execute as: Me" bermakna
folder Drive dicipta dalam akaun orang yang melakukan **Deploy**.

**Cara paling mudah:** sediakan satu Sheet templat (kosong, dengan `Code.gs` dalam Apps Script).
Client buka pautan templat → **File → Make a copy**. Salinan membawa skrip sekali, tetapi
**Script properties tidak disalin**, jadi kata laluan dan ID folder tidak bocor ke client lain.

Langkah pada akaun client:

1. Muat semula Sheet. Menu baharu **e-Muzakki** muncul.
2. **e-Muzakki → 1. Setup Sistem**. Luluskan kebenaran (Sheet + Drive) pada kali pertama.
   - Cipta tab `PAYER_LIST` dan `PAYMENT_RECORDS` berserta header, format lajur, baris beku.
   - Cipta folder **"Resit Zakat - (nama Sheet)"** dalam Drive client.
   - Uji sama ada Drive boleh berkongsi pautan (dasar Google Workspace kadang-kadang menyekat).
   - Selamat dijalankan berulang kali. Data sedia ada tidak diubah atau dipadam.
3. **e-Muzakki → 2. Tetapkan Kata Laluan Admin** (minimum 10 aksara).
4. Masukkan senarai Muzakki dalam tab `PAYER_LIST` (lajur `ID` dan `STATUS`: `Active` atau `Inactive`).
5. **Deploy → New deployment → Web app**: Execute as **Me**, Who has access **Anyone**.
   Salin URL `/exec`. (**e-Muzakki → Semak Konfigurasi** turut memaparkan URL ini.)
6. Letak URL `/exec` pada `index.html` dan `admin/index.html` client (cari `URL_APPSCRIPT_WEBAPP`).
7. Jangan aktifkan *Publish to web* pada Sheet.

Menu lain:

| Menu | Fungsi |
|---|---|
| Guna Folder Resit Sedia Ada | Tampal pautan/ID folder Drive yang client sudah ada (bukan cipta baharu) |
| Semak Konfigurasi | Baca sahaja: semak tab, header, folder, kata laluan, URL Web App |

Dari editor Apps Script, `setupSistem()` dan `ujiAkses()` melakukan perkara yang sama dan menulis ke log.

### Apa yang automatik dan apa yang manual

| Perkara | Status |
|---|---|
| Tab + header + format Sheet | Automatik (Setup Sistem) |
| Folder resit dalam Drive client | Automatik, atau guna folder sedia ada |
| Semakan perkongsian pautan | Automatik (amaran jika disekat) |
| Kata laluan admin | Menu (client taip sendiri) |
| Deploy Web App | **Manual** (Apps Script tidak boleh deploy dirinya sendiri) |
| URL `/exec` dalam `index.html` dan `admin/index.html` | **Manual** per client |
| Laman web (GitHub / hos) dan `cms/config.yml` (`repo:`) | **Manual** per client |
| Senarai Muzakki dalam `PAYER_LIST` | **Manual** (dashboard admin tidak menambah Muzakki baharu) |

### Sistem sedia ada yang dikemas kini kepada versi ini

Tiada tindakan wajib untuk tab: kod mencari `PAYER_LIST` dan `PAYMENT_RECORDS` ikut nama.
**Tetapi ID folder resit tidak lagi tertanam dalam kod.** Selepas tampal kod baharu, jalankan
**e-Muzakki → Guna Folder Resit Sedia Ada** dan tampal folder lama, jika tidak muat naik resit
akan gagal dengan mesej "Folder resit belum disediakan". Jalankan juga **Setup Sistem** sekali
supaya E1 = `RESIT` dan GID tab disimpan.

## Apa yang boleh diakses siapa

| Pemanggil | Endpoint | Data yang dipulangkan |
|---|---|---|
| Awam | `GET ?action=stats` | Jumlah Muzakki + jumlah kutipan setahun (agregat) |
| Awam | `GET ?action=lookup&id=ID` | Status + rekod bayaran **satu** Muzakki sahaja |
| Admin | `POST login` / `adminData` / `updateStatus` / `addRecord` / `updateResit` | Semua data. **Wajib** `auth` = `ADMIN_PASSWORD` |

Langkah keselamatan dalam kod:

- Semua tindakan tulis dan baca-penuh hanya melalui `POST` dengan kata laluan admin.
- Kata laluan salah 5 kali → dikunci 15 minit (dikongsi semua pengguna).
- Carian awam hanya pulang medan `ID` dan `STATUS`. Lajur lain pada PAYER_LIST (cth nama, telefon)
  **tidak pernah** dihantar ke portal awam.
- Carian ID yang tidak wujud melebihi 40 kali / 10 minit disekat sementara (halang tekaan ID).
- Statistik awam di-cache 5 minit dan dikosongkan setiap kali admin menulis.

## Struktur tab

| Tab | GID | Lajur |
|---|---|---|
| PAYER_LIST | auto | A `ID` \| B `STATUS` \| lajur lain dibenarkan (tidak didedahkan kepada awam) |
| PAYMENT_RECORDS | auto | A `ID` \| B `TAHUN` \| C `JUMLAH` \| D `TARIKH_BAYAR` \| E `RESIT` |

Kedudukan lajur penting (sistem menulis ikut kedudukan). Setup Sistem tidak menimpa header yang
sudah ada, tetapi memberi amaran jika tidak sepadan.

## Resit (PDF & imej)

Folder Drive resit disimpan dalam Script property `FOLDER_RESIT_ID` (dicipta oleh Setup Sistem atau ditetapkan melalui menu).

Admin muat naik fail (PDF/JPG/PNG, maks 8MB) atau tampal pautan Drive. Apps Script simpan fail
ke folder, kongsi sebagai *Anyone with the link → Viewer*, dan tulis pautan ke lajur E.

| Jenis | Disimpan sebagai | Dipapar dengan |
|---|---|---|
| JPG / PNG / WEBP | `https://lh3.googleusercontent.com/d/FILEID` | `<img>` |
| PDF | `https://drive.google.com/file/d/FILEID/preview` | `<iframe>` pratonton Drive |

## Kata laluan admin

- Disimpan dalam Script properties sahaja, tidak pernah dalam repo.
- Halaman admin menyimpannya dalam `sessionStorage` (tab semasa sahaja); **Log Keluar** atau tutup tab memadamnya.
- Untuk tukar kata laluan: ubah nilai `ADMIN_PASSWORD`. Tidak perlu deploy semula.
- Jika terkunci (terlalu banyak percubaan salah), tunggu 15 minit.

Hotline rujukan percanggahan rekod: **011-55335082**
