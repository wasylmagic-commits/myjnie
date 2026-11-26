// dossier.js – 26.11.2026: dossier myjni (karta w widoku myjni): adres, nr seryjny, model, e-mail, prowadzący, dwa telefony (stacji / prowadzącego) z przyciskiem „Zadzwoń”, notatki.
// Dane: D.dosje (z api=dane, arkusz Stacje). Zapis: api=mgDosje (w tle, z cofnięciem). Ręcznie wpisane pola raporty PDF już nie nadpisują.
(function () {
  const POLA = [
    ['ulica', 'Ulica i numer'], ['kod', 'Kod pocztowy'], ['miasto', 'Miasto'],
    ['serial', 'Nr seryjny'], ['model', 'Model myjni'], ['typ', 'Typ maszyny'],
    ['email', 'E-mail stacji'], ['prowadzacy', 'Prowadzący (imię i nazwisko)'],
    ['telefon', 'Telefon stacji'], ['telefonProw', 'Telefon prowadzącego'], ['notatki', 'Notatki']
  ];
  const OSTRZEZ = {
    model: 'Model: Asystent dobiera dokumentację i schematy po modelu – zły model da złe podpowiedzi.',
    typ: 'Typ maszyny: Asystent używa go do doboru dokumentacji.',
    serial: 'Nr seryjny: nowe raporty będą porównywane z tym numerem (przy różnicy dostaniesz tylko uwagę, raport go nie nadpisze).',
    ulica: 'Adres: z niego liczy się trasa i podpowiedzi „po drodze” – położenie zostanie ustalone na nowo.',
    kod: 'Adres: z niego liczy się trasa i podpowiedzi „po drodze”.',
    miasto: 'Miasto: z niego liczy się trasa i podpowiedzi „po drodze”, wpis trafia też do listy myjni.'
  };
  let ORYG = null;
  // znane wartosci z wszystkich myjni (do list wyboru modelu i typu)
  function znane(pole, biezaca) {
    const m = {};
    const dodaj = x => { x = String(x || '').trim(); if (x && !m[x.toLowerCase()]) m[x.toLowerCase()] = x; };
    (D.dosje || []).forEach(d => dodaj(d[pole]));
    if (pole === 'model') (D.myjnie || []).concat(D.inne || []).forEach(w => dodaj(w.model));
    dodaj(biezaca);
    return Object.keys(m).map(k => m[k]).sort((a, b) => a.localeCompare(b, 'pl'));
  }
  const INNY = '__inny';
  window.dosjeWybor = function (pole) {
    const s = document.getElementById('ds_' + pole), i = document.getElementById('dsi_' + pole);
    if (i) i.style.display = s.value === INNY ? '' : 'none';
    if (i && s.value === INNY) i.focus();
  };
  const pobierz = pole => {
    const e = document.getElementById('ds_' + pole); if (!e) return null;
    if (e.tagName === 'SELECT') return e.value === INNY ? String((document.getElementById('dsi_' + pole) || {}).value || '').trim() : e.value.trim();
    return e.value.trim();
  };
  const tel = t => String(t || '').replace(/[^0-9+]/g, '');

  function rekord(w) {
    return (D.dosje || []).find(d => (w.klucz && d.klucz === w.klucz) || d.firma === w.nazwa || sama(d.firma + ' ' + d.klucz, w)) || null;
  }
  function wartosci(w) {
    const d = rekord(w) || {};
    return {
      d: d, klucz: d.klucz || '',
      ulica: d.ulica || w.adres || '', kod: d.kod || '', miasto: d.miasto || w.miasto || '',
      serial: d.serial || w.nrSeryjny || '', model: d.model || w.model || '', typ: d.typ || '',
      email: d.email || '', prowadzacy: d.prowadzacy || '', telefon: d.telefon || '', telefonProw: d.telefonProw || '', notatki: d.notatki || ''
    };
  }
  const rec = (v, p) => (v.d.reczne || []).indexOf(p) >= 0 ? ' <span class="mute" title="wpisane ręcznie – raporty PDF tego nie zmienią">✎</span>' : '';
  const zadzwon = (t, kto) => tel(t) ? '<a class="btn2" href="tel:' + esc(tel(t)) + '" style="text-decoration:none">' + I('phone') + 'Zadzwoń</a>' : '';

  window.dosjeKarta = function (w) {
    const v = wartosci(w), adr = [v.ulica, [v.kod, v.miasto].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    const wiersz = (et, tresc, przycisk) => '<div class="row"><div class="g">' + et + ': ' + tresc + '</div>' + (przycisk || '') + '</div>';
    let h = '<div class="card"><div class="row"><h3 style="flex:1;margin:0">' + I('doc', 1) + 'Dossier</h3>' +
            '<button class="btn2" onclick="dosjeEdytuj(\'' + jsq(w.nazwa) + '\')">' + I('pen', 1) + 'Edytuj</button></div>';
    h += wiersz('Adres', '<b>' + esc(adr || '—') + '</b>' + rec(v, 'ulica'));
    h += wiersz('Nr seryjny', '<b>' + esc(v.serial || '—') + '</b>' + rec(v, 'serial'));
    h += wiersz('Model', '<b>' + esc([v.model, v.typ].filter(Boolean).join(' · ') || '—') + '</b>' + rec(v, 'model'));
    h += wiersz('E-mail', v.email ? '<a href="mailto:' + esc(v.email) + '"><b>' + esc(v.email) + '</b></a>' : '<b>—</b>');
    h += wiersz('Prowadzący', '<b>' + esc(v.prowadzacy || '—') + '</b>');
    h += wiersz('Tel. prowadzącego', '<b>' + esc(v.telefonProw || '—') + '</b>', zadzwon(v.telefonProw));
    h += wiersz('Tel. stacji', '<b>' + esc(v.telefon || '—') + '</b>', zadzwon(v.telefon));
    if (v.notatki) h += '<div class="row"><div class="g mute">' + esc(v.notatki).replace(/\n/g, '<br>') + '</div></div>';
    if (v.d.uwagi) h += '<div class="row"><div class="g mute">Uwaga z raportów: ' + esc(v.d.uwagi) + '</div></div>';
    return h + '</div>';
  };

  window.dosjeEdytuj = function (nazwa) {
    const w = (D.myjnie || []).concat(D.inne || []).find(x => x.nazwa === nazwa); if (!w) return;
    const v = wartosci(w), a = document.getElementById('ark');
    ORYG = { nazwa: nazwa, v: v };   // stan z chwili otwarcia – z nim porównujemy (dane z sieci mogą się odświeżyć w trakcie edycji)
    a.innerHTML = '<div class="tlo" onclick="arkZamknij()"></div><div class="ar"><h4>Dossier · ' + esc(skrot(w.nazwa)) + '</h4>' +
      '<div id="dsForm">' + POLA.map(p => p[0] === 'notatki'
        ? '<label class="mute">' + p[1] + '</label><textarea id="ds_' + p[0] + '" rows="3">' + esc(v[p[0]]) + '</textarea>'
        : (p[0] === 'model' || p[0] === 'typ')
        ? '<label class="mute">' + p[1] + '</label><select id="ds_' + p[0] + '" class="as-in" onchange="dosjeWybor(\'' + p[0] + '\')"><option value="">— brak —</option>' +
          znane(p[0], v[p[0]]).map(x => '<option value="' + esc(x) + '"' + (x === String(v[p[0]] || '').trim() ? ' selected' : '') + '>' + esc(x) + '</option>').join('') +
          '<option value="' + INNY + '">+ inny (wpisz)…</option></select><input id="dsi_' + p[0] + '" type="text" autocomplete="off" placeholder="wpisz ' + (p[0] === 'model' ? 'model' : 'typ, np. C-160') + '" style="display:none;margin-top:6px">'
        : '<label class="mute">' + p[1] + '</label><input id="ds_' + p[0] + '" type="' + (/^telefon/.test(p[0]) ? 'tel' : p[0] === 'email' ? 'email' : 'text') + '" autocomplete="off" value="' + esc(v[p[0]]) + '">').join('') + '</div>' +
      '<div id="dsOstrz"></div>' +
      '<div class="mute" style="margin-top:8px">Wpisane tu pola mają pierwszeństwo przed raportami PDF. Puste pole = znów uzupełnią je raporty.</div>' +
      '<div class="ab"><button class="btn2" onclick="arkZamknij()">Anuluj</button><button class="btn" id="dsB" onclick="dosjeDalej(\'' + jsq(nazwa) + '\',0)">Zapisz</button></div></div>';
    a.classList.add('on');
  };

  // krok 1: sprawdź zmiany; jeśli dotykają pól ważnych dla systemu – najpierw ostrzeżenie (krok 2 = potwierdzenie)
  window.dosjeDalej = function (nazwa, potw) {
    const w = (D.myjnie || []).concat(D.inne || []).find(x => x.nazwa === nazwa); if (!w) return;
    const v = (ORYG && ORYG.nazwa === nazwa) ? ORYG.v : wartosci(w), zm = {};
    POLA.forEach(p => { const x = pobierz(p[0]); if (x !== null && x !== String(v[p[0]] || '').trim()) zm[p[0]] = x; });
    if (!Object.keys(zm).length) { arkZamknij(); return; }
    const ost = Object.keys(zm).filter(k => OSTRZEZ[k] && v[k]).map(k => OSTRZEZ[k]).filter((x, i, t) => t.indexOf(x) === i);
    if (ost.length && !potw) {
      document.getElementById('dsOstrz').innerHTML = '<div class="card" style="margin-top:10px"><b>' + I('alert') + ' Ta zmiana wpłynie na działanie systemu</b><div class="mute">' + ost.map(esc).join('<br><br>') + '</div></div>';
      const b = document.getElementById('dsB'); b.textContent = 'Zapisz mimo to'; b.setAttribute('onclick', 'dosjeDalej(\'' + jsq(nazwa) + '\',1)');
      return;
    }
    dosjeZapisz(w, v, zm);
  };

  function dosjeZapisz(w, v, zm) {
    arkZamknij();
    const stare = JSON.parse(JSON.stringify(D.dosje || [])), sw = { adres: w.adres, miasto: w.miasto, model: w.model, nrSeryjny: w.nrSeryjny };
    if (!D.dosje) D.dosje = [];
    let d = v.d && v.d.klucz ? D.dosje.find(x => x.klucz === v.d.klucz) : null;
    if (!d) { d = { klucz: v.klucz || '', firma: w.nazwa, reczne: [] }; D.dosje.push(d); }
    Object.keys(zm).forEach(k => {
      d[k] = zm[k];
      if (['ulica', 'kod', 'miasto', 'serial', 'model', 'typ', 'email'].indexOf(k) >= 0) { d.reczne = (d.reczne || []).filter(x => x !== k); if (zm[k]) d.reczne.push(k); }
    });
    if (zm.ulica !== undefined && zm.ulica) w.adres = zm.ulica;
    if (zm.miasto) w.miasto = zm.miasto;
    if (zm.model) w.model = zm.model;
    if (zm.serial) w.nrSeryjny = zm.serial;
    toast('Dossier zapisany'); if (DW) pokazMyjnie(DW, 1);
    apiTlo('mgDosje', { n: w.nazwa, klucz: d.klucz || '', pola: JSON.stringify(zm) }, {
      nazwa: 'Zapis dossier',
      ok: j => { if (j && j.wynik && j.wynik.klucz) d.klucz = j.wynik.klucz; },
      cofnij: () => { D.dosje = stare; Object.assign(w, sw); if (DW) pokazMyjnie(DW, 1); }
    });
  }
})();
