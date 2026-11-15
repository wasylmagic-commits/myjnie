/* Raport – moduł aplikacji „Serwis myjni” (15.11.2026).
 * Raport wykonanych prac (SRL w WebCon) na JEDNYM ekranie: bloki pod sobą, bez zakładek.
 * Nazwy pól jak w WebCon (Realizacja zlecenia), żeby później podpiąć wysyłkę przez API WebCon.
 * Szkice na razie w pamięci urządzenia (localStorage „raporty”); zapis do arkusza – osobna łatka bota.
 * Ładowany PRZED głównym skryptem; funkcje index.html (esc, I, jsq, toast, dzisIso, dt, skrot, naglowek, LS, D, go) używane dopiero przy wywołaniu.
 */
(function () {
  const SERWISANT = 'TOMCZAKOWSKI WASYL';
  const USLUGI = ['Gwarancyjna', 'Płatna', 'Ryczałtowa', 'Inna', 'Do decyzji serwisanta'];
  const RODZAJE = ['', 'PSE', 'AWP', 'AWK', 'USZ', 'Mycie myjni'];
  // przyciski czasu: serwisant tylko klika, godziny Dojazd/Serwis/Powrót liczą się same
  const CZASY = [['wyjazd', 'Wyjazd'], ['przyjazd', 'Na myjni'], ['koniec', 'Koniec pracy'], ['odjazd', 'Odjazd z myjni'], ['dom', 'Powrót']];
  // pola obowiązkowe (* w WebCon) – kolejność = kolejność na ekranie
  const OBOW = [['nrSeryjny', 'Nr seryjny'], ['iloscMyc', 'Ilość myć'], ['nastawyZgodne', 'Nastawy zgodne?'], ['usluga', 'Usługa serwisowa'],
    ['dataRaportu', 'Data do raportu'], ['opisPrac', 'Opis wykonanych prac'], ['czas', 'Rejestracja czasu'], ['odbImie', 'Odbierający – imię i nazwisko'], ['odbEmail', 'Odbierający – e-mail']];

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
  function czasy(r) {
    const c = r.czas || {};
    return { dojazd: roz(c.wyjazd, c.przyjazd), serwis: roz(c.przyjazd, c.koniec), powrot: roz(c.odjazd, c.dom), kmD: +c.kmD || 0, kmP: +c.kmP || 0 };
  }
  function braki(r) {
    return OBOW.filter(([k]) => {
      if (k === 'czas') { const c = czasy(r); return !(c.serwis > 0); }
      return !String(r[k] || '').trim();
    });
  }

  window.rapNowy = function (nazwa) {
    const w = myjnia(nazwa) || {};
    const r = { id: 'r' + Date.now(), myjnia: nazwa || '', szl: '', model: w.model || '', nrSeryjny: w.nrSeryjny || w.serial || '', kodBledu: '',
      iloscMyc: String(w.licznik || '').replace(/\D/g, ''), nastawy: '', nastawyZgodne: '', usluga: '', rodzaj: '', dataRaportu: dzisIso(), terminNaprawy: '',
      opisPrac: '', opisTestow: '', uwagi: '', mat: [], czas: {}, zal: [], komentarz: '', odbImie: '', odbEmail: '', odbUwagi: '', potw: false, podpis: '' };
    zapisz(r, 1); ST.id = r.id;
    if (typeof zamknijDet === 'function') zamknijDet();
    go('raport');
  };
  window.rapOtworz = id => { ST.id = id; render(); window.scrollTo(0, 0); };
  window.rapLista = () => { ST.id = null; render(); window.scrollTo(0, 0); };
  window.rapUsun = id => { if (!confirm('Usunąć ten szkic raportu?')) return; const o = wszystkie(); delete o[id]; zapiszWsz(o); ST.id = null; render(); };

  // zwykłe pola: data-k = nazwa pola; zapis bez przerysowania (fokus zostaje)
  window.rapPole = function (el) {
    const r = R(); if (!r) return;
    const k = el.dataset.k, v = el.type === 'checkbox' ? el.checked : el.value;
    if (k.indexOf('czas.') === 0) { r.czas = r.czas || {}; r.czas[k.slice(5)] = v; zapisz(r); sumyCzasu(r); return; }
    r[k] = v; if (k === 'myjnia') { const w = myjnia(v) || {}; if (!r.model) r.model = w.model || ''; if (!r.iloscMyc) r.iloscMyc = String(w.licznik || '').replace(/\D/g, ''); zapisz(r); render(); return; }
    clearTimeout(tz); tz = setTimeout(() => zapisz(r), 250);
  };
  window.rapWybor = function (k, v) { const r = R(); r[k] = r[k] === v ? '' : v; zapisz(r); render(); };
  window.rapTeraz = function (k) {
    const r = R(), d = new Date(); r.czas = r.czas || {};
    r.czas[k] = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
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

  // dyktowanie (Chrome na Androidzie, po polsku)
  window.rapMow = function (k, b) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return toast('Dyktowanie: użyj mikrofonu na klawiaturze');
    const s = new SR(), el = document.querySelector('[data-k="' + k + '"]');
    s.lang = 'pl-PL'; s.interimResults = false; b.classList.add('nag');
    s.onresult = e => { const t = [...e.results].map(x => x[0].transcript).join(' '); el.value = (el.value ? el.value.trim() + ' ' : '') + t; rapPole(el); };
    s.onend = () => b.classList.remove('nag'); s.onerror = () => { b.classList.remove('nag'); toast('Nie usłyszałem – spróbuj jeszcze raz'); };
    s.start();
  };

  // podpis odbierającego palcem
  function podpisStart() {
    const c = document.getElementById('rpPod'); if (!c) return;
    const r = R(), x = c.getContext('2d'), sk = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * sk; c.height = c.offsetHeight * sk; x.scale(sk, sk);
    x.lineWidth = 2.4; x.lineCap = 'round'; x.strokeStyle = '#111';
    if (r.podpis) { const im = new Image(); im.onload = () => x.drawImage(im, 0, 0, c.offsetWidth, c.offsetHeight); im.src = r.podpis; }
    let on = false;
    const p = e => { const b = c.getBoundingClientRect(), t = e.touches ? e.touches[0] : e; return [t.clientX - b.left, t.clientY - b.top]; };
    const st = e => { on = true; const [a, b] = p(e); x.beginPath(); x.moveTo(a, b); e.preventDefault(); };
    const mv = e => { if (!on) return; const [a, b] = p(e); x.lineTo(a, b); x.stroke(); e.preventDefault(); };
    const en = () => { if (!on) return; on = false; const rr = R(); rr.podpis = c.toDataURL('image/png'); zapisz(rr); };
    c.addEventListener('touchstart', st, { passive: false }); c.addEventListener('touchmove', mv, { passive: false }); c.addEventListener('touchend', en);
    c.addEventListener('mousedown', st); c.addEventListener('mousemove', mv); window.addEventListener('mouseup', en);
  }
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

  // tekst do przeklejenia w WebCon (do czasu API)
  function tekst(r) {
    const c = czasy(r);
    return ['Myjnia: ' + r.myjnia + (r.szl ? ' · ' + r.szl : ''), 'Urządzenie: ' + r.model + ' · nr seryjny ' + r.nrSeryjny + (r.kodBledu ? ' · kod błędu ' + r.kodBledu : '') + ' · ilość myć ' + r.iloscMyc,
      'Nastawy chemiczne zgodne: ' + (r.nastawyZgodne || '—') + (r.nastawy ? ' · ' + r.nastawy : ''), 'Usługa: ' + (r.usluga || '—') + (r.rodzaj ? ' · ' + r.rodzaj : '') + ' · data do raportu ' + r.dataRaportu,
      '', 'Opis wykonanych prac:', r.opisPrac, r.opisTestow ? '\nOpis przeprowadzonych testów:\n' + r.opisTestow : '', r.uwagi ? '\nUwagi: ' + r.uwagi : '',
      '', 'Materiały:', ...(r.mat.length ? r.mat.map(m => '- ' + (m.kod ? m.kod + ' ' : '') + m.nazwa + ' – ' + m.ilosc + ' ' + m.jm + (m.mag ? '' : ' (poza magazynem)')) : ['- brak']),
      '', 'Czas (' + SERWISANT + '): Dojazd ' + godz(c.dojazd) + ' / ' + c.kmD + ' km · Serwis ' + godz(c.serwis) + ' · Powrót ' + godz(c.powrot) + ' / ' + c.kmP + ' km',
      'Odbierający: ' + r.odbImie + ' · ' + r.odbEmail + (r.odbUwagi ? ' · ' + r.odbUwagi : ''), r.komentarz ? 'Komentarz: ' + r.komentarz : ''].filter(x => x !== '').join('\n');
  }
  window.rapKopiuj = function () {
    const t = tekst(R());
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('Skopiowane – wklej w WebCon'))
      .catch(() => { const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); document.execCommand('copy'); a.remove(); toast('Skopiowane'); });
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
    '.rp .tx{position:relative} .rp .tx textarea{padding-right:52px} .rp .mic{position:absolute;right:8px;top:8px;width:40px;height:40px}' +
    '.rp .mic.nag{background:var(--red);color:#fff;animation:spin 0s}' +
    '.rp .czasy{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:12px}' +
    '.rp .cz{background:var(--fill);border-radius:16px;padding:10px;display:flex;flex-direction:column;gap:6px}' +
    '.rp .cz .btn{min-height:42px;font-size:15px;padding:0 10px} .rp .cz.ma .btn{background:var(--grn)}' +
    '.rp .cz input{margin:0;text-align:center;font-weight:700}' +
    '.rp .mt{display:flex;align-items:center;gap:8px;padding:9px 0;border-top:.5px solid var(--line)}' +
    '.rp .mt .g{flex:1;min-width:0} .rp .mt input{margin:0}' +
    '.rp .il{display:flex;align-items:center;gap:4px} .rp .il b{min-width:30px;text-align:center}' +
    '.rp .fot{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px} .rp .fot div{position:relative} .rp .fot img{width:96px;height:96px;object-fit:cover;border-radius:14px;display:block}' +
    '.rp .fot button{position:absolute;top:4px;right:4px;width:28px;height:28px}' +
    '.rp canvas{width:100%;height:170px;background:#fff;border-radius:16px;touch-action:none;display:block;box-shadow:inset 0 0 0 1px var(--line)}' +
    '.rp .chkl{display:flex;gap:10px;align-items:flex-start;font-size:15px;margin:4px 0 12px} .rp .chkl input{width:22px;height:22px;flex:0 0 auto;margin-top:1px}' +
    '.rp .dol{display:flex;gap:10px;flex-wrap:wrap;margin:6px 0 14px} .rp .dol .btn{flex:1}' +
    '</style>';

  const pole = (k, et, typ, ob, extra) => '<div class="pole' + (extra && extra.cala ? ' cala' : '') + '"' + (ob ? ' data-ob="' + k + '"' : '') + '><label>' + et + (ob ? ' <i>*</i>' : '') + '</label>' +
    '<input class="as-in" data-k="' + k + '" type="' + (typ || 'text') + '"' + (extra && extra.im ? ' inputmode="' + extra.im + '"' : '') + (extra && extra.ph ? ' placeholder="' + esc(extra.ph) + '"' : '') + ' value="' + esc(R()[k] || '') + '" oninput="rapPole(this)"></div>';
  const tx = (k, et, ob, ph) => '<div class="pole cala"' + (ob ? ' data-ob="' + k + '"' : '') + '><label>' + et + (ob ? ' <i>*</i>' : '') + '</label><div class="tx">' +
    '<textarea data-k="' + k + '" placeholder="' + esc(ph || '') + '" oninput="rapPole(this)">' + esc(R()[k] || '') + '</textarea>' +
    '<button class="ib mic" aria-label="Dyktuj" onclick="rapMow(\'' + k + '\',this)">' + MIC + '</button></div></div>';
  const MIC = '<svg class="i s" viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const CAM = '<svg class="i s" viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>';

  function widokLista() {
    const o = wszystkie(), l = Object.values(o).sort((a, b) => (b.zm || '').localeCompare(a.zm || ''));
    const lst = D ? D.myjnie.concat(D.inne) : [];
    let h = css + naglowek('doc', 'Raport', 'raport wykonanych prac (WebCon)');
    h += '<div class="card"><h3>' + I('pen', 1) + 'Nowy raport</h3><select class="as-in" id="rpNm"><option value="">— wybierz myjnię —</option>' +
      lst.map(w => '<option>' + esc(w.nazwa) + '</option>').join('') + '</select><button class="btn" onclick="rapNowy(document.getElementById(\'rpNm\').value)">Zacznij raport</button>' +
      '<div class="note">Raport możesz też zacząć z karty myjni (przycisk „Raport”).</div></div>';
    h += '<div class="card"><h3>' + I('doc', 1) + 'Szkice (' + l.length + ')</h3>' + (l.length ? l.map(r => { const b = braki(r).length;
      return '<div class="row w" onclick="rapOtworz(\'' + r.id + '\')"><div class="g"><b>' + esc(skrot(r.myjnia || 'bez myjni')) + '</b>' + (r.szl ? ' <span class="mute">' + esc(r.szl) + '</span>' : '') +
        '<div class="mute">' + dt(r.dataRaportu) + (r.opisPrac ? ' · ' + esc(r.opisPrac.slice(0, 60)) : '') + '</div></div><span class="pill ' + (b ? 'o' : 'ok') + '">' + (b ? 'brak ' + b : 'gotowy') + '</span></div>'; }).join('')
      : '<div class="mute">brak szkiców</div>') + '</div>';
    return h;
  }

  function widokRaport() {
    const r = R(), w = myjnia(r.myjnia) || {}, c = r.czas || {}, lst = D ? D.myjnie.concat(D.inne) : [];
    let h = css + '<div class="rp"><div class="phead"><button class="ib" onclick="rapLista()">' + I('back') + '</button><div><b>Raport · ' + esc(skrot(r.myjnia || '')) + '</b><span>' +
      esc([w.miasto, w.adres].filter(Boolean).join(', ')) + ' · szkic zapisuje się sam</span></div></div>';
    h += '<div id="rpBr" class="rp-br" onclick="rapDoBraku()"></div>';

    h += '<div class="card"><h3>' + I('wrench', 1) + 'Urządzenie <span class="nr">1</span></h3><div class="siatka">' +
      '<div class="pole"><label>Myjnia</label><select class="as-in" data-k="myjnia" onchange="rapPole(this)">' + lst.map(x => '<option' + (x.nazwa === r.myjnia ? ' selected' : '') + '>' + esc(x.nazwa) + '</option>').join('') + '</select></div>' +
      pole('szl', 'Nr zlecenia (SZL)', 'text', 0, { ph: 'SZL/2026/11/…' }) + pole('model', 'Nazwa (model)', 'text', 0) + pole('nrSeryjny', 'Nr seryjny', 'text', 1) +
      pole('iloscMyc', 'Ilość myć', 'text', 1, { im: 'numeric' }) + pole('kodBledu', 'Kod błędu', 'text', 0) +
      '<div class="pole cala" data-ob="nastawyZgodne"><label>Nastawy chemiczne zgodne z ustaleniami? <i>*</i></label><div class="wyb">' +
      ['Tak', 'Nie'].map(v => '<button class="' + (r.nastawyZgodne === v ? 'on' : '') + '" onclick="rapWybor(\'nastawyZgodne\',\'' + v + '\')">' + v + '</button>').join('') + '</div></div>' +
      pole('nastawy', 'Nastawy chemiczne', 'text', 0, { cala: 1 }) + '</div></div>';

    h += '<div class="card"><h3>' + I('pen', 1) + 'Co zrobione <span class="nr">2</span></h3><div class="siatka">' +
      '<div class="pole cala" data-ob="usluga"><label>Usługa serwisowa <i>*</i></label><div class="wyb">' +
      USLUGI.map(v => '<button class="' + (r.usluga === v ? 'on' : '') + '" onclick="rapWybor(\'usluga\',\'' + jsq(v) + '\')">' + v + '</button>').join('') + '</div></div>' +
      '<div class="pole"><label>Rodzaj zgłoszenia</label><select class="as-in" data-k="rodzaj" onchange="rapPole(this)">' + RODZAJE.map(v => '<option' + (v === r.rodzaj ? ' selected' : '') + ' value="' + v + '">' + (v || '—') + '</option>').join('') + '</select></div>' +
      pole('dataRaportu', 'Data do raportu', 'date', 1) + pole('terminNaprawy', 'Termin naprawy', 'date', 0) +
      tx('opisPrac', 'Opis wykonanych prac', 1, 'Co było, co zrobione, co wymienione') + tx('opisTestow', 'Opis przeprowadzonych testów', 0, 'Np. 3 mycia testowe, wszystkie programy OK') +
      tx('uwagi', 'Uwagi', 0, '') + '</div></div>';

    h += '<div class="card"><h3>' + I('box', 1) + 'Materiały <span class="nr">3</span></h3>' +
      r.mat.map((m, i) => '<div class="mt"><div class="g">' + (m.mag ? '<b>' + esc(m.nazwa) + '</b><div class="mute">' + esc(m.kod) + ' · z magazynu ' + esc(SERWISANT) + (m.stan != null ? ' · stan ' + esc(m.stan) : '') + '</div>'
        : '<input class="as-in" data-mn placeholder="Nazwa części (poza magazynem)" value="' + esc(m.nazwa) + '" oninput="rapMat(' + i + ',\'nazwa\',this)">') + '</div>' +
        '<div class="il"><button class="ib" onclick="rapMatIl(' + i + ',-1)">−</button><b>' + esc(String(m.ilosc).replace('.', ',')) + '</b><button class="ib" onclick="rapMatIl(' + i + ',1)">+</button></div></div>').join('') +
      '<input type="search" placeholder="Dodaj z magazynu: nazwa albo kod" oninput="rapMatSzukaj(this.value)" style="margin-top:10px"><div id="rpMs"></div>' +
      '<button class="btn2" onclick="rapMatDodaj()">+ Część spoza magazynu</button></div>';

    h += '<div class="card" data-ob="czas"><h3>' + I('clock', 1) + 'Rejestracja czasu <span class="nr">4</span></h3><div class="czasy">' +
      CZASY.map(([k, t]) => '<div class="cz' + (c[k] ? ' ma' : '') + '"><button class="btn" onclick="rapTeraz(\'' + k + '\')">' + t + '</button>' +
        '<input class="as-in" type="time" data-k="czas.' + k + '" value="' + esc(c[k] || '') + '" onchange="rapPole(this)"></div>').join('') + '</div>' +
      '<div class="siatka"><div class="pole"><label>Km dojazd</label><input class="as-in" inputmode="numeric" data-k="czas.kmD" value="' + esc(c.kmD || '') + '" oninput="rapPole(this)"></div>' +
      '<div class="pole"><label>Km powrót</label><input class="as-in" inputmode="numeric" data-k="czas.kmP" value="' + esc(c.kmP || '') + '" oninput="rapPole(this)"></div></div>' +
      '<div id="rpSum">' + tabelaCzasu(czasy(r)) + '</div><div class="note">Kliknij przycisk w chwili zdarzenia – godzina wpisze się sama (można poprawić). Pracownik: ' + SERWISANT + '.</div></div>';

    h += '<div class="card"><h3>' + CAM + 'Zdjęcia i komentarz <span class="nr">5</span></h3><div class="fot">' +
      r.zal.map((z, i) => '<div><img src="' + z + '"><button class="ib" onclick="rapFotoUsun(' + i + ')">×</button></div>').join('') + '</div>' +
      '<label class="btn2" style="display:inline-flex;margin-bottom:12px">' + CAM + ' Zrób zdjęcie<input type="file" accept="image/*" capture="environment" multiple hidden onchange="rapFoto(this)"></label>' +
      tx('komentarz', 'Komentarz', 0, '') + '</div>';

    h += '<div class="card"><h3>' + I('user', 1) + 'Odbiór na myjni <span class="nr">6</span></h3><div class="siatka">' +
      pole('odbImie', 'Imię i nazwisko', 'text', 1) + pole('odbEmail', 'Adres e-mail', 'email', 1, { im: 'email' }) + pole('odbUwagi', 'Uwagi odbierającego', 'text', 0, { cala: 1 }) + '</div>' +
      '<label class="chkl"><input type="checkbox" data-k="potw"' + (r.potw ? ' checked' : '') + ' onchange="rapPole(this)"> Usterki usunięte, urządzenie sprawne</label>' +
      '<label>Podpis odbierającego</label><canvas id="rpPod"></canvas><button class="btn2" style="margin-top:8px" onclick="rapPodpisCzysc()">Wyczyść podpis</button></div>';

    h += '<div class="dol"><button class="btn" onclick="rapKopiuj()">' + I('doc', 1) + 'Kopiuj do WebCon</button><button class="btn2" style="color:var(--red)" onclick="rapUsun(\'' + r.id + '\')">' + I('trash', 1) + 'Usuń szkic</button></div>' +
      '<div class="note" style="border:0">Wysyłka prosto do WebCon – gdy będzie API. Na razie: „Kopiuj” i wklej opis w WebCon.</div></div>';
    setTimeout(() => { licznik(); podpisStart(); }, 0);
    return h;
  }

  function widok() { return ST.id && R() ? widokRaport() : (ST.id = null, widokLista()); }
  window.MODULY = window.MODULY || {};
  window.MODULY.raport = { widok: widok, bezDanych: true };
})();
