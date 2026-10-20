# e-Muzakki Bahrul Ulum — Backend Apps Script

`Code.gs` ialah satu-satunya pintu masuk ke pangkalan data (Google Sheet).
Sheet **tidak lagi diterbitkan ke web**; portal awam dan dashboard admin kedua-duanya
bercakap dengan Apps Script sahaja.

## Pemasangan (ikut turutan)

1. Buka Google Sheet pangkalan data → **Extensions → Apps Script**, tampal keseluruhan `Code.gs`.
2. **Tetapkan kata laluan admin** (jangan tulis dalam kod):
   *Project Settings (ikon gear) → Script properties → Add script property*
   - Property: `ADMIN_PASSWORD`
   - Value: kata laluan pilihan anda (panjang, bukan perkataan biasa)
3. Pilih fungsi **`ujiAkses`** → **Run** → luluskan kebenaran (Sheet + Drive).
   Semak *Execution log*: semua baris mesti OK dan `ADMIN_PASSWORD: ditetapkan`.
4. **Deploy → Manage deployments → Edit → New version**
   (Execute as: **Me**, Who has access: **Anyone**). URL `/exec` kekal sama.
5. **Matikan Publish to web** pada Sheet:
   *File → Share → Publish to web → Stop publishing*.
   Pastikan juga *Share* Sheet hanya untuk akaun yang perlu (bukan "Anyone with the link").
6. Pastikan `E1` pada tab PAYMENT_RECORDS ialah `RESIT`.

> Selepas langkah 5, pautan CSV lama (`.../pub?output=csv`) berhenti berfungsi.
> Ia memang sepatutnya begitu.

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
| PAYER_LIST | `1211671427` | A `ID` \| B `STATUS` \| lajur lain dibenarkan (tidak didedahkan kepada awam) |
| PAYMENT_RECORDS | `1163321599` | A `ID` \| B `TAHUN` \| C `JUMLAH` \| D `TARIKH_BAYAR` \| E `RESIT` |

## Resit (PDF & imej)

Folder Drive resit: `11-lP9VFrSqrYZlxtUfvp5KKzdWpA2I4B` (`FOLDER_RESIT_ID`).

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
