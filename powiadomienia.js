/* Powiadomienia – 18.11.2026, etap 2 „bez Telegrama” (silnik SILNIK, Powiadomienia.gs).
 * Wszystko, co system dotąd pisał do Telegrama (odpowiedzi na raport, pytania AWK/URU/NAD/DYZ, notes Tak/Popraw,
 * faktura, stany magazynowe, przypomnienia), leży w arkuszu „Powiadomienia” serwisanta. Tu je pokazujemy:
 *   karta „Powiadomienia” na Dziś (pod górną kartą) → przyciski = przyciski z bota (api=pwPrzycisk)
 *   „Wszystkie” → okno z listą i polem „Odpowiedz tekstem” (godziny, koniec dnia – api=pwTekst)
 *   po „Udostępnij” (udostepnij.js) odpowiedź serwera ma powiadomienia → pwPokazNowe
 * Stara instalacja bez pw-api („Nieznana akcja”) → karta się nie pokazuje, nic się nie dzieje.
 * Ładowany przed głównym skryptem index.html; esc, I, api, toast, load, render, arkZamknij, notatnikPokaz – dopiero przy wywołaniu.
 */
(function () {
  const PW = { lista: [], nowe: 0, brak: false, trwa: false, ok: false };
  const nieMa = e => /Nieznana akcja/i.test(String(e && e.message || e));
  // tekst bota bywa w HTML Telegrama (<b>, <i>, <code>) – reszta jako zwykły tekst
  // linki http(s) w tekście są klikalne (np. link do aplikacji dla serwisanta po /nowy); tekst w oknie można zaznaczyć i skopiować
  const tx = t => esc(String(t || '')).replace(/&lt;(\/?)(b|i|u|code)&gt;/g, '<$1$2>')
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener" style="word-break:break-all">$1</a>');
  const czas = c => { const d = new Date(c); return isNaN(d) ? '' : d.toLocaleString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };

  window.pwOdswiez = function () {
    if (PW.brak || PW.trwa || typeof K === 'undefined' || !K || !API || LS.get('d') === '1') return Promise.resolve();
    PW.trwa = true;
    return api('pwLista').then(r => {
      const j = r.wynik || r;   // Api.gs zwraca {ok, wynik:{lista, nowe}}
      const stare = JSON.stringify(PW.lista);
      PW.lista = j.lista || []; PW.nowe = j.nowe || 0; PW.ok = true;
      if (stare !== JSON.stringify(PW.lista) && TAB === 'dzis' && typeof D !== 'undefined' && D) { ANIM = false; render(); }
    }).catch(e => { if (nieMa(e)) PW.brak = true; }).finally(() => { PW.trwa = false; });
  };

  function wiersz(p, maly) {
    const pr = p.przyciski || [];
    return '<div class="row pw-r' + (p.status === 'nowe' ? ' pw-n' : '') + '"><div class="g">' +
      '<div class="pw-t">' + tx(p.tekst) + '</div>' +
      '<div class="mute">' + czas(p.czas) + (p.status === 'zrobione' && p.odp ? ' · odpowiedź: ' + esc(p.odp) : '') + '</div>' +
      (pr.length ? '<div class="pw-b">' + pr.map((b, i) => '<button class="' + (i === 0 ? 'btn' : 'btn2') + '" onclick="pwKlik(\'' + jsq(p.id) + '\',' + i + ',this)">' + esc(b.t) + '</button>').join('') + '</div>' : '') +
      '</div>' + (!pr.length || !maly ? '<button class="ib" aria-label="Schowaj" onclick="pwSchowaj(\'' + jsq(p.id) + '\',this)">' + I('check') + '</button>' : '') + '</div>';
  }

  // karta na Dziś: najpierw pytania z przyciskami, potem nowe; najwyżej 3
  window.powiadomieniaKarta = function () {
    if (PW.brak || !PW.ok) return '';
    const akt = PW.lista.filter(p => p.status !== 'zrobione');
    if (!akt.length) return '';
    const pyt = akt.filter(p => (p.przyciski || []).length), inne = akt.filter(p => !(p.przyciski || []).length);
    const pokaz = pyt.concat(inne).slice(0, 3);
    return '<div class="card pw" id="pwk"><h3>' + I('alert', 1) + 'Powiadomienia' + (pyt.length ? ' <span class="pill o">' + pyt.length + ' do odpowiedzi</span>' : '') + '</h3>' +
      pokaz.map(p => wiersz(p, true)).join('') +
      '<div class="ab" style="margin-top:10px"><button class="btn2" onclick="pwWszystkie()">Wszystkie' + (akt.length > 3 ? ' (' + akt.length + ')' : '') + '</button></div></div>';
  };

  // liczba do górnej karty
  window.pwIle = () => PW.brak ? 0 : PW.lista.filter(p => p.status !== 'zrobione').length;

  window.pwWszystkie = function () {
    const a = document.getElementById('ark');
    const lista = PW.lista.filter(p => p.status !== 'zrobione');
    a.innerHTML = '<div class="tlo" onclick="arkZamknij()"></div><div class="ar"><h4>' + I('alert', 1) + ' Powiadomienia</h4>' +
      (lista.length ? lista.map(p => wiersz(p, false)).join('') : '<div class="empty">Nic nowego</div>') +
      '<div class="pw-o"><label class="mute">Odpowiedz tekstem – np. godziny „475 8:15 9:00-12:00” albo koniec dnia „14:30”</label>' +
      '<div class="pw-ot"><input id="pwT" placeholder="tekst do systemu" onkeydown="if(event.key===\'Enter\')pwWyslij(this.nextElementSibling)"><button class="btn" onclick="pwWyslij(this)">Wyślij</button></div></div>' +
      '<div class="ab" style="margin-top:12px"><button class="btn2" onclick="arkZamknij()">Zamknij</button></div></div>';
    a.classList.add('on');
    // przeczytane = te bez przycisków, które właśnie widać
    const ids = lista.filter(p => p.status === 'nowe' && !(p.przyciski || []).length).map(p => p.id);
    if (ids.length) api('pwCzytaj', { ids: ids.join(',') }).then(() => { lista.forEach(p => { if (ids.indexOf(p.id) >= 0) p.status = 'przeczytane'; }); }).catch(() => {});
  };

  // odpowiedź systemu po przycisku / tekście: komunikaty + nowe pytania
  function wynik(j, tytul) {
    const kom = j.komunikaty || [], nowe = (j.nowe || []).filter(p => (p.przyciski || []).length);
    if (!kom.length && !nowe.length) { arkZamknij(); toast(tytul || 'Gotowe'); return; }
    if (!nowe.length && kom.length === 1 && String(kom[0]).length < 90) { arkZamknij(); toast(String(kom[0]).replace(/<[^>]+>/g, '')); return; }
    const a = document.getElementById('ark');
    a.innerHTML = '<div class="tlo" onclick="arkZamknij()"></div><div class="ar"><h4>' + I('check', 1) + ' ' + esc(tytul || 'Odpowiedź systemu') + '</h4>' +
      kom.map(t => '<div class="row"><div class="g pw-t">' + tx(t) + '</div></div>').join('') +
      (nowe.length ? '<div class="mute" style="margin:8px 0 2px">Jeszcze pytania:</div>' + nowe.map(p => wiersz(Object.assign({ status: 'nowe', czas: new Date().toISOString() }, p), true)).join('') : '') +
      '<div class="ab" style="margin-top:12px"><button class="btn" onclick="arkZamknij()">OK</button></div></div>';
    a.classList.add('on');
  }
  // wiadomości z ostatniej odpowiedzi też mogą mieć przyciski – trzymamy je w liście, żeby pwKlik je znalazł
  function dolacz(nowe) {
    (nowe || []).forEach(p => { if (p && p.id && !PW.lista.some(x => x.id === p.id)) PW.lista.unshift(Object.assign({ status: 'nowe', czas: new Date().toISOString(), odp: '' }, p)); });
  }

  window.pwKlik = function (id, i, b) {
    const p = PW.lista.find(x => x.id === id), btn = p && (p.przyciski || [])[i];
    if (!btn) return;
    const box = b && b.parentNode; if (box) box.querySelectorAll('button').forEach(x => x.disabled = true);
    if (b) b.textContent = '…';
    api('pwPrzycisk', { id: id, d: btn.d }).then(r => {
      const j = r.wynik || r;
      p.status = 'zrobione'; p.odp = btn.t; p.przyciski = [];
      if (j.juz) { arkZamknij(); toast('Już odpowiedziane' + (j.odp ? ': ' + j.odp : '')); }
      else if (j.karta && window.notatnikPokaz) { arkZamknij(); notatnikPokaz(j.karta); }
      else { dolacz(j.nowe); wynik(j, btn.t); }
      render(); load();
    }).catch(e => {
      if (box) box.querySelectorAll('button').forEach(x => x.disabled = false);
      if (b) b.textContent = btn.t;
      toast('Błąd: ' + e.message);
    });
  };

  window.pwSchowaj = function (id, b) {
    if (b) b.disabled = true;
    api('pwUkryj', { id: id }).then(() => {
      PW.lista = PW.lista.filter(x => x.id !== id);
      const r = b && b.closest('.row'); if (r) r.remove();
      if (TAB === 'dzis') { ANIM = false; render(); }
    }).catch(e => { if (b) b.disabled = false; toast('Błąd: ' + e.message); });
  };

  window.pwWyslij = function (b) {
    const inp = document.getElementById('pwT'), t = inp ? inp.value.trim() : '';
    if (!t) return toast('Wpisz tekst');
    b.disabled = true; b.textContent = '…';
    api('pwTekst', { t: t }).then(r => {
      const j = r.wynik || r;
      dolacz(j.nowe); wynik(j, 'Odpowiedź systemu'); render(); load();
    }).catch(e => { b.disabled = false; b.textContent = 'Wyślij'; toast('Błąd: ' + e.message); });
  };

  // po „Udostępnij”: powiadomienia z odpowiedzi serwera (apiPdf2_)
  window.pwPokazNowe = function (lista) {
    lista = lista || []; if (!lista.length) return;
    dolacz(lista); PW.ok = true;
    const pyt = lista.filter(p => (p.przyciski || []).length);
    if (pyt.length) wynik({ komunikaty: lista.filter(p => !(p.przyciski || []).length).map(p => p.tekst), nowe: pyt }, 'Dokument przyjęty');
    else toast(String(lista[0].tekst || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').slice(0, 110));
    if (TAB === 'dzis') { ANIM = false; render(); }
  };

  // dociągnij przy starcie, przy każdym odświeżeniu danych i po powrocie do aplikacji
  window.addEventListener('load', () => {
    const stary = window.load;
    if (typeof stary === 'function') window.load = function () { const r = stary.apply(this, arguments); setTimeout(pwOdswiez, 300); return r; };
    setTimeout(pwOdswiez, 600);
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pwOdswiez(); });
})();
