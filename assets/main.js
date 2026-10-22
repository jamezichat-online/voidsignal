(() => {
  "use strict";
  const API = "https://voidsignal-api.smartlabdesign-tools.workers.dev/subscribe";
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Hero: scroll-scrubbed film under a tunable static field ---------- */
  const hero = document.querySelector(".hero");
  const frames = document.getElementById("frames");
  const noise = document.getElementById("static");
  if (hero && frames && noise) {
    const N = 121;
    // piecewise timeline: scroll progress -> frame (holds are deliberate stills)
    const TL = [
      { p0: 0.00, p1: 0.06, f0: 0,   f1: 0 },    // hold: back to camera
      { p0: 0.06, p1: 0.78, f0: 0,   f1: 100 },  // turn, profile, close-up
      { p0: 0.78, p1: 0.90, f0: 100, f1: 120 },  // pull back: the shirt
      { p0: 0.90, p1: 1.00, f0: 120, f1: 120 },  // hold: signal locked
    ];
    const frameAt = (p) => {
      for (const s of TL) if (p <= s.p1) {
        const k = s.p1 === s.p0 ? 0 : (p - s.p0) / (s.p1 - s.p0);
        return Math.round(s.f0 + (s.f1 - s.f0) * Math.min(1, Math.max(0, k)));
      }
      return N - 1;
    };

    const hud = { mhz: document.getElementById("hud-mhz"), bars: [...hero.querySelectorAll(".hud-bars i")], state: document.getElementById("hud-state") };
    const fctx = frames.getContext("2d");
    let ready = document.readyState === "complete";
    window.addEventListener("load", () => { ready = true; pump(); }, { once: true });
    let variant = "", cache = new Map(), inflight = new Set(), target = 0, shown = -1, progress = 0;
    const pickVariant = () => (window.innerWidth / window.innerHeight < 0.85 ? "m" : "d");
    const url = (i) => "/assets/hero/" + variant + "/f_" + String(i + 1).padStart(3, "0") + ".webp";

    function load(i) {
      if (i < 0 || i >= N || cache.has(i) || inflight.has(i)) return;
      inflight.add(i);
      const v = variant, img = new Image();
      img.decoding = "async";
      img.onload = () => {
        inflight.delete(i);
        if (v !== variant) return;            // breakpoint changed meanwhile: drop it
        cache.set(i, img);
        if (Math.abs(i - target) <= Math.abs(shown - target) || shown < 0) paint();
        pump();
      };
      img.onerror = () => { inflight.delete(i); };
      img.src = url(i);
    }
    // load nearest-first around the target, bounded concurrency and memory
    function pump() {
      if (inflight.size >= 6) return;
      if (!ready || reduce) return;            // wait for page load; never stream the sequence for reduced motion
      for (let d = 0; d <= 30 && inflight.size < 6; d++) {   // window: 8 behind, 30 ahead
        load(target + d);
        if (d > 0 && d <= 8) load(target - d);
      }
      if (cache.size > 70) {
        for (const k of cache.keys()) if (Math.abs(k - target) > 35) cache.delete(k);
      }
    }
    function sizeCanvas(c) {
      const r = c.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
    }
    function paint() {
      let i = target;
      if (!cache.has(i)) {                     // show the nearest decoded frame instead of a blank
        let best = -1;
        for (const k of cache.keys()) if (best < 0 || Math.abs(k - i) < Math.abs(best - i)) best = k;
        if (best < 0) return; i = best;
      }
      const img = cache.get(i), W = frames.width, H = frames.height;
      const s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
      const w = img.naturalWidth * s, h = img.naturalHeight * s;
      fctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
      shown = i;
    }
    function setVariant() {
      const v = pickVariant();
      if (v === variant) return;
      variant = v; cache = new Map(); inflight = new Set(); shown = -1;
    }

    /* static noise layer (alpha), cleared by scroll progress and by the pointer lens */
    const nctx = noise.getContext("2d");
    const SC = 3; let nw = 0, nh = 0, nimg, n32;
    const NOISE = new Uint8Array(65536);
    for (let i = 0; i < NOISE.length; i++) NOISE[i] = (Math.random() * 255) | 0;
    const lens = { x: 0.62, y: 0.42 }, aim = { x: 0.62, y: 0.42 };
    let lastMove = -1e9, t = 0;
    function sizeNoise() {
      const r = noise.getBoundingClientRect();
      nw = Math.max(80, Math.round(r.width / SC)); nh = Math.max(60, Math.round(r.height / SC));
      noise.width = nw; noise.height = nh; nimg = nctx.createImageData(nw, nh); n32 = new Uint32Array(nimg.data.buffer);
    }
    function drawNoise() {
      const strength = Math.max(0, 1 - progress / 0.6);      // gone by 60% of the stage
      if (strength <= 0) { nctx.clearRect(0, 0, nw, nh); return; }
      const lx = lens.x * nw, ly = lens.y * nh, R = Math.max(nw, nh) * 0.2, r2 = R * R, p2 = R * R * 0.36;
      let o = (Math.random() * 60000) | 0;
      for (let y = 0; y < nh; y++) {
        const dy2 = (y - ly) * (y - ly), row = y * nw;
        for (let x = 0; x < nw; x++) {
          const d2 = (x - lx) * (x - lx) + dy2;
          const lock = d2 < p2 ? 1 : Math.exp(-(d2 - p2) / r2);   // hard-clear core, soft edge
          const v = NOISE[(o++) & 65535];
          const a = (strength * 185 * (1 - lock)) | 0;
          n32[row + x] = (a << 24) | ((v * 0.9 + 12) << 16) | ((v * 0.86) << 8) | (v * 0.88);
        }
      }
      nctx.putImageData(nimg, 0, 0);
      const ta = Math.max(0, 1 - progress / 0.22);            // the trace hands over to the film
      if (ta > 0) {
        const cy = nh * 0.42, amp = nh * 0.07; nctx.lineWidth = 1;
        for (let x = 0; x < nw - 1; x++) {
          const la = Math.exp(-((x - lx) * (x - lx)) / r2);
          const j = (1 - la) * (Math.random() - 0.5) * amp * 2.4;
          nctx.strokeStyle = "rgba(170,130,255," + ((0.12 + 0.88 * la) * ta).toFixed(3) + ")";
          nctx.beginPath();
          nctx.moveTo(x, cy + Math.sin(x * 0.09 + t * 3) * amp + j);
          nctx.lineTo(x + 1, cy + Math.sin((x + 1) * 0.09 + t * 3) * amp);
          nctx.stroke();
        }
      }
    }

    function readProgress() {
      const r = hero.getBoundingClientRect();
      const span = hero.offsetHeight - window.innerHeight;
      return span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0;
    }
    function update() {
      progress = readProgress();
      const f = frameAt(progress);
      hero.classList.toggle("is-past-open", progress > 0.16);
      const rev = progress > 0.84;
      if (rev !== hero.classList.contains("is-revealed")) {
        hero.classList.toggle("is-revealed", rev);
        const rc = hero.querySelector(".hero-copy--reveal");
        rc.setAttribute("aria-hidden", String(!rev));
        rc.querySelector("a").tabIndex = rev ? 0 : -1;
      }
      if (hud.mhz) {
        hud.mhz.textContent = (87.6 + progress * 13.8).toFixed(1);
        const lit = Math.round(Math.min(1, progress / 0.84) * 5);
        hud.bars.forEach((b, i) => b.classList.toggle("on", i < lit));
        hud.state.textContent = progress === 0 ? "Scroll to tune in" : rev ? "Signal received" : "Tuning";
      }
      if (f !== target) { target = f; pump(); }
      if (shown !== target) paint();
    }

    if (reduce) {
      // one still of the reveal, no frame sequence, no animation
      hero.classList.add("is-still");
      variant = pickVariant(); sizeCanvas(frames); target = N - 1; load(N - 1);
      window.addEventListener("resize", () => { sizeCanvas(frames); setVariant(); target = N - 1; load(N - 1); paint(); });
    } else {
      setVariant(); sizeCanvas(frames); sizeNoise(); load(0); update();
      let ticking = false;
      window.addEventListener("scroll", () => {
        if (!ticking) { ticking = true; requestAnimationFrame(() => { ticking = false; update(); }); }
      }, { passive: true });
      window.addEventListener("resize", () => { setVariant(); sizeCanvas(frames); sizeNoise(); shown = -1; update(); load(target); });
      window.addEventListener("pointermove", (e) => {
        if (e.pointerType === "touch") return;
        aim.x = e.clientX / window.innerWidth; aim.y = e.clientY / window.innerHeight; lastMove = performance.now();
      }, { passive: true });
      // noise animates at ~30fps only while the stage is on screen
      let visible = true, last = 0;
      new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) requestAnimationFrame(loop); }).observe(hero);
      function loop(now) {
        if (!visible || document.hidden) return;
        if (now - last > 33) {
          last = now; t += 0.045;
          if (now - lastMove > 2500) { aim.x = 0.5 + 0.32 * Math.sin(t * 0.35); aim.y = 0.42 + 0.14 * Math.sin(t * 0.53 + 1.2); }
          lens.x += (aim.x - lens.x) * 0.08; lens.y += (aim.y - lens.y) * 0.08;
          drawNoise();
        }
        requestAnimationFrame(loop);
      }
      document.addEventListener("visibilitychange", () => { if (!document.hidden && visible) requestAnimationFrame(loop); });
      requestAnimationFrame(loop);
    }
  }

  /* ---------- Header: solid once the hero scrolls away ---------- */
  const top = document.querySelector(".top");
  if (top) {
    const heroEl = document.querySelector(".hero");
    // stays transparent over the film; turns solid once the stage has scrolled past
    const onScroll = () => top.classList.toggle("is-scrolled",
      window.scrollY > (heroEl ? heroEl.offsetHeight - 80 : 40));
    window.addEventListener("scroll", onScroll, { passive: true }); onScroll();
  }

  /* ---------- Manifesto: words light up with scroll ---------- */
  const lit = document.getElementById("manifesto-lit");
  if (lit) {
    const words = lit.textContent.trim().split(/\s+/);
    lit.innerHTML = words.map((w) => '<span class="w">' + w + "</span>").join(" ");
    const spans = [...lit.querySelectorAll(".w")];
    if (reduce) spans.forEach((w) => w.classList.add("on"));
    else {
      const onScroll = () => {
        const r = lit.getBoundingClientRect(), vh = window.innerHeight;
        const p = Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (vh * 0.85 - vh * 0.25 + r.height * 0.6)));
        const n = Math.round(p * spans.length);
        spans.forEach((w, i) => w.classList.toggle("on", i < n));
      };
      window.addEventListener("scroll", onScroll, { passive: true }); onScroll();
    }
  }

  /* ---------- Tribes: plain scroll; each stage animates in when it arrives ---------- */
  const stage = document.querySelector(".channels-stage");
  if (stage) {
    const panels = [...stage.querySelectorAll(".ch-panel")];
    const dial = stage.querySelector(".dial");
    const items = [...dial.querySelectorAll("li")];
    if (!("IntersectionObserver" in window) || reduce) panels.forEach((p) => p.classList.add("is-active"));
    else {
      const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-active"); io.unobserve(e.target); } }), { threshold: 0.28 });
      panels.forEach((p) => io.observe(p));
      const cur = new IntersectionObserver((es) => es.forEach((e) => {
        if (e.isIntersecting) items.forEach((li) => li.classList.toggle("is-active", li.dataset.channel === e.target.dataset.channel));
      }), { rootMargin: "-45% 0px -45% 0px" });
      panels.forEach((p) => cur.observe(p));
      new IntersectionObserver(([e]) => dial.classList.toggle("is-on", e.isIntersecting), { rootMargin: "-20% 0px -20% 0px" }).observe(stage);
    }
  }

  /* ---------- Launch offer countdown ---------- */
  const clock = document.getElementById("clock");
  if (clock) {
    const end = Date.UTC(2026, 10, 5, 22, 59, 0);
    const q = (u) => clock.querySelector('[data-u="' + u + '"]');
    const tick = () => {
      const left = end - Date.now();
      if (left <= 0) { const o = document.getElementById("offer"); if (o) o.hidden = true; document.querySelector(".promo")?.remove(); return; }
      const p = (n) => String(n).padStart(2, "0");
      q("d").textContent = p(Math.floor(left / 864e5));
      q("h").textContent = p(Math.floor(left / 36e5) % 24);
      q("m").textContent = p(Math.floor(left / 6e4) % 60);
      q("s").textContent = p(Math.floor(left / 1e3) % 60);
      setTimeout(tick, 1000);
    };
    tick();
  }

  /* ---------- Lineup: picking a design preselects its frequency in the form ---------- */
  document.querySelectorAll("[data-pick]").forEach((a) => a.addEventListener("click", () => {
    const r = document.querySelector('input[name="frequency"][value="' + a.dataset.pick + '"]');
    if (r) r.checked = true;
  }));

  /* ---------- Drop 01 signup ---------- */
  const form = document.getElementById("signup");
  if (form) {
    const status = form.querySelector(".form-status");
    const btn = form.querySelector("button[type=submit]");
    const say = (msg, kind) => { status.textContent = msg; status.className = "form-status " + (kind || ""); };

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const email = String(fd.get("email") || "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        say("Enter a valid email address, like name@example.com.", "err");
        form.email.focus(); return;
      }
      if (!form.consent.checked) {
        say("Tick the consent box so we can send you the transmission.", "err");
        form.consent.focus(); return;
      }
      btn.disabled = true; say("Tuning in…");
      try {
        const res = await fetch(API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email, frequency: fd.get("frequency") || "all",
            consent: true, website: fd.get("website") || "",
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) {
          form.reset();
          say("You're on the frequency. The next transmission reaches you first.", "ok");
        } else if (data.error === "email") {
          say("That email doesn't look right. Check it and try again.", "err");
        } else {
          say("The signal dropped. Try again in a minute, or write to info@voidsignalbrand.com.", "err");
        }
      } catch {
        say("No connection. Check your network and try again.", "err");
      } finally {
        btn.disabled = false;
      }
    });
  }
})();
