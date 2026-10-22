(() => {
  "use strict";
  const API = "https://voidsignal-api.smartlabdesign-tools.workers.dev/subscribe";
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Hero: static field with a signal you tune in ---------- */
  const canvas = document.getElementById("static");
  if (canvas) {
    const ctx = canvas.getContext("2d", { alpha: false });
    const SCALE = 3;                 // internal pixel = 3 CSS px, keeps it cheap and gritty
    let w = 0, h = 0, img, buf32;
    const NOISE = new Uint8Array(65536);
    for (let i = 0; i < NOISE.length; i++) NOISE[i] = (Math.random() * 255) | 0;

    const target = { x: 0.62, y: 0.42 }; // normalized
    const lens = { x: 0.62, y: 0.42 };
    let lastMove = -1e9, running = false, visible = true, raf = 0, last = 0, t = 0;

    function resize() {
      const r = canvas.getBoundingClientRect();
      w = Math.max(80, Math.round(r.width / SCALE));
      h = Math.max(60, Math.round(r.height / SCALE));
      canvas.width = w; canvas.height = h;
      img = ctx.createImageData(w, h);
      buf32 = new Uint32Array(img.data.buffer);
    }

    function frame(now) {
      raf = 0;
      if (!running) return;
      if (now - last < 33) { schedule(); return; } // ~30fps
      last = now; t += 0.045;

      // idle or touch: the lens drifts on its own along a slow lissajous
      if (now - lastMove > 2500) {
        target.x = 0.5 + 0.32 * Math.sin(t * 0.35);
        target.y = 0.42 + 0.14 * Math.sin(t * 0.53 + 1.2);
      }
      lens.x += (target.x - lens.x) * 0.08;
      lens.y += (target.y - lens.y) * 0.08;
      draw();
      schedule();
    }
    function schedule() { if (!raf && running) raf = requestAnimationFrame(frame); }

    function draw() {
      const lx = lens.x * w, ly = lens.y * h;
      const r = Math.max(w, h) * 0.2, r2 = r * r;
      let o = (Math.random() * 60000) | 0;
      for (let y = 0; y < h; y++) {
        const dy = y - ly, dy2 = dy * dy;
        const row = y * w;
        for (let x = 0; x < w; x++) {
          const dx = x - lx;
          const lock = Math.exp(-(dx * dx + dy2) / r2);       // 1 at lens centre
          const k = 0.42 * (1 - 0.88 * lock);
          const v = (NOISE[(o++) & 65535] * k) | 0;
          // faint violet cast in the noise; little-endian ABGR
          buf32[row + x] = 0xff000000 | ((v + 6) << 16) | ((v * 0.92) << 8) | (v * 0.96);
        }
      }
      ctx.putImageData(img, 0, 0);

      // the signal: a sine trace that is chaos far from the lens, clean inside it
      const cy = h * 0.42, amp = h * 0.07;
      ctx.lineWidth = 1;
      for (let x = 0; x < w - 1; x += 1) {
        const dxa = x - lx, dxb = x + 1 - lx;
        const la = Math.exp(-(dxa * dxa) / r2), lb = Math.exp(-(dxb * dxb) / r2);
        const ja = (1 - la) * (Math.random() - 0.5) * amp * 2.4;
        const jb = (1 - lb) * (Math.random() - 0.5) * amp * 2.4;
        const ya = cy + Math.sin(x * 0.09 + t * 3) * amp + ja;
        const yb = cy + Math.sin((x + 1) * 0.09 + t * 3) * amp + jb;
        const a = 0.12 + 0.88 * la;
        ctx.strokeStyle = "rgba(170,130,255," + a.toFixed(3) + ")";
        ctx.beginPath(); ctx.moveTo(x, ya); ctx.lineTo(x + 1, yb); ctx.stroke();
      }
    }

    function start() { if (!running && visible) { running = true; schedule(); } }
    function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }

    resize();
    if (reduce) {
      lens.x = 0.62; lens.y = 0.42; draw();
      window.addEventListener("resize", () => { resize(); draw(); });
    } else {
      window.addEventListener("resize", () => { resize(); });
      window.addEventListener("pointermove", (e) => {
        if (e.pointerType === "touch") return;
        const r = canvas.getBoundingClientRect();
        if (e.clientY > r.bottom) return;
        target.x = (e.clientX - r.left) / r.width;
        target.y = (e.clientY - r.top) / r.height;
        lastMove = performance.now();
      }, { passive: true });
      new IntersectionObserver(([en]) => { visible = en.isIntersecting; visible ? start() : stop(); })
        .observe(canvas);
      document.addEventListener("visibilitychange", () => document.hidden ? stop() : start());
      start();
    }
  }

  /* ---------- Header: solid once the hero scrolls away ---------- */
  const top = document.querySelector(".top");
  if (top) {
    const onScroll = () => top.classList.toggle("is-scrolled", window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true }); onScroll();
  }

  /* ---------- Frequencies: draw the wave when the row arrives ---------- */
  const rows = document.querySelectorAll(".freq");
  if ("IntersectionObserver" in window && !reduce) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("is-live"); io.unobserve(en.target); } });
    }, { threshold: 0.35 });
    rows.forEach((r) => io.observe(r));
  } else {
    rows.forEach((r) => r.classList.add("is-live"));
  }

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
        say("Tick the consent box so we're allowed to email you about the drop.", "err");
        form.consent.focus(); return;
      }
      btn.disabled = true; say("Joining…");
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
          say("You're on the list. We'll email you when Drop 01 opens.", "ok");
        } else if (data.error === "email") {
          say("That email doesn't look right. Check it and try again.", "err");
        } else {
          say("The list didn't respond. Try again in a minute, or write to info@voidsignalbrand.com.", "err");
        }
      } catch {
        say("No connection to the list. Check your network and try again.", "err");
      } finally {
        btn.disabled = false;
      }
    });
  }
})();
