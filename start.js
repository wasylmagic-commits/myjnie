/* Moje dane – 20.11.2026, etap 5 (silnik SILNIK, Rejestracja.gs).
 * Nowy serwisant dostaje od Wasyla link → aplikacja przy pierwszym otwarciu sama pyta o dane do premii i druku
 * (imię, nazwisko, adres, zaliczka, miasto, godziny, e-mail) → api=pwUstawienia / pwUstZapisz.
 * W tym samym oknie: tabele premii z ostatnich miesięcy (.xlsx z telefonu) → POST api=pdf {cel:'import'} każdy plik,
 * potem api=pwImport; tygodnie dyżurów → api=pwDyzury.
 * Później to samo okno: Więcej → Ustawienia → „Moje dane, premia i dyżury”.
 * Stara instalacja bez tych api („Nieznana akcja”) → nic się nie pokazuje.
 */
(function () {
  const S = { ok: false, brak: false, w: null, pokazane: false, trwa: false };
  const nieMa = e => /Nieznana akcja/i.test(String(e && e.message || e));
  const demo = () => LS.get('d') === '1';
  const wyn = r => r.wynik || r;
  const b64 = blob => new Promise((ok, zle) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1] || ''); fr.onerror = zle; fr.readAsDataURL(blob); });

  function pobierz() {
    if (S.brak || S.trwa || demo() || typeof K === 'undefined' || !K || !API) return Promise.resolve(null);
    S.trwa = true;
    return api('pwUstawienia').then(r => { S.w = wyn(r); S.ok = true; return S.w; })
      .catch(e => { if (nieMa(e)) S.brak = true; return null; }).finally(() => { S.trwa = false; });
  }

  // raz na otwarcie aplikacji: brakuje danych → okno samo się pokazuje (chyba że „Później” w tej sesji)
  function sprawdz() {
    if (S.pokazane) return;
    S.pokazane = true;
    pobierz().then(w => {
      if (!w || w.gotowe) return;
      try { if (sessionStorage.getItem('mdPozniej') === '1') return; } catch (e) {}
      if (document.getElementById('ark').classList.contains('on')) return;
      formularz(true);
    });
  }

  function pole(p) {
    const typ = /ZALICZKA|GODZ/.test(p.klucz) ? ' inputmode="numeric"' : p.klucz === 'ROZ_MAIL' ? ' type="email" autocomplete="email"' : '';
    return '<label class="mute">' + esc(p.etykieta) + (p.wymagane ? '' : ' (nieobowiązkowe)') + '</label>' +
      '<input id="md_' + p.klucz + '"' + typ + ' value="' + esc(p.wartosc) + '">';
  }

  function sekcjaImport(w) {
    return '<h4 style="margin-top:14px">' + I('cal', 1) + ' Tabele premii z ostatnich miesięcy</h4>' +
      '<div class="mute" style="margin-bottom:8px">Pliki „Kalendarz CORRIMEX” (.xlsx) – najlepiej 12 ostatnich miesięcy. System wczyta godziny, myjnie i przeglądy, premia będzie liczona od razu.' +
      (w.dane ? ' W tabeli jest już ' + w.dane + ' wierszy – powtórki się pominą.' : '') + '</div>' +
      '<label class="btn2" style="justify-content:center;margin-bottom:8px"><input type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" multiple hidden onchange="mdPliki(this)">' +
      I('plus', 1) + 'Wybierz pliki .xlsx</label>' +
      (w.importCzeka ? '<button class="btn2" style="width:100%;justify-content:center;margin-bottom:8px" onclick="mdImport(this)">Wczytaj ' + w.importCzeka + ' czekających plików</button>' : '') +
      '<div id="mdImp" class="mute"></div>';
  }

  function sekcjaDyzury(w) {
    const rok = new Date().getMonth() >= 10 ? new Date().getFullYear() + 1 : new Date().getFullYear();
    return '<h4 style="margin-top:14px">' + I('shield', 1) + ' Dyżury</h4>' +
      '<div class="mute" style="margin-bottom:8px">' + (w.dyzury ? 'Wpisane: ' + esc(w.dyzury) : 'Numery tygodni Twoich dyżurów z grafiku (nieobowiązkowe).') + '</div>' +
      '<div style="display:flex;gap:8px"><input id="mdRok" inputmode="numeric" value="' + rok + '" style="flex:0 0 84px">' +
      '<input id="mdTyg" inputmode="numeric" placeholder="np. 3, 11, 19, 27"></div>' +
      '<button class="btn2" style="width:100%;justify-content:center" onclick="mdDyzury(this)">Dopisz tygodnie</button>';
  }

  function formularz(start) {
    const w = S.w; if (!w) return;
    const a = document.getElementById('ark');
    a.innerHTML = '<div class="tlo" onclick="arkZamknij()"></div><div class="ar"><h4>' + I('user', 1) + ' ' + (start ? 'Witaj! Twoje dane' : 'Moje dane') + '</h4>' +
      '<div class="mute" style="margin-bottom:10px">' + (start ? 'Raz, na początek: z tego liczy się premia, druk zaliczki, pogoda i rozpoznawanie Twoich raportów.' : 'Dane do premii, druku zaliczki i przypomnień.') + '</div>' +
      (w.braki && w.braki.length ? '<div style="margin-bottom:10px"><span class="pill o">brakuje: ' + w.braki.length + '</span></div>' : '') +
      w.pola.map(pole).join('') +
      '<div class="ab"><button class="btn" onclick="mdZapisz(this)">Zapisz</button>' + (start ? '<button class="btn2" onclick="mdPozniej()">Później</button>' : '') + '</div>' +
      sekcjaImport(w) + sekcjaDyzury(w) +
      '<div class="ab" style="margin-top:14px"><button class="btn2" onclick="arkZamknij()">Zamknij</button></div></div>';
    a.classList.add('on');
  }

  window.mdOtworz = function () {
    if (S.w) { formularz(false); pobierz(); return; }
    toast('Wczytuję…');
    pobierz().then(w => w ? formularz(false) : toast(S.brak ? 'Ta funkcja działa po aktualizacji systemu' : 'Brak połączenia'));
  };
  window.mdPozniej = function () { try { sessionStorage.setItem('mdPozniej', '1'); } catch (e) {} arkZamknij(); toast('Dane uzupełnisz w Więcej → Ustawienia'); };

  window.mdZapisz = function (btn) {
    const pola = {};
    (S.w.pola || []).forEach(p => { const e = document.getElementById('md_' + p.klucz); pola[p.klucz] = e ? e.value.trim() : ''; });
    if (!pola.IMIE || !pola.NAZWISKO) { toast('Wpisz imię i nazwisko'); return; }
    btn.disabled = true; btn.textContent = 'Zapisuję…';
    api('pwUstZapisz', { pola: JSON.stringify(pola) }).then(r => {
      S.w = wyn(r);
      LS.set('n', pola.NAZWISKO + ' ' + pola.IMIE);   // powitanie i druki w aplikacji (imieSerw)
      toast(S.w.gotowe ? 'Zapisane ✓' + (S.w.geo ? ' · ' + S.w.geo : '') : 'Zapisane – brakuje jeszcze: ' + S.w.braki.length);
      formularz(false);
      if (typeof render === 'function' && typeof D !== 'undefined' && D) render();
    }).catch(e => { btn.disabled = false; btn.textContent = 'Zapisz'; toast('Nie zapisano: ' + e.message); });
  };

  // każdy plik osobno (POST jak „Udostępnij”), potem jeden import całego folderu
  window.mdPliki = async function (inp) {
    const pliki = Array.from(inp.files || []); inp.value = '';
    if (!pliki.length) return;
    const out = document.getElementById('mdImp');
    const pisz = t => { if (out) out.innerHTML = t; };
    let ok = 0; const zle = [];
    for (let i = 0; i < pliki.length; i++) {
      const p = pliki[i];
      pisz('Wysyłam ' + (i + 1) + ' z ' + pliki.length + ': ' + esc(p.name) + '…');
      try {
        const r = await fetch(API + '?api=pdf', { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ k: K, cel: 'import', nazwa: p.name, mime: p.type || '', b64: await b64(p) }) });
        const j = JSON.parse(await r.text());
        if (!j.ok) throw new Error(j.blad || 'błąd serwera');
        ok++;
      } catch (e) { zle.push(p.name + ': ' + e.message); }
    }
    if (!ok) { pisz('Nie wysłano: ' + esc(zle.join('; '))); return; }
    window.mdImport(null, zle);
  };

  window.mdImport = function (btn, zle) {
    const out = document.getElementById('mdImp');
    if (btn) btn.disabled = true;
    if (out) out.innerHTML = 'Wczytuję tabele premii – to może potrwać minutę lub dwie, nie zamykaj aplikacji…';
    api('pwImport').then(r => {
      const j = wyn(r);
      if (out) out.innerHTML = '<div class="pw-t" style="white-space:pre-wrap">' + esc(j.tekst || '') + '</div>' + (zle && zle.length ? '<div>Nie wysłano: ' + esc(zle.join('; ')) + '</div>' : '');
      if (S.w) { S.w.dane = (S.w.dane || 0) + (j.wierszy || 0); S.w.importCzeka = 0; }
      if (j.wierszy || j.myjnie) load();
    }).catch(e => { if (btn) btn.disabled = false; if (out) out.innerHTML = 'Import przerwany: ' + esc(e.message) + ' – pliki czekają, spróbuj jeszcze raz (Więcej → Ustawienia → Moje dane).'; pobierz(); });
  };

  window.mdDyzury = function (btn) {
    const rok = (document.getElementById('mdRok') || {}).value, tyg = (document.getElementById('mdTyg') || {}).value;
    if (!tyg || !tyg.trim()) { toast('Wpisz numery tygodni'); return; }
    btn.disabled = true;
    api('pwDyzury', { rok: rok, tyg: tyg }).then(r => {
      const j = wyn(r);
      toast('Dyżury: dopisane ' + j.dopisane + (j.juzByly ? ', już były ' + j.juzByly : ''));
      if (S.w) S.w.dyzury = j.dyzury;
      formularz(false);
    }).catch(e => { btn.disabled = false; toast('Nie zapisano: ' + e.message); });
  };

  // po każdym wczytaniu danych (cdScal woła index.html) – pierwsze sprawdzenie z opóźnieniem, żeby nie zasłonić startu
  const stary = window.cdScal;
  window.cdScal = function (d) { if (stary) stary(d); if (!S.pokazane) setTimeout(sprawdz, 1200); };

  // wiersz w Ustawieniach (ustawienia.js)
  const M = window.MODULY && window.MODULY.ustawienia;
  if (M) {
    const widok0 = M.widok;
    M.widok = function () {
      let h = widok0();
      if (S.brak || demo()) return h;
      const ile = S.w && S.w.braki ? S.w.braki.length : 0;
      return h + '<div class="card"><h3>' + I('doc', 1) + 'Premia i druki</h3>' +
        '<button class="us-row" onclick="mdOtworz()"><div class="g"><b>Moje dane, premia i dyżury</b><small>imię, nazwisko, adres, zaliczka, miasto · import tabel premii · tygodnie dyżurów</small></div>' +
        '<span class="us-v">' + (ile ? '<span class="pill o">brakuje ' + ile + '</span>' : '›') + '</span></button></div>';
    };
  }
})();
