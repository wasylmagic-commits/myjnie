/* Notatnik – strona notesu (dzień pracy: wyjazd, km, godziny) zdjęciem z aplikacji, bez Telegrama (16.11.2026).
 * POST ?api=notatnik {k, rid, nazwa, mime, b64} → bot czyta stronę tym samym promptem co w Telegramie → karta dnia
 * Karta: wszystko do poprawienia (numer, miejsce, km, wyjazd/start/koniec, flagi, koniec dnia, usunięcie pracy)
 *   → Zapisz (api=notatnikZapisz&key&tak=1&zm=JSON) = „Tak ✅” w bocie; Anuluj (tak=0)
 * Po zapisie pytania AWK / uruchomienie / nadgodziny / dyżur → Tak / Nie tutaj (api=notatnikOdp).
 * Karta i pytania czekają w localStorage („notatnik”), gdy aplikacja się zamknie.
 * Ładowany po wydatki.js; funkcje index.html (esc, jsq, I, api, toast, load, render, arkZamknij, LS) używane dopiero przy wywołaniu.
 */
(function () {
  const ST = { trwa: false };
  const blad = e => /Nieznan|akcja|poprawnie|apiPost/i.test(e.message) ? 'Ta funkcja jeszcze się włącza (próby na żywym systemie) – pojawi się sama, zwykle w ciągu doby. To nie błąd.' : 'Błąd: ' + e.message;
  const zapis = () => { try { const s = JSON.parse(LS.get('notatnik') || '{}'); return s && typeof s === 'object' ? s : {}; } catch (e) { return {}; } };
  const zachowaj = s => LS.set('notatnik', JSON.stringify(s));
  const TYP = { raport: 'Serwis', montaz: 'Montaż', inwent: 'Inwentaryzacja', inne: 'Inne' };
  const hm = t => { const m = String(t || '').match(/(\d{1,2})[:.](\d{2})/); return m ? m[1].padStart(2, '0') + ':' + m[2] : ''; };
  const FLAGI = [['AWK', 'AWK'], ['U', 'uruchom.'], ['BN', 'bez nadg.']];

  // ---- karta na Dziś ----
  window.notatnikKarta = function () {
    const s = zapis();
    let h = '<div class="card nt"><h3>' + I('cal', 1) + 'Notes · dzień pracy</h3>';
    if (s.karta) h += '<div class="row nt-cz" onclick="notatnikOtworz()"><div class="g"><b>Strona z ' + esc(s.karta.data) + ' czeka</b><div class="mute">sprawdź i zapisz</div></div><span class="pill o">otwórz</span></div>';
    if (s.pyt && s.pyt.lista && s.pyt.lista.length) h += '<div class="row nt-cz" onclick="notatnikPytania()"><div class="g"><b>Pytania do dnia ' + esc(s.pyt.data || '') + '</b><div class="mute">' + s.pyt.lista.length + ' do odpowiedzi</div></div><span class="pill o">odpowiedz</span></div>';
    h += (ST.trwa ? '<div class="nt-dwa"><label class="btn nt-foto dis">' + I('cal', 1) + 'Czytam stronę…</label></div>' :
      '<div class="nt-dwa"><label class="btn nt-foto"><input type="file" accept="image/*" capture="environment" hidden onchange="notatnikPlik(this)">' + I('cal', 1) + 'Zrób zdjęcie</label>' +
      '<label class="btn2 nt-foto"><input type="file" accept="image/*" hidden onchange="notatnikPlik(this)">' + I('plus', 1) + 'Z galerii</label></div>') +
      '<div class="note" style="text-align:center;margin-top:6px">' + (ST.trwa ? 'zwykle 20–60 sekund, możesz zostać na tym ekranie' : 'cała strona razem z datą u góry') + '</div></div>';
    return h;
  };

  // zdjęcie zmniejszone do 1800 px – tak samo jak w Wydatkach
  function doB64(f) {
    return new Promise((ok, no) => {
      const fr = new FileReader();
      fr.onerror = () => no(new Error('nie mogę odczytać pliku'));
      fr.onload = () => { const im = new Image(); im.onerror = () => no(new Error('to nie jest zdjęcie'));
        im.onload = () => { const s = Math.min(1, 1800 / Math.max(im.width, im.height)), c = document.createElement('canvas');
          c.width = Math.round(im.width * s); c.height = Math.round(im.height * s); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
          ok({ b64: c.toDataURL('image/jpeg', .85).split(',')[1], mime: 'image/jpeg' }); };
        im.src = fr.result; };
      fr.readAsDataURL(f);
    });
  }

  window.notatnikPlik = async function (inp) {
    const f = (inp.files || [])[0]; inp.value = '';
    if (!f || ST.trwa) return;
    ST.trwa = true; render();
    try {
      const x = await doB64(f);
      const r = await fetch(API + '?api=notatnik', { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ k: K, rid: 'n' + Date.now().toString(36), nazwa: 'notes.jpg', mime: x.mime, b64: x.b64 }) });
      const t = await r.text(); let j;
      try { j = JSON.parse(t); } catch (e) { throw new Error('serwer nie odpowiedział poprawnie'); }
      if (!j.ok) throw new Error(j.blad || 'błąd serwera');
      ST.trwa = false; render();
      notatnikPokaz(j.wynik || {});
    } catch (e) { ST.trwa = false; render(); toast(blad(e)); }
  };

  // wynik rozpoznania (także z „Zdjęcie dokumentu” w Wydatkach)
  window.notatnikPokaz = function (w) {
    if (w.nieNotes) return toast('To nie wygląda na stronę notesu (rozpoznano: ' + (w.typ || 'inne') + '). Faktury i paragony – w Wydatkach.');
    if (w.blad) return toast(w.blad);
    if (!w.key) return toast('Bot nie zwrócił karty – spróbuj jeszcze raz');
    const s = zapis(); s.karta = w; zachowaj(s);
    notatnikOtworz();
  };

  // ---- karta dnia do sprawdzenia ----
  window.notatnikOtworz = function () {
    const w = zapis().karta; if (!w) return;
    const a = document.getElementById('ark');
    const kd = w.koniec || {};
    a.innerHTML = '<div class="tlo"></div><div class="ar nt-k"><h4>' + I('cal', 1) + ' Notes · ' + esc(w.data) + '</h4>' +
      '<div class="mute" style="margin:-2px 0 8px">Sprawdź z notesem, popraw co trzeba i zapisz.</div>' +
      (w.ostrz || []).concat(w.uwagi ? ['⚠️ ' + w.uwagi] : []).map(t => '<div class="nt-w">' + esc(t) + '</div>').join('') +
      (w.prace || []).map((p, i) => praca(p, i)).join('') +
      '<div class="nt-p"><b>Koniec dnia</b><div class="nt-2"><div><label>Powrót</label><input type="time" id="ntKc" value="' + esc(hm(kd.czas)) + '"></div>' +
      '<div><label>Licznik, km</label><input id="ntKk" inputmode="numeric" value="' + esc(kd.km || '') + '"></div></div></div>' +
      '<div class="ab" style="margin-top:14px"><button class="btn2" onclick="notatnikZapisz(0,this)">Anuluj</button>' +
      '<button class="btn" onclick="notatnikZapisz(1,this)">' + I('check', 1) + 'Zapisz dzień</button></div></div>';
    a.classList.add('on');
  };

  function praca(p, i) {
    const stan = p.typ === 'raport' ? (p.raport ? '<span class="pill ok">raport jest</span>' : '<span class="pill o">raportu jeszcze nie ma</span>') : '';
    return '<div class="nt-p" id="ntp' + i + '" data-i="' + i + '">' +
      '<div class="nt-h"><b>' + (i + 1) + '. ' + esc(TYP[p.typ] || 'Inne') + '</b>' +
      (p.typ === 'raport' ? '<input class="nt-nr" id="ntNr' + i + '" placeholder="nr 11/350" value="' + esc(p.nr || '') + '">' +
        '<button class="pill nt-bez" id="ntBez' + i + '" onclick="notatnikBez(' + i + ',this)">Bez raportu</button>' : '') +
      '<button class="ib" onclick="notatnikUsun(' + i + ')" aria-label="Usuń tę pracę">' + I('trash') + '</button></div>' +
      '<div class="nt-g">' + I('pin', 1) + ' ' + esc(p.gdzie || p.stacja || p.miejsce || 'miejsce?') + ' ' +
      '<span class="nt-stan">' + stan + '</span><span class="pill nt-bezi">praca bez raportu</span>' +
      (p.nowa ? ' <span class="pill">nowa myjnia</span>' : '') + (p.tenSam ? ' <span class="pill">ten sam obiekt</span>' : '') +
      ' <a onclick="notatnikMiejsce(' + i + ')">zmień</a></div>' +
      '<div class="nt-m" id="ntM' + i + '" hidden><div class="nt-2"><div><label>Miejsce / miasto</label><input id="ntMi' + i + '" value="' + esc(p.miejsce || '') + '"></div>' +
      '<div><label>Stacja (np. SP0232)</label><input id="ntSt' + i + '" value="' + esc(p.stacja || '') + '"></div></div>' +
      '<label>Adres</label><input id="ntAd' + i + '" value="' + esc(p.adres || '') + '"></div>' +
      '<div class="nt-3"><div><label>Wyjazd</label><input type="time" id="ntWy' + i + '" value="' + esc(hm(p.wyjazd)) + '"></div>' +
      '<div><label>Start</label><input type="time" id="ntSa' + i + '" value="' + esc(hm(p.start)) + '"></div>' +
      '<div><label>Koniec</label><input type="time" id="ntKo' + i + '" value="' + esc(hm(p.koniec)) + '"></div></div>' +
      '<div class="nt-2"><div><label>Licznik przy wyjeździe, km</label><input id="ntKm' + i + '" inputmode="numeric" value="' + esc(p.km || '') + '"></div>' +
      '<div><label>Flagi</label><div class="nt-f" id="ntF' + i + '">' + FLAGI.map(f => '<button class="pill' + ((p.flagi || []).indexOf(f[0]) >= 0 ? ' on' : '') + '" data-f="' + f[0] + '" onclick="this.classList.toggle(\'on\')">' + f[1] + '</button>').join('') + '</div></div></div>' +
      '</div>';
  }

  // 26.11.2026: „Bez raportu” – praca bez numeru zlecenia (np. pomoc koledze): numer niepotrzebny, wiersz od razu gotowy, nic nie czeka na dokument
  window.notatnikBez = (i, b) => {
    const on = b.classList.toggle('on');
    const nr = document.getElementById('ntNr' + i), box = document.getElementById('ntp' + i);
    if (nr) { nr.disabled = on; nr.style.opacity = on ? '.35' : ''; }
    if (box) box.classList.toggle('bez', on);
  };
  window.notatnikMiejsce = i => { const e = document.getElementById('ntM' + i); if (e) e.hidden = !e.hidden; };
  window.notatnikUsun = i => {
    const e = document.getElementById('ntp' + i); if (!e) return;
    const u = e.classList.toggle('usun');
    e.querySelector('.nt-h .ib').innerHTML = u ? I('refresh') : I('trash');
    e.querySelector('.nt-h .ib').setAttribute('aria-label', u ? 'Przywróć' : 'Usuń tę pracę');
  };

  // poprawki z formularza → zm dla bota (zawsze wszystkie prace, w kolejności)
  function zmiany(w) {
    const v = id => { const e = document.getElementById(id); return e ? e.value.trim() : undefined; };
    const prace = (w.prace || []).map((p, i) => {
      const box = document.getElementById('ntp' + i);
      if (box && box.classList.contains('usun')) return { i: i, usun: 1 };
      const o = { i: i, miejsce: v('ntMi' + i), stacja: v('ntSt' + i), adres: v('ntAd' + i), km: v('ntKm' + i),
        wyjazd: v('ntWy' + i), start: v('ntSa' + i), koniec: v('ntKo' + i),
        flagi: Array.from(document.querySelectorAll('#ntF' + i + ' .pill.on')).map(b => b.dataset.f) };
      if (p.typ === 'raport') {
        const bz = document.getElementById('ntBez' + i);
        if (bz && bz.classList.contains('on')) { o.bez = 1; o.nr = ''; } else o.nr = v('ntNr' + i);
      }
      return o;
    });
    return { prace: prace, koniec: { czas: v('ntKc') || '', km: v('ntKk') || '' } };
  }

  window.notatnikZapisz = function (tak, b) {
    const s = zapis(), w = s.karta; if (!w) return arkZamknij();
    const par = { key: w.key, tak: tak ? 1 : 0 };
    if (tak) {
      const zm = zmiany(w);
      if (!zm.prace.some(p => !p.usun)) return toast('Wszystkie prace usunięte – użyj „Anuluj”');
      const bezNr = zm.prace.find(p => !p.usun && !p.bez && p.nr === '');
      if (bezNr) return toast('Wpisz numer zlecenia w pracy ' + (bezNr.i + 1));
      par.zm = JSON.stringify(zm);
    }
    document.querySelectorAll('#ark .ab button').forEach(x => x.disabled = true);
    if (b) b.textContent = tak ? 'Zapisuję…' : 'Anuluję…';
    api('notatnikZapisz', par).then(j => {
      const r = j.wynik || {};
      const s2 = zapis(); delete s2.karta;
      if (r.zapisane && (r.pytania || []).length) s2.pyt = { data: w.data, lista: r.pytania };
      zachowaj(s2); arkZamknij();
      if (r.zapisane) { wynik(w.data, r.komunikaty || []); load(); }
      else toast(r.anulowane ? 'Nie zapisałem – strona odrzucona' : 'Ta strona była już przetworzona');
      render();
    }).catch(e => { document.querySelectorAll('#ark .ab button').forEach(x => x.disabled = false); if (b) b.innerHTML = tak ? I('check', 1) + 'Zapisz' : 'Anuluj'; toast(blad(e)); });
  };

  // ---- po zapisie: komunikaty bota + pytania ----
  function wynik(data, kom) {
    const s = zapis();
    if (s.pyt && s.pyt.lista && s.pyt.lista.length) return notatnikPytania(kom);
    toast(kom.length ? kom[0].replace(/\s+/g, ' ').slice(0, 90) : 'Dzień ' + data + ' zapisany');
  }

  window.notatnikPytania = function (kom) {
    const p = zapis().pyt; if (!p || !p.lista || !p.lista.length) return arkZamknij();
    const a = document.getElementById('ark');
    a.innerHTML = '<div class="tlo" onclick="arkZamknij()"></div><div class="ar nt-k"><h4>' + I('check', 1) + ' Dzień ' + esc(p.data || '') + '</h4>' +
      (Array.isArray(kom) ? kom : []).map(t => '<div class="row"><div class="g" style="white-space:pre-line">' + esc(t) + '</div></div>').join('') +
      '<div class="mute" style="margin:8px 0 4px">Jeszcze kilka pytań do premii:</div>' +
      p.lista.map((q, i) => '<div class="row" id="ntq' + i + '"><div class="g">' + (q.label ? '<b>' + esc(q.label) + '</b> · ' : '') + esc(q.txt) + '</div>' +
        '<div class="ab nt-tn"><button class="btn2" onclick="notatnikOdp(' + i + ',0,this)">Nie</button><button class="btn" onclick="notatnikOdp(' + i + ',1,this)">Tak</button></div></div>').join('') +
      '<div class="ab" style="margin-top:12px"><button class="btn2" onclick="arkZamknij()">Później</button></div></div>';
    a.classList.add('on');
  };

  window.notatnikOdp = function (i, tak, b) {
    const s = zapis(), q = s.pyt && s.pyt.lista[i]; if (!q) return;
    b.parentNode.querySelectorAll('button').forEach(x => x.disabled = true);
    api('notatnikOdp', { kod: q.kod, nr: q.nr, tak: tak }).then(j => {
      const r = j.wynik || {};
      if (!r.ok) toast(r.brak ? 'Nie znalazłem ' + q.nr + ' w tabeli' : 'Nie zapisałem odpowiedzi');
      const s2 = zapis(); if (s2.pyt) { s2.pyt.lista.splice(i, 1); if (!s2.pyt.lista.length) delete s2.pyt; } zachowaj(s2);
      if (s2.pyt) notatnikPytania(); else { arkZamknij(); toast('Gotowe – dzień zapisany'); load(); }
      render();
    }).catch(e => { b.parentNode.querySelectorAll('button').forEach(x => x.disabled = false); toast(blad(e)); });
  };

  // style modułu
  const css = document.createElement('style');
  css.textContent =
    '.nt-dwa{display:flex;gap:8px;margin-top:4px} .nt-foto{display:flex;flex:1;min-width:0;min-height:54px;font-size:16px;cursor:pointer;text-align:center} .nt-foto.dis{opacity:.6;pointer-events:none}' +
    '.nt-cz{cursor:pointer;box-shadow:inset 3px 0 0 var(--org)}' +
    '#ark .ar.nt-k{max-height:calc(100dvh - 40px);overflow-y:auto;-webkit-overflow-scrolling:touch}' +
    '.nt-k label{display:block;font-size:12px;color:var(--mute);margin:6px 0 3px} #ark .nt-k input{margin-bottom:4px;padding:9px 10px;font-size:16px;box-sizing:border-box}' +
    '.nt-p{background:var(--fill);border-radius:18px;padding:10px 12px;margin:10px 0;transition:opacity .3s} .nt-p.usun{opacity:.4} .nt-p.usun>*:not(.nt-h){display:none}' +
    '.nt-h{display:flex;align-items:center;gap:8px} .nt-h b{white-space:nowrap} .nt-h .ib{margin-left:auto;width:34px;height:34px;color:var(--red);flex:none}' +
    '#ark .nt-k input.nt-nr{flex:1;min-width:0;margin:0;background:var(--solid)} .nt-p input{background:var(--solid)!important}' +
    '.nt-g{font-size:14px;margin:6px 0 2px;line-height:1.6} .nt-g a{color:var(--acc);font-weight:600;cursor:pointer;margin-left:4px}' +
    '.nt-2{display:grid;grid-template-columns:1fr 1fr;gap:8px} .nt-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px}' +
    '.nt-2>div,.nt-3>div{min-width:0} #ark .nt-k input{width:100%;min-width:0} #ark .nt-k .nt-3 input{padding:9px 6px;text-align:center}' +
    '.nt-f{display:flex;flex-wrap:wrap;gap:5px;padding-top:2px} .nt-f .pill{border:0;cursor:pointer;font-size:13px;padding:7px 9px;background:var(--solid);transition:background .25s var(--spring),color .25s}' +
    '.nt-f .pill.on{background:var(--acc);color:#fff}' +
    '.nt-w{background:color-mix(in srgb,var(--org) 16%,transparent);border-radius:12px;padding:8px 10px;margin:6px 0;font-size:14px;white-space:pre-line}' +
    '.nt-tn{flex:none;gap:6px} .nt-tn button{min-width:64px}' +
    '.nt-bez{border:0;cursor:pointer;flex:none;font-size:13px;padding:7px 9px;background:var(--solid);transition:background .25s var(--spring),color .25s} .nt-bez.on{background:var(--acc);color:#fff}' +
    '.nt-bezi{display:none} .nt-p.bez .nt-bezi{display:inline-block} .nt-p.bez .nt-stan{display:none}';
  document.head.appendChild(css);
})();
