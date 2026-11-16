/* Raport – moduł aplikacji „Serwis myjni” (15.11.2026).
 * Raport wykonanych prac (SRL w WebCon) na JEDNYM ekranie: bloki pod sobą, bez zakładek.
 * Nazwy pól jak w WebCon (Realizacja zlecenia), żeby później podpiąć wysyłkę przez API WebCon.
 * Szkice na razie w pamięci urządzenia (localStorage „raporty”); zapis do arkusza – osobna łatka bota.
 * Ładowany PRZED głównym skryptem; funkcje index.html (esc, I, jsq, toast, dzisIso, dt, skrot, naglowek, LS, D, go) używane dopiero przy wywołaniu.
 */
(function () {
  const SERWISANT = (() => { const DOM = 'TOMCZAKOWSKI WASYL'; try { const h = new URLSearchParams(location.hash.slice(1)).get('n'); if (h) localStorage.setItem('n', h); return localStorage.getItem('n') || DOM; } catch (e) { return DOM; } })();
  const USLUGI = ['Gwarancyjna', 'Płatna', 'Ryczałtowa', 'Inna', 'Do decyzji serwisanta'];
  // Rodzaj zgłoszenia – pełna lista z WebCon (15.11.2026); pierwsze 4 jako przyciski, reszta w „więcej”
  const RODZAJE_GL = ['AWP', 'AWK', 'PSE', 'USZ'];
  const RODZAJE_RESZTA = ['Myjnia nieczynna', 'Awaria częściowa', 'Awaria drobna', 'Awaria programu', 'Awaria', 'ANU', 'PRV', 'CHE', 'GWA', 'Mycie myjni'];
  // pola przepisywane do karty myjni (arkusz Myjnie) – api=myjnia
  const POLA_MYJNI = { model: 'Nazwa (model)', nrSeryjny: 'Nr seryjny' };
  // przyciski czasu: serwisant tylko klika, godziny Dojazd/Serwis/Powrót liczą się same
  const CZASY = [['wyjazd', 'Wyjazd'], ['przyjazd', 'Na myjni'], ['koniec', 'Koniec pracy'], ['odjazd', 'Odjazd z myjni'], ['dom', 'Powrót']];
  // pola obowiązkowe (* w WebCon) – kolejność = kolejność na ekranie
  const OBOW = [['nrSeryjny', 'Nr seryjny'], ['iloscMyc', 'Ilość myć'], ['nastawyZgodne', 'Nastawy zgodne?'], ['usluga', 'Usługa serwisowa'],
    ['opisPrac', 'Opis wykonanych prac'], ['dataRaportu', 'Data do raportu'], ['czas', 'Rejestracja czasu'], ['odbImie', 'Odbierający – imię i nazwisko'], ['odbEmail', 'Odbierający – e-mail'], ['podpisSerw', 'Podpis serwisanta']];
  const orlen = r => /orlen/i.test(r.myjnia || '');
  // e-mail stacji Orlen z numeru SP: „Orlen SP 1467” → s01467@sp.orlen.pl (16.11.2026, zasada od Wasyla)
  function emailStacji(nazwa) {
    const t = String(nazwa || '').toUpperCase(); if (t.indexOf('ORLEN') < 0) return '';
    const m = t.match(/(?:SP|ORLEN)\s*(\d{3,4})(?!\d)/); return m ? 's0' + ('0000' + m[1]).slice(-4) + '@sp.orlen.pl' : '';
  }
  // nr zlecenia skrótem: „11/600” → SZL/2026/11/00600; „600” → bieżący miesiąc; miesiąc „z przyszłości” = zeszły rok (w styczniu wpisujesz grudzień)
  function pelnyNr(typ, s) {
    s = String(s || '').trim().toUpperCase().replace(/\s+/g, '');
    let m = s.match(/^(SZ[LP])\/(\d{4})\/(\d{1,2})\/(\d{1,5})$/);
    if (m) return m[1] + '/' + m[2] + '/' + m[3].padStart(2, '0') + '/' + m[4].padStart(5, '0');
    const t = new Date(); let mies = t.getMonth() + 1, rok = t.getFullYear(), nr;
    m = s.match(/^(\d{1,2})[\/.\-](\d{1,5})$/);
    if (m) { const mm = +m[1]; if (mm < 1 || mm > 12) return ''; if (mm > mies) rok--; mies = mm; nr = m[2]; }
    else if (/^\d{1,5}$/.test(s)) nr = s; else return '';
    return (typ || 'SZL') + '/' + rok + '/' + String(mies).padStart(2, '0') + '/' + nr.padStart(5, '0');
  }

  const ST = { id: null, foto: [] };
  // jedna kopia w pamięci – wszystkie zmiany idą na ten sam obiekt (bez wyścigów między polami)
  let BAZA = null;
  const wszystkie = () => { if (!BAZA) { try { BAZA = JSON.parse(LS.get('raporty') || '{}'); } catch (e) { BAZA = {}; } } return BAZA; };
  const zapiszWsz = o => { BAZA = o; try { localStorage.setItem('raporty', JSON.stringify(o)); return true; } catch (e) { return false; } };
  const R = () => wszystkie()[ST.id];
  let tz = 0;
  function zapisz(r, cicho) {
    const o = wszystkie(); r.zm = new Date().toISOString(); o[r.id] = r;
    if (!zapiszWsz(o)) { // brak miejsca – najpierw zdjęcia
      if (r.zal && r.zal.length) { r.zal = []; o[r.id] = r; zapiszWsz(o); toast('Brak miejsca w pamięci – zdjęcia nie zostały w szkicu'); }
    }
    if (!cicho) licznik();
  }
  const myjnia = n => (D && (D.myjnie.find(x => x.nazwa === n) || D.inne.find(x => x.nazwa === n))) || null;
  const min = t => { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const roz = (a, b) => { a = min(a); b = min(b); if (a == null || b == null) return 0; let d = b - a; if (d < 0) d += 1440; return Math.round(d / 60 * 4) / 4; }; // co 15 min
  const godz = x => String(x).replace('.', ',') + ' h';
  // daty zdarzeń: puste = ta sama co poprzednie zdarzenie (po północy ustawiasz następny dzień, dalsze godziny idą za nim)
  const KL = CZASY.map(x => x[0]), NZ = Object.fromEntries(CZASY);
  const dodajDzien = iso => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
  function efData(r, k) {
    const c = r.czas || {}; let d = r.dataRaportu || dzisIso();
    for (const x of KL) { if (c['d_' + x]) d = c['d_' + x]; if (x === k) break; }
    return d;
  }
  const ts = (r, k) => { const c = r.czas || {}; return c[k] ? Date.parse(efData(r, k) + 'T' + c[k] + ':00Z') / 60000 : null; };
  const rozT = (a, b) => { if (a == null || b == null) return 0; let d = b - a; if (d < 0) d += 1440; return Math.round(d / 60 * 4) / 4; };   // co 15 min
  // pierwsze zdarzenie, które wypada wcześniej niż poprzednie wpisane (albo null)
  function prevWpisane(r, k) { for (let j = KL.indexOf(k) - 1; j >= 0; j--) if (ts(r, KL[j]) != null) return KL[j]; return null; }
  function bladCzasu(r) {
    for (const k of KL) { const p = prevWpisane(r, k); if (p && ts(r, k) != null && ts(r, k) < ts(r, p)) return [k, p]; }
    return null;
  }
  function czasy(r) {
    const c = r.czas || {};
    // km liczą się dokładnie tak, jak wpisane; puste pole = 0 (bez przypominania i bez „braku pola”)
    return { dojazd: rozT(ts(r, 'wyjazd'), ts(r, 'przyjazd')), serwis: rozT(ts(r, 'przyjazd'), ts(r, 'koniec')), powrot: rozT(ts(r, 'odjazd'), ts(r, 'dom')), kmD: +c.kmD || 0, kmP: +c.kmP || 0 };
  }
  function braki(r) {
    const ob = OBOW.slice();
    if (orlen(r)) ob.splice(3, 0, ['fotoPompy', 'Zdjęcie pomp dozujących (Orlen)']);
    return ob.map(([k, n]) => {
      if (k === 'czas') { // brak, jeśli nie ma godzin serwisu LUB oba pola km są puste (wystarczy jeden km)
        const bl = bladCzasu(r); if (bl) return [k, n + ' – ' + NZ[bl[0]] + ' wcześniej niż ' + NZ[bl[1]]];
        const c = czasy(r), kmPuste = !String((r.czas || {}).kmD || '').trim() && !String((r.czas || {}).kmP || '').trim();
        const co = c.serwis > 0 ? (kmPuste ? 'km' : '') : (kmPuste ? 'godziny serwisu i km' : 'godziny serwisu');
        return co ? [k, n + ' – brak: ' + co] : null;
      }
      return String(r[k] || '').trim() ? null : [k, n];
    }).filter(Boolean);
  }

  function pusty(nazwa) {
    const w = myjnia(nazwa) || {};
    return { id: 'r' + Date.now(), myjnia: nazwa || '', szlTyp: 'SZL', szlWpis: '', szl: '', model: w.model || '', nrSeryjny: w.nrSeryjny || w.serial || '', kodBledu: '',
      iloscMyc: String(w.licznik || '').replace(/\D/g, ''), nastawy: w.nastawy || '', linkNastaw: w.linkNastaw || '', nastawyZgodne: '', fotoPompy: '', usluga: '', rodzaj: '',
      dataRaportu: dzisIso(), terminNaprawy: '', opisPrac: '', opisTestow: '', uwagi: '', mat: [], czas: {}, zal: [], komentarz: '',
      odbImie: '', odbEmail: emailStacji(nazwa), odbUwagi: '', potw: false, podpis: '', kontynuacja: '', zamknieteU: '' };
  }
  window.rapNowy = function (nazwa) {
    const r = pusty(nazwa);
    zapisz(r, 1); ST.id = r.id;
    if (typeof zamknijDet === 'function') zamknijDet();
    go('raport');
  };
  window.rapOtworz = id => { ST.id = id; render(); window.scrollTo(0, 0); };
  // kontynuacja (jak „Kontynuuj akcję serwisową” w WebCon): nowy szkic na kolejny wyjazd – to samo zlecenie i myjnia, pusty czas/opis/materiały
  window.rapKontynuacja = function () {
    const s = R(), r = pusty(s.myjnia);
    ['szlTyp', 'szlWpis', 'szl', 'model', 'nrSeryjny', 'iloscMyc', 'nastawy', 'linkNastaw', 'usluga', 'rodzaj', 'terminNaprawy', 'odbImie', 'odbEmail'].forEach(k => { if (s[k]) r[k] = s[k]; });
    r.id = 'r' + (Date.now() + 1); r.kontOd = s.id; r.opisPrac = 'Kontynuacja z dnia ' + dt(s.dataRaportu) + '. ';
    s.kontynuacja = 'Tak'; zapisz(s, 1);
    zapisz(r, 1); ST.id = r.id; render(); window.scrollTo(0, 0); toast('Nowy raport – kontynuacja');
  };
  window.rapNr = function (el) {
    const r = R(); r.szlWpis = el.value; r.szl = pelnyNr(r.szlTyp, el.value); zapisz(r);
    const p = document.getElementById('rpNrP'); if (p) p.innerHTML = nrPodglad(r);
  };
  window.rapNrTyp = function (t) { const r = R(); r.szlTyp = t; r.szl = pelnyNr(t, r.szlWpis != null ? r.szlWpis : r.szl); zapisz(r); render(); };
  function nrPodglad(r) {
    if (!String(r.szlWpis || '').trim()) return '<span class="mute">np. 11/600 albo 600 (ten miesiąc)</span>';
    return r.szl ? '→ <b>' + esc(r.szl) + '</b>' : '<span style="color:var(--red)">nie rozumiem numeru – wpisz miesiąc/numer, np. 11/600</span>';
  }
  // dane myjni z raportu → karta myjni (arkusz). Puste w karcie – zapis od razu; inne – pytam.
  window.rapDoMyjni = function (el) {
    const r = R(), k = el.dataset.k, v = String(el.value || '').trim(), w = myjnia(r.myjnia);
    if (r.demo || !v || !w || !POLA_MYJNI[k]) return;
    const stare = String(w[k] || '').trim();
    if (stare === v) return;
    if (stare && !confirm('Zaktualizować dane myjni ' + skrot(r.myjnia) + '?\n' + POLA_MYJNI[k] + ':\n' + stare + '  →  ' + v)) return;
    const pola = {}; pola[k] = v;
    api('myjnia', { n: w.nazwa, pola: JSON.stringify(pola), nadpisz: stare ? '1' : '0' }).then(j => {
      const x = j.wynik || {};
      if ((x.zapisane || []).indexOf(k) >= 0) { w[k] = v; toast('Zapisane w karcie myjni'); }
      else if (x.konflikt && x.konflikt[k] != null) toast('W arkuszu jest inna wartość – odśwież dane');
    }).catch(e => toast(/Nieznana akcja/.test(e.message) ? 'Najpierw zainstaluj aktualizację bota (/aktualizuj)' : 'Karta myjni: ' + e.message));
  };
  window.rapLista = () => { ST.id = null; render(); window.scrollTo(0, 0); };
  // 15.11.2026: kafelek „Raport dziś” na ekranie startowym – najnowszy szkic z dzisiejszą datą (bez pokazowych)
  window.rapStanDzis = function () {
    const dz = dzisIso(), o = wszystkie();
    const lista = Object.keys(o).map(k => o[k]).filter(r => r && !r.demo && r.dataRaportu === dz).sort((a, b) => String(b.zm || '').localeCompare(String(a.zm || '')));
    return lista.length ? { id: lista[0].id, brak: braki(lista[0]).length } : null;
  };
  window.rapUsun = id => { if (!confirm('Usunąć ten szkic raportu?')) return; const o = wszystkie(); delete o[id]; zapiszWsz(o); ST.id = null; render(); };

  // zwykłe pola: data-k = nazwa pola; zapis bez przerysowania (fokus zostaje)
  window.rapPole = function (el) {
    const r = R(); if (!r) return;
    const k = el.dataset.k, v = el.type === 'checkbox' ? el.checked : el.value;
    if (k.indexOf('czas.') === 0) { r.czas = r.czas || {}; const kk = k.slice(5); r.czas[kk] = v; zapisz(r); sumyCzasu(r); if (KL.indexOf(kk) >= 0 && v && kontrolaCzasu(r, kk)) { const bl = bladCzasu(r); if (bl) toast('Sprawdź godziny: ' + NZ[bl[0]] + ' wcześniej niż ' + NZ[bl[1]]); } return; }
    r[k] = v; if (k === 'myjnia') { const w = myjnia(v) || {}; /* 16.11.2026: zmiana stacji = inna maszyna – dane urządzenia (model, nr seryjny, licznik, nastawy, e-mail) bierzemy z NOWEJ stacji, stare nie zostają */ r.model = w.model || ''; r.nrSeryjny = w.nrSeryjny || w.serial || ''; r.nastawy = w.nastawy || ''; r.linkNastaw = w.linkNastaw || ''; r.odbEmail = emailStacji(v); r.iloscMyc = String(w.licznik || '').replace(/\D/g, ''); zapisz(r); render(); return; }
    clearTimeout(tz); tz = setTimeout(() => zapisz(r), 250);
  };
  window.rapWybor = function (k, v) { const r = R(); r[k] = r[k] === v ? '' : v; zapisz(r); render(); };
  window.rapTeraz = function (k) {
    const r = R(), d = new Date(); r.czas = r.czas || {};
    r.czas[k] = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    zapisz(r); render(); kontrolaCzasu(r, k);
  };
  // zabezpieczenie: godzina nie może być wcześniejsza niż poprzednie zdarzenie – chyba że to już następny dzień (praca przez północ)
  function kontrolaCzasu(r, k) {
    const p = prevWpisane(r, k); if (!p || ts(r, k) == null || ts(r, k) >= ts(r, p)) return true;
    const c = r.czas;
    if (c['d_' + k]) { toast(NZ[k] + ' (' + c[k] + ') jest wcześniej niż ' + NZ[p] + ' – popraw godzinę lub datę'); delete c['d_' + k]; c[k] = ''; zapisz(r); render(); return false; }
    const a = document.getElementById('ark');
    a.innerHTML = '<div class="tlo"></div><div class="ar"><h4>Praca przez północ?</h4><div class="mute">„' + esc(NZ[k]) + '” ' + esc(c[k]) + ' jest wcześniej niż „' + esc(NZ[p]) + '” ' + esc(c[p]) + '. Czy to już następny dzień (' + dt(dodajDzien(efData(r, k))) + ')?</div>' +
      '<div class="ab" style="margin-top:12px"><button class="btn2" onclick="rapPN(\'' + k + '\',0)">Nie – popraw godzinę</button><button class="btn" onclick="rapPN(\'' + k + '\',1)">Tak, następny dzień</button></div></div>';
    a.classList.add('on'); return false;
  }
  window.rapPN = function (k, tak) {
    const r = R(); arkZamknij(); if (!r) return;
    if (tak) r.czas['d_' + k] = dodajDzien(efData(r, k)); else r.czas[k] = '';
    zapisz(r); render();
  };
  // ręczna zmiana daty zdarzenia (np. praca zeszła na kolejny dzień)
  window.rapCzasData = function (el) {
    const r = R(); if (!r) return; const k = el.dataset.k.slice(7), stara = (r.czas || {})['d_' + k];
    r.czas = r.czas || {}; r.czas['d_' + k] = el.value;
    const bl = bladCzasu(r);
    if (bl) { toast('Ta data daje ' + NZ[bl[0]] + ' wcześniej niż ' + NZ[bl[1]] + ' – nie zapisano'); if (stara) r.czas['d_' + k] = stara; else delete r.czas['d_' + k]; }
    zapisz(r); render();
  };
  function sumyCzasu(r) {
    const c = czasy(r), el = document.getElementById('rpSum');
    if (el) el.innerHTML = tabelaCzasu(c);
  }
  function tabelaCzasu(c) {
    const w = (t, h, km) => '<div class="row"><div class="g">' + t + '</div><b>' + godz(h) + '</b><span class="mute" style="width:70px;text-align:right">' + (km != null ? km + ' km' : '') + '</span></div>';
    return w('Dojazd', c.dojazd, c.kmD) + w('Serwis', c.serwis, null) + w('Powrót', c.powrot, c.kmP) +
      '<div class="row"><div class="g"><b>Razem</b></div><b>' + godz(c.dojazd + c.serwis + c.powrot) + '</b><span class="mute" style="width:70px;text-align:right">' + (c.kmD + c.kmP) + ' km</span></div>';
  }

  // materiały: z magazynu w aucie (szukajka) albo spoza magazynu (wpis ręczny)
  window.rapMatSzukaj = function (q) {
    const box = document.getElementById('rpMs'); if (!box) return;
    q = pl(q || ''); if (q.length < 2 || !D) { box.innerHTML = ''; return; }
    const l = D.magazyn.filter(m => pl(m.nazwa + ' ' + m.kod).indexOf(q) >= 0).slice(0, 8);
    box.innerHTML = l.length ? l.map(m => '<div class="row w" onclick="rapMatDodaj(\'' + jsq(m.kod) + '\')"><div class="g">' + esc(m.nazwa) + '<div class="mute">' + esc(m.kod) + '</div></div><span class="pill">' + esc(m.ilosc) + ' szt.</span></div>').join('')
      : '<div class="mute" style="padding:8px 0">Nie ma w magazynie – dodaj jako „spoza magazynu”</div>';
  };
  window.rapMatDodaj = function (kod) {
    const r = R(), m = kod ? D.magazyn.find(x => x.kod === kod) : null;
    r.mat.push(m ? { mag: 1, kod: m.kod, nazwa: m.nazwa, jm: 'szt.', ilosc: 1, stan: m.ilosc } : { mag: 0, kod: '', nazwa: '', jm: 'szt.', ilosc: 1 });
    zapisz(r); render();
    if (!m) setTimeout(() => { const x = document.querySelectorAll('[data-mn]'); if (x.length) x[x.length - 1].focus(); }, 50);
  };
  window.rapMat = function (i, k, el) { const r = R(); r.mat[i][k] = el.value; clearTimeout(tz); tz = setTimeout(() => zapisz(r), 250); };
  window.rapMatIl = function (i, d) { const r = R(); r.mat[i].ilosc = Math.max(0, (+String(r.mat[i].ilosc).replace(',', '.') || 0) + d); if (!r.mat[i].ilosc) r.mat.splice(i, 1); zapisz(r); render(); };

  // zdjęcia: zmniejszone do 1000 px (JPEG), żeby zmieściły się w szkicu
  window.rapFoto = function (inp) {
    const r = R(); [...inp.files].forEach(f => {
      const fr = new FileReader();
      fr.onload = () => { const im = new Image(); im.onload = () => {
        const s = Math.min(1, 1000 / Math.max(im.width, im.height)), c = document.createElement('canvas');
        c.width = im.width * s; c.height = im.height * s; c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        const rr = R(); rr.zal.push(c.toDataURL('image/jpeg', .7)); zapisz(rr); render(); }; im.src = fr.result; };
      fr.readAsDataURL(f);
    });
  };
  window.rapFotoUsun = i => { const r = R(); r.zal.splice(i, 1); zapisz(r); render(); };
  // jedno wspólne zdjęcie pomp dozujących (wymagane tylko na Orlenie)
  window.rapFotoPompy = function (inp) {
    const f = inp.files && inp.files[0]; if (!f) return;
    const fr = new FileReader();
    fr.onload = () => { const im = new Image(); im.onload = () => {
      const s = Math.min(1, 1200 / Math.max(im.width, im.height)), c = document.createElement('canvas');
      c.width = im.width * s; c.height = im.height * s; c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      const rr = R(); rr.fotoPompy = c.toDataURL('image/jpeg', .72); zapisz(rr); render(); }; im.src = fr.result; };
    fr.readAsDataURL(f);
  };
  window.rapFotoPompyUsun = () => { const r = R(); r.fotoPompy = ''; zapisz(r); render(); };

  // Dyktowanie: mikrofon na klawiaturze telefonu (Gboard) – język przełączasz klawiaturą (PL/RU/UA/GR), „Popraw” tłumaczy na polski.

  // ===== POPRAWA OPISU NA JĘZYK TECHNICZNY (Claude przez bota: POST ?api=popraw) =====
  // Serwisant dyktuje jak mówi, system przepisuje na zwięzły polski tekst do raportu. Nic nie dopisuje od siebie.
  const POPR = {};
  window.rapPopraw = async function (k) {
    const r = R(), el = document.querySelector('[data-k="' + k + '"]'), t = String((el && el.value) || r[k] || '').trim();
    if (t.length < 8) return toast('Najpierw podyktuj albo wpisz, co było zrobione');
    const a = document.getElementById('ark');
    a.innerHTML = '<div class="tlo"></div><div class="ar"><h4>' + I('spark', 1) + ' Poprawiam opis…</h4><div class="mute">przepisuję na język techniczny raportu, nic nie dopisuję od siebie</div>' +
      '<div class="rp-pop"><div class="pp"><span>Podyktowane</span>' + esc(t) + '</div></div></div>';
    a.classList.add('on');
    try {
      const w = myjnia(r.myjnia) || {};
      const res = await fetch(API + '?api=popraw', { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ k: K, t: t, pole: k, myjnia: r.myjnia || '', model: r.model || w.model || '' }) });
      const txt = await res.text(); let j; try { j = JSON.parse(txt); } catch (e) { throw new Error('serwer nie odpowiedział poprawnie'); }
      if (!j.ok) throw new Error(j.blad || 'błąd serwera');
      const x = j.wynik || {}; if (!x.tekst) throw new Error('pusta odpowiedź');
      POPR[k] = { przed: t, po: x.tekst };
      a.innerHTML = '<div class="tlo" onclick="arkZamknij()"></div><div class="ar" style="max-height:84vh;overflow:auto"><h4>' + I('spark', 1) + ' Opis do raportu</h4>' +
        '<div class="rp-pop"><div class="pp"><span>Podyktowane</span>' + esc(t) + '</div><div class="pn"><span>Do raportu</span>' + esc(x.tekst).replace(/\n/g, '<br>') + '</div></div>' +
        (x.niejasne ? '<div class="note" style="color:var(--org)">' + I('alert', 1) + ' ' + esc(x.niejasne) + '</div>' : '') +
        '<div class="ab" style="margin-top:12px"><button class="btn2" onclick="arkZamknij()">Zostaw moje</button><button class="btn" onclick="rapPoprawWstaw(\'' + k + '\')">Wstaw do raportu</button></div></div>';
    } catch (e) {
      arkZamknij();
      toast(/Nieznana|akcja|poprawnie|Unknown/i.test(e.message) ? 'Najpierw zainstaluj aktualizację bota (/aktualizuj)' : 'Poprawa: ' + e.message);
    }
  };
  window.rapPoprawWstaw = function (k) {
    const r = R(), p = POPR[k]; if (!p) return;
    r[k + 'Dyktowane'] = p.przed; r[k] = p.po; zapisz(r); arkZamknij(); render(); toast('Wstawione – oryginał zapamiętany');
  };
  window.rapPoprawCofnij = function (k) {
    const r = R(); if (!r[k + 'Dyktowane']) return;
    r[k] = r[k + 'Dyktowane']; delete r[k + 'Dyktowane']; zapisz(r); render(); toast('Przywrócony tekst podyktowany');
  };

  // podpisy palcem: odbierający i serwisant – oba przy każdym raporcie (tak jak w WebCon)
  function podpisStart(id, wczytaj, zapiszP) {
    const c = document.getElementById(id); if (!c) return;
    const x = c.getContext('2d'), sk = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * sk; c.height = c.offsetHeight * sk; x.scale(sk, sk);
    x.lineWidth = 2.4; x.lineCap = 'round'; x.strokeStyle = '#111';
    const st0 = wczytaj(); if (st0) { const im = new Image(); im.onload = () => x.drawImage(im, 0, 0, c.offsetWidth, c.offsetHeight); im.src = st0; }
    let on = false;
    const p = e => { const b = c.getBoundingClientRect(), t = e.touches ? e.touches[0] : e; return [t.clientX - b.left, t.clientY - b.top]; };
    const st = e => { on = true; const [a, b] = p(e); x.beginPath(); x.moveTo(a, b); e.preventDefault(); };
    const mv = e => { if (!on) return; const [a, b] = p(e); x.lineTo(a, b); x.stroke(); e.preventDefault(); };
    const en = () => { if (!on) return; on = false; zapiszP(c.toDataURL('image/png')); };
    c.addEventListener('touchstart', st, { passive: false }); c.addEventListener('touchmove', mv, { passive: false }); c.addEventListener('touchend', en);
    c.addEventListener('mousedown', st); c.addEventListener('mousemove', mv); window.addEventListener('mouseup', en);
  }
  function podpisy() {
    podpisStart('rpPod', () => R().podpis, d => { const rr = R(); rr.podpis = d; zapisz(rr); });
    podpisStart('rpPodS', () => R().podpisSerw, d => { const rr = R(); rr.podpisSerw = d; zapisz(rr); });
  }
  window.rapPodpisSCzysc = () => { const r = R(); r.podpisSerw = ''; zapisz(r); render(); };
  window.rapPodpisCzysc = () => { const r = R(); r.podpis = ''; zapisz(r); render(); };

  // licznik brakujących pól u góry; klik = przewiń do pierwszego brakującego
  function licznik() {
    const r = R(), el = document.getElementById('rpBr'); if (!r || !el) return;
    const b = braki(r);
    el.className = 'rp-br ' + (b.length ? 'zle' : 'ok');
    el.innerHTML = b.length ? I('alert', 1) + ' Brakuje ' + b.length + ' ' + (b.length === 1 ? 'pola' : 'pól') + ': ' + esc(b[0][1]) + (b.length > 1 ? ' …' : '') : I('check', 1) + ' Wszystkie obowiązkowe pola wypełnione';
    document.querySelectorAll('.rp [data-ob]').forEach(x => x.classList.toggle('brak', b.some(z => z[0] === x.dataset.ob)));
  }
  window.rapDoBraku = function () {
    const b = braki(R()); if (!b.length) return;
    const el = document.querySelector('.rp [data-ob="' + b[0][0] + '"]'); if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' }); const f = el.querySelector('input,textarea,select') || el; setTimeout(() => f.focus && f.focus({ preventScroll: true }), 400);
  };

  // ===== POKAZ DLA SZEFA (15.11.2026) =====
  // Raport w aplikacji to WZÓR: tak wyglądałoby wypełnianie, gdyby firma dała dostęp do API WebCon.
  // „Wyślij do WebCon” = tryb pokazowy: pokazuje, co poszłoby do których zakładek WebCon. NIC nie jest wysyłane.
  function webconDane(r) {
    const c = czasy(r), t = (k, v) => [k, v == null || v === '' ? '' : String(v)];
    return [
      ['Urządzenie', [t('Nazwa', r.model), t('Nr seryjny', r.nrSeryjny), t('Ilość myć', r.iloscMyc),
        t('Nastawy chemiczne zgodne z ustaleniami?', r.nastawyZgodne)]],
      ['Realizacja zlecenia', [t('Numer zlecenia', r.szl), t('Rodzaj zgłoszenia', r.rodzaj), t('Usługa serwisowa', r.usluga), t('Data do raportu', r.dataRaportu ? dt(r.dataRaportu) : ''),
        t('Termin naprawy', r.terminNaprawy ? dt(r.terminNaprawy) : ''), t('Opis wykonywanych prac', r.opisPrac), t('Opis przeprowadzonych testów', r.opisTestow), t('Uwagi', r.uwagi)]],
      ['Odbierający', [t('Imię i nazwisko', r.odbImie), t('Adres e-mail', r.odbEmail), t('Uwagi', r.odbUwagi)]],
      ['Rejestracja czasu', [t('Serwis', c.serwis ? godz(c.serwis) : ''), t('Dojazd', c.kmD ? c.kmD + ' km' : ''), t('Powrót', c.kmP ? c.kmP + ' km' : ''), t('Pracownik', SERWISANT)]],
      ['Materiały', r.mat.length ? r.mat.map(m => t((m.mag ? 'Magazyn ' + SERWISANT : 'Poza magazynem'), (m.kod ? m.kod + ' · ' : '') + m.nazwa + ' – ' + String(m.ilosc).replace('.', ',') + ' ' + m.jm)) : [t('Materiały', 'brak')]],
      ['Załączniki', [t('Dokumentacja fotograficzna', (r.zal.length + (r.fotoPompy ? 1 : 0)) + ' zdj.' + (r.fotoPompy ? ' (w tym pompy dozujące)' : '')), t('Komentarz', r.komentarz),
        t('Podpis odbierającego', r.podpis ? 'tak' : ''), t('Podpis serwisanta', r.podpisSerw ? 'tak' : ''), t('Raport serwisowy (PDF)', 'generuje WebCon')]],
      ['Podsumowanie', [t('Czy serwis wymaga kontynuacji?', r.kontynuacja), t('Czy zlecenie zostało zamknięte u zleceniodawcy?', r.zamknieteU)]]
    ];
  }
  const sleep = ms => new Promise(f => setTimeout(f, ms));
  window.rapWyslij = async function () {
    const r = R(); if (!r) return;
    const a = document.getElementById('ark'), b = braki(r);
    if (b.length) {
      a.innerHTML = '<div class="tlo" onclick="arkZamknij()"></div><div class="ar"><h4>WebCon nie przyjmie raportu</h4><div class="mute">Brakuje pól obowiązkowych – w WebCon wyszłoby to dopiero przy zapisie, tutaj widać od razu:</div>' +
        '<div style="margin:10px 0">' + b.map(x => '<div class="row"><div class="g">' + I('alert', 1) + ' ' + esc(x[1]) + '</div></div>').join('') + '</div>' +
        '<div class="ab"><button class="btn" onclick="arkZamknij();rapDoBraku()">Pokaż pierwsze</button></div></div>';
      a.classList.add('on'); return;
    }
    const sek = webconDane(r);
    const krok = (t, st) => '<div class="row"><div class="g">' + t + '</div>' + (st === 1 ? '<span class="pill ok">' + I('check', 1) + '</span>' : st === 0 ? '<span class="pill">…</span>' : '') + '</div>';
    const kroki = ['Połączenie z WebCon (API)', 'Zlecenie ' + (r.szl || '—') + ' – odnalezione', ...sek.map(s => 'Zakładka „' + s[0] + '” – ' + s[1].filter(x => x[1]).length + ' pól'), 'Raport serwisowy PDF – wygenerowany'];
    const pok = n => { a.innerHTML = '<div class="tlo"></div><div class="ar"><h4>Wysyłanie do WebCon</h4><div class="mute">tryb pokazowy – bez połączenia, nic nie jest zapisywane</div><div style="margin:10px 0 4px">' +
      kroki.map((k, i) => krok(esc(k), i < n ? 1 : i === n ? 0 : 2)).join('') + '</div></div>'; };
    a.classList.add('on');
    for (let i = 0; i <= kroki.length; i++) { pok(i); await sleep(i < 2 ? 450 : 260); }
    const d = new Date(), srl = 'SRL/' + d.getFullYear() + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + String(10219 + (Date.now() % 700)).padStart(5, '0');
    r.demoSrl = srl; r.demoKiedy = d.toISOString(); zapisz(r, 1);
    a.innerHTML = '<div class="tlo" onclick="arkZamknij()"></div><div class="ar"><h4>' + I('check', 1) + ' Raport w WebCon</h4>' +
      '<div class="row"><div class="g">Realizacja zlecenia<div class="mute">' + esc(r.szl || '') + ' · ' + esc(skrot(r.myjnia)) + '</div></div><b>' + srl + '</b></div>' +
      '<div class="row"><div class="g">Wypełnione pola<div class="mute">jeden ekran, bez przełączania zakładek</div></div><b>' + sek.reduce((s, x) => s + x[1].filter(y => y[1]).length, 0) + ' pól</b></div>' +
      '<div class="note">POKAZ: numer SRL jest przykładowy. Po udostępnieniu API WebCon ten przycisk zapisze raport naprawdę.</div>' +
      '<div class="ab"><button class="btn2" onclick="arkZamknij();rapPodglad()">Co poszło do WebCon</button><button class="btn" onclick="arkZamknij()">OK</button></div></div>';
    render();
  };
  // podgląd: pola raportu rozłożone na zakładki WebCon (to samo, co serwisant dziś przeklikuje ręcznie)
  window.rapPodglad = function () {
    const r = R(); if (!r) return;
    const a = document.getElementById('ark');
    a.innerHTML = '<div class="tlo" onclick="arkZamknij()"></div><div class="ar" style="max-height:82vh;overflow:auto"><h4>Pola w WebCon</h4><div class="mute">7 zakładek WebCon = 1 ekran raportu</div>' +
      webconDane(r).map(([z, p]) => '<div style="margin-top:12px"><b>' + esc(z) + '</b>' + p.map(([k, v]) => '<div class="row"><div class="g mute">' + esc(k) + '</div><div style="max-width:58%;text-align:right">' +
        (v ? esc(v.length > 90 ? v.slice(0, 90) + '…' : v) : '<span class="mute">—</span>') + '</div></div>').join('') + '</div>').join('') +
      '<div class="ab" style="margin-top:12px"><button class="btn" onclick="arkZamknij()">Zamknij</button></div></div>';
    a.classList.add('on');
  };

  // raport pokazowy: wypełniony jednym kliknięciem (do prezentacji – nic nie trafia do karty myjni ani do arkusza)
  function rysunek(w, h, f) { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); f(x); return c; }
  function podpisDemo(v) {
    return rysunek(600, 170, x => { x.strokeStyle = '#123'; x.lineWidth = 3; x.lineCap = 'round'; x.beginPath(); x.moveTo(60, 110);
      for (let i = 0; i <= 60; i++) { const t = i / 60; x.lineTo(60 + t * 420, 105 - Math.sin(t * (v ? 11 : 18)) * (v ? 34 : 28) * (1 - t * .5) - t * 20); }
      x.stroke(); x.beginPath(); x.moveTo(420, 120); x.quadraticCurveTo(480, 140, 540, 112); x.stroke(); }).toDataURL('image/png');
  }
  function fotoDemo(tytul, kol) {
    return rysunek(800, 600, x => { const g = x.createLinearGradient(0, 0, 800, 600); g.addColorStop(0, kol); g.addColorStop(1, '#1d2730'); x.fillStyle = g; x.fillRect(0, 0, 800, 600);
      x.fillStyle = 'rgba(255,255,255,.9)'; x.font = 'bold 44px sans-serif'; x.textAlign = 'center'; x.fillText(tytul, 400, 290); x.font = '28px sans-serif'; x.fillText('zdjęcie przykładowe', 400, 345); }).toDataURL('image/jpeg', .7);
  }
  window.rapDemo = function () {
    const lst = D ? D.myjnie.concat(D.inne) : [], w = lst.find(x => /orlen/i.test(x.nazwa)) || lst[0];
    if (!w) return toast('Brak listy myjni – odśwież dane');
    const r = pusty(w.nazwa), d = new Date();
    Object.assign(r, { demo: 1, szlTyp: 'SZL', szlWpis: (d.getMonth() + 1) + '/600', rodzaj: 'AWP', usluga: 'Gwarancyjna', model: r.model || 'Myjnia Christ C-160 Genius',
      nrSeryjny: r.nrSeryjny || '160-0000 (przykład)', iloscMyc: r.iloscMyc || '48210', nastawyZgodne: 'Tak', 
      opisPrac: 'no więc przyjechałem, portal stawał w połowie mycia i wywalało E 412, no to patrzę ten czujnik od jazdy, ten indukcyjny, był cały rozwalony, chyba ktoś przywalił, wymieniłem na nowy, ustawiłem tak z cztery milimetry od blachy, a jeszcze ten kabel w łańcuchu był przetarty to go zaizolowałem',
      opisTestow: '3 mycia testowe na programie Premium i 1 na Standard – bez błędów, jazda płynna.', uwagi: 'Szczotki boczne do wymiany przy najbliższym przeglądzie.',
      czas: { wyjazd: '07:30', przyjazd: '08:45', koniec: '11:15', odjazd: '11:20', dom: '12:35', kmD: '62', kmP: '62' },
      odbImie: 'Kierownik stacji (przykład)', odbEmail: 'stacja@przyklad.pl', potw: true, podpis: podpisDemo(), podpisSerw: podpisDemo(1), kontynuacja: 'Nie', zamknieteU: 'Tak',
      komentarz: 'Po pracy stanowisko posprzątane, zdjęcia przed i po w załącznikach.', zal: [fotoDemo('Czujnik jazdy – przed', '#5b6b7a'), fotoDemo('Czujnik jazdy – po', '#2f7d5b')] });
    r.szl = pelnyNr('SZL', r.szlWpis);
    r.mat = (D.magazyn || []).slice(0, 1).map(m => ({ mag: 1, kod: m.kod, nazwa: m.nazwa, jm: 'szt.', ilosc: 1, stan: m.ilosc }));
    if (!r.mat.length) r.mat.push({ mag: 0, kod: '', nazwa: 'Czujnik indukcyjny M18 (przykład)', jm: 'szt.', ilosc: 1 });
    r.mat.push({ mag: 0, kod: '', nazwa: 'Opaski kablowe', jm: 'szt.', ilosc: 4 });
    if (orlen(r)) r.fotoPompy = fotoDemo('Pompy dozujące', '#3a5a8c');
    zapisz(r, 1); ST.id = r.id; render(); window.scrollTo(0, 0); toast('Raport pokazowy gotowy');
  };

  // porównanie dla szefa: WebCon dziś ↔ raport w aplikacji
  const PORown = [
    ['Zakładki i przełączanie', '7 zakładek w zleceniu + 6 w raporcie, skakanie tam i z powrotem', 'jeden ekran, 7 bloków pod sobą'],
    ['Czego brakuje', 'widać dopiero przy zapisie', 'licznik „Brakuje N pól” na górze, klik = przejście do pola'],
    ['Czas pracy', 'godziny i km wpisywane ręcznie', 'przyciski Wyjazd / Na myjni / Koniec / Powrót – liczy się samo'],
    ['Opis prac', 'pisanie na klawiaturze', 'dyktujesz jak mówisz – system przepisuje na poprawny język techniczny raportu'],
    ['Kolejny wyjazd', '„Kontynuuj akcję serwisową” i wszystko od nowa', 'jeden klik, dane zlecenia przechodzą same'],
    ['Na tablecie', 'wąski formularz', 'dwie kolumny w poziomie']
  ];
  window.rapPorownanie = function () {
    const a = document.getElementById('ark');
    a.innerHTML = '<div class="tlo" onclick="arkZamknij()"></div><div class="ar" style="max-height:84vh;overflow:auto;max-width:760px"><h4>WebCon dziś → raport w aplikacji</h4>' +
      '<div class="mute">Te same pola i nazwy co w WebCon. Różnica jest w tym, jak serwisant je wypełnia.</div><div class="rp-por">' +
      PORown.map(([t, x, y]) => '<div class="pz"><b>' + esc(t) + '</b><div class="pw"><span>WebCon</span>' + esc(x) + '</div><div class="pa"><span>Aplikacja</span>' + esc(y) + '</div></div>').join('') + '</div>' +
      '<div class="note">Potrzebne od firmy: dostęp do API WebCon (zapis Realizacji zlecenia). Wtedy przycisk „Wyślij do WebCon” zapisuje raport bez przepisywania.</div>' +
      '<div class="ab" style="margin-top:12px"><button class="btn" onclick="arkZamknij()">Zamknij</button></div></div>';
    a.classList.add('on');
  };

  const css = '<style>' +
    '.rp .card h3 .nr{margin-left:auto;color:var(--mute);font-weight:600}' +
    '.rp label{display:block;font-size:13px;font-weight:600;color:var(--mute);margin:2px 2px 5px}' +
    '.rp label i{color:var(--red);font-style:normal}' +
    '.rp .pole.brak label{color:var(--red)} .rp .pole.brak .as-in,.rp .pole.brak textarea{box-shadow:0 0 0 2px color-mix(in srgb,var(--red) 45%,transparent)}' +
    '.rp .siatka{display:grid;grid-template-columns:1fr;gap:0 14px}' +
    '@media (min-width:700px){.rp .siatka{grid-template-columns:1fr 1fr}.rp .siatka .cala{grid-column:1/-1}}' +
    '.rp-br{position:sticky;top:calc(env(safe-area-inset-top) + 60px);z-index:4;display:flex;align-items:center;gap:7px;padding:10px 14px;border-radius:16px;margin-bottom:14px;font-weight:600;font-size:15px;cursor:pointer;' +
      '-webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px)}' +
    '.rp-br.zle{background:color-mix(in srgb,var(--org) 18%,var(--card));color:var(--org)} .rp-br.ok{background:var(--grnbg);color:var(--grn)}' +
    '.rp .wyb{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}' +
    '.rp .wyb button{border:0;border-radius:999px;padding:10px 16px;font:inherit;font-size:15px;font-weight:600;background:var(--fill);color:var(--ink)}' +
    '.rp .wyb button.on{background:var(--acc);color:#fff}' +
    '.rp .tx{position:relative} ' +
    '.rp .tx textarea{min-height:96px}' +
    '.rp .czasy{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:12px}' +
    '.rp .cz{background:var(--fill);border-radius:16px;padding:10px;display:flex;flex-direction:column;gap:6px}' +
    '.rp .cz .btn{min-height:42px;font-size:15px;padding:0 10px} .rp .cz.ma .btn{background:var(--grn)}' +
    '.rp .cz input{margin:0;text-align:center;font-weight:700}' +
    '.rp .ab2{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px} .rp .ab2 .btn2{flex:1;justify-content:center;min-width:140px}' +
    '.rp .mtt{font-size:13px;font-weight:700;letter-spacing:.3px;text-transform:uppercase;color:var(--mute);margin:14px 0 2px}' +
    '.rp .cz .dch{position:relative;align-self:center;font-size:13px;font-weight:600;color:var(--mute);padding:4px 10px;border-radius:999px;background:var(--hl)} .rp .cz .dch.pn{color:var(--acc)}' +
    '.rp .cz .dch input{position:absolute;inset:0;opacity:0;width:100%;height:100%;margin:0}' +
    '.rp .mt{display:flex;align-items:center;gap:8px;padding:9px 0;border-top:.5px solid var(--line)}' +
    '.rp .mt .g{flex:1;min-width:0} .rp .mt input{margin:0}' +
    '.rp .il{display:flex;align-items:center;gap:4px} .rp .il b{min-width:30px;text-align:center}' +
    '.rp .fot{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px} .rp .fot div{position:relative} .rp .fot img{width:96px;height:96px;object-fit:cover;border-radius:14px;display:block}' +
    '.rp .fot button{position:absolute;top:4px;right:4px;width:28px;height:28px}' +
    '.rp canvas{width:100%;height:170px;background:#fff;border-radius:16px;touch-action:none;display:block;box-shadow:inset 0 0 0 1px var(--line)}' +
    '.rp .chkl{display:flex;gap:10px;align-items:flex-start;font-size:15px;margin:4px 0 12px} .rp .chkl input{width:22px;height:22px;flex:0 0 auto;margin-top:1px}' +
    '.rp .dol{display:flex;gap:10px;flex-wrap:wrap;margin:6px 0 14px} .rp .dol .btn{flex:1}' +
    '.rp .nrw{display:flex;gap:8px;align-items:center} .rp .nrw .wyb{margin:0;flex:0 0 auto;flex-wrap:nowrap} .rp .nrw input{flex:1;min-width:0;margin:0}' +
    '.rp .nrp{font-size:14px;margin:6px 2px 12px;min-height:18px}' +
    '.rp .wyb select{border:0;border-radius:999px;padding:10px 14px;font:inherit;font-size:15px;font-weight:600;background:var(--fill);color:var(--ink);max-width:100%;width:auto;margin:0}' +
    '.rp .wyb select.on{background:var(--acc);color:#fff}' +
    '.rp .pomp{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:12px} .rp .pomp img{width:120px;height:90px;object-fit:cover;border-radius:14px}' +
    '.rp .kont{background:color-mix(in srgb,var(--acc) 12%,var(--card));border-radius:16px;padding:12px;margin:0 0 12px}' +
    '.rp-por{display:grid;gap:10px;margin-top:12px} @media (min-width:700px){.rp-por{grid-template-columns:1fr 1fr}}' +
    '.rp-por .pz{background:var(--fill);border-radius:16px;padding:12px} .rp-por .pz>div{font-size:14px;margin-top:6px;line-height:1.35}' +
    '.rp-por span{display:inline-block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;margin-right:6px;padding:2px 7px;border-radius:999px}' +
    '.rp-por .pw span{background:var(--orgbg);color:var(--org)} .rp-por .pa span{background:var(--grnbg);color:var(--grn)}' +
    '.rp .demo{background:var(--acc2);color:var(--acc);border-radius:16px;padding:10px 14px;margin-bottom:14px;font-size:14px;font-weight:600}' +
    '.rp .popr{display:flex;gap:8px;flex-wrap:wrap;margin:-4px 0 12px}' +
    '.rp-pop{display:grid;gap:10px;margin-top:12px} @media (min-width:700px){.rp-pop{grid-template-columns:1fr 1fr}}' +
    '.rp-pop>div{border-radius:16px;padding:12px;font-size:15px;line-height:1.45;white-space:pre-wrap} .rp-pop .pp{background:var(--fill);color:var(--mute)} .rp-pop .pn{background:var(--grnbg)}' +
    '.rp-pop span{display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px}' +
    '.rp-pop .pn span{color:var(--grn)}' +
    '</style>';

  const pole = (k, et, typ, ob, extra) => '<div class="pole' + (extra && extra.cala ? ' cala' : '') + '"' + (ob ? ' data-ob="' + k + '"' : '') + '><label>' + et + (ob ? ' <i>*</i>' : '') + '</label>' +
    '<input class="as-in" data-k="' + k + '" type="' + (typ || 'text') + '"' + (extra && extra.im ? ' inputmode="' + extra.im + '"' : '') + (extra && extra.ph ? ' placeholder="' + esc(extra.ph) + '"' : '') + ' value="' + esc(R()[k] || '') + '" oninput="rapPole(this)"></div>';
  const polem = (k, et, ob, cala) => '<div class="pole' + (cala ? ' cala' : '') + '"' + (ob ? ' data-ob="' + k + '"' : '') + '><label>' + et + (ob ? ' <i>*</i>' : '') + '</label>' +
    '<input class="as-in" data-k="' + k + '" value="' + esc(R()[k] || '') + '" oninput="rapPole(this)" onchange="rapDoMyjni(this)"></div>';
  const tx = (k, et, ob, ph) => '<div class="pole cala"' + (ob ? ' data-ob="' + k + '"' : '') + '><label>' + et + (ob ? ' <i>*</i>' : '') + '</label><div class="tx">' +
    '<textarea data-k="' + k + '" placeholder="' + esc(ph || '') + '" oninput="rapPole(this)">' + esc(R()[k] || '') + '</textarea>' +
    '</div>' +
    (k === 'opisPrac' || k === 'opisTestow' ? '<div class="popr"><button class="btn2" onclick="rapPopraw(\'' + k + '\')">' + I('spark', 1) + 'Popraw na język techniczny</button>' +
      (R()[k + 'Dyktowane'] ? '<button class="btn2" onclick="rapPoprawCofnij(\'' + k + '\')">Cofnij</button>' : '') + '</div>' : '') + '</div>';
  const CAM = '<svg class="i s" viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>';

  function widokLista() {
    const o = wszystkie(), l = Object.values(o).sort((a, b) => (b.zm || '').localeCompare(a.zm || ''));
    const lst = D ? D.myjnie.concat(D.inne) : [];
    let h = css + naglowek('doc', 'Raport', 'raport wykonanych prac (WebCon)');
    h += '<div class="card"><h3>' + I('pen', 1) + 'Nowy raport</h3><select class="as-in" id="rpNm"><option value="">— wybierz myjnię —</option>' +
      lst.map(w => '<option>' + esc(w.nazwa) + '</option>').join('') + '</select><button class="btn" onclick="rapNowy(document.getElementById(\'rpNm\').value)">Zacznij raport</button>' +
      '<div class="note">Raport możesz też zacząć z karty myjni (przycisk „Raport”).</div></div>';
    h += '<div class="card"><h3>' + I('spark', 1) + 'Pokaz dla szefa</h3><div class="mute" style="margin-bottom:10px">Tak wyglądałby raport, gdyby firma dała dostęp do API WebCon.</div>' +
      '<div class="dol" style="margin:0"><button class="btn" onclick="rapDemo()">Raport pokazowy</button><button class="btn2" onclick="rapPorownanie()">WebCon dziś → aplikacja</button></div></div>';
    h += '<div class="card"><h3>' + I('doc', 1) + 'Szkice (' + l.length + ')</h3>' + (l.length ? l.map(r => { const b = braki(r).length;
      return '<div class="row w" onclick="rapOtworz(\'' + r.id + '\')"><div class="g"><b>' + esc(skrot(r.myjnia || 'bez myjni')) + '</b>' + (r.szl ? ' <span class="mute">' + esc(r.szl) + '</span>' : '') +
        '<div class="mute">' + dt(r.dataRaportu) + (r.kontOd ? ' · kontynuacja' : '') + (r.demo ? ' · pokaz' : '') + (r.opisPrac ? ' · ' + esc(r.opisPrac.slice(0, 60)) : '') + '</div></div><span class="pill ' + (b ? 'o' : 'ok') + '">' + (b ? 'brak ' + b : r.demoSrl ? 'w WebCon (pokaz)' : 'gotowy') + '</span></div>'; }).join('')
      : '<div class="mute">brak szkiców</div>') + '</div>';
    return h;
  }

  function widokRaport() {
    const r = R(), w = myjnia(r.myjnia) || {}, c = r.czas || {}, lst = D ? D.myjnie.concat(D.inne) : [];
    // 16.11.2026: szkic założony wcześniej (zanim doszły dane stacji) – dopełnij puste pola z karty myjni i e-mail Orlen z numeru SP
    if (r.myjnia && !r.demo) {
      let zm = 0;
      // szkic ze starej wersji: dane z INNEJ stacji (zmieniono myjnię po wpisaniu) – popraw
      const inne = lst.filter(x => x.nazwa !== r.myjnia);
      if (r.nrSeryjny && inne.some(x => x.nrSeryjny === r.nrSeryjny) && (w.nrSeryjny || '') !== r.nrSeryjny) { r.nrSeryjny = ''; zm = 1; }
      const lc = x => String(x || '').replace(/\D/g, '');
      if (r.iloscMyc && inne.some(x => lc(x.licznik) === lc(r.iloscMyc)) && lc(w.licznik) !== lc(r.iloscMyc)) { r.iloscMyc = ''; zm = 1; }
      if (/^s0\d{4}@sp\.orlen\.pl$/i.test(r.odbEmail || '') && r.odbEmail !== emailStacji(r.myjnia)) { r.odbEmail = ''; zm = 1; }
      [['model', w.model], ['nrSeryjny', w.nrSeryjny || w.serial], ['odbEmail', emailStacji(r.myjnia)]].forEach(([k, v]) => { if (!String(r[k] || '').trim() && v) { r[k] = v; zm = 1; } });
      if (!String(r.iloscMyc || '').trim() && w.licznik) { r.iloscMyc = String(w.licznik).replace(/\D/g, ''); zm = 1; }
      if (zm) zapisz(r);
    }
    let h = css + '<div class="rp"><div class="phead"><button class="ib" onclick="rapLista()">' + I('back') + '</button><div><b>Raport · ' + esc(skrot(r.myjnia || '')) + '</b><span>' +
      esc([w.miasto, w.adres].filter(Boolean).join(', ')) + ' · szkic zapisuje się sam</span></div></div>';
    h += '<div id="rpBr" class="rp-br" onclick="rapDoBraku()"></div>';
    if (r.demo) h += '<div class="demo">Raport pokazowy – dane przykładowe, nic nie trafia do karty myjni ani do arkusza.</div>';

    h += '<div class="card"><h3>' + I('wrench', 1) + 'Urządzenie <span class="nr">1</span></h3><div class="siatka">' +
      '<div class="pole"><label>Myjnia</label><select class="as-in" data-k="myjnia" onchange="rapPole(this)">' + lst.map(x => '<option' + (x.nazwa === r.myjnia ? ' selected' : '') + '>' + esc(x.nazwa) + '</option>').join('') + '</select></div>' +
      '<div class="pole"><label>Nr zlecenia</label><div class="nrw"><div class="wyb">' +
        ['SZL', 'SZP'].map(t => '<button class="' + ((r.szlTyp || 'SZL') === t ? 'on' : '') + '" onclick="rapNrTyp(\'' + t + '\')">' + t + '</button>').join('') + '</div>' +
        '<input class="as-in" inputmode="numeric" placeholder="11/600" value="' + esc(r.szlWpis != null ? r.szlWpis : (r.szl || '')) + '" oninput="rapNr(this)"></div>' +
        '<div class="nrp" id="rpNrP">' + nrPodglad(Object.assign({}, r, { szlWpis: r.szlWpis != null ? r.szlWpis : r.szl })) + '</div></div>' +
      '<div class="pole"><label>Rodzaj zgłoszenia</label><div class="wyb">' +
        RODZAJE_GL.map(v => '<button class="' + (r.rodzaj === v ? 'on' : '') + '" onclick="rapWybor(\'rodzaj\',\'' + v + '\')">' + v + '</button>').join('') +
        '<select class="' + (RODZAJE_RESZTA.indexOf(r.rodzaj) >= 0 ? 'on' : '') + '" data-k="rodzaj" onchange="rapPole(this);render()"><option value="">więcej…</option>' +
        RODZAJE_RESZTA.map(v => '<option' + (v === r.rodzaj ? ' selected' : '') + '>' + v + '</option>').join('') + '</select></div></div>' +
      polem('model', 'Nazwa (model)', 0) + polem('nrSeryjny', 'Nr seryjny', 1) +
      pole('iloscMyc', 'Ilość myć', 'text', 1, { im: 'numeric' }) +
      '<div class="pole cala" data-ob="nastawyZgodne"><label>Nastawy chemiczne zgodne z ustaleniami? <i>*</i></label><div class="wyb">' +
      ['Tak', 'Nie'].map(v => '<button class="' + (r.nastawyZgodne === v ? 'on' : '') + '" onclick="rapWybor(\'nastawyZgodne\',\'' + v + '\')">' + v + '</button>').join('') + '</div></div>' +
      (orlen(r) ? '<div class="pole cala" data-ob="fotoPompy"><label>Zdjęcie pomp dozujących (wszystkie na jednym) <i>*</i></label><div class="pomp">' +
        (r.fotoPompy ? '<img src="' + r.fotoPompy + '"><button class="btn2" onclick="rapFotoPompyUsun()">Usuń</button>' : '') +
        '<label class="btn2" style="display:inline-flex">' + CAM + (r.fotoPompy ? ' Zrób ponownie' : ' Zrób zdjęcie pomp') + '<input type="file" accept="image/*" capture="environment" hidden onchange="rapFotoPompy(this)"></label>' +
        '<label class="btn2" style="display:inline-flex">' + I('doc', 1) + ' Wgraj z galerii<input type="file" accept="image/*" hidden onchange="rapFotoPompy(this)"></label></div></div>' :
        '<div class="pole cala"><label>Zdjęcie pomp / nastaw <small style="font-weight:400">(trafia do „Zdjęcia” na dole' + (r.zal.length ? ', dodano: ' + r.zal.length : '') + ')</small></label><div class="pomp">' +
        '<label class="btn2" style="display:inline-flex">' + CAM + ' Zrób zdjęcie<input type="file" accept="image/*" capture="environment" hidden onchange="rapFoto(this)"></label>' +
        '<label class="btn2" style="display:inline-flex">' + I('doc', 1) + ' Wgraj z galerii<input type="file" accept="image/*" multiple hidden onchange="rapFoto(this)"></label></div></div>') +
      '<div class="note cala">Model i nr seryjny zapisują się też w karcie myjni – następnym razem wpiszą się same.</div></div></div>';

    h += '<div class="card"><h3>' + I('pen', 1) + 'Co zrobione <span class="nr">2</span></h3><div class="siatka">' +
      '<div class="pole cala" data-ob="usluga"><label>Usługa serwisowa <i>*</i></label><div class="wyb">' +
      USLUGI.map(v => '<button class="' + (r.usluga === v ? 'on' : '') + '" onclick="rapWybor(\'usluga\',\'' + jsq(v) + '\')">' + v + '</button>').join('') + '</div></div>' +
      pole('terminNaprawy', 'Termin naprawy', 'date', 0) +
      tx('opisPrac', 'Opis wykonanych prac', 1, 'Co było, co zrobione, co wymienione') + tx('opisTestow', 'Opis przeprowadzonych testów', 0, 'Np. 3 mycia testowe, wszystkie programy OK') +
      tx('uwagi', 'Uwagi', 0, '') + '</div></div>';

    const wierszMat = (m, i) => '<div class="mt"><div class="g">' + (m.mag ? '<b>' + esc(m.nazwa) + '</b><div class="mute">' + esc(m.kod) + ' · z magazynu ' + esc(SERWISANT) + (m.stan != null ? ' · stan ' + esc(m.stan) : '') + '</div>'
        : '<input class="as-in" data-mn placeholder="Nazwa / numer części (z demontażu, z busa…)" value="' + esc(m.nazwa) + '" oninput="rapMat(' + i + ',\'nazwa\',this)">') + '</div>' +
        '<div class="il"><button class="ib" onclick="rapMatIl(' + i + ',-1)">−</button><b>' + esc(String(m.ilosc).replace('.', ',')) + '</b><button class="ib" onclick="rapMatIl(' + i + ',1)">+</button></div></div>';
    h += '<div class="card"><h3>' + I('box', 1) + 'Materiały <span class="nr">3</span></h3>' +
      '<div class="mtt">Z magazynu (oficjalne)</div>' +
      r.mat.map((m, i) => m.mag ? wierszMat(m, i) : '').join('') +
      '<input type="search" placeholder="Dodaj z magazynu: nazwa albo kod" oninput="rapMatSzukaj(this.value)" style="margin-top:10px"><div id="rpMs"></div>' +
      '<div class="mtt">Spoza magazynu (z demontażu, z busa – bez ewidencji)</div>' +
      r.mat.map((m, i) => m.mag ? '' : wierszMat(m, i)).join('') +
      '<button class="btn2" onclick="rapMatDodaj()">+ Część spoza ewidencji</button></div>';

    h += '<div class="card" data-ob="czas"><h3>' + I('clock', 1) + 'Rejestracja czasu <span class="nr">4</span></h3>' +
      '<div class="siatka"><div class="pole" data-ob="dataRaportu"><label>Dzień wyjazdu (data do raportu) <i>*</i></label><input class="as-in" type="date" data-k="dataRaportu" value="' + esc(r.dataRaportu || '') + '" onchange="rapPole(this)"></div></div>' +
      '<div class="czasy">' +
      CZASY.map(([k, t]) => '<div class="cz' + (c[k] ? ' ma' : '') + '"><button class="btn" onclick="rapTeraz(\'' + k + '\')">' + t + '</button>' +
        '<input class="as-in" type="time" data-k="czas.' + k + '" value="' + esc(c[k] || '') + '" onchange="rapPole(this)">' +
        '<label class="dch' + (efData(r, k) !== (r.dataRaportu || dzisIso()) ? ' pn' : '') + '">' + dt(efData(r, k)).slice(0, 5) + ' ✎<input type="date" data-k="czas.d_' + k + '" value="' + efData(r, k) + '" onchange="rapCzasData(this)"></label></div>').join('') + '</div>' +
      '<div class="siatka"><div class="pole"><label>Km dojazd</label><input class="as-in" inputmode="numeric" data-k="czas.kmD" value="' + esc(c.kmD || '') + '" oninput="rapPole(this)"></div>' +
      '<div class="pole"><label>Km powrót</label><input class="as-in" inputmode="numeric" data-k="czas.kmP" value="' + esc(c.kmP || '') + '" oninput="rapPole(this)"></div></div>' +
      '<div id="rpSum">' + tabelaCzasu(czasy(r)) + '</div><div class="note">Kliknij przycisk w chwili zdarzenia – godzina wpisze się sama (można poprawić). Pracownik: ' + SERWISANT + '.</div></div>';

    h += '<div class="card"><h3>' + CAM + 'Zdjęcia i komentarz <span class="nr">5</span></h3><div class="fot">' +
      r.zal.map((z, i) => '<div><img src="' + z + '"><button class="ib" onclick="rapFotoUsun(' + i + ')">×</button></div>').join('') + '</div>' +
      '<div class="ab2"><label class="btn2" style="display:inline-flex">' + CAM + ' Zrób zdjęcie<input type="file" accept="image/*" capture="environment" hidden onchange="rapFoto(this)"></label>' +
      '<label class="btn2" style="display:inline-flex">' + I('doc', 1) + ' Wgraj z galerii<input type="file" accept="image/*" multiple hidden onchange="rapFoto(this)"></label></div>' +
      tx('komentarz', 'Komentarz', 0, '') + '</div>';

    h += '<div class="card"><h3>' + I('user', 1) + 'Odbiór i podpisy <span class="nr">6</span></h3><div class="siatka">' +
      pole('odbImie', 'Imię i nazwisko', 'text', 1) + pole('odbEmail', 'Adres e-mail', 'email', 1, { im: 'email' }) + pole('odbUwagi', 'Uwagi odbierającego', 'text', 0, { cala: 1 }) + '</div>' +
      '<label class="chkl"><input type="checkbox" data-k="potw"' + (r.potw ? ' checked' : '') + ' onchange="rapPole(this)"> Usterki usunięte, urządzenie sprawne</label>' +
      '<label>Podpis odbierającego</label><canvas id="rpPod"></canvas><button class="btn2" style="margin-top:8px" onclick="rapPodpisCzysc()">Wyczyść podpis</button>' +
      '<div class="pole" data-ob="podpisSerw" style="margin-top:16px"><label>Podpis serwisanta (' + esc(SERWISANT) + ') <i>*</i></label><canvas id="rpPodS"></canvas></div>' +
      '<button class="btn2" style="margin-top:8px" onclick="rapPodpisSCzysc()">Wyczyść podpis</button></div>';

    const tn = (k, t) => '<div class="pole cala"><label>' + t + '</label><div class="wyb">' +
      ['Tak', 'Nie'].map(v => '<button class="' + (r[k] === v ? 'on' : '') + '" onclick="rapWybor(\'' + k + '\',\'' + v + '\')">' + v + '</button>').join('') + '</div></div>';
    h += '<div class="card"><h3>' + I('check', 1) + 'Podsumowanie <span class="nr">7</span></h3>' +
      (r.kontOd ? '<div class="note" style="margin-bottom:10px;border:0">To jest kontynuacja wcześniejszego raportu.</div>' : '') +
      tn('kontynuacja', 'Czy serwis wymaga kontynuacji?') +
      (r.kontynuacja === 'Tak' ? '<div class="kont">Kolejny wyjazd = nowy raport (w WebCon: „Kontynuuj akcję serwisową”).<button class="btn" style="margin-top:10px" onclick="rapKontynuacja()">+ Nowy raport – kontynuacja</button></div>' : '') +
      tn('zamknieteU', 'Czy zlecenie zostało zamknięte u zleceniodawcy?') + '</div>';
    h += '<div class="dol"><button class="btn" onclick="rapWyslij()">' + I('check', 1) + 'Wyślij do WebCon</button><button class="btn2" onclick="rapPodglad()">' + I('doc', 1) + 'Co pójdzie do WebCon</button></div>' +
      (r.demoSrl ? '<div class="note" style="border:0;margin-top:0">Pokaz: „wysłany” ' + dt(r.demoKiedy.slice(0, 10)) + ' jako ' + esc(r.demoSrl) + ' (numer przykładowy).</div>' : '') +
      '<div class="dol"><button class="btn2" onclick="rapPorownanie()">WebCon dziś → aplikacja</button><button class="btn2" style="color:var(--red)" onclick="rapUsun(\'' + r.id + '\')">' + I('trash', 1) + 'Usuń szkic</button></div>' +
      '<div class="note" style="border:0">Wzór raportu na czas, gdy będzie API WebCon. Teraz „Wyślij” działa w trybie pokazowym – nic nie jest zapisywane w WebCon.</div></div>';
    setTimeout(() => { licznik(); podpisy(); }, 0);
    return h;
  }

  function widok() { return ST.id && R() ? widokRaport() : (ST.id = null, widokLista()); }
  window.MODULY = window.MODULY || {};
  window.MODULY.raport = { widok: widok, bezDanych: true, wstecz: () => { if (ST.id) { window.rapLista(); return true; } } };
})();
