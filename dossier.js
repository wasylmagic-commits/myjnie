// dossier.js – 27.11.2026 (wersja 2): dossier myjni = dane DO WYŚWIETLANIA. Adres, kod, miasto, model, typ, nr seryjny i e-mail wpisane tu leżą w osobnych
// kolumnach „(widoczna)” arkusza Stacje – system, raporty PDF i reszta aplikacji ich nie widzą (nic nie psuje). Pusta wartość = pokazujemy systemową.
// Prowadzący, telefony i notatki też tylko tu. Zapis: api=mgDosje (w tle, z cofnięciem). Dane: D.dosje = [{klucz, firma, sys:{}, wid:{}, prowadzacy, telefon, telefonProw, notatki, uwagi}].
(function () {
  const WID = ['ulica', 'kod', 'miasto', 'serial', 'model', 'typ', 'email'];
  const POLA = [
    ['ulica', 'Ulica i numer'], ['kod', 'Kod pocztowy'], ['miasto', 'Miasto'],
    ['serial', 'Nr seryjny'], ['model', 'Model myjni'], ['typ', 'Typ maszyny'],
    ['email', 'E-mail stacji'], ['prowadzacy', 'Prowadzący (imię i nazwisko)'],
    ['telefon', 'Telefon stacji'], ['telefonProw', 'Telefon prowadzącego'], ['notatki', 'Notatki']
  ];
  let ORYG = null;
  const tel = t => String(t || '').replace(/[^0-9+]/g, '');
  const wszystkie = () => (D.myjnie || []).concat(D.inne || []);
  // telefon stacji Orlen z numeru: SP1466 / „Orlen 1466” / „Orlen SP 466” → 24 256 + 4 cyfry (3 cyfry dopełniam zerem). Tylko podpowiedź, nic nie zapisuję.
  function telZNumeru(w, d) {
    const t = [(d && d.klucz) || '', w.klucz || '', w.nazwa || ''].join(' ');
    const m = t.match(/(?:^|[^A-Za-z0-9])(?:SP\s?|Orlen\s+(?:SP\s?)?)?([0-9]{3,4})(?![0-9])/i);
    if (!m || !/(^|[^A-Za-z])(SP|Orlen)/i.test(t)) return '';
    return '24 256 ' + ('0000' + m[1]).slice(-4);
  }
  const INNY = '__inny';

  function rekord(w) {
    return (D.dosje || []).find(d => (w.klucz && d.klucz === w.klucz) || d.firma === w.nazwa || sama(d.firma + ' ' + d.klucz, w)) || null;
  }
  // wartość systemowa pola (stacja z raportów albo arkusz Myjnie) i widoczna (wpisana tu)
  function wartosci(w) {
    const d = rekord(w) || {}, s = d.sys || {}, wd = d.wid || {};
    const sys = { ulica: s.ulica || w.adres || '', kod: s.kod || '', miasto: s.miasto || w.miasto || '', serial: s.serial || w.nrSeryjny || '',
                  model: s.model || w.model || '', typ: s.typ || '', email: s.email || '' };
    const v = { d: d, klucz: d.klucz || '', sys: sys, wid: wd };
    WID.forEach(k => { v[k] = wd[k] || sys[k] || ''; });
    ['prowadzacy', 'telefon', 'telefonProw', 'notatki'].forEach(k => { v[k] = d[k] || ''; });
    // typ pusty, a model znany → pokazuję typowy typ dla modelu (tylko wyświetlanie, nic nie zapisuję)
    v.typDomyslny = !v.typ && !!DOM_TYP[String(v.model || '').trim().toLowerCase()];
    if (v.typDomyslny) v.typ = DOM_TYP[String(v.model).trim().toLowerCase()];
    v.telWyliczony = !v.telefon ? telZNumeru(w, d) : '';
    if (v.telWyliczony) v.telefon = v.telWyliczony;
    return v;
  }
  // szara podpowiedź, gdy wpisana wartość różni się od systemowej
  const roznica = (v, k) => (v.wid[k] && v.sys[k] && v.wid[k].toLowerCase() !== v.sys[k].toLowerCase())
    ? '<div class="mute">w systemie: ' + esc(v.sys[k]) + '</div>' : '';
  const zadzwon = t => tel(t) ? '<a class="btn2" href="tel:' + esc(tel(t)) + '" style="text-decoration:none">' + I('phone') + 'Zadzwoń</a>' : '';

  // nagłówek widoku myjni: miasto i adres tak, jak wpisano w dossier (tylko wyświetlanie)
  window.dosjeNaglowek = function (w) {
    const v = wartosci(w);
    return [v.miasto, v.ulica].filter(Boolean).join(', ');
  };

  window.dosjeKarta = function (w) {
    const v = wartosci(w), adr = [v.ulica, [v.kod, v.miasto].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    const wiersz = (et, tresc, dod, przycisk) => '<div class="row"><div class="g">' + et + ': ' + tresc + (dod || '') + '</div>' + (przycisk || '') + '</div>';
    const adrRoz = ['ulica', 'kod', 'miasto'].map(k => roznica(v, k)).join('');
    let h = '<div class="card"><div class="row"><h3 style="flex:1;margin:0">' + I('doc', 1) + 'Dossier</h3>' +
            '<button class="btn2" onclick="dosjeEdytuj(\'' + jsq(w.nazwa) + '\')">' + I('pen', 1) + 'Edytuj</button></div>';
    h += wiersz('Adres', '<b>' + esc(adr || '—') + '</b>', adrRoz);
    h += wiersz('Nr seryjny', '<b>' + esc(v.serial || '—') + '</b>', roznica(v, 'serial'));
    h += wiersz('Model', '<b>' + esc([v.model, v.typ].filter(Boolean).join(' · ') || '—') + '</b>', roznica(v, 'model') + roznica(v, 'typ') + (v.typDomyslny ? '<div class="mute">typ typowy dla modelu – sprawdź przy okazji</div>' : ''));
    h += wiersz('E-mail', v.email ? '<a href="mailto:' + esc(v.email) + '"><b>' + esc(v.email) + '</b></a>' : '<b>—</b>', roznica(v, 'email'));
    h += wiersz('Prowadzący', '<b>' + esc(v.prowadzacy || '—') + '</b>');
    h += wiersz('Tel. prowadzącego', '<b>' + esc(v.telefonProw || '—') + '</b>', '', zadzwon(v.telefonProw));
    h += wiersz('Tel. stacji', '<b>' + esc(v.telefon || '—') + '</b>', v.telWyliczony ? '<div class="mute">wyliczony z numeru stacji – sprawdź przy okazji</div>' : '', zadzwon(v.telefon));
    if (v.notatki) h += '<div class="row"><div class="g mute">' + esc(v.notatki).replace(/\n/g, '<br>') + '</div></div>';
    return h + '</div>';
  };

  // znane wartości z wszystkich myjni (listy wyboru modelu i typu); wpisy z ukośnikiem pomijam
  function znane(pole, biezaca) {
    const m = {};
    const dodaj = (x, bezFiltra) => { x = String(x || '').trim(); if (x && (bezFiltra || x.indexOf('/') < 0) && !m[x.toLowerCase()]) m[x.toLowerCase()] = x; };
    (D.dosje || []).forEach(d => { dodaj((d.sys || {})[pole]); dodaj((d.wid || {})[pole]); });
    if (pole === 'model') wszystkie().forEach(w => dodaj(w.model));
    if (pole === 'typ') Object.keys(DOM_TYP).forEach(k => dodaj(DOM_TYP[k]));
    dodaj(biezaca, true);
    return Object.keys(m).map(k => m[k]).sort((a, b) => a.localeCompare(b, 'pl'));
  }
  // domyślny typ maszyny dla modelu (w większości przypadków tak jest; Alpha bywa inna – wtedy wybierasz ręcznie z listy)
  const DOM_TYP = { genius: 'C-160', quantus: 'C-165', centus: 'C-164', cadis: 'C-17', alpha: 'C-173' };
  // po zmianie modelu podstawia domyślny typ, ale tylko gdy typ jest pusty albo był wpisany automatycznie (ręcznego wyboru nie nadpisuje)
  function ustawTyp() {
    const typ = document.getElementById('ds_typ'); if (!typ) return;
    const mod = String(pobierz('model') || '').toLowerCase(), def = DOM_TYP[mod] || '', poprz = typ.dataset.auto || '';
    const stary = DOM_TYP[typ.dataset.model || ''] || '';   // typowy typ poprzedniej modelki
    typ.dataset.model = mod;
    // zmieniam tylko gdy typ jest pusty, wstawiony automatycznie albo typowy dla starego modelu; nietypowy (np. C-164T) zostaje
    if (typ.value !== '' && typ.value !== poprz && typ.value !== stary) return;
    if (def && ![...typ.options].some(o => o.value === def)) {
      const o = document.createElement('option'); o.value = def; o.textContent = def;
      typ.insertBefore(o, [...typ.options].find(x => x.value === INNY) || null);
    }
    typ.value = def; typ.dataset.auto = def;
    dosjeWybor('typ');
  }
  window.dosjeWybor = function (pole) {
    const s = document.getElementById('ds_' + pole), i = document.getElementById('dsi_' + pole);
    if (i) i.style.display = s.value === INNY ? '' : 'none';
    if (i && s.value === INNY) i.focus();
    if (pole === 'model') ustawTyp();
  };
  window.dosjeModelPisze = function () { ustawTyp(); };
  const pobierz = pole => {
    const e = document.getElementById('ds_' + pole); if (!e) return null;
    if (e.tagName === 'SELECT') return e.value === INNY ? String((document.getElementById('dsi_' + pole) || {}).value || '').trim() : e.value.trim();
    return e.value.trim();
  };

  window.dosjeEdytuj = function (nazwa) {
    const w = wszystkie().find(x => x.nazwa === nazwa); if (!w) return;
    if (D.dosje && D.dosje.length && !D.dosje[0].sys) { toast('Najpierw zainstaluj aktualizację bota (/aktualizuj): 2026-11-27_dossier_widoczne'); return; }   // stary bot zapisywałby do kolumn systemowych
    const v = wartosci(w), a = document.getElementById('ark');
    ORYG = { nazwa: nazwa, v: v };   // stan z chwili otwarcia – z nim porównujemy (dane z sieci mogą się odświeżyć w trakcie edycji)
    a.innerHTML = '<div class="tlo" onclick="arkZamknij()"></div><div class="ar"><h4>Dossier · ' + esc(skrot(w.nazwa)) + '</h4>' +
      '<div class="mute">Te dane służą tylko do wyświetlania w aplikacji – system ich nie widzi, więc nic nie zepsujesz.</div>' +
      '<div id="dsForm">' + POLA.map(p => p[0] === 'notatki'
        ? '<label class="mute">' + p[1] + '</label><textarea id="ds_' + p[0] + '" rows="3">' + esc(v[p[0]]) + '</textarea>'
        : (p[0] === 'model' || p[0] === 'typ')
        ? '<label class="mute">' + p[1] + '</label><select id="ds_' + p[0] + '" class="as-in" onchange="dosjeWybor(\'' + p[0] + '\')"><option value="">— brak —</option>' +
          znane(p[0], v[p[0]]).map(x => '<option value="' + esc(x) + '"' + (x === String(v[p[0]] || '').trim() ? ' selected' : '') + '>' + esc(x) + '</option>').join('') +
          '<option value="' + INNY + '">+ inny (wpisz)…</option></select><input id="dsi_' + p[0] + '" type="text" autocomplete="off"' + (p[0] === 'model' ? ' oninput="dosjeModelPisze()"' : '') + ' placeholder="wpisz ' + (p[0] === 'model' ? 'model' : 'typ, np. C-160') + '" style="display:none;margin-top:6px">'
        : '<label class="mute">' + p[1] + '</label><input id="ds_' + p[0] + '" type="' + (/^telefon/.test(p[0]) ? 'tel' : p[0] === 'email' ? 'email' : 'text') + '" autocomplete="off" value="' + esc(v[p[0]]) + '">').join('') + '</div>' +
      '<div class="mute" style="margin-top:8px">Puste pole adresu, modelu, numeru lub e-maila = aplikacja pokaże wartość z systemu.</div>' +
      '<div class="ab"><button class="btn2" onclick="arkZamknij()">Anuluj</button><button class="btn" id="dsB" onclick="dosjeDalej(\'' + jsq(nazwa) + '\')">Zapisz</button></div></div>';
    a.classList.add('on');
    const te = document.getElementById('ds_typ'); if (te) { te.dataset.auto = v.typDomyslny ? v.typ : ''; te.dataset.model = String(v.model || '').toLowerCase(); }   // typ wzięty z modelu wolno podmienić przy zmianie modelu
  };

  window.dosjeDalej = function (nazwa) {
    const w = wszystkie().find(x => x.nazwa === nazwa); if (!w) return;
    const v = (ORYG && ORYG.nazwa === nazwa) ? ORYG.v : wartosci(w), zm = {};
    POLA.forEach(p => {
      const k = p[0], x = pobierz(k); if (x === null) return;
      if (x === String(v[k] || '').trim()) return;
      // wartość taka sama jak systemowa → nie trzymam kopii (pusto = pokaż systemową)
      zm[k] = (WID.indexOf(k) >= 0 && v.sys[k] && x.toLowerCase() === v.sys[k].toLowerCase()) ? '' : x;
    });
    if (!Object.keys(zm).length) { arkZamknij(); return; }
    dosjeZapisz(w, v, zm);
  };

  function dosjeZapisz(w, v, zm) {
    arkZamknij();
    const stare = JSON.parse(JSON.stringify(D.dosje || []));
    if (!D.dosje) D.dosje = [];
    let d = v.d && v.d.klucz ? D.dosje.find(x => x.klucz === v.d.klucz) : null;
    if (!d) { d = { klucz: v.klucz || '', firma: w.nazwa, sys: {}, wid: {} }; D.dosje.push(d); }
    if (!d.wid) d.wid = {}; if (!d.sys) d.sys = {};
    Object.keys(zm).forEach(k => { if (WID.indexOf(k) >= 0) d.wid[k] = zm[k]; else d[k] = zm[k]; });
    toast('Dossier zapisany'); if (DW) pokazMyjnie(DW, 1);
    apiTlo('mgDosje', { n: w.nazwa, klucz: d.klucz || '', pola: JSON.stringify(zm) }, {
      nazwa: 'Zapis dossier',
      ok: j => { if (j && j.wynik && j.wynik.klucz) d.klucz = j.wynik.klucz; },
      cofnij: () => { D.dosje = stare; if (DW) pokazMyjnie(DW, 1); }
    });
  }
})();
