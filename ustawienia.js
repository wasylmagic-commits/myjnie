/* Ustawienia – ekran „Więcej → Ustawienia” (19.11.2026, v102).
 * Dwa rodzaje ustawień:
 *  1) NA URZĄDZENIE (localStorage): animacje, miganie alarmu, kolor kolumny wg stanu, tryb lekki, przesuwanie zakładek, wibracja, motyw.
 *     Telefon i tablet mogą mieć różne.
 *  2) NA OSOBĘ (wspólne dla urządzeń): pokazywanie cudzych myjni, zakładka startowa, zasięg „Po drodze”.
 *     Zapis w LS „u:NAZWA” + „u:NAZWA:ts” i w bocie przez api=mgUst, klucz „serw|~ust~NAZWA” (istniejąca łatka Serwisanci.gs, bez nowej łatki bota).
 *     Wygrywa nowszy czas zmiany (jak zasięg „Po drodze” i serwisant).
 * Nowe ustawienie = jeden wpis w liście URZ albo OSOBA poniżej.
 */
(function () {
  const H = () => document.documentElement;
  const GD = () => (typeof D !== 'undefined' ? D : null);   // D to let w głównym skrypcie, nie window.D
  const PRE = 'serw|~ust~';
  const wl = (k, def) => def ? LS.get(k) !== '0' : LS.get(k) === '1';   // def=true: domyślnie włączone

  // ---------- na urządzenie ----------
  const URZ = [
    { g: 'Wygląd', k: 'anim', def: true, t: 'Animacje kolumny', s: 'pierścienie i paski ładowania', kl: 'bezanim', odw: true },
    { g: 'Wygląd', k: 'mig', def: true, t: 'Miganie alarmu', s: 'kolumna i kafel mrugają przy zleceniu AWK', kl: 'bezmig', odw: true },
    { g: 'Wygląd', k: 'kol', def: true, t: 'Kolor kolumny wg stanu', s: 'pomarańcz = przeglądy po terminie, czerwień = AWK; wyłączone: zawsze turkus', kl: 'bezkol', odw: true },
    { g: 'Wygląd', k: 'lekki', def: false, t: 'Tryb lekki', s: 'bez rozmycia tła; dla słabszego telefonu', kl: 'lekki' },
    { g: 'Zachowanie', k: 'swipe', def: true, t: 'Przesuwanie zakładek palcem', s: 'w lewo i w prawo między dolnymi zakładkami' },
    { g: 'Zachowanie', k: 'wib', def: true, t: 'Wibracja', s: 'krótkie drgnięcie przy przesunięciu zakładki' }
  ];
  function zastosuj() {
    URZ.forEach(u => { if (u.kl) H().classList.toggle(u.kl, u.odw ? !wl(u.k, u.def) : wl(u.k, u.def)); });
  }
  const CSS = 'html.bezmig .hero[data-s=alarm] .pkol .led,html.bezmig .hero .hs div.s-r::after{animation:none}' +
    'html.bezkol .hero[data-s]{--ledc:#3fd6ff;--ledg:rgba(63,214,255,.7)}' +
    '.us-row{display:flex;align-items:center;gap:12px;padding:11px 0;border-top:.5px solid var(--line);min-height:52px;width:100%;text-align:left;background:none;border-left:0;border-right:0;border-bottom:0;color:inherit;font:inherit}' +
    '.us-row:first-of-type{border-top:0}.us-row .g{flex:1;min-width:0}.us-row .g b{display:block;font-weight:600}.us-row .g small{display:block;color:var(--mute);font-size:13px;line-height:1.3;margin-top:2px}' +
    '.us-sw{flex:0 0 auto;width:50px;height:30px;border-radius:15px;background:var(--line);position:relative;transition:background .18s}' +
    '.us-sw::after{content:"";position:absolute;top:3px;left:3px;width:24px;height:24px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.35);transition:transform .18s}' +
    '.us-sw.on{background:var(--led)}.us-sw.on::after{transform:translateX(20px)}' +
    '.us-v{flex:0 0 auto;color:var(--mute);font-weight:600}';
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  window.ustZastosuj = zastosuj;   // LS powstaje w głównym skrypcie dopiero po modułach – wołane stamtąd

  // ---------- na osobę (wspólne) ----------
  const START = [['dzis', 'Dziś'], ['myjnie', 'Myjnie'], ['ogony', 'Zadania']];
  const OSOBA = { cudze: { def: '1' }, start: { def: 'dzis' } };
  const lsv = n => { const v = LS.get('u:' + n); return v === '' ? OSOBA[n].def : v; };
  window.ustOsoba = lsv;

  // po wczytaniu D: nowsza wartość z bota wygrywa
  function scal(d) {
    let zm = false;
    Object.keys(OSOBA).forEach(n => {
      const u = d && d.ust && d.ust[PRE + n]; if (!u) return;
      if ((+u.ts || 0) > (+LS.get('u:' + n + ':ts') || 0)) {
        if (String(u.v) !== LS.get('u:' + n)) zm = true;
        LS.set('u:' + n, String(u.v)); LS.set('u:' + n + ':ts', String(u.ts));
      }
    });
    return zm;
  }
  let wyslijT = {};
  function zapisz(n, v) {
    const ts = Date.now(); v = String(v);
    LS.set('u:' + n, v); LS.set('u:' + n + ':ts', String(ts));
    const d = GD(); if (d) { d.ust = d.ust || {}; d.ust[PRE + n] = { v: v, ts: ts }; }
    clearTimeout(wyslijT[n]);
    wyslijT[n] = setTimeout(() => { api('mgUst', { k: PRE + n, v: v, t: String(ts) }).catch(() => {}); }, 600);
  }

  // cdScal (cudze.js) woła się po każdym wczytaniu D: dokładam scalanie ustawień i ukrywanie cudzych myjni
  const stary = window.cdScal;
  window.cdScal = function (d) {
    scal(d);
    if (stary) stary(d);
    if (d && lsv('cudze') === '0') d.inne = (d.inne || []).filter(w => !w.auto);
  };

  // ---------- ekran ----------
  const sw = (k, on, fn) => '<button class="us-row" onclick="' + fn + '"><div class="g">' + k + '</div><span class="us-sw' + (on ? ' on' : '') + '" role="switch" aria-checked="' + on + '"></span></button>';
  const wiersz = (t, s) => '<b>' + t + '</b><small>' + s + '</small>';
  function widok() {
    scal(GD());
    const g = {};
    URZ.forEach(u => { (g[u.g] = g[u.g] || []).push(u); });
    const MOT = window.MOTYWY || { auto: ['Auto'], jasny: ['Jasny'], ciemny: ['Ciemny'] }, mot = LS.get('motyw') || 'auto';
    let h = naglowek('suwaki', 'Ustawienia', 'wygląd, zachowanie, moje dane');
    h += '<div class="card"><h3>' + I('sun', 1) + 'Wygląd · to urządzenie</h3>' +
      '<div class="mute" style="margin-bottom:6px">Motyw</div><div class="seg">' + Object.keys(MOT).map(k => '<button class="' + (mot === k ? 'on' : '') + '" onclick="ustMotyw(\'' + k + '\')">' + MOT[k][0] + '</button>').join('') + '</div>' +
      g['Wygląd'].map(u => sw(wiersz(u.t, u.s), wl(u.k, u.def), 'ustPrzel(\'' + u.k + '\')')).join('') + '</div>';
    h += '<div class="card"><h3>' + I('pen', 1) + 'Zachowanie · to urządzenie</h3>' +
      g['Zachowanie'].map(u => sw(wiersz(u.t, u.s), wl(u.k, u.def), 'ustPrzel(\'' + u.k + '\')')).join('') + '</div>';
    h += '<div class="card"><h3>' + I('user', 1) + 'Moje dane · wspólne dla urządzeń</h3>' +
      sw(wiersz('Pokazuj cudze myjnie', 'stacje, na które jeździsz za kogoś (plakietka „nie moja”)'), lsv('cudze') !== '0', 'ustCudze()') +
      '<div class="us-row" style="display:block"><div class="g">' + wiersz('Zakładka startowa', 'od niej zaczyna się aplikacja') + '</div>' +
      '<div class="seg" style="margin:8px 0 0">' + START.map(s => '<button class="' + (lsv('start') === s[0] ? 'on' : '') + '" onclick="ustStart(\'' + s[0] + '\')">' + s[1] + '</button>').join('') + '</div></div>' +
      (window.pdUstaw ? '<button class="us-row" onclick="pdUstaw()"><div class="g">' + wiersz('Zasięg „Po drodze”', 'jak daleko od trasy szukać myjni z otwartymi sprawami') + '</div><span class="us-v">' + (+LS.get('pdR') >= 1 ? +LS.get('pdR') : 4) + ' km ›</span></button>' : '') +
      '</div>';
    return h;
  }

  window.ustPrzel = function (k) {
    const u = URZ.find(x => x.k === k); if (!u) return;
    const nowe = !wl(k, u.def); LS.set(k, nowe ? '1' : '0');
    if (k === 'lekki' && !nowe) LS.set('lagi', '0');
    if (k === 'anim' && nowe) { LS.set('lekki', '0'); LS.set('lagi', '0'); }
    zastosuj(); render();
  };
  window.ustMotyw = function (m) { ustawMotyw(m); render(); };
  window.ustCudze = function () {
    zapisz('cudze', lsv('cudze') === '0' ? '1' : '0');
    if (GD() && window.cdScal) cdScal(GD());
    render();
  };
  window.ustStart = function (t) { zapisz('start', t); render(); };

  window.MODULY = window.MODULY || {};
  window.MODULY.ustawienia = { widok: widok };
})();
