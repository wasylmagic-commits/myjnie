/* Wydatki – moduł aplikacji „Serwis myjni” (15.11.2026): zaliczka + paliwo w jednej karcie dolnego paska.
 * Jedna kontrolka „Zdjęcie dokumentu”: bot sam rozpoznaje fakturę / paragon / tankowanie Karta Flota (POST ?api=dokument, Wydatki.gs).
 * Faktura → karta do sprawdzenia → Zapisz / Anuluj tutaj (api=fakturaZapisz), bez przycisków w Telegramie.
 * Faktury bez miejsca podświetlone → „dodaj miejsce” (api=zaliczkaMiejsce).
 * Ładowany po asystent.js i paliwo.js; funkcje index.html (esc, I, zl, dt, api, toast, load, arkZamknij…) używane dopiero przy wywołaniu.
 */
(function () {
  const ST = { mies: null, karta: null, trwa: false };
  const teraz = () => { const t = new Date(); return t.getFullYear() * 100 + t.getMonth() + 1; };
  const nazwaMies = m => new Date(Math.floor(m / 100), m % 100 - 1, 1).toLocaleDateString('pl-PL', { month: 'long' });
  const z2 = x => (Math.round((+x || 0) * 100) / 100).toFixed(2).replace('.', ',') + ' zł';
  const isoZ = s => { const m = String(s || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/); return m ? m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0') : ''; };
  const plZ = iso => iso ? iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(0, 4) : '';
  const blad = e => /Nieznan|akcja|poprawnie/i.test(e.message) ? 'Najpierw zainstaluj aktualizację bota (/aktualizuj)' : 'Błąd: ' + e.message;

  // miejsca z prac danego dnia – ten sam zapis co w bocie (miejsceDnia_): „SP1149 Orlen”, „Montaż …”
  function miejscaDnia(iso) {
    const m = [];
    ((typeof D !== 'undefined' && D && D.prace) || []).filter(p => p.d === iso).forEach(p => {
      let x;
      if (p.montaz || /^monta/i.test(p.nr || '')) x = 'Montaż ' + (p.firma ? p.firma + ' ' : '') + (p.miejsce || '');
      else { const n = String(p.firma || '').match(/orlen\D*(\d+)/i); x = n ? 'SP' + n[1] + ' Orlen' : (p.firma || ''); }
      x = x.trim(); if (x && m.indexOf(x) < 0) m.push(x);
    });
    return m;
  }

  function widok() {
    const m = ST.mies || teraz(), D_ = D;
    const lista = (D_.zaliczka || []).filter(z => z.mies === m).sort((a, b) => b.d.localeCompare(a.d));
    const wyd = lista.reduce((a, z) => a + z.kwota, 0), lim = D_.limitZaliczki || 0, zost = lim - wyd;
    const proc = lim ? Math.min(100, Math.round(wyd / lim * 100)) : 0;
    const bezM = lista.filter(z => !String(z.miejsce || '').trim()).length;
    let h = '<div class="wy">';
    h += '<div class="card"><div class="wy-m"><button class="ib" onclick="wydMies(-1)" aria-label="Poprzedni miesiąc">' + I('back') + '</button>' +
      '<b>Zaliczka · ' + nazwaMies(m) + ' ' + Math.floor(m / 100) + '</b>' +
      '<button class="ib" style="transform:scaleX(-1)" onclick="wydMies(1)" aria-label="Następny miesiąc"' + (m >= teraz() ? ' disabled' : '') + '>' + I('back') + '</button></div>' +
      '<div class="kpi"><div><b>' + zl(wyd) + '</b><span>wydano</span></div><div><b>' + zl(lim) + '</b><span>limit</span></div>' +
      '<div><b style="color:' + (zost < 0 ? 'var(--red)' : 'var(--grn)') + '">' + zl(zost) + '</b><span>zostało</span></div></div>' +
      '<div class="wy-bar"><i style="width:' + proc + '%;' + (proc >= 90 ? 'background:var(--red)' : '') + '"></i></div></div>';

    h += '<label class="btn wy-foto' + (ST.trwa ? ' dis' : '') + '"><input type="file" accept="image/*,application/pdf" multiple hidden onchange="wydPlik(this)"' + (ST.trwa ? ' disabled' : '') + '>' +
      I('doc', 1) + (ST.trwa ? 'Czytam dokument…' : 'Zdjęcie dokumentu') + '</label>' +
      '<div class="note" style="text-align:center;margin:-4px 0 14px">PDF albo zdjęcie (kilka zdjęć = kilka stron jednego PDF) · faktura, paragon, tankowanie – rozpoznam sam</div>';

    h += '<div class="card"><h3>' + I('money', 1) + 'Dokumenty · ' + nazwaMies(m) + (bezM ? ' <span class="pill o">bez miejsca: ' + bezM + '</span>' : '') + '</h3>' +
      (lista.length ? lista.map(z => {
        const bm = !String(z.miejsce || '').trim();
        return '<div class="row' + (bm ? ' wy-bm' : '') + '"><div class="g"><b>' + esc(z.za || 'bez opisu') + '</b>' +
          '<div class="mute">' + dt(z.d) + (z.nr ? ' · ' + esc(z.nr) : '') + '</div>' +
          (bm ? '<a class="wy-dod" onclick="wydMiejsce(\'' + jsq(z.id) + '\')">' + I('pin', 1) + ' dodaj miejsce</a>'
              : '<div class="mute">' + I('pin', 1) + ' ' + esc(z.miejsce) + (z.id ? ' · <a onclick="wydMiejsce(\'' + jsq(z.id) + '\')">zmień</a>' : '') + '</div>') + '</div>' +
          '<div style="text-align:right"><b>' + z2(z.kwota) + '</b>' + (z.id ? '<div><a class="mute" href="https://drive.google.com/file/d/' + encodeURIComponent(z.id) + '/view" target="_blank">skan</a></div>' : '') + '</div></div>';
      }).join('') : '<div class="mute">Brak dokumentów w tym miesiącu.</div>') +
      (lista.length ? (() => { const wys = ((D_.wyslano || {}).zaliczka || {})[m];
        return '<button class="btn wy-roz' + (wys ? ' wys' : '') + '" onclick="wydRozliczenie(' + m + ')">' + I(wys ? 'check' : 'send', 1) +
          (wys ? 'Wysłane ' + dt(wys) + ' · wyślij ponownie' : 'Wyślij rozliczenie · ' + nazwaMies(m)) + '</button>' +
          (wys ? '' : '<div class="note" style="text-align:center;margin-top:6px">druk zaliczki + ' + lista.length + ' ' + (lista.length === 1 ? 'skan' : 'skany') + ' PDF · termin do 7. następnego miesiąca</div>'); })() : '') + '</div>';

    // paliwo tego miesiąca – szczegóły w module Paliwo
    const mk = Math.floor(m / 100) + '-' + String(m % 100).padStart(2, '0');
    const pal = (D_.paliwo || []).filter(x => String(x.d).slice(0, 7) === mk), P = window.paliwoParam ? window.paliwoParam() : null;
    h += '<div class="card" onclick="go(\'paliwo\')" style="cursor:pointer"><h3>' + I('fuel', 1) + 'Paliwo · ' + nazwaMies(m) + '</h3><div class="kpi">' +
      '<div><b>' + zl(pal.reduce((a, x) => a + (+x.zl || 0), 0)) + '</b><span>' + pal.length + ' ' + (pal.length === 1 ? 'tankowanie' : [2, 3, 4].indexOf(pal.length % 10) >= 0 && [12, 13, 14].indexOf(pal.length % 100) < 0 ? 'tankowania' : 'tankowań') + '</span></div>' +
      '<div><b>' + (P && P.l100 ? P.l100.toFixed(2).replace('.', ',') : '—') + '</b><span>l / 100 km średnio</span></div></div>' +
      '<div class="note">Karta Flota – nie liczy się do zaliczki. Dotknij, żeby zobaczyć tankowania.</div></div>';
    return h + '</div>';
  }

  window.wydPokazMies = m => { ST.mies = m; go('wydatki'); };
  window.wydMies = d => { let m = ST.mies || teraz(), y = Math.floor(m / 100), mm = m % 100 + d; if (mm < 1) { mm = 12; y--; } if (mm > 12) { mm = 1; y++; } ST.mies = Math.min(teraz(), y * 100 + mm); render(); };

  // zdjęcie zmniejszone do 1800 px (czytelne dla Claude, szybciej przez sieć); PDF bez zmian
  function doB64(f) {
    return new Promise((ok, no) => {
      const fr = new FileReader();
      fr.onerror = () => no(new Error('nie mogę odczytać pliku'));
      if (/pdf/i.test(f.type) || /\.pdf$/i.test(f.name)) { fr.onload = () => ok({ b64: String(fr.result).split(',')[1], mime: 'application/pdf' }); fr.readAsDataURL(f); return; }
      fr.onload = () => { const im = new Image(); im.onerror = () => no(new Error('to nie jest zdjęcie'));
        im.onload = () => { const s = Math.min(1, 1800 / Math.max(im.width, im.height)), c = document.createElement('canvas');
          c.width = Math.round(im.width * s); c.height = Math.round(im.height * s); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
          ok({ b64: c.toDataURL('image/jpeg', .85).split(',')[1], mime: 'image/jpeg' }); };
        im.src = fr.result; };
      fr.readAsDataURL(f);
    });
  }

  // ---- wysyłka do serwera (PDF albo zdjęcie) ----
  async function wyslijDok(x, nazwa) {
    ST.trwa = true; render();
    try {
      const r = await fetch(API + '?api=dokument', { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ k: K, rid: 'w' + Date.now().toString(36), nazwa: nazwa || '', mime: x.mime, b64: x.b64 }) });
      const t = await r.text(); let j;
      try { j = JSON.parse(t); } catch (e) { throw new Error('serwer nie odpowiedział poprawnie'); }
      if (!j.ok) throw new Error(j.blad || 'błąd serwera');
      const w = j.wynik || {};
      if (w.typ === 'faktura' && w.juz) toast('Faktura ' + (w.numer || '') + ' jest już zapisana');
      else if (w.typ === 'faktura' && w.key) { ST.karta = w; karta(); }
      else if ((w.komunikaty || []).length) { komunikaty(w); load(); }
      else if (w.typ === 'tankowanie' || w.typ === 'licznik_auta') { toast(w.typ === 'tankowanie' ? 'Tankowanie zapisane' : 'Licznik auta zapisany'); load(); }
      else { toast('Rozpoznano: ' + (w.typ || 'inne') + ' – przetworzone jak w bocie'); load(); }
    } catch (e) { toast(blad(e)); }
    ST.trwa = false; render();
  }
  // odpowiedź bota (tankowanie, licznik) w aplikacji zamiast w Telegramie
  function komunikaty(w) {
    const a = document.getElementById('ark');
    a.innerHTML = '<div class="tlo" onclick="arkZamknij()"></div><div class="ar"><h4>' + I('fuel', 1) + ' ' + (w.typ === 'licznik_auta' ? 'Licznik auta' : 'Tankowanie') + '</h4>' +
      w.komunikaty.map(t => '<div class="row"><div class="g" style="white-space:pre-line">' + esc(t) + '</div></div>').join('') +
      '<div class="ab" style="margin-top:12px"><button class="btn" onclick="arkZamknij()">OK</button></div></div>';
    a.classList.add('on');
  }

  // 15.11.2026: PDF albo zdjęcia. Kilka zdjęć = kilka stron JEDNEGO dokumentu → aplikacja sama skleja PDF.
  window.wydPlik = async function (inp) {
    const fs = Array.from(inp.files || []); inp.value = '';
    if (!fs.length || ST.trwa) return;
    const pdf = fs.find(f => /pdf/i.test(f.type) || /\.pdf$/i.test(f.name));
    if (pdf) { const x = await doB64(pdf).catch(e => toast(blad(e))); if (x) await wyslijDok(x, pdf.name); return; }
    await dodajStrony(fs);
  };
  async function dodajStrony(fs) {
    ST.strony = ST.strony || [];
    for (const f of fs) {
      try { const x = await doB64(f); const wh = await wymiary(x.b64); ST.strony.push({ b64: x.b64, w: wh[0], h: wh[1] }); }
      catch (e) { toast(blad(e)); }
    }
    strony();
  }
  window.wydStrona = async inp => { const fs = Array.from(inp.files || []); inp.value = ''; if (fs.length) await dodajStrony(fs); };
  window.wydStronaUsun = i => { ST.strony.splice(i, 1); if (ST.strony.length) strony(); else { ST.strony = null; arkZamknij(); } };
  window.wydStronyAnuluj = () => { ST.strony = null; arkZamknij(); };
  window.wydStronyWyslij = async () => {
    const s = ST.strony; if (!s || !s.length) return;
    ST.strony = null; arkZamknij();
    await wyslijDok({ b64: pdfZJpeg(s), mime: 'application/pdf' }, 'dokument_' + Date.now() + '.pdf');
  };
  function wymiary(b64) {
    return new Promise((ok, no) => { const im = new Image(); im.onload = () => ok([im.naturalWidth, im.naturalHeight]); im.onerror = () => no(new Error('to nie jest zdjęcie')); im.src = 'data:image/jpeg;base64,' + b64; });
  }
  function strony() {
    const s = ST.strony || [], a = document.getElementById('ark');
    a.innerHTML = '<div class="tlo"></div><div class="ar"><h4>' + I('doc', 1) + ' Dokument · ' + s.length + ' ' + (s.length === 1 ? 'strona' : s.length < 5 ? 'strony' : 'stron') + '</h4>' +
      '<div class="mute" style="margin:-2px 0 10px">Faktura ma więcej stron? Dodaj je – wyślę jeden PDF.</div>' +
      '<div class="wy-st">' + s.map((x, i) => '<div><img src="data:image/jpeg;base64,' + x.b64 + '" alt="strona ' + (i + 1) + '"><button class="ib" aria-label="Usuń stronę" onclick="wydStronaUsun(' + i + ')">' + I('trash', 1) + '</button><span>' + (i + 1) + '</span></div>').join('') +
      '<label class="wy-plus"><input type="file" accept="image/*" capture="environment" hidden onchange="wydStrona(this)">' + I('plus', 1) + '<span>Strona</span></label></div>' +
      '<div class="ab" style="margin-top:14px"><button class="btn2" onclick="wydStronyAnuluj()">Anuluj</button>' +
      '<button class="btn" onclick="wydStronyWyslij()">' + I('check', 1) + 'Wyślij PDF</button></div></div>';
    a.classList.add('on');
  }
  // prosty PDF z JPEG-ów: każda strona A4, zdjęcie wpasowane z marginesem 20 pt
  function pdfZJpeg(strony) {
    const enc = new TextEncoder(), czesci = [], offs = [];
    let len = 0;
    const add = x => { const b = typeof x === 'string' ? enc.encode(x) : x; czesci.push(b); len += b.length; };
    const bajty = b64 => { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
    const obj = (id, body) => { offs[id] = len; add(id + ' 0 obj\n' + body + '\nendobj\n'); };
    const n = strony.length, W = 595.28, H = 841.89, M = 20;
    add('%PDF-1.4\n');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, '<< /Type /Pages /Count ' + n + ' /Kids [' + strony.map((_, i) => (3 + 3 * i) + ' 0 R').join(' ') + '] >>');
    strony.forEach((p, i) => {
      const id = 3 + 3 * i, sk = Math.min((W - 2 * M) / p.w, (H - 2 * M) / p.h), dw = p.w * sk, dh = p.h * sk;
      const x = ((W - dw) / 2).toFixed(2), y = (H - M - dh).toFixed(2);
      obj(id, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + W + ' ' + H + '] /Resources << /XObject << /Im0 ' + (id + 2) + ' 0 R >> >> /Contents ' + (id + 1) + ' 0 R >>');
      const c = 'q ' + dw.toFixed(2) + ' 0 0 ' + dh.toFixed(2) + ' ' + x + ' ' + y + ' cm /Im0 Do Q';
      obj(id + 1, '<< /Length ' + c.length + ' >>\nstream\n' + c + '\nendstream');
      const jpg = bajty(p.b64);
      offs[id + 2] = len;
      add((id + 2) + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + p.w + ' /Height ' + p.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpg.length + ' >>\nstream\n');
      add(jpg); add('\nendstream\nendobj\n');
    });
    const xref = len, ile = 3 + 3 * n;
    let t = 'xref\n0 ' + ile + '\n0000000000 65535 f \n';
    for (let i = 1; i < ile; i++) t += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
    add(t + 'trailer\n<< /Size ' + ile + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
    const wsz = new Uint8Array(len); let o = 0; czesci.forEach(b => { wsz.set(b, o); o += b.length; });
    let bin = ''; for (let i = 0; i < wsz.length; i += 32768) bin += String.fromCharCode.apply(null, wsz.subarray(i, i + 32768));
    return btoa(bin);
  }
  window.wydPdfTest = pdfZJpeg;   // do testów

  // ---- „Wyślij rozliczenie”: zawsze JEDEN miesiąc; druk zaliczki + skany przez systemowe Udostępnij ----
  window.wydRozliczenie = async function (mies) {
    const wys = ((D.wyslano || {}).zaliczka || {})[mies];
    if (wys && !confirm('Rozliczenie za ten miesiąc wysłano już ' + dt(wys) + '. Przygotować jeszcze raz?')) return;
    const a = document.getElementById('ark');
    a.innerHTML = '<div class="tlo"></div><div class="ar"><h4>' + I('send', 1) + ' Rozliczenie · ' + nazwaMies(mies) + '</h4><div class="mute">Przygotowuję druk zaliczki i skany jako PDF…</div></div>';
    a.classList.add('on');
    try {
      const j = await api('rozliczenie', { mies: mies });
      const r = j.wynik || {};
      const plik = x => { const s = atob(x.b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return new File([u], x.nazwa, { type: x.mime }); };
      let pliki = (r.pliki || []).map(plik), zamiana = false;
      if (navigator.canShare && !navigator.canShare({ files: pliki }) && r.drukPdf) { pliki = [plik(r.drukPdf)].concat(pliki.slice(1)); zamiana = true; }
      ST.roz = { mies: mies, pliki: pliki, temat: r.temat, tresc: r.tresc, drukPdf: r.drukPdf && !zamiana ? plik(r.drukPdf) : null, xlsx: r.pliki && r.pliki[0] ? plik(r.pliki[0]) : null, r: r, zamiana: zamiana };
      rozArkusz();
    } catch (e) {
      a.innerHTML = '<div class="tlo" onclick="arkZamknij()"></div><div class="ar"><h4>Rozliczenie</h4><div class="mute">' + esc(blad(e)) + '</div><div class="ab" style="margin-top:12px"><button class="btn2" onclick="arkZamknij()">Zamknij</button></div></div>';
    }
  };
  function rozArkusz() {
    const R = ST.roz, r = R.r, a = document.getElementById('ark');
    const mozna = navigator.canShare && navigator.canShare({ files: R.pliki });
    a.innerHTML = '<div class="tlo" onclick="arkZamknij()"></div><div class="ar"><h4>' + I('send', 1) + ' Rozliczenie · ' + nazwaMies(R.mies) + ' ' + Math.floor(R.mies / 100) + '</h4>' +
      '<div class="row"><div class="g">Faktur: <b>' + (r.ile || 0) + '</b> · razem <b>' + z2(r.suma) + '</b></div></div>' +
      R.pliki.map(f => '<div class="row"><div class="g">' + I('doc', 1) + ' ' + esc(f.name) + '</div><span class="mute">' + Math.max(1, Math.round(f.size / 1024)) + ' KB</span></div>').join('') +
      ((r.brakSkanu || []).length ? '<div class="mute" style="color:var(--org)">Bez skanu: ' + esc(r.brakSkanu.join(', ')) + '</div>' : '') +
      (R.zamiana ? '<div class="mute">Telefon nie przyjmuje xlsx w Udostępnij – druk idzie jako PDF.' + (R.xlsx ? ' <a onclick="wydXlsx()">Pobierz druk w xlsx</a>' : '') + '</div>' : '') +
      '<div class="ab" style="margin-top:14px"><button class="btn2" onclick="arkZamknij()">Zamknij</button>' +
      (mozna ? '<button class="btn" onclick="wydUdostepnij()">' + I('send', 1) + 'Udostępnij…</button>' : '<button class="btn" onclick="wydPobierz()">' + I('doc', 1) + 'Pobierz pliki</button>') + '</div>' +
      '<div class="note" style="margin-top:8px">' + (mozna ? 'Wybierz Outlook, Gmail albo inną aplikację – adresata wpiszesz sam.' : 'Ta przeglądarka nie udostępnia plików – pobierz i dołącz do maila.') + '</div></div>';
  }
  window.wydUdostepnij = async function () {
    const r = ST.roz; if (!r) return;
    try { await navigator.share({ files: r.pliki, title: r.temat, text: r.tresc }); }
    catch (e) {
      if (e && e.name === 'AbortError') return;
      // Chrome na Androidzie potrafi powiedzieć canShare=tak, a potem odrzucić xlsx („Permission denied”) → druk jako PDF
      if (r.drukPdf) { r.pliki = [r.drukPdf].concat(r.pliki.slice(1)); r.drukPdf = null; r.zamiana = true; rozArkusz(); toast('Telefon nie przepuścił xlsx – druk jako PDF, naciśnij jeszcze raz'); return; }
      toast('Nie udało się udostępnić: ' + e.message); return;
    }
    oznaczWyslane(r.mies);
  };
  window.wydXlsx = function () {
    const f = ST.roz && ST.roz.xlsx; if (!f) return;
    const u = URL.createObjectURL(f), l = document.createElement('a'); l.href = u; l.download = f.name; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000);
  };
  window.wydPobierz = function () {
    const r = ST.roz; if (!r) return;
    r.pliki.forEach(f => { const u = URL.createObjectURL(f), l = document.createElement('a'); l.href = u; l.download = f.name; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); });
    if (confirm('Pliki pobrane. Oznaczyć rozliczenie jako wysłane?')) oznaczWyslane(r.mies);
  };
  function oznaczWyslane(mies) {
    api('wyslano', { typ: 'zaliczka', mies: mies, tak: 1 }).then(() => {
      D.wyslano = D.wyslano || { premia: {}, zaliczka: {} }; D.wyslano.zaliczka[mies] = new Date().toISOString().slice(0, 10);
      ST.roz = null; arkZamknij(); toast('Rozliczenie ' + nazwaMies(mies) + ' – wysłane'); render();
    }).catch(e => toast(blad(e)));
  }

  // karta rozpoznanej faktury – wszystko do poprawienia przed zapisem
  function karta() {
    const w = ST.karta; if (!w) return;
    const iso = isoZ(w.data), opcje = [];
    (w.miejsca || []).concat(miejscaDnia(iso)).forEach(x => { if (x && opcje.indexOf(x) < 0) opcje.push(x); });
    const wyb = opcje.length === 1 ? opcje[0] : '';
    const a = document.getElementById('ark');
    a.innerHTML = '<div class="tlo"></div><div class="ar wy-k"><h4>' + I('money', 1) + ' Faktura ' + esc(w.numer || '') + '</h4>' +
      (w.sprzedawca ? '<div class="mute" style="margin:-2px 0 8px">' + esc(w.sprzedawca) + '</div>' : '') +
      '<label>Za co</label><input class="as-in" id="wyZa" value="' + esc(w.za) + '">' +
      '<div class="wy-2"><div><label>Kwota brutto, zł</label><input class="as-in" id="wyKw" inputmode="decimal" value="' + esc(String(w.brutto).replace('.', ',')) + '"></div>' +
      '<div><label>Data</label><input class="as-in" id="wyDt" type="date" value="' + esc(iso) + '" onchange="wydOpcje(this.value)"></div></div>' +
      '<label>Numer</label><input class="as-in" id="wyNr" value="' + esc(w.numer) + '">' +
      '<label>Miejsce montażu / użycia</label><div class="wy-ch" id="wyCh">' + chipy(opcje, wyb) + '</div>' +
      '<input class="as-in" id="wyMi" placeholder="albo wpisz sam" value="' + esc(wyb) + '" oninput="wydChipOff()">' +
      (w.url ? '<div style="margin-top:6px"><a class="mute" href="' + esc(w.url) + '" target="_blank">' + I('doc', 1) + ' zobacz skan</a></div>' : '') +
      '<div class="ab" style="margin-top:14px"><button class="btn2" onclick="wydZapisz(0,this)">Anuluj</button>' +
      '<button class="btn" onclick="wydZapisz(1,this)">' + I('check', 1) + 'Zapisz</button></div></div>';
    a.classList.add('on');
  }
  const chipy = (o, wyb) => o.length ? o.map(x => '<button class="pill' + (x === wyb ? ' on' : '') + '" onclick="wydChip(this)">' + esc(x) + '</button>').join('')
    : '<span class="mute">Tego dnia nie ma prac w systemie – wpisz miejsce albo zostaw puste.</span>';
  window.wydChip = b => { document.querySelectorAll('#wyCh .pill').forEach(x => x.classList.toggle('on', x === b && !b.classList.contains('on')));
    const on = document.querySelector('#wyCh .pill.on'); document.getElementById('wyMi').value = on ? on.textContent : ''; };
  window.wydChipOff = () => document.querySelectorAll('#wyCh .pill').forEach(x => x.classList.remove('on'));
  window.wydOpcje = iso => { const e = document.getElementById('wyCh'); if (e) e.innerHTML = chipy(miejscaDnia(iso), ''); };

  window.wydZapisz = function (tak, b) {
    const w = ST.karta; if (!w) return;
    const v = id => (document.getElementById(id) || {}).value || '';
    const par = { key: w.key, tak: tak ? 1 : 0 };
    if (tak) Object.assign(par, { za: v('wyZa').trim(), brutto: v('wyKw').trim(), data: plZ(v('wyDt')), numer: v('wyNr').trim(), miejsce: v('wyMi').trim() });
    document.querySelectorAll('#ark .ab button').forEach(x => x.disabled = true);
    api('fakturaZapisz', par).then(j => {
      const r = j.wynik || {};
      ST.karta = null; arkZamknij();
      if (r.zapisane) {
        const iso = isoZ(par.data) || dzisIso(), d = new Date(iso);
        D.zaliczka.push({ d: iso, nr: par.numer, za: par.za, kwota: +String(par.brutto).replace(',', '.') || 0, miejsce: par.miejsce, mies: d.getFullYear() * 100 + d.getMonth() + 1, id: '' });
        toast('Zapisane' + (r.stan ? ' · ' + r.stan.replace(/^[^:]*:\s*/, '') : ''));
        render(); load();
      } else toast(r.anulowane ? 'Nie zapisałem, skan usunięty' : 'Już przetworzone');
    }).catch(e => { document.querySelectorAll('#ark .ab button').forEach(x => x.disabled = false); toast(blad(e)); });
  };

  // dopisanie / zmiana miejsca zapisanej faktury
  window.wydMiejsce = function (id) {
    const z = (D.zaliczka || []).find(x => x.id === id); if (!z) return toast('Odśwież dane i spróbuj jeszcze raz');
    const opcje = miejscaDnia(z.d);
    const a = document.getElementById('ark');
    a.innerHTML = '<div class="tlo" onclick="arkZamknij()"></div><div class="ar wy-k"><h4>Miejsce · ' + esc(z.za) + '</h4>' +
      '<div class="mute" style="margin:-2px 0 8px">' + dt(z.d) + ' · ' + z2(z.kwota) + '</div>' +
      '<div class="wy-ch" id="wyCh">' + chipy(opcje, z.miejsce) + '</div>' +
      '<input class="as-in" id="wyMi" placeholder="albo wpisz sam" value="' + esc(z.miejsce || '') + '" oninput="wydChipOff()">' +
      '<div class="ab" style="margin-top:14px"><button class="btn2" onclick="arkZamknij()">Anuluj</button>' +
      '<button class="btn" onclick="wydMiejsceZapisz(\'' + jsq(id) + '\',this)">' + I('check', 1) + 'Zapisz</button></div></div>';
    a.classList.add('on');
  };
  window.wydMiejsceZapisz = function (id, b) {
    const m = document.getElementById('wyMi').value.trim(); b.disabled = true;
    api('zaliczkaMiejsce', { id: id, miejsce: m }).then(j => {
      const z = D.zaliczka.find(x => x.id === id); if (z && j.wynik) z.miejsce = m;
      arkZamknij(); toast(j.wynik ? 'Miejsce zapisane' : 'Nie znalazłem tej faktury w arkuszu'); render();
    }).catch(e => { b.disabled = false; toast(blad(e)); });
  };

  // style modułu
  const css = document.createElement('style');
  css.textContent =
    '.wy-m{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px} .wy-m b{font-size:17px;text-transform:capitalize;text-align:center;flex:1}' +
    '.wy-m .ib[disabled]{opacity:.3}' +
    '.wy-bar{height:8px;border-radius:99px;background:var(--fill);overflow:hidden} .wy-bar i{display:block;height:100%;border-radius:99px;background:var(--grn);transition:width .6s var(--spring)}' +
    '.wy-foto{display:flex;width:100%;min-height:58px;font-size:18px;margin:2px 0 10px;cursor:pointer} .wy-foto.dis{opacity:.6;pointer-events:none}' +
    '.wy-bm{box-shadow:inset 3px 0 0 var(--org)} .wy-dod{color:var(--org);font-weight:600;font-size:14px;cursor:pointer}' +
    '.wy-k label{display:block;font-size:13px;color:var(--mute);margin:10px 0 4px} .wy-k .as-in{width:100%;box-sizing:border-box}' +
    '.wy-2{display:grid;grid-template-columns:1fr 1fr;gap:10px}' +
    '.wy-ch{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px} .wy-ch .pill{border:0;cursor:pointer;font-size:14px;padding:7px 12px}' +
    '.wy-ch .pill.on{background:var(--acc);color:#fff}' +
    '.wy-roz{display:flex;width:100%;margin-top:12px} .wy-roz.wys{background:var(--acc2);color:var(--acc);box-shadow:none}' +
    '.wy-st{display:grid;grid-template-columns:repeat(3,1fr);gap:8px} .wy-st>div{position:relative;border-radius:12px;overflow:hidden;background:var(--fill);aspect-ratio:3/4}' +
    '.wy-st img{width:100%;height:100%;object-fit:cover;display:block} .wy-st .ib{position:absolute;top:4px;right:4px;width:30px;height:30px;color:var(--red)}' +
    '.wy-st>div span{position:absolute;left:6px;bottom:4px;font-weight:700;color:#fff;text-shadow:0 1px 3px #000}' +
    '.wy-plus{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;border-radius:12px;border:2px dashed var(--line);color:var(--acc);font-weight:600;cursor:pointer;aspect-ratio:3/4}';
  document.head.appendChild(css);

  window.MODULY = window.MODULY || {};
  window.MODULY.wydatki = { widok: widok };

  // Asystent przeniesiony z dolnego paska do „Więcej” – dostaje nagłówek z powrotem
  const A = window.MODULY.asystent;
  if (A && !A.opak) { const w = A.widok; A.widok = () => naglowek('spark', 'Asystent', 'diagnoza krok po kroku') + w(); A.opak = 1; }
})();
