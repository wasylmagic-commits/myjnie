/* przyjecie.js – Przyjęcie dostawy (25.11.2026).
 * Zamówienia → „W drodze” → „Przyjęcie dostawy”: wszystkie otwarte pozycje na jednym ekranie, jedna kropka na całą paczkę.
 * Domyślnie „przyszło wszystko”. Mniej → poprawiam liczbę (0 = nie przyszło) i wybieram, co z resztą: „Czeka” (zamówienie zostaje otwarte)
 * albo „Nie będzie” (reszta zamówienia zamknięta). „Coś ekstra w paczce” – część z numerem (do Magazynu) albo bez numeru.
 * Backend: Przyjecie.gs (api=mgPrzyjecie: poz, dod, tok). Stan w Magazynie rośnie dopiero po „Przyjmij”, wszystko naraz.
 */
(function () {
  let PRZ = null, BUSY = false;
  const nn = v => { const x = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(x) ? x : 0; };
  const pol = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');

  window.przyjecieOtworz = function () {
    const l = ((D && D.zamowienia) || []).slice().sort((a, b) => String(a.d).localeCompare(String(b.d)))
      .map(z => { const rest = Math.max(0, z.ilosc - (z.dost || 0)); return { id: String(z.id), kod: z.kod || '', nazwa: z.nazwa, ilosc: z.ilosc, dost: z.dost || 0, rest: rest, n: rest, r: 'czeka' }; })
      .filter(x => x.rest > 0);
    PRZ = { l: l, dod: [], q: '', szuk: false, tok: Date.now().toString(36) + Math.random().toString(36).slice(2, 7) };
    przRys(); document.getElementById('ark').classList.add('on');
  };

  function przRys() {
    const a = document.getElementById('ark');
    const wiersz = (x, i) => '<div class="row" style="align-items:flex-start"><div class="g"><b>' + esc(x.nazwa) + '</b>' +
      '<div class="mute">' + (x.kod ? esc(x.kod) + ' · ' : 'bez numeru · ') + 'zamówione ' + x.ilosc + (x.dost ? ', doszło ' + x.dost : '') + '</div>' +
      (!x.kod ? '<div class="mute">stan w Magazynie się nie zmieni (brak numeru) – tylko licznik zamówienia</div>' : '') +
      (x.n < x.rest ? '<div class="ab2" style="margin-top:6px"><button class="btn2' + (x.r === 'czeka' ? ' on' : '') + '" onclick="przReszta(' + i + ',\'czeka\')">' + (x.r === 'czeka' ? '✓ ' : '') + 'Czeka (' + (x.rest - x.n) + ')</button>' +
        '<button class="btn2' + (x.r === 'nie' ? ' on' : '') + '" onclick="przReszta(' + i + ',\'nie\')">' + (x.r === 'nie' ? '✓ ' : '') + 'Nie będzie</button></div>' : '') + '</div>' +
      '<div class="zl" style="gap:8px"><button class="ib" onclick="przN(' + i + ',-1)">−</button><b style="min-width:26px;text-align:center">' + x.n + '</b><button class="ib" onclick="przN(' + i + ',1)">+</button></div></div>';
    const ekstra = (x, i) => '<div class="row"><div class="g"><b>' + esc(x.nazwa) + '</b><div class="mute">' + (x.kod ? esc(x.kod) + ' · do Magazynu' : 'bez numeru · do listy bez numeru') + ' · bez zamówienia</div></div>' +
      '<div class="zl" style="gap:8px"><button class="ib" onclick="przDodN(' + i + ',-1)">−</button><b style="min-width:26px;text-align:center">' + x.n + '</b><button class="ib" onclick="przDodN(' + i + ',1)">+</button></div></div>';
    const razem = PRZ.l.reduce((s, x) => s + x.n, 0) + PRZ.dod.reduce((s, x) => s + x.n, 0);
    a.innerHTML = '<div class="tlo" onclick="arkZamknij()"></div><div class="ar" style="max-height:88vh;overflow-y:auto"><h4>Przyjęcie dostawy</h4>' +
      '<div class="mute" style="font-size:14px;margin-bottom:6px">Domyślnie przyszło wszystko. Jeśli mniej – popraw liczbę. Magazyn zmieni się dopiero po „Przyjmij”.</div>' +
      (PRZ.l.length ? PRZ.l.map(wiersz).join('') : '<div class="empty">Nie ma otwartych zamówień – możesz dodać tylko to, co przyszło ekstra.</div>') +
      (PRZ.dod.length ? '<div class="mute" style="margin:10px 0 0">Ekstra w paczce</div>' + PRZ.dod.map(ekstra).join('') : '') +
      (PRZ.szuk ? '<input id="przQ" type="text" autocomplete="off" placeholder="Nazwa lub numer części" value="' + esc(PRZ.q) + '" oninput="przSzukaj(this.value)" style="margin-top:10px"><div id="przW"></div>'
        : '<button class="btn2" style="width:100%;margin-top:10px" onclick="przSzukajOtworz()">+ Dodaj pozycję (coś ekstra w paczce)</button>') +
      '<div class="ab" style="margin-top:12px"><button class="btn" id="przOk" onclick="przZapisz()"' + (razem || PRZ.l.some(x => x.r === 'nie' && x.n < x.rest) ? '' : ' disabled') + '>Przyjmij' + (razem ? ' (' + razem + ' szt.)' : '') + '</button>' +
      '<button class="btn2" onclick="arkZamknij()">Anuluj</button></div></div>';
    if (PRZ.szuk) { przWyniki(); const i = document.getElementById('przQ'); if (i && !PRZ.fok) { PRZ.fok = 1; setTimeout(() => i.focus(), 50); } }
  }

  window.przN = function (i, d) { const x = PRZ.l[i]; x.n = Math.max(0, Math.min(x.rest, x.n + d)); przRys(); };
  window.przReszta = function (i, r) { PRZ.l[i].r = r; przRys(); };
  window.przDodN = function (i, d) { const x = PRZ.dod[i]; x.n += d; if (x.n < 1) PRZ.dod.splice(i, 1); przRys(); };
  window.przSzukajOtworz = function () { PRZ.szuk = true; PRZ.fok = 0; przRys(); };

  function trafia(m, q) {
    const t = pol(m.nazwa + ' ' + m.kod), qs = pol(q).split(' ').filter(Boolean);
    return qs.length && qs.every(w => t.indexOf(w) >= 0);
  }
  function przWyniki() {
    const el = document.getElementById('przW'); if (!el) return;
    const q = PRZ.q.trim(); if (pol(q).length < 2) { el.innerHTML = ''; return; }
    const l = ((D && D.magazyn) || []).filter(m => m.kod && trafia(m, q)).slice(0, 6);
    el.innerHTML = l.map(m => '<div class="row" style="cursor:pointer" onclick="przWybierz(\'' + jsq(m.kod) + '\')"><div class="g"><b>' + esc(m.nazwa) + '</b><div class="mute">' + esc(m.kod) + ' · w Magazynie ' + esc(m.ilosc) + '</div></div></div>').join('') +
      '<div class="row" style="cursor:pointer" onclick="przBezNumeru()"><div class="g"><b>Bez numeru: ' + esc(q) + '</b><div class="mute">dopisz do listy „Bez numeru”</div></div></div>';
  }
  window.przSzukaj = function (v) { PRZ.q = v; przWyniki(); };
  window.przWybierz = function (kod) {
    const m = ((D && D.magazyn) || []).find(x => x.kod === kod); if (!m) return;
    const e = PRZ.dod.find(x => x.kod === kod); if (e) e.n++; else PRZ.dod.push({ kod: kod, nazwa: m.nazwa, n: 1 });
    PRZ.szuk = false; PRZ.q = ''; przRys();
  };
  window.przBezNumeru = function () {
    const n = PRZ.q.trim().replace(/\s+/g, ' '); if (!n) return;
    const e = PRZ.dod.find(x => !x.kod && pol(x.nazwa) === pol(n)); if (e) e.n++; else PRZ.dod.push({ bn: n, nazwa: n, n: 1 });
    PRZ.szuk = false; PRZ.q = ''; przRys();
  };

  window.przZapisz = function () {
    if (BUSY || !PRZ) return;
    const poz = PRZ.l.filter(x => x.n > 0 || (x.r === 'nie' && x.n < x.rest))
      .map(x => ({ id: x.id, n: x.n, reszta: x.n < x.rest && x.r === 'nie' ? 'nie' : 'czeka' }));
    const dod = PRZ.dod.map(x => x.kod ? { kod: x.kod, n: x.n } : { bn: x.bn, n: x.n });
    if (!poz.length && !dod.length) { toast('Nic do przyjęcia'); return; }
    const b = document.getElementById('przOk'); BUSY = true; if (b) { b.disabled = true; b.textContent = 'Zapisuję…'; }
    api('mgPrzyjecie', { poz: JSON.stringify(poz), dod: JSON.stringify(dod), tok: PRZ.tok }).then(j => {
      BUSY = false; const w = j.wynik || {}; PRZ = null; arkZamknij();
      toast(w.powtorka ? 'To przyjęcie już było zapisane' : 'Przyjęto: ' + (w.zapisane || 0) + ' poz.' + ((w.zamkniete || []).length ? ' · zamknięte: ' + w.zamkniete.length : ''));
      if (window.load) load();   // Magazyn i zamówienia zmieniły się na serwerze – dociągam świeże dane
    }).catch(e => { BUSY = false; if (b) { b.disabled = false; b.textContent = 'Przyjmij'; } toast(/Nieznana|akcja/i.test(e.message) ? 'Najpierw zainstaluj aktualizację bota (/aktualizuj)' : e.message); });
  };
})();
