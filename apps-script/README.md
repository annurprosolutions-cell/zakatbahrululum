# e-Muzakki Bahrul Ulum — Backend Apps Script

Fail `Code.gs` adalah backend tunggal untuk portal awam (`index.html`) dan
dashboard admin (`admin/index.html`).

## Langkah pemasangan

1. Buka Google Sheet pangkalan data > **Extensions > Apps Script**.
2. Tampal keseluruhan kandungan `Code.gs` (ganti kod lama).
3. **Deploy > New deployment > Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Copy URL yang berakhir dengan `/exec`.
5. Tampal URL tersebut pada `URL_APPSCRIPT_WEBAPP` di `admin/index.html`.
   (Portal awam tidak perlu URL ini — ia baca CSV sahaja.)

> Setiap kali `Code.gs` diubah, deploy versi baharu
> (**Deploy > Manage deployments > Edit > New version**) barulah perubahan
> berkesan pada URL yang sama.

## Struktur tab Google Sheet

| Tab | GID | Lajur |
|---|---|---|
| PAYER_LIST | `1211671427` | A `ID` \| B `STATUS` |
| PAYMENT_RECORDS | `1163321599` | A `ID` \| B `TAHUN` \| C `JUMLAH` \| D `TARIKH_BAYAR` \| **E `RESIT`** |

**Langkah sekali sahaja:** taip `RESIT` pada sel **E1** tab PAYMENT_RECORDS.
Tanpa header ini, portal awam tidak dapat membaca pautan resit.

## Senarai `action` yang disokong

| Action | Fungsi |
|---|---|
| `updateStatus` | Kemaskini status Muzakki (Active/Inactive) |
| `addRecord` | Tambah rekod pembayaran; resit melalui pautan atau muat naik fail (pilihan) |
| `updateResit` | Tukar, muat naik, atau buang resit pada rekod sedia ada |

## Resit (PDF & imej)

Folder Drive resit: `11-lP9VFrSqrYZlxtUfvp5KKzdWpA2I4B`
(dikonfigurasi pada `FOLDER_RESIT_ID` dalam `Code.gs`).

Admin ada dua cara memasukkan resit:

1. **Muat naik fail** (disyorkan) — pilih PDF/JPG/PNG (maks 8MB) dalam borang.
   Apps Script simpan ke folder di atas, set perkongsian **Anyone with the link
   → Viewer**, dan tulis pautan ke lajur E secara automatik.
2. **Tampal pautan Drive** — jenis fail dikesan sendiri.

Format yang disimpan pada lajur `RESIT`:

| Jenis fail | Disimpan sebagai | Dipapar dengan |
|---|---|---|
| JPG / PNG / WEBP | `https://lh3.googleusercontent.com/d/FILEID` | `<img>` |
| PDF | `https://drive.google.com/file/d/FILEID/preview` | `<iframe>` pratonton Drive |

Pautan Drive mentah yang ditaip terus dalam sheet (cth `.../view?usp=sharing`)
turut dikenali dan dipapar sebagai pratonton PDF.

Dalam popup, Muzakki boleh lihat resit terus atas skrin dan tekan **Muat Turun**
(PDF dimuat turun melalui pautan `uc?export=download`, tanpa tab baharu).

**Syarat:** fail mesti dikongsi sebagai *Anyone with the link*. Fail yang
dimuat naik melalui sistem dikongsi automatik; fail yang diletak manual dalam
folder perlu diset sendiri (atau kongsi seluruh folder).

**Kebenaran Drive:** selepas tampal kod baharu, pilih fungsi `ujiAkses`
dalam editor Apps Script, tekan **Run**, dan luluskan kebenaran Drive sekali.
Kemudian deploy versi baharu.

## Aliran kerja

```
Admin > Pengurusan Muzakki > cari ID
        ↓
Tambah Rekod Baru (tahun, jumlah, tarikh, pautan atau fail resit)
   atau  klik "Tukar" / "+ Tambah Resit" pada rekod sedia ada
        ↓
PAYMENT_RECORDS lajur E dikemaskini
        ↓
Muzakki buat semakan > klik butang "Resit" pada rekod
        ↓
Resit terpapar dalam popup atas skrin + butang Muat Turun
```

Hotline rujukan percanggahan rekod: **011-55335082**
