/* listaprz.js – 18.11.2026: lista przeglądów z biura (terminy Orlen) → arkusz Myjnie (kol. J = termin, kol. T = data wpisu listy).
 * Dwie drogi:
 *  1) plik Excel (xlsx) – z przycisku albo „Udostępnij → Serwis myjni” z Outlooka; czytany w telefonie (xlsx.mini.min.js, ładowany dopiero przy potrzebie),
 *     a gdy układ pliku jest nieznany – tekst tabeli idzie do bota i czyta go Claude;
 *  2) zrzut ekranu tylko moich wierszy – czyta Claude w bocie (POST api=przLista, akcja foto).
 * Zawsze najpierw karta do sprawdzenia (zaznacz / popraw datę), dopiero „Zapisz” wpisuje do tabeli.
 * Reguła „kto nowszy”: wzór kol. K sam wybiera – lista po przeglądzie → wygrywa biuro, przegląd po liście → liczy system.
 * Bot: łatka 2026-11-18_lista_przegladow (ListaPrz.gs). Bez niej – toast „zainstaluj aktualizację”.
 */
(function () {
  const JA = /tomcz?akowsk/i;               // moje wiersze w pliku biura
  let WYN = null;                            // { zrodlo, wiersze: [...] } – ostatni odczyt do potwierdzenia

  const p2 = n => String(n).padStart(2, '0');
  const iso = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  const plD = s => s ? s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4) : '';
  const lsGet = (k, d) => { try { return JSON.parse(LS.get(k) || 'null') || d; } catch (e) { return d; } };

  async function post(body) {
    const r = await fetch(API + '?api=przLista', { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ k: K }, body)) });
    const t = await r.text(); let j;
    try { j = JSON.parse(t); } catch (e) { throw new Error('Ta funkcja jeszcze się włącza (próby na żywym systemie) – pojawi się sama, zwykle w ciągu doby. To nie błąd.'); }
    if (!j.ok) throw new Error(/Nieznana akcja/i.test(j.blad || '') ? 'Ta funkcja jeszcze się włącza (próby na żywym systemie) – pojawi się sama, zwykle w ciągu doby. To nie błąd.' : (j.blad || 'błąd serwera'));
    return j.wynik;
  }

  // ---------- data z komórki: Date, liczba Excela, tekst dd.mm.rrrr / rrrr-mm-dd ----------
  function data(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date && !isNaN(v)) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
    if (typeof v === 'number' && v > 40000 && v < 60000) { const d = new Date(Math.round((v - 25569) * 864e5)); return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); }
    const s = String(v).trim();
    let m = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);
    if (m) { const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; return new Date(y, +m[2] - 1, +m[1]); }
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    return null;
  }

  // ---------- dopasowanie do moich myjni / innych ----------
  function znajdz(nr, tekst) {
    const lst = (D.myjnie || []).map(w => ({ w: w, moja: 1 })).concat((D.inne || []).map(w => ({ w: w, moja: 0 })));
    let hit = null;
    if (nr) hit = lst.find(x => { const k = (String(x.w.klucz || x.w.nazwa).match(/(\d{3,4})/) || [])[1]; return k && +k === +nr && /orlen|^\d|^sp/i.test(x.w.nazwa + ' ' + x.w.klucz); });
    if (!hit && tekst) hit = lst.find(x => sama(tekst, x.w));
    return hit;
  }

  // wiersz → { nr, stacja, serwisant, termin(iso), ostatni(iso), nazwa, moja, ja, teraz }
  function normuj(r) {
    const nr = r.nr ? String(r.nr).replace(/\D/g, '').slice(-4) : '';
    const hit = znajdz(nr, r.stacja || '');
    const ja = JA.test(r.serwisant || '') || !!r.ja;
    return {
      nr: nr, stacja: r.stacja || (nr ? 'SP ' + nr : ''), serwisant: r.serwisant || '', termin: r.termin || '', ostatni: r.ostatni || '',
      nazwa: hit ? hit.w.nazwa : '', moja: hit ? hit.moja : 0, ja: ja, teraz: hit && hit.moja ? (hit.w.termin || '') : '',
      wl: !!(hit && hit.moja && r.termin)       // domyślnie zaznaczone: moja myjnia z terminem
    };
  }

  // ---------- Excel w telefonie ----------
  function ladujXlsx() {
    if (window.XLSX) return Promise.resolve();
    return new Promise((ok, zle) => { const s = document.createElement('script'); s.src = 'xlsx.mini.min.js'; s.onload = ok; s.onerror = () => zle(new Error('nie wczytano czytnika Excela')); document.head.appendChild(s); });
  }
  function czytajTabele(buf) {
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    const wiersze = [], csv = [];
    const dzis = new Date(); dzis.setHours(0, 0, 0, 0);
    wb.SheetNames.forEach(nm => {
      const a = XLSX.utils.sheet_to_json(wb.Sheets[nm], { header: 1, raw: true, defval: '' });
      let kolSerw = -1, kolNr = -1;
      a.forEach((row, i) => {
        const txt = row.map(c => c instanceof Date ? plD(iso(c)) : String(c)).join(' | ');
        if (txt.replace(/[| ]/g, '')) csv.push(txt);
        // nagłówek: kolumna serwisanta i numeru stacji
        row.forEach((c, j) => { const s = String(c).toLowerCase(); if (kolSerw < 0 && /serwisant|technik|odpowiedzialn/.test(s)) kolSerw = j; if (kolNr < 0 && /(nr|numer).*(stac|sp)|^sp$|^stacja$/.test(s)) kolNr = j; });
        // numer stacji: kolumna nagłówka albo pierwsza komórka „SP 1467” / „1467”
        let nr = '';
        if (kolNr >= 0) nr = (String(row[kolNr]).match(/(\d{3,4})/) || [])[1] || '';
        if (!nr) row.some(c => { if (c instanceof Date || typeof c === 'number' && c > 9999) return false; const m = String(c).match(/^\s*(?:SP\s*)?0*(\d{3,4})\s*$/i) || String(c).match(/\bSP\s*0*(\d{3,4})\b/i); if (m) { nr = m[1]; return true; } return false; });
        if (!nr) return;
        const daty = row.map(data).filter(Boolean).sort((x, y) => x - y);
        if (!daty.length) return;
        const termin = daty[daty.length - 1], przed = daty.filter(d => d < termin);
        const serw = kolSerw >= 0 ? String(row[kolSerw]).trim() : (row.map(String).find(c => JA.test(c)) || '');
        wiersze.push({ nr: nr, stacja: row.filter(c => typeof c === 'string' && c.trim() && !data(c)).slice(0, 3).join(' · ').slice(0, 80), serwisant: serw, termin: iso(termin),
          ostatni: przed.length ? iso(przed[przed.length - 1]) : '', ja: JA.test(txt) });
      });
    });
    return { wiersze: wiersze, csv: csv };
  }

  // ---------- zdjęcie: zmniejszenie przed wysłaniem ----------
  function zmniejsz(file) {
    return new Promise((ok, zle) => {
      const img = new Image(), u = URL.createObjectURL(file);
      img.onload = () => { const s = Math.min(1, 2000 / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(u); ok(c.toDataURL('image/jpeg', 0.88).split(',')[1]); };
      img.onerror = () => { URL.revokeObjectURL(u); zle(new Error('nie da się otworzyć zdjęcia')); };
      img.src = u;
    });
  }

  function czekaj(t) {
    const a = document.getElementById('ark');
    a.innerHTML = '<div class="tlo"></div><div class="ar"><h4>' + I('cal', 1) + ' Lista z biura</h4><div class="mute" style="padding:18px 0">' + esc(t) + '</div></div>';
    a.classList.add('on');
  }

  // ---------- wejścia ----------
  window.lpPlik = async function (file) {
    if (!file) return;
    const xls = /sheet|excel/i.test(file.type || '') || /\.xlsx?$/i.test(file.name || '');
    try {
      if (xls) {
        czekaj('Czytam plik ' + (file.name || '') + '…');
        await ladujXlsx();
        const t = czytajTabele(await file.arrayBuffer());
        if (t.wiersze.length) return pokaz('xlsx', t.wiersze);
        czekaj('Nie znam układu tego pliku – czyta go Claude…');
        const w = await post({ akcja: 'tekst', tekst: t.csv.join('\n').slice(0, 60000) });
        return pokaz('xlsx', (w && w.wiersze) || [], w && w.niejasne);
      }
      czekaj('Wysyłam zrzut do odczytu… (kilkanaście sekund)');
      const w = await post({ akcja: 'foto', b64: await zmniejsz(file), mime: 'image/jpeg' });
      pokaz('foto', (w && w.wiersze) || [], w && w.niejasne);
    } catch (e) { arkZamknij(); toast(e.message); }
  };
  window.lpWybierz = function (zdj) {
    const i = document.createElement('input'); i.type = 'file';
    i.accept = zdj ? 'image/*' : '.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';
    i.onchange = () => window.lpPlik(i.files[0]); i.click();
  };

  // ---------- karta do sprawdzenia ----------
  function pokaz(zrodlo, wiersze, niejasne) {
    const l = wiersze.map(normuj).filter(r => r.termin);
    // biuro daje wiele stacji – pokazuję moje (z mojej listy albo z moim nazwiskiem); reszta zwinięta
    const moje = l.filter(r => r.moja || r.ja), reszta = l.filter(r => !(r.moja || r.ja));
    WYN = { zrodlo: zrodlo, wiersze: moje.concat(reszta), ile: moje.length, pokazReszte: false, niejasne: niejasne || '' };
    rysuj();
  }
  function wiersz(r, i) {
    const zmiana = r.teraz && r.termin && plD(r.termin) !== r.teraz;
    const reszta = String(r.stacja || '').replace(/^\s*(SP\s*)?0*\d{3,4}\s*(·\s*)?/i, '');
    const opis = r.nazwa ? skrot(r.nazwa) + (r.moja ? '' : ' · nie moja') : (r.nr ? 'SP ' + r.nr : '') + (reszta ? (r.nr ? ' · ' : '') + reszta : '') + ' · nie ma w Myjnie';
    return '<div class="row" style="display:block">' +
      '<div style="display:flex;align-items:center;gap:10px"><div class="g"><b>' + esc(opis) + '</b>' + (r.serwisant && !JA.test(r.serwisant) ? '<div class="mute">' + esc(r.serwisant) + '</div>' : '') + '</div>' +
      (r.moja ? '<input type="checkbox" ' + (r.wl ? 'checked ' : '') + 'onchange="lpZaznacz(' + i + ',this.checked)">' : '') + '</div>' +
      '<div class="mute" style="margin-top:2px">' + (r.ostatni ? 'ostatni ' + plD(r.ostatni) : '') + (r.ostatni && (r.teraz || r.moja) ? ' · ' : '') + (r.teraz ? 'w systemie ' + esc(r.teraz) : r.moja ? 'w systemie brak terminu' : '') + (zmiana ? ' → <b style="color:var(--org)">zmiana</b>' : '') + '</div>' +
      '<div style="display:flex;align-items:center;gap:8px;margin-top:6px"><span class="mute">termin z listy</span>' +
      (r.moja ? '<input type="date" value="' + esc(r.termin) + '" style="width:auto;flex:1;margin:0;max-width:200px" onchange="lpData(' + i + ',this.value)">' : '<b>' + plD(r.termin) + '</b>') + '</div></div>';
  }
  function rysuj() {
    const W = WYN, a = document.getElementById('ark'); if (!W) return;
    const moje = W.wiersze.slice(0, W.ile), reszta = W.wiersze.slice(W.ile), zazn = W.wiersze.filter(r => r.wl).length;
    let h = '<div class="tlo" onclick="arkZamknij()"></div><div class="ar"><h4>' + I('cal', 1) + ' Lista z biura</h4>' +
      '<div class="mute">' + (W.zrodlo === 'foto' ? 'Ze zrzutu ekranu – sprawdź daty z obrazkiem.' : 'Z pliku Excel.') + ' Termin wpiszę do kol. „Termin z listy”, data wpisu = dziś.</div>';
    if (W.niejasne) h += '<div class="mute" style="color:var(--org);margin-top:6px">' + I('alert', 1) + ' ' + esc(W.niejasne) + '</div>';
    h += '<div class="card" style="margin:10px 0 0;padding:4px 12px">' + (moje.length ? moje.map((r, i) => wiersz(r, i)).join('') : '<div class="empty">Nie znalazłem moich stacji' + (reszta.length ? ' – zobacz pozostałe niżej' : '') + '</div>') + '</div>';
    if (reszta.length) h += W.pokazReszte
      ? '<div class="mute" style="margin:10px 0 4px">Pozostałe stacje z listy (inni serwisanci) – tylko podgląd</div><div class="card" style="margin:0;padding:4px 12px">' + reszta.map((r, i) => wiersz(r, W.ile + i)).join('') + '</div>'
      : '<button class="btn2" style="width:100%;margin-top:8px" onclick="WYNreszta()">Pozostałe stacje z listy (' + reszta.length + ')</button>';
    h += '<div class="ab" style="margin-top:12px"><button class="btn2" onclick="arkZamknij()">Anuluj</button><button class="btn" id="lpz" ' + (zazn ? '' : 'disabled ') + 'onclick="lpZapisz()">Zapisz (' + zazn + ')</button></div></div>';
    const sc = a.querySelector('.ar') ? a.querySelector('.ar').scrollTop : 0;
    a.innerHTML = h; a.classList.add('on'); const ar = a.querySelector('.ar'); if (ar) { ar.style.animation = sc ? 'none' : ''; ar.scrollTop = sc; }
  }
  window.WYNreszta = () => { WYN.pokazReszte = true; rysuj(); };
  window.lpZaznacz = (i, v) => { WYN.wiersze[i].wl = v; const b = document.getElementById('lpz'), n = WYN.wiersze.filter(r => r.wl).length; if (b) { b.textContent = 'Zapisz (' + n + ')'; b.disabled = !n; } };
  window.lpData = (i, v) => { WYN.wiersze[i].termin = v; };

  window.lpZapisz = async function () {
    const l = WYN.wiersze.filter(r => r.wl && r.moja && r.termin), b = document.getElementById('lpz');
    if (!l.length) return;
    b.disabled = true; b.textContent = 'Zapisuję…';
    try {
      const w = await post({ akcja: 'zapisz', zrodlo: WYN.zrodlo, data: plD(dzisIso()), wiersze: l.map(r => ({ nazwa: r.nazwa, termin: plD(r.termin), serwisant: r.serwisant })) });
      const zap = (w && w.zapisane) || [];
      LS.set('lpOst', JSON.stringify({ d: dzisIso(), n: zap.length, z: WYN.zrodlo }));
      arkZamknij(); WYN = null;
      const inny = zap.filter(z => z.nastepny && z.nastepny !== z.termin);
      const n = zap.length, f = n === 1 ? 'termin' : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? 'terminy' : 'terminów';
      toast('Zapisano ' + n + ' ' + f + (inny.length ? ' · ' + inny.length + ' po przeglądzie liczy system' : ''));
      load();
    } catch (e) { b.disabled = false; b.textContent = 'Zapisz'; toast(e.message); }
  };

  // ---------- karta na zakładce Przeglądy ----------
  window.lpKarta = function () {
    const o = lsGet('lpOst', null);
    return '<div class="card"><h3>' + I('mail', 1) + 'Lista z biura</h3><div class="mute">' +
      (o ? 'Ostatnio ' + plD(o.d) + ' · zapisano ' + o.n + ' (' + (o.z === 'foto' ? 'zrzut' : 'Excel') + ')' : 'Terminy przeglądów od biura: plik Excel albo zrzut ekranu moich wierszy.') +
      ' Plik z Outlooka: „Udostępnij → Serwis myjni”.</div>' +
      '<div class="ab" style="margin-top:10px"><button class="btn2" style="flex:1" onclick="lpWybierz(0)">' + I('doc', 1) + ' Plik Excel</button>' +
      '<button class="btn2" style="flex:1" onclick="lpWybierz(1)">' + I('cam', 1) + ' Zrzut ekranu</button></div></div>';
  };
})();
