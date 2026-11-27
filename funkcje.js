/* funkcje.js – miękka informacja, gdy aplikacja ma już nową funkcję, a system (bot) jeszcze jej nie ma (27.11.2026).
 * Bot w danych (D.funkcje) podaje listę funkcji, które umie (Funkcje.gs → FUNKCJE_BOTA). Brak listy = stary bot
 * bez tej listy: niczego nie blokujemy (zachowanie jak dotąd). Nowa funkcja w aplikacji: maFunkcje('nazwa') + wpis w Funkcje.gs.
 */
(function () {
  window.maFunkcje = k => { const f = (typeof D !== 'undefined' && D) ? D.funkcje : null; return !Array.isArray(f) || f.indexOf(k) >= 0; };
  window.MIEKKO = 'Ta funkcja jest już w aplikacji, ale jeszcze przechodzi próby na żywym systemie. U Ciebie włączy się sama, zwykle w ciągu doby. To nie błąd – nic nie musisz robić.';
  window.wkrotce = function (nazwa) {
    const a = document.getElementById('ark'); if (!a) return;
    a.innerHTML = '<div class="tlo" onclick="arkZamknij()"></div><div class="ar"><h4>' + esc(nazwa || 'Nowa funkcja') + ' – wkrótce u Ciebie</h4>' +
      '<div class="mute" style="font-size:14px;line-height:1.45;margin:6px 0 12px">Ta funkcja jest już w aplikacji, ale najpierw przechodzi próby na żywym systemie. ' +
      'U Ciebie włączy się sama, zwykle w ciągu doby – <b>to nie jest błąd</b> i nic nie musisz robić.</div>' +
      '<div class="ab"><button class="btn" onclick="arkZamknij()">OK, rozumiem</button></div></div>';
    a.classList.add('on');
  };
})();
