/*
 * opisy.js – 20.11.2026: MOJE opisy i zdjęcia części z Magazynu („co to jest za część”).
 * Widzi tylko serwisant: Magazyn (lista + karta części), Zadania → Zamówienia (lista „Do zamówienia”, podpowiedzi „Dodaj pozycję”), druk „Dla mnie”.
 * NIE trafia do SMS do magazyniera ani do druku „Dla wszystkich”. Kod i nazwa katalogowa się nie zmieniają.
 * Bot: łatka Opisy.gs (POST ?api=opisy, D.opisy w danych). Bez łatki aplikacja działa jak dawniej, notatki czekają w telefonie.
 * Synchronizacja telefon ↔ tablet: wygrywa nowszy zm (ISO), jak stan zamówień.
 * LS czytamy leniwie – tworzy go główny skrypt PÓŹNIEJ.
 */
(function () {
  let L = null, M = null, wyslijT = null, miniPobrane = false, bezLatki = false;
  const pelne = {};
  const ld = (k, d) => { try { return JSON.parse(LS.get(k) || '') || d; } catch (e) { return d; } };
  const lok = () => { if (!L) L = ld('opisy', {}); return L; };
  const min = () => { if (!M) M = ld('opMini', {}); return M; };
  const zapL = () => LS.set('opisy', JSON.stringify(lok()));
  const zapM = () => LS.set('opMini', JSON.stringify(min()));
  const teraz = () => new Date().toISOString();

  async function post(body) {
    const r = await fetch(API + '?api=opisy', { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ k: K }, body)) });
    const j = await r.json();
    if (!j.ok) { if (/Nieznana|akcja|api/i.test(j.blad || '')) bezLatki = true; throw new Error(j.blad || 'błąd serwera'); }
    return j.wynik;
  }
  const brakLatki = () => toast('Ta funkcja jeszcze się włącza (próby na żywym systemie) – pojawi się sama, zwykle w ciągu doby. To nie błąd. Notatka zostaje w telefonie.');

  // stan jednej części: nowszy z telefonu albo z serwera
  function opis(kod) {
    const s = ((D && D.opisy) || []).find(x => x.kod === kod), l = lok()[kod];
    if (l && (!s || String(l.zm) >= String(s.zm))) return l;
    return s || null;
  }
  window.opisTxt = kod => { const o = opis(kod); return o ? String(o.o || '') : ''; };
  const miniSrc = kod => { const m = min()[kod], o = opis(kod); return o && o.f && m && m.b ? 'data:image/jpeg;base64,' + m.b : ''; };

  // po każdym wczytaniu danych (index.html → load): wyślij oczekujące, dociągnij miniatury
  window.opisScal = function () {
    if (!D || !Array.isArray(D.opisy)) return;   // bot bez łatki
    bezLatki = false;
    const l = lok();
    Object.keys(l).forEach(kod => {
      const s = D.opisy.find(x => x.kod === kod);
      if (s && String(s.zm) > String(l[kod].zm)) delete l[kod];   // serwer nowszy
      else if (!l[kod].p) delete l[kod];                         // już zapisane
    });
    zapL();
    if (Object.keys(l).some(k => l[k].p)) wyslij();
    const brak = D.opisy.some(x => x.f && (!min()[x.kod] || String(min()[x.kod].zm) < String(x.zm)));
    if (brak && !miniPobrane) { miniPobrane = true; pobierzMini().then(() => { if (typeof render === 'function') render(); }).catch(() => { miniPobrane = false; }); }
  };
  async function pobierzMini() {
    const w = await post({ akcja: 'mini' }), m = min();
    Object.keys(m).forEach(k => { if (!w[k]) delete m[k]; });
    Object.keys(w).forEach(k => { const o = opis(k); m[k] = { zm: o ? o.zm : '', b: w[k] }; });
    zapM();
  }

  // ---------- tekst ----------
  window.opisPisz = function (kod, v) {
    const o = opis(kod) || {};
    lok()[kod] = { kod: kod, o: String(v || '').slice(0, 1000), f: o.f ? 1 : 0, zm: teraz(), p: 1 };
    zapL();
    clearTimeout(wyslijT); wyslijT = setTimeout(wyslij, 1500);
  };
  window.opisFlush = () => { clearTimeout(wyslijT); return wyslij(); };
  async function wyslij() {
    const l = lok(), kody = Object.keys(l).filter(k => l[k].p);
    for (const kod of kody) {
      const x = l[kod];
      try {
        const w = await post({ akcja: 'zapisz', kod: kod, o: x.o, zm: x.zm });
        if (l[kod] !== x) continue;   // w międzyczasie nowa zmiana
        if (!w.zapisano) toast('Na drugim urządzeniu jest nowsza notatka – biorę tamtą');
        D.opisy = (D.opisy || []).filter(s => s.kod !== kod).concat([{ kod: kod, o: w.o, f: w.f, zm: w.zm }]);
        delete l[kod];
      } catch (e) { if (bezLatki) { brakLatki(); break; } }
    }
    zapL();
  }

  // ---------- zdjęcie ----------
  function zmniejsz(plik) {
    return new Promise((ok, zle) => {
      const fr = new FileReader();
      fr.onerror = zle;
      fr.onload = () => {
        const im = new Image();
        im.onerror = zle;
        im.onload = () => {
          const rys = (bok, q) => { const s = Math.min(1, bok / Math.max(im.width, im.height)), c = document.createElement('canvas');
            c.width = Math.round(im.width * s); c.height = Math.round(im.height * s); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
            return c.toDataURL('image/jpeg', q).split(',')[1]; };
          ok({ foto: rys(1280, 0.72), mini: rys(180, 0.6) });
        };
        im.src = fr.result;
      };
      fr.readAsDataURL(plik);
    });
  }
  window.opisFotoPlik = async function (inp, kod) {
    const f = inp.files && inp.files[0]; inp.value = ''; if (!f) return;
    toast('Wysyłam zdjęcie…');
    try {
      clearTimeout(wyslijT); await wyslij();   // najpierw tekst, inaczej zdjęcie (nowszy zm) zatrze notatkę
      const z = await zmniejsz(f), zm = teraz();
      const w = await post({ akcja: 'foto', kod: kod, foto: z.foto, mini: z.mini, zm: zm });
      if (!w.zapisano) { toast('Na drugim urządzeniu jest nowsza wersja – odśwież'); return; }
      D.opisy = (D.opisy || []).filter(s => s.kod !== kod).concat([{ kod: kod, o: w.o, f: 1, zm: w.zm }]);
      if (lok()[kod] && !lok()[kod].p) delete lok()[kod]; else if (lok()[kod]) lok()[kod].f = 1;
      zapL(); min()[kod] = { zm: w.zm, b: z.mini }; zapM(); pelne[kod] = z.foto;
      odswiezKarte(kod); toast('Zdjęcie zapisane');
    } catch (e) { if (bezLatki) brakLatki(); else blad(e); }
  };
  window.opisFotoUsun = async function (kod) {
    if (!confirm('Usunąć zdjęcie tej części?')) return;
    try {
      const w = await post({ akcja: 'usunFoto', kod: kod, zm: teraz() });
      D.opisy = (D.opisy || []).filter(s => s.kod !== kod).concat([{ kod: kod, o: w.o, f: 0, zm: w.zm }]);
      if (lok()[kod]) lok()[kod].f = 0; zapL(); delete min()[kod]; zapM(); delete pelne[kod];
      odswiezKarte(kod); toast('Zdjęcie usunięte');
    } catch (e) { if (bezLatki) brakLatki(); else blad(e); }
  };
  window.opisFotoPokaz = async function (kod) {
    let d = document.getElementById('opPel');
    if (!d) { d = document.createElement('div'); d.id = 'opPel'; d.onclick = () => d.classList.remove('on'); document.body.appendChild(d); }
    const m = miniSrc(kod);
    d.innerHTML = '<img src="' + (pelne[kod] ? 'data:image/jpeg;base64,' + pelne[kod] : m) + '" alt=""><div class="mute">' + (pelne[kod] ? 'dotknij, żeby zamknąć' : 'wczytuję zdjęcie…') + '</div>';
    d.classList.add('on');
    if (pelne[kod]) return;
    try { pelne[kod] = await post({ akcja: 'pobierz', kod: kod }); if (d.classList.contains('on')) { d.querySelector('img').src = 'data:image/jpeg;base64,' + pelne[kod]; d.querySelector('.mute').textContent = 'dotknij, żeby zamknąć'; } }
    catch (e) { d.querySelector('.mute').textContent = 'Nie udało się wczytać: ' + e.message; }
  };
  function odswiezKarte(kod) {
    const s = document.getElementById('opSek'); if (s) s.outerHTML = window.opisSekcja(kod);
    if (typeof render === 'function') render();
  }

  // ---------- wygląd ----------
  const CAM = '<svg class="i s" viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
  const GAL = '<svg class="i s" viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="10" r="1.6" fill="currentColor"/><path d="M5 17l4.5-4.5 3 3 2.5-2.5L19 17" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
  // sekcja w karcie części (zamow.js → zamPlanEdytuj)
  window.opisSekcja = function (kod) {
    const o = opis(kod) || {}, m = miniSrc(kod), k = jsq(kod);
    return '<div id="opSek"><h4 style="margin:14px 0 4px;font-size:15px">Moja notatka</h4>' +
      '<div class="mute" style="font-size:13px;margin-bottom:6px">Widzisz tylko Ty. Nie idzie do SMS ani do druku dla biura.</div>' +
      '<textarea id="opT" rows="3" placeholder="np. mała czarna pompka pod szafą chemii" oninput="opisPisz(\'' + k + '\',this.value)">' + esc(o.o || '') + '</textarea>' +
      (o.f ? '<div class="opfw">' + (m ? '<img class="opfm" src="' + m + '" alt="" onclick="opisFotoPokaz(\'' + k + '\')">' : '<button class="btn2" onclick="opisFotoPokaz(\'' + k + '\')">' + CAM + ' Pokaż zdjęcie</button>') +
        '<button class="btn2 zan" onclick="opisFotoUsun(\'' + k + '\')">Usuń zdjęcie</button></div>' : '') +
      '<div class="ab2 opfoto"><label class="btn2" style="display:inline-flex">' + CAM + (o.f ? ' Nowe zdjęcie' : ' Zrób zdjęcie') + '<input type="file" accept="image/*" capture="environment" hidden onchange="opisFotoPlik(this,\'' + k + '\')"></label>' +
      '<label class="btn2" style="display:inline-flex">' + GAL + 'Wgraj z galerii<input type="file" accept="image/*" hidden onchange="opisFotoPlik(this,\'' + k + '\')"></label></div></div>';
  };
  // miniatura na początku wiersza Magazynu
  window.opisMiniHtml = function (kod) {
    const o = opis(kod); if (!o || !o.f) return '';
    const m = miniSrc(kod);
    return m ? '<img class="opm" src="' + m + '" alt="" onclick="event.stopPropagation();opisFotoPokaz(\'' + jsq(kod) + '\')">' : '<span class="opm opm0">' + CAM + '</span>';
  };
  // linijka z notatką pod nazwą (Magazyn, Do zamówienia)
  window.opisLinia = function (kod) {
    if (!kod) return '';
    const o = opis(kod); if (!o || (!o.o && !o.f)) return '';
    return '<div class="opn">' + (o.o ? esc(o.o) : '') + (o.f && !o.o ? 'jest zdjęcie' : '') + (o.f && o.o ? ' · ' + CAM : '') + '</div>';
  };

  // ---------- druk ----------
  const DRUK_CSS = '.op{font-family:Arial,Helvetica,sans-serif;color:#000;font-size:9.5pt}' +
    '.op h1{font-size:13pt;margin:0 0 1mm}.op .pod{font-size:9pt;margin:0 0 3mm}' +
    '.op table{width:100%;border-collapse:collapse}.op th,.op td{border:.3mm solid #000;padding:1mm 1.5mm;vertical-align:middle;text-align:left}' +
    '.op th{background:#eee;font-size:8.5pt}.op tr{page-break-inside:avoid}.op td.lp{width:7mm;text-align:right}.op td.kd{width:30mm;font-family:monospace;font-size:9pt}' +
    '.op td.st{width:16mm}.op td.ft{width:14mm;padding:.5mm;text-align:center}.op td.ft img{width:13mm;height:13mm;object-fit:cover;display:block}' +
    '.op .po{font-size:8pt;color:#333;margin-top:.5mm}';
  window.opisDruk = async function (dlaMnie) {
    const l = ((D && D.magazyn) || []).filter(m => m.kod && m.nazwa !== 'RAZEM');
    if (!l.length) return toast('Brak pozycji w Magazynie');
    if (dlaMnie && D && Array.isArray(D.opisy) && D.opisy.some(x => x.f && !min()[x.kod])) { toast('Wczytuję zdjęcia…'); try { await pobierzMini(); } catch (e) { /* bez miniatur */ } }
    const fot = dlaMnie && l.some(m => miniSrc(m.kod));
    const wiersze = l.map((m, i) => {
      const o = dlaMnie ? opis(m.kod) : null, src = dlaMnie ? miniSrc(m.kod) : '';
      return '<tr><td class="lp">' + (i + 1) + '</td><td class="kd">' + esc(m.kod) + '</td><td>' + esc(m.nazwa) + (o && o.o ? '<div class="po">' + esc(o.o) + '</div>' : '') + '</td>' +
        (fot ? '<td class="ft">' + (src ? '<img src="' + src + '" alt="">' : '') + '</td>' : '') + '<td class="st"></td></tr>';
    }).join('');
    let d = document.getElementById('opDruk');
    if (!d) { d = document.createElement('div'); d.id = 'opDruk'; document.body.appendChild(d); }
    d.innerHTML = '<style>@media screen{#opDruk{display:none}}@media print{@page{size:A4;margin:9mm 10mm}body>*:not(#opDruk){display:none!important}body{background:#fff!important}#opDruk{display:block}}' + DRUK_CSS + '</style>' +
      '<div class="op"><h1>Magazyn w aucie – inwentaryzacja' + (dlaMnie ? ' (moja ściąga)' : '') + '</h1><div class="pod">' + new Date().toLocaleDateString('pl-PL') + ' · ' + l.length + ' pozycji · ' + esc(LS.get('n') || '') + '</div>' +
      '<table><thead><tr><th>Lp</th><th>Kod</th><th>Nazwa' + (dlaMnie ? ' / moja notatka' : '') + '</th>' + (fot ? '<th>Foto</th>' : '') + '<th>Stan</th></tr></thead><tbody>' + wiersze + '</tbody></table></div>';
    const t = document.title; document.title = 'Magazyn_' + (dlaMnie ? 'dla_mnie_' : '') + dzisIso();
    setTimeout(() => { window.print(); document.title = t; }, 80);
  };

  const css = document.createElement('style');
  css.textContent = '.opfoto{display:flex;align-items:stretch;gap:10px;margin-top:10px}.opfoto .btn2{flex:1 1 0;justify-content:center;min-height:44px;white-space:nowrap}.opfoto .btn2 .i{flex:0 0 auto}' +
    '.opn{font-size:13px;color:var(--mute);margin-top:2px;line-height:1.3;font-style:italic}.opn .i{width:13px;height:13px;vertical-align:-2px}' +
    '.opm{flex:0 0 40px;width:40px;height:40px;border-radius:9px;object-fit:cover;margin-right:10px;cursor:zoom-in;background:var(--fill)}' +
    '.opm0{display:flex;align-items:center;justify-content:center;color:var(--mute)}' +
    '.opfw{display:flex;align-items:center;gap:10px;margin-top:8px}.opfm{width:84px;height:84px;border-radius:12px;object-fit:cover;cursor:zoom-in}' +
    '#opPel{position:fixed;inset:0;z-index:999;background:rgba(0,0,0,.88);display:none;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:16px}' +
    '#opPel.on{display:flex}#opPel img{max-width:100%;max-height:82vh;border-radius:10px}#opPel .mute{color:#ccc}';
  document.head.appendChild(css);
})();
