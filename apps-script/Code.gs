/**
 * =====================================================================
 * e-MUZAKKI BAHRUL ULUM — BACKEND APPS SCRIPT
 * =====================================================================
 * Backend tunggal untuk:
 *   1. Dashboard Admin        (admin/index.html)
 *   2. Portal Semakan Muzakki (index.html)
 *
 * CARA PASANG:
 *   1. Buka Google Sheet pangkalan data > Extensions > Apps Script
 *   2. Tampal keseluruhan kod ini (ganti kod lama)
 *   3. Deploy > New deployment > Web app
 *        - Execute as      : Me
 *        - Who has access  : Anyone
 *   4. Copy URL /exec, tampal pada URL_APPSCRIPT_WEBAPP di admin/index.html
 *
 * NOTA PENTING:
 *   Setiap kali kod ini diubah, anda WAJIB deploy versi baharu
 *   (Deploy > Manage deployments > Edit > New version) barulah
 *   perubahan berkesan pada URL yang sama.
 *
 * STRUKTUR TAB PAYMENT_RECORDS (WAJIB):
 *   A = ID | B = TAHUN | C = JUMLAH | D = TARIKH_BAYAR | E = RESIT
 *   Lajur E menyimpan pautan resit:
 *     - Imej (JPG/PNG) : https://lh3.googleusercontent.com/d/FILEID
 *     - PDF            : https://drive.google.com/file/d/FILEID/preview
 *
 * KEBENARAN DRIVE:
 *   Skrip ini guna DriveApp (simpan fail ke folder resit). Selepas tampal
 *   kod baharu, jalankan fungsi ujiAkses() sekali dan beri kebenaran.
 * =====================================================================
 */

// ===== KONFIGURASI =====
var GID_PAYER_LIST      = 1211671427;  // Tab senarai Muzakki (ID | STATUS)
var GID_PAYMENT_RECORDS = 1163321599;  // Tab rekod pembayaran
var HOTLINE             = '011-55335082';

// Folder Google Drive tempat fail resit disimpan
var FOLDER_RESIT_ID     = '11-lP9VFrSqrYZlxtUfvp5KKzdWpA2I4B';
var SAIZ_MAKS_BYTE      = 8 * 1024 * 1024; // 8MB
var MIME_DIBENARKAN     = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

// Bilangan lajur pada PAYMENT_RECORDS (termasuk RESIT)
var LAJUR_RESIT = 5; // Lajur E


/**
 * GET — pemeriksaan ringkas sama ada API hidup.
 */
function doGet(e) {
  var info = {
    status: 'success',
    message: 'API e-Muzakki Bahrul Ulum beroperasi dengan baik.',
    hotline: HOTLINE,
    masa: new Date().toISOString()
  };
  return ContentService.createTextOutput(JSON.stringify(info))
    .setMimeType(ContentService.MimeType.JSON);
}


/**
 * POST — pintu masuk tunggal untuk semua arahan admin.
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('Tiada data diterima oleh pelayan.');
    }

    var payload = JSON.parse(e.postData.contents);
    var action  = String(payload.action || '').trim();
    var ss      = SpreadsheetApp.getActiveSpreadsheet();

    switch (action) {
      case 'updateStatus':  return updateStatus(ss, payload);
      case 'addRecord':     return addRecord(ss, payload);
      case 'updateResit':   return updateResit(ss, payload);
      default:
        throw new Error('Tindakan tidak sah (action: "' + action + '").');
    }

  } catch (error) {
    return respon('error', error.message || String(error));
  }
}


/* =====================================================================
 * ARAHAN 1: KEMASKINI STATUS MUZAKKI
 * ===================================================================== */
function updateStatus(ss, payload) {
  var sheet = getSheetById(ss, GID_PAYER_LIST);
  if (!sheet) throw new Error('Tab PAYER_LIST tidak dijumpai!');

  var idTarget   = normalizeId(payload.id);
  var statusBaru = String(payload.status || '').trim();

  if (!idTarget)   throw new Error('ID Muzakki wajib diisi.');
  if (!statusBaru) throw new Error('Status baharu wajib diisi.');

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (normalizeId(data[i][0]) === idTarget) {
        sheet.getRange(i + 1, 2).setValue(statusBaru); // Lajur B = STATUS
        return respon('success', 'Status Muzakki ' + idTarget + ' berjaya dikemaskini.');
      }
    }
    throw new Error('ID Muzakki ' + idTarget + ' tidak dijumpai.');
  } finally {
    lock.releaseLock();
  }
}


/* =====================================================================
 * ARAHAN 2: TAMBAH REKOD PEMBAYARAN (berserta pautan resit)
 * ---------------------------------------------------------------------
 * payload: { id, year, amount, date, receipt }
 * `receipt` adalah pilihan — boleh pautan Google Drive biasa, ia akan
 * ditukar secara automatik kepada format lh3.googleusercontent.com.
 * ===================================================================== */
function addRecord(ss, payload) {
  var sheet = getSheetById(ss, GID_PAYMENT_RECORDS);
  if (!sheet) throw new Error('Tab PAYMENT_RECORDS tidak dijumpai!');

  var rekod = sahkanRekod(ss, payload);

  // Fail yang dimuat naik diutamakan; jika tiada, guna pautan yang ditampal
  var resit = simpanFailResit(payload, rekod.id, rekod.tahun) ||
              normalizePautanResit(payload.receipt);

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    pastikanHeaderResit(sheet);

    // ID | TAHUN | JUMLAH | TARIKH_BAYAR | RESIT
    sheet.appendRow([rekod.id, rekod.tahun, rekod.jumlah, rekod.tarikh, resit]);

    return respon('success',
      'Rekod ' + rekod.id + ' (Tahun ' + rekod.tahun + ') berjaya ditambah' +
      (resit ? ' berserta resit.' : ' tanpa resit.'),
      { link: resit });
  } finally {
    lock.releaseLock();
  }
}


/* =====================================================================
 * ARAHAN 3: KEMASKINI / BUANG PAUTAN RESIT PADA REKOD SEDIA ADA
 * ---------------------------------------------------------------------
 * payload: { id, year, date, receipt, fileBase64?, fileName?, fileMime? }
 * Padanan rekod guna ID + TAHUN + TARIKH_BAYAR.
 * Fail yang dimuat naik diutamakan. Jika tiada fail dan `receipt`
 * kosong, pautan dibuang.
 * ===================================================================== */
function updateResit(ss, payload) {
  var sheet = getSheetById(ss, GID_PAYMENT_RECORDS);
  if (!sheet) throw new Error('Tab PAYMENT_RECORDS tidak dijumpai!');

  var id     = normalizeId(payload.id);
  var tahun  = String(payload.year || '').trim();
  var tarikh = String(payload.date || '').trim();

  if (!id)    throw new Error('ID Muzakki wajib diisi.');
  if (!tahun) throw new Error('Tahun rekod wajib diisi.');

  var resit = simpanFailResit(payload, id, tahun) ||
              normalizePautanResit(payload.receipt);

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    pastikanHeaderResit(sheet);

    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      var samaId     = normalizeId(data[i][0]) === id;
      var samaTahun  = String(data[i][1]).trim() === tahun;
      var samaTarikh = !tarikh || formatTarikhSahaja(data[i][3]) === tarikh;

      if (samaId && samaTahun && samaTarikh) {
        sheet.getRange(i + 1, LAJUR_RESIT).setValue(resit);
        return respon('success', resit
          ? 'Resit berjaya dikemaskini.'
          : 'Resit berjaya dibuang.', { link: resit });
      }
    }
    throw new Error('Rekod ' + id + ' (Tahun ' + tahun + ') tidak dijumpai.');
  } finally {
    lock.releaseLock();
  }
}


/* =====================================================================
 * HELPER
 * ===================================================================== */

/** Sahkan dan bersihkan input rekod pembayaran. */
function sahkanRekod(ss, payload) {
  var id     = normalizeId(payload.id);
  var tahun  = String(payload.year || '').trim();
  var jumlah = parseFloat(payload.amount);
  var tarikh = String(payload.date || '').trim();

  if (!id) throw new Error('ID Muzakki wajib diisi.');
  if (!idMuzakkiWujud(ss, id)) {
    throw new Error('ID Muzakki "' + id + '" tidak dijumpai dalam PAYER_LIST.');
  }
  if (!/^\d{4}$/.test(tahun)) throw new Error('Tahun mesti 4 angka (contoh: 2026).');

  var tahunNo = parseInt(tahun, 10);
  var tahunKini = new Date().getFullYear();
  if (tahunNo < 2000 || tahunNo > tahunKini + 1) {
    throw new Error('Tahun di luar julat yang dibenarkan (2000 - ' + (tahunKini + 1) + ').');
  }

  if (isNaN(jumlah) || jumlah <= 0) throw new Error('Jumlah bayaran mesti lebih daripada RM 0.');
  if (jumlah > 10000000) throw new Error('Jumlah bayaran melebihi had yang dibenarkan.');

  if (!/^\d{4}-\d{2}-\d{2}$/.test(tarikh)) {
    throw new Error('Tarikh bayar mesti dalam format YYYY-MM-DD.');
  }

  return {
    id: id,
    tahun: tahun,
    jumlah: Math.round(jumlah * 100) / 100,
    tarikh: tarikh
  };
}

/**
 * Seragamkan pautan resit.
 *
 * Pautan Google Drive (pelbagai format) ditukar kepada:
 *   - imej (JPG/PNG/WEBP) : https://lh3.googleusercontent.com/d/FILEID
 *   - PDF / lain-lain     : https://drive.google.com/file/d/FILEID/preview
 * Jenis fail dikesan melalui Drive. Jika fail tidak dapat dicapai oleh
 * skrip, pautan preview digunakan (berfungsi untuk imej dan PDF).
 *
 * Pautan lh3 / preview sedia ada dikekalkan. URL https lain dikekalkan.
 */
function normalizePautanResit(nilai) {
  var teks = String(nilai == null ? '' : nilai).trim();
  if (!teks) return '';
  if (teks.length > 500) throw new Error('Pautan resit terlalu panjang.');

  if (/^https:\/\/lh3\.googleusercontent\.com\//i.test(teks)) return teks;
  if (/^https:\/\/drive\.google\.com\/file\/d\/[a-zA-Z0-9_-]+\/preview/i.test(teks)) return teks;

  var fileId = ekstrakFileId(teks);
  if (fileId) return pautanDariFileId(fileId);

  if (/^https:\/\//i.test(teks)) return teks;

  throw new Error('Pautan resit tidak sah. Gunakan pautan perkongsian Google Drive atau URL https.');
}

/** Bina pautan paparan ikut jenis fail: imej -> lh3, selain itu -> preview. */
function pautanDariFileId(fileId) {
  var mime = '';
  try {
    mime = String(DriveApp.getFileById(fileId).getMimeType() || '');
  } catch (e) {
    // Fail tidak dapat dicapai skrip — guna preview (sah untuk imej & PDF)
  }
  if (/^image\//i.test(mime)) {
    return 'https://lh3.googleusercontent.com/d/' + fileId;
  }
  return 'https://drive.google.com/file/d/' + fileId + '/preview';
}

/**
 * Simpan fail resit yang dimuat naik admin ke folder Drive, kongsi sebagai
 * "Anyone with the link", dan pulangkan pautan paparan.
 * Pulang '' jika tiada fail dihantar.
 */
function simpanFailResit(payload, id, tahun) {
  if (!payload.fileBase64) return '';

  var mime = String(payload.fileMime || '').toLowerCase();
  if (MIME_DIBENARKAN.indexOf(mime) === -1) {
    throw new Error('Jenis fail tidak dibenarkan. Gunakan PDF, JPG atau PNG.');
  }

  var bytes;
  try {
    bytes = Utilities.base64Decode(String(payload.fileBase64));
  } catch (e) {
    throw new Error('Fail rosak atau tidak dapat dibaca.');
  }
  if (bytes.length > SAIZ_MAKS_BYTE) {
    throw new Error('Saiz fail melebihi had ' + (SAIZ_MAKS_BYTE / 1024 / 1024) + 'MB.');
  }

  var ext = mime === 'application/pdf' ? 'pdf'
          : mime === 'image/png'       ? 'png'
          : mime === 'image/webp'      ? 'webp' : 'jpg';
  var cap = Utilities.formatDate(new Date(), 'Asia/Kuala_Lumpur', 'yyyyMMdd-HHmmss');
  var nama = 'RESIT_' + id + '_' + tahun + '_' + cap + '.' + ext;

  var folder;
  try {
    folder = DriveApp.getFolderById(FOLDER_RESIT_ID);
  } catch (e) {
    throw new Error('Folder resit tidak dapat dicapai. Semak FOLDER_RESIT_ID dan kebenaran akaun.');
  }

  var fail = folder.createFile(Utilities.newBlob(bytes, mime, nama));
  try {
    fail.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    throw new Error('Fail disimpan tetapi gagal dikongsi (' + nama + '). ' +
      'Dasar Google Workspace mungkin menyekat perkongsian luar.');
  }

  return pautanDariFileId(fail.getId());
}

/** Jalankan sekali dari editor untuk beri kebenaran Drive & semak folder. */
function ujiAkses() {
  var folder = DriveApp.getFolderById(FOLDER_RESIT_ID);
  Logger.log('Folder OK: ' + folder.getName());
}

/** Cari FILE ID daripada pelbagai format pautan Google Drive. */
function ekstrakFileId(teks) {
  var corak = [
    /\/d\/([a-zA-Z0-9_-]{15,})/,        // /file/d/FILEID/ atau /d/FILEID
    /[?&]id=([a-zA-Z0-9_-]{15,})/,      // ?id=FILEID
    /^([a-zA-Z0-9_-]{25,})$/            // FILEID sahaja
  ];
  for (var i = 0; i < corak.length; i++) {
    var padanan = teks.match(corak[i]);
    if (padanan) return padanan[1];
  }
  return null;
}

/** Pastikan lajur E mempunyai header RESIT. */
function pastikanHeaderResit(sheet) {
  var sedia = String(sheet.getRange(1, LAJUR_RESIT).getValue()).trim();
  if (!sedia) {
    sheet.getRange(1, LAJUR_RESIT).setValue('RESIT').setFontWeight('bold');
  }
}

/** Periksa sama ada ID Muzakki wujud dalam tab PAYER_LIST. */
function idMuzakkiWujud(ss, id) {
  var sheet = getSheetById(ss, GID_PAYER_LIST);
  if (!sheet) throw new Error('Tab PAYER_LIST tidak dijumpai!');

  var nilai = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), 1).getValues();
  for (var i = 1; i < nilai.length; i++) {
    if (normalizeId(nilai[i][0]) === id) return true;
  }
  return false;
}

/** Cari tab menggunakan GID (kekal berfungsi walaupun nama tab ditukar). */
function getSheetById(ss, gid) {
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() == gid) return sheets[i];
  }
  return null;
}

/** Seragamkan format ID: buang ruang, huruf besar. */
function normalizeId(nilai) {
  return String(nilai == null ? '' : nilai).trim().toUpperCase();
}

/** Tarikh dalam format YYYY-MM-DD. */
function formatTarikhSahaja(nilai) {
  if (!nilai) return '';
  if (Object.prototype.toString.call(nilai) === '[object Date]') {
    return Utilities.formatDate(nilai, 'Asia/Kuala_Lumpur', 'yyyy-MM-dd');
  }
  return String(nilai).trim();
}

/** Respon JSON standard kepada HTML. `tambahan` digabung ke dalam respon. */
function respon(status, message, tambahan) {
  var result = { status: status, message: message };
  if (tambahan) for (var k in tambahan) result[k] = tambahan[k];
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}
