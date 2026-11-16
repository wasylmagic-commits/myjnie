/* Skaner dokumentów (17.11.2026): znajduje kartkę na zdjęciu, prostuje ją (perspektywa), wycina tło i poprawia czytelność
 * (usuwa cienie, wyrównuje biel, podbija kontrast – szarość, nie czarno-biały, żeby Claude czytał kwoty bez strat).
 * OpenCV.js (opencv.js, ~13 MB) ładuje się dopiero przy pierwszym zdjęciu dokumentu i zostaje w cache przeglądarki.
 * Wejście: base64 JPEG (max 1800 px). Wyjście: { b64, ok, powod }. Gdy kartki nie widać – ok:false i oryginał (aplikacja pokazuje przełącznik). */
(function () {
  let cvP = null;
  function laduj() {
    if (cvP) return cvP;
    cvP = new Promise((ok, no) => {
      if (window.cv && window.cv.Mat) return ok(window.cv);
      const s = document.createElement('script'); s.src = 'opencv.js';
      s.onerror = () => { cvP = null; no(new Error('nie mogę wczytać skanera (brak internetu?)')); };
      s.onload = () => {
        const g = window.cv;
        if (!g) { cvP = null; return no(new Error('skaner się nie uruchomił')); }
        if (g.Mat) return ok(g);
        if (typeof g.then === 'function') {            // nowsze buildy: cv to „obietnica” modułu
          g.then(m => { window.cv = m; ok(m); }, e => { cvP = null; no(e); });
        } else g.onRuntimeInitialized = () => ok(window.cv);
      };
      document.head.appendChild(s);
    });
    return cvP;
  }
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  function porzadek(p) {            // tl, tr, br, bl
    const sum = p.map(q => q[0] + q[1]), dif = p.map(q => q[0] - q[1]);
    return [p[sum.indexOf(Math.min.apply(0, sum))], p[dif.indexOf(Math.max.apply(0, dif))], p[sum.indexOf(Math.max.apply(0, sum))], p[dif.indexOf(Math.min.apply(0, dif))]];
  }
  function czworokat(cv, bin, A, mw, mh) {   // największy sensowny czworokąt na masce krawędzi/jasności
    const cs = new cv.MatVector(), h = new cv.Mat(); let best = null;
    cv.findContours(bin, cs, h, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
    for (let i = 0; i < cs.size(); i++) {
      const c = cs.get(i), pole = cv.contourArea(c);
      if (pole < A * 0.2 || pole > A * 0.985) { c.delete(); continue; }
      const hull = new cv.Mat(); cv.convexHull(c, hull, false, true);
      const per = cv.arcLength(hull, true); let pts = null;
      for (const e of [0.02, 0.03, 0.045, 0.06]) {
        const ap = new cv.Mat(); cv.approxPolyDP(hull, ap, e * per, true);
        if (ap.rows === 4) { pts = []; for (let k = 0; k < 4; k++) pts.push([ap.data32S[k * 2], ap.data32S[k * 2 + 1]]); ap.delete(); break; }
        ap.delete();
      }
      if (!pts) {                     // zaokrąglone rogi: prostokąt o minimalnym polu
        const r = cv.minAreaRect(hull), q = cv.RotatedRect.points(r); pts = q.map(z => [z.x, z.y]);
        const rp = r.size.width * r.size.height; if (pole / rp < 0.8) pts = null;
      }
      if (pts) {                       // kontur musi wypełniać swój czworokąt (inaczej to plama ze stołem/tłem, nie kartka)
        let qa = 0; for (let k = 0; k < 4; k++) { const u = pts[k], v = pts[(k + 1) % 4]; qa += u[0] * v[1] - v[0] * u[1]; } qa = Math.abs(qa) / 2;
        const wyp = pole / Math.max(qa, 1);
        const mx = mw * 0.02, my = mh * 0.02, brzeg = pts.filter(q => q[0] < mx || q[0] > mw - mx || q[1] < my || q[1] > mh - my).length;   // ramka zdjęcia, nie kartka
        if (wyp > 0.88 && wyp < 1.12 && brzeg < 3 && (!best || pole > best.pole)) best = { pole, pts };
      }
      hull.delete(); c.delete();
    }
    cs.delete(); h.delete(); return best;
  }
  function wykryj(cv, src) {
    const sc = Math.min(1, 520 / Math.max(src.cols, src.rows)), mw = Math.round(src.cols * sc), mh = Math.round(src.rows * sc);
    const mala = new cv.Mat(), g = new cv.Mat(), bl = new cv.Mat();
    cv.resize(src, mala, new cv.Size(mw, mh), 0, 0, cv.INTER_AREA);
    cv.cvtColor(mala, g, cv.COLOR_RGBA2GRAY); cv.GaussianBlur(g, bl, new cv.Size(5, 5), 0);
    const A = mw * mh, k = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5)); let najl = null;
    const e = new cv.Mat(); cv.Canny(bl, e, 40, 120); cv.dilate(e, e, k); cv.morphologyEx(e, e, cv.MORPH_CLOSE, k);
    najl = czworokat(cv, e, A, mw, mh); e.delete();
    const t = new cv.Mat(); cv.threshold(bl, t, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
    const k2 = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(21, 21)); cv.morphologyEx(t, t, cv.MORPH_OPEN, k2); cv.morphologyEx(t, t, cv.MORPH_CLOSE, k); k2.delete();
    const b2 = czworokat(cv, t, A, mw, mh); t.delete();
    if (b2 && (!najl || b2.pole > najl.pole)) najl = b2;
    k.delete(); mala.delete(); g.delete(); bl.delete();
    return najl ? porzadek(najl.pts.map(p => [p[0] / sc, p[1] / sc])) : null;
  }
  function popraw(cv, m) {            // usuń cień i tło papieru, podbij kontrast
    const g = new cv.Mat(); cv.cvtColor(m, g, cv.COLOR_RGBA2GRAY);
    const sc = Math.min(1, 500 / Math.max(g.cols, g.rows)), s = new cv.Mat(), bg = new cv.Mat(), bgF = new cv.Mat(), out = new cv.Mat();
    cv.resize(g, s, new cv.Size(Math.round(g.cols * sc), Math.round(g.rows * sc)), 0, 0, cv.INTER_AREA);
    const k = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(11, 11));
    cv.morphologyEx(s, bg, cv.MORPH_CLOSE, k); cv.GaussianBlur(bg, bg, new cv.Size(21, 21), 0);
    cv.resize(bg, bgF, new cv.Size(g.cols, g.rows), 0, 0, cv.INTER_LINEAR);
    cv.divide(g, bgF, out, 255);
    cv.convertScaleAbs(out, out, 1.3, -55);
    g.delete(); s.delete(); bg.delete(); bgF.delete(); k.delete();
    return out;
  }
  function doJpeg(cv, m) { const c = document.createElement('canvas'); cv.imshow(c, m); return c.toDataURL('image/jpeg', .85).split(',')[1]; }
  function obraz(b64) { return new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => no(new Error('to nie jest zdjęcie')); im.src = 'data:image/jpeg;base64,' + b64; }); }

  window.skanDokument = async function (b64) {
    const cv = await laduj(), im = await obraz(b64), c0 = document.createElement('canvas');
    c0.width = im.naturalWidth; c0.height = im.naturalHeight; c0.getContext('2d').drawImage(im, 0, 0);
    const src = cv.imread(c0), W = src.cols, H = src.rows, mats = [src];
    try {
      let p = wykryj(cv, src);
      if (p) { const cx = (p[0][0] + p[1][0] + p[2][0] + p[3][0]) / 4, cy = (p[0][1] + p[1][1] + p[2][1] + p[3][1]) / 4;   // 1,2% do środka: bez ciemnej obwódki stołu
        p = p.map(q => [q[0] + (cx - q[0]) * 0.012, q[1] + (cy - q[1]) * 0.012]); }
      let m = src, ok = false, powod = 'nie widzę krawędzi kartki';
      if (p) {
        const w = Math.round(Math.max(dist(p[0], p[1]), dist(p[3], p[2]))), h = Math.round(Math.max(dist(p[0], p[3]), dist(p[1], p[2])));
        if (w > 150 && h > 150 && w * h > W * H * 0.2) {
          const a = cv.matFromArray(4, 1, cv.CV_32FC2, [].concat.apply([], p)), d = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, w, 0, w, h, 0, h]);
          const M = cv.getPerspectiveTransform(a, d), o = new cv.Mat();
          cv.warpPerspective(src, o, M, new cv.Size(w, h), cv.INTER_LINEAR, cv.BORDER_REPLICATE);
          a.delete(); d.delete(); M.delete(); mats.push(o); m = o; ok = true; powod = '';
        }
      }
      const g = popraw(cv, m); mats.push(g);        // poprawa kontrastu także gdy nie znaleziono kartki (całe zdjęcie)
      return { b64: doJpeg(cv, g), ok: ok, powod: powod, kadr: ok, rogi: p };
    } finally { mats.forEach(x => x.delete()); }
  };
})();
