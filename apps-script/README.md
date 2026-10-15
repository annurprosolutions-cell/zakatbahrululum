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
| `addRecord` | Tambah rekod pembayaran berserta pautan resit (pilihan) |
| `updateResit` | Tukar atau buang pautan resit pada rekod sedia ada |

## Pautan resit

Admin hanya perlu **tampal link perkongsian Google Drive** seperti biasa.
Sistem menukarnya sendiri kepada pautan imej terus:

```
https://drive.google.com/file/d/FILEID/view?usp=sharing
https://drive.google.com/open?id=FILEID
https://drive.google.com/uc?export=view&id=FILEID
            ↓  semuanya jadi
https://lh3.googleusercontent.com/d/FILEID
```

Format `lh3` digunakan kerana ia boleh dipaparkan terus sebagai `<img>`
dalam popup, tanpa membuka tab pelayar baharu.

**Syarat:** fail di Google Drive mesti dikongsi sebagai
**Anyone with the link → Viewer**. Jika tidak, resit akan gagal dipaparkan.

**Format fail:** gunakan imej (JPG / PNG). Fail PDF tidak dapat dipaparkan
melalui `lh3` — tukar kepada imej dahulu, atau simpan resit sebagai
screenshot.

## Aliran kerja

```
Admin > Pengurusan Muzakki > cari ID
        ↓
Tambah Rekod Baru (tahun, jumlah, tarikh, pautan resit)
   atau  klik "Tukar" / "+ Tambah Resit" pada rekod sedia ada
        ↓
PAYMENT_RECORDS lajur E dikemaskini
        ↓
Muzakki buat semakan > klik butang "Resit" pada rekod
        ↓
Resit terpapar dalam popup atas skrin + butang Muat Turun
```

Hotline rujukan percanggahan rekod: **011-55335082**
