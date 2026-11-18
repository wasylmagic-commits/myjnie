// cudze.js – 18.11.2026: myjnie „nie moje” (zastępstwa) i pole „serwisant”.
// 1) Stacje, na których były moje zlecenia / raporty / zadania, a których nie ma na liście Myjnie ani Inne myjnie, same wchodzą do D.inne (z flagą auto) –
//    dzięki temu pokazują się we wszystkich listach (Raport, Przegląd, Diagnoza, zadania) i mają swoją historię.
// 2) Każda myjnia ma serwisanta: moje = „Wasyl”, cudze = „nie moja” albo wpisane nazwisko. Zmiana: dotknij plakietki. Zapis w LS i wspólnie dla urządzeń przez api=mgUst (klucz serw|nazwa).
(function () {
  const MOJ = 'Wasyl', NIE = 'nie moja', PRE = 'serw|';
  const stEt = s => { const m = String(s.klucz || '').match(/^SP(\d{4})/); return m ? 'Orlen SP ' + m[1] : (s.firma || s.klucz); };
  const mapaLS = () => { try { return JSON.parse(LS.get('serw') || '{}') || {}; } catch (e) { return {}; } };
  const wszystkie = () => (D.myjnie || []).concat(D.inne || []);

  // stacja z bazy Stacje dla tekstu (firma z Dane / myjnia z zadania)
  function stacjaDla(tekst) {
    const t = pl(tekst); if (!t || !D.stacje) return null;
    const num = (t.match(/(?:^|\D)(\d{4})(?:\D|$)/) || [])[1];
    let b = null;
    D.stacje.forEach(s => {
      const sk = String(s.klucz || ''), sn = (sk.match(/^SP(\d{4})/) || [])[1];
      if (num && sn && sn === num) b = b || s;
      else if (!b && pl(s.firma) === t) b = s;
    });
    return b;
  }

  function wyprowadz() {
    const wyn = [], widziane = {};
    const dodaj = (tekst, st) => {
      tekst = String(tekst || '').trim(); if (!tekst) return;
      if (wszystkie().some(w => !w.auto && sama(tekst, w))) return;
      const s = st || stacjaDla(tekst);
      const nazwa = s ? stEt(s) : tekst;
      if (widziane[pl(nazwa)]) return;
      if (wszystkie().some(w => !w.auto && (pl(w.nazwa) === pl(nazwa) || sama(nazwa, w)))) return;
      widziane[pl(nazwa)] = 1;
      wyn.push({ nazwa: nazwa, klucz: s ? s.klucz : '', miasto: s ? s.miasto : '', adres: s ? s.ulica : '', inna: 1, auto: 1 });
    };
    (D.prace || []).forEach(p => {
      if (p.status === 'anulowane') return;
      if (p.firma) dodaj(p.firma);
      else if (p.status === 'zlecenie' && window.smsStacja) { const s = smsStacja(p); if (s) dodaj(stEt(s), s); }
    });
    (D.ogony || []).forEach(o => { if (o.myjnia) dodaj(o.myjnia); });
    return wyn;
  }

  // wołane po każdym wczytaniu D (z sieci i z pamięci podręcznej)
  window.cdScal = function (d) {
    if (!d) return;
    d.inne = (d.inne || []).filter(w => !w.auto);
    try { wyprowadz().forEach(w => d.inne.push(w)); } catch (e) {}
  };

  // serwisant: wpis z sieci (D.ust) albo z LS – nowszy wygrywa
  function wpis(nazwa) {
    const l = mapaLS()[nazwa], u = D && D.ust && D.ust[PRE + nazwa];
    const tl = l ? +l.ts || 0 : 0, tu = u ? +u.ts || 0 : 0;
    if (!l && !u) return null;
    return tu > tl ? { v: String(u.v == null ? '' : u.v), ts: tu } : l;
  }
  window.serwisant = function (w) {
    const e = wpis(w.nazwa);
    if (e && e.v) return e.v;
    return w.inna ? NIE : MOJ;
  };
  window.serwMoj = w => { const s = serwisant(w); return s === MOJ || (!w.inna && !wpis(w.nazwa)); };
  window.serwPill = function (w, wszedzie) {
    const s = serwisant(w), moj = s === MOJ;
    if (moj && !wszedzie) return '';
    return '<span class="pill serw' + (moj ? '' : ' cud') + '" onclick="event.stopPropagation();serwEdytuj(\'' + jsq(w.nazwa) + '\')">' + esc(s) + ' ✎</span>';
  };

  let SF = null; // LS powstaje dopiero w głównym skrypcie – czytamy leniwie
  const sf = () => (SF === null ? (SF = LS.get('serwF') || '') : SF);
  window.serwFiltr = function () {
    const imiona = {}; wszystkie().forEach(w => { imiona[serwisant(w)] = 1; });
    const l = Object.keys(imiona); if (l.length < 2) return '';
    const chip = (v, t) => '<button class="chip' + (sf() === v ? ' on' : '') + '" onclick="serwUstawF(\'' + jsq(v) + '\')">' + esc(t) + '</button>';
    return '<div class="serwf">' + chip('', 'Wszystkie') + l.sort((a, b) => a === MOJ ? -1 : b === MOJ ? 1 : a.localeCompare(b, 'pl')).map(x => chip(x, x)).join('') + '</div>';
  };
  window.serwPasuje = w => !sf() || serwisant(w) === sf();
  window.serwUstawF = function (v) { SF = sf() === v ? '' : v; LS.set('serwF', SF); const e = document.getElementById('ml'); if (e) { e.innerHTML = myjnieLista(); const f = document.getElementById('serwf'); if (f) f.innerHTML = serwFiltr(); } };

  let wyslijT = 0;
  function zapisz(nazwa, v) {
    const ts = Date.now(), m = mapaLS(); m[nazwa] = { v: v, ts: ts }; LS.set('serw', JSON.stringify(m));
    if (D) { D.ust = D.ust || {}; D.ust[PRE + nazwa] = { v: v, ts: ts }; }
    clearTimeout(wyslijT);
    wyslijT = setTimeout(() => { api('mgUst', { k: PRE + nazwa, v: v, t: String(ts) }).catch(() => {}); }, 600);
  }
  window.serwEdytuj = function (nazwa) {
    const w = wszystkie().find(x => x.nazwa === nazwa); if (!w) return;
    const a = document.getElementById('ark'), s = serwisant(w);
    const znani = {}; wszystkie().forEach(x => { const n = serwisant(x); if (n !== NIE) znani[n] = 1; });
    znani[MOJ] = 1;
    a.innerHTML = '<div class="tlo" onclick="arkZamknij()"></div><div class="ar"><h4>Serwisant · ' + esc(skrot(w.nazwa)) + '</h4>' +
      '<div class="mute">Kto obsługuje tę myjnię? Moje = „' + MOJ + '”. Dla cudzych wpisz nazwisko.</div>' +
      '<input id="serwI" list="serwL" placeholder="np. Kowalski" value="' + esc(s === NIE ? '' : s) + '" style="margin-top:10px">' +
      '<datalist id="serwL">' + Object.keys(znani).map(n => '<option value="' + esc(n) + '">').join('') + '</datalist>' +
      '<div style="display:flex;gap:10px;margin-top:12px"><button class="btn" style="flex:1" onclick="serwZapisz(\'' + jsq(nazwa) + '\')">Zapisz</button>' +
      '<button class="btn2" onclick="serwReset(\'' + jsq(nazwa) + '\')">' + (w.inna ? 'Nie moja' : 'Moja') + '</button></div></div>';
    a.classList.add('on');
  };
  window.serwZapisz = function (nazwa) {
    const v = (document.getElementById('serwI').value || '').trim().slice(0, 40);
    zapisz(nazwa, v); arkZamknij(); serwOdswiez();
  };
  window.serwReset = function (nazwa) { zapisz(nazwa, ''); arkZamknij(); serwOdswiez(); };
  function serwOdswiez() { try { if (DW) pokazMyjnie(DW, true); else render(); } catch (e) {} const e = document.getElementById('ml'); if (e) e.innerHTML = myjnieLista(); const f = document.getElementById('serwf'); if (f) f.innerHTML = serwFiltr(); }
})();
