// sms.js – zlecenia z SMS WebCon (15.11.2026)
// MacroDroid na telefonie wysyła każdy SMS od Corrimex do bota (api=sms), bot zapisuje zlecenie w Dane (status „zlecenie”).
// Tutaj: karta „Nowe zlecenia” na Dziś (Jedź / Odrzuć + Cofnij) i arkusz „SMS z WebCon” w Więcej (adres dla MacroDroid + test).
(function () {
  const adresZl = p => ((String(p.kl || '').match(/^SMS: ([^|]+)/) || [])[1] || '').trim();
  const myjniaZl = p => p.firma ? D.myjnie.concat(D.inne).find(w => sama(p.firma, w)) : null;
  const nrKr = nr => String(nr || '').split('/').pop();
  let WSZYSTKIE = false;

  window.zleceniaNowe = () => (D && D.prace ? D.prace.filter(p => p.status === 'zlecenie') : []).sort((a, b) => (b.d || '').localeCompare(a.d || '') || String(b.nr).localeCompare(String(a.nr)));

  window.zleceniaKarta = function () {
    const z = zleceniaNowe();
    if (!z.length) return '<div class="card" id="zlk"><h3>' + I('alert', 1) + 'Nowe zlecenia</h3><div class="mute">Brak nowych zleceń</div></div>';
    const widoczne = WSZYSTKIE ? z : z.slice(0, 5);
    return '<div class="card" id="zlk"><h3>' + I('alert', 1) + 'Nowe zlecenia (' + z.length + ')</h3>' + widoczne.map(p => {
      const w = myjniaZl(p), adr = adresZl(p);
      const kto = w ? skrot(w.nazwa) : (adr || p.miejsce || 'myjnia spoza listy');
      return '<div class="row" style="align-items:flex-start"><div class="g"><b>' + esc(kto) + '</b>' +
        (p.rodzaj ? ' <span class="pill ' + (/AWK|nieczynna/i.test(p.rodzaj) ? 'r' : 'o') + '">' + esc(p.rodzaj) + '</span>' : '') +
        '<div class="mute">' + esc(nrKr(p.nr)) + ' · ' + dt(p.d) + (w && adr ? ' · ' + esc(adr) : '') + '</div>' +
        (p.opis ? '<div style="font-size:14px;margin-top:2px">' + esc(p.opis) + '</div>' : '') +
        '<div class="ab" style="margin-top:8px"><button class="btn" onclick="zlJedz(\'' + jsq(p.nr) + '\')">' + I('route', 1) + ' Jedź</button>' +
        '<button class="btn2" onclick="zlOdrzuc(\'' + jsq(p.nr) + '\',this)">Odrzuć</button></div></div></div>';
    }).join('') + (z.length > 5 ? '<button class="btn2" style="margin-top:8px" onclick="zlWszystkie()">' + (WSZYSTKIE ? 'Pokaż mniej' : 'Pokaż wszystkie (' + z.length + ')') + '</button>' : '') + '</div>';
  };

  window.zlWszystkie = () => { WSZYSTKIE = !WSZYSTKIE; render(); };

  window.zlJedz = function (nr) {
    const p = D.prace.find(x => x.nr === nr); if (!p) return;
    const w = myjniaZl(p);
    if (w) { przedWyjazdem(w.nazwa); return; }
    const adr = adresZl(p) || p.miejsce;
    if (adr) window.open('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(adr), '_blank');
  };

  window.zlOdrzuc = function (nr, el) {
    const p = D.prace.find(x => x.nr === nr); if (!p) return;
    if (el) el.disabled = true;
    const blad = e => { toast(/Nieznan|akcja/i.test(e.message) ? 'Najpierw zainstaluj aktualizację bota (/aktualizuj)' : 'Błąd: ' + e.message); if (el) el.disabled = false; };
    api('odrzuc', { nr: nr }).then(() => {
      p.status = 'anulowane'; render();
      toastAkcja('Odrzucone: ' + nrKr(nr), 'Cofnij', () => api('odrzuc', { nr: nr, cofnij: 1 }).then(() => { p.status = 'zlecenie'; render(); }).catch(blad));
    }).catch(blad);
  };

  // Więcej → „SMS z WebCon”: adres do wklejenia w MacroDroid + test bez zapisu
  const PROBKA = '(Nowe zlec. SZL/2026/11/00235) 2026-11-08T21:47:00 - WLOSCIANSKA 6, 60-681 POZNAN - - Praca na sucho pompy glebinowej';
  const adresMD = () => API + '?api=sms&k=' + encodeURIComponent(K);
  window.smsUstaw = function () {
    const a = document.getElementById('ark');
    a.innerHTML = '<div class="tlo" onclick="arkZamknij()"></div><div class="ar" style="max-height:86vh;overflow:auto"><h4>' + I('phone', 1) + ' SMS z WebCon → system</h4>' +
      '<div class="mute" style="font-size:14px">MacroDroid wysyła każdy SMS od Corrimex do bota. Nowe zlecenie pojawia się na Dziś, a w telefonie wyskakuje powiadomienie.</div>' +
      '<h4 style="margin:14px 0 4px;font-size:15px">Adres dla MacroDroid (URL)</h4>' +
      '<div style="word-break:break-all;font-size:12px;padding:8px;border-radius:10px;background:var(--solid)">' + esc(adresMD()) + '</div>' +
      '<div class="ab" style="margin-top:8px"><button class="btn" onclick="smsKopiuj()">Kopiuj adres</button><button class="btn2" onclick="smsTest()">Test</button></div>' +
      '<div id="smsWynik" class="mute" style="white-space:pre-wrap;font-size:13px;margin-top:8px"></div>' +
      '<div class="mute" style="font-size:13px;margin-top:10px">W MacroDroid: Zapytanie HTTP → GET → ten adres, w „Parametry zapytania” dodaj <b>t</b> = treść SMS-a. Test sprawdza tylko rozbiór – nic nie zapisuje.</div>' +
      '<div class="ab" style="margin-top:12px"><button class="btn2" onclick="arkZamknij()">Zamknij</button></div></div>';
    a.classList.add('on');
  };
  window.smsKopiuj = () => navigator.clipboard.writeText(adresMD()).then(() => toast('Skopiowane – wklej w MacroDroid'), () => toast('Nie udało się skopiować – przytrzymaj adres palcem'));
  window.smsTest = function () {
    const out = document.getElementById('smsWynik'); out.textContent = 'Sprawdzam…';
    fetch(adresMD() + '&test=1&t=' + encodeURIComponent(PROBKA), { redirect: 'follow' }).then(r => r.text()).then(t => {
      if (/^\s*\{/.test(t) && /Nieznana akcja/.test(t)) t = 'Bot jeszcze bez aktualizacji – zainstaluj aktualizację (/aktualizuj).';
      out.textContent = t || '(pusta odpowiedź)';
    }).catch(e => { out.textContent = 'Błąd: ' + e.message; });
  };
})();
