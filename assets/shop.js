/* VoidSignal shop layer: region (EU/US), per-shop discounts, lazy 3D rack, lookbook.
   Everything here degrades to plain links: without JS the pages point at the EU shop. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const KEY = "vs-region";
  window.VS_RACK_BASE = "/assets/rack/";

  /* ---------- Region ---------- */
  const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) { return ""; } };
  const saved = () => { try { const v = localStorage.getItem(KEY); return v === "eu" || v === "us" ? v : null; } catch (e) { return null; } };
  let region = saved() || (tz().startsWith("America/") ? "us" : "eu");
  let CAT = null, DISC = null;

  const resolve = (name, k) => {
    const d = CAT && CAT.byName[name]; if (!d) return null;
    const pick = (r) => { const v = r.v[k] || r.v.tee; return CAT.shops[r === d.us ? "us" : "eu"] + "/" + r.page + "?sellable=" + v.s + "&appearance=" + v.a; };
    if (d[region]) return { href: pick(d[region]) };
    return { miss: true, href: pick(d.eu), label: "Open in the EU shop", note: "Not in the US shop yet" };
  };
  // The rack engine asks us where "Shop it" should go.
  window.VSRack = Object.assign(window.VSRack || {}, {
    link: (p, v) => { const r = resolve(p.name, v.k); return r ? Object.assign({ label: "Shop it" }, r) : null; },
  });

  const shopBase = () => (CAT ? CAT.shops[region] : region === "us" ? "https://void-signal.myspreadshop.com" : "https://voidsignal.myspreadshop.it");
  function applyLinks() {
    $$("[data-shop-path]").forEach((a) => { a.href = shopBase() + a.dataset.shopPath; });
    $$("a[data-design]").forEach((a) => {
      const r = resolve(a.dataset.design, "tee"); if (!r) return;
      a.href = r.href;
      const cta = $(".tee-cta", a);
      if (cta) { if (!cta.dataset.t) cta.dataset.t = cta.textContent; cta.textContent = r.miss ? "EU shop only" : cta.dataset.t; }
    });
    $$(".region button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.r === region)));
    document.documentElement.dataset.region = region;
  }

  /* ---------- Discounts (config: /assets/data/discounts.json, one entry per shop) ---------- */
  const root = document.documentElement;
  let clockT = 0;
  function applyDiscount() {
    clearTimeout(clockT);
    const d = DISC && DISC[region], end = d ? Date.parse(d.end) : 0;
    const on = !!(d && d.active && end > Date.now());
    const offer = $("#offer"), promo = $("#promo");
    if (offer) offer.hidden = !on;
    if (promo) promo.hidden = !on;
    root.style.setProperty("--promo-h", on ? "38px" : "0px");
    if (!on) return;
    const when = new Date(end).toLocaleDateString("en-GB", { day: "numeric", month: "long" });
    const text = (d.text || "") + " Ends " + when + "." + (d.code ? " Code " + d.code + "." : "");
    $("#offer-num").textContent = "−" + d.pct + "%";
    $("#offer-kicker").textContent = d.kicker || "Offer";
    $("#offer-text").textContent = text.trim();
    $("#promo-k").textContent = d.kicker || "Offer";
    $("#promo-t").textContent = d.pct + "% off the whole shop · ends " + when;
    const q = (u) => $('#clock [data-u="' + u + '"]'), p2 = (n) => String(n).padStart(2, "0");
    const tick = () => {
      const left = end - Date.now();
      if (left <= 0) { applyDiscount(); return; }
      q("d").textContent = p2(Math.floor(left / 864e5)); q("h").textContent = p2(Math.floor(left / 36e5) % 24);
      q("m").textContent = p2(Math.floor(left / 6e4) % 60); q("s").textContent = p2(Math.floor(left / 1e3) % 60);
      clockT = setTimeout(tick, 1000);
    };
    tick();
  }

  function setRegion(r, persist) {
    region = r;
    if (persist) { try { localStorage.setItem(KEY, r); } catch (e) { /* private mode */ } }
    applyLinks(); applyDiscount();
    window.VSRack && window.VSRack.repaint && window.VSRack.repaint();
  }
  $$(".region button").forEach((b) => b.addEventListener("click", () => setRegion(b.dataset.r, true)));
  applyLinks();

  fetch("/assets/data/catalogue.json").then((r) => r.json()).then((c) => {
    c.byName = Object.fromEntries(c.designs.map((d) => [d.name, d])); CAT = c; applyLinks();
    window.VSRack.repaint && window.VSRack.repaint();
  }).catch(() => {});
  fetch("/assets/data/discounts.json").then((r) => r.json()).then((c) => { DISC = c; applyDiscount(); }).catch(() => {});

  /* ---------- Rack: loaded only when it is about to be seen ---------- */
  const webgl = (() => { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (e) { return false; } })();
  const rackEl = $("#rack");
  let rackP = null;
  const loadRack = () => {
    if (!webgl) return Promise.reject(new Error("no-webgl"));
    return rackP || (rackP = import("/assets/rack/dist/rail.js").then(() => window.VSRack));
  };
  if (rackEl) {
    if (!webgl) {
      rackEl.classList.add("no-webgl");
      const v = $(".vsr", rackEl); if (v) v.hidden = true;
      const l = $("#rack-list"); if (l) l.open = true;
    } else if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); loadRack().catch(() => {}); } }, { rootMargin: "700px 0px" });
      io.observe(rackEl);
    } else loadRack().catch(() => {});
  }
  const smooth = reduce ? "auto" : "smooth";
  $$("[data-rack-tribe]").forEach((a) => a.addEventListener("click", (e) => {
    if (!webgl) return; // plain anchor to #rack
    e.preventDefault();
    rackEl.scrollIntoView({ behavior: smooth, block: "start" });
    loadRack().then((r) => r.goTribe(a.dataset.rackTribe)).catch(() => {});
  }));

  /* ---------- Lookbook ---------- */
  const track = $("#lb-track"), stage = $("#lb-stage");
  if (track && stage) {
    const cards = $$(".lb-card", track), bar = $("#lb-bar"), chips = $$(".lb-chips button");
    ["sr", "gym", "ct"].forEach((t) => { const g = document.createElement("i"); g.className = "lb-glow"; g.dataset.g = t; g.setAttribute("aria-hidden", "true"); stage.prepend(g); });
    let raf = 0;
    const sync = () => {
      raf = 0;
      const max = track.scrollWidth - track.clientWidth;
      bar.style.transform = "scaleX(" + (max > 0 ? Math.min(1, track.scrollLeft / max) : 1).toFixed(4) + ")";
      const x = track.scrollLeft + track.clientWidth * 0.4;
      let cur = cards[0];
      for (const c of cards) { if (c.offsetLeft <= x) cur = c; else break; }
      const t = cur.dataset.channel;
      if (stage.dataset.tribe !== t) stage.dataset.tribe = t;
      chips.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.jump === t)));
    };
    track.addEventListener("scroll", () => { if (!raf) raf = requestAnimationFrame(sync); }, { passive: true });
    addEventListener("resize", sync); sync();
    chips.forEach((b) => b.addEventListener("click", () => {
      const c = $("#lb-" + b.dataset.jump); if (!c) return;
      track.scrollTo({ left: c.offsetLeft - parseFloat(getComputedStyle(track).paddingLeft), behavior: smooth });
    }));
    // mouse drag (touch and trackpad scroll natively)
    let drag = null, moved = false;
    track.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse" || e.button) return; drag = { x: e.clientX, l: track.scrollLeft }; moved = false; });
    addEventListener("pointermove", (e) => { if (!drag) return; const dx = e.clientX - drag.x; if (Math.abs(dx) > 5) { moved = true; track.classList.add("is-drag"); } if (moved) track.scrollLeft = drag.l - dx; });
    addEventListener("pointerup", () => { drag = null; setTimeout(() => track.classList.remove("is-drag"), 0); });
    track.addEventListener("click", (e) => { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
    // tap a design: open the same product sheet as the rack
    track.addEventListener("click", (e) => {
      const a = e.target.closest("a[data-design]"); if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;
      if (!webgl) return;
      e.preventDefault();
      const li = a.closest(".lb-card"); li.classList.add("is-busy");
      loadRack().then((r) => { if (!r.open(a.dataset.design, "tee")) window.open(a.href, "_blank", "noopener"); })
        .catch((err) => { console.warn("rack open failed", err); window.open(a.href, "_blank", "noopener"); }).finally(() => li.classList.remove("is-busy"));
    });
  }
})();
