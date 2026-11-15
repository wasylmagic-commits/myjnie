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

    h += '<label class="btn wy-foto' + (ST.trwa ? ' dis' : '') + '"><input type="file" accept="image/*,application/pdf" hidden onchange="wydPlik(this)"' + (ST.trwa ? ' disabled' : '') + '>' +
      I('doc', 1) + (ST.trwa ? 'Czytam dokument…' : 'Zdjęcie dokumentu') + '</label>' +
      '<div class="note" style="text-align:center;margin:-4px 0 14px">faktura, paragon albo tankowanie Karta Flota – rozpoznam sam</div>';

    h += '<div class="card"><h3>' + I('money', 1) + 'Dokumenty · ' + nazwaMies(m) + (bezM ? ' <span class="pill o">bez miejsca: ' + bezM + '</span>' : '') + '</h3>' +
      (lista.length ? lista.map(z => {
        const bm = !String(z.miejsce || '').trim();
        return '<div class="row' + (bm ? ' wy-bm' : '') + '"><div class="g"><b>' + esc(z.za || 'bez opisu') + '</b>' +
          '<div class="mute">' + dt(z.d) + (z.nr ? ' · ' + esc(z.nr) : '') + '</div>' +
          (bm ? '<a class="wy-dod" onclick="wydMiejsce(\'' + jsq(z.id) + '\')">' + I('pin', 1) + ' dodaj miejsce</a>'
              : '<div class="mute">' + I('pin', 1) + ' ' + esc(z.miejsce) + (z.id ? ' · <a onclick="wydMiejsce(\'' + jsq(z.id) + '\')">zmień</a>' : '') + '</div>') + '</div>' +
          '<div style="text-align:right"><b>' + z2(z.kwota) + '</b>' + (z.id ? '<div><a class="mute" href="https://drive.google.com/file/d/' + encodeURIComponent(z.id) + '/view" target="_blank">skan</a></div>' : '') + '</div></div>';
      }).join('') : '<div class="mute">Brak dokumentów w tym miesiącu.</div>') + '</div>';

    // paliwo tego miesiąca – szczegóły w module Paliwo
    const mk = Math.floor(m / 100) + '-' + String(m % 100).padStart(2, '0');
    const pal = (D_.paliwo || []).filter(x => String(x.d).slice(0, 7) === mk), P = window.paliwoParam ? window.paliwoParam() : null;
    h += '<div class="card" onclick="go(\'paliwo\')" style="cursor:pointer"><h3>' + I('fuel', 1) + 'Paliwo · ' + nazwaMies(m) + '</h3><div class="kpi">' +
      '<div><b>' + zl(pal.reduce((a, x) => a + (+x.zl || 0), 0)) + '</b><span>' + pal.length + ' ' + (pal.length === 1 ? 'tankowanie' : [2, 3, 4].indexOf(pal.length % 10) >= 0 && [12, 13, 14].indexOf(pal.length % 100) < 0 ? 'tankowania' : 'tankowań') + '</span></div>' +
      '<div><b>' + (P && P.l100 ? P.l100.toFixed(2).replace('.', ',') : '—') + '</b><span>l / 100 km średnio</span></div></div>' +
      '<div class="note">Karta Flota – nie liczy się do zaliczki. Dotknij, żeby zobaczyć tankowania.</div></div>';
    return h + '</div>';
  }

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

  window.wydPlik = async function (inp) {
    const f = inp.files && inp.files[0]; inp.value = '';
    if (!f || ST.trwa) return;
    ST.trwa = true; render();
    try {
      const x = await doB64(f);
      const r = await fetch(API + '?api=dokument', { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ k: K, rid: 'w' + Date.now().toString(36), nazwa: f.name || '', mime: x.mime, b64: x.b64 }) });
      const t = await r.text(); let j;
      try { j = JSON.parse(t); } catch (e) { throw new Error('serwer nie odpowiedział poprawnie'); }
      if (!j.ok) throw new Error(j.blad || 'błąd serwera');
      const w = j.wynik || {};
      if (w.typ === 'faktura' && w.juz) toast('Faktura ' + (w.numer || '') + ' jest już zapisana');
      else if (w.typ === 'faktura' && w.key) { ST.karta = w; karta(); }
      else if (w.typ === 'tankowanie' || w.typ === 'licznik_auta') { toast(w.typ === 'tankowanie' ? 'Tankowanie zapisane' : 'Licznik auta zapisany'); load(); }
      else { toast('Rozpoznano: ' + (w.typ || 'inne') + ' – przetworzone jak w bocie'); load(); }
    } catch (e) { toast(blad(e)); }
    ST.trwa = false; render();
  };

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
    '.wy-ch .pill.on{background:var(--acc);color:#fff}';
  document.head.appendChild(css);

  window.MODULY = window.MODULY || {};
  window.MODULY.wydatki = { widok: widok };

  // Asystent przeniesiony z dolnego paska do „Więcej” – dostaje nagłówek z powrotem
  const A = window.MODULY.asystent;
  if (A && !A.opak) { const w = A.widok; A.widok = () => naglowek('spark', 'Asystent', 'diagnoza krok po kroku') + w(); A.opak = 1; }
})();
