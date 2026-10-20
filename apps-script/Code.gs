/**
 * =====================================================================
 * e-MUZAKKI BAHRUL ULUM — BACKEND APPS SCRIPT
 * =====================================================================
 * Satu-satunya pintu masuk ke pangkalan data (Google Sheet).
 * Sheet TIDAK lagi diterbitkan ke web (Publish to web dimatikan).
 *
 * PORTAL AWAM (tanpa kata laluan, data terhad)
 *   GET ?action=stats           -> jumlah muzakki + kutipan setahun (agregat sahaja)
 *   GET ?action=lookup&id=XXXX  -> status + rekod bayaran SATU Muzakki sahaja
 *
 * DASHBOARD ADMIN (wajib kata laluan admin)
 *   POST login | adminData | updateStatus | addRecord | updateResit
 *
 * CARA PASANG:
 *   1. Google Sheet > Extensions > Apps Script > tampal keseluruhan kod ini
 *   2. Project Settings (ikon gear) > Script properties > Add script property
 *        Property : ADMIN_PASSWORD
 *        Value    : (kata laluan admin pilihan anda — JANGAN tulis dalam kod)
 *   3. Pilih fungsi ujiAkses > Run > luluskan kebenaran (Sheet + Drive)
 *   4. Deploy > Manage deployments > Edit > New version
 *        Execute as: Me | Who has access: Anyone
 *   5. Matikan "Publish to web" pada Google Sheet (lihat README)
 *
 * STRUKTUR TAB:
 *   PAYER_LIST      : ID | STATUS | (lajur lain dibenarkan, tidak didedahkan kepada awam)
 *   PAYMENT_RECORDS : ID | TAHUN | JUMLAH | TARIKH_BAYAR | RESIT
 * =====================================================================
 */

// ===== KONFIGURASI =====
var GID_PAYER_LIST      = 1211671427;
var GID_PAYMENT_RECORDS = 1163321599;
var HOTLINE             = '011-55335082';

var FOLDER_RESIT_ID     = '11-lP9VFrSqrYZlxtUfvp5KKzdWpA2I4B';
var SAIZ_MAKS_BYTE      = 8 * 1024 * 1024; // 8MB
var MIME_DIBENARKAN     = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

var LAJUR_RESIT         = 5; // Lajur E pada PAYMENT_RECORDS

// Had percubaan (dikongsi seluruh pengguna kerana Apps Script tiada IP klien)
var HAD_SALAH_ADMIN     = 5;    // kata laluan salah sebelum dikunci
var KUNCI_ADMIN_SAAT    = 900;  // 15 minit
var HAD_ID_TIADA        = 40;   // carian ID tidak wujud dalam tempoh di bawah
var TEMPOH_ID_SAAT      = 600;  // 10 minit
var CACHE_STATS_SAAT    = 300;  // 5 minit


/* =====================================================================
 * PINTU MASUK
 * ===================================================================== */

/** GET — hanya endpoint awam yang selamat. */
function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    var action = String(p.action || '').trim();
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    switch (action) {
      case '':       return json({ status: 'success', message: 'API e-Muzakki Bahrul Ulum beroperasi.', hotline: HOTLINE });
      case 'stats':  return publicStats(ss);
      case 'lookup': return publicLookup(ss, p.id);
      default:       throw new Error('Tindakan tidak sah.');
    }
  } catch (error) {
    return respon('error', error.message || String(error));
  }
}

/** POST — semua tindakan admin; kata laluan diperlukan pada setiap panggilan. */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) throw new Error('Tiada data diterima oleh pelayan.');

    var payload = JSON.parse(e.postData.contents);
    var action  = String(payload.action || '').trim();

    semakAdmin(payload.auth);

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    switch (action) {
      case 'login':        return respon('success', 'Log masuk berjaya.');
      case 'adminData':    return adminData(ss);
      case 'updateStatus': return updateStatus(ss, payload);
      case 'addRecord':    return addRecord(ss, payload);
      case 'updateResit':  return updateResit(ss, payload);
      default:             throw new Error('Tindakan tidak sah (action: "' + action + '").');
    }
  } catch (error) {
    return respon('error', error.message || String(error));
  }
}


/* =====================================================================
 * KESELAMATAN
 * ===================================================================== */

/** Semak kata laluan admin dengan had percubaan salah. */
function semakAdmin(diberi) {
  var cache = CacheService.getScriptCache();
  var gagal = parseInt(cache.get('admin_gagal') || '0', 10);
  if (gagal >= HAD_SALAH_ADMIN) {
    throw new Error('Terlalu banyak percubaan salah. Cuba lagi selepas ' + (KUNCI_ADMIN_SAAT / 60) + ' minit.');
  }

  var betul = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
  if (!betul) {
    throw new Error('Kata laluan admin belum ditetapkan. Tambah Script property ADMIN_PASSWORD.');
  }

  if (!samaSelamat(String(diberi == null ? '' : diberi), String(betul))) {
    cache.put('admin_gagal', String(gagal + 1), KUNCI_ADMIN_SAAT);
    throw new Error('Kata laluan admin tidak sah.');
  }
  if (gagal > 0) cache.remove('admin_gagal');
}

/** Banding teks tanpa berhenti awal (mengurangkan kebocoran masa). */
function samaSelamat(a, b) {
  var beza = a.length ^ b.length;
  var n = Math.max(a.length, b.length);
  for (var i = 0; i < n; i++) {
    beza |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return beza === 0;
}


/* =====================================================================
 * ENDPOINT AWAM
 * ===================================================================== */

/** Agregat sahaja: jumlah Muzakki dan kutipan setahun. Tiada data peribadi. */
function publicStats(ss) {
  var cache = CacheService.getScriptCache();
  var tersimpan = cache.get('stats');
  if (tersimpan) return ContentService.createTextOutput(tersimpan).setMimeType(ContentService.MimeType.JSON);

  var payers  = bacaJadual(getSheetById(ss, GID_PAYER_LIST), 'PAYER_LIST');
  var records = bacaJadual(getSheetById(ss, GID_PAYMENT_RECORDS), 'PAYMENT_RECORDS');

  var perTahun = {};
  records.forEach(function (r) {
    var tahun = String(r.TAHUN == null ? '' : r.TAHUN).trim();
    if (!tahun) return;
    perTahun[tahun] = (perTahun[tahun] || 0) + (parseFloat(r.JUMLAH) || 0);
  });

  var hasil = JSON.stringify({
    status: 'success',
    totalPayers: payers.filter(function (p) { return normalizeId(p.ID); }).length,
    perTahun: perTahun
  });
  cache.put('stats', hasil, CACHE_STATS_SAAT);
  return ContentService.createTextOutput(hasil).setMimeType(ContentService.MimeType.JSON);
}

/** Satu Muzakki sahaja. Medan dipilih dengan senarai putih. */
function publicLookup(ss, idMentah) {
  var id = normalizeId(idMentah);
  if (!/^[A-Z0-9_-]{1,30}$/.test(id)) throw new Error('Format ID tidak sah.');

  var cache = CacheService.getScriptCache();
  var tiada = parseInt(cache.get('id_tiada') || '0', 10);
  if (tiada >= HAD_ID_TIADA) {
    throw new Error('Terlalu banyak carian tidak berjaya. Sila cuba semula sebentar lagi atau hubungi Hotline ' + HOTLINE + '.');
  }

  var payers = bacaJadual(getSheetById(ss, GID_PAYER_LIST), 'PAYER_LIST');
  var payer = null;
  for (var i = 0; i < payers.length; i++) {
    if (normalizeId(payers[i].ID) === id) { payer = payers[i]; break; }
  }

  if (!payer) {
    cache.put('id_tiada', String(tiada + 1), TEMPOH_ID_SAAT);
    return json({ status: 'notfound', message: "ID '" + id + "' tidak dijumpai dalam rekod." });
  }

  var records = bacaJadual(getSheetById(ss, GID_PAYMENT_RECORDS), 'PAYMENT_RECORDS')
    .filter(function (r) { return normalizeId(r.ID) === id; })
    .map(function (r) {
      return {
        TAHUN: String(r.TAHUN == null ? '' : r.TAHUN).trim(),
        JUMLAH: String(r.JUMLAH == null ? '' : r.JUMLAH).trim(),
        TARIKH_BAYAR: String(r.TARIKH_BAYAR || '').trim(),
        RESIT: String(r.RESIT || '').trim()
      };
    });

  return json({
    status: 'success',
    payer: { ID: id, STATUS: String(payer.STATUS || '').trim() },
    records: records
  });
}


/* =====================================================================
 * ADMIN: BACA SEMUA DATA
 * ===================================================================== */
function adminData(ss) {
  var payers = bacaJadual(getSheetById(ss, GID_PAYER_LIST), 'PAYER_LIST')
    .filter(function (p) { return normalizeId(p.ID); });

  var records = bacaJadual(getSheetById(ss, GID_PAYMENT_RECORDS), 'PAYMENT_RECORDS')
    .filter(function (r) { return normalizeId(r.ID); })
    .map(function (r) {
      return {
        ID: normalizeId(r.ID),
        TAHUN: String(r.TAHUN == null ? '' : r.TAHUN).trim(),
        JUMLAH: String(r.JUMLAH == null ? '' : r.JUMLAH).trim(),
        TARIKH_BAYAR: String(r.TARIKH_BAYAR || '').trim(),
        RESIT: String(r.RESIT || '').trim()
      };
    });

  return json({ status: 'success', payers: payers, records: records });
}


/* =====================================================================
 * ADMIN: KEMASKINI STATUS MUZAKKI
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
        CacheService.getScriptCache().remove('stats');
        return respon('success', 'Status Muzakki ' + idTarget + ' berjaya dikemaskini.');
      }
    }
    throw new Error('ID Muzakki ' + idTarget + ' tidak dijumpai.');
  } finally {
    lock.releaseLock();
  }
}


/* =====================================================================
 * ADMIN: TAMBAH REKOD PEMBAYARAN (+ resit pilihan)
 * payload: { id, year, amount, date, receipt?, fileBase64?, fileName?, fileMime? }
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
    sheet.appendRow([rekod.id, rekod.tahun, rekod.jumlah, rekod.tarikh, resit]);
    CacheService.getScriptCache().remove('stats');

    return respon('success',
      'Rekod ' + rekod.id + ' (Tahun ' + rekod.tahun + ') berjaya ditambah' +
      (resit ? ' berserta resit.' : ' tanpa resit.'),
      { link: resit });
  } finally {
    lock.releaseLock();
  }
}


/* =====================================================================
 * ADMIN: KEMASKINI / BUANG RESIT PADA REKOD SEDIA ADA
 * payload: { id, year, date, receipt, fileBase64?, fileName?, fileMime? }
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
        return respon('success', resit ? 'Resit berjaya dikemaskini.' : 'Resit berjaya dibuang.', { link: resit });
      }
    }
    throw new Error('Rekod ' + id + ' (Tahun ' + tahun + ') tidak dijumpai.');
  } finally {
    lock.releaseLock();
  }
}


/* =====================================================================
 * HELPER: VALIDASI
 * ===================================================================== */
function sahkanRekod(ss, payload) {
  var id     = normalizeId(payload.id);
  var tahun  = String(payload.year || '').trim();
  var jumlah = parseFloat(payload.amount);
  var tarikh = String(payload.date || '').trim();

  if (!id) throw new Error('ID Muzakki wajib diisi.');
  if (!idMuzakkiWujud(ss, id)) throw new Error('ID Muzakki "' + id + '" tidak dijumpai dalam PAYER_LIST.');
  if (!/^\d{4}$/.test(tahun)) throw new Error('Tahun mesti 4 angka (contoh: 2026).');

  var tahunNo = parseInt(tahun, 10);
  var tahunKini = new Date().getFullYear();
  if (tahunNo < 2000 || tahunNo > tahunKini + 1) {
    throw new Error('Tahun di luar julat yang dibenarkan (2000 - ' + (tahunKini + 1) + ').');
  }

  if (isNaN(jumlah) || jumlah <= 0) throw new Error('Jumlah bayaran mesti lebih daripada RM 0.');
  if (jumlah > 10000000) throw new Error('Jumlah bayaran melebihi had yang dibenarkan.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tarikh)) throw new Error('Tarikh bayar mesti dalam format YYYY-MM-DD.');

  return { id: id, tahun: tahun, jumlah: Math.round(jumlah * 100) / 100, tarikh: tarikh };
}

function idMuzakkiWujud(ss, id) {
  var sheet = getSheetById(ss, GID_PAYER_LIST);
  if (!sheet) throw new Error('Tab PAYER_LIST tidak dijumpai!');

  var nilai = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), 1).getValues();
  for (var i = 1; i < nilai.length; i++) {
    if (normalizeId(nilai[i][0]) === id) return true;
  }
  return false;
}


/* =====================================================================
 * HELPER: RESIT (PDF & imej)
 * ===================================================================== */

/**
 * Seragamkan pautan resit.
 *   imej (JPG/PNG/WEBP) -> https://lh3.googleusercontent.com/d/FILEID
 *   PDF / lain-lain     -> https://drive.google.com/file/d/FILEID/preview
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

function pautanDariFileId(fileId) {
  var mime = '';
  try {
    mime = String(DriveApp.getFileById(fileId).getMimeType() || '');
  } catch (e) {
    // Fail tidak dapat dicapai skrip — guna preview (sah untuk imej & PDF)
  }
  if (/^image\//i.test(mime)) return 'https://lh3.googleusercontent.com/d/' + fileId;
  return 'https://drive.google.com/file/d/' + fileId + '/preview';
}

function ekstrakFileId(teks) {
  var corak = [
    /\/d\/([a-zA-Z0-9_-]{15,})/,
    /[?&]id=([a-zA-Z0-9_-]{15,})/,
    /^([a-zA-Z0-9_-]{25,})$/
  ];
  for (var i = 0; i < corak.length; i++) {
    var padanan = teks.match(corak[i]);
    if (padanan) return padanan[1];
  }
  return null;
}

/** Simpan fail resit dimuat naik ke folder Drive; pulang pautan paparan atau ''. */
function simpanFailResit(payload, id, tahun) {
  if (!payload.fileBase64) return '';

  var mime = String(payload.fileMime || '').toLowerCase();
  if (MIME_DIBENARKAN.indexOf(mime) === -1) throw new Error('Jenis fail tidak dibenarkan. Gunakan PDF, JPG atau PNG.');

  var bytes;
  try {
    bytes = Utilities.base64Decode(String(payload.fileBase64));
  } catch (e) {
    throw new Error('Fail rosak atau tidak dapat dibaca.');
  }
  if (bytes.length > SAIZ_MAKS_BYTE) throw new Error('Saiz fail melebihi had ' + (SAIZ_MAKS_BYTE / 1024 / 1024) + 'MB.');

  var ext = mime === 'application/pdf' ? 'pdf' : mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
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
    throw new Error('Fail disimpan tetapi gagal dikongsi (' + nama + '). Dasar Google Workspace mungkin menyekat perkongsian luar.');
  }
  return pautanDariFileId(fail.getId());
}

function pastikanHeaderResit(sheet) {
  var sedia = String(sheet.getRange(1, LAJUR_RESIT).getValue()).trim();
  if (!sedia) sheet.getRange(1, LAJUR_RESIT).setValue('RESIT').setFontWeight('bold');
}


/* =====================================================================
 * HELPER: SHEET & UMUM
 * ===================================================================== */

/** Baca tab sebagai senarai objek mengikut nama header baris 1. */
function bacaJadual(sheet, nama) {
  if (!sheet) throw new Error('Tab ' + nama + ' tidak dijumpai!');
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  var header = data[0].map(function (h) { return String(h).trim(); });
  var hasil = [];
  for (var i = 1; i < data.length; i++) {
    var obj = {};
    for (var j = 0; j < header.length; j++) {
      if (!header[j]) continue;
      var nilai = data[i][j];
      obj[header[j]] = Object.prototype.toString.call(nilai) === '[object Date]'
        ? formatTarikhSahaja(nilai)
        : nilai;
    }
    hasil.push(obj);
  }
  return hasil;
}

function getSheetById(ss, gid) {
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() == gid) return sheets[i];
  }
  return null;
}

function normalizeId(nilai) {
  return String(nilai == null ? '' : nilai).trim().toUpperCase();
}

function formatTarikhSahaja(nilai) {
  if (!nilai) return '';
  if (Object.prototype.toString.call(nilai) === '[object Date]') {
    return Utilities.formatDate(nilai, 'Asia/Kuala_Lumpur', 'yyyy-MM-dd');
  }
  return String(nilai).trim();
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function respon(status, message, tambahan) {
  var result = { status: status, message: message };
  if (tambahan) for (var k in tambahan) result[k] = tambahan[k];
  return json(result);
}

/** Jalankan sekali dari editor untuk beri kebenaran & semak konfigurasi. */
function ujiAkses() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Logger.log('Sheet: ' + ss.getName());
  Logger.log('PAYER_LIST: ' + (getSheetById(ss, GID_PAYER_LIST) ? 'OK' : 'TIDAK DIJUMPAI'));
  Logger.log('PAYMENT_RECORDS: ' + (getSheetById(ss, GID_PAYMENT_RECORDS) ? 'OK' : 'TIDAK DIJUMPAI'));
  Logger.log('Folder resit: ' + DriveApp.getFolderById(FOLDER_RESIT_ID).getName());
  Logger.log('ADMIN_PASSWORD: ' + (PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD') ? 'ditetapkan' : '*** BELUM DITETAPKAN ***'));
}
