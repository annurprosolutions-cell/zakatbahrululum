# Sveltia CMS — pengurusan kandungan

Buka `https://<domain-anda>/cms/`.

**Apa yang diurus di sini:** teks dan gambar laman (hero, makluman, impak, pautan bayar,
sasaran kutipan, hotline). Disimpan sebagai `content/site.json` dan `uploads/` dalam repo ini.

**Apa yang TIDAK diurus di sini:** data Muzakki, pembayaran dan resit. Itu kekal dalam Google Sheet
melalui Apps Script dan dashboard admin.

## Log masuk (tanpa OAuth proxy)

1. GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate.
2. *Repository access*: **Only select repositories** → `zakatbahrululum`.
3. *Permissions → Repository permissions*: **Contents: Read and write**. Tiada kebenaran lain.
4. Di halaman `/cms/`, klik **Sign In Using Access Token** dan tampal token.

Setiap simpanan menjadi satu commit pada branch `main`. Laman dikemas kini selepas hos statik
siap deploy semula (GitHub Pages biasanya 1 hingga 2 minit).

## Gambar hero

- Guna gambar mendatar (landscape), sekurang-kurangnya 1200px lebar.
- JPG/PNG ditukar ke WebP dan dikecilkan ke lebar 1600px secara automatik. Had muat naik 2MB.
- Satu gambar = latar tetap. Dua hingga lima gambar = bertukar sendiri setiap 5 saat.
- Kosongkan senarai untuk kembali kepada tema hijau asal.
