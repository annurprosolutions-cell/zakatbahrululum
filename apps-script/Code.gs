/**
 * =====================================================================
 * e-MUZAKKI BAHRUL ULUM — BACKEND APPS SCRIPT
 * =====================================================================
 * Fail ini adalah backend tunggal untuk:
 *   1. Dashboard Admin  (admin/index.html)
 *   2. Portal Semakan Muzakki (index.html)
 *
 * CARA PASANG:
 *   1. Buka Google Sheet pangkalan data > Extensions > Apps Script
 *   2. Tampal keseluruhan kod ini (ganti kod lama)
 *   3. Deploy > New deployment > Web app
 *        - Execute as      : Me
 *        - Who has access  : Anyone
 *   4. Copy URL /exec, tampal pada URL_APPSCRIPT_WEBAPP di dalam
 *      index.html DAN admin/index.html
 *
 * NOTA PENTING:
 *   Setiap kali kod ini diubah, anda WAJIB deploy versi baharu
 *   (Deploy > Manage deployments > Edit > New version) barulah
 *   perubahan berkesan pada URL yang sama.
 * =====================================================================
 */

// ===== KONFIGURASI =====
var GID_PAYER_LIST      = 1211671427;  // Tab senarai Muzakki  (ID | STATUS | ...)
var GID_PAYMENT_RECORDS = 1163321599;  // Tab rekod rasmi       (ID | TAHUN | JUMLAH | TARIKH_BAYAR)
var NAMA_TAB_RESIT      = 'RESIT_MANUAL'; // Tab resit hantaran Muzakki (auto dicipta)
var HOTLINE             = '011-55335082';

// Header tab RESIT_MANUAL — jangan ubah susunan tanpa ubah kod di bawah
var HEADER_RESIT = [
  'TIMESTAMP',    // A - masa hantaran
  'ID',           // B - ID Muzakki
  'TAHUN',        // C
  'JUMLAH',       // D
  'TARIKH_BAYAR', // E
  'NO_RESIT',     // F
  'NAMA_PEMBAYAR',// G
  'CATATAN',      // H
  'STATUS',       // I - MENUNGGU / DITERIMA / DITOLAK
  'DISEMAK_OLEH', // J
  'TARIKH_SEMAK'  // K
];


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
 * POST — pintu masuk tunggal untuk semua arahan.
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

      // ---- ADMIN ----
      case 'updateStatus':  return updateStatus(ss, payload);
      case 'addRecord':     return addRecord(ss, payload);

      // ---- MUZAKKI (awam) ----
      case 'submitResit':   return submitResit(ss, payload);

      // ---- ADMIN: pengurusan resit manual ----
      case 'listResit':     return listResit(ss, payload);
      case 'reviewResit':   return reviewResit(ss, payload);

      default:
        throw new Error('Tindakan tidak sah (action: "' + action + '").');
    }

  } catch (error) {
    return respon('error', error.message || String(error));
  }
}


/* =====================================================================
 * ARAHAN 1: KEMASKINI STATUS MUZAKKI  (Admin)
 * ===================================================================== */
function updateStatus(ss, payload) {
  var sheet = getSheetById(ss, GID_PAYER_LIST);
  if (!sheet) throw new Error('Tab PAYER_LIST tidak dijumpai!');

  var idTarget  = normalizeId(payload.id);
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
 * ARAHAN 2: TAMBAH REKOD RASMI  (Admin)
 * ===================================================================== */
function addRecord(ss, payload) {
  var sheet = getSheetById(ss, GID_PAYMENT_RECORDS);
  if (!sheet) throw new Error('Tab PAYMENT_RECORDS tidak dijumpai!');

  var rekod = sahkanRekod(ss, payload);

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    // Header: ID | TAHUN | JUMLAH | TARIKH_BAYAR
    sheet.appendRow([rekod.id, rekod.tahun, rekod.jumlah, rekod.tarikh]);
    return respon('success',
      'Rekod ' + rekod.id + ' (Tahun ' + rekod.tahun + ') berjaya ditambah.');
  } finally {
    lock.releaseLock();
  }
}


/* =====================================================================
 * ARAHAN 3: MUZAKKI HANTAR REKOD RESIT SECARA MANUAL  (Awam)
 * ---------------------------------------------------------------------
 * Hantaran awam TIDAK masuk terus ke rekod rasmi. Ia disimpan di tab
 * RESIT_MANUAL dengan status MENUNGGU untuk disemak oleh admin.
 * ===================================================================== */
function submitResit(ss, payload) {
  var sheet = getOrCreateSheet(ss, NAMA_TAB_RESIT, HEADER_RESIT);
  var rekod = sahkanRekod(ss, payload);

  var noResit = potong(payload.receipt, 50);
  var nama    = potong(payload.name, 100);
  var catatan = potong(payload.note, 500);

  if (!noResit) throw new Error('No. resit / rujukan bayaran wajib diisi.');

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    // Halang hantaran berulang yang sama (ID + tahun + no resit)
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      var samaId    = normalizeId(data[i][1]) === rekod.id;
      var samaTahun = String(data[i][2]).trim() === String(rekod.tahun);
      var samaResit = String(data[i][5]).trim().toUpperCase() === noResit.toUpperCase();
      var belumTolak = String(data[i][8]).trim().toUpperCase() !== 'DITOLAK';
      if (samaId && samaTahun && samaResit && belumTolak) {
        throw new Error('Resit ini sudah pernah dihantar dan sedang/telah disemak. ' +
          'Sila hubungi Hotline ' + HOTLINE + ' jika perlu bantuan.');
      }
    }

    sheet.appendRow([
      new Date(),   // TIMESTAMP
      rekod.id,     // ID
      rekod.tahun,  // TAHUN
      rekod.jumlah, // JUMLAH
      rekod.tarikh, // TARIKH_BAYAR
      noResit,      // NO_RESIT
      nama,         // NAMA_PEMBAYAR
      catatan,      // CATATAN
      'MENUNGGU',   // STATUS
      '',           // DISEMAK_OLEH
      ''            // TARIKH_SEMAK
    ]);

    return respon('success',
      'Rekod resit anda berjaya dihantar untuk semakan pihak pengurusan. ' +
      'Rekod rasmi akan dikemaskini setelah pengesahan dibuat.');
  } finally {
    lock.releaseLock();
  }
}


/* =====================================================================
 * ARAHAN 4: SENARAI RESIT MANUAL  (Admin)
 * ---------------------------------------------------------------------
 * payload.filter : 'MENUNGGU' (default) | 'DITERIMA' | 'DITOLAK' | 'SEMUA'
 * ===================================================================== */
function listResit(ss, payload) {
  var sheet = getOrCreateSheet(ss, NAMA_TAB_RESIT, HEADER_RESIT);
  var filter = String(payload.filter || 'MENUNGGU').trim().toUpperCase();

  var data = sheet.getDataRange().getValues();
  var senarai = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[1]) continue; // baris kosong

    var status = String(row[8] || 'MENUNGGU').trim().toUpperCase();
    if (filter !== 'SEMUA' && status !== filter) continue;

    senarai.push({
      baris:      i + 1,
      timestamp:  formatTarikh(row[0]),
      id:         normalizeId(row[1]),
      tahun:      String(row[2] || '').trim(),
      jumlah:     Number(row[3]) || 0,
      tarikh:     formatTarikhSahaja(row[4]),
      resit:      String(row[5] || '').trim(),
      nama:       String(row[6] || '').trim(),
      catatan:    String(row[7] || '').trim(),
      status:     status,
      disemakOleh: String(row[9] || '').trim(),
      tarikhSemak: formatTarikh(row[10])
    });
  }

  senarai.reverse(); // terbaharu di atas

  var result = {
    status: 'success',
    message: senarai.length + ' rekod dijumpai.',
    data: senarai
  };
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}


/* =====================================================================
 * ARAHAN 5: SEMAK (TERIMA / TOLAK) RESIT MANUAL  (Admin)
 * ---------------------------------------------------------------------
 * payload.row      : nombor baris pada tab RESIT_MANUAL
 * payload.decision : 'DITERIMA' | 'DITOLAK'
 * payload.reviewer : nama / inisial admin (pilihan)
 *
 * Jika DITERIMA, rekod akan turut dimasukkan ke tab rekod rasmi.
 * ===================================================================== */
function reviewResit(ss, payload) {
  var sheet = getOrCreateSheet(ss, NAMA_TAB_RESIT, HEADER_RESIT);
  var baris = parseInt(payload.row, 10);
  var keputusan = String(payload.decision || '').trim().toUpperCase();
  var reviewer  = potong(payload.reviewer, 100) || 'Admin';

  if (!baris || baris < 2 || baris > sheet.getLastRow()) {
    throw new Error('Baris rekod tidak sah. Sila muat semula senarai.');
  }
  if (keputusan !== 'DITERIMA' && keputusan !== 'DITOLAK') {
    throw new Error('Keputusan mesti DITERIMA atau DITOLAK.');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var row = sheet.getRange(baris, 1, 1, HEADER_RESIT.length).getValues()[0];
    var statusSemasa = String(row[8] || '').trim().toUpperCase();

    if (statusSemasa !== 'MENUNGGU') {
      throw new Error('Rekod ini telah disemak sebelum ini (status: ' + statusSemasa + ').');
    }

    // Tulis keputusan
    sheet.getRange(baris, 9).setValue(keputusan);   // STATUS
    sheet.getRange(baris, 10).setValue(reviewer);   // DISEMAK_OLEH
    sheet.getRange(baris, 11).setValue(new Date()); // TARIKH_SEMAK

    if (keputusan === 'DITOLAK') {
      return respon('success', 'Resit ditolak dan direkodkan.');
    }

    // DITERIMA — masukkan ke rekod rasmi
    var sheetRasmi = getSheetById(ss, GID_PAYMENT_RECORDS);
    if (!sheetRasmi) throw new Error('Tab PAYMENT_RECORDS tidak dijumpai!');

    sheetRasmi.appendRow([
      normalizeId(row[1]),
      String(row[2]).trim(),
      Number(row[3]) || 0,
      formatTarikhSahaja(row[4])
    ]);

    return respon('success',
      'Resit diterima. Rekod ' + normalizeId(row[1]) +
      ' (Tahun ' + String(row[2]).trim() + ') telah dimasukkan ke rekod rasmi.');
  } finally {
    lock.releaseLock();
  }
}


/* =====================================================================
 * HELPER
 * ===================================================================== */

/** Sahkan dan bersihkan input rekod pembayaran (guna oleh admin + awam). */
function sahkanRekod(ss, payload) {
  var id     = normalizeId(payload.id);
  var tahun  = String(payload.year || '').trim();
  var jumlah = parseFloat(payload.amount);
  var tarikh = String(payload.date || '').trim();

  if (!id) throw new Error('ID Muzakki wajib diisi.');
  if (!idMuzakkiWujud(ss, id)) {
    throw new Error('ID Muzakki "' + id + '" tidak dijumpai dalam rekod. ' +
      'Sila rujuk Hotline ' + HOTLINE + '.');
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

/** Dapatkan tab mengikut nama; cipta berserta header jika belum ada. */
function getOrCreateSheet(ss, nama, header) {
  var sheet = ss.getSheetByName(nama);
  if (!sheet) {
    sheet = ss.insertSheet(nama);
    sheet.appendRow(header);
    sheet.getRange(1, 1, 1, header.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(header);
    sheet.getRange(1, 1, 1, header.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** Seragamkan format ID: buang ruang, huruf besar. */
function normalizeId(nilai) {
  return String(nilai == null ? '' : nilai).trim().toUpperCase();
}

/** Potong teks supaya tidak melebihi had panjang. */
function potong(nilai, had) {
  var teks = String(nilai == null ? '' : nilai).trim();
  return teks.length > had ? teks.substring(0, had) : teks;
}

/** Tarikh + masa dalam format tempatan (DD/MM/YYYY HH:mm). */
function formatTarikh(nilai) {
  if (!nilai) return '';
  if (Object.prototype.toString.call(nilai) === '[object Date]') {
    return Utilities.formatDate(nilai, 'Asia/Kuala_Lumpur', 'dd/MM/yyyy HH:mm');
  }
  return String(nilai).trim();
}

/** Tarikh sahaja dalam format YYYY-MM-DD (selaras dengan rekod rasmi). */
function formatTarikhSahaja(nilai) {
  if (!nilai) return '';
  if (Object.prototype.toString.call(nilai) === '[object Date]') {
    return Utilities.formatDate(nilai, 'Asia/Kuala_Lumpur', 'yyyy-MM-dd');
  }
  return String(nilai).trim();
}

/** Respon JSON standard kepada HTML. */
function respon(status, message) {
  var result = { status: status, message: message };
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}
