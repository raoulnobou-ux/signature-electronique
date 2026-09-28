/* Signature Électronique — tout est traité localement dans le navigateur.
 * pdf.js (pdfjsLib) affiche le document, pdf-lib (PDFLib) produit le PDF signé. */
(function () {
  "use strict";

  pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";

  const STORAGE_KEY = "signature-electronique:signatures";
  const MAX_PAGE_CSS_WIDTH = 850;

  const state = {
    fileName: "",
    pdfBytes: null,     // Uint8Array du PDF original
    pages: [],          // [{ el, aspect }] ; aspect = largeur / hauteur affichées
    stamps: [],         // [{ id, page, src, imgAspect, fx, fy, fw, fh, el }]
    selectedId: null,
    currentPage: 0,
    saved: [],          // dataURL PNG des signatures enregistrées
  };

  const $ = (sel) => document.querySelector(sel);
  const viewer = $("#viewer");

  // ---------- Utilitaires ----------

  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 3000);
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Image illisible"));
      img.src = src;
    });
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(new Uint8Array(r.result));
      r.onerror = () => reject(r.error);
      r.readAsArrayBuffer(file);
    });
  }

  function dataUrlToBytes(dataUrl) {
    const bin = atob(dataUrl.split(",")[1]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  // Recadre un canvas sur ses pixels non transparents et renvoie un PNG.
  function trimCanvas(canvas, padding = 6) {
    const ctx = canvas.getContext("2d");
    const { width, height } = canvas;
    const data = ctx.getImageData(0, 0, width, height).data;
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 10) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null;
    minX = Math.max(0, minX - padding);
    minY = Math.max(0, minY - padding);
    maxX = Math.min(width - 1, maxX + padding);
    maxY = Math.min(height - 1, maxY + padding);
    const out = document.createElement("canvas");
    out.width = maxX - minX + 1;
    out.height = maxY - minY + 1;
    out.getContext("2d").drawImage(canvas, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
    return out.toDataURL("image/png");
  }

  function baseName(name) {
    return name.replace(/\.[^.]+$/, "") || "document";
  }

  // ---------- Signatures enregistrées ----------

  function loadSaved() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      state.saved = raw ? JSON.parse(raw) : [];
    } catch (e) {
      state.saved = [];
    }
    renderSaved();
  }

  function persistSaved() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.saved));
    } catch (e) {
      toast("Signature gardée pour cette session seulement (stockage du navigateur indisponible).");
    }
  }

  function addSaved(dataUrl) {
    state.saved.unshift(dataUrl);
    persistSaved();
    renderSaved();
    if (state.pages.length) {
      addStamp(dataUrl);
      toast("Signature enregistrée et posée sur la page " + (state.currentPage + 1) + ".");
    } else {
      toast("Signature enregistrée. Ouvrez un document pour la poser.");
    }
  }

  function renderSaved() {
    const list = $("#saved-list");
    list.innerHTML = "";
    if (!state.saved.length) {
      list.innerHTML = '<p class="empty">Aucune signature pour l\'instant.</p>';
      return;
    }
    state.saved.forEach((src, i) => {
      const item = document.createElement("div");
      item.className = "saved-item";
      item.title = "Poser sur la page affichée";
      const img = document.createElement("img");
      img.src = src;
      img.alt = "Signature " + (i + 1);
      const del = document.createElement("button");
      del.className = "del";
      del.textContent = "×";
      del.title = "Supprimer cette signature";
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        state.saved.splice(i, 1);
        persistSaved();
        renderSaved();
      });
      item.addEventListener("click", () => {
        if (!state.pages.length) return toast("Ouvrez d'abord un document.");
        addStamp(src);
      });
      item.append(img, del);
      list.append(item);
    });
  }

  // ---------- Onglets ----------

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === tab));
      document.querySelectorAll(".tab-panel").forEach((p) => {
        p.hidden = p.dataset.panel !== tab.dataset.tab;
      });
      if (tab.dataset.tab === "draw") resizePad();
      if (tab.dataset.tab === "type") updateTypePreview();
    });
  });

  // ---------- Dessin de la signature ----------

  const pad = $("#pad");
  const padCtx = pad.getContext("2d");
  let strokes = [];      // [[{x,y}], ...] en pixels CSS
  let drawing = null;

  function resizePad() {
    const rect = pad.getBoundingClientRect();
    if (!rect.width) return;
    const dpr = window.devicePixelRatio || 1;
    pad.width = Math.round(rect.width * dpr);
    pad.height = Math.round(rect.height * dpr);
    redrawPad();
  }

  function drawStrokes(ctx, scale) {
    ctx.strokeStyle = $("#pad-color").value;
    ctx.lineWidth = parseFloat($("#pad-width").value) * scale;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const pts of strokes) {
      ctx.beginPath();
      if (pts.length === 1) {
        ctx.arc(pts[0].x * scale, pts[0].y * scale, ctx.lineWidth / 2, 0, Math.PI * 2);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fill();
        continue;
      }
      ctx.moveTo(pts[0].x * scale, pts[0].y * scale);
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i].x + pts[i + 1].x) / 2;
        const my = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x * scale, pts[i].y * scale, mx * scale, my * scale);
      }
      const last = pts[pts.length - 1];
      ctx.lineTo(last.x * scale, last.y * scale);
      ctx.stroke();
    }
  }

  function redrawPad() {
    padCtx.clearRect(0, 0, pad.width, pad.height);
    drawStrokes(padCtx, pad.width / pad.getBoundingClientRect().width || 1);
  }

  function padPoint(e) {
    const r = pad.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  pad.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    pad.setPointerCapture(e.pointerId);
    drawing = [padPoint(e)];
    strokes.push(drawing);
    redrawPad();
  });
  pad.addEventListener("pointermove", (e) => {
    if (!drawing) return;
    drawing.push(padPoint(e));
    redrawPad();
  });
  const endStroke = () => { drawing = null; };
  pad.addEventListener("pointerup", endStroke);
  pad.addEventListener("pointercancel", endStroke);

  $("#pad-clear").addEventListener("click", () => { strokes = []; redrawPad(); });
  $("#pad-color").addEventListener("change", redrawPad);
  $("#pad-width").addEventListener("input", redrawPad);

  $("#pad-save").addEventListener("click", () => {
    if (!strokes.length) return toast("Dessinez votre signature dans le cadre.");
    // Rendu en haute définition pour une impression nette.
    const cssW = pad.getBoundingClientRect().width;
    const cssH = pad.getBoundingClientRect().height;
    const scale = 4;
    const c = document.createElement("canvas");
    c.width = cssW * scale;
    c.height = cssH * scale;
    drawStrokes(c.getContext("2d"), scale);
    const png = trimCanvas(c, 8);
    if (!png) return;
    strokes = [];
    redrawPad();
    addSaved(png);
  });

  window.addEventListener("resize", resizePad);

  // ---------- Signature tapée ----------

  function updateTypePreview() {
    const p = $("#type-preview");
    const text = $("#type-text").value.trim();
    p.style.fontFamily = `"${$("#type-font").value}", cursive`;
    p.textContent = text || "Aperçu";
  }
  $("#type-text").addEventListener("input", updateTypePreview);
  $("#type-font").addEventListener("change", updateTypePreview);

  $("#type-save").addEventListener("click", async () => {
    const text = $("#type-text").value.trim();
    if (!text) return toast("Tapez votre nom.");
    const family = $("#type-font").value;
    const font = `160px "${family}", cursive`;
    try { await document.fonts.load(font, text); } catch (e) { /* police de secours */ }
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d");
    ctx.font = font;
    const w = Math.ceil(ctx.measureText(text).width) + 120;
    c.width = w;
    c.height = 300;
    ctx.font = font;
    ctx.fillStyle = "#0b1f5c";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 60, 150);
    const png = trimCanvas(c, 10);
    if (png) addSaved(png);
  });

  // ---------- Image importée (signature scannée ou cachet) ----------

  let uploadImage = null;
  $("#sig-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    uploadImage = null;
    $("#upload-save").disabled = true;
    if (!file) return;
    try {
      uploadImage = await loadImage(URL.createObjectURL(file));
      $("#upload-save").disabled = false;
    } catch (err) {
      toast("Impossible de lire cette image.");
    }
  });

  $("#upload-save").addEventListener("click", () => {
    if (!uploadImage) return;
    const max = 1400;
    const ratio = Math.min(1, max / Math.max(uploadImage.naturalWidth, uploadImage.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(uploadImage.naturalWidth * ratio);
    c.height = Math.round(uploadImage.naturalHeight * ratio);
    const ctx = c.getContext("2d");
    ctx.drawImage(uploadImage, 0, 0, c.width, c.height);
    if ($("#sig-remove-bg").checked) {
      const img = ctx.getImageData(0, 0, c.width, c.height);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        // Fond clair → transparent, avec une transition douce pour éviter l'effet crénelé.
        if (lum >= 215) d[i + 3] = 0;
        else if (lum > 165) d[i + 3] = Math.round(d[i + 3] * (215 - lum) / 50);
      }
      ctx.putImageData(img, 0, 0);
    }
    const png = trimCanvas(c, 4);
    if (!png) return toast("L'image semble vide après suppression du fond. Décochez l'option.");
    addSaved(png);
    $("#sig-file").value = "";
    uploadImage = null;
    $("#upload-save").disabled = true;
  });

  // ---------- Ouverture du document ----------

  const fileInput = $("#file-input");
  const dropzone = $("#dropzone");
  fileInput.addEventListener("change", () => fileInput.files[0] && openFile(fileInput.files[0]));
  ["dragenter", "dragover"].forEach((ev) => dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.add("over");
  }));
  ["dragleave", "drop"].forEach((ev) => dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.remove("over");
  }));
  dropzone.addEventListener("drop", (e) => {
    const f = e.dataTransfer.files[0];
    if (f) openFile(f);
  });

  async function imageToPdf(file, bytes) {
    const doc = await PDFLib.PDFDocument.create();
    const isPng = file.type === "image/png" || /\.png$/i.test(file.name);
    const img = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    const width = 595.28; // largeur A4 en points
    const height = width * img.height / img.width;
    const page = doc.addPage([width, height]);
    page.drawImage(img, { x: 0, y: 0, width, height });
    return doc.save();
  }

  async function openFile(file) {
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    const isImage = /^image\/(png|jpeg)$/.test(file.type) || /\.(png|jpe?g)$/i.test(file.name);
    if (/\.(docx?|odt)$/i.test(file.name)) {
      return toast("Pour un document Word, enregistrez-le d'abord en PDF (Fichier → Enregistrer sous → PDF).");
    }
    if (!isPdf && !isImage) return toast("Format non pris en charge. Utilisez un PDF, JPG ou PNG.");

    try {
      let bytes = await readFile(file);
      if (isImage) bytes = await imageToPdf(file, bytes);
      // Vérifie tout de suite que pdf-lib pourra réécrire le fichier.
      await PDFLib.PDFDocument.load(bytes);
      state.pdfBytes = bytes;
      state.fileName = file.name;
      await renderDocument();
      $("#doc-name").hidden = false;
      $("#doc-name").textContent = "📄 " + file.name + " — " + state.pages.length + " page(s)";
      setDocButtons(true);
    } catch (err) {
      console.error(err);
      if (/encrypt/i.test(String(err && err.message))) {
        toast("Ce PDF est protégé par mot de passe : impossible de le signer ici.");
      } else {
        toast("Impossible d'ouvrir ce fichier.");
      }
    } finally {
      fileInput.value = "";
    }
  }

  function setDocButtons(enabled) {
    ["#btn-download", "#btn-print", "#btn-date", "#btn-all-pages", "#btn-clear-all"].forEach((s) => {
      $(s).disabled = !enabled;
    });
  }

  async function renderDocument() {
    const pdf = await pdfjsLib.getDocument({ data: state.pdfBytes.slice() }).promise;
    state.stamps = [];
    state.selectedId = null;
    state.pages = [];
    state.currentPage = 0;
    viewer.innerHTML = "";

    const dpr = window.devicePixelRatio || 1;
    const cssWidth = Math.min(MAX_PAGE_CSS_WIDTH, viewer.clientWidth - 32);

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(3, (cssWidth * dpr) / base.width);
      const vp = page.getViewport({ scale });

      const el = document.createElement("div");
      el.className = "page";
      el.style.width = cssWidth + "px";
      el.style.maxWidth = "100%";
      el.style.aspectRatio = `${base.width} / ${base.height}`;
      el.dataset.index = i - 1;

      const label = document.createElement("span");
      label.className = "page-label";
      label.textContent = `Page ${i} / ${pdf.numPages}`;

      const canvas = document.createElement("canvas");
      canvas.className = "render";
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      el.append(label, canvas);
      viewer.append(el);

      el.addEventListener("pointerdown", (e) => {
        setCurrentPage(i - 1);
        if (e.target === el || e.target === canvas) select(null);
      });

      state.pages.push({ el, aspect: base.width / base.height });
      await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
    }
    setCurrentPage(0);
    viewer.scrollTop = 0;
  }

  function setCurrentPage(i) {
    state.currentPage = i;
    state.pages.forEach((p, idx) => p.el.classList.toggle("current", idx === i && state.pages.length > 1));
  }

  // Page « courante » = celle qui occupe le plus d'espace visible.
  function updateCurrentFromScroll() {
    if (!state.pages.length) return;
    const vr = viewer.getBoundingClientRect();
    const top = Math.max(vr.top, 0);
    const bottom = Math.min(vr.bottom, window.innerHeight);
    let best = 0, bestVisible = -1;
    state.pages.forEach((p, i) => {
      const r = p.el.getBoundingClientRect();
      const visible = Math.min(r.bottom, bottom) - Math.max(r.top, top);
      if (visible > bestVisible) { bestVisible = visible; best = i; }
    });
    if (best !== state.currentPage) setCurrentPage(best);
  }
  viewer.addEventListener("scroll", updateCurrentFromScroll, { passive: true });
  window.addEventListener("scroll", updateCurrentFromScroll, { passive: true });

  // ---------- Placement des signatures ----------

  let nextId = 1;

  async function addStamp(src, opts = {}) {
    const img = await loadImage(src);
    const pageIndex = opts.page ?? state.currentPage;
    const page = state.pages[pageIndex];
    const imgAspect = img.naturalWidth / img.naturalHeight;
    const fw = opts.fw ?? Math.min(0.28, 0.12 * imgAspect);
    const fh = fw * page.aspect / imgAspect;
    const stamp = {
      id: nextId++,
      page: pageIndex,
      src,
      imgAspect,
      fw,
      fh,
      fx: opts.fx ?? Math.max(0, 0.92 - fw),
      fy: opts.fy ?? Math.max(0, Math.min(1 - fh, 0.8)),
    };
    createStampEl(stamp);
    state.stamps.push(stamp);
    select(stamp.id);
    if (!opts.silent) stamp.el.scrollIntoView({ block: "center", behavior: "smooth" });
    return stamp;
  }

  function positionStamp(s) {
    Object.assign(s.el.style, {
      left: s.fx * 100 + "%",
      top: s.fy * 100 + "%",
      width: s.fw * 100 + "%",
      height: s.fh * 100 + "%",
    });
  }

  function createStampEl(s) {
    const el = document.createElement("div");
    el.className = "stamp";
    const img = document.createElement("img");
    img.src = s.src;
    img.alt = "";
    img.draggable = false;
    const handle = document.createElement("div");
    handle.className = "handle";
    handle.title = "Redimensionner";
    const remove = document.createElement("button");
    remove.className = "remove";
    remove.textContent = "×";
    remove.title = "Retirer";
    el.append(img, handle, remove);
    s.el = el;
    positionStamp(s);
    state.pages[s.page].el.append(el);

    remove.addEventListener("pointerdown", (e) => e.stopPropagation());
    remove.addEventListener("click", (e) => {
      e.stopPropagation();
      removeStamp(s.id);
    });

    const pageEl = state.pages[s.page].el;
    const pageAspect = state.pages[s.page].aspect;

    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      select(s.id);
      setCurrentPage(s.page);
      const resizing = e.target === handle;
      const rect = pageEl.getBoundingClientRect();
      const start = { x: e.clientX, y: e.clientY, fx: s.fx, fy: s.fy, fw: s.fw };
      el.setPointerCapture(e.pointerId);

      const move = (ev) => {
        const dx = (ev.clientX - start.x) / rect.width;
        const dy = (ev.clientY - start.y) / rect.height;
        if (resizing) {
          let fw = Math.max(0.03, start.fw + dx);
          fw = Math.min(fw, 1 - s.fx, (1 - s.fy) * s.imgAspect / pageAspect);
          s.fw = fw;
          s.fh = fw * pageAspect / s.imgAspect;
        } else {
          s.fx = Math.min(Math.max(0, start.fx + dx), 1 - s.fw);
          s.fy = Math.min(Math.max(0, start.fy + dy), 1 - s.fh);
        }
        positionStamp(s);
      };
      const up = () => {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
        el.removeEventListener("pointercancel", up);
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
    });
  }

  function select(id) {
    state.selectedId = id;
    state.stamps.forEach((s) => s.el.classList.toggle("selected", s.id === id));
  }

  function removeStamp(id) {
    const i = state.stamps.findIndex((s) => s.id === id);
    if (i < 0) return;
    state.stamps[i].el.remove();
    state.stamps.splice(i, 1);
    if (state.selectedId === id) state.selectedId = null;
  }

  document.addEventListener("keydown", (e) => {
    if ((e.key === "Delete" || e.key === "Backspace") && state.selectedId &&
        !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
      e.preventDefault();
      removeStamp(state.selectedId);
    }
  });

  $("#btn-date").addEventListener("click", () => {
    const text = "Le " + new Date().toLocaleDateString("fr-FR");
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d");
    const font = "600 64px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
    ctx.font = font;
    c.width = Math.ceil(ctx.measureText(text).width) + 40;
    c.height = 110;
    ctx.font = font;
    ctx.fillStyle = "#111111";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 20, 55);
    const png = trimCanvas(c, 6);
    const page = state.pages[state.currentPage];
    const fw = Math.min(0.22, 0.03 * (c.width / c.height));
    addStamp(png, { fw, fx: 0.08, fy: Math.min(0.85, 1 - fw * page.aspect) });
  });

  $("#btn-all-pages").addEventListener("click", async () => {
    const src = state.stamps.find((s) => s.id === state.selectedId);
    if (!src) return toast("Sélectionnez d'abord une signature posée sur une page.");
    let count = 0;
    for (let p = 0; p < state.pages.length; p++) {
      if (p === src.page) continue;
      // Les pages peuvent avoir des formats différents : on garde la largeur relative
      // et on ramène la position à l'intérieur de la page.
      const s = await addStamp(src.src, { page: p, fw: src.fw, fx: src.fx, fy: src.fy, silent: true });
      s.fy = Math.min(s.fy, 1 - s.fh);
      positionStamp(s);
      count++;
    }
    select(src.id);
    toast(count ? `Copiée sur ${count} autre(s) page(s).` : "Le document n'a qu'une page.");
  });

  $("#btn-clear-all").addEventListener("click", () => {
    if (!state.stamps.length) return;
    if (!confirm("Retirer toutes les signatures posées sur le document ?")) return;
    state.stamps.slice().forEach((s) => removeStamp(s.id));
  });

  // ---------- Export du PDF signé ----------

  // Convertit une position relative à la page affichée (u vers la droite, v vers le bas)
  // en coordonnées PDF, en tenant compte de la rotation et de la zone visible de la page.
  function displayToPdf(page, u, v) {
    const box = page.getCropBox();
    const rot = ((page.getRotation().angle % 360) + 360) % 360;
    let a, b; // fractions dans la page non tournée, depuis le coin haut-gauche
    if (rot === 90) { a = v; b = 1 - u; }
    else if (rot === 180) { a = 1 - u; b = 1 - v; }
    else if (rot === 270) { a = 1 - v; b = u; }
    else { a = u; b = v; }
    return { x: box.x + a * box.width, y: box.y + (1 - b) * box.height };
  }

  async function buildSignedPdf() {
    const { PDFDocument, pushGraphicsState, popGraphicsState, concatTransformationMatrix, drawObject } = PDFLib;
    const doc = await PDFDocument.load(state.pdfBytes);
    const pages = doc.getPages();
    const embedded = new Map();

    for (const s of state.stamps) {
      let image = embedded.get(s.src);
      if (!image) {
        image = await doc.embedPng(dataUrlToBytes(s.src));
        embedded.set(s.src, image);
      }
      const page = pages[s.page];
      const name = page.node.newXObject("Sig", image.ref);
      // L'image occupe le carré unité : on l'envoie sur le rectangle choisi.
      const o = displayToPdf(page, s.fx, s.fy + s.fh);        // bas-gauche
      const r = displayToPdf(page, s.fx + s.fw, s.fy + s.fh); // bas-droite
      const t = displayToPdf(page, s.fx, s.fy);               // haut-gauche
      page.pushOperators(
        pushGraphicsState(),
        concatTransformationMatrix(r.x - o.x, r.y - o.y, t.x - o.x, t.y - o.y, o.x, o.y),
        drawObject(name),
        popGraphicsState()
      );
    }
    doc.setModificationDate(new Date());
    return doc.save();
  }

  async function signedBlobUrl() {
    if (!state.stamps.length && !confirm("Aucune signature n'est posée. Continuer quand même ?")) return null;
    const bytes = await buildSignedPdf();
    return URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  }

  $("#btn-download").addEventListener("click", async () => {
    try {
      const url = await signedBlobUrl();
      if (!url) return;
      const a = document.createElement("a");
      a.href = url;
      a.download = baseName(state.fileName) + "_signe.pdf";
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      toast("PDF signé téléchargé.");
    } catch (err) {
      console.error(err);
      toast("Erreur lors de la création du PDF signé.");
    }
  });

  $("#btn-print").addEventListener("click", async () => {
    try {
      const url = await signedBlobUrl();
      if (!url) return;
      const old = document.getElementById("print-frame");
      if (old) old.remove();
      const frame = document.createElement("iframe");
      frame.id = "print-frame";
      frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
      frame.src = url;
      frame.onload = () => {
        setTimeout(() => {
          try {
            frame.contentWindow.focus();
            frame.contentWindow.print();
          } catch (e) {
            window.open(url, "_blank"); // Navigateurs qui bloquent l'impression d'un PDF intégré
          }
        }, 300);
      };
      document.body.append(frame);
    } catch (err) {
      console.error(err);
      toast("Erreur lors de la préparation de l'impression.");
    }
  });

  // ---------- Démarrage ----------

  loadSaved();
  resizePad();
  updateTypePreview();

  // Point d'entrée pour les tests automatisés.
  window.__signature = { state, buildSignedPdf, addStamp };
})();
