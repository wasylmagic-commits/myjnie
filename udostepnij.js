/* Udostępnij → Serwis myjni (15.11.2026).
 * Android: w Outlooku otwierasz PDF raportu → „Udostępnij” → „Serwis myjni”.
 * sw.js łapie plik (share_target w manifest.json), odkłada w pamięci podręcznej „udostepnione” i otwiera aplikację z ?udost=1.
 * Tu: wysyłka do Apps Script (POST …/exec?api=pdf) – ta sama droga co plik wysłany do bota (premia liczy się sama), bez Telegrama.
 * Bez internetu / błąd – plik czeka w telefonie i idzie przy następnym otwarciu aplikacji.
 */
(function () {
  const b64 = blob => new Promise((ok, zle) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1] || ''); fr.onerror = zle; fr.readAsDataURL(blob); });
  const pokaz = t => { try { toast(t); } catch (e) {} };
  let trwa = false;

  window.wyslijUdostepnione = async function () {
    if (trwa || !('caches' in window) || typeof K === 'undefined' || !K || !API) return;
    trwa = true;
    try {
      const c = await caches.open('udostepnione'), kl = await c.keys();
      for (const req of kl) {
        const res = await c.match(req); if (!res) continue;
        const blob = await res.blob(), nazwa = decodeURIComponent(res.headers.get('X-Nazwa') || '') || 'plik', rid = req.url.split('/').pop();
        // 18.11.2026: Excel z biura (lista przeglądów) – nie do bota jako dokument, tylko do karty „Lista z biura” (listaprz.js)
        if (/sheet|excel/i.test(blob.type || '') || /\.xlsx?$/i.test(nazwa)) {
          await c.delete(req);
          const plik = new File([blob], nazwa, { type: blob.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          const start = () => { if (typeof D !== 'undefined' && D && window.lpPlik) { go('przeglady'); lpPlik(plik); } else setTimeout(start, 500); };
          start(); continue;
        }
        pokaz('Wysyłam ' + nazwa + '…');
        try {
          const r = await fetch(API + '?api=pdf', {
            method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ k: K, rid: rid, nazwa: nazwa, mime: blob.type || '', b64: await b64(blob) })
          });
          const t = await r.text(); let j;
          try { j = JSON.parse(t); } catch (e) { throw new Error('serwer nie odpowiedział poprawnie'); }
          if (!j.ok) throw new Error(j.blad || 'błąd serwera');
          await c.delete(req);
          // 18.11.2026: silnik (apiPdf2_) odsyła powiadomienia – „przyszedł raport …”, pytania z przyciskami (powiadomienia.js)
          if ((j.powiadomienia || []).length && window.pwPokazNowe) pwPokazNowe(j.powiadomienia);
          else pokaz('Przyjęte: ' + nazwa);
        } catch (e) {
          pokaz(/Nieznana|akcja|poprawnie/i.test(e.message) ? 'Najpierw zainstaluj aktualizację bota (/aktualizuj) – plik czeka w telefonie'
            : 'Nie wysłano (' + e.message + ') – spróbuję przy następnym otwarciu');
          break;
        }
      }
    } catch (e) { /* brak cache – nic do wysłania */ }
    finally {
      trwa = false;
      if (/[?&]udost=1/.test(location.search)) history.replaceState(null, '', location.pathname + location.hash);
    }
  };
  window.addEventListener('load', () => setTimeout(window.wyslijUdostepnione, 400));
  window.addEventListener('online', () => window.wyslijUdostepnione());
})();
