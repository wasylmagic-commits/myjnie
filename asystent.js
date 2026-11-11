/* Asystent serwisowy – moduł aplikacji „Serwis myjni” (11.2026, etap 1).
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
    busy: false, sesje: null, zamykanie: false, q: '',
    mowa: null, jezyk: LSG('as_jezyk') || 'pl-PL'
  };
  const zapiszStan = () => LSS('as_sesja', ST.s);
  const kolejka = () => LSG('as_kolejka') || [];

  /* ---------- połączenie ---------- */
  function post(akcja, dane) {
    return fetch(API + '?api=asystent', {
      method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ k: K, akcja: akcja }, dane || {}))
    }).then(r => r.json()).then(j => { if (!j.ok) { const e = new Error(j.blad || 'błąd serwera'); e.serwer = true; throw e; } return j.wynik; });
  }
  // błąd sieci → kolejka; błąd serwera → komunikat
  function wyslij(akcja, dane) {
    if (!navigator.onLine) return Promise.reject(Object.assign(new Error('offline'), { offline: true }));
    return post(akcja, dane).catch(e => { if (!e.serwer) e.offline = true; throw e; });
  }
  function doKolejki(akcja, dane) {
    const k = kolejka(); k.push({ akcja: akcja, dane: dane, t: Date.now() }); LSS('as_kolejka', k);
    toast('Brak zasięgu — wyślę, gdy wróci');
  }
  let wysylam = false;
  function oprozniaj() {
    const k = kolejka();
    if (wysylam || !k.length || !navigator.onLine) return;
    wysylam = true; ST.busy = true; odswiez();
    const x = k[0];
    if (x.akcja === 'as_runda' && x.dane.id === '?' && ST.s && ST.s.id !== '?') x.dane.id = ST.s.id;   // runda czekała na start
    post(x.akcja, x.dane).then(w => {
      LSS('as_kolejka', kolejka().slice(1));
      przyjmij(w, x.akcja);
      toast('Wysłane z kolejki');
    }).catch(e => {
      if (e.serwer) { LSS('as_kolejka', kolejka().slice(1)); toast('Błąd: ' + e.message); }
    }).then(() => { wysylam = false; ST.busy = false; odswiez(); if (kolejka().length && navigator.onLine) setTimeout(oprozniaj, 500); });
  }
  window.addEventListener('online', () => setTimeout(oprozniaj, 1500));

  function przyjmij(w, akcja) {
    if (!w) return;
    const s = ST.s && ST.s.id === w.id ? ST.s : { rozmowa: (ST.s && ST.s.id === '?' ? ST.s.rozmowa : []) || [] };
    Object.assign(s, { id: w.id, myjnia: w.myjnia, status: w.status, odp: w.odp, model: w.model, eskalacja: w.eskalacja, runda: w.runda,
                       powrot: w.powrot, szkicUrl: w.szkicUrl, szkicStatus: w.szkicStatus, ogon: w.ogon });
    if (w.rozmowa) s.rozmowa = w.rozmowa;
    else if (w.odp && akcja !== 'as_zamknij') s.rozmowa.push({ rola: 'assistant', tekst: w.odp.podsumowanie });
    ST.s = s; zapiszStan();
  }

  /* ---------- zdjęcia (zmniejszone w telefonie do 1600 px) ---------- */
  function dodajZdjecia(input) {
    const pliki = Array.from(input.files || []).slice(0, 6 - ST.zdj.length);
    input.value = '';
    pliki.forEach(f => {
      const img = new Image(), url = URL.createObjectURL(f);
      img.onload = () => {
        const max = 1600, s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        const d = c.toDataURL('image/jpeg', 0.82);
        ST.zdj.push({ b64: d.split(',')[1], mime: 'image/jpeg', mini: d });
        URL.revokeObjectURL(url); odswiez();
      };
      img.onerror = () => { URL.revokeObjectURL(url); toast('Nie mogę odczytać zdjęcia'); };
      img.src = url;
    });
  }
  window.asUsunZdj = i => { ST.zdj.splice(i, 1); odswiez(); };

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
  </style>`;

  function odswiez() { if (TAB === 'asystent') { const m = document.getElementById('main'); if (m) { m.innerHTML = widok(); odswiezMik(); } } }

  function narzedzia(pole) {
    return '<div class="as-bar">' +
      '<button style="' + st + '" class="as-mik" onclick="asMow(\'' + pole + '\')" aria-label="Dyktuj">' + I('mic') + '</button>' +
      '<button style="' + st + ';min-width:38px;font-size:12px" class="as-jez" onclick="asJezyk()">' + (ST.jezyk === 'pl-PL' ? 'PL' : 'RU') + '</button>' +
      '<label style="' + st + '" aria-label="Zdjęcie">' + I('camera') + '<input type="file" accept="image/*" multiple style="display:none" onchange="asZdj(this)"></label>' +
      '<span style="flex:1"></span></div>';
  }
  window.asZdj = el => dodajZdjecia(el);
  function miniatury() {
    return ST.zdj.length ? '<div class="as-zdj">' + ST.zdj.map((z, i) => '<div><img src="' + z.mini + '"><b onclick="asUsunZdj(' + i + ')">×</b></div>').join('') + '</div>' : '';
  }
  const busy = t => '<div class="card as-busy"><i></i>' + esc(t) + '</div>';

  function listaMyjni() {
    const l = D ? D.myjnie.map(w => w.nazwa).concat(D.inne.map(w => w.nazwa)) : [];
    const ost = LSG('as_ost_myjnie') || [];
    return ost.filter(n => l.indexOf(n) >= 0).concat(l.filter(n => ost.indexOf(n) < 0));
  }

  function widokStart() {
    const kol = kolejka();
    let h = '<div class="hero"><small>Asystent serwisowy</small><h2>Nowa diagnoza</h2><div style="position:relative;z-index:1;font-size:14px;opacity:.9">Myjnia, objaw, kody — dostaniesz hipotezy i cały plan sprawdzeń.</div></div>';
    if (kol.length) h += '<div class="card"><div class="row"><div class="g">W kolejce bez zasięgu: <b>' + kol.length + '</b></div><button class="btn2" onclick="asKolejka()">Wyślij teraz</button></div></div>';
    const l = listaMyjni();
    h += '<div class="card"><h3>' + I('pin', 1) + 'Myjnia</h3>' +
      (l.length ? '<select class="as-in" id="as-myj" onchange="asPole(\'myjnia\',this.value)"><option value="">— wybierz —</option>' +
        l.map(n => '<option' + (n === ST.myjnia ? ' selected' : '') + '>' + esc(n) + '</option>').join('') + '<option value="__inna"' + (ST.myjnia === '__inna' ? ' selected' : '') + '>Inna (wpiszę)…</option></select>' : '') +
      (!l.length || ST.myjnia === '__inna' ? '<input class="as-in" id="as-myj2" placeholder="np. Orlen SP 4040 Kalisz, Quantus" value="' + esc(ST.myjniaInna || '') + '" oninput="asPole(\'myjniaInna\',this.value)">' : '') +
      '<h3 style="margin-top:6px">' + I('alert', 1) + 'Kody / komunikaty na wyświetlaczu</h3>' +
      '<input class="as-in" id="as-kody" placeholder="np. F138, błąd 70, „łączenie”" value="' + esc(ST.kody) + '" oninput="asPole(\'kody\',this.value)">' +
      '<h3 style="margin-top:6px">' + I('pen', 1) + 'Co się dzieje</h3>' +
      '<textarea id="as-objaw" placeholder="Objaw, od kiedy, co już sprawdzone… (możesz dyktować)" oninput="asPole(\'objaw\',this.value)">' + esc(ST.objaw) + '</textarea>' +
      miniatury() + narzedzia('as-objaw') +
      '<label class="row" style="border:0;padding:12px 0 4px;cursor:pointer"><input type="checkbox" ' + (ST.trudny ? 'checked' : '') + ' onchange="asPole(\'trudny\',this.checked)" style="width:20px;height:20px"><div class="g">Trudny przypadek <span class="mute">— od razu mocniejszy model (wolniej, drożej)</span></div></label>' +
      '<button class="btn" style="width:100%;justify-content:center;margin-top:8px;height:46px" onclick="asStart()">' + I('spark', 1) + 'Zacznij diagnozę</button></div>';
    h += '<div class="card"><h3>' + I('history', 1) + 'Ostatnie sesje</h3>' + (ST.sesje ? (ST.sesje.length ? ST.sesje.map(x =>
      '<div class="row w" onclick="asOtworz(\'' + jsq(x.id) + '\')"><div class="g"><b>' + esc(skrot(x.myjnia)) + '</b> <span class="mute">' + esc(x.start) + '</span>' +
      '<div class="mute">' + esc(String(x.objaw || '').slice(0, 90)) + '</div>' + (x.przyczyna ? '<div class="mute">→ ' + esc(x.przyczyna.slice(0, 90)) + '</div>' : '') + '</div>' +
      '<span class="pill ' + (x.status === 'otwarta' ? 'o' : 'ok') + '">' + (x.status === 'otwarta' ? 'otwarta' : 'zamknięta') + '</span></div>').join('') : '<div class="mute">jeszcze nie było</div>')
      : '<button class="btn2" onclick="asSesje()">Pokaż</button>') + '</div>';
    return h;
  }

  function widokSesja() {
    const s = ST.s, o = s.odp || {};
    let h = '<div class="card"><div class="row" style="padding-top:0"><div class="g"><b style="font-size:17px">' + esc(skrot((s.myjnia || {}).nazwa || '')) + '</b>' +
      '<div class="mute">' + esc([(s.myjnia || {}).model, 'runda ' + (s.runda || 1), (s.model || '').replace('claude-', '')].filter(Boolean).join(' · ')) + '</div>' +
      (s.eskalacja ? '<div class="mute">↑ mocniejszy model: ' + esc(s.eskalacja) + '</div>' : '') + '</div>' +
      (o.pewnosc != null ? '<div style="text-align:right"><b style="font-size:20px;color:var(' + (o.pewnosc >= 70 ? '--grn' : o.pewnosc >= 40 ? '--org' : '--red') + ')">' + o.pewnosc + '%</b><div class="mute">pewność</div></div>' : '') + '</div>' +
      (s.powrot ? '<span class="as-tag op">możliwy powrót usterki</span>' : '') + (o.faza ? '<span class="as-tag">' + esc(({ dane: 'zbieram dane', plan: 'plan', petla: 'sprawdzamy', bramka: 'dlaczego się zepsuło?', weryfikacja: 'weryfikacja', zamkniecie: 'do zamknięcia' })[o.faza] || o.faza) + '</span>' : '') +
      (s.id === '?' ? '<span class="as-tag op">czeka na wysłanie</span>' : '') +
      (o.podsumowanie ? '<div style="margin-top:10px">' + esc(o.podsumowanie) + '</div>' : '') +
      (o.przyczyna ? '<div class="mute" style="margin-top:6px"><b>Przyczyna:</b> ' + esc(o.przyczyna) + '</div>' : '') +
      (o.pytanie ? '<div class="as-q">' + esc(o.pytanie) + '</div>' : '') + '</div>';
    if (o.ostrzezenie) h += '<div class="as-warn">' + I('alert', 1) + '<span>' + esc(o.ostrzezenie) + '</span></div>';
    if (o.prosba_o_zdjecie) h += '<div class="card"><div class="row" style="padding:0"><div class="g">' + I('camera', 1) + ' <b>Zdjęcie:</b> ' + esc(o.prosba_o_zdjecie) + '</div></div></div>';
    if ((o.hipotezy || []).length) h += '<div class="card"><h3>' + I('pulse', 1) + 'Hipotezy</h3>' + o.hipotezy.map(x =>
      '<div class="as-hip"><b>' + esc(x.t) + '</b><b style="color:var(--acc)">' + (x.p != null ? x.p + '%' : '') + '</b>' +
      (x.p != null ? '<div class="bar" style="grid-column:1/3"><div style="width:' + x.p + '%;background:var(--acc)"></div></div>' : '') +
      (x.dlaczego ? '<div class="mute">' + esc(x.dlaczego) + '</div>' : '') + '</div>').join('') + '</div>';
    if ((o.plan || []).length) {
      const zmian = Object.keys(ST.wyniki).length;
      h += '<div class="card"><h3>' + I('check', 1) + 'Plan sprawdzeń' + (zmian ? ' <span class="pill o">' + zmian + ' do wysłania</span>' : '') + '</h3>' + o.plan.map(k => {
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
    } else if (ST.zamykanie) {
      const dni = o.sprawdzic_za_dni || (s.powrot ? 7 : 0);
      h += '<div class="card"><h3>' + I('shield', 1) + 'Zamknięcie</h3>' +
        '<div class="mute" style="margin-bottom:6px">Dlaczego się zepsuło? (przyczyna źródłowa)</div>' +
        '<textarea id="as-przyczyna" placeholder="np. wężyk zraszania kół strzelał w wprowadzenie kablowe">' + esc(o.przyczyna || '') + '</textarea>' +
        '<div class="mute" style="margin-bottom:6px">Co zrobione</div><textarea id="as-naprawa" placeholder="np. wymieniony wężyk, szyna wysuszona"></textarea>' +
        narzedzia('as-naprawa') +
        '<select class="as-in" id="as-wynik" style="margin-top:10px"><option value="naprawione">Naprawione</option><option value="tymczasowo">Tymczasowo / do dokończenia</option><option value="nie">Nie rozwiązane</option></select>' +
        '<label class="row" style="border:0;cursor:pointer"><input type="checkbox" id="as-cykl" style="width:20px;height:20px"><div class="g">Pełny cykl / kontrola końcowa OK</div></label>' +
        '<div class="row" style="border:0"><div class="g">Kontrola za (dni, 0 = bez)</div><input class="as-in" id="as-dni" type="number" min="0" max="90" value="' + dni + '" style="width:90px;margin:0"></div>' +
        (!o.przyczyna ? '<div class="note">Bez przyczyny źródłowej przypadek trafi do bazy jako niepewny — i jest ryzyko powrotu usterki.</div>' : '') +
        '<div class="as-bar" style="margin-top:12px"><button class="btn2" onclick="asZamykanie(false)">Wróć</button><span style="flex:1"></span><button class="btn" onclick="asZamknij()">' + I('check', 1) + 'Zamknij sesję</button></div></div>';
    } else if (ST.busy) {
      h += busy(s.eskalacja || ST.trudny ? 'Myślę mocniejszym modelem… do minuty' : 'Myślę… zwykle 10–30 s');
    } else {
      h += '<div class="card"><h3>' + I('pen', 1) + 'Wynik / odpowiedź</h3>' +
        '<textarea id="as-tekst" placeholder="Co wyszło, odpowiedź na pytanie, co widzisz…" oninput="asPole(\'tekst\',this.value)">' + esc(ST.tekst || '') + '</textarea>' +
        miniatury() + narzedzia('as-tekst') +
        '<div class="as-bar" style="margin-top:12px">' +
        '<button class="btn2" onclick="asTrudny()" title="Mocniejszy model">' + I('star', 1) + 'Trudny</button>' +
        '<button class="btn2" onclick="asZamykanie(true)">' + I('shield', 1) + 'Zakończ</button><span style="flex:1"></span>' +
        '<button class="btn" onclick="asWyslij()">Wyślij</button></div></div>';
    }
    if ((s.rozmowa || []).length > 1) h += '<div class="card"><h3>' + I('history', 1) + 'Przebieg (' + s.rozmowa.length + ')</h3><div class="as-chat">' +
      s.rozmowa.slice().reverse().map(r => '<div class="' + (r.rola === 'user' ? 'u' : '') + '">' + (r.rola === 'user' ? '▸ ' : '') + esc(String(r.tekst || '').replace(/^(NOWA SESJA\.|RUNDA \d+\.)\s*/, '').slice(0, 400)) + (r.zdjec ? ' 📷' + r.zdjec : '') + '</div>').join('') + '</div></div>';
    if (s.status !== 'zamknieta') h += '<div style="text-align:center;margin:4px 0 10px"><button class="btn2" onclick="asNowa()">Odłóż i zacznij nową</button></div>';
    return h;
  }

  function widok() { return css + (ST.s ? widokSesja() : (ST.busy ? busy('Zaczynam… zwykle 10–30 s') : widokStart())); }

  /* ---------- akcje ---------- */
  window.asPole = (k, v) => { ST[k] = v; if (k === 'myjnia') odswiez(); };
  window.asKrok = (id, stan) => { ST.wyniki[id] = ST.wyniki[id] === stan ? undefined : stan; if (!ST.wyniki[id]) delete ST.wyniki[id]; odswiez(); };
  window.asSesje = () => { post('as_sesje', {}).then(l => { ST.sesje = l; odswiez(); }).catch(e => toast(e.message)); };
  window.asKolejka = () => oprozniaj();
  window.asZamykanie = on => { ST.zamykanie = on; odswiez(); window.scrollTo(0, document.body.scrollHeight); };
  window.asNowa = () => { ST.s = null; ST.wyniki = {}; ST.zdj = []; ST.objaw = ''; ST.kody = ''; ST.tekst = ''; ST.trudny = false; ST.zamykanie = false; ST.sesje = null; zapiszStan(); odswiez(); window.scrollTo(0, 0); };
  window.asNowaDla = nazwa => { asNowa(); ST.myjnia = nazwa; if (typeof zamknijDet === 'function') zamknijDet(); go('asystent'); };

  window.asStart = () => {
    const myj = ST.myjnia === '__inna' || !ST.myjnia ? (ST.myjniaInna || '').trim() : ST.myjnia;
    if (!myj) { toast('Wybierz myjnię'); return; }
    if (!ST.objaw.trim() && !ST.kody.trim() && !ST.zdj.length) { toast('Opisz objaw, kody albo dodaj zdjęcie'); return; }
    const ost = (LSG('as_ost_myjnie') || []).filter(n => n !== myj); ost.unshift(myj); LSS('as_ost_myjnie', ost.slice(0, 5));
    const dane = { myjnia: myj, objaw: ST.objaw, kody: ST.kody, trudny: ST.trudny, zdjecia: ST.zdj.map(z => ({ b64: z.b64, mime: z.mime })) };
    const lok = { id: '?', myjnia: { nazwa: myj }, odp: { podsumowanie: 'Zgłoszenie zapisane — czeka na zasięg.' }, runda: 1,
                  rozmowa: [{ rola: 'user', tekst: (ST.kody ? '[' + ST.kody + '] ' : '') + ST.objaw, zdjec: ST.zdj.length }] };
    ST.busy = true; odswiez();
    wyslij('as_start', dane).then(w => {
      ST.s = { rozmowa: lok.rozmowa }; ST.s.id = w.id; przyjmij(w, 'as_start');
      ST.zdj = []; ST.objaw = ''; ST.kody = ''; ST.trudny = false;
    }).catch(e => {
      if (e.offline) { doKolejki('as_start', dane); ST.s = lok; zapiszStan(); ST.zdj = []; ST.objaw = ''; ST.kody = ''; }
      else toast('Błąd: ' + e.message);
    }).then(() => { ST.busy = false; odswiez(); window.scrollTo(0, 0); });
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
      .catch(e => { if (e.offline) { doKolejki('as_runda', dane); czysc(); } else { s.rozmowa.pop(); toast('Błąd: ' + e.message); } })
      .then(() => { ST.busy = false; odswiez(); window.scrollTo(0, 0); });
  }
  window.asWyslij = () => runda();
  window.asTrudny = () => { if (confirm('Przełączyć na mocniejszy model do końca tej sesji? (wolniej i drożej)')) runda({ trudny: true }); };

  window.asZamknij = () => {
    const s = ST.s, v = id => (document.getElementById(id) || {}).value || '';
    const dane = { id: s.id, przyczyna: v('as-przyczyna'), naprawa: v('as-naprawa'), wynik: v('as-wynik'),
                   pelnyCykl: !!(document.getElementById('as-cykl') || {}).checked, sprawdzZaDni: +v('as-dni') || 0 };
    if (s.id === '?') { toast('Najpierw musi wyjść zgłoszenie (brak zasięgu)'); return; }
    ST.zamykanie = false; ST.busy = true; odswiez();
    wyslij('as_zamknij', dane).then(w => { przyjmij(w, 'as_zamknij'); toast('Zamknięte — szkic w „Do przeglądu”'); })
      .catch(e => { if (e.offline) doKolejki('as_zamknij', dane); else { ST.zamykanie = true; toast('Błąd: ' + e.message); } })
      .then(() => { ST.busy = false; odswiez(); });
  };

  window.asOtworz = id => {
    ST.busy = true; ST.s = null; odswiez();
    post('as_sesja', { id: id }).then(w => { ST.s = { rozmowa: [] }; przyjmij(w, 'as_sesja'); ST.wyniki = {}; })
      .catch(e => toast(e.message)).then(() => { ST.busy = false; odswiez(); window.scrollTo(0, 0); });
  };

  /* ---------- rejestracja w aplikacji ---------- */
  window.MODULY = window.MODULY || {};
  window.MODULY.asystent = { widok: widok, bezDanych: true };
  window.IKONY_DODATKOWE = Object.assign(window.IKONY_DODATKOWE || {}, {
    spark: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>'
  });
  setTimeout(oprozniaj, 3000);
})();
