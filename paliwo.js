/* Paliwo – moduł aplikacji „Serwis myjni” (12.11.2026).
 * Dane: D.paliwo z Api.gs (arkusz Paliwo, łatka 2026-11-12_paliwo): [{d, g, rej, km, l, zl, pelny, stacja, kmOd, zuz}]
 * Ładowany PRZED głównym skryptem; funkcje index.html (esc, I, slupki, lic, zl, dt, MSC, miesiace, naglowek) używane dopiero przy wywołaniu.
 */
(function () {
  const lista = () => ((window.D || D || {}).paliwo || []).slice().sort((a, b) => (a.d + a.g).localeCompare(b.d + b.g));

  // realne średnie z tankowań; null gdy brak danych
  window.paliwoParam = function () {
    const p = lista();
    if (!p.length) return null;
    const pomiary = p.filter(x => x.kmOd > 0 && x.zuz > 0);
    const km = pomiary.reduce((a, x) => a + x.kmOd, 0), l = pomiary.reduce((a, x) => a + x.kmOd * x.zuz / 100, 0);
    const ost = p.slice(-6), lC = ost.reduce((a, x) => a + x.l, 0), zC = ost.reduce((a, x) => a + x.zl, 0);
    return { l100: km ? l / km * 100 : null, cena: lC ? zC / lC : null, km: km, n: p.length, pomiarow: pomiary.length };
  };

  const z2 = x => (Math.round(x * 100) / 100).toFixed(2).replace('.', ',');

  function widok() {
    const p = lista(), P = window.paliwoParam();
    let h = naglowek('fuel', 'Paliwo', p.length ? p.length + ' tankowań · od ' + dt(p[0].d) : 'arkusz Paliwo');
    if (!p.length) return h + '<div class="card mute">Brak tankowań. Wyślij botowi zdjęcie paragonu „Karta Flota” (i licznika) — zapisze się samo.</div>';
    const ost = p[p.length - 1];
    const t = new Date(), mKey = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0');
    const wMies = p.filter(x => x.d.slice(0, 7) === mKey).reduce((a, x) => a + x.zl, 0);
    h += '<div class="card"><h3>' + I('fuel', 1) + 'Średnio</h3><div class="kpi">' +
      '<div><b>' + (P.l100 ? z2(P.l100) : '—') + '</b><span>l / 100 km' + (P.l100 ? ' (' + lic(P.km) + ' km)' : ' — czekam na 2. pełny bak') + '</span></div>' +
      '<div><b>' + (P.cena ? z2(P.cena) : '—') + '</b><span>zł / l (ostatnie tankowania)</span></div>' +
      '<div><b>' + (P.l100 && P.cena ? z2(P.l100 * P.cena / 100) : '—') + '</b><span>zł / km paliwa</span></div>' +
      '<div><b>' + zl(wMies) + '</b><span>w tym miesiącu</span></div></div>' +
      '<div class="note">Zużycie liczone od pełnego baku do pełnego baku; niepełne tankowania dolicza się do następnego pełnego.</div></div>';

    const pom = p.filter(x => x.zuz > 0).slice(-10);
    if (pom.length) h += '<div class="card"><h3>' + I('chart', 1) + 'Zużycie przy kolejnych tankowaniach, l/100 km</h3>' +
      slupki(pom.map(x => x.d.slice(8, 10) + '.' + x.d.slice(5, 7)), [{ nazwa: 'l/100 km', kolor: 'var(--org)', dane: pom.map(x => x.zuz) }], 120) + '</div>';

    const M = miesiace(6), et = M.map(m => MSC[+m.slice(5) - 1]);
    h += '<div class="card"><h3>' + I('money', 1) + 'Paliwo w miesiącu, zł</h3>' +
      slupki(et, [{ nazwa: 'zł', kolor: 'var(--c2)', dane: M.map(m => Math.round(p.filter(x => x.d.slice(0, 7) === m).reduce((a, x) => a + x.zl, 0))) }], 110) + '</div>';

    h += '<div class="card"><h3>' + I('history', 1) + 'Tankowania</h3>' + p.slice().reverse().slice(0, 30).map(x =>
      '<div class="row"><div class="g"><b>' + dt(x.d) + '</b>' + (x.g ? ' <span class="mute">' + esc(x.g) + '</span>' : '') +
      (x.pelny ? '' : ' <span class="pill y">niepełny</span>') +
      '<div class="mute">' + esc([x.km ? lic(x.km) + ' km' : '', x.stacja, x.rej].filter(Boolean).join(' · ')) + '</div></div>' +
      '<div style="text-align:right"><b>' + z2(x.l) + ' l</b><div class="mute">' + z2(x.zl) + ' zł' + (x.zuz ? ' · ' + z2(x.zuz) + ' l/100' : '') + '</div></div></div>').join('') + '</div>';
    return h;
  }

  window.MODULY = window.MODULY || {};
  window.MODULY.paliwo = { widok: widok };
})();
