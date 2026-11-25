/* magazyn2.js – Magazyn: dwie tabele i kontrola rozbieżności (25.11.2026).
 * „Z numerem” = główna tabela (jedyna, z której się rozliczam), „Bez numeru” = moja ręczna lista, „Rozbieżności” = różnice względem PDF biura.
 * PDF biura nic nie nadpisuje po cichu: każda różnica czeka tu na decyzję („Biuro ma rację” / „Zostaw mój”).
 * Backend: Magazyn2.gs (api=mgRozbDec, mgRozbWsz, mgBn, mgBnUsun; dane: D.magBez, D.magRozb, D.magImport).
 */
(function () {
  let TABM = 'z', BUSY = false;
  const lb = () => D.magBez || [], lr = () => D.magRozb || [], lo = () => D.magOstatnie || [];
  const fm = n => String(+n).replace('.', ',');

  window.mgzTab = function (t) { TABM = t; Q = ''; render(); window.scrollTo(0, 0); };

  window.mgzWidok = function () {
    const nr = lr().length;
    const tabs = [['z', 'Z numerem', D.magazyn.length], ['b', 'Bez numeru', lb().length], ['r', 'Rozbieżności', nr], ['o', 'Zdjęte', lo().length]];
    const seg = '<div class="seg">' + tabs.map(t => '<button class="' + (TABM === t[0] ? 'on' : '') + '" onclick="mgzTab(\'' + t[0] + '\')">' + t[1] +
      (t[2] || t[0] === 'r' ? ' <span class="mute">' + t[2] + '</span>' : '') + (t[0] === 'r' && nr ? ' <span style="color:#d93">●</span>' : '') + '</button>').join('') + '</div>';
    if (TABM === 'b') return naglowek('box', 'Magazyn', 'części bez numeru · nie liczą się w rozliczeniu') + seg + bezWidok();
    if (TABM === 'r') return naglowek('box', 'Magazyn', 'zgodność z PDF biura') + seg + rozbWidok();
    if (TABM === 'o') return naglowek('box', 'Magazyn', 'ostatnio zdjęte z raportów') + seg + ostWidok();
    return naglowek('box', 'Magazyn', D.magazyn.length + ' pozycji z numerem') + seg + magazynZ(true);
  };

  /* ---------- bez numeru ---------- */
  function bezWidok() {
    const l = lb();
    return '<div class="ab2" style="margin:0 0 10px"><button class="btn2" onclick="mgzBezForm(\'\')">' + I('plus', 1) + ' Dodaj część</button></div>' +
      '<div class="card">' + (l.length ? l.map(x => '<div class="row" style="cursor:pointer" onclick="mgzBezForm(\'' + jsq(x.id) + '\')"><div class="g">' + esc(x.nazwa) +
        (x.uwagi ? '<div class="mute">' + esc(x.uwagi) + '</div>' : '') + (x.doc ? '<div class="mute">ma być ' + fm(x.doc) + (x.ilosc < x.doc ? ' · do zamówienia' : '') + '</div>' : '') + '</div><b>' + fm(x.ilosc) + '</b></div>').join('') :
        '<div class="empty">Pusto. Tu trzymasz części, których biuro nie numeruje – np. własne zakupy.</div>') + '</div>';
  }
  window.mgzBezForm = function (id) {
    const x = lb().find(z => z.id === id) || { nazwa: '', ilosc: 1, uwagi: '', doc: '' };
    const a = document.getElementById('ark');
    a.innerHTML = '<div class="tlo" onclick="arkZamknij()"></div><div class="ar"><h4>' + (id ? 'Część bez numeru' : 'Nowa część bez numeru') + '</h4>' +
      '<input id="bzn" type="text" autocomplete="off" placeholder="Nazwa" value="' + esc(x.nazwa) + '">' +
      '<input id="bzi" class="duza" type="text" inputmode="decimal" autocomplete="off" placeholder="Ilość" value="' + esc(x.ilosc) + '">' +
      '<input id="bzd" type="text" inputmode="numeric" autocomplete="off" placeholder="Docelowo – ile ma być (puste = nie zamawiam)" value="' + esc(x.doc || '') + '">' +
      '<input id="bzu" type="text" autocomplete="off" placeholder="Uwagi (opcjonalnie)" value="' + esc(x.uwagi) + '">' +
      '<div class="ab">' + (id ? '<button class="btn2" onclick="mgzBezUsun(\'' + jsq(id) + '\')">Usuń</button>' : '<button class="btn2" onclick="arkZamknij()">Anuluj</button>') +
      '<button class="btn" id="bzb" onclick="mgzBezZapisz(\'' + jsq(id) + '\')">Zapisz</button></div></div>';
    a.classList.add('on');
    setTimeout(() => { const i = document.getElementById(id ? 'bzi' : 'bzn'); if (i) i.focus(); }, 350);
  };
  window.mgzBezZapisz = function (id) {
    const n = document.getElementById('bzn').value.trim(), b = document.getElementById('bzb');
    if (!n) { toast('Podaj nazwę'); return; }
    const par = { id: id, nazwa: n, ilosc: document.getElementById('bzi').value, uwagi: document.getElementById('bzu').value.trim(), doc: document.getElementById('bzd').value.trim() };
    // 25.11.2026: okno zamyka się od razu, pozycja widoczna natychmiast, serwer dostaje zapis w tle (nowa pozycja bez powtórek – żeby nie zdublować)
    const stara = D.magBez, lista = (stara || []).slice();
    const pol = { id: id || ('tmp' + Date.now()), nazwa: par.nazwa, ilosc: par.ilosc, uwagi: par.uwagi, doc: par.doc }, i = lista.findIndex(z => z.id === id);
    if (id && i >= 0) lista[i] = Object.assign({}, lista[i], pol); else lista.push(pol);
    D.magBez = lista;
    arkZamknij(); render(); toast('Zapisano');
    apiTlo('mgBn', par, {
      nazwa: 'Zapis części', powt: id ? 3 : 0,
      ok: j => { D.magBez = (j.wynik && j.wynik.bez) || D.magBez; render(); },
      cofnij: () => { D.magBez = stara; render(); }
    });
  };
  window.mgzBezUsun = function (id) {
    const stara = D.magBez;
    D.magBez = (stara || []).filter(z => z.id !== id);
    arkZamknij(); render(); toast('Usunięto');
    apiTlo('mgBnUsun', { id: id }, { nazwa: 'Usunięcie części', ok: j => { D.magBez = (j.wynik && j.wynik.bez) || []; render(); }, cofnij: () => { D.magBez = stara; render(); } });
  };

  /* ---------- zdjęte z raportów: „Nie ze składu” ---------- */
  function ostWidok() {
    const l = lo();
    return '<div class="mute" style="margin:2px 2px 8px">Raport nie mówi, czy część była ze składu, czy z busa – bot zdejmuje ją z Magazynu. Jeśli była „poza magazynem”, naciśnij „Nie ze składu”: sztuki wrócą do Magazynu (a pozycja o tej samej nazwie w „Bez numeru” zostanie zdjęta).</div>' +
      '<div class="card">' + (l.length ? l.map(x => '<div class="row" style="align-items:flex-start"><div class="g"><b>' + esc(x.nazwa) + '</b><div class="mute">' + esc(x.kod) + ' · ×' + fm(x.ile) + ' · ' +
        esc(x.d) + (x.myjnia ? ' · ' + esc(x.myjnia) : '') + '</div></div><button class="btn2" onclick="mgzNie(' + x.r + ',\'' + jsq(x.kod) + '\')">Nie ze składu</button></div>').join('') :
        '<div class="empty">Nic z ostatnich 14 dni.</div>') + '</div>';
  }
  window.mgzNie = function (r, kod) {
    if (BUSY) return; BUSY = true;
    api('mgNieZeSkladu', { r: r, kod: kod }).then(j => {
      BUSY = false; const w = j.wynik || {}; D.magOstatnie = w.ostatnie || []; render();
      toast('Wróciło do Magazynu' + (w.bn ? ' · ' + w.bn : ''));
      if (window.load) load();
    }).catch(e => { BUSY = false; toast(/Nieznana|akcja/i.test(e.message) ? 'Najpierw zainstaluj aktualizację bota (/aktualizuj)' : e.message); });
  };

  /* ---------- rozbieżności ---------- */
  function rozbWidok() {
    const m = D.magImport, l = lr();
    let h = '<div class="card"><h3>' + I('doc', 1) + 'Ostatni PDF biura</h3><div class="mute">' + (m ?
      esc(m.d) + ' · ' + m.poz + ' poz. · ' + fm(m.suma) + ' zł' + (m.kontrola ? ' · suma zgodna z PDF ✓' : ' · <b>suma nie zgadza się z PDF (' + fm(m.sumaPdf) + ') – mogło zabraknąć wiersza</b>') +
      (m.pdf ? ' · <a href="' + esc(m.pdf) + '" target="_blank">otwórz PDF</a>' : '') :
      'Jeszcze nie było. Plik z biura: „Udostępnij → Serwis myjni”.') + '</div></div>';
    if (!l.length) return h + '<div class="card"><div class="empty">Brak rozbieżności ✓ — mój stan zgadza się z biurem.</div></div>';
    h += '<div class="mute" style="margin:6px 2px">Mój stan zostaje bez zmian, dopóki nie zdecydujesz.</div>' +
      '<div class="ab2" style="margin:0 0 10px"><button class="btn2" onclick="mgzWszystkie(\'biuro\')">Wszystkie: biuro ma rację</button><button class="btn2" onclick="mgzWszystkie(\'moje\')">Wszystkie: zostaw mój</button></div>';
    return h + '<div class="card">' + l.map(x => '<div class="row" style="align-items:flex-start"><div class="g">' + esc(x.nazwa) +
      '<div class="mute">' + esc(x.kod) + ' · ' + esc(x.rodzaj) + '</div>' +
      '<div style="margin:2px 0 6px">u mnie <b>' + fm(x.moje) + '</b> → biuro <b>' + fm(x.biuro) + '</b></div>' +
      '<div class="ab2"><button class="btn2" onclick="mgzDec(\'' + jsq(x.id) + '\',\'biuro\')">Biuro ma rację</button><button class="btn2" onclick="mgzDec(\'' + jsq(x.id) + '\',\'moje\')">Zostaw mój</button></div></div></div>').join('') + '</div>';
  }
  function po(j) {
    D.magRozb = (j.wynik && j.wynik.rozb) || []; BUSY = false; render(); toast('Zapisane');
    if (window.load) load();   // stan w Magazynie mógł się zmienić – dociągamy świeże dane
  }
  window.mgzDec = function (id, dec) {
    if (BUSY) return; BUSY = true;
    api('mgRozbDec', { id: id, dec: dec }).then(po).catch(e => { BUSY = false; toast(e.message); });
  };
  window.mgzWszystkie = function (dec) {
    const n = lr().length;
    if (!confirm((dec === 'biuro' ? 'Przyjąć stan biura dla wszystkich ' : 'Zostawić mój stan dla wszystkich ') + n + ' pozycji?')) return;
    if (BUSY) return; BUSY = true;
    api('mgRozbWsz', { dec: dec }).then(po).catch(e => { BUSY = false; toast(e.message); });
  };
})();
