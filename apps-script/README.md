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
5. Tampal URL tersebut pada `URL_APPSCRIPT_WEBAPP` di **kedua-dua** fail:
   - `index.html` (bahagian `<script>`, berhampiran `BASE_URL`)
   - `admin/index.html`
6. Buka portal sekali — tab `RESIT_MANUAL` akan dicipta sendiri pada Google
   Sheet apabila hantaran pertama diterima.

> Setiap kali `Code.gs` diubah, deploy versi baharu
> (**Deploy > Manage deployments > Edit > New version**) barulah perubahan
> berkesan pada URL yang sama.

## Struktur tab Google Sheet

| Tab | GID | Kandungan |
|---|---|---|
| PAYER_LIST | `1211671427` | `ID` \| `STATUS` |
| PAYMENT_RECORDS | `1163321599` | `ID` \| `TAHUN` \| `JUMLAH` \| `TARIKH_BAYAR` |
| RESIT_MANUAL | auto | Hantaran resit Muzakki, menunggu semakan admin |

## Senarai `action` yang disokong

| Action | Pemanggil | Fungsi |
|---|---|---|
| `updateStatus` | Admin | Kemaskini status Muzakki (Active/Inactive) |
| `addRecord` | Admin | Tambah rekod rasmi pembayaran |
| `submitResit` | Awam (Muzakki) | Hantar rekod resit untuk semakan (status `MENUNGGU`) |
| `listResit` | Admin | Senarai hantaran resit mengikut status |
| `reviewResit` | Admin | Terima / tolak hantaran. `DITERIMA` masuk rekod rasmi |

## Aliran kerja resit manual

```
Muzakki buat semakan → klik "Hantar Rekod Resit"
        ↓
RESIT_MANUAL (status: MENUNGGU)
        ↓
Admin > tab "Resit Manual" > Terima / Tolak
        ↓
DITERIMA → rekod masuk PAYMENT_RECORDS (rekod rasmi)
DITOLAK  → kekal dalam RESIT_MANUAL sebagai jejak audit
```

Hantaran awam **tidak** masuk terus ke rekod rasmi. Semua hantaran disahkan
ID Muzakki wujud, tahun 4 angka, jumlah > RM 0, tarikh format `YYYY-MM-DD`,
dan hantaran berulang (ID + tahun + no. resit yang sama) ditolak.

Hotline rujukan percanggahan rekod: **011-55335082**
