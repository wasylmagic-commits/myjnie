/* zamow.js – Zamówienia do magazyniera (17.11.2026).
 * Lista „Do zamówienia” = (1) części z Magazynu w aucie poniżej progu (kolumna Minimum; ma być tyle, ile „Docelowo” w arkuszu Magazyn plan)
 *                         + (2) zadania „Biuro”, które są zamówieniem (dokumenty / wysyłka – pomijane; zbędne można skreślić).
 * „Do kupienia” tu NIE trafia – to kupuje się w sklepie.
 * Serwisant skreśla, poprawia ilości → „Kopiuj tekst” (wkleja sam w SMS do magazyniera) → wraca i „Zamówione”.
 * Zużycie: z raportów (bot zdejmuje z Magazynu). Dostawa: PDF biura albo przycisk „Przyszło” (z poprawką ilości).
 * Zamówienie bez dostawy po 30 dniach wraca na listę jako „nie dotarło?”.
 * Kafel na Dziś zmienia kolor, ale NIE rusza światła dnia.
 */
(function () {
  const DNI_CZEKANIA = 30;
  const KLASY = { krytyczna: ['r', 'krytyczna', 'zatrzyma myjnię'], 'częsta': ['o', 'częsta', 'często się zużywa'], 'zwykła': ['', 'zwykła', 'rzadko'] };
  const KOL = { krytyczna: 0, 'częsta': 1, 'zwykła': 2 };
  const num = s => +String(s == null ? '' : s).replace(/\s/g, '').replace(',', '.') || 0;
  const NIE_ZAMOWIENIE = /wysla|wysyl|zawiez|zawioz|dokument|protokol|faktur|poczt|oddac|odda|odebra|podpis|przekaz|rozlicz|druk|przygotow|zdani|zdac|busa|samochod|przeglad auta/;

  // stan lokalny: skreślenia, ilości, skopiowany tekst, odbiorca, podpis
  const ST = (() => { try { return JSON.parse(LS.get('zam') || '{}'); } catch (e) { return {}; } })();
  ST.skr = ST.skr || {}; ST.ile = ST.ile || {}; ST.dod = ST.dod || [];
  // 17.11.2026: stan listy (skreślone, ilości, dopisane, skopiowany tekst) wspólny dla wszystkich urządzeń – api=mgStan (Zamowienia.gs, łatka zam_stan)
  let wyslijT = null, bezStanu = false, widziany = '';
  const zapisz = () => {
    ST.ts = Date.now(); LS.set('zam', JSON.stringify(ST));
    if (bezStanu) return;
    clearTimeout(wyslijT);
    wyslijT = setTimeout(() => {
      const k = ST.kopia && ST.kopia.poz ? { t: ST.kopia.t, poz: ST.kopia.poz } : undefined;
      api('mgStan', { s: JSON.stringify({ ts: ST.ts, skr: ST.skr, ile: ST.ile, dod: ST.dod, naz: ST.naz, kopia: k, imie: ST.imie, podpis: ST.podpis }) })
        .catch(e => { if (/Nieznana|akcja/i.test(e.message)) bezStanu = true; });
    }, 1200);
  };
  function scal() {
    const s = D && D.zamStan; if (!s || s === widziany) return; widziany = s;
    let r; try { r = JSON.parse(s); } catch (e) { return; }
    if (!r || (+r.ts || 0) <= (+ST.ts || 0)) return;
    ['skr', 'ile', 'dod', 'naz', 'kopia', 'imie', 'podpis'].forEach(k => { if (r[k] === undefined) delete ST[k]; else ST[k] = r[k]; });
    ST.skr = ST.skr || {}; ST.ile = ST.ile || {}; ST.dod = ST.dod || []; ST.ts = r.ts;
    LS.set('zam', JSON.stringify(ST));
  }
  const imie = () => ST.imie || 'Andrzej';
  const podpis = () => ST.podpis || 'Wasyl Tomczakowski';

  const wiek = d => d ? Math.round((new Date(dzisIso()) - new Date(d)) / 864e5) : 0;
  const zalegle = z => wiek(z.d) > DNI_CZEKANIA && z.dost < z.ilosc;
  const zamowienia = () => (D && D.zamowienia) || [];
  const plan = () => { const m = {}; ((D && D.plan) || []).forEach(p => m[p.kod] = p); return m; };

  // 17.11.2026 (2): słownik części – moje słowa → kod i nazwa katalogowa (uczy się przy „To ta część”)
  const slownik = () => (D && D.slownik) || [];
  const zeSlownika = n => { const q = pl(n).replace(/[^a-z0-9]+/g, ' ').trim(); return slownik().find(x => pl(x.slowa).replace(/[^a-z0-9]+/g, ' ').trim() === q); };
  const slowa = n => pl(n).split(/[^a-z0-9]+/).filter(w => w.length >= 4).map(w => w.slice(0, 5));
  const podobne = (a, b) => { const B = slowa(b); return slowa(a).filter(w => B.indexOf(w) >= 0).length; };

  window.zamPozycja = function (m) {
    const p = plan()[m.kod];
    const doc = p ? +p.docelowo || 0 : num(m.min), prog = num(m.min) || doc;
    return { klasa: p ? p.klasa : 'zwykła', doc: doc, prog: prog, stan: num(m.ilosc) };
  };

  // co trzeba zamówić teraz
  window.zamLista = function () {
    scal();
    if (!D) return [];
    const out = [], czeka = {}, stare = {};
    zamowienia().forEach(z => {
      const brak = Math.max(0, z.ilosc - z.dost);
      if (!z.kod) return;
      if (zalegle(z)) (stare[z.kod] = stare[z.kod] || []).push(z.id); else czeka[z.kod] = (czeka[z.kod] || 0) + brak;
    });
    (D.magazyn || []).forEach(m => {
      const x = zamPozycja(m);
      if (!x.doc) return;
      const w = czeka[m.kod] || 0;
      if (x.stan + w >= x.prog) return;
      out.push({ k: 'm:' + m.kod, kod: m.kod, nazwa: m.nazwa, ilosc: Math.max(1, x.doc - x.stan - w), klasa: x.klasa, stan: x.stan, doc: x.doc,
        pilne: x.klasa === 'krytyczna' && x.stan <= 0, zero: x.stan <= 0, nieDotarlo: !!stare[m.kod], ponow: stare[m.kod] || [] });
    });
    // 25.11.2026: „Magazyn bez numeru” z docelowo: stan niższy niż ma być → do zamówienia (zamówienia bez numeru łączą się po nazwie)
    const czekaBn = {};
    zamowienia().forEach(z => { if (z.kod) return; const k = pl(z.nazwa); czekaBn[k] = (czekaBn[k] || 0) + Math.max(0, z.ilosc - z.dost); });
    (D.magBez || []).forEach(b => {
      if (!(b.doc > 0)) return;
      const w = czekaBn[pl(b.nazwa)] || 0;
      if (b.ilosc + w >= b.doc) return;
      out.push({ k: 'b:' + b.id, kod: '', nazwa: b.nazwa, ilosc: Math.max(1, b.doc - b.ilosc - w), klasa: '', stan: b.ilosc, doc: b.doc, zero: b.ilosc <= 0, bn: true });
    });
    zamowienia().filter(z => !z.kod && zalegle(z)).forEach(z => out.push({ k: 'z:' + z.id, kod: '', nazwa: z.nazwa, ilosc: Math.max(1, z.ilosc - z.dost), klasa: '',
      nieDotarlo: true, ponow: [z.id] }));
    (D.ogony || []).filter(o => open_(o) && window.czyZamowienie(o)).forEach(o => {
      const ile = +((String(o.czesci || '').match(/×\s*(\d+)/) || [])[1]) || 1;
      const t = o.termin ? dni(o.termin) : null;
      const nz = String(o.opis || '').replace(/^\s*(zam[oó]wienie|zam[oó]wi[cć]|zam[oó]w|zakaza[tć]\S*|закаж\S*|заказ\S*)(\s*:\s*|\s+)/i, '').replace(/[.\s]+$/, '');
      out.push({ k: 'o:' + o.id, kod: '', nazwa: nz ? nz.charAt(0).toUpperCase() + nz.slice(1) : o.opis, ilosc: ile, klasa: '', zadanie: o.id, myjnia: o.myjnia, termin: o.termin, pilne: t != null && t <= 2 });
    });
    ST.dod.forEach(d => { const jest = d.kod && out.find(x => x.kod === d.kod);
      if (jest) { jest.ilosc += d.ilosc || 1; jest.dod = (jest.dod || []).concat([d.k]); return; }
      out.push({ k: d.k, kod: d.kod || '', nazwa: d.nazwa, ilosc: d.ilosc || 1, klasa: '', dodane: true }); });
    out.forEach(x => { if (!x.kod && (x.zadanie || x.dodane)) { const s = zeSlownika(x.nazwa); if (s) { x.kod = s.kod; if (s.nazwa) x.nazwa = s.nazwa; x.zeSlownika = true; } } });
    out.forEach(x => { if (ST.ile[x.k]) x.ilosc = ST.ile[x.k]; if (ST.naz && ST.naz[x.k]) x.nazwa = ST.naz[x.k]; x.skr = !!ST.skr[x.k]; });
    return out.sort((a, b) => (b.pilne ? 1 : 0) - (a.pilne ? 1 : 0) || (a.zadanie ? 1 : 0) - (b.zadanie ? 1 : 0) ||
      (KOL[a.klasa] ?? 3) - (KOL[b.klasa] ?? 3) || String(a.nazwa).localeCompare(String(b.nazwa)));
  };

  // 17.11.2026: typ ręczny (edycja zadania): „do zamówienia” = zawsze zamówienie, „do wysłania” = nigdy; „do biura” – po słowach jak dotąd
  window.czyZamowienie = o => o.typ === 'do zamówienia' || (o.typ !== 'do wysłania' && kat(o) === 'biuro' && !NIE_ZAMOWIENIE.test(pl(o.opis)));

  const wDrodze = () => zamowienia().filter(z => z.dost < z.ilosc);

  function tekst(l) {
    const NL = '\n';
    return 'Cześć ' + imie() + ',' + NL + 'proszę o wysłanie:' + NL +
      l.map((x, i) => (i + 1) + '. ' + (x.kod ? x.kod + ' – ' : '') + x.nazwa + ' – ' + x.ilosc + ' szt.' + (x.pilne ? ' – PILNE' : '')).join(NL) +
      NL + NL + 'Pozdrawiam' + NL + podpis();
  }

  // stan kafla: kopia (szary) > do zamówienia (bursztyn) > w drodze (turkus) > nic (grafit)
  window.zamStan = function () {
    const l = zamLista(), w = wDrodze();
    if (ST.kopia && ST.kopia.poz && ST.kopia.poz.length) return { kl: 'zs', b: 'potwierdź', t: 'tekst skopiowany – zamówione?' };
    if (l.length) { const kr = l.filter(x => x.zero && x.klasa === 'krytyczna').length; return { kl: 'o', b: l.length + ' do zamówienia', t: kr ? kr + ' krytyczne na zero' : 'magazyn i biuro' }; }
    if (w.length) return { kl: 'zt', b: w.length + ' w drodze', t: 'czekam na dostawę' };
    return { kl: 'zg', b: 'Zamówienia', t: 'magazyn w komplecie' };
  };
  window.kafelZamow = function () {
    const s = zamStan();
    return '<div class="tile" style="cursor:pointer" onclick="go(\'zamow\')"><div class="ch ' + s.kl + '">' + I('box') + '</div><div><b style="font-size:20px">' + esc(s.b) + '</b><span>' + esc(s.t) + '</span></div></div>';
  };

  function wiersz(x) {
    const kl = KLASY[x.klasa], wt = ST.kopia && (ST.kopia.poz || []).some(p => p.k === x.k);
    return '<div class="row zr' + (x.skr ? ' skr' : '') + (wt ? ' wt' : '') + '">' +
      '<button class="zk zx" aria-label="Usuń z listy" onclick="zamUsun(\'' + jsq(x.k) + '\')">' + I('trash', 1) + '</button>' +
      '<div class="g"><b onclick="zamNazwa(\'' + jsq(x.k) + '\')" style="cursor:text">' + esc(x.nazwa) + '</b>' + (window.opisLinia && x.kod ? opisLinia(x.kod) : '') +
      '<div class="mute">' + (x.kod && !x.dodane ? esc(x.kod) + ' · ' : '') + (x.zadanie ? '<span class="edl" onclick="edytujZad(\'' + jsq(x.zadanie) + '\')">' + I('edit', 1) + ' zadanie #' + esc(x.zadanie) + '</span>' + (x.myjnia ? ' · ' + esc(skrot(x.myjnia)) : '') : x.dodane ? (x.kod ? esc(x.kod) + ' · ' : '') + 'dodane ręcznie' : x.kod && x.doc ? 'jest ' + x.stan + ' z ' + x.doc : 'zamówione wcześniej – nie przyszło') +
      (x.termin ? ' · termin ' + dt(x.termin) : '') + '</div>' +
      '<div class="zp">' + (x.pilne ? '<span class="pill r">pilne</span>' : x.zero ? '<span class="pill r">brak w aucie</span>' : '') +
      (kl ? '<span class="pill ' + kl[0] + '">' + kl[1] + '</span>' : '') + (x.nieDotarlo ? '<span class="pill o">nie dotarło?</span>' : '') +
      (x.bn ? '<span class="pill">bez numeru</span>' : '') + (wt ? '<span class="pill">w tekście</span>' : '') + (x.zeSlownika ? '<span class="pill ok">numer ze słownika</span>' : '') + '</div></div>' +
      '<div class="zl"><button class="ib" onclick="zamIle(\'' + jsq(x.k) + '\',-1)">−</button><b>' + x.ilosc + '</b><button class="ib" onclick="zamIle(\'' + jsq(x.k) + '\',1)">+</button></div></div>';
  }

  function widok(wewn) {
    const l = zamLista(), wyb = l.filter(x => !x.skr), w = wDrodze(), ukr = l.length - wyb.length;
    // 17.11.2026: zamówienia mają własną podzakładkę w Zadania (wewn = bez nagłówka „wstecz”, z kartą „Nowe zamówienie” u góry)
    let h = wewn ? '<div class="card"><h3>' + I('plus', 1) + 'Nowe zamówienie</h3><div class="mute" style="margin-bottom:8px">Własnymi słowami albo z podpowiedzi (numer z magazynu / słownika).</div>' +
      '<button class="btn" style="width:100%;justify-content:center" onclick="zamDodaj()">+ Dodaj pozycję</button></div>' : naglowek('box', 'Zamówienia', 'tekst do magazyniera');
    if (ST.kopia && ST.kopia.poz && ST.kopia.poz.length) {
      const d = new Date(ST.kopia.t);
      h += '<div class="card zkop"><h3>' + I('clock', 1) + 'Tekst skopiowany ' + d.toLocaleDateString('pl-PL') + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') +
        ' · ' + ST.kopia.poz.length + ' poz.</h3><div class="mute" style="margin-bottom:10px">Wysłałeś SMS do magazyniera? Potwierdź – te pozycje przejdą do „W drodze”.</div>' +
        '<div class="ab"><button class="btn" id="zamOk" onclick="zamZamowione()">' + I('check', 1) + ' Zamówione</button><button class="btn2" onclick="zamNieWyslane()">Nie wysłałem</button></div></div>';
    }
    h += '<div class="card"><h3>' + I('cart', 1) + 'Do zamówienia (' + wyb.length + ')</h3>' +
      (wyb.length ? wyb.map(wiersz).join('') + '<div class="mute" style="font-size:13px;margin-top:6px">' + I('trash', 1) + ' albo − przy 1 szt. = usuń z tego zamówienia (wróci przy następnym). Dotknij nazwy, żeby ją poprawić.</div>'
        : '<div class="empty">Nic do zamówienia – magazyn w komplecie</div>') +
      (ukr ? '<button class="btn2" style="width:100%;justify-content:center;margin-top:8px" onclick="zamPrzywroc()">Przywróć usunięte (' + ukr + ')</button>' : '') +
      (wewn ? '' : '<button class="btn2" style="width:100%;justify-content:center;margin-top:10px" onclick="zamDodaj()">+ Dodaj pozycję</button>') + '</div>';
    if (wyb.length) {
      h += '<div class="card"><h3>' + I('doc', 1) + 'Tekst SMS (' + wyb.length + ' poz.)</h3>' +
        '<div class="zod"><span>Do:</span><input class="as-in" value="' + esc(imie()) + '" onchange="zamUstaw(\'imie\',this.value)"><span>Podpis:</span><input class="as-in" value="' + esc(podpis()) + '" onchange="zamUstaw(\'podpis\',this.value)"></div>' +
        '<textarea id="zamTxt" rows="' + Math.min(16, wyb.length + 6) + '">' + esc(tekst(wyb)) + '</textarea>' +
        '<button class="btn" style="width:100%" onclick="zamKopiuj()">' + I('doc', 1) + ' Kopiuj tekst</button>' +
        '<div class="mute" style="font-size:13px;margin-top:8px">Wklej w SMS do magazyniera, wyślij, potem wróć i naciśnij „Zamówione”.</div></div>';
    }
    if (w.length) h += '<div class="card"><h3>' + I('route', 1) + 'W drodze (' + w.length + ')</h3>' + '<button class="btn" style="width:100%;margin-bottom:6px" onclick="przyjecieOtworz()">' + I('check', 1) + ' Przyjęcie dostawy</button>' + w.map(z =>
      '<div class="row"><div class="g"><b>' + esc(z.nazwa) + '</b><div class="mute">' + (z.kod ? esc(z.kod) + ' · ' : '') + 'zamówione ' + dt(z.d) + ' · ' + z.ilosc + ' szt.' +
      (z.dost ? ' · doszło ' + z.dost : '') + '</div>' + (!z.kod ? podpowiedz(z) : '') + (zalegle(z) ? '<div class="zp"><span class="pill o">nie dotarło? ' + wiek(z.d) + ' dni</span></div>' : '') + '</div>' +
      '<div class="zl" style="flex-direction:column;gap:6px"><button class="btn2" onclick="zamPrzyszlo(\'' + jsq(z.id) + '\')">Przyszło</button><button class="btn2 zan" onclick="zamAnuluj(\'' + jsq(z.id) + '\')">Anuluj</button></div></div>').join('') +
      '<div class="mute" style="font-size:13px;margin-top:6px">Dostawa liczy się sama z PDF „Stany magazynowe”. „Przyszło” – jeśli chcesz od razu.</div></div>';
    return h;
  }

  // zamówienie bez numeru: co z nowych dostaw (PDF) może nim być
  function podpowiedz(z) {
    const k = ((D && D.nowosci) || []).filter(n => n.d >= z.d).map(n => ({ n: n, p: podobne(z.nazwa, n.nazwa) })).filter(x => x.p > 0).sort((a, b) => b.p - a.p).slice(0, 2);
    return '<div class="zp" style="flex-direction:column;align-items:flex-start;gap:6px;margin-top:6px">' + k.map(x =>
      '<button class="btn2" style="font-size:13px;min-height:30px" onclick="zamPolacz(\'' + jsq(z.id) + '\',\'' + jsq(x.n.kod) + '\',\'' + jsq(x.n.nazwa) + '\')">To ta część? ' + esc(x.n.kod) + ' ' + esc(x.n.nazwa) + '</button>').join('') +
      '<button class="btn2 zan" style="font-size:13px;min-height:30px" onclick="zamWybierz(\'' + jsq(z.id) + '\')">Przypisz numer…</button></div>';
  }

  // + Dodaj pozycję: własnymi słowami albo z podpowiedzi (Magazyn, słownik); dopisana do skopiowanego tekstu, jeśli czeka na „Zamówione”
  let SZ = { q: '', ile: 1, kod: '', nazwa: '', cel: null };
  // 17.11.2026: dopasowanie słów po początku wyrazu (dysz ~ dyszy, pomp ~ pompa); wynik = ile słów pasuje, najlepsze na górze
  const traf = (q, t) => { const T = pl(t).split(/[^a-z0-9]+/).filter(Boolean); return pl(q).split(/[^a-z0-9]+/).filter(w => w.length >= 3)
    .filter(w => T.some(x => x.indexOf(w) === 0 || w.indexOf(x) === 0 && x.length >= 4 || (w.length >= 4 && x.length >= 4 && w.slice(0, 4) === x.slice(0, 4)))).length; };
  function kandydaci(q) {
    if (pl(q).trim().length < 2) return [];
    const l = [], wid = {};
    const dodaj = (kod, nazwa, zr, sc) => { if (!kod || wid[kod]) return; wid[kod] = 1; l.push({ kod: kod, nazwa: nazwa, zr: zr, sc: sc || 0 }); };
    const qn = q.toLowerCase().replace(/[\s.\/-]/g, '');
    slownik().forEach(x => { const s = traf(q, x.slowa + ' ' + x.nazwa); if (s || (qn.length >= 4 && x.kod.toLowerCase().indexOf(qn) >= 0)) dodaj(x.kod, x.nazwa || x.slowa, 'słownik', s + 0.5); });
    ((D && D.magazyn) || []).forEach(m => { const s = traf(q, m.nazwa + ' ' + (window.opisTxt ? opisTxt(m.kod) : '')); if (s || (qn.length >= 4 && m.kod.toLowerCase().replace(/[\s.\/-]/g, '').indexOf(qn) >= 0)) dodaj(m.kod, m.nazwa, 'magazyn', s); });
    ((D && D.nowosci) || []).forEach(n => { const s = traf(q, n.nazwa); if (s) dodaj(n.kod, n.nazwa, 'przyszło', s); });
    return l.sort((a, b) => b.sc - a.sc).slice(0, 8);
  }
  function arkDodaj() {
    const a = document.getElementById('ark'), wyb = SZ.cel;
    const lista = kandydaci(SZ.q).map(x => '<div class="row" style="cursor:pointer" onclick="zamKand(\'' + jsq(x.kod) + '\',\'' + jsq(x.nazwa) + '\')"><div class="g">' + esc(x.nazwa) +
      '<div class="mute">' + esc(x.kod) + ' · ' + x.zr + '</div></div>' + (SZ.kod === x.kod ? I('check', 1) : '') + '</div>').join('');
    a.innerHTML = '<div class="tlo" onclick="arkZamknij()"></div><div class="ar" style="max-height:86vh;overflow:auto"><h4>' + (wyb ? 'Numer dla: ' + esc(wyb.nazwa) : 'Dodaj pozycję') + '</h4>' +
      '<input id="zamQ" placeholder="' + (wyb ? 'Szukaj w magazynie / słowniku' : 'Nazwa własnymi słowami, np. pompa dozująca BIOXX') + '" value="' + esc(SZ.q) + '" oninput="zamQ(this.value)">' +
      (SZ.kod ? '<div class="mute" style="margin:-6px 0 8px">Wybrano: <b>' + esc(SZ.kod) + '</b> ' + esc(SZ.nazwa) + ' <a href="#" onclick="zamKand(\'\',\'\');return false">(bez numeru)</a></div>' : '') +
      '<div id="zamK">' + (lista ? '<div class="mute" style="font-size:13px">Podpowiedzi – dotknij, żeby wziąć numer i nazwę:</div>' + lista : '') + '</div>' +
      (wyb ? '' : '<div class="row"><div class="g">Ilość</div><div class="zl"><button class="ib" onclick="zamDodIle(-1)">−</button><b>' + SZ.ile + '</b><button class="ib" onclick="zamDodIle(1)">+</button></div></div>') +
      '<div class="ab" style="margin-top:12px"><button class="btn" onclick="' + (wyb ? 'zamWybierzOk()' : 'zamDodajOk()') + '"' + (wyb && !SZ.kod ? ' disabled' : '') + '>' + (wyb ? 'To ta część' : 'Dodaj') + '</button><button class="btn2" onclick="arkZamknij()">Anuluj</button></div></div>';
    a.classList.add('on');
  }
  window.zamDodaj = () => { SZ = { q: '', ile: 1, kod: '', nazwa: '', cel: null }; arkDodaj(); setTimeout(() => { const e = document.getElementById('zamQ'); if (e) e.focus(); }, 50); };
  window.zamQ = v => { SZ.q = v; if (!SZ.cel) { SZ.kod = ''; SZ.nazwa = ''; } const k = document.getElementById('zamK'), l = kandydaci(v);
    if (k) k.innerHTML = l.length ? '<div class="mute" style="font-size:13px">Podpowiedzi – dotknij, żeby wziąć numer i nazwę:</div>' + l.map(x => '<div class="row" style="cursor:pointer" onclick="zamKand(\'' + jsq(x.kod) + '\',\'' + jsq(x.nazwa) + '\')"><div class="g">' + esc(x.nazwa) + '<div class="mute">' + esc(x.kod) + ' · ' + x.zr + '</div></div></div>').join('') : ''; };
  window.zamKand = (kod, nazwa) => { SZ.kod = kod; SZ.nazwa = nazwa; arkDodaj(); };
  window.zamDodIle = d => { SZ.ile = Math.max(1, SZ.ile + d); arkDodaj(); };
  window.zamDodajOk = function () {
    const n = (SZ.nazwa || SZ.q).trim(); if (!n) { toast('Wpisz nazwę'); return; }
    const d = { k: 'd:' + Date.now(), kod: SZ.kod, nazwa: n, ilosc: SZ.ile };
    ST.dod.push(d);
    if (ST.kopia && ST.kopia.poz) ST.kopia.poz.push({ k: d.k, kod: d.kod, nazwa: d.nazwa, ilosc: d.ilosc, zadanie: '', ponow: [] });
    zapisz(); arkZamknij(); render(); toast(ST.kopia ? 'Dodane – wejdzie do „Zamówione”' : 'Dodane do tekstu');
  };
  window.zamUsunDod = k => { ST.dod = ST.dod.filter(d => d.k !== k); if (ST.kopia && ST.kopia.poz) ST.kopia.poz = ST.kopia.poz.filter(p => p.k !== k); zapisz(); render(); };
  window.zamWybierz = id => { const z = zamowienia().find(x => String(x.id) === String(id)); if (!z) return; SZ = { q: z.nazwa, ile: 1, kod: '', nazwa: '', cel: z }; arkDodaj(); };
  window.zamWybierzOk = () => { if (SZ.cel && SZ.kod) zamPolacz(SZ.cel.id, SZ.kod, SZ.nazwa); };
  window.zamPolacz = function (id, kod, nazwa) {
    api('mgPolacz', { id: id, kod: kod, nazwa: nazwa }).then(j => {
      const z = zamowienia().find(x => String(x.id) === String(id));
      if (z) { (D.slownik = D.slownik || []).push({ slowa: z.nazwa, kod: kod, nazwa: nazwa }); z.kod = kod; z.dost = (j.wynik && j.wynik.dost) || 0; if (z.dost >= z.ilosc) D.zamowienia = zamowienia().filter(x => x !== z); }
      arkZamknij(); render(); toast('Zapamiętane: ' + kod + ' – następnym razem podpowiem');
    }).catch(blad);
  };

  window.zamSkresl = k => { if (ST.skr[k]) delete ST.skr[k]; else ST.skr[k] = 1; zapisz(); render(); };
  window.zamIle = (k, d) => { const x = zamLista().find(y => y.k === k); if (!x) return; if (x.ilosc + d < 1) return zamUsun(k); ST.ile[k] = x.ilosc + d; zapisz(); render(); };
  // 17.11.2026: kosz (i − przy 1 szt.) = pozycja znika z listy; zadanie/zapas nie jest zamykane, „Przywróć usunięte” cofa
  window.zamUsun = function (k) {
    const x = zamLista().find(y => y.k === k); if (!x) return;
    if (x.dodane || (x.dod || []).length) {
      const rm = [k].concat(x.dod || []);
      ST.dod = ST.dod.filter(d => rm.indexOf(d.k) < 0);
      if (ST.kopia && ST.kopia.poz) ST.kopia.poz = ST.kopia.poz.filter(p => p.k !== k);
    }
    if (!x.dodane) ST.skr[k] = 1;
    delete ST.ile[k]; zapisz(); render(); toast('Usunięto z listy');
  };
  window.zamPrzywroc = () => { ST.skr = {}; zapisz(); render(); };
  // 17.11.2026: dotknij nazwy → popraw (np. Pompa głębinowa zamiast Pompy głębinowej); zapamiętane do Zamówione
  window.zamNazwa = k => { const x = zamLista().find(y => y.k === k); if (!x) return; const v = prompt('Nazwa w SMS:', x.nazwa); if (v == null) return; ST.naz = ST.naz || {}; if (v.trim()) ST.naz[k] = v.trim(); else delete ST.naz[k]; zapisz(); render(); };
  window.zamUstaw = (pole, v) => { ST[pole] = String(v || '').trim(); zapisz(); render(); };

  function kopiuj(t) {
    const awaryjnie = () => { const e = document.getElementById('zamTxt'); if (e) { e.focus(); e.select(); } try { return document.execCommand('copy'); } catch (er) { return false; } };
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).then(() => true, awaryjnie);
    return Promise.resolve(awaryjnie());
  }
  window.zamKopiuj = function () {
    const e = document.getElementById('zamTxt'), wyb = zamLista().filter(x => !x.skr);
    if (!e || !wyb.length) return;
    kopiuj(e.value).then(ok => {
      ST.kopia = { t: Date.now(), poz: wyb.map(x => ({ k: x.k, kod: x.kod, nazwa: x.nazwa, ilosc: x.ilosc, zadanie: x.zadanie || '', ponow: x.ponow || [], dod: x.dod || [] })) };
      zapisz(); render();
      toast(ok ? 'Skopiowane – wklej w SMS do ' + imie() : 'Zaznaczone – skopiuj ręcznie (przytrzymaj)');
    });
  };
  // 17.11.2026: po powrocie z SMS-a aplikacja sama pyta „Zamówione?” (raz na skopiowany tekst)
  function pytaj() {
    scal();
    const k = ST.kopia; if (!k || !k.poz || !k.poz.length || k.pyt || Date.now() - k.t < 8000 || Date.now() - k.t > 36e5 * 24) return;
    const a = document.getElementById('ark'); if (!a) return;
    k.pyt = 1; zapisz();
    a.innerHTML = '<div class="tlo" onclick="arkZamknij()"></div><div class="ar"><h4>' + I('cart', 1) + ' Wysłałeś SMS do ' + esc(imie()) + '?</h4>' +
      '<div class="mute" style="margin-bottom:10px">Skopiowany tekst: ' + k.poz.length + ' poz. Potwierdź, żeby na innych telefonach zamówienie nie wisiało.</div>' +
      '<div class="ab"><button class="btn" onclick="arkZamknij();zamZamowione()">' + I('check', 1) + ' Zamówione</button><button class="btn2" onclick="arkZamknij();zamNieWyslane()">Nie wysłałem</button><button class="btn2" onclick="arkZamknij()">Później</button></div></div>';
    a.classList.add('on');
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { if (ST.kopia && !ST.kopia.pyt) ST.kopia.ukryte = 1; zapisz(); } else if (ST.kopia && ST.kopia.ukryte) setTimeout(pytaj, 600); });
  setTimeout(pytaj, 3500); setTimeout(pytaj, 9000);
  window.zamNieWyslane = () => { delete ST.kopia; zapisz(); render(); toast('OK, lista bez zmian'); };

  const blad = e => toast(/Nieznana|akcja/i.test(e.message) ? 'Najpierw zainstaluj aktualizację bota (/aktualizuj)' : 'Błąd: ' + e.message);
  window.zamZamowione = function () {
    const k = ST.kopia; if (!k || !k.poz) return;
    const b = document.getElementById('zamOk'); if (b) b.disabled = true;
    const poz = k.poz.map(x => ({ kod: x.kod, nazwa: x.nazwa, ilosc: x.ilosc, zadanie: x.zadanie }));
    const ponow = [].concat.apply([], k.poz.map(x => x.ponow || []));
    api('mgZamow', { poz: JSON.stringify(poz), ponow: JSON.stringify(ponow) }).then(() => {
      const d = dzisIso();
      D.zamowienia = (D.zamowienia || []).filter(z => ponow.indexOf(z.id) < 0)
        .concat(poz.map((x, i) => ({ id: 'n' + Date.now() + i, d: d, kod: x.kod, nazwa: x.nazwa, ilosc: x.ilosc, dost: 0, zadanie: x.zadanie })));
      poz.forEach(x => { if (!x.zadanie) return; const o = D.ogony.find(y => String(y.id) === String(x.zadanie)); if (o) { o.status = 'zamknięty'; o.zamkn = d; } });
      k.poz.forEach(x => { delete ST.skr[x.k]; delete ST.ile[x.k]; if (ST.naz) delete ST.naz[x.k]; });
      ST.dod = ST.dod.filter(d => !k.poz.some(p => p.k === d.k || (p.dod || []).indexOf(d.k) >= 0));
      delete ST.kopia; ST.skr = {}; zapisz(); render();
      toast('Zamówione: ' + poz.length + ' poz. – czekam na dostawę');
    }).catch(e => { if (b) b.disabled = false; blad(e); });
  };

  window.zamPrzyszlo = function (id) {
    const z = zamowienia().find(x => String(x.id) === String(id)); if (!z) return;
    const a = document.getElementById('ark'), reszta = Math.max(1, z.ilosc - z.dost);
    a.innerHTML = '<div class="tlo" onclick="arkZamknij()"></div><div class="ar"><h4>Przyszło: ' + esc(z.nazwa) + '</h4>' +
      '<div class="mute" style="font-size:14px">Zamówione ' + z.ilosc + ' szt.' + (z.dost ? ', doszło już ' + z.dost : '') + '. Ile przyszło teraz?' + (z.kod ? ' Stan w Magazynie zwiększy się od razu.' : '') + '</div>' +
      '<div class="zl" style="justify-content:center;margin:14px 0"><button class="ib" onclick="zamPrzN(-1)">−</button><b id="zamN">' + reszta + '</b><button class="ib" onclick="zamPrzN(1)">+</button></div>' +
      '<div class="ab"><button class="btn" id="zamPb" onclick="zamPrzyszloOk(\'' + jsq(id) + '\')">Zapisz</button><button class="btn2" onclick="arkZamknij()">Anuluj</button></div></div>';
    a.classList.add('on');
  };
  window.zamPrzN = d => { const e = document.getElementById('zamN'); e.textContent = Math.max(1, +e.textContent + d); };
  window.zamPrzyszloOk = function (id) {
    const n = +document.getElementById('zamN').textContent;
    const z = zamowienia().find(x => String(x.id) === String(id)), m = z && z.kod && (D.magazyn || []).find(x => x.kod === z.kod);
    const staraDost = z && z.dost, staraIl = m && m.ilosc, staraLista = D.zamowienia;
    if (z) {
      z.dost = Math.min(z.ilosc, (z.dost || 0) + n);
      if (m) m.ilosc = String(num(m.ilosc) + n);
      if (z.dost >= z.ilosc) D.zamowienia = zamowienia().filter(x => x !== z);
    }
    arkZamknij(); render(); toast('Zapisane: +' + n + ' szt.');
    // dodaje sztuki, więc bez automatycznego powtarzania; przy błędzie wracamy do stanu sprzed zmiany
    apiTlo('mgPrzyszlo', { id: id, n: n }, {
      nazwa: 'Przyjęcie części',
      ok: j => { if (z && j.wynik && j.wynik.dost) { z.dost = Math.min(z.ilosc, j.wynik.dost); render(); } },
      cofnij: () => { if (z) z.dost = staraDost; if (m) m.ilosc = staraIl; D.zamowienia = staraLista; render(); }
    });
  };
  window.zamAnuluj = function (id) {
    const z = zamowienia().find(x => String(x.id) === String(id)); if (!z) return;
    api('mgAnuluj', { id: id }).then(() => { D.zamowienia = zamowienia().filter(x => x !== z); render(); toast('Anulowane: ' + z.nazwa); }).catch(blad);
  };

  // Magazyn → dotknij część: klasa, ile ma być, próg zamówienia
  window.zamPlanEdytuj = function (kod) {
    const m = (D.magazyn || []).find(x => x.kod === kod); if (!m) return;
    const x = zamPozycja(m), a = document.getElementById('ark');
    window.__zp = { kod: kod, klasa: x.klasa, doc: x.doc || x.stan || 1, prog: x.prog || x.doc || 1 };
    const rys = () => {
      const p = window.__zp;
      a.innerHTML = '<div class="tlo" onclick="arkZamknij()"></div><div class="ar"><h4>' + esc(m.nazwa) + '</h4><div class="mute" style="font-size:14px">' + esc(kod) + ' · teraz w aucie: ' + x.stan + '</div>' +
        '<h4 style="margin:14px 0 6px;font-size:15px">Ważność</h4><div class="seg">' + Object.keys(KLASY).map(k => '<button class="' + (p.klasa === k ? 'on' : '') + '" onclick="zamPl(\'klasa\',\'' + k + '\')">' + KLASY[k][1] + '</button>').join('') + '</div>' +
        '<div class="mute" style="font-size:13px;margin:-6px 0 10px">' + KLASY[p.klasa][2] + (p.klasa === 'krytyczna' ? ' – zamawiam po każdym zużyciu' : '') + '</div>' +
        '<div class="row"><div class="g">Ma być w aucie</div><div class="zl"><button class="ib" onclick="zamPl(\'doc\',-1)">−</button><b>' + p.doc + '</b><button class="ib" onclick="zamPl(\'doc\',1)">+</button></div></div>' +
        '<div class="row"><div class="g">Zamów, gdy mniej niż</div><div class="zl"><button class="ib" onclick="zamPl(\'prog\',-1)">−</button><b>' + p.prog + '</b><button class="ib" onclick="zamPl(\'prog\',1)">+</button></div></div>' +
        (window.opisSekcja ? opisSekcja(kod) : '') +
        '<div class="ab" style="margin-top:12px"><button class="btn" id="zamPlb" onclick="zamPlZapisz()">Zapisz</button><button class="btn2" onclick="arkZamknij()">Anuluj</button></div></div>';
      a.classList.add('on');
    };
    window.zamPl = (pole, v) => {
      const p = window.__zp;
      if (pole === 'klasa') { p.klasa = v; if (v === 'krytyczna') p.prog = p.doc; }
      else if (pole === 'doc') { p.doc = Math.max(0, p.doc + v); if (p.klasa === 'krytyczna' || p.prog > p.doc) p.prog = p.doc; }
      else p.prog = Math.max(0, Math.min(p.doc, p.prog + v));
      rys();
    };
    rys();
  };
  // 25.11.2026: okno zamyka się od razu, zapis idzie w tle (apiTlo w index.html); „ustaw wartości” można bezpiecznie powtarzać przy braku sieci
  window.zamPlZapisz = function () {
    const p = Object.assign({}, window.__zp); if (window.opisFlush) opisFlush();
    const m = D.magazyn.find(x => x.kod === p.kod), staraMin = m ? m.min : undefined, staryPlan = (D.plan || []).find(x => x.kod === p.kod);
    D.plan = (D.plan || []).filter(x => x.kod !== p.kod).concat([{ kod: p.kod, klasa: p.klasa, docelowo: p.doc }]);
    if (m) m.min = String(p.prog);
    arkZamknij(); render(); toast('Zapisane');
    apiTlo('mgPlan', { kod: p.kod, klasa: p.klasa, docelowo: p.doc, prog: p.prog }, {
      nazwa: 'Zapis ustawień części', powt: 3,
      cofnij: () => { D.plan = (D.plan || []).filter(x => x.kod !== p.kod).concat(staryPlan ? [staryPlan] : []); if (m) m.min = staraMin; render(); }
    });
  };
  // znaczek klasy w wierszu Magazynu (index.html → magLista)
  window.zamZnaczek = function (m) {
    const x = zamPozycja(m), kl = KLASY[x.klasa];
    return (x.klasa === 'krytyczna' && x.stan <= 0 ? '<span class="pill r">brak!</span> ' : '') + (kl && kl[0] ? '<span class="pill ' + kl[0] + '" style="font-size:11px;padding:2px 7px">' + kl[1] + '</span>' : '');
  };

  const css = document.createElement('style');
  css.textContent =
    '.tile .ch.zg{background:var(--kaf)} .tile .ch.zs{background:linear-gradient(160deg,#aeb4bb,#8a9097)} .tile .ch.zt{background:linear-gradient(160deg,#5fe0ff,#1fb6dc)}' +
    '.zr{align-items:flex-start;gap:10px} .zr .g b{font-weight:600} .zr.skr .g{opacity:.45;text-decoration:line-through} .zr.wt .g b{color:var(--mute)}' +
    '.zk{flex:0 0 auto;width:30px;height:30px;border-radius:50%;border:0;background:var(--acc2);color:var(--acc);display:flex;align-items:center;justify-content:center;cursor:pointer;margin-top:2px}' +
    '.zr.skr .zk{background:var(--fill);color:var(--mute)} .zk.zx{font-size:20px;line-height:1;background:var(--fill);color:var(--mute)}' +
    '.zp{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px} .zp .pill{font-size:11px;padding:2px 8px}' +
    '.zl{display:flex;align-items:center;gap:8px;flex:0 0 auto} .zl b{min-width:22px;text-align:center;font-size:18px} .zl .ib{width:32px;height:32px;font-size:20px;font-weight:600}' +
    '.zod{display:grid;grid-template-columns:auto 1fr;gap:6px 8px;align-items:center;margin-bottom:6px} .zod span{color:var(--mute);font-size:14px} .zod input.as-in{margin:0;padding:8px 12px;font-size:16px}' +
    '#zamTxt{font-size:15px;line-height:1.4} .zkop{background:var(--fill)} .btn2.zan{background:var(--fill);color:var(--mute)}';
  document.head.appendChild(css);

  window.MODULY = window.MODULY || {};
  window.MODULY.zamow = { widok: () => widok(false) };
  window.zamTresc = () => widok(true);   // zawartość podzakładki Zadania → Zamówienia
  window.zamLiczba = () => zamLista().filter(x => !x.skr).length;
})();
