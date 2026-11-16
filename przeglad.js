/* Przegląd – moduł aplikacji „Serwis myjni” (15.11.2026).
 * Cyfrowa wersja papierowego „RAPORT PRZEGLĄDU MYJNI PORTALOWEJ” (Corrimex, 2 str.) – te same sekcje i punkty, słowo w słowo.
 * Każdy punkt: Tak | Nie | N/D (domyślnie nic). Druk/PDF dopiero, gdy wszystko zaznaczone (licznik „zostało N”).
 * Podpisy palcem – NIEOBOWIĄZKOWE (można podpisać i przybić pieczątkę na wydruku).
 * Szkice w pamięci urządzenia (localStorage „przeglady”). „Zapisz w systemie” → POST ?api=przeglad (łatka bota Przeglad.gs):
 * PDF z tego samego wzoru idzie tą samą drogą co skan przeglądu wysłany do bota (premia, termin, archiwum) + wiersz w arkuszu „Przeglądy”.
 * Ładowany PRZED głównym skryptem; funkcje index.html (esc, I, jsq, toast, dzisIso, dt, skrot, LS, D, go, api, arkZamknij) używane dopiero przy wywołaniu.
 */
(function () {
  const TECHNIK = (() => { const DOM = 'TOMCZAKOWSKI WASYL'; try { const h = new URLSearchParams(location.hash.slice(1)).get('n'); if (h) localStorage.setItem('n', h); return localStorage.getItem('n') || DOM; } catch (e) { return DOM; } })();
  // [sekcja, punkty] – teksty dokładnie jak na formularzu papierowym
  const SEKCJE = [
    ['Dostawa mediów', ['Sprawdzenie stanu przewodów wodnych i elektrycznych w energołańcuchu']],
    ['Napęd jazdy', ['Sprawdzenie napędu jazdy', 'Sprawdzenie stanu i mocowania szyn jezdnych', 'Sprawdzenie zabezpieczeń (haków) przeciw wykolejeniu']],
    ['System mycia kół', ['Sprawdzenie i smarowanie kompletnego układu mycia kół']],
    ['System wysokiego ciśnienia i mycia podwozia', ['Sprawdzenie pomp HD / stabilność podczas pracy / stan uszczelnień', 'Sprawdzenie układu oscylacyjnego i rotacyjnego',
      'Sprawdzenie przesuwu wózka i zwijacza mycia podwozia', 'Sprawdzenie przerzutnika mycia podwozia', 'Czyszczenie wszystkich dysz w urządzeniu']],
    ['Szczotka dachowa', ['Sprawdzenie napędów obrotu i podnoszenia', 'Sprawdzenie lin', 'Sprawdzenie rolek prowadzących', 'Sprawdzenie kółek podnoszenia']],
    ['Szczotki boczne', ['Sprawdzenie napędów obrotu i przesuwu', 'Sprawdzenie wózka przesuwu']],
    ['System pneumatyczny', ['Sprawdzenie ciśnienia w układzie', 'Sprawdzenie stanu oleju / uzupełnienie', 'Sprawdzenie funkcjonowania zaworów elektromagnetycznych']],
    ['System suszenia', ['Sprawdzenie kółek podnoszenia', 'Sprawdzenie lin']],
    ['Kompresor', ['Sprawdzenie oleju', 'Sprawdzenie stanu paska klinowego i stanu ogólnego', 'Opróżnienie zbiornika z wody']],
    ['Oczyszczalnia wody', ['Sprawdzenie poprawności pracy oczyszczalni', 'Sprawdzenie kompresora napowietrzającego', 'Sprawdzenie dozowania chemii',
      'Sprawdzenie/czyszczenie filtra i obudowy wody czystej', 'Sprawdzenie napowietrzaczy w zbiorniku recyclingu – poprawność działania',
      'Sprawdzenie ciśnienia pracy filtra (przykręcony czerwony zawór)', 'Sprawdzenie stanu zbiornika – konieczność opróżnienia?']],
    ['Test elektryczny', ['Czyszczenie i kontrola wszystkich fotokomórek', 'Sprawdzenie działania wszystkich zainstalowanych listew bezpieczeństwa',
      'Sprawdzenie wyłącznika awaryjnego (NOT AUS)', 'Sprawdzenie docisku wszystkich szczotek']],
    ['System dozowania chemii', ['Sprawdzenie i odpowietrzenie pomp dozujących', 'Sprawdzenie poprawności dozowania zgodnie z wytycznymi i regulacja']],
    ['Drukarka kodów (jeśli zainstalowana)', ['Sprawdzenie lokalizacji drukarki – czystość miejsca, dostęp etc.', 'Sprawdzenie stanu urządzenia, stanu gniazd, wtyków etc.']],
    ['Nagrzewnice', ['Sprawdzenie działania nagrzewnic.']]
  ];
  const POZ_TXT = 'Sprawdzenie pozycji przełącznika w systemie recyclingu wody'; // Oczyszczalnia wody, punkt 8: A / 0 / B
  const OCZ = 9; // indeks sekcji „Oczyszczalnia wody”
  const STR2 = 8; // od „Kompresor” zaczyna się strona 2
  const ODP = [['T', 'Tak'], ['N', 'Nie'], ['D', 'N/D']];
  const PROGRAMY = 6;

  const ST = { id: null };
  let BAZA = null;
  const wszystkie = () => { if (!BAZA) { try { BAZA = JSON.parse(LS.get('przeglady') || '{}'); } catch (e) { BAZA = {}; } } return BAZA; };
  const zapiszWsz = o => { BAZA = o; try { localStorage.setItem('przeglady', JSON.stringify(o)); return true; } catch (e) { return false; } };
  const P = () => wszystkie()[ST.id];
  let tz = 0;
  function zapisz(p, cicho) {
    const o = wszystkie(); p.zm = new Date().toISOString(); o[p.id] = p;
    if (!zapiszWsz(o)) toast('Brak miejsca w pamięci telefonu');
    if (!cicho) licznik();
  }
  const myjnia = n => (D && (D.myjnie.find(x => x.nazwa === n) || D.inne.find(x => x.nazwa === n))) || null;
  const teraz = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const klucze = () => { const k = []; SEKCJE.forEach(([, pp], s) => pp.forEach((_, i) => k.push(s + '-' + i))); return k; };
  const KL = klucze();

  function braki(p) {
    const b = [];
    KL.forEach(k => { if (!p.odp[k]) b.push(['p' + k, 'punkt ' + nazwaPunktu(k)]); });
    if (!p.poz) b.push(['ppoz', 'Oczyszczalnia wody 8 – pozycja przełącznika']);
    if (!String(p.licznik || '').trim()) b.push(['licznik', 'Licznik myć']);
    if (!p.godzOd) b.push(['godzOd', 'Godzina rozpoczęcia']);
    if (!p.start) b.push(['start', 'Mycia testowe – start z biletu czy z pulpitu']);
    if (!p.godzDo) b.push(['godzDo', 'Godzina zakończenia']);
    return b;
  }
  function nazwaPunktu(k) { const [s, i] = k.split('-').map(Number); return SEKCJE[s][0] + ' ' + (i + 1); }

  function pusty(nazwa) {
    const w = myjnia(nazwa) || {};
    return { id: 'p' + Date.now(), myjnia: nazwa || '', model: w.model || '', licznik: String(w.licznik || '').replace(/\D/g, ''),
      data: dzisIso(), godzOd: teraz(), godzDo: '', odp: {}, poz: '', uwagi: '', prog: {}, start: '', progInne: '', klient: '', podpisT: '', podpisK: '', zadania: {} };
  }
  window.przNowy = function (nazwa) {
    if (!nazwa) return toast('Wybierz myjnię');
    const p = pusty(nazwa); zapisz(p, 1); ST.id = p.id;
    if (typeof zamknijDet === 'function') zamknijDet();
    arkZamknij(); go('przeglad');
  };
  window.przOtworz = id => { ST.id = id; TAB = 'przeglad'; render(); window.scrollTo(0, 0); };
  window.przLista = () => { ST.id = null; go('przeglady'); };
  window.przUsun = id => { if (!confirm('Usunąć ten przegląd z telefonu?')) return; const o = wszystkie(); delete o[id]; zapiszWsz(o); ST.id = null; go('przeglady'); };
  window.przSzkice = () => Object.values(wszystkie()).sort((a, b) => (b.zm || '').localeCompare(a.zm || ''));

  window.przPole = function (el) {
    const p = P(); if (!p) return;
    p[el.dataset.k] = el.value; clearTimeout(tz); tz = setTimeout(() => zapisz(p), 250);
  };
  window.przTeraz = function (k) { const p = P(); p[k] = teraz(); zapisz(p); const el = document.querySelector('[data-k="' + k + '"]'); if (el) el.value = p[k]; };

  // przełącznik Tak | Nie | N/D: suwak przesuwa się sprężyście, bez przerysowania ekranu
  window.przOdp = function (k, v, btn) {
    const p = P(); p.odp[k] = p.odp[k] === v ? '' : v; zapisz(p);
    const box = btn.closest('.tnd'); ustawTnd(box, p.odp[k]);
    const r = btn.closest('.pr-p'); r.classList.toggle('nie', p.odp[k] === 'N');
    const z = r.querySelector('.pr-z'); if (z) z.innerHTML = przyciskZadania(p, k);
  };
  function ustawTnd(box, v) {
    const i = ODP.findIndex(o => o[0] === v);
    box.dataset.v = v || '';
    box.style.setProperty('--x', (i < 0 ? 0 : i) * 100 + '%');
    box.querySelectorAll('button').forEach((b, j) => b.classList.toggle('on', j === i));
  }
  window.przPoz = function (v, btn) {
    const p = P(); p.poz = p.poz === v ? '' : v; zapisz(p);
    ustawTnd(btn.closest('.tnd'), p.poz === 'A' ? 'T' : p.poz === '0' ? 'N' : p.poz === 'B' ? 'D' : '');
  };
  // programy mycia testowego: P1…P6, klik = +1, „−” = −1
  window.przProg = function (n, d) {
    const p = P(); p.prog[n] = Math.max(0, (p.prog[n] || 0) + d); if (!p.prog[n]) delete p.prog[n]; zapisz(p);
    const el = document.getElementById('prProg'); if (el) el.innerHTML = chipy(p);
  };
  function chipy(p) {
    let h = '';
    for (let n = 1; n <= PROGRAMY; n++) {
      const c = p.prog[n] || 0;
      h += '<div class="pg' + (c ? ' on' : '') + '"><button onclick="przProg(' + n + ',1)">P' + n + (c ? ' <b>×' + c + '</b>' : '') + '</button>' +
        (c ? '<button class="mn" onclick="przProg(' + n + ',-1)">−</button>' : '') + '</div>';
    }
    return h;
  }
  // skąd uruchomione mycie testowe – obowiązkowe: bilet z terminala albo pulpit (tryb serwisowy)
  const STARTY = [['bilet', 'Bilet (terminal)'], ['pulpit', 'Pulpit (tryb serwisowy)']];
  window.przStart = function (v) {
    const p = P(); p.start = p.start === v ? '' : v; zapisz(p);
    document.querySelectorAll('#prStart .pg').forEach(x => x.classList.toggle('on', x.dataset.v === p.start));
  };
  const programyTxt = p => Object.keys(p.prog || {}).sort().map(n => 'P' + n + ' ×' + p.prog[n]).concat(String(p.progInne || '').trim() ? [String(p.progInne).trim()] : []).join(', ') + (p.start ? ' · ' + p.start : '');

  // „Nie” → zadanie na tej myjni (ta sama droga co notatka z karty myjni)
  function przyciskZadania(p, k) {
    if (p.odp[k] !== 'N') return '';
    return p.zadania[k] ? '<span class="pill ok">' + I('check', 1) + ' w zadaniach</span>' : '<button class="btn2" onclick="przZadanie(\'' + k + '\')">+ do zadań</button>';
  }
  window.przZadanie = function (k) {
    const p = P(), a = document.getElementById('ark');
    a.innerHTML = '<div class="tlo" onclick="arkZamknij()"></div><div class="ar"><h4>Do zadań · ' + esc(skrot(p.myjnia)) + '</h4><div class="mute">' + esc(nazwaPunktu(k)) + ': ' + esc(punkt(k)) + '</div>' +
      '<textarea id="prZt" placeholder="Co nie tak, co trzeba zrobić / kupić (można pusto)"></textarea>' +
      '<div class="ab"><button class="btn2" onclick="arkZamknij()">Anuluj</button><button class="btn" id="prZb" onclick="przZadanieWyslij(\'' + k + '\')">Dodaj zadanie</button></div></div>';
    a.classList.add('on'); setTimeout(() => { const t = document.getElementById('prZt'); if (t) t.focus(); }, 350);
  };
  const punkt = k => { const [s, i] = k.split('-').map(Number); return SEKCJE[s][1][i]; };
  window.przZadanieWyslij = function (k) {
    const p = P(), t = String(document.getElementById('prZt').value || '').trim(), [s] = k.split('-').map(Number);
    const tekst = 'Do zrobienia (z przeglądu ' + dt(p.data) + '): ' + SEKCJE[s][0] + ' – ' + punkt(k) + ': NIE OK.' + (t ? ' ' + t : '');
    document.getElementById('prZb').disabled = true;
    api('notatkaMyjni', { m: p.myjnia, t: tekst }).then(() => {
      p.zadania[k] = 1; zapisz(p, 1); arkZamknij(); toast('Dodane do zadań myjni');
      const z = document.querySelector('[data-pk="' + k + '"] .pr-z'); if (z) z.innerHTML = przyciskZadania(p, k);
      if (typeof load === 'function') setTimeout(load, 800);
    }).catch(e => { document.getElementById('prZb').disabled = false; toast(/Nieznana akcja/.test(e.message) ? 'Najpierw zainstaluj aktualizację bota (/aktualizuj)' : 'Błąd: ' + e.message); });
  };
  // N/D jak w poprzednim przeglądzie tej myjni (tylko po kliknięciu)
  function poprzedni(p) { return przSzkice().find(x => x.id !== p.id && x.myjnia === p.myjnia && Object.keys(x.odp || {}).some(k => x.odp[k] === 'D')); }
  window.przJakOstatnio = function () {
    const p = P(), q = poprzedni(p); if (!q) return;
    let n = 0; Object.keys(q.odp).forEach(k => { if (q.odp[k] === 'D' && !p.odp[k]) { p.odp[k] = 'D'; n++; } });
    zapisz(p); render(); toast(n ? 'N/D jak ostatnio: ' + n + ' pkt' : 'Nic do skopiowania');
  };

  // podpisy palcem (nieobowiązkowe)
  function podpisStart(id, wczytaj, zapiszP) {
    const c = document.getElementById(id); if (!c) return;
    const x = c.getContext('2d'), sk = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * sk; c.height = c.offsetHeight * sk; x.scale(sk, sk);
    x.lineWidth = 2.4; x.lineCap = 'round'; x.strokeStyle = '#111';
    const st0 = wczytaj(); if (st0) { const im = new Image(); im.onload = () => x.drawImage(im, 0, 0, c.offsetWidth, c.offsetHeight); im.src = st0; }
    let on = false;
    const pt = e => { const b = c.getBoundingClientRect(), t = e.touches ? e.touches[0] : e; return [t.clientX - b.left, t.clientY - b.top]; };
    const st = e => { on = true; const [a, b] = pt(e); x.beginPath(); x.moveTo(a, b); e.preventDefault(); };
    const mv = e => { if (!on) return; const [a, b] = pt(e); x.lineTo(a, b); x.stroke(); e.preventDefault(); };
    const en = () => { if (!on) return; on = false; zapiszP(c.toDataURL('image/png')); };
    c.addEventListener('touchstart', st, { passive: false }); c.addEventListener('touchmove', mv, { passive: false }); c.addEventListener('touchend', en);
    c.addEventListener('mousedown', st); c.addEventListener('mousemove', mv); window.addEventListener('mouseup', en);
  }
  window.przPodpisCzysc = k => { const p = P(); p[k] = ''; zapisz(p); render(); };

  function licznik() {
    const p = P(), el = document.getElementById('prBr'); if (!p || !el) return;
    const b = braki(p);
    el.className = 'rp-br ' + (b.length ? 'zle' : 'ok');
    el.innerHTML = b.length ? I('alert', 1) + ' Zostało ' + b.length + ': ' + esc(b[0][1]) + (b.length > 1 ? ' …' : '') : I('check', 1) + ' Wszystko zaznaczone – można drukować';
    document.querySelectorAll('.pr [data-ob]').forEach(x => x.classList.toggle('brak', b.some(z => z[0] === x.dataset.ob)));
    document.querySelectorAll('.pr .gotowe').forEach(x => x.classList.toggle('wyl', b.length > 0));
  }
  window.przDoBraku = function () {
    const b = braki(P()); if (!b.length) return;
    const el = document.querySelector('.pr [data-ob="' + b[0][0] + '"]'); if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('mig'); void el.offsetWidth; el.classList.add('mig');
  };
  function stop(p) {
    const b = braki(p); if (!b.length) return false;
    toast('Zostało ' + b.length + ' – najpierw zaznacz wszystko'); przDoBraku(); return true;
  }

  // ===== WYDRUK: dwie strony A4 jak formularz papierowy =====
  const DRUK_CSS = '.pf{font-family:Arial,Helvetica,sans-serif;color:#000;font-size:9.5pt;width:180mm;margin:0 auto}' +
    '.pf .str+.str{page-break-before:always;break-before:page}' +
    '.pf h1{text-align:center;font-family:"Times New Roman",serif;font-size:16pt;margin:2mm 0 4mm}' +
    '.pf table{width:100%;border-collapse:collapse;margin-bottom:3mm} .pf td,.pf th{border:1px solid #000;padding:.6mm 2mm;vertical-align:middle}' +
    '.pf th{font-family:"Times New Roman",serif;font-size:12pt} .pf .lp{width:20mm} .pf .tn{width:13mm;text-align:center;font-weight:bold}' +
    '.pf .tn.th{font-family:"Times New Roman",serif;font-size:11pt} .pf .nd{float:right;font-weight:bold}' +
    '.pf .gl td{font-size:10.5pt} .pf .gl .et{font-weight:bold;width:32mm} .pf .gl .w{font-size:11pt}' +
    '.pf .abo{display:flex;font-weight:bold} .pf .abo span{flex:1;text-align:center;border-left:1px solid #000;padding:.6mm 0} .pf .abo span:first-child{border-left:0}' +
    '.pf .uw{min-height:14mm;border-bottom:1px dotted #000;margin:1mm 0 4mm;white-space:pre-wrap;font-size:10.5pt}' +
    '.pf .dol td{height:9mm} .pf img.pod{max-height:16mm;max-width:60mm;display:block}' +
    '.pf .nr{text-align:right;font-weight:bold;margin-top:2mm}';
  function drukTresc(p) {
    const w = myjnia(p.myjnia) || {}, X = 'X';
    const sekcja = (s) => {
      const [tyt, pp] = SEKCJE[s];
      let h = '<table><tr><th colspan="2">' + esc(tyt) + '</th><th class="tn th">Tak</th><th class="tn th">Nie</th></tr>';
      pp.forEach((t, i) => { const v = p.odp[s + '-' + i];
        h += '<tr><td class="lp">' + (i + 1) + '</td><td>' + esc(t) + (v === 'D' ? '<span class="nd">N/D</span>' : '') + '</td><td class="tn">' + (v === 'T' ? X : '') + '</td><td class="tn">' + (v === 'N' ? X : '') + '</td></tr>'; });
      if (s === OCZ) h += '<tr class="poz"><td class="lp">8</td><td style="font-size:9pt;font-weight:bold">' + POZ_TXT.toUpperCase() + '</td><td colspan="2" style="padding:0"><div class="abo">' +
        ['A', '0', 'B'].map(v => '<span>' + v + (p.poz === v ? ' X' : '') + '</span>').join('') + '</div></td></tr>';
      return h + '</table>';
    };
    const img = s => s ? '<img class="pod" src="' + s + '">' : '';
    let h = '<div class="pf"><div class="str"><h1>RAPORT PRZEGLĄDU MYJNI PORTALOWEJ</h1>' +
      '<table class="gl"><tr><td></td><td style="text-align:center">TECHNIK SERWISU</td><td style="width:16mm"></td><td>NAZWA KLIENTA I ADRES</td></tr>' +
      '<tr><td class="et">Nazwisko / Imię</td><td class="w">' + esc(TECHNIK) + '</td><td></td><td class="w" rowspan="2">' + esc(p.myjnia) + '<br>' + esc([w.adres, w.miasto].filter(Boolean).join(', ')) + '</td></tr>' +
      '<tr><td class="et">Urządzenie</td><td class="w">' + esc(p.model) + '</td><td></td></tr>' +
      '<tr><td class="et">Licznik myć</td><td class="w">' + esc(p.licznik) + '</td><td class="et" style="width:16mm">Data</td><td class="w">' + esc(dt(p.data)) + '</td></tr></table>';
    for (let s = 0; s < STR2; s++) h += sekcja(s);
    h += '<div class="nr">str. 1</div></div><div class="str">';
    for (let s = STR2; s < SEKCJE.length; s++) h += sekcja(s);
    h += '<div><b>Uwagi</b></div><div class="uw">' + esc(p.uwagi || '') + '</div>' +
      '<table class="dol"><tr><td style="width:42%">Godzina rozpoczęcia: <b>' + esc(p.godzOd) + '</b><br><br>Godzina zakończenia: <b>' + esc(p.godzDo) + '</b><br><br>' +
        '<b>' + esc(dt(p.data)) + '</b>' + img(p.podpisT) + '<div style="font-size:9pt">data i podpis technika</div></td>' +
        '<td>Potwierdzam zgodność wypełnienia raportu<br><br>Nazwisko i imię użytkownika: <b>' + esc(p.klient || '') + '</b>' + img(p.podpisK) +
        '<br><br><div style="font-size:9pt;margin-top:2mm">pieczątka</div><div style="height:10mm"></div></td></tr>' +
      '<tr><td style="text-align:center;font-weight:bold">Mycia testowe</td><td>Programy: <b>' + esc(programyTxt(p)) + '</b></td></tr>' +
      '<tr><td style="text-align:center;font-weight:bold">Sprawdzenie poprawności mycia</td><td>Podpis: ' + img(p.podpisT) + '</td></tr></table>' +
      '<div class="nr">str. 2</div></div></div>';
    return h;
  }
  // pełny dokument HTML (ten sam wzór idzie do bota jako PDF)
  const drukDokument = p => '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Przegląd ' + esc(p.myjnia) + ' ' + esc(dt(p.data)) + '</title>' +
    '<style>@page{size:A4;margin:10mm 12mm}body{margin:0}' + DRUK_CSS + '</style></head><body>' + drukTresc(p) + '</body></html>';
  window.przDrukuj = function () {
    const p = P(); if (!p || stop(p)) return;
    let d = document.getElementById('prDruk');
    if (!d) { d = document.createElement('div'); d.id = 'prDruk'; document.body.appendChild(d); }
    d.innerHTML = '<style>@media screen{#prDruk{display:none}}@media print{@page{size:A4;margin:10mm 12mm}body>*:not(#prDruk){display:none!important}' +
      'body{background:#fff!important}#prDruk{display:block}}' + DRUK_CSS + '</style>' + drukTresc(p);
    const t = document.title; document.title = 'Przeglad_' + skrot(p.myjnia).replace(/\W+/g, '_') + '_' + p.data;
    setTimeout(() => { window.print(); document.title = t; }, 60);
  };

  // ===== ZAPIS W SYSTEMIE (łatka bota Przeglad.gs: POST ?api=przeglad) =====
  function daneDoArkusza(p) {
    const nie = [], nd = [];
    KL.forEach(k => { if (p.odp[k] === 'N') nie.push(nazwaPunktu(k) + ': ' + punkt(k)); if (p.odp[k] === 'D') nd.push(nazwaPunktu(k)); });
    return { myjnia: p.myjnia, model: p.model, licznik: p.licznik, data: p.data, od: p.godzOd, do: p.godzDo, nie: nie, nd: nd, poz: p.poz,
      programy: programyTxt(p), uwagi: p.uwagi || '', klient: p.klient || '', odp: p.odp };
  }
  window.przZapiszSystem = async function () {
    const p = P(); if (!p || stop(p)) return;
    if (p.wyslany && !confirm('Ten przegląd był już zapisany ' + dt(p.wyslany.slice(0, 10)) + '. Wysłać jeszcze raz?')) return;
    const b = document.getElementById('prWy'); if (b) { b.disabled = true; b.textContent = 'Zapisuję…'; }
    try {
      const res = await fetch(API + '?api=przeglad', { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ k: K, rid: p.id + (p.wyslany ? '_' + Date.now() : ''), html: drukDokument(p), dane: daneDoArkusza(p) }) });
      const txt = await res.text(); let j; try { j = JSON.parse(txt); } catch (e) { throw new Error('Nieznana akcja'); }
      if (!j.ok) throw new Error(j.blad || 'błąd serwera');
      p.wyslany = new Date().toISOString(); p.plik = (j.wynik || {}).url || ''; zapisz(p, 1);
      const typ = (j.wynik || {}).typ; toast(typ && !/raport|protokol/.test(typ) ? 'Zapisany, ale bot rozpoznał jako „' + typ + '” – sprawdź w Telegramie' : 'Przegląd zapisany – potwierdzenie jak dla skanu'); render();
      if (typeof load === 'function') setTimeout(load, 1500);
    } catch (e) {
      toast(/Nieznana|akcja|Unknown/i.test(e.message) ? 'Najpierw zainstaluj aktualizację bota (/aktualizuj)' : 'Zapis: ' + e.message);
      if (b) { b.disabled = false; b.textContent = 'Zapisz w systemie'; }
    }
  };

  const css = '<style>' +
    '.pr .card h3 .nr{margin-left:auto;color:var(--mute);font-weight:600}' +
    '.pr label{display:block;font-size:13px;font-weight:600;color:var(--mute);margin:2px 2px 5px}' +
    '.pr .siatka{display:grid;grid-template-columns:1fr 1fr;gap:0 12px} .pr .siatka .cala{grid-column:1/-1}' +
    '.pr .pole.brak label{color:var(--red)} .pr .pole.brak input{box-shadow:0 0 0 2px color-mix(in srgb,var(--red) 45%,transparent)}' +
    '.pr .gw{display:flex;gap:8px;align-items:center} .pr .gw input{flex:1;margin:0;min-width:0} .pr .gw .btn2{flex:0 0 auto}' +
    '.pr-p{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:11px 0;border-top:.5px solid var(--line)}' +
    '.pr-p:first-of-type{border-top:0} .pr-p .tx{flex:1 1 220px;font-size:15px;line-height:1.3} .pr-p .tx i{font-style:normal;color:var(--mute);font-weight:600;margin-right:6px}' +
    '.pr-p .tnd{margin-left:auto} .pr-p.nie .tx{color:var(--red)} .pr-p .pr-z{flex-basis:100%;display:flex;justify-content:flex-end} .pr-p .pr-z:empty{display:none}' +
    '.pr .mig{animation:prmig 1.2s ease} @keyframes prmig{0%,60%{background:var(--orgbg)}100%{background:transparent}}' +
    // przełącznik w stylu iOS: tor + suwak przesuwany sprężyście (domyślnie nic nie wybrane)
    '.tnd{--x:0%;position:relative;display:flex;flex:0 0 auto;width:204px;height:36px;padding:2px;border-radius:999px;background:var(--fill);box-shadow:inset 0 0 0 .5px var(--line)}' +
    '.tnd::before{content:"";position:absolute;top:2px;bottom:2px;left:2px;width:calc((100% - 4px)/3);border-radius:999px;background:#fff;opacity:0;transform:translateX(var(--x)) scale(.6);' +
      'box-shadow:0 3px 8px rgba(0,0,0,.15),0 3px 1px rgba(0,0,0,.06);transition:transform .4s var(--spring),opacity .2s,background .25s}' +
    '.tnd[data-v=T]::before{opacity:1;background:#34c759;transform:translateX(var(--x))} .tnd[data-v=N]::before{opacity:1;background:#ff3b30;transform:translateX(var(--x))}' +
    '.tnd[data-v=D]::before{opacity:1;background:#8e8e93;transform:translateX(var(--x))}' +
    '.tnd.abo[data-v=T]::before,.tnd.abo[data-v=N]::before,.tnd.abo[data-v=D]::before{background:var(--acc)}' +
    '.tnd button{position:relative;z-index:1;flex:1;border:0;background:none;border-radius:999px;font-size:14px;font-weight:600;color:var(--ink);padding:0;transition:color .25s}' +
    '.tnd button.on{color:#fff}' +
    '.pr .pg-w{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px}' +
    '.pr .pg{display:flex;border-radius:999px;background:var(--fill);overflow:hidden;transition:background .25s} .pr .pg.on{background:var(--acc)}' +
    '.pr .pg button{border:0;background:none;font:inherit;font-size:15px;font-weight:600;padding:9px 15px;color:var(--ink)} .pr .pg.on button{color:#fff}' +
    '.pr .pg .mn{padding:9px 12px 9px 6px;font-size:18px;line-height:1}' +
    '.pr canvas{width:100%;height:150px;background:#fff;border-radius:16px;touch-action:none;display:block;box-shadow:inset 0 0 0 1px var(--line)}' +
    '.pr .dol{display:flex;gap:10px;flex-wrap:wrap;margin:6px 0 14px} .pr .dol .btn{flex:1}' +
    '.pr .gotowe.wyl{opacity:.45}' +
    '@media (min-width:1000px){.pr .prsk{display:grid;grid-template-columns:1fr 1fr;gap:0 16px;align-items:start}}' +
    '</style>';

  function tnd(k, v, fn) {
    const i = ODP.findIndex(o => o[0] === v);
    return '<div class="tnd' + (fn === 'przPoz' ? ' abo' : '') + '" data-v="' + (v || '') + '" style="--x:' + (i < 0 ? 0 : i) * 100 + '%">' +
      ODP.map(([c, t], j) => '<button class="' + (j === i ? 'on' : '') + '" onclick="' + fn + '(\'' + (fn === 'przPoz' ? ['A', '0', 'B'][j] : k) + '\'' + (fn === 'przPoz' ? '' : ',\'' + c + '\'') + ',this)">' +
        (fn === 'przPoz' ? ['A', '0', 'B'][j] : t) + '</button>').join('') + '</div>';
  }

  function widokPrzeglad() {
    const p = P(), w = myjnia(p.myjnia) || {}, b = braki(p), pop = poprzedni(p);
    let h = css + '<div class="pr"><div class="phead"><button class="ib" onclick="przLista()">' + I('back') + '</button><div><b>Przegląd · ' + esc(skrot(p.myjnia)) + '</b><span>' +
      esc([w.miasto, w.adres].filter(Boolean).join(', ')) + ' · zapisuje się sam</span></div></div>';
    h += '<div id="prBr" class="rp-br" onclick="przDoBraku()"></div>';
    h += '<div class="card"><h3>' + I('user', 1) + 'Nagłówek</h3><div class="siatka">' +
      '<div class="pole cala"><label>Technik serwisu</label><input class="as-in" value="' + TECHNIK + '" disabled></div>' +
      '<div class="pole"><label>Urządzenie</label><input class="as-in" data-k="model" value="' + esc(p.model) + '" oninput="przPole(this)"></div>' +
      '<div class="pole" data-ob="licznik"><label>Licznik myć</label><input class="as-in" data-k="licznik" inputmode="numeric" value="' + esc(p.licznik) + '" oninput="przPole(this)"></div>' +
      '<div class="pole"><label>Data</label><input class="as-in" type="date" data-k="data" value="' + esc(p.data) + '" onchange="przPole(this)"></div>' +
      '<div class="pole cala" data-ob="godzOd"><label>Godzina rozpoczęcia</label><div class="gw"><input class="as-in" type="time" data-k="godzOd" value="' + esc(p.godzOd) + '" onchange="przPole(this)"><button class="btn2" onclick="przTeraz(\'godzOd\')">teraz</button></div></div>' +
      '</div>' + (pop ? '<div class="note">Na tej myjni ostatnio było N/D: <button class="btn2" onclick="przJakOstatnio()">N/D jak ostatnio</button></div>' : '') + '</div>';
    h += '<div class="prsk">';
    SEKCJE.forEach(([tyt, pp], s) => {
      h += '<div class="card"><h3>' + esc(tyt) + ' <span class="nr">' + pp.filter((_, i) => p.odp[s + '-' + i]).length + '/' + pp.length + '</span></h3>' +
        pp.map((t, i) => { const k = s + '-' + i, v = p.odp[k];
          return '<div class="pr-p' + (v === 'N' ? ' nie' : '') + '" data-ob="p' + k + '" data-pk="' + k + '"><div class="tx"><i>' + (i + 1) + '</i>' + esc(t) + '</div>' + tnd(k, v, 'przOdp') +
            '<div class="pr-z">' + przyciskZadania(p, k) + '</div></div>'; }).join('') +
        (s === OCZ ? '<div class="pr-p" data-ob="ppoz"><div class="tx"><i>8</i>' + esc(POZ_TXT) + '</div>' +
          tnd('', p.poz === 'A' ? 'T' : p.poz === '0' ? 'N' : p.poz === 'B' ? 'D' : '', 'przPoz') + '</div>' : '') + '</div>';
    });
    h += '</div>';
    h += '<div class="card"><h3>' + I('pen', 1) + 'Uwagi</h3><textarea data-k="uwagi" oninput="przPole(this)" placeholder="Co zauważone, co do zrobienia następnym razem">' + esc(p.uwagi) + '</textarea></div>';
    h += '<div class="card"><h3>' + I('clock', 1) + 'Mycia testowe i zakończenie</h3><label>Programy (klik = +1)</label><div class="pg-w" id="prProg">' + chipy(p) + '</div>' +
      '<div class="pole" data-ob="start"><label>Start mycia testowego</label><div class="pg-w" id="prStart">' +
        STARTY.map(([v, t]) => '<div class="pg' + (p.start === v ? ' on' : '') + '" data-v="' + v + '"><button onclick="przStart(\'' + v + '\')">' + t + '</button></div>').join('') + '</div></div>' +
      '<input class="as-in" data-k="progInne" placeholder="inne programy (opcjonalnie)" value="' + esc(p.progInne) + '" oninput="przPole(this)">' +
      '<div class="pole" data-ob="godzDo" style="margin-top:12px"><label>Godzina zakończenia</label><div class="gw"><input class="as-in" type="time" data-k="godzDo" value="' + esc(p.godzDo) + '" onchange="przPole(this)"><button class="btn2" onclick="przTeraz(\'godzDo\')">teraz</button></div></div></div>';
    h += '<div class="card"><h3>' + I('user', 1) + 'Podpisy <span class="nr">nieobowiązkowe</span></h3>' +
      '<label>Podpis technika</label><canvas id="prPodT"></canvas><button class="btn2" style="margin:8px 0 14px" onclick="przPodpisCzysc(\'podpisT\')">Wyczyść</button>' +
      '<label>Użytkownik – nazwisko i imię</label><input class="as-in" data-k="klient" value="' + esc(p.klient) + '" oninput="przPole(this)">' +
      '<label>Podpis użytkownika</label><canvas id="prPodK"></canvas><button class="btn2" style="margin-top:8px" onclick="przPodpisCzysc(\'podpisK\')">Wyczyść</button>' +
      '<div class="note">Bez podpisów na wydruku zostaną puste miejsca – podpis i pieczątka długopisem.</div></div>';
    h += '<div class="dol"><button class="btn gotowe" onclick="przDrukuj()">' + I('print', 1) + 'Drukuj / PDF</button>' +
      '<button class="btn gotowe" id="prWy" onclick="przZapiszSystem()">' + I('check', 1) + (p.wyslany ? 'Zapisany ' + dt(p.wyslany.slice(0, 10)) : 'Zapisz w systemie') + '</button></div>' +
      '<div class="dol"><button class="btn2" style="color:var(--red)" onclick="przUsun(\'' + p.id + '\')">' + I('trash', 1) + 'Usuń z telefonu</button></div>' +
      '<div class="note" style="border:0">„Zapisz w systemie” = jak skan przeglądu wysłany do bota (premia, termin następnego przeglądu, archiwum) + wiersz w arkuszu „Przeglądy”.</div></div>';
    setTimeout(() => { licznik(); podpisStart('prPodT', () => P().podpisT, d => { const q = P(); q.podpisT = d; zapisz(q); });
      podpisStart('prPodK', () => P().podpisK, d => { const q = P(); q.podpisK = d; zapisz(q); }); }, 0);
    return h;
  }
  // karta na zakładce Przeglądy: nowy przegląd + szkice
  window.przKarta = function () {
    const l = przSzkice(), lst = D ? D.myjnie.concat(D.inne) : [];
    return css + '<div class="card"><h3>' + I('shield', 1) + 'Przegląd w aplikacji</h3><select class="as-in" id="prNm"><option value="">— wybierz myjnię —</option>' +
      lst.map(w => '<option>' + esc(w.nazwa) + '</option>').join('') + '</select><button class="btn" onclick="przNowy(document.getElementById(\'prNm\').value)">Zacznij przegląd</button>' +
      (l.length ? '<div style="margin-top:10px">' + l.slice(0, 8).map(p => { const b = braki(p).length;
        return '<div class="row w" onclick="przOtworz(\'' + p.id + '\')"><div class="g"><b>' + esc(skrot(p.myjnia)) + '</b><div class="mute">' + dt(p.data) + '</div></div><span class="pill ' +
          (p.wyslany ? 'ok' : b ? 'o' : 'y') + '">' + (p.wyslany ? 'zapisany' : b ? 'zostało ' + b : 'gotowy') + '</span></div>'; }).join('') + '</div>' : '') + '</div>';
  };
  function widok() { return ST.id && P() ? widokPrzeglad() : (ST.id = null, przKarta()); }
  window.MODULY = window.MODULY || {};
  window.MODULY.przeglad = { widok: widok, wstecz: () => { if (ST.id) { window.przLista(); return true; } } };
})();
