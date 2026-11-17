/* Po drodze – 17.11.2026. W oknie „Przed wyjazdem”: myjnie leżące nie dalej niż R km od trasy „ja → cel” z otwartymi naprawami i przeglądami (≤ 14 dni lub po terminie).
 * Ja = GPS telefonu w chwili otwarcia okna (bez GPS: koło R km wokół celu). Trasa = linia prosta. Współrzędne myjni: arkusz Geo w bocie (api=mgGeo, łatka 2026-11-17_po_drodze), D.geo.
 * Promień R (1–30 km, domyślnie 4): Więcej → „Po drodze”; zapisywany w LS i wspólnie dla urządzeń przez api=mgUst (D.ust.promien = {v, ts}). */
(function () {
  const MAXR = 30, DEF = 4;
  const wszystkie = () => (D.myjnie || []).concat(D.inne || []);
  const promien = () => { const v = +LS.get('pdR'); return v >= 1 && v <= MAXR ? v : DEF; };

  // ustawienie wspólne dla urządzeń: wygrywa nowszy czas zmiany
  function scal() {
    const u = D && D.ust && D.ust.promien; if (!u) return;
    if ((+u.ts || 0) > (+LS.get('pdRts') || 0) && +u.v >= 1 && +u.v <= MAXR) { LS.set('pdR', String(u.v)); LS.set('pdRts', String(u.ts)); }
  }

  // ---------- współrzędne ----------
  let dod = {};   // dopiero co dodane przez bota (zanim wrócą w D.geo)
  function geoMapa() { const m = {}; (D.geo || []).forEach(g => { m[g.n] = [g.lat, g.lng]; }); Object.keys(dod).forEach(k => { m[k] = dod[k]; }); return m; }
  // adres do geokodera: z karty myjni, a gdy pusto – z bazy Stacje (ulica + kod + miasto)
  function zapytanie(w) {
    const st = (D.stacje || []).find(s => w.klucz && (s.klucz === w.klucz || s.klucz === 'SP' + w.klucz));
    const ul = String(w.adres || (st && st.ulica) || '').replace(/^\s*ul\.?\s*/i, '').trim();
    if (!ul) return null;
    const miasto = w.miasto || (st && st.miasto) || '';
    return [ul, st && st.kod && ul.indexOf(st.kod) < 0 ? st.kod : '', miasto && ul.toLowerCase().indexOf(String(miasto).toLowerCase()) < 0 ? miasto : '', 'Polska'].filter(Boolean).join(', ');
  }
  let trwa = false, proby = 0;
  function uzupelnij() {
    if (trwa || proby >= 4 || !D || !API) return;
    const m = geoMapa(), lista = [];
    wszystkie().forEach(w => { if (m[w.nazwa]) return; const q = zapytanie(w); if (q) lista.push({ n: w.nazwa, q: q }); });
    if (!lista.length) return;
    trwa = true; proby++;
    api('mgGeo', { q: JSON.stringify(lista.slice(0, 20)) }).then(j => {
      trwa = false; const r = j.wynik || {};
      (r.dodane || []).forEach(g => { dod[g.n] = [g.lat, g.lng]; });
      if ((r.dodane || []).length && lista.length > 20) uzupelnij();
    }).catch(e => { trwa = false; proby = 9; });
  }

  // ---------- geometria (km, płaskie przybliżenie – wystarcza na dziesiątki km) ----------
  const xy = (p, lat0) => [p[1] * 111.32 * Math.cos(lat0 * Math.PI / 180), p[0] * 110.57];
  function doOdcinka(p, a, b, lat0) {
    const P = xy(p, lat0), A = xy(a, lat0), B = xy(b, lat0), dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy;
    let t = L2 ? ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / L2 : 0; t = Math.max(0, Math.min(1, t));
    return { d: Math.hypot(P[0] - (A[0] + t * dx), P[1] - (A[1] + t * dy)), t: t };
  }
  const km1 = x => (x < 10 ? x.toFixed(1) : String(Math.round(x))).replace('.', ',');

  function naprawy(w) { return (D.ogony || []).filter(o => open_(o) && kat(o) === 'naprawy' && o.typ !== 'fakt' && sama(o.myjnia, w)); }

  function obliczenie(cel, start) {
    const m = geoMapa(), R = promien(), c = m[cel.nazwa];
    if (!c) return { brakCelu: true };
    const a = start || c, lat0 = c[0];
    const wyniki = [], bez = [];
    wszystkie().forEach(w => {
      if (w.nazwa === cel.nazwa) return;
      const nap = naprawy(w), prz = w.dni != null && w.dni <= 14;
      if (!nap.length && !prz) return;
      const p = m[w.nazwa]; if (!p) { bez.push(w); return; }
      const r = doOdcinka(p, a, c, lat0);
      if (r.d <= R) wyniki.push({ w: w, nap: nap, prz: prz, d: r.d, t: r.t });
    });
    wyniki.sort((x, y) => x.t - y.t);
    return { R: R, wyniki: wyniki, bez: bez, bezGps: !start };
  }

  function karta(o) {
    if (o.brakCelu) return '<div class="mute" style="margin-top:12px">' + I('route', 1) + ' Po drodze: nie znam jeszcze położenia tej myjni (adres w Stacje/Myjnie albo chwila na geokodowanie).</div>';
    let h = '<h4 style="margin:14px 0 4px;font-size:15px">' + I('route', 1) + ' Po drodze (do ' + o.R + ' km od trasy)' + (o.wyniki.length ? ' · ' + o.wyniki.length : '') + '</h4>';
    if (o.bezGps) h += '<div class="mute">Brak GPS – pokazuję myjnie w promieniu ' + o.R + ' km od celu.</div>';
    if (!o.wyniki.length) h += '<div class="mute">nic nie wisi na myjniach po drodze</div>';
    o.wyniki.forEach(x => {
      const w = x.w;
      h += '<div class="row"><div class="g"><b>' + esc(skrot(w.nazwa)) + '</b> <span class="mute">' + esc(w.miasto || '') + ' · ' + km1(x.d) + ' km od trasy</span>' +
        (x.prz ? '<div style="color:var(--org)">' + I('alert', 1) + ' przegląd ' + (w.dni < 0 ? 'po terminie o ' + (-w.dni) + ' dn.' : 'za ' + dniTxt(w.dni)) + '</div>' : '') +
        x.nap.slice(0, 3).map(n => '<div class="mute"><span>#' + esc(n.id) + '</span> ' + esc(n.opis) + '</div>').join('') +
        (x.nap.length > 3 ? '<div class="mute">+ ' + (x.nap.length - 3) + ' więcej</div>' : '') + '</div></div>';
    });
    if (o.bez.length) h += '<div class="mute" style="margin-top:6px">Bez położenia (brak adresu): ' + esc(o.bez.map(w => skrot(w.nazwa)).join(', ')) + '</div>';
    h += '<div class="mute" style="margin-top:6px">Zasięg zmienisz w Więcej → Po drodze (teraz ' + o.R + ' km).</div>';
    return h;
  }

  window.pdPoTrasie = function (nazwa) {
    const el = document.getElementById('pdPo'); if (!el || !D) return;
    scal(); uzupelnij();
    const cel = wszystkie().find(x => x.nazwa === nazwa); if (!cel) return;
    const rysuj = start => { const e = document.getElementById('pdPo'); if (e) e.innerHTML = karta(obliczenie(cel, start)); };
    el.innerHTML = '<div class="mute" style="margin-top:12px">' + I('route', 1) + ' Szukam po drodze…</div>';
    if (!navigator.geolocation) { rysuj(null); return; }
    navigator.geolocation.getCurrentPosition(p => rysuj([p.coords.latitude, p.coords.longitude]), () => rysuj(null), { enableHighAccuracy: false, timeout: 7000, maximumAge: 300000 });
  };
  window.pdAkt = promien;
  window.pdStart = function () { if (D) { scal(); uzupelnij(); } };

  // ---------- ustawienie zasięgu ----------
  (function () {
    const st = document.createElement('style');
    st.textContent = '.pdr{-webkit-appearance:none;appearance:none;width:100%;height:32px;margin:0;padding:0;border:0;background:transparent;outline:none;--p:0%}' +
      '.pdr::-webkit-slider-runnable-track{height:10px;border-radius:5px;background:linear-gradient(90deg,var(--led) 0,var(--led) var(--p),var(--line) var(--p),var(--line) 100%);box-shadow:inset 0 0 0 1px rgba(128,128,128,.25)}' +
      '.pdr::-moz-range-track{height:10px;border-radius:5px;background:var(--line)}.pdr::-moz-range-progress{height:10px;border-radius:5px;background:var(--led)}' +
      '.pdr::-webkit-slider-thumb{-webkit-appearance:none;width:30px;height:30px;margin-top:-10px;border-radius:50%;background:#fff;border:3px solid var(--led);box-shadow:0 2px 8px rgba(0,0,0,.35)}' +
      '.pdr::-moz-range-thumb{width:24px;height:24px;border-radius:50%;background:#fff;border:3px solid var(--led);box-shadow:0 2px 8px rgba(0,0,0,.35)}' +
      '.pdpm{flex:0 0 auto;width:40px;height:40px;border-radius:50%;border:1px solid var(--line);background:var(--kaf,#eee);font-size:24px;line-height:1;font-weight:700;color:inherit;padding:0}';
    document.head.appendChild(st);
  })();
  const wypelnij = e => { if (e) e.style.setProperty('--p', ((+e.value - 1) / (MAXR - 1) * 100) + '%'); };
  let wyslijT = null;
  window.pdZmien = function (v) {
    v = Math.max(1, Math.min(MAXR, Math.round(+v || DEF))); const ts = Date.now();
    LS.set('pdR', String(v)); LS.set('pdRts', String(ts));
    const e = document.getElementById('pdRv'); if (e) e.textContent = v + ' km';
    const sl = document.getElementById('pdRs'); if (sl) { sl.value = v; wypelnij(sl); }
    clearTimeout(wyslijT);
    wyslijT = setTimeout(() => { api('mgUst', { k: 'promien', v: String(v), t: String(ts) }).catch(() => {}); }, 800);
  };
  window.pdUstaw = function () {
    scal(); const a = document.getElementById('ark');
    a.innerHTML = '<div class="tlo" onclick="pdGotowe()"></div><div class="ar"><h4>' + I('route', 1) + ' Po drodze</h4>' +
      '<div class="mute">W oknie „Przed wyjazdem” pokazuję myjnie z otwartymi naprawami i przeglądami, które leżą nie dalej niż tyle od trasy do celu.</div>' +
      '<div style="text-align:center;margin:14px 0 2px"><b id="pdRv" style="font-size:28px">' + promien() + ' km</b></div>' +
      '<div style="display:flex;align-items:center;gap:10px;margin:6px 0 2px"><button class="pdpm" onclick="pdZmien(pdAkt() - 1)" aria-label="mniej">&minus;</button><input id="pdRs" class="pdr" type="range" min="1" max="' + MAXR + '" step="1" value="' + promien() + '" oninput="pdZmien(this.value)"><button class="pdpm" onclick="pdZmien(pdAkt() + 1)" aria-label="więcej">+</button></div>' +
      '<div class="mute" style="display:flex;justify-content:space-between;padding:0 50px"><span>1 km</span><span>30 km</span></div>' +
      '<div class="ab"><button class="btn" onclick="pdGotowe()">Gotowe</button></div></div>';
    a.classList.add('on'); wypelnij(document.getElementById('pdRs'));
  };
  window.pdGotowe = function () { arkZamknij(); if (TAB === 'wiecej') render(); };
  window.pdKafel = function () { scal(); return '<button onclick="pdUstaw()"><div class="ch">' + I('route') + '</div><b>Po drodze</b><span>zasięg ' + promien() + ' km</span></button>'; };
})();
