/* Tryb DEMO aplikacji „Serwis myjni” – „serwer” działa w przeglądarce, bez Apps Script i bez Claude.
 * Włączenie: otwórz …/myjnie/demo/#n=NAZWISKO%20IMIĘ (osobny adres i osobna pamięć – nie rusza prawdziwych danych). Stary link #demo=1 przekierowuje tam. Sprzątanie po starej wersji: #demo=0.
 * Co robi: podmienia fetch() dla adresu https://script.google.com/macros/s/DEMO/exec i odpowiada przykładowymi danymi
 * (lista myjni, prace, zadania, magazyn, zaliczka, premia). Zmiany żyją do przeładowania strony.
 * Odpowiedzi „AI” (diagnoza, Popraw, zdjęcie faktury, strona notesu) to ZAPROGRAMOWANE PRZYKŁADY – ekran je oznacza.
 * Ładowany PRZED innymi skryptami. Nic nie wysyła do sieci.
 */
(function () {
  const H = new URLSearchParams(location.hash.slice(1));
  const BAZA = 'https://script.google.com/macros/s/DEMO/exec';
  const SPR = String(location.pathname).indexOf('/demo/') >= 0 || window.__DEMO === true;   // demo wyłącznie pod adresem …/myjnie/demo/ (16.11.2026)

  // 16.11.2026: demo ma OSOBNE miejsce w pamięci przeglądarki (klucze z przedrostkiem demo:), a włącza je sam adres …/demo/,
  // a nie flaga w localStorage – dzięki temu otwarcie demo na własnym telefonie nie nadpisuje prawdziwego klucza, imienia ani szkiców.
  if (SPR) {
    const P = 'demo:', SG = Storage.prototype.getItem, SS = Storage.prototype.setItem, SR = Storage.prototype.removeItem;
    Storage.prototype.getItem = function (k) { return SG.call(this, this === window.localStorage ? P + k : k); };
    Storage.prototype.setItem = function (k, v) { return SS.call(this, this === window.localStorage ? P + k : k, v); };
    Storage.prototype.removeItem = function (k) { return SR.call(this, this === window.localStorage ? P + k : k); };
  }
  const LSset = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} };
  const LSget = k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };

  if (!SPR) {
    // stare linki …/myjnie/#demo=1 → przenieś do …/myjnie/demo/ (hash zostaje, np. &n=NAZWISKO%20IMIĘ), nic nie zapisując
    if (H.get('demo') === '1') {
      H.delete('demo');
      const reszta = H.toString();
      location.replace(location.pathname.replace(/[^\/]*$/, '') + 'demo/' + (reszta ? '#' + reszta : ''));
      return;
    }
    // sprzątanie po starej wersji demo: flaga demo w prawdziwej pamięci. Prawdziwy klucz (k różny od „demo”) = to nie demo → usuń ślady (m.in. imię Anton)
    const stare = LSget('demo') === '1', kd = LSget('k') === 'demo';
    if (H.get('demo') === '0' || (stare && !kd)) {
      ['demo', 'd', 'n'].forEach(k => LSset(k, null));
      if (kd) { LSset('k', null); LSset('u', null); }
      try { history.replaceState(null, '', location.pathname); } catch (e) {}
      if (H.get('demo') === '0') return;
    }
    // stary instalowany egzemplarz demo (np. u Antona: demo=1 i k=demo) działa dalej jak dotąd
    if (!(stare && kd)) return;
  } else {
    LSset('demo', '1'); LSset('k', 'demo'); LSset('u', BAZA); LSset('d', '1');
    if (!H.get('n') && !LSget('n')) LSset('n', 'DEMO ANTON');
  }

  /* ---------- daty ---------- */
  const DZIS = new Date(); DZIS.setHours(12, 0, 0, 0);
  const p2 = n => String(n).padStart(2, '0');
  const iso = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  const plD = d => p2(d.getDate()) + '.' + p2(d.getMonth() + 1) + '.' + d.getFullYear();
  const dniTemu = n => { const d = new Date(DZIS); d.setDate(d.getDate() + n); return d; };
  const rob = n => { const d = new Date(DZIS); let k = 0; while (k < n) { d.setDate(d.getDate() - 1); if (d.getDay() !== 0 && d.getDay() !== 6) k++; } return d; };   // n dni roboczych temu
  const MIES = ['STYCZEŃ', 'LUTY', 'MARZEC', 'KWIECIEŃ', 'MAJ', 'CZERWIEC', 'LIPIEC', 'SIERPIEŃ', 'WRZESIEŃ', 'PAŹDZIERNIK', 'LISTOPAD', 'GRUDZIEŃ'];
  const mies0 = DZIS.getFullYear() * 100 + DZIS.getMonth() + 1;
  const min = (h, m) => h * 60 + m;

  /* ---------- dane przykładowe ---------- */
  // [nazwa, klucz, miasto, adres, segment, model, co, dni do terminu, uwagi, licznik, szczotki(stan), wymiana(dni temu), od wymiany]
  const MYJ = [
    ['Orlen SP 0232', '0232', 'Wągrowiec', 'Kcyńska', 'A', 'Genius', 3, 25, '', '59253', 'ok', 70, 12100],
    ['Orlen SP 0303', '0303', 'Nowy Tomyśl', 'ul. Kolejowa', 'B', 'Genius', 3, 50, '', '', '', 0, 0],
    ['Orlen SP 0422', '0422', 'Poznań', 'ul. Topolowa', 'B', 'Quantus', 3, -31, '', '', '', 0, 0],
    ['Orlen SP 1149', '1149', 'Poznań', 'ul. Zamenhofa', 'A', 'Quantus', 3, -14, '', '', '', 0, 0],
    ['Orlen SP 1366', '1366', 'Poznań', 'Wichrowa', 'C', 'Genius', 6, 141, '', '182000', 'ok', 40, 6200],
    ['Orlen SP 1368', '1368', 'Poznań', 'Murawa', 'B', 'Genius', 3, 85, '', '', '', 0, 0],
    ['Orlen SP 1466', '1466', 'Przeźmierowo', 'Rynkowa', 'A', 'Genius', 3, -14, 'Wymieniono uszkodzoną dyszę wodną', '', '', 0, 0],
    ['Orlen SP 1467', '1467', 'Poznań', 'ul. Jugosłowiańska', 'A', 'Quantus', 3, 17, '', '147900', 'łyse', 160, 46800],
    ['Orlen SP 1528', '1528', 'Luboń', 'ul. Sobieskiego', 'C', 'Quantus', 6, 133, '', '', '', 0, 0],
    ['Orlen SP 4137', '4137', 'Kobylnica', 'Poznańska', 'B', 'Cadis', 3, -7, '', '', '', 0, 0],
    ['Orlen SP 4142', '4142', 'Suchy Las', 'Obornicka', 'A', 'Alpha', 3, 58, '', '88400', 'ok', 95, 20100],
    ['Orlen SP 4576', '4576', 'Kobylniki', 'Szamotulska', 'A', 'Genius', 3, 57, '', '', '', 0, 0],
    ['BP Przygoda', 'Przygoda', 'Poznań', 'ul. Przybyszewskiego 39a', '', 'Centus', 6, 50, '', '', '', 0, 0],
    ['BP Piątka', 'Piątka', 'Poznań', 'ul. Włościańska 6, Poznań', '', 'Centus', 6, 60, '', '', '', 0, 0],
    ['BP Mieszko', 'Mieszko', 'Poznań', 'ul. Mieszka I 28, Poznań', '', 'Centus', 6, 56, '', '', '', 0, 0]
  ];
  const SERYJNE = { '0232': ['G-2019-0232-11', 'Siemens: F32 0,6%, wosk 0,4%', ''], '4142': ['A-2024-4142-03', 'wg karty Orlen', ''], '1467': ['Q-2021-1467-07', '', ''] };

  const S = {
    teraz: '', myjnie: [], inne: [], prace: [], obce: [], ogony: [], magazyn: [], zaliczka: [], limitZaliczki: 1500,
    wyslano: { premia: {}, zaliczka: {} }, dyzury: [], druk: [], paliwo: [], premia: null, drive: '#', drukUrl: '#', arkusz: '#'
  };
  const teraz = () => { const d = new Date(); return plD(d) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()); };

  MYJ.forEach(m => {
    const t = dniTemu(m[7]), s = SERYJNE[m[1]] || ['', '', ''];
    S.myjnie.push({ nazwa: m[0], klucz: m[1], miasto: m[2], adres: m[3], segment: m[4], model: m[5], co: String(m[6]), termin: plD(t), dni: m[7], uwagi: m[8],
      licznik: m[9], odWymiany: m[12] ? String(m[12]) : '', szczotki: m[10], wymiana: m[11] ? plD(dniTemu(-m[11])) : '', nrSeryjny: s[0], nastawy: s[1], linkNastaw: s[2] });
  });

  // prace: [dni roboczych temu, myjnia (klucz), rodzaj, godz. start, godz. koniec, przegląd?, opis, nr]
  const PRACE = [
    [0, '1467', 'AWK', [8, 40], [10, 5], 0, 'Niestabilna praca szczotki dachowej; wyregulowano docisk, sprawdzono punkty przełączania.', '11/412'],
    [1, '1528', 'AWK', [9, 30], [11, 0], 0, 'Wymiana odbiornika fotokomórki oraz test wszystkich par.', '11/398'],
    [2, '4142', 'AWK', [8, 0], [9, 50], 0, 'Kontrola układu suszenia; wyregulowano czujnik impulsowy dyszy suszarki (szczelina 4 mm).', '11/377'],
    [4, '0422', 'AWK', [10, 0], [11, 40], 0, 'Błąd fotokomórki w strefie wjazdu; oczyszczono soczewki, ustawiono nadajnik i odbiornik, test przejazdu poprawny.', '11/352'],
    [6, '1149', 'AWK', [8, 30], [11, 10], 0, 'Portal zatrzymywał się w trakcie programu; stwierdzono zawilgocenie modułu magistrali, wysuszono i zabezpieczono wejście kabla.', '10/941'],
    [8, '4137', 'USZ', [9, 10], [12, 0], 0, 'Wymiana uszkodzonego węża wysokociśnieniowego DN16 w łańcuchu kablowym; test ciśnienia poprawny.', '10/902'],
    [9, '1466', 'AWK', [9, 0], [10, 30], 0, 'Diagnostyka błędu czujnika jazdy portalu; wymieniono czujnik indukcyjny i sprawdzono pracę na czterech prędkościach.', '10/880'],
    [10, '4142', 'PSE', [8, 15], [10, 40], 1, 'Przegląd okresowy myjni: kontrola układu jazdy, szczotek, systemu dozowania chemii i oczyszczalni wody; testowe mycia wykonane.', '10/861'],
    [12, '4576', 'PSE', [8, 15], [10, 40], 1, 'Przegląd okresowy myjni: kontrola układu jazdy, szczotek, systemu dozowania chemii i oczyszczalni wody; testowe mycia wykonane.', '10/833'],
    [15, '1366', 'PSE', [8, 15], [10, 40], 1, 'Przegląd okresowy myjni: kontrola układu jazdy, szczotek, systemu dozowania chemii i oczyszczalni wody; testowe mycia wykonane.', '10/795'],
    [20, '0303', 'PSE', [8, 15], [10, 40], 1, 'Przegląd okresowy myjni: kontrola układu jazdy, szczotek, systemu dozowania chemii i oczyszczalni wody; testowe mycia wykonane.', '10/742']
  ];
  const myjK = k => S.myjnie.find(m => m.klucz === k) || {};
  let km = 204100;
  PRACE.slice().reverse().forEach((r, i) => {
    const m = myjK(r[1]), d = rob(r[0]); km += 90 + i * 7;
    S.prace.push({ d: iso(d), firma: (/^\d+$/.test(r[1]) ? 'Orlen ' : '') + r[1] === r[1] ? m.nazwa : (/^\d+$/.test(r[1]) ? 'Orlen ' + r[1] : m.nazwa), miejsce: m.miasto, nr: 'SZL/' + d.getFullYear() + '/' + p2(d.getMonth() + 1) + '/00' + r[7].replace(/\D/g, '').slice(-3).padStart(3, '0'),
      opis: r[6], p: r[5], rodzaj: r[2], km: km, montaz: 0, st: min(r[3][0], r[3][1]), ko: min(r[4][0], r[4][1]), wy: min(7, 30), status: 'gotowe', kl: ' ' + m.nazwa + ' ' + m.miasto });
  });
  // nowe zlecenia z SMS (karta „Nowe zlecenia” na Dziś)
  S.prace.push({ d: iso(DZIS), firma: '', miejsce: 'Poznań', nr: 'SZL/' + DZIS.getFullYear() + '/' + p2(DZIS.getMonth() + 1) + '/00431', opis: 'Praca na sucho – zgłoszenie z SMS', p: 0, rodzaj: 'AWK', km: 0, montaz: 0, st: 0, ko: 0, wy: 0, status: 'zlecenie', kl: 'SMS: WLOSCIANSKA 6, 60-681 POZNAN (BP Piątka) | zgł. ' + p2(DZIS.getDate()) + '.' + p2(DZIS.getMonth() + 1) + ' 07:12 | Biuro' });
  // 17.11.2026: położenie przykładowych myjni (Po drodze); część celowo bez współrzędnych
  S.geo = [['Orlen SP 0232', 52.80, 17.20], ['Orlen SP 0303', 52.31, 16.12], ['Orlen SP 0422', 52.41, 16.89], ['Orlen SP 1149', 52.39, 16.90], ['Orlen SP 1366', 52.37, 16.95], ['Orlen SP 1368', 52.45, 16.98],
    ['Orlen SP 1466', 52.43, 16.80], ['Orlen SP 1467', 52.40, 16.84], ['Orlen SP 4137', 52.42, 16.83], ['Orlen SP 4142', 52.47, 16.90], ['Orlen SP 4576', 52.52, 16.95], ['BP Przygoda', 52.43, 16.91], ['BP Piątka', 52.39, 16.87], ['BP Mieszko', 52.40, 16.94]]
    .map(x => ({ n: x[0], lat: x[1], lng: x[2] }));
  S.ust = {};
  S.dosje = [{ klucz: 'SP4046', firma: 'Orlen 4046', siec: 'Orlen', ulica: 'Bałtycka 4a', kod: '61-013', miasto: 'Poznań', model: 'Quantus', typ: '', serial: '3780100', email: 's04046@sp.orlen.pl', prowadzacy: 'Jan Kowalski', telefon: '61 555 01 02', telefonProw: '600 100 200', notatki: 'Klucz do kontenera u kasjera', reczne: [], uwagi: '' }];
  S.stacje = [{ klucz: 'SP4046', firma: 'Orlen 4046', siec: 'Orlen', ulica: 'Bałtycka 4a', kod: '61-013', miasto: 'Poznań' }, { klucz: 'RF402', firma: 'BP Wilda', siec: 'BP', ulica: 'Wilda 12', kod: '61-001', miasto: 'Poznań' }];
  S.prace.push({ d: iso(new Date(DZIS.getTime() - 3 * 864e5)), firma: 'BP Wilda', miejsce: 'Poznań', nr: 'SZL/' + DZIS.getFullYear() + '/' + p2(DZIS.getMonth() + 1) + '/00420', opis: 'Zastępstwo: zacinająca się rolka, wymieniona', p: 0, rodzaj: 'AWK', km: 12, montaz: 0, st: 0, ko: 0, wy: 0, status: 'wykonane', kl: '' });
  S.prace.push({ d: iso(DZIS), firma: '', miejsce: 'Poznan', nr: 'SZL/' + DZIS.getFullYear() + '/' + p2(DZIS.getMonth() + 1) + '/00446', opis: 'Brak dawkowania aktywnej piany podczas mycia. Prosze o sprawdzenie i kalibracje.', p: 0, rodzaj: 'AWK', km: 0, montaz: 0, st: 0, ko: 0, wy: 0, status: 'zlecenie', kl: 'SMS: Baltycka 4a, 61-013 Poznan | zgł. ' + p2(DZIS.getDate()) + '.' + p2(DZIS.getMonth() + 1) + ' 14:05 | Biuro' });
  S.prace.push({ d: iso(DZIS), firma: '', miejsce: 'Kobylnica', nr: 'SZL/' + DZIS.getFullYear() + '/' + p2(DZIS.getMonth() + 1) + '/00432', opis: 'Portal stanął w trakcie programu, błąd na panelu', p: 0, rodzaj: 'AWK', km: 0, montaz: 0, st: 0, ko: 0, wy: 0, status: 'zlecenie', kl: 'SMS: Poznańska, Kobylnica (Orlen SP 4137) | zgł. ' + p2(DZIS.getDate()) + '.' + p2(DZIS.getMonth() + 1) + ' 08:03 | Biuro' });

  // 26.11.2026: wisząca zaślepka z notesu (numer zlecenia bez raportu) – do próby „Bez raportu”
  S.prace.push({ d: iso(rob(1)), firma: 'Orlen 1368', miejsce: 'Poznań', nr: 'SZL/' + DZIS.getFullYear() + '/' + p2(DZIS.getMonth() + 1) + '/00455', opis: '', p: 0, rodzaj: '', km: 0, montaz: 0, st: 0, ko: 0, wy: 0, status: 'czeka_na_raport', kl: '' });
  S.obce.push({ d: iso(rob(14)), firma: 'Orlen SP 1466', kto: 'Kowalski Marek', nr: 'SZL/2026/10/00811', p: 0, opis: 'Wymieniono uszkodzoną dyszę wodną.', zal: '' });
  S.obce.push({ d: iso(rob(11)), firma: 'Orlen SP 1149', kto: 'Nowak Piotr', nr: 'SZL/2026/10/00840', p: 0, opis: 'Kontrola portalu po zgłoszeniu zatrzymań.', zal: 'Sprawdzić uszczelnienie wejścia kabla do szafy' });

  // ogony: [id, dni temu, myjnia, typ, opis, części, status, termin(dni)]
  [[1, 12, 'Orlen SP 0422', 'do zrobienia', 'Wymienić uszczelkę dyszy wahadłowej – widoczny wyciek', '', 'otwarty', 4],
   [2, 10, 'Orlen SP 1467', 'do zrobienia', 'Sprawdzić luz w prowadnicach szczotki dachowej', '', 'otwarty', null],
   [3, 6, 'Orlen SP 1528', 'do kupienia', 'Zamówić odbiornik fotokomórki na zapas', '1100622 Odbiornik fotokomórki 24 V ×1', 'otwarty', null],
   [4, 6, 'Orlen SP 4137', 'do zrobienia', 'Wymienić drugi wąż DN16 w łańcuchu przy następnym przeglądzie', '', 'otwarty', 21],
   [5, 3, 'Orlen SP 4142', 'do biura', 'Przekazać do biura protokół z regulacji suszarki', '', 'otwarty', null],
   [6, 9, 'BP Mieszko', 'do zrobienia', 'Dokręcić osłonę szafy sterowniczej i sprawdzić wejście kabla', '1268821 Przyłącze śr. 8 mm - R1/4" ×2', 'otwarty', null],
   [9, 2, 'Orlen SP 1149', 'do biura', 'Zamówić pompę głębinową 0,75 kW do studni', '', 'otwarty', 1],
   [7, 18, 'Orlen SP 1149', 'zrobione', 'Wysuszono moduł magistrali, zabezpieczono wejście kabla', '', '—', null],
   [8, 17, 'Orlen SP 4137', 'zrobione', 'Wymieniono wąż DN16', '', '—', null]].forEach(o => {
    const d = new Date(DZIS); d.setDate(d.getDate() - o[1]);
    S.ogony.push({ d: iso(d), myjnia: o[2], typ: o[3], opis: o[4], czesci: o[5], status: o[6], zamkn: o[6] === 'otwarty' ? '' : iso(d), zrodlo: 'notatka', id: String(o[0]), termin: o[7] == null ? '' : iso(dniTemu(o[7])) });
  });

  S.magazyn = [['1040100', 'Czujnik indukcyjny NO/NZ', '3', '', ''], ['1040160', 'Czujnik indukcyjny 6 m kabel', '0', '', '2'], ['1040164', 'Czujnik indukcyjny z kablem 10 m', '4', '', ''],
    ['1100622', 'Odbiornik fotokomórki 24 V', '3', '', ''], ['1266800', 'Złącze WC do przewodów UMP', '1', '', '2'], ['1268821', 'Przyłącze śr. 8 mm - R1/4"', '2', '', ''],
    ['1307100', 'Zawór pływakowy G3/4 AG', '2', '', ''], ['1500210', 'Wąż wysokociśnieniowy DN16 (metr)', '6', '', '6'], ['1500330', 'Dysza wahadłowa wysokiego ciśnienia', '1', '', '1'],
    ['1700045', 'Stycznik 24 V DC', '4', '', '']].map(r => ({ kod: r[0], nazwa: r[1], ilosc: r[2], wartosc: r[3], min: r[4] }));
  // 17.11.2026: Zamówienia (zamow.js) – plan magazynu i zamówienia w drodze
  S.plan = [{ kod: '1040100', klasa: 'krytyczna', docelowo: 4 }, { kod: '1040160', klasa: 'krytyczna', docelowo: 2 }, { kod: '1266800', klasa: 'zwykła', docelowo: 2 },
    { kod: '1500210', klasa: 'częsta', docelowo: 10 }, { kod: '1500330', klasa: 'częsta', docelowo: 1 }, { kod: '1100622', klasa: 'krytyczna', docelowo: 3 }];
  S.magazyn.forEach(m => { const p = S.plan.find(x => x.kod === m.kod); if (p && !m.min) m.min = String(p.klasa === 'krytyczna' || p.docelowo <= 4 ? p.docelowo : Math.ceil(p.docelowo * 0.6)); });
  const zd = n => { const d = new Date(DZIS); d.setDate(d.getDate() - n); return iso(d); };
  S.zamowienia = [{ id: '1', d: zd(5), kod: '1100622', nazwa: 'Odbiornik fotokomórki 24 V', ilosc: 2, dost: 1, zadanie: '' },
    { id: '2', d: zd(35), kod: '', nazwa: 'Wąż ssący pompy dozującej 2 m', ilosc: 1, dost: 0, zadanie: '' },
    { id: '3', d: zd(6), kod: '', nazwa: 'Dźwignia dysz wahadłowych', ilosc: 1, dost: 0, zadanie: '' }];
  S.slownik = [{ slowa: 'Głowica oczyszczalni', kod: 'PA00055120', nazwa: 'Głowica sterująca oczyszczalni BIO' }];
  // 20.11.2026: moje opisy części (opisy.js, łatka Opisy.gs)
  S.opisy = S.magazyn.length ? [{ kod: S.magazyn[0].kod, o: 'ta mała w szafie chemii, na dole po lewej', f: 0, zm: '2026-11-20T08:00:00.000Z' }] : [];
  S.nowosci = [{ kod: 'PA00061844', nazwa: 'Dźwignia dyszy wahadłowej HD lewa', d: zd(2), n: 1 }];

  const zal = (dni, nr, za, kw, miej) => { const d = new Date(DZIS); d.setDate(d.getDate() - dni); return { d: iso(d), za: za, kwota: kw, mies: d.getFullYear() * 100 + d.getMonth() + 1, nr: nr, miejsce: miej, id: '' }; };
  S.zaliczka = [zal(11, 'FV/118/11/2026', 'Wąż wysokociśnieniowy DN16 – 3 m', 186.5, 'Orlen SP 4137 Kobylnica'), zal(6, 'FV/9021/2026', 'Odbiornik fotokomórki 24 V', 412, 'Orlen SP 1528 Luboń'),
    zal(4, 'PAR/2026/11/0457', 'Paliwo – dojazd Suchy Las', 214.3, 'Orlen SP 4142 Suchy Las'), zal(1, 'FV/77/11/2026', 'Taśma izolacyjna, opaski, smar', 64.2, '')];
  S.dyzury = [{ tydz: 47, od: '16.11', do: '22.11', swieto: false }, { tydz: 51, od: '14.12', do: '20.12', swieto: false }, { tydz: 52, od: '21.12', do: '27.12', swieto: true }];
  S.druk = [{ nazwa: 'Raport przeglądu myjni portalowej', folder: 'Raporty i formularze', url: '#' }, { nazwa: 'Instrukcja BHP – praca przy portalu', folder: 'BHP', url: '#' }];
  S.paliwo = [[22, 38.4, 241.9, 'PO 1234A', 197800, 1], [15, 41.2, 262.3, 'PO 1234A', 198520, 1], [8, 39.8, 253.1, 'PO 1234A', 199260, 1], [2, 40.6, 258.4, 'PO 1234A', 199980, 1]].map((r, i, a) => {
    const d = new Date(DZIS); d.setDate(d.getDate() - r[0]);
    return { d: iso(d), g: '16:' + p2(10 + i), rej: r[3], km: r[4], l: r[1], zl: r[2], pelny: true, stacja: 'Orlen', kmOd: i ? r[4] - a[i - 1][4] : 0, zuz: i ? Math.round(r[1] / (r[4] - a[i - 1][4]) * 10000) / 100 : 0 };
  });
  S.premia = { mies: MIES[DZIS.getMonth()], rok: DZIS.getFullYear(), suma: 2860, poz: [
    { co: 'PRZEGLĄDY', ile: '4 × 220 zł', kwota: 880 }, { co: 'AWARIE (AWK)', ile: '7 × 150 zł', kwota: 1050 }, { co: 'DYŻUR', ile: '1 tydzień', kwota: 650 }, { co: 'URUCHOMIENIA', ile: '1 × 280 zł', kwota: 280 }] };

  const sesje = [
    { id: 'AS261112-091500', myjnia: 'Orlen SP 1149', start: plD(rob(3)) + ' 09:15', objaw: 'Portal staje w trakcie programu, na panelu „łączenie”', przyczyna: 'Woda we wejściu kabla – oderwany wężyk zraszania kół', status: 'zamknieta', rundy: 3 },
    { id: 'AS261110-142000', myjnia: 'Orlen SP 0422', start: plD(rob(5)) + ' 14:20', objaw: 'Błąd fotokomórki w strefie wjazdu', przyczyna: '', status: 'zamknieta', rundy: 2 }
  ];

  /* ---------- diagnoza (zaprogramowane przykłady) ---------- */
  const SCEN = {
    woda: {
      re: /woda|wod[aąy]|wilgo|mokr|zalan|zalew|łączen|laczen|wyłączen|magistral|cpu|moduł|modul|brak komunik/i,
      hip: [{ t: 'Woda na module magistrali / szynie DIN w szafie', p: 55, dlaczego: 'Martwy CPU przy świecących diodach kart i brak 24 V DC to typowy obraz wilgoci na magistrali – częściej skutek niż przyczyna.' }, { t: 'Zasilanie 24 V DC – przekaźnik K1/K0', p: 20, dlaczego: '' }, { t: 'Uszkodzony CPU', p: 10, dlaczego: '' }],
      plan: [['Otwórz szafę i obejrzyj szynę DIN i moduły: czy widać wilgoć, osad, ślady wody?', 'sucho = hipoteza odpada; ślady wody = idź do 2'], ['Sprawdź, skąd może wchodzić woda: wejście kabli, wąż zraszania kół, dach szafy, drzwi', 'jedno miejsce ze śladami'], ['Zmierz 24 V DC na zasilaczu i za przekaźnikami (przed wysuszeniem)', '24 V obecne na zasilaczu, brak za K1 = skutek, nie przyczyna'], ['Po wysuszeniu i uruchomieniu: sprawdź po kilku godzinach, czy szafa znów jest mokra', 'sucha = naprawione; mokra = źródło wody nie znalezione']],
      pyt: ['Czy drzwi szafy były zamknięte, gdy znalazłeś ją mokrą? Jeśli nie – co mówi kamera lub stacja?'], ostrz: 'Przed dotknięciem modułów odłącz zasilanie szafy. Mokre moduły pod napięciem to ryzyko porażenia.',
      zrodla: ['Christ_Przypadki, przypadek 7 (Quantus C165)', 'Christ_Przypadki, przypadek 10']
    },
    foto: {
      re: /fotokom|fotoko|bariera|światł|swiatl|czujnik wjazd|photocell|barier|czerwon|dioda|led/i,
      hip: [{ t: 'Zabrudzone soczewki lub rozjechane ustawienie nadajnik–odbiornik', p: 45, dlaczego: 'Najczęstsza przyczyna błędu grupy par; zielona dioda mrugająca = brudne, ale jeszcze widzi.' }, { t: 'Uszkodzony odbiornik (czerwona dioda mruga)', p: 35, dlaczego: '' }, { t: 'Uszkodzony nadajnik', p: 10, dlaczego: '' }],
      plan: [['Obejrzyj pary: czy odbiornik patrzy dokładnie na swój nadajnik?', 'osie zgodne'], ['Sprawdź czystość soczewek (woda, chemia, osad)', 'czyste'], ['Sprawdź nadajnik kamerą telefonu (podczerwień świeci w obiektywie)', 'świeci = nadajnik OK, podejrzany odbiornik'], ['Przyłóż nowy odbiornik „w powietrzu” (niezamontowany) i patrz na żółtą diodę w wzmacniaczu', 'żółta stała = odbiornik był winny']],
      pyt: ['Jaka dioda świeci na wzmacniaczu dla tej grupy par: zielona mrugająca, żółta stała czy czerwona mrugająca?'], ostrz: '',
      zrodla: ['Christ_Przypadki, przypadek 14 (fotokomórki)']
    },
    portal: {
      re: /szarp|szarpi|stuk|zgrzyt|portal|przekos|noga|koło|kolo|prowadnic|jazd/i,
      hip: [{ t: 'Zużyta rolka lub łożysko po jednej stronie portalu', p: 40, dlaczego: 'Szarpanie i stukanie przy jeździe wskazuje na mechanikę; płynny, ale przekoszony ruch to raczej różnica średnic kół.' }, { t: 'Różnica średnic kół napędowych (portal „ucieka” jedną nogą)', p: 30, dlaczego: '' }, { t: 'Reduktor / przekładnia', p: 15, dlaczego: '' }],
      plan: [['Poproś obsługę o uruchomienie portalu i stań obok: która noga się zacina? Posłuchaj z boku', 'wiesz, którą nogę rozebrać'], ['Przód portalu = rolka, tył = reduktor: z odgłosu ustal, co jest winne', 'rolka albo reduktor'], ['Zdemontuj i obejrzyj: martwa rolka lub łożysko widać od razu', 'luz lub zatarcie'], ['Po naprawie: jazda tam i z powrotem na wszystkich czterech prędkościach', 'płynnie na każdej']],
      pyt: ['Czy portal jedzie płynnie, ale jedna noga wyprzedza drugą, czy szarpie i zacina się?'], ostrz: 'Nie wchodź w strefę ruchu portalu przy włączonej myjni; testy z drugą osobą przy przycisku STOP.',
      zrodla: ['Christ_Przypadki, przypadki 12 i 13 (Quantus)']
    },
    inne: {
      re: /./,
      hip: [{ t: 'Za mało danych – zbieram objawy i kody', p: null, dlaczego: '' }],
      plan: [['Zapisz dokładnie, jakie kody i komunikaty są teraz na wyświetlaczu', 'lista kodów'], ['Sprawdź, czy usterka powtarza się w jednym miejscu cyklu, czy losowo', 'miejsce w cyklu']],
      pyt: ['Jakie kody są na wyświetlaczu i w którym momencie programu pojawia się usterka?'], ostrz: '', zrodla: []
    }
  };
  const scen = t => SCEN.woda.re.test(t) ? SCEN.woda : SCEN.foto.re.test(t) ? SCEN.foto : SCEN.portal.re.test(t) ? SCEN.portal : SCEN.inne;
  const DEMO_OSTRZ = 'TRYB DEMO: to zaprogramowany przykład, nie prawdziwy Claude. Pełna wersja pyta o dane i prowadzi przez diagnozę na bazie przypadków.';
  const sesjeM = {};
  let licznikSes = 0;

  function odpStart(s) {
    const sc = s.sc;
    return { wersja: 2, faza: sc === SCEN.inne ? 'dane' : 'plan', pewnosc: sc === SCEN.inne ? 15 : 45,
      podsumowanie: 'Przykładowa odpowiedź demo: ' + (sc === SCEN.inne ? 'potrzebuję jeszcze danych, zanim podam hipotezy.' : 'na podstawie opisu najbardziej prawdopodobne są poniższe przyczyny. Najpierw pomiary i oględziny, dopiero potem wymiana części.'),
      pytania: sc.pyt, ostrzezenie: [sc.ostrz, DEMO_OSTRZ].filter(Boolean).join(' '),
      hipotezy: sc.hip, plan: sc.plan.map((k, i) => ({ id: i + 1, krok: k[0], oczekiwane: k[1], stan: 'todo' })), zrodla: sc.zrodla };
  }
  function odpRunda(s, dane) {
    const sc = s.sc;
    s.runda++;
    const nok = (dane.wyniki || []).some(w => w.stan === 'nok');
    (dane.wyniki || []).forEach(w => { const k = s.odp.plan.find(x => x.id === w.id); if (k) k.stan = w.stan; });
    const o = JSON.parse(JSON.stringify(s.odp));
    if (s.runda === 2) {
      o.faza = 'petla'; o.pewnosc = nok ? 70 : 60;
      o.podsumowanie = 'Przykład demo: wyniki pasują do głównej hipotezy. Zanim uznasz sprawę za zamkniętą, ustal przyczynę źródłową – naprawa samego skutku zwykle kończy się powrotem usterki.';
      if (o.hipotezy[0]) o.hipotezy[0].p = 75;
      o.pytania = ['Skąd się to wzięło? Co zrobiło moduł, szafę lub czujnik podatnymi na tę usterkę?'];
      o.bramka = { brak: 'przyczyna źródłowa i test po naprawie (pełny cykl)' };
    } else {
      o.faza = 'zamkniecie'; o.pewnosc = 85;
      o.podsumowanie = 'Przykład demo: komplet danych. Możesz zamknąć sesję – szkic przypadku trafi do przeglądu i nauczy system.';
      o.pytania = []; delete o.bramka;
      o.przyczyna = sc === SCEN.woda ? 'Woda wchodzi przez wejście kabli (oderwany wężyk zraszania kół).' : sc === SCEN.foto ? 'Zużyty odbiornik fotokomórki (czerwona dioda).' : sc === SCEN.portal ? 'Zużyta rolka po jednej stronie portalu.' : '';
    }
    return o;
  }
  function wynikSesji(s) { return { id: s.id, myjnia: { nazwa: s.myjnia, model: s.model }, status: s.status || 'otwarta', odp: s.odp, model: 'sonnet-5-5 (demo)', runda: s.runda, poziom: s.poziom || '', koszt: 0, powrot: false }; }

  function asystent(b) {
    const a = b.akcja;
    if (a === 'as_sesje') return sesje.slice().reverse().concat(Object.keys(sesjeM).map(k => ({ id: k, myjnia: sesjeM[k].myjnia, start: plD(DZIS) + ' ' + p2(new Date().getHours()) + ':' + p2(new Date().getMinutes()), objaw: sesjeM[k].objaw, przyczyna: sesjeM[k].przyczyna || '', status: sesjeM[k].status === 'zamknieta' ? 'zamknieta' : 'otwarta', rundy: sesjeM[k].runda })).reverse());
    if (a === 'as_start') {
      const id = 'AS' + iso(DZIS).slice(2).replace(/-/g, '') + '-DEMO' + (++licznikSes);
      const m = S.myjnie.find(x => x.nazwa === b.myjnia) || {};
      const s = { id: id, myjnia: b.myjnia, model: m.model || '', objaw: (b.kody ? '[' + b.kody + '] ' : '') + (b.objaw || ''), runda: 1, poziom: b.poziom, sc: scen((b.objaw || '') + ' ' + (b.kody || '')) };
      s.odp = odpStart(s); sesjeM[id] = s; return wynikSesji(s);
    }
    const s = sesjeM[b.id];
    if (a === 'as_sesja') {
      if (s) return wynikSesji(s);
      const x = sesje.find(y => y.id === b.id) || sesje[0];
      return { id: x.id, myjnia: { nazwa: x.myjnia }, status: 'zamknieta', runda: x.rundy, model: 'sonnet-5-5', poziom: '', odp: { faza: 'zamkniecie', podsumowanie: 'Sesja z archiwum (przykład demo).', przyczyna: x.przyczyna, plan: [], hipotezy: [] }, rozmowa: [{ rola: 'user', tekst: x.objaw }, { rola: 'assistant', tekst: 'Przykład demo.' }] };
    }
    if (!s) throw new Error('Nie znam tej sesji (demo)');
    if (a === 'as_runda') { s.odp = odpRunda(s, b); return wynikSesji(s); }
    if (a === 'as_zamknij') {
      if (!b.wymus && b.wynik === 'naprawione' && !String(b.przyczyna || '').trim() && !s.potw) { s.potw = 1; return { potwierdz: true, braki: ['przyczyna źródłowa (dlaczego się zepsuło)'], poziom: b.poziom || s.poziom || '' }; }
      s.status = 'zamknieta'; s.przyczyna = b.przyczyna || ''; s.odp.faza = 'zamkniecie';
      const w = wynikSesji(s); w.szkicUrl = '#'; w.szkicStatus = 'szkic (demo)'; w.ogon = +b.sprawdzZaDni > 0 ? 'kontrola za ' + b.sprawdzZaDni + ' dni' : ''; return w;
    }
    throw new Error('Nieznana akcja (demo): ' + a);
  }

  /* ---------- poprawa opisu, dokumenty ---------- */
  function popraw(b) {
    const t = String(b.t || '');
    let tekst, niejasne = 'Tryb demo: to przykładowa odpowiedź. Prawdziwy Claude przepisze Twój opis, niczego od siebie nie dopisując.';
    if (/fotok|фотоэл|фотодат|photocell/i.test(t)) tekst = 'Stwierdzono błąd grupy fotokomórek w strefie wjazdu. Oczyszczono soczewki, wyregulowano ustawienie nadajnika i odbiornika, sprawdzono diody na wzmacniaczu. Test przejazdu wykonano z wynikiem poprawnym.';
    else if (/wąż|waz|szlang|шланг|hose/i.test(t)) tekst = 'Stwierdzono nieszczelność węża wysokociśnieniowego w łańcuchu kablowym. Wąż wymieniono, układ sprawdzono pod ciśnieniem – bez przecieków.';
    else if (/szczotk|щетк|щётк/i.test(t)) tekst = 'Stwierdzono niestabilną pracę szczotki dachowej. Wyregulowano docisk i punkty przełączania, wykonano mycia testowe.';
    else if (/czujnik|датчик|sensor/i.test(t)) tekst = 'Stwierdzono uszkodzenie czujnika indukcyjnego. Czujnik wymieniono i wyregulowano szczelinę, sprawdzono pracę na wszystkich prędkościach.';
    else tekst = 'Po przyjeździe na myjnię stwierdzono usterkę zgłoszoną przez klienta. Wykonano czynności serwisowe opisane przez serwisanta i sprawdzono działanie urządzenia. [szczegóły do uzupełnienia]';
    return { tekst: tekst, niejasne: niejasne };
  }
  function dokument() {
    return { typ: 'faktura', key: 'demo-fv', numer: 'FV/2026/11/0482', sprzedawca: 'Sklep Techniczny Poznań (przykład demo)', za: 'Wąż wysokociśnieniowy DN16, 3 m + złączki', brutto: '248,70', data: iso(DZIS), miejsca: [], url: '' };
  }
  function notes() {
    return { key: 'demo-notes', data: plD(DZIS), ostrz: ['TRYB DEMO: to przykładowa strona notesu, nie rozpoznanie Twojego zdjęcia.'], uwagi: '',
      prace: [
        { typ: 'raport', nr: '11/431', gdzie: 'Orlen SP 4137 Kobylnica', miejsce: 'Kobylnica', stacja: 'SP4137', adres: '', km: '206880', wyjazd: '07:30', start: '08:20', koniec: '10:15', flagi: ['awk'], raport: false },
        { typ: 'raport', nr: '11/432', gdzie: 'BP Piątka Poznań', miejsce: 'Poznań', stacja: '', adres: 'Włościańska 6', km: '206931', wyjazd: '10:40', start: '11:10', koniec: '12:30', flagi: [], raport: false, tenSam: false }
      ], koniec: { czas: '14:20', km: '206988' } };
  }

  /* ---------- router ---------- */
  const lata = l => l;
  const znajdzOg = id => S.ogony.find(o => o.id === String(id));
  let nOg = 20, nSes = 0;
  function trasa(api, p, body) {
    switch (api) {
      case 'dane': S.teraz = teraz(); return { ok: true, dane: S };
      case 'zamknij': { const o = znajdzOg(p.id); if (o && o.status === 'otwarty') { o.status = 'zamknięty'; o.zamkn = iso(DZIS); } return { ok: true, wynik: !!o }; }
      case 'otworz': { const o = znajdzOg(p.id); if (o) { o.status = 'otwarty'; o.zamkn = ''; } return { ok: true, wynik: !!o }; }
      case 'usun': { const i = S.ogony.findIndex(o => o.id === String(p.id)); if (i >= 0) S.ogony.splice(i, 1); return { ok: true, wynik: i >= 0 }; }
      case 'edytuj': { const o = znajdzOg(p.id); if (!o) return { ok: false, blad: 'Nie ma zadania' };
        if (p.opis !== undefined) o.opis = p.opis; if (p.termin !== undefined) o.termin = p.termin; if (p.myjnia !== undefined) o.myjnia = p.myjnia;
        if (p.typ) o.typ = { ogon: 'do zrobienia', kupic: 'do kupienia', biuro: 'do wysłania', zamow: 'do zamówienia' }[p.typ] || o.typ; return { ok: true, wynik: { id: String(p.id) } }; }
      case 'notatka': return { ok: true, wynik: 'ok' };
      case 'notatkaDzis':
      case 'notatkaMyjni': {
        const t = String(p.t || ''), zam = /zamów|zamow|заказ/i.test(t), kup = !zam && /kupi|kupić|купить/i.test(t);
        const typ = zam ? 'do biura' : kup ? 'do kupienia' : 'do zrobienia';
        const id = String(++nOg); S.ogony.push({ d: iso(DZIS), myjnia: p.m || '', typ: typ, opis: t.slice(0, 160), czesci: '', status: 'otwarty', zamkn: '', zrodlo: 'aplikacja', id: id, termin: '' });
        return { ok: true, wynik: { zapisane: 1, wpisy: [{ typ: zam ? 'biuro' : kup ? 'kupic' : 'ogon', ikona: zam ? '📦 Do biura' : kup ? '🛒 Do kupienia' : '🔧 Ogon', myjnia: p.m || '', opis: t.slice(0, 160), czesci: '', termin: '' }], zamkniete: [], niejasne: 'Tryb demo: wpis zapisany bez rozbioru przez Claude.' } };
      }
      case 'myjnia': { const m = S.myjnie.find(x => x.nazwa === p.n); const pola = JSON.parse(p.pola || '{}'), zap = [], kon = {};
        Object.keys(pola).forEach(k => { if (!m) return; const st = String(m[k] || ''); if (st && st !== pola[k] && p.nadpisz !== '1') kon[k] = st; else { m[k] = pola[k]; zap.push(k); } });
        return { ok: true, wynik: { zapisane: zap, konflikt: kon } }; }
      case 'wyslano': { S.wyslano[p.typ] = S.wyslano[p.typ] || {}; if (p.tak === '1') S.wyslano[p.typ][p.mies] = iso(DZIS); else delete S.wyslano[p.typ][p.mies]; return { ok: true, wynik: true }; }
      case 'rozmail': return { ok: true, wynik: { na: 'twoja.poczta@przyklad.pl (demo – nic nie wysłano)', ile: S.zaliczka.filter(z => z.mies === +p.mies).length, suma: S.zaliczka.filter(z => z.mies === +p.mies).reduce((a, z) => a + z.kwota, 0), zalaczniki: ['Druk_zaliczki_' + p.mies + '.xlsx', 'Skany_faktur_' + p.mies + '.pdf'], brakSkanu: [] } };
      case 'rozliczenie': return { ok: true, wynik: { ile: 0 } };
      case 'fakturaZapisz': return { ok: true, wynik: p.tak === '1' ? { zapisane: true, stan: 'Zaliczka: zapisano (demo)' } : { anulowane: true } };
      case 'zaliczkaMiejsce': { const z = S.zaliczka.find(x => x.id === p.id); if (z) z.miejsce = p.miejsce; return { ok: true, wynik: true }; }
      case 'mgZamow': { const poz = JSON.parse(p.poz || '[]'), pon = JSON.parse(p.ponow || '[]'); S.zamowienia = S.zamowienia.filter(z => pon.indexOf(z.id) < 0);
        poz.forEach((x, i) => { S.zamowienia.push({ id: 'd' + Date.now() + i, d: iso(DZIS), kod: x.kod, nazwa: x.nazwa, ilosc: +x.ilosc, dost: 0, zadanie: x.zadanie || '' }); const o = x.zadanie && znajdzOg(x.zadanie); if (o) { o.status = 'zamknięty'; o.zamkn = iso(DZIS); } });
        return { ok: true, wynik: { zapisane: poz.length } }; }
      case 'mgPrzyszlo': { const z = S.zamowienia.find(x => x.id === String(p.id)); if (!z) return { ok: false, blad: 'Nie ma zamówienia' }; z.dost = Math.min(z.ilosc, z.dost + (+p.n || 0));
        const m = z.kod && S.magazyn.find(x => x.kod === z.kod); if (m) m.ilosc = String((+m.ilosc || 0) + (+p.n || 0)); if (z.dost >= z.ilosc) S.zamowienia = S.zamowienia.filter(x => x !== z); return { ok: true, wynik: { dost: z.dost } }; }
      case 'mgPolacz': { const z = S.zamowienia.find(x => x.id === String(p.id)); if (z) { z.kod = p.kod; S.slownik.push({ slowa: z.nazwa, kod: p.kod, nazwa: p.nazwa }); } return { ok: true, wynik: { dost: 0 } }; }
      case 'mgGeo': return { ok: true, wynik: { dodane: [], pozostalo: 0 } };
      case 'mgDosje': { const pol = JSON.parse(p.pola || '{}'); let x = S.dosje.find(y => y.klucz === p.klucz || y.firma === p.n); if (!x) { x = { klucz: p.n.toUpperCase(), firma: p.n, reczne: [] }; S.dosje.push(x); } Object.assign(x, pol); return { ok: true, wynik: { klucz: x.klucz, zapisane: Object.keys(pol) } }; }
      case 'mgUst': S.ust[p.k] = { v: p.k === 'promien' ? +p.v : p.v, ts: +p.t }; return { ok: true, wynik: { zapisano: true } };
      case 'mgAnuluj': S.zamowienia = S.zamowienia.filter(x => x.id !== String(p.id)); return { ok: true, wynik: true };
      case 'mgPlan': { S.plan = S.plan.filter(x => x.kod !== p.kod).concat([{ kod: p.kod, klasa: p.klasa, docelowo: +p.docelowo }]); const m = S.magazyn.find(x => x.kod === p.kod); if (m) m.min = String(p.prog); return { ok: true, wynik: true }; }
      case 'odrzuc': { const x = S.prace.find(y => y.nr === p.nr); if (x) x.status = p.cofnij === '1' ? 'zlecenie' : 'anulowane'; return { ok: true, wynik: true }; }
      case 'notatnikZapisz': return { ok: true, wynik: p.tak === '1' ? { zapisane: true, komunikaty: ['Zapisano dzień pracy (demo): 2 prace, koniec dnia 14:20.'], pytania: [] } : { anulowane: true } };
      case 'bezRaportu': { const x = S.prace.find(y => y.nr === p.nr); if (!x) return { ok: false, blad: 'Nie znalazłem zlecenia' }; x.status = p.cofnij === '1' ? 'czeka_na_raport' : 'gotowe'; return { ok: true, wynik: { nr: p.nr, status: x.status } }; }
      case 'notatnikOdp': return { ok: true, wynik: { ok: true } };
      case 'popraw': return { ok: true, wynik: popraw(body) };
      case 'dokument': return { ok: true, wynik: /notes|notatnik/i.test(String(body.nazwa || '')) ? notes() : dokument() };
      case 'notatnik': return { ok: true, wynik: notes() };
      case 'przeglad': return { ok: true, wynik: { url: '#', typ: 'raport' } };
      case 'przSzkic': { let Z; try { Z = JSON.parse(sessionStorage.getItem('demoSzkice') || '{}'); } catch (e) { Z = {}; } const a = body.akcja, zapisz = () => { try { sessionStorage.setItem('demoSzkice', JSON.stringify(Z)); } catch (e) { /* pełne */ } };
        if (a === 'lista') return { ok: true, lista: Object.values(Z).map(z => z.x ? { id: z.id, zm: z.zm, x: 1 } : { id: z.id, myjnia: z.myjnia, data: z.data, zm: z.zm, ile: body.ile || 0, w: z.wyslany || '', x: 0 }) };
        if (a === 'pobierz') return { ok: true, szkic: Z[body.id] && !Z[body.id].x ? Z[body.id] : { x: 1 } };
        if (a === 'usun') { Z[body.id] = { id: body.id, x: 1, zm: new Date().toISOString() }; zapisz(); return { ok: true, wynik: { zm: Z[body.id].zm } }; }
        if (a === 'zapisz') { const z = Z[body.szkic.id]; if (z && String(z.zm) > String(body.szkic.zm)) return { ok: true, wynik: { zapisano: false, zm: z.zm, x: z.x ? 1 : 0 } }; Z[body.szkic.id] = JSON.parse(JSON.stringify(body.szkic)); zapisz(); return { ok: true, wynik: { zapisano: true } }; }
        return { ok: false, blad: 'Nieznana akcja' }; }
      case 'przLista': {   // 18.11.2026: lista przeglądów z biura (listaprz.js)
        if (body.akcja === 'zapisz') { const zap = (body.wiersze || []).map(w => { const m = S.myjnie.find(x => x.nazwa === w.nazwa); if (m) m.termin = w.termin; return { nazwa: w.nazwa, termin: w.termin, nastepny: w.termin }; }); return { ok: true, wynik: { zapisane: zap, brak: [] } }; }
        const m = S.myjnie.slice(0, 2);
        return { ok: true, wynik: { wiersze: m.map((x, i) => ({ nr: (String(x.klucz).match(/\d{3,4}/) || [''])[0], stacja: x.nazwa, serwisant: 'Tomczakowski Wasyl', termin: '2026-12-1' + i, ostatni: '2026-09-1' + i })), niejasne: '' } };
      }
      case 'opisy': {   // 20.11.2026: opisy i zdjęcia części (opisy.js)
        let F; try { F = JSON.parse(sessionStorage.getItem('demoOpisyFoto') || '{}'); } catch (e) { F = {}; }
        const zap = () => { try { sessionStorage.setItem('demoOpisyFoto', JSON.stringify(F)); } catch (e) { /* pełne */ } };
        const a = body.akcja, kod = String(body.kod || ''), x = S.opisy.find(o => o.kod === kod);
        if (a === 'mini') { const w = {}; S.opisy.forEach(o => { if (o.f && F[o.kod]) w[o.kod] = F[o.kod].m; }); return { ok: true, wynik: w }; }
        if (a === 'pobierz') return F[kod] ? { ok: true, wynik: F[kod].f } : { ok: false, blad: 'Brak zdjęcia' };
        if (x && String(x.zm) > String(body.zm)) return { ok: true, wynik: { zapisano: false, kod: kod, o: x.o, f: x.f, zm: x.zm } };
        const w = x || { kod: kod, o: '', f: 0 }; if (!x) S.opisy.push(w);
        if (a === 'zapisz') w.o = String(body.o || '');
        else if (a === 'foto') { w.f = 1; F[kod] = { f: body.foto, m: body.mini }; zap(); }
        else if (a === 'usunFoto') { w.f = 0; delete F[kod]; zap(); }
        else return { ok: false, blad: 'Nieznana akcja' };
        w.zm = body.zm; return { ok: true, wynik: { zapisano: true, kod: kod, o: w.o, f: w.f, zm: w.zm } };
      }
      case 'pdf': return { ok: true, wynik: 'ok' };
      case 'asystent': { try { return { ok: true, wynik: asystent(body) }; } catch (e) { return { ok: false, blad: e.message }; } }
      default: return { ok: false, blad: 'Nieznana akcja (demo): ' + api };
    }
  }

  const fetchOryg = window.fetch.bind(window);
  window.fetch = function (url, init) {
    const u = String(url && url.url ? url.url : url);
    if (u.indexOf('/macros/s/DEMO/exec') < 0) return fetchOryg(url, init);
    const q = new URL(u).searchParams, api = q.get('api'), p = {};
    q.forEach((v, k) => { p[k] = v; });
    let body = {};
    try { body = init && init.body ? JSON.parse(init.body) : {}; } catch (e) { body = {}; }
    let tekst;
    if (api === 'sms') tekst = p.test ? 'DEMO: rozpoznano zlecenie SZL/2026/11/00235 · WLOSCIANSKA 6, POZNAN · Praca na sucho pompy glebinowej (nic nie zapisano)' : 'ok (demo)';
    else tekst = JSON.stringify(trasa(api, p, body));
    const opoz = api === 'asystent' ? 1400 : /popraw|dokument|notatnik$|notatkaMyjni|notatkaDzis/.test(api) ? 1100 : 250;
    return new Promise(res => setTimeout(() => res(new Response(tekst, { status: 200, headers: { 'Content-Type': 'application/json' } })), opoz));
  };
})();
