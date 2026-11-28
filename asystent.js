/* Asystent serwisowy – moduł aplikacji „Serwis myjni” (11.2026, etap 1; v2 27.11.2026: jedno pole „O co chcesz zapytać?” + Diagnoza na myjni).
 * v2: pytanie → as_pytaj (szybki model, 2–4 s, żywa odpowiedź + wybór materiału) → as_pytaj_dalej (model podstawowy na wybranym pakiecie).
 *     Diagnoza → as_szybko (szybka odpowiedź na ekranie oczekiwania + pakiet) → as_start z pakietem. Bez funkcji „pytaj” w bocie – jak dawniej.
 * Ładowany PRZED głównym skryptem index.html; korzysta z jego funkcji (esc, I, toast, D, K, API, render) dopiero w momencie wywołania.
 * Serwer: Apps Script Asystent.gs, POST …/exec?api=asystent (text/plain → bez preflight CORS).
 * Pamięć w telefonie: bieżąca sesja + kolejka wysyłek bez zasięgu (localStorage).
 * Format odpowiedzi ma pole „wersja”; nieznane pola są ignorowane.
 */
(function () {
  const LSG = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const LSS = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { toast('Pamięć telefonu pełna'); } };

  const ST = {
    s: LSG('as_sesja'),           // { id, myjnia, odp, model, eskalacja, runda, powrot, rozmowa: [] }
    wyniki: {},                   // id kroku → 'ok' | 'nok' | 'pominiety' (jeszcze niewysłane)
    zdj: [],                      // [{ b64, mime, mini }]
    myjnia: '', objaw: '', kody: '', trudny: false,
    busy: false, sesje: null, zamykanie: false, q: '', potwierdz: null, poziom: LSG('as_poziom') || '',
    mowa: null, jezyk: LSG('as_jezyk') || 'pl-PL',
    p: LSG('as_pyt'),             // bieżące pytanie (v2): { id, myjnia, tury: [{ q, zdjec, szybka, pytania1, trafienie, potrzebna_myjnia, powod, dzis, odp, etap, blad }] }
    pyt: '', zdjP: [], diagOtw: false, szybka: ''
  };
  const zapiszPyt = () => LSS('as_pyt', ST.p);
  const umiePytac = () => typeof window.maFunkcje !== 'function' || window.maFunkcje('pytaj');
  const zapiszStan = () => LSS('as_sesja', ST.s);
  const kolejka = () => LSG('as_kolejka') || [];

  /* ---------- połączenie ---------- */
  // 14.11.2026 (audyt): każdy zapis ma rid – serwer rozpoznaje powtórkę i nie płaci drugi raz za tę samą rundę;
  // powtórki z kolejki z przerwami 5 s → 20 s → 60 s, po 4 próbach stop (przycisk „Wyślij teraz”).
  const nowyRid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const PAUZY = [5000, 20000, 60000];
  function post(akcja, dane) {
    return fetch(API + '?api=asystent', {
      method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ k: K, akcja: akcja, v: 2 }, dane || {}))
    }).then(r => r.text()).then(t => {
      let j;
      try { j = JSON.parse(t); } catch (e) { const x = new Error('serwer nie odpowiedział poprawnie (przerwa / limit Google)'); x.html = true; throw x; }
      if (!j.ok) { const e = new Error(j.blad || 'błąd serwera'); e.serwer = !j.trwa; e.trwa = !!j.trwa; throw e; }
      return j.wynik;
    });
  }
  // „poprzednia runda jeszcze trwa” → czekam 20 s i pytam o ten sam rid (serwer odda gotowy wynik)
  function postCierpliwie(akcja, dane, ile) {
    return post(akcja, dane).catch(e => {
      if (e.trwa && (ile || 0) < 3) return new Promise(r => setTimeout(r, 20000)).then(() => postCierpliwie(akcja, dane, (ile || 0) + 1));
      throw e;
    });
  }
  // błąd sieci → kolejka; błąd serwera → komunikat
  function wyslij(akcja, dane) {
    if (!dane.rid) dane.rid = nowyRid();
    if (!navigator.onLine) return Promise.reject(Object.assign(new Error('offline'), { offline: true }));
    return postCierpliwie(akcja, dane).catch(e => { if (!e.serwer) e.offline = true; throw e; });
  }
  function doKolejki(akcja, dane) {
    if (!dane.rid) dane.rid = nowyRid();
    const k = kolejka(); k.push({ akcja: akcja, dane: dane, t: Date.now(), proby: 0 }); LSS('as_kolejka', k);
    toast('Brak zasięgu — wyślę, gdy wróci');
    planuj(PAUZY[0]);
  }
  let wysylam = false, zegar = null;
  function planuj(ms) { clearTimeout(zegar); zegar = setTimeout(() => oprozniaj(false), ms); }
  function oprozniaj(recznie) {
    const k = kolejka();
    if (wysylam || !k.length || !navigator.onLine) return;
    const x = k[0];
    if (recznie) x.proby = 0;
    if ((x.proby || 0) >= PAUZY.length + 1) { if (recznie !== false) toast('Nie udało się wysłać — spróbuj ręcznie: „Wyślij teraz”'); return; }
    wysylam = true; ST.busy = true; odswiez();
    if (x.akcja === 'as_runda' && x.dane.id === '?' && ST.s && ST.s.id !== '?') x.dane.id = ST.s.id;   // runda czekała na start
    if (!x.dane.rid) x.dane.rid = nowyRid();
    let dalej = 0;
    postCierpliwie(x.akcja, x.dane).then(w => {
      LSS('as_kolejka', kolejka().slice(1));
      if (w && w.potwierdz) { ST.potwierdz = w; ST.zamknijDane = x.dane; toast('Zamknięcie czeka na decyzję'); }
      else { przyjmij(w, x.akcja); toast('Wysłane z kolejki'); }
      dalej = 500;
    }).catch(e => {
      if (e.serwer) { LSS('as_kolejka', kolejka().slice(1)); toast('Błąd: ' + e.message); dalej = 500; return; }
      const l = kolejka(); if (l[0]) { l[0].proby = (l[0].proby || 0) + 1; l[0].dane = x.dane; LSS('as_kolejka', l); }
      const p = l[0] ? l[0].proby : 0;
      if (p <= PAUZY.length) dalej = PAUZY[p - 1];
      else toast('Nie udało się wysłać po ' + p + ' próbach — „Wyślij teraz”, gdy będzie zasięg');
    }).then(() => { wysylam = false; ST.busy = false; odswiez(); if (dalej && kolejka().length && navigator.onLine) planuj(dalej); });
  }
  window.addEventListener('online', () => planuj(1500));

  function przyjmij(w, akcja) {
    if (!w) return;
    const s = ST.s && ST.s.id === w.id ? ST.s : { rozmowa: (ST.s && ST.s.id === '?' ? ST.s.rozmowa : []) || [] };
    Object.assign(s, { id: w.id, myjnia: w.myjnia, status: w.status, odp: w.odp, model: w.model, eskalacja: w.eskalacja, runda: w.runda,
                       powrot: w.powrot, szkicUrl: w.szkicUrl, szkicStatus: w.szkicStatus, ogon: w.ogon, poziom: w.poziom, koszt: w.koszt });
    if (w.rozmowa) s.rozmowa = w.rozmowa;
    else if (w.odp && akcja !== 'as_zamknij') s.rozmowa.push({ rola: 'assistant', tekst: w.odp.podsumowanie });
    s.t = Date.now();
    ST.s = s; zapiszStan();
  }

  /* ---------- zdjęcia (zmniejszone w telefonie do 1600 px) ---------- */
  function dodajZdjecia(input, cel) {
    const kosz = cel === 'p' ? ST.zdjP : ST.zdj;
    const pliki = Array.from(input.files || []).slice(0, 6 - kosz.length);
    input.value = '';
    pliki.forEach(f => {
      const img = new Image(), url = URL.createObjectURL(f);
      img.onload = () => {
        const max = 1600, s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        const d = c.toDataURL('image/jpeg', 0.82);
        kosz.push({ b64: d.split(',')[1], mime: 'image/jpeg', mini: d });
        URL.revokeObjectURL(url); odswiez();
      };
      img.onerror = () => { URL.revokeObjectURL(url); toast('Nie mogę odczytać zdjęcia'); };
      img.src = url;
    });
  }
  window.asUsunZdj = (i, cel) => { (cel === 'p' ? ST.zdjP : ST.zdj).splice(i, 1); odswiez(); };

  /* ---------- dyktowanie (Chrome: Web Speech) ---------- */
  window.asMow = (poleId) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast('Dyktowanie nie działa w tej przeglądarce — użyj mikrofonu klawiatury'); return; }
    if (ST.mowa) { ST.mowa.stop(); return; }
    const pole = document.getElementById(poleId); if (!pole) return;
    const r = new SR(); r.lang = ST.jezyk; r.continuous = true; r.interimResults = true;
    const baza = pole.value ? pole.value.replace(/\s*$/, ' ') : '';
    let gotowe = '';
    r.onresult = ev => {
      let tymcz = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) gotowe += ev.results[i][0].transcript + ' '; else tymcz += ev.results[i][0].transcript;
      }
      pole.value = baza + gotowe + tymcz; pole.dispatchEvent(new Event('input'));
    };
    r.onend = () => { ST.mowa = null; odswiezMik(); };
    r.onerror = e => { if (e.error !== 'no-speech' && e.error !== 'aborted') toast('Mikrofon: ' + e.error); };
    ST.mowa = r; r.start(); odswiezMik();
  };
  window.asJezyk = () => { ST.jezyk = ST.jezyk === 'pl-PL' ? 'ru-RU' : 'pl-PL'; LSS('as_jezyk', ST.jezyk); odswiezMik(); toast('Dyktowanie: ' + (ST.jezyk === 'pl-PL' ? 'polski' : 'rosyjski')); };
  function odswiezMik() {
    document.querySelectorAll('.as-mik').forEach(b => b.classList.toggle('on', !!ST.mowa));
    document.querySelectorAll('.as-jez').forEach(b => b.textContent = ST.jezyk === 'pl-PL' ? 'PL' : 'RU');
  }

  /* ---------- widok ---------- */
  const st = 'border:0;background:var(--acc2);color:var(--acc);border-radius:12px;height:42px;min-width:42px;padding:0 10px;display:inline-flex;align-items:center;justify-content:center;gap:6px;font-weight:600';
  const css = `<style>
    .as-h{display:flex;flex-direction:column;gap:6px}
    .as-hip{display:grid;grid-template-columns:1fr auto;gap:2px 10px;padding:8px 0;border-top:1px solid var(--line)}
    .as-hip:first-of-type{border-top:0}
    .as-hip .mute{grid-column:1/3}
    .as-krok{display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-top:1px solid var(--line)}
    .as-krok:first-of-type{border-top:0}
    .as-krok .n{width:26px;height:26px;border-radius:9px;background:var(--acc2);color:var(--acc);font-weight:700;font-size:12px;display:flex;align-items:center;justify-content:center;flex:0 0 auto}
    .as-krok.ok .n{background:var(--grnbg);color:var(--grn)} .as-krok.nok .n{background:var(--redbg);color:var(--red)} .as-krok.pominiety{opacity:.55}
    .as-krok .b{display:flex;flex-direction:column;gap:6px;flex:0 0 auto}
    .as-krok .b button{width:38px;height:34px;border-radius:10px;border:1px solid var(--line);background:var(--solid);font-weight:700}
    .as-krok .b button.on.t{background:var(--grnbg);color:var(--grn);border-color:transparent}
    .as-krok .b button.on.f{background:var(--redbg);color:var(--red);border-color:transparent}
    .as-q{background:var(--acc2);border-radius:14px;padding:12px 14px;margin:10px 0 0;font-weight:600}
    .as-warn{background:var(--redbg);color:var(--red);border-radius:14px;padding:10px 14px;margin-bottom:12px;font-weight:600;display:flex;gap:8px}
    .as-zdj{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}
    .as-zdj div{position:relative} .as-zdj img{width:64px;height:64px;object-fit:cover;border-radius:10px;border:1px solid var(--line)}
    .as-zdj b{position:absolute;top:-6px;right:-6px;background:var(--ink);color:var(--bg);border-radius:50%;width:20px;height:20px;font-size:12px;display:flex;align-items:center;justify-content:center;cursor:pointer}
    .as-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
    .as-mik.on{background:var(--red)!important;color:#fff!important;animation:asp 1s infinite}
    @keyframes asp{50%{opacity:.6}}
    .as-busy{display:flex;gap:10px;align-items:center;justify-content:center;padding:18px;color:var(--mute)}
    .as-busy i{width:18px;height:18px;border:2px solid var(--acc2);border-top-color:var(--acc);border-radius:50%;animation:spin .8s linear infinite}
    .as-chat div{margin-bottom:8px;font-size:14px} .as-chat .u{color:var(--mute)}
    select.as-in,input.as-in{width:100%;font:inherit;color:var(--ink);background:var(--solid);border:1px solid var(--line);border-radius:14px;padding:11px 14px;margin-bottom:10px}
    .as-tag{display:inline-block;font-size:11px;font-weight:700;border-radius:8px;padding:2px 8px;background:var(--line);color:var(--mute);margin-right:6px}
    .as-tag.op{background:var(--orgbg);color:var(--org)}
    .as-sek{display:flex;align-items:center;justify-content:flex-start;gap:8px;width:100%;border:0;background:none;color:var(--ink);font:inherit;font-weight:700;font-size:15px;padding:12px 0 6px;border-top:1px solid var(--line);cursor:pointer;text-align:left}
    .as-sek:first-of-type{border-top:0;padding-top:2px} .as-sek .n{color:var(--mute);font-weight:600} .as-sek .s{margin-left:auto;color:var(--mute);transition:transform .15s}
    .as-sek.on .s{transform:rotate(90deg)}
    .as-wyn{display:flex;gap:8px;margin-bottom:12px} .as-wyn button{flex:1;height:46px;border-radius:14px;border:0;font:inherit;font-weight:700;font-size:16px}
    .as-wyn .t{background:var(--grnbg);color:var(--grn)} .as-wyn .f{background:var(--redbg);color:var(--red)}
    .as-zrob{font-size:14px;color:var(--mute);padding:10px 0 2px;border-top:1px solid var(--line);cursor:pointer}
  </style>`;

  /* ---------- lista sesji: Otwarte / Do omówienia (briefing) / Archiwum ----------
   * 15.11.2026: serwisant zwykle nie zamyka sesji – kończy, gdy dostał rozwiązanie. Dlatego:
   * otwarta < STARA_H godzin = „Otwarte”; otwarta dłużej = „Do omówienia” (Wasyl zamyka na briefingu z prawdziwą przyczyną → szkic do bazy);
   * zamknięta = „Archiwum”. Testowe i schowane znikają z listy (w arkuszu zostają). */
  const STARA_H = 12;
  const testowa = x => /^\s*\[?\s*test\b/i.test(String(x.objaw || '')) || /^test/i.test(String(x.myjnia || ''));
  const kiedy = t => { const m = String(t || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/); return m ? new Date(+m[3], m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0)).getTime() : 0; };
  const stara = x => Date.now() - kiedy(x.start) > STARA_H * 3600e3;
  function wierszSesji(x, grupa) {
    const r = +x.rundy || 0;
    return '<div class="row"><div class="g w" onclick="asOtworz(\'' + jsq(x.id) + '\',\'' + grupa + '\')"><b>' + esc(skrot(x.myjnia)) + '</b> <span class="mute">' + esc(x.start) + '</span>' +
      '<div class="mute">' + esc(String(x.objaw || '').slice(0, 90)) + '</div>' + (x.przyczyna ? '<div class="mute">→ ' + esc(x.przyczyna.slice(0, 90)) + '</div>' : '') +
      (r ? '<span class="as-tag' + (grupa === 'omow' && r >= 3 ? ' op' : '') + '" style="margin-top:6px">' + r + (r === 1 ? ' runda' : r < 5 ? ' rundy' : ' rund') + (grupa === 'omow' && r >= 3 ? ' · warto omówić' : '') + '</span>' : '') + '</div>' +
      '<button class="ib" aria-label="Schowaj" onclick="asUkryj(\'' + jsq(x.id) + '\')">' + I('eyeoff', 1) + '</button></div>';
  }
  function sekcja(klucz, tytul, lista, grupa, otwarta) {
    if (!lista.length) return '';
    const on = otwarta || ST.sek === klucz;
    return (otwarta ? '<div class="as-sek on" style="cursor:default">' : '<button class="as-sek' + (on ? ' on' : '') + '" onclick="asSek(\'' + klucz + '\')">') +
      esc(tytul) + ' <span class="n">' + lista.length + '</span>' + (otwarta ? '</div>' : '<span class="s">›</span></button>') +
      (on ? lista.slice(0, ST.wszystkie === klucz ? 99 : 8).map(x => wierszSesji(x, grupa)).join('') +
        (lista.length > 8 && ST.wszystkie !== klucz ? '<div style="text-align:center;margin-top:8px"><button class="btn2" onclick="asWszystkie(\'' + klucz + '\')">Pokaż wszystkie (' + lista.length + ')</button></div>' : '') : '');
  }
  function listaSesji() {
    if (!ST.sesje) return ST.ladBlad ? '<div class="row"><div class="g mute">Nie udało się pobrać listy</div><button class="btn2" onclick="asSesje()">Ponów</button></div>'
                                     : '<div class="mute">wczytuję…</div>';
    const ukr = LSG('as_ukryte') || [];
    const wid = ST.sesje.filter(x => !ukr.includes(x.id) && !testowa(x));
    const schow = ST.sesje.length - wid.length;
    const otw = wid.filter(x => x.status === 'otwarta' && !stara(x)), omow = wid.filter(x => x.status === 'otwarta' && stara(x)), arch = wid.filter(x => x.status !== 'otwarta');
    const h = sekcja('otw', 'Otwarte', otw, 'otw', true) + sekcja('omow', 'Do omówienia (briefing)', omow, 'omow') + sekcja('arch', 'Archiwum', arch, 'arch');
    return (h || '<div class="mute">brak sesji</div>') +
      (schow ? '<div class="mute" style="margin-top:10px;font-size:13px">Schowane i testowe: ' + schow + (ukr.length ? ' · <a onclick="asOdkryj()">pokaż z powrotem</a>' : '') + '</div>' : '');
  }
  window.asSek = k => { ST.sek = ST.sek === k ? null : k; odswiez(); };
  window.asUkryj = id => { const u = LSG('as_ukryte') || []; if (!u.includes(id)) u.push(id); LSS('as_ukryte', u); odswiez(); toast('Sesja schowana — w arkuszu zostaje'); };
  window.asOdkryj = () => { LSS('as_ukryte', null); odswiez(); };
  window.asWszystkie = v => { ST.wszystkie = v; odswiez(); };
  window.asPrzebieg = () => { ST.przebieg = !ST.przebieg; odswiez(); };
  window.asPlanWsz = () => { ST.planWsz = !ST.planWsz; odswiez(); };

  function odswiez() { if (TAB === 'asystent' || TAB === 'pytanie') { const m = document.getElementById('main'); if (m) { m.innerHTML = window.MODULY[TAB].widok(); if (window.zmocz) zmocz(m); odswiezMik(); } } }

  function narzedzia(pole, cel) {
    return '<div class="as-bar">' +
      '<button style="' + st + '" class="as-mik" onclick="asMow(\'' + pole + '\')" aria-label="Dyktuj">' + I('mic') + '</button>' +
      '<button style="' + st + ';min-width:38px;font-size:12px" class="as-jez" onclick="asJezyk()">' + (ST.jezyk === 'pl-PL' ? 'PL' : 'RU') + '</button>' +
      '<label style="' + st + '" aria-label="Zdjęcie">' + I('camera') + '<input type="file" accept="image/*" multiple style="display:none" onchange="asZdj(this' + (cel === 'p' ? ',\'p\'' : '') + ')"></label>' +
      '<span style="flex:1"></span></div>';
  }
  window.asZdj = (el, cel) => dodajZdjecia(el, cel);
  function miniatury(cel) {
    const kosz = cel === 'p' ? ST.zdjP : ST.zdj;
    return kosz.length ? '<div class="as-zdj">' + kosz.map((z, i) => '<div><img src="' + z.mini + '"><b onclick="asUsunZdj(' + i + (cel === 'p' ? ',\'p\'' : '') + ')">×</b></div>').join('') + '</div>' : '';
  }
  const busy = t => '<div class="card as-busy"><i></i>' + esc(t) + '</div>';

  function listaMyjni() {
    const l = D ? D.myjnie.map(w => w.nazwa).concat(D.inne.map(w => w.nazwa)) : [];
    const ost = LSG('as_ost_myjnie') || [];
    return ost.filter(n => l.indexOf(n) >= 0).concat(l.filter(n => ost.indexOf(n) < 0));
  }

  function widokStart() {
    const kol = kolejka();
    let h = '';
    const z = ST.ostatnio;
    if (z) h += '<div class="card"><div class="row" style="padding:0"><div class="g">' + I('check', 1) + ' Zamknięta: <b>' + esc(skrot(z.myjnia)) + '</b>' +
      (z.szkicStatus ? '<div class="mute">szkic ' + esc(z.szkicStatus) + ' → „Do przeglądu”' + (z.ogon ? ' · kontrola ' + esc(z.ogon) : '') + '</div>' : '') + '</div>' +
      (z.szkicUrl ? '<a class="btn2" href="' + esc(z.szkicUrl) + '" target="_blank">' + I('doc', 1) + 'Otwórz</a>' : '') +
      '<button class="ib" aria-label="Ukryj" onclick="asOstatnioX()">×</button></div></div>';
    h += '<div class="hero"><small>Asystent serwisowy</small><h2>Nowa diagnoza</h2><div style="position:relative;z-index:1;font-size:14px;opacity:.9">Myjnia, objaw, zdjęcie błędu — dostaniesz hipotezy i cały plan sprawdzeń.</div></div>';
    if (kol.length) h += '<div class="card"><div class="row"><div class="g">W kolejce bez zasięgu: <b>' + kol.length + '</b></div><button class="btn2" onclick="asKolejka()">Wyślij teraz</button></div></div>';
    const l = listaMyjni();
    h += '<div class="card">';
    h += '<div><h3>' + I('pin', 1) + 'Myjnia</h3>' +
      (l.length ? '<select class="as-in" id="as-myj" onchange="asPole(\'myjnia\',this.value)"><option value="">— wybierz —</option>' +
        l.map(n => '<option' + (n === ST.myjnia ? ' selected' : '') + '>' + esc(n) + '</option>').join('') + '<option value="__inna"' + (ST.myjnia === '__inna' ? ' selected' : '') + '>Inna (wpiszę)…</option></select>' : '') +
      (!l.length || ST.myjnia === '__inna' ? '<input class="as-in" id="as-myj2" placeholder="np. Orlen SP 4040 Kalisz, Quantus" value="' + esc(ST.myjniaInna || '') + '" oninput="asPole(\'myjniaInna\',this.value)">' : '') +
      '<h3 style="margin-top:6px">' + I('camera', 1) + 'Ekran z błędem</h3>' +
      '<div class="as-bar" style="gap:8px"><label class="btn" style="flex:1;justify-content:center;cursor:pointer">' + I('camera', 1) + 'Zrób zdjęcie ekranu z błędem<input type="file" accept="image/*" capture="environment" style="display:none" onchange="asZdj(this)"></label>' +
      '<label class="btn2" style="cursor:pointer">Z galerii<input type="file" accept="image/*" multiple style="display:none" onchange="asZdj(this)"></label></div>' +
      '<div class="mute" style="font-size:13px;margin:4px 0 2px">Kod i komunikat odczyta system ze zdjęcia – nie musisz go przepisywać.</div>' + miniatury('') +
      '<h3 style="margin-top:6px">' + I('pen', 1) + 'Co się dzieje</h3>' +
      '<textarea id="as-objaw" placeholder="Objaw, kody błędów, od kiedy, co już sprawdzone… (możesz dyktować)" oninput="asPole(\'objaw\',this.value)">' + esc(ST.objaw) + '</textarea>' +
      narzedzia('as-objaw') +
      '<h3 style="margin-top:12px">' + I('star', 1) + 'Poziom serwisanta</h3>' +
      '<select class="as-in" id="as-poziom" onchange="asPoziom(this.value)"><option value="">domyślny (z Ustawień)</option>' +
      '<option value="doswiadczony"' + (ST.poziom === 'doswiadczony' ? ' selected' : '') + '>Doświadczony — cały plan, miękka kontrola końca</option>' +
      '<option value="nowy"' + (ST.poziom === 'nowy' ? ' selected' : '') + '>Początkujący — krok po kroku, twarda kontrola końca</option></select>' +
      '<label class="row" style="border:0;padding:12px 0 4px;cursor:pointer"><input type="checkbox" ' + (ST.trudny ? 'checked' : '') + ' onchange="asPole(\'trudny\',this.checked)" style="width:20px;height:20px"><div class="g">Trudny przypadek <span class="mute">— od razu mocniejszy model (wolniej, drożej)</span></div></label>' +
      '<button class="btn" style="width:100%;justify-content:center;margin-top:8px;height:46px" onclick="asStart()">' + I('spark', 1) + 'Zacznij diagnozę</button></div>';
    h += '</div>';
    if (!ST.sesje && !ST.laduje && !ST.ladBlad) setTimeout(asSesje, 0);
    h += '<div class="card"><h3>' + I('history', 1) + 'Sesje</h3>' + listaSesji() + '</div>';
    return h;
  }

  function widokPytStart() {
    let h = '';
    h += '<div class="hero"><small>Asystent serwisowy</small><h2>O co chcesz zapytać?</h2><div style="position:relative;z-index:1;font-size:14px;opacity:.9">Ustawienie, kod, gdzie co jest — krótka odpowiedź bez wybierania myjni. Usterkę na myjni prowadzi „Asystent” (diagnoza).</div></div>';
    h += '<div class="card"><textarea id="as-pyt" placeholder="np. gdzie w Alpha są adresy IP? · co znaczy błąd 2 w C160? · jak ustawić czujnik impulsów… (możesz dyktować)" oninput="asPole(\'pyt\',this.value)">' + esc(ST.pyt) + '</textarea>' +
      miniatury('p') + narzedzia('as-pyt', 'p') +
      '<button class="btn" style="width:100%;justify-content:center;margin-top:10px;height:46px" onclick="asPytaj()">' + I('spark', 1) + 'Zapytaj</button></div>';
    const hist = LSG('as_pyt_hist') || [];
    if (hist.length) h += '<div class="card"><button class="as-sek' + (ST.sek === 'pyt' ? ' on' : '') + '" style="border:0;padding:0" onclick="asSek(\'pyt\')">' + I('history', 1) + 'Ostatnie pytania <span class="n">' + hist.length + '</span><span class="s">›</span></button>' +
      (ST.sek === 'pyt' ? hist.map((x, i) => '<div class="row"><div class="g w" onclick="asPytOtworz(' + i + ')"><b>' + esc(String(x.q || '').slice(0, 80)) + '</b> <span class="mute">' + esc(x.kiedy || '') + '</span>' +
        (x.odp ? '<div class="mute">' + esc(String(x.odp).slice(0, 90)) + '</div>' : '') + '</div></div>').join('') : '') + '</div>';
    return h;
  }

  function widokSesja() {
    const s = ST.s, o = s.odp || {}, otw = s.status !== 'zamknieta';
    let h = '<div class="as-bar" style="margin-bottom:12px"><button class="btn2" onclick="asNowa()">' + I('back', 1) + 'Lista</button><span style="flex:1"></span>' +
      '<button class="btn2" onclick="asNowa()">' + I('spark', 1) + 'Nowa diagnoza</button></div>';
    if (ST.omow && otw && !ST.zamykanie && !ST.potwierdz) h += '<div class="card" style="background:var(--orgbg)"><b>Do omówienia na briefingu.</b> <span class="mute">Ta sesja nie została zamknięta. Wpisz, co naprawdę pomogło — szkic trafi do „Do przeglądu” i uczy system.</span>' +
      '<div style="margin-top:10px"><button class="btn" onclick="asZamykanie(true)">' + I('shield', 1) + 'Zamknij z przyczyną</button></div></div>';
    h += '<div class="card"><div class="row" style="padding-top:0"><div class="g"><b style="font-size:17px">' + esc(skrot((s.myjnia || {}).nazwa || '')) + '</b>' +
      '<div class="mute">' + esc([(s.myjnia || {}).model, 'runda ' + (s.runda || 1), (s.model || '').replace('claude-', ''), s.poziom === 'nowy' ? 'początkujący' : '', s.koszt ? '≈ ' + (+s.koszt).toFixed(2) + ' USD' : ''].filter(Boolean).join(' · ')) + '</div>' +
      (s.eskalacja ? '<div class="mute">↑ mocniejszy model: ' + esc(s.eskalacja) + '</div>' : '') + '</div>' +
      (o.pewnosc != null ? '<div style="text-align:right"><b style="font-size:20px;color:var(' + (o.pewnosc >= 70 ? '--grn' : o.pewnosc >= 40 ? '--org' : '--red') + ')">' + o.pewnosc + '%</b><div class="mute">pewność</div></div>' : '') + '</div>' +
      (s.powrot ? '<span class="as-tag op">możliwy powrót usterki</span>' : '') + (o.faza ? '<span class="as-tag">' + esc(({ dane: 'zbieram dane', plan: 'plan', petla: 'sprawdzamy', bramka: 'dlaczego się zepsuło?', weryfikacja: 'weryfikacja', zamkniecie: 'do zamknięcia' })[o.faza] || o.faza) + '</span>' : '') +
      (s.id === '?' ? '<span class="as-tag op">czeka na wysłanie</span>' : '') +
      (o.podsumowanie ? '<div style="margin-top:10px">' + esc(o.podsumowanie) + '</div>' : '') +
      (o.przyczyna ? '<div class="mute" style="margin-top:6px"><b>Przyczyna:</b> ' + esc(o.przyczyna) + '</div>' : '') +
      ((o.pytania && o.pytania.length) ? o.pytania.map(q => '<div class="as-q">' + esc(q) + '</div>').join('') : (o.pytanie ? '<div class="as-q">' + esc(o.pytanie) + '</div>' : '')) +
      (o.bramka && o.bramka.brak && s.status !== 'zamknieta' ? '<div class="note" style="margin-top:10px"><b>Do zamknięcia brakuje:</b> ' + esc(o.bramka.brak) + '</div>' : '') + '</div>';
    if (o.ostrzezenie) h += '<div class="as-warn">' + I('alert', 1) + '<span>' + esc(o.ostrzezenie) + '</span></div>';
    if (o.prosba_o_zdjecie) h += '<div class="card"><div class="row" style="padding:0"><div class="g">' + I('camera', 1) + ' <b>Zdjęcie:</b> ' + esc(o.prosba_o_zdjecie) + '</div></div></div>';
    if ((o.hipotezy || []).length) h += '<div class="card"><h3>' + I('pulse', 1) + 'Hipotezy</h3>' + o.hipotezy.map((x, i) =>
      '<div class="as-hip"><b>' + esc(x.t) + '</b><b style="color:var(--acc)">' + (x.p != null ? x.p + '%' : '') + '</b>' +
      (x.p != null ? '<div class="bar" style="grid-column:1/3"><div style="width:' + x.p + '%;background:var(--acc)"></div></div>' : '') +
      (x.dlaczego && i === 0 ? '<div class="mute">' + esc(x.dlaczego) + '</div>' : '') + '</div>').join('') + '</div>';
    if ((o.plan || []).length) {
      const zmian = Object.keys(ST.wyniki).length;
      // zrobione kroki (już wysłane) zwijam do jednej linii – na ekranie zostaje to, co jeszcze do zrobienia
      const zrob = o.plan.filter(k => k.stan && k.stan !== 'todo' && !ST.wyniki[k.id]);
      const widoczne = ST.planWsz ? o.plan : o.plan.filter(k => zrob.indexOf(k) < 0);
      h += '<div class="card"><h3>' + I('check', 1) + 'Plan sprawdzeń' + (zmian ? ' <span class="pill o">' + zmian + ' do wysłania</span>' : '') + '</h3>' +
        (zrob.length ? '<div class="as-zrob" style="border-top:0;padding-top:0" onclick="asPlanWsz()">' + (ST.planWsz ? 'Zwiń zrobione ›' : 'Zrobione: ' + zrob.map(k => k.id + (k.stan === 'ok' ? '✔' : k.stan === 'nok' ? '✖' : '–')).join(' ') + ' · pokaż ›') + '</div>' : '') +
        widoczne.map(k => {
        const stan = ST.wyniki[k.id] || k.stan;
        return '<div class="as-krok ' + stan + '"><div class="n">' + k.id + '</div><div class="g"><div>' + esc(k.krok) + '</div>' +
          (k.oczekiwane ? '<div class="mute">' + esc(k.oczekiwane) + '</div>' : '') + '</div>' +
          '<div class="b"><button class="t' + (stan === 'ok' ? ' on' : '') + '" onclick="asKrok(' + k.id + ',\'ok\')">✔</button>' +
          '<button class="f' + (stan === 'nok' ? ' on' : '') + '" onclick="asKrok(' + k.id + ',\'nok\')">✖</button></div></div>';
      }).join('') + '<div class="note">✔ = jak powinno / OK · ✖ = nieprawidłowo · drugi klik cofa. Uwagi do wyników dopisz w wiadomości.</div></div>';
    }
    if ((o.zrodla || []).length) h += '<div class="mute" style="margin:-4px 4px 12px">Źródła: ' + esc(o.zrodla.join(', ')) + '</div>';

    if (s.status === 'zamknieta') {
      h += '<div class="card"><h3>' + I('check', 1) + 'Sesja zamknięta</h3>' +
        (s.szkicUrl ? '<div class="row"><div class="g">Szkic przypadku' + (s.szkicStatus ? ' · ' + esc(s.szkicStatus) : '') + ' — w „Do przeglądu”</div><a class="btn2" href="' + esc(s.szkicUrl) + '" target="_blank">' + I('doc', 1) + 'Otwórz</a></div>' : '') +
        (s.ogon ? '<div class="row"><div class="g">Zadanie kontroli: ' + esc(s.ogon) + '</div></div>' : '') +
        '<button class="btn" style="width:100%;justify-content:center;margin-top:10px" onclick="asNowa()">' + I('spark', 1) + 'Nowa diagnoza</button></div>';
    } else if (ST.potwierdz) {
      const p = ST.potwierdz;
      h += '<div class="card"><h3>' + I('shield', 1) + 'Na pewno naprawione?</h3>' +
        '<div class="as-warn">' + I('alert', 1) + '<span>Brakuje: ' + esc((p.braki || []).join('; ')) + '</span></div>' +
        '<div class="mute" style="margin-bottom:10px">' + (p.poziom === 'nowy'
          ? 'Poziom początkujący: bez tego nie zamkniesz jako „naprawione”. Uzupełnij albo zamknij jako tymczasowo (z kontrolą za kilka dni).'
          : 'Bez tego usterka może wrócić. Zamknąć jako TYMCZASOWO z kontrolą za kilka dni?') + '</div>' +
        '<div class="as-bar"><button class="btn2" onclick="asPotwierdz(\'wroc\')">Wróć</button><span style="flex:1"></span>' +
        (p.poziom !== 'nowy' ? '<button class="btn2" onclick="asPotwierdz(\'wymus\')">Mimo to naprawione</button>' : '') +
        '<button class="btn" onclick="asPotwierdz(\'tymczasowo\')">' + I('check', 1) + 'Tymczasowo</button></div></div>';
    } else if (ST.zamykanie) {
      const dni = o.sprawdzic_za_dni || (s.powrot ? 7 : 0);
      h += '<div class="card"><h3>' + I('shield', 1) + 'Zamknięcie</h3>' +
        '<div class="mute" style="margin-bottom:6px">Dlaczego się zepsuło? (przyczyna źródłowa)</div>' +
        '<textarea id="as-przyczyna" placeholder="np. wężyk zraszania kół strzelał w wprowadzenie kablowe">' + esc(o.przyczyna || '') + '</textarea>' +
        '<div class="mute" style="margin-bottom:6px">Co zrobione</div><textarea id="as-naprawa" placeholder="np. wymieniony wężyk, szyna wysuszona"></textarea>' +
        narzedzia('as-naprawa') +
        '<select class="as-in" id="as-wynik" style="margin-top:10px"><option value="">— wybierz wynik —</option><option value="naprawione">Naprawione</option><option value="tymczasowo">Tymczasowo / do dokończenia</option><option value="nie">Nie rozwiązane</option></select>' +
        '<label class="row" style="border:0;cursor:pointer"><input type="checkbox" id="as-cykl" style="width:20px;height:20px"><div class="g">Pełny cykl / kontrola końcowa OK</div></label>' +
        '<div class="row" style="border:0"><div class="g">Kontrola za (dni, 0 = bez)</div><input class="as-in" id="as-dni" type="number" min="0" max="90" value="' + dni + '" style="width:90px;margin:0"></div>' +
        (!o.przyczyna ? '<div class="note">Bez przyczyny źródłowej przypadek trafi do bazy jako niepewny — i jest ryzyko powrotu usterki.</div>' : '') +
        '<div class="as-bar" style="margin-top:12px"><button class="btn2" onclick="asZamykanie(false)">Wróć</button><span style="flex:1"></span><button class="btn" onclick="asZamknij()">' + I('check', 1) + 'Zamknij sesję</button></div></div>';
    } else if (ST.busy) {
      h += busy(s.eskalacja || ST.trudny ? 'Myślę mocniejszym modelem… do minuty' : 'Myślę… zwykle 10–30 s');
    } else {
      h += '<div class="card">' + ((o.hipotezy || []).length || (o.plan || []).length ?
          '<h3>' + I('check', 1) + 'Pomogło?</h3><div class="as-wyn"><button class="t" onclick="asPomoglo()">✔ Pomogło</button><button class="f" onclick="asNiePomoglo()">✖ Nie pomogło</button></div>' : '') +
        '<h3>' + I('pen', 1) + 'Wynik / odpowiedź</h3>' +
        '<textarea id="as-tekst" placeholder="Co wyszło, odpowiedź na pytanie, co widzisz…" oninput="asPole(\'tekst\',this.value)">' + esc(ST.tekst || '') + '</textarea>' +
        miniatury('') + narzedzia('as-tekst') +
        '<div class="as-bar" style="margin-top:12px">' +
        '<button class="btn2" onclick="asTrudny()" title="Mocniejszy model">' + I('star', 1) + 'Trudny</button>' +
        '<button class="btn2" onclick="asZamykanie(true)">' + I('shield', 1) + 'Zakończ</button><span style="flex:1"></span>' +
        '<button class="btn" onclick="asWyslij()">Wyślij</button></div></div>';
    }
    if ((s.rozmowa || []).length > 1) h += '<div class="card"><button class="as-sek' + (ST.przebieg ? ' on' : '') + '" style="border:0;padding:0;justify-content:flex-start" onclick="asPrzebieg()">' + I('history', 1) + 'Przebieg <span class="n">' + s.rozmowa.length + '</span><span class="s">›</span></button>' +
      (ST.przebieg ? '<div class="as-chat" style="margin-top:10px">' +
      s.rozmowa.slice().reverse().map(r => '<div class="' + (r.rola === 'user' ? 'u' : '') + '">' + (r.rola === 'user' ? '▸ ' : '') + esc(String(r.tekst || '').replace(/^(NOWA SESJA\.|RUNDA \d+\.)\s*/, '').slice(0, 400)) + (r.zdjec ? ' 📷' + r.zdjec : '') + '</div>').join('') + '</div>' : '') + '</div>';
    return h;
  }

  function wyczysc() {
    ST.s = null; ST.wyniki = {}; ST.zdj = []; ST.objaw = ''; ST.kody = ''; ST.tekst = ''; ST.trudny = false; ST.zamykanie = false;
    ST.potwierdz = null; ST.zamknijDane = null; ST.sesje = null; ST.ladBlad = false; ST.omow = false; ST.podglad = false; ST.przebieg = false; ST.planWsz = false; zapiszStan();
  }
  function porzadek() {
    const s = ST.s;
    if (!s || ST.busy || ST.zamykanie || ST.potwierdz) return;
    if (!s.t) { s.t = Date.now(); zapiszStan(); }
    if (s.status === 'zamknieta' && !ST.podglad) { wyczysc(); return; }   // zamkniętą widać tylko, gdy otwarta z listy
    if (s.id !== '?' && Date.now() - s.t > STARA_H * 3600e3) { wyczysc(); setTimeout(() => toast('Poprzednia diagnoza odłożona — jest na liście'), 300); }
  }
  const szybkaKarta = t => t ? '<div class="card"><div class="row" style="padding:0;align-items:flex-start"><div style="color:var(--acc)">' + I('spark') + '</div><div class="g">' + esc(t) + '</div></div></div>' : '';
  function widok() {
    porzadek();
    return css + (ST.s ? widokSesja() : (ST.busy ? szybkaKarta(ST.szybka) + busy(ST.szybka ? 'Analizuję… zwykle 10–20 s' : 'Zaczynam… zwykle 10–20 s') : widokStart()));
  }

  function widokPyt() { return css + (ST.p ? widokPytanie() : widokPytStart()); }

  /* ---------- pytanie (v2) ---------- */
  function widokPytanie() {
    const p = ST.p, tury = p.tury || [];
    let h = '<div class="as-bar" style="margin-bottom:12px"><button class="btn2" onclick="asPytZamknij()">' + I('back', 1) + 'Pytania</button><span style="flex:1"></span>' +
      (p.myjnia ? '<span class="as-tag">' + esc(skrot(p.myjnia)) + '</span>' : '') + (p.koszt ? '<span class="mute" style="font-size:12px">≈ ' + (+p.koszt).toFixed(2) + ' USD</span>' : '') + '</div>';
    tury.forEach((t, i) => {
      const ost = i === tury.length - 1;
      h += '<div class="card" style="background:var(--acc2)"><b>' + esc(t.q) + '</b>' + (t.zdjec ? ' <span class="mute">📷' + t.zdjec + '</span>' : '') + '</div>';
      if (t.szybka && !(t.odp && t.trafienie)) h += szybkaKarta(t.szybka);
      if ((t.pytania1 || []).length && !t.odp) h += t.pytania1.map(q => '<div class="as-q">' + esc(q) + '</div>').join('');
      if (t.etap === 'h') h += busy('Chwila…');
      else if (t.etap === 's') h += busy('Szukam w bazie i dokumentacji… zwykle 10–15 s');
      else if (t.etap === 'myjnia' && ost) {
        h += '<div class="card"><h3>' + I('pin', 1) + 'Na której myjni?</h3>' + (t.powod ? '<div class="mute" style="margin-bottom:10px">' + esc(t.powod) + '</div>' : '') +
          (t.dzis ? '<button class="btn" style="width:100%;justify-content:center;margin-bottom:8px" onclick="asPytMyjnia(\'' + jsq(t.dzis.split(' / ')[0]) + '\')">Dziś jesteś na ' + esc(t.dzis.split(' / ')[0]) + '?</button>' : '') +
          '<select class="as-in" onchange="if(this.value)asPytMyjnia(this.value)"><option value="">— inna myjnia —</option>' + listaMyjni().map(n => '<option>' + esc(n) + '</option>').join('') + '</select>' +
          '<button class="btn2" style="width:100%;justify-content:center" onclick="asPytMyjnia(\'\')">Odpowiedz ogólnie, bez myjni</button></div>';
      } else if (t.etap === 'blad') {
        h += '<div class="card"><div class="row" style="padding:0"><div class="g" style="color:var(--red)">' + esc(t.blad || 'Nie udało się') + '</div>' + (ost && !t.zamkniete ? '<button class="btn2" onclick="asPytPonow()">Ponów</button>' : '') + '</div></div>';
      }
      const o = t.odp;
      const pustaOdp = o && !String(o.odpowiedz || '').trim() && !(o.kroki || []).length && !(o.pytania || []).length;
      if (pustaOdp) {
        h += '<div class="card"><div class="as-warn">' + I('alert', 1) + '<span>' + esc(o.blad || 'Nie udało się sformułować odpowiedzi. Ponów albo zapytaj krócej.') + '</span></div>' +
          (ost ? '<div class="as-bar"><button class="btn2" onclick="asPytPonow()">Ponów</button>' + (!t.pelny ? '<button class="btn2" onclick="asPytPelny()">Szukaj w całej bazie</button>' : '') + '</div>' : '') + '</div>';
      } else if (o) {
        h += '<div class="card">' + (o.ostrzezenie ? '<div class="as-warn">' + I('alert', 1) + '<span>' + esc(o.ostrzezenie) + '</span></div>' : '') +
          (o.brak_w_bazie ? '<span class="as-tag op">brak w bazie</span>' : '') + (t.trafienie ? '<span class="as-tag">Wiedza ogólna</span>' : '') +
          '<div style="margin-top:4px;white-space:pre-wrap">' + esc(o.odpowiedz || '') + '</div>' +
          ((o.kroki || []).length ? '<div style="margin-top:8px">' + o.kroki.map((k, j) => '<div class="as-krok" style="padding:8px 0"><div class="n">' + (j + 1) + '</div><div class="g">' + esc(k) + '</div></div>').join('') + '</div>' : '') +
          (o.gdzie_szukac ? '<div class="note" style="margin-top:8px"><b>Gdzie szukać:</b> ' + esc(o.gdzie_szukac) + '</div>' : '') +
          ((o.pytania || []).length ? o.pytania.map(q => '<div class="as-q">' + esc(q) + '</div>').join('') : '') +
          ((o.zrodla || []).length ? '<div class="mute" style="margin-top:8px;font-size:13px">Źródła: ' + esc(o.zrodla.join(', ')) + '</div>' : '') +
          (ost ? '<div class="as-bar" style="margin-top:10px">' +
            (o.awaria || t.rodzaj === 'awaria' ? '<button class="btn2" onclick="asDoDiagnozy()">' + I('pulse', 1) + 'To awaria → Diagnoza</button>' : '') +
            (!t.pelny && !o.przekieruj ? '<button class="btn2" onclick="asPytPelny()">Szukaj w całej bazie</button>' : '') +
            (o.przekieruj ? '' : !t.zapisane ? '<button class="btn2" onclick="asPytZapisz(' + i + ')">' + I('check', 1) + 'Zapisz do wiedzy</button>' : '<span class="mute">zapisane do Wiedzy ogólnej</span>') + '</div>' : '') + '</div>';
      }
    });
    const ost = tury[tury.length - 1];
    if (ost && ost.etap !== 'h' && ost.etap !== 's') {
      h += '<div class="card"><h3>' + I('pen', 1) + 'Dopytaj</h3><textarea id="as-dop" placeholder="Doprecyzuj, odpowiedz na pytanie, dopisz wynik…" oninput="asPole(\'dop\',this.value)">' + esc(ST.dop || '') + '</textarea>' +
        miniatury('p') + narzedzia('as-dop', 'p') +
        '<div class="as-bar" style="margin-top:10px"><button class="btn2" onclick="asPytNowe()">' + I('spark', 1) + 'Nowe pytanie</button><span style="flex:1"></span><button class="btn" onclick="asDopytaj()">Wyślij</button></div></div>';
    }
    return h;
  }
  function pytHist() {
    const p = ST.p; if (!p || !p.tury || !p.tury.length || !p.id) return;
    const t0 = p.tury[0], ost = p.tury[p.tury.length - 1];
    const l = (LSG('as_pyt_hist') || []).filter(x => x.id !== p.id);
    l.unshift({ id: p.id, q: t0.q, kiedy: new Date().toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }), odp: ost.odp ? ost.odp.odpowiedz : (ost.szybka || ''), p: p });
    LSS('as_pyt_hist', l.slice(0, 8));
  }
  function kontekstPyt() {
    return (ST.p.tury || []).map(t => 'Pytanie: ' + t.q + (t.odp ? ' | Odpowiedź: ' + String(t.odp.odpowiedz || '').slice(0, 500) : '')).join(' || ').slice(-3500);
  }
  const zamkniete = e => /w trakcie przebudowy/.test((e && e.message) || '');
  const komunikat = e => zamkniete(e) ? e.message : 'Błąd: ' + e.message;
  function blad(t, e) { t.etap = 'blad'; t.zamkniete = zamkniete(e); t.blad = e.offline ? 'Brak zasięgu — spróbuj ponownie, gdy wróci' : komunikat(e); }
  function dalej(t, dane) {
    t.etap = 's'; zapiszPyt(); odswiez();
    return wyslij('as_pytaj_dalej', Object.assign({ id: ST.p.id }, dane || {})).then(w => {
      t.odp = w.odp; t.etap = 'ok'; t.pelny = !!(dane && dane.pelny) || /cała baza/.test(w.pakiet || '');
      ST.p.koszt = w.koszt; ST.p.myjnia = w.myjnia || ST.p.myjnia; if (w.id) ST.p.id = w.id;
    }).catch(e => blad(t, e)).then(() => { t.ponow = dane; zapiszPyt(); pytHist(); odswiez(); });
  }
  window.asPytaj = () => {
    if (!umiePytac()) { if (window.wkrotce) wkrotce('Pytania do asystenta'); return; }
    const q = (ST.pyt || (document.getElementById('as-pyt') || {}).value || '').trim();
    if (!q && !ST.zdjP.length) { toast('Napisz pytanie albo dodaj zdjęcie'); return; }
    if (ST.mowa) ST.mowa.stop();
    const zd = ST.zdjP.map(z => ({ b64: z.b64, mime: z.mime }));
    const t = { q: q || '(zdjęcie)', zdjec: zd.length, etap: 'h' };
    ST.p = { id: '', tury: [t] }; ST.pyt = ''; ST.zdjP = []; zapiszPyt(); odswiez(); window.scrollTo(0, 0);
    wyslij('as_pytaj', { pytanie: q, zdjecia: zd }).then(w => {
      ST.p.id = w.id; ST.p.koszt = w.koszt; ST.p.myjnia = w.myjnia || '';
      Object.assign(t, { szybka: w.szybka, pytania1: w.pytania1, trafienie: w.trafienie, potrzebna_myjnia: w.potrzebna_myjnia, powod: w.powod, dzis: w.dzis, rodzaj: w.rodzaj });
      if (w.odp && (w.trafienie || w.rodzaj === 'awaria')) { t.odp = w.odp; t.etap = 'ok'; }
      else if (w.potrzebna_myjnia) t.etap = 'myjnia';
      else if (!w.koniec) return dalej(t);
      else t.etap = 'ok';
    }).catch(e => { blad(t, e); t.ponowStart = { q: q, zd: zd }; }).then(() => { zapiszPyt(); pytHist(); odswiez(); });
  };
  window.asPytMyjnia = nazwa => {
    const t = ST.p.tury[ST.p.tury.length - 1];
    if (nazwa) { ST.p.myjnia = nazwa; const ost = (LSG('as_ost_myjnie') || []).filter(n => n !== nazwa); ost.unshift(nazwa); LSS('as_ost_myjnie', ost.slice(0, 5)); }
    dalej(t, nazwa ? { myjnia: nazwa } : {});
  };
  window.asDopytaj = () => {
    const q = (ST.dop || '').trim();
    if (!q && !ST.zdjP.length) { toast('Napisz, o co dopytać'); return; }
    if (ST.mowa) ST.mowa.stop();
    const zd = ST.zdjP.map(z => ({ b64: z.b64, mime: z.mime }));
    const t = { q: q || '(zdjęcie)', zdjec: zd.length };
    const kont = kontekstPyt();
    ST.p.tury.push(t); ST.dop = ''; ST.zdjP = [];
    dalej(t, { tekst: q, zdjecia: zd, kontekst: kont }).then(() => window.scrollTo(0, document.body.scrollHeight));
  };
  window.asPytPelny = () => { const t = { q: 'Szukaj w całej bazie' }; ST.p.tury.push(t); dalej(t, { pelny: true, kontekst: kontekstPyt() }); };
  window.asPytPonow = () => {
    const t = ST.p.tury[ST.p.tury.length - 1];
    if (!ST.p.id && t.ponowStart) { ST.p = null; ST.pyt = t.ponowStart.q; ST.zdjP = []; window.asPytaj(); return; }
    dalej(t, t.ponow || {});
  };
  window.asPytZapisz = i => {
    const t = ST.p.tury[i], o = t.odp || {};
    const q = i > 0 ? ST.p.tury[0].q + ' — ' + t.q : t.q;
    const odp = [o.odpowiedz].concat((o.kroki || []).map((k, j) => (j + 1) + '. ' + k)).filter(Boolean).join(' ');
    post('as_wiedza_dodaj', { pytanie: q, odpowiedz: odp, id: ST.p.id }).then(w => { t.zapisane = w.id; zapiszPyt(); toast('Zapisane jako ' + w.id + ' — do sprawdzenia w arkuszu Wiedza_ogolna'); odswiez(); })
      .catch(e => toast('Błąd: ' + e.message));
  };
  window.asPytNowe = () => { ST.p = null; ST.dop = ''; zapiszPyt(); odswiez(); window.scrollTo(0, 0); setTimeout(() => { const x = document.getElementById('as-pyt'); if (x) x.focus(); }, 50); };
  window.asPytZamknij = () => { ST.p = null; zapiszPyt(); odswiez(); window.scrollTo(0, 0); };
  window.asPytOtworz = i => { const x = (LSG('as_pyt_hist') || [])[i]; if (!x || !x.p) return; ST.p = x.p; zapiszPyt(); odswiez(); window.scrollTo(0, 0); };
  window.asDoDiagnozy = () => {
    const p = ST.p, objaw = p.tury.map(t => t.q).filter(q => q !== 'Szukaj w całej bazie').join('. ');
    const myj = p.myjnia && listaMyjni().indexOf(p.myjnia) >= 0 ? p.myjnia : '';
    ST.p = null; zapiszPyt(); if (ST.s) wyczysc();
    ST.objaw = objaw; ST.myjnia = myj; go('asystent');
    setTimeout(() => { const x = document.getElementById('as-myj') || document.getElementById('as-objaw'); if (x) x.scrollIntoView({ block: 'center' }); }, 50);
  };

  /* ---------- akcje ---------- */
  window.asPole = (k, v) => { ST[k] = v; if (k === 'myjnia') odswiez(); };
  window.asPoziom = v => { ST.poziom = v; LSS('as_poziom', v || null); };
  window.asKrok = (id, stan) => { ST.wyniki[id] = ST.wyniki[id] === stan ? undefined : stan; if (!ST.wyniki[id]) delete ST.wyniki[id]; odswiez(); };
  window.asSesje = () => {
    ST.laduje = true; ST.ladBlad = false;
    post('as_sesje', {}).then(l => { ST.sesje = l || []; }).catch(() => { ST.ladBlad = true; }).then(() => { ST.laduje = false; odswiez(); });
  };
  window.asOstatnioX = () => { ST.ostatnio = null; odswiez(); };
  window.asKolejka = () => oprozniaj(true);
  window.asZamykanie = on => { ST.zamykanie = on; odswiez(); window.scrollTo(0, document.body.scrollHeight); };
  // odłożenie sesji nic nie kasuje: otwarta zostaje na serwerze i na liście („Otwarte” / „Do omówienia”)
  window.asNowa = () => { wyczysc(); odswiez(); window.scrollTo(0, 0); };
  window.asNowaDla = nazwa => { asNowa(); ST.myjnia = nazwa; if (typeof zamknijDet === 'function') zamknijDet(); go('asystent'); };

  window.asStart = () => {
    const myj = ST.myjnia === '__inna' || !ST.myjnia ? (ST.myjniaInna || '').trim() : ST.myjnia;
    if (!myj) { toast('Wybierz myjnię'); return; }
    if (!ST.objaw.trim() && !ST.kody.trim() && !ST.zdj.length) { toast('Opisz objaw albo dodaj zdjęcie'); return; }
    const ost = (LSG('as_ost_myjnie') || []).filter(n => n !== myj); ost.unshift(myj); LSS('as_ost_myjnie', ost.slice(0, 5));
    const dane = { myjnia: myj, objaw: ST.objaw, kody: ST.kody, trudny: ST.trudny, poziom: ST.poziom || undefined, zdjecia: ST.zdj.map(z => ({ b64: z.b64, mime: z.mime })) };
    const lok = { id: '?', myjnia: { nazwa: myj }, odp: { podsumowanie: 'Zgłoszenie zapisane — czeka na zasięg.' }, runda: 1,
                  rozmowa: [{ rola: 'user', tekst: (ST.kody ? '[' + ST.kody + '] ' : '') + ST.objaw, zdjec: ST.zdj.length }] };
    ST.busy = true; ST.szybka = ''; odswiez();
    const szybko = umiePytac() && navigator.onLine
      ? post('as_szybko', { myjnia: myj, objaw: ST.objaw, kody: ST.kody, zdjecia: dane.zdjecia, rid: nowyRid() })
          .then(r => { if (r && r.pakiet) dane.pakiet = r.pakiet; ST.szybka = (r && r.szybka) || ''; odswiez(); }).catch(() => {})
      : Promise.resolve();
    szybko.then(() => wyslij('as_start', dane)).then(w => {
      ST.s = { rozmowa: lok.rozmowa }; ST.s.id = w.id; przyjmij(w, 'as_start');
      ST.zdj = []; ST.objaw = ''; ST.kody = ''; ST.trudny = false;
    }).catch(e => {
      if (e.offline) { doKolejki('as_start', dane); ST.s = lok; zapiszStan(); ST.zdj = []; ST.objaw = ''; ST.kody = ''; }
      else toast(komunikat(e));
    }).then(() => { ST.busy = false; ST.szybka = ''; odswiez(); window.scrollTo(0, 0); });
  };

  function runda(extra) {
    const s = ST.s;
    const wyniki = Object.keys(ST.wyniki).map(id => ({ id: +id, stan: ST.wyniki[id] }));
    const tekst = (ST.tekst || '').trim();
    if (!wyniki.length && !tekst && !ST.zdj.length && !(extra && extra.trudny)) { toast('Odhacz kroki albo napisz wynik'); return; }
    const dane = Object.assign({ id: s.id, tekst: tekst, wyniki: wyniki, zdjecia: ST.zdj.map(z => ({ b64: z.b64, mime: z.mime })) }, extra || {});
    const opis = [wyniki.map(w => w.id + (w.stan === 'ok' ? '✔' : '✖')).join(' '), tekst].filter(Boolean).join(' · ') || (extra && extra.trudny ? 'Trudny przypadek' : '');
    s.rozmowa = s.rozmowa || []; s.rozmowa.push({ rola: 'user', tekst: opis, zdjec: ST.zdj.length });
    if (s.odp && s.odp.plan) s.odp.plan.forEach(k => { if (ST.wyniki[k.id]) k.stan = ST.wyniki[k.id]; });
    const czysc = () => { ST.wyniki = {}; ST.tekst = ''; ST.zdj = []; zapiszStan(); };
    if (s.id === '?') { doKolejki('as_runda', dane); czysc(); odswiez(); return; }
    ST.busy = true; odswiez();
    wyslij('as_runda', dane).then(w => { przyjmij(w, 'as_runda'); czysc(); })
      .catch(e => { if (e.offline) { doKolejki('as_runda', dane); czysc(); } else { s.rozmowa.pop(); toast(komunikat(e)); } })
      .then(() => { ST.busy = false; odswiez(); window.scrollTo(0, 0); });
  }
  window.asWyslij = () => runda();
  // jeden tap: „Pomogło” = zamknięcie jako naprawione (przyczyna = ustalona albo najmocniejsza hipoteza); szkic i tak idzie do przeglądu
  window.asPomoglo = () => {
    const s = ST.s, o = s.odp || {};
    if (s.id === '?') { toast('Najpierw musi wyjść zgłoszenie (brak zasięgu)'); return; }
    const hip = (o.hipotezy || [])[0];
    zamknijWyslij({ id: s.id, przyczyna: o.przyczyna || (hip ? hip.t + ' (wg asystenta, potwierdzone „Pomogło”)' : ''),
                    naprawa: (ST.tekst || '').trim() || 'Serwisant: „Pomogło” — rozwiązanie wg planu asystenta, szczegóły nie podane',
                    wynik: 'naprawione', pelnyCykl: false, sprawdzZaDni: +o.sprawdzic_za_dni || 0 });
  };
  window.asNiePomoglo = () => {
    const t = (ST.tekst || '').trim();
    ST.tekst = 'Nie pomogło.' + (t ? ' ' + t : ' Szukaj dalej — co jeszcze sprawdzić?');
    runda();
  };
  window.asTrudny = () => { if (confirm('Przełączyć na mocniejszy model do końca tej sesji? (wolniej i drożej)')) runda({ trudny: true }); };

  window.asZamknij = () => {
    const s = ST.s, v = id => (document.getElementById(id) || {}).value || '';
    const dane = { id: s.id, przyczyna: v('as-przyczyna'), naprawa: v('as-naprawa'), wynik: v('as-wynik'),
                   pelnyCykl: !!(document.getElementById('as-cykl') || {}).checked, sprawdzZaDni: +v('as-dni') || 0 };
    if (s.id === '?') { toast('Najpierw musi wyjść zgłoszenie (brak zasięgu)'); return; }
    if (!dane.wynik) { toast('Wybierz wynik: naprawione / tymczasowo / nie rozwiązane'); return; }
    zamknijWyslij(dane);
  };
  function zamknijWyslij(dane) {
    ST.zamknijDane = dane;
    ST.zamykanie = false; ST.potwierdz = null; ST.busy = true; odswiez();
    wyslij('as_zamknij', dane).then(w => {
      if (w && w.potwierdz) { ST.potwierdz = w; return; }
      przyjmij(w, 'as_zamknij');
      ST.ostatnio = { myjnia: (ST.s.myjnia || {}).nazwa || '', szkicUrl: w.szkicUrl, szkicStatus: w.szkicStatus, ogon: w.ogon };
      wyczysc(); toast('Zamknięte — szkic w „Do przeglądu”');
    }).catch(e => { if (e.offline) doKolejki('as_zamknij', dane); else { ST.zamykanie = true; toast('Błąd: ' + e.message); } })
      .then(() => { ST.busy = false; odswiez(); window.scrollTo(0, ST.s ? document.body.scrollHeight : 0); });
  }
  // decyzja po „brakuje…”: wróć do formularza / zamknij jako tymczasowo / mimo to naprawione (tylko doświadczony)
  window.asPotwierdz = co => {
    const d = Object.assign({}, ST.zamknijDane || { id: ST.s.id });
    delete d.rid;
    ST.potwierdz = null;
    if (co === 'wroc') { ST.zamykanie = true; odswiez(); return; }
    if (co === 'tymczasowo') { d.wynik = 'tymczasowo'; if (!(+d.sprawdzZaDni > 0)) d.sprawdzZaDni = 7; }
    if (co === 'wymus') d.wymus = true;
    zamknijWyslij(d);
  };

  window.asOtworz = (id, grupa) => {
    ST.busy = true; ST.s = null; odswiez();
    post('as_sesja', { id: id }).then(w => { ST.s = { rozmowa: [] }; przyjmij(w, 'as_sesja'); ST.wyniki = {}; ST.omow = grupa === 'omow'; ST.podglad = true; ST.przebieg = grupa === 'omow' || grupa === 'arch'; })
      .catch(e => toast(e.message)).then(() => { ST.busy = false; odswiez(); window.scrollTo(0, 0); });
  };

  /* ---------- rejestracja w aplikacji ---------- */
  window.MODULY = window.MODULY || {};
  window.MODULY.asystent = { widok: widok, bezDanych: true, wstecz: () => { if (ST.s) { window.asNowa(); return true; } } };
  window.MODULY.pytanie = { widok: widokPyt, bezDanych: true, wstecz: () => { if (ST.p) { window.asPytZamknij(); return true; } } };
  window.IKONY_DODATKOWE = Object.assign(window.IKONY_DODATKOWE || {}, {
    spark: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    eyeoff: '<path d="M3 3l18 18"/><path d="M10.6 6.1A10 10 0 0 1 12 6c5 0 9 6 9 6a17 17 0 0 1-3.1 3.6M6.6 6.6C4.3 8.1 3 12 3 12s4 6 9 6c1.6 0 3-.4 4.3-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>'
  });
  setTimeout(() => oprozniaj(), 3000);
})();
