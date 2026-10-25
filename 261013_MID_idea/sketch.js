/* ==========================================================================
   Fishing for Thoughts — p5.js
   Each fish = one memo the user typed. Memos are hidden underwater; catch a
   fish to read it. Short click = release, hold 2s = throw to a bird.

   Everything is drawn in a fixed "design space" of 700 x 440 units (matching
   the reference sketch) that is scaled/centred to the canvas (see L / computeLayout).
   ========================================================================== */

const DEG = Math.PI / 180;
const DW = 700,
  DH = 440; // design-space size
const COL = {
  bg: "#1F1F1F",
  person: "#DCDCDC",
  dock: "#6B6B6B",
  rod: "#404040",
  line: "#EDEDED",
  water: "#47B8E0",
  bird: "#9A9A9A",
};
const FISH_PALETTE = [
  "#3355FF",
  "#2F6BFF",
  "#4A5CF0",
  "#3A7BD5",
  "#2F8FD8",
  "#3B4FD8",
];

const WATER_Y = 272; // mean water surface
const UW = { l: 24, r: 682, top: 308, bottom: 428 }; // underwater swimming area

// Person / rod geometry (design units)
const SHOULDER = { x: 150, y: 130 },
  HAND_REST = { x: 216, y: 131 };
const ARM_LEN = Math.hypot(HAND_REST.x - SHOULDER.x, HAND_REST.y - SHOULDER.y);
const PHI0 = Math.atan2(HAND_REST.y - SHOULDER.y, HAND_REST.x - SHOULDER.x);
const ROD_LEN = 200,
  ROD_ANG = -29 * DEG; // the rod keeps one fixed pose
const LEN_MIN = 40,
  LEN_MAX = 378; // fishing-line length range (drag the rod up/down)
const STORE_KEY = "fishingMemo.v1",
  MAX_BM = 10;
// Bucket (bookmarks) sits on the dock; `zone` is the drop area for a dragged fish.
const BUCKET = {
  x: 46,
  y: 217,
  w: 48,
  h: 55,
  mouthX: 70,
  mouthY: 222,
  zone: { x: 24, y: 180, w: 84, h: 100 },
};
const RIM_W = BUCKET.w + 4; // displayed width of the bucket rim (pictures are scaled to this)
const WATER_X0 = 277; // where the dock ends and the water begins
// Bucket pictures by number of bookmarks. 0–2 memos keep using the drawn bucket (no picture yet).
const BUCKET_IMG = {
  mid: { file: "assets/bucket_mid.png" }, // 3–5 memos
  high: { file: "assets/bucket_high.png" }, // 6–10 memos
};

const HOLD_MS = 2000; // hold time that triggers the throw
// Throw timeline (seconds): wind-up, swing, recover; fish flight time; gravity
const T_WIND = 0.5,
  T_SWING = 0.22,
  T_RECOVER = 0.55,
  T_FLIGHT = 1.05,
  G_THROW = 400;
const G_RELEASE = 900;

/* ---------- global state ---------- */
let fishes = []; // every memo fish still in the scene
let throws = []; // running throw/bird sequences
let splashes = [];
let activeFish = null; // the one fish currently on the hook (hooked/retrieving/caught)
let nextId = 1,
  clock = 0,
  dt = 0;
let rod = { ang: ROD_ANG, len: 300 }; // len = fishing-line length; the hook hangs at tip + len
let bookmarks = []; // bucket: [{id, memo, at}] — separate from the swimming fish
let toast = null,
  bucketPulse = 0;
let resetBtn, resetModal;
let bucket = {
  x: BUCKET.mouthX,
  y: BUCKET.y + BUCKET.h,
  sc: 1,
  rot: 0,
  vrot: 0,
}; // current pose; pivot = bottom centre
let bucketPress = null; // press on the bucket: click (toggle list) or drag (move / shake)
let bucketPour = null; // running "empty the bucket" animation
let dumped = []; // fish spilled on the dock (visual only; their memos are already deleted)
let listOpen = false,
  listSlide = 0,
  listScroll = 0,
  listTouch = null,
  listCache = null;
let armPhi = PHI0;
let hook = {
  x: 385,
  y: 345,
  vx: 0,
  vy: 0,
  mode: "water",
  startX: 0,
  startY: 0,
  lockUntil: 0,
  dragOff: { x: 0, y: 0 },
};
let drag = null; // rod drag in progress
let press = null; // press on caught fish: { fish, start, thrown }
let L = {}; // layout
let inputEl,
  pendingSubmit = false;
let panelCache = {};

/* ==========================================================================
   Setup / layout / input box
   ========================================================================== */
function setup() {
  createCanvas(windowWidth, windowHeight);
  textFont("sans-serif");
  setupInput();
  buildResetUI();
  computeLayout();
  placeInput();
  loadState(); // restore memos + bucket from localStorage
  loadBucketImages(); // async; a failed load keeps the drawn bucket
  const t = rodTip();
  hook.x = t.x;
  hook.y = t.y + rod.len;
  window.addEventListener("pagehide", saveState);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  computeLayout();
  placeInput();
  panelCache = {};
}

function computeLayout() {
  L.narrow = width < 760 || width / height < 1.1;
  if (L.narrow) {
    // Phone/portrait: input on top, scene below it, memo text under the scene.
    L.u = Math.max(0.3, Math.min(width / DW, (height * 0.62 - 66) / DH));
    L.ox = (width - DW * L.u) / 2;
    L.oy = 58;
    L.sceneH = L.oy + DH * L.u + 8;
    L.panel = {
      x: 20,
      y: L.sceneH + 6,
      w: width - 40,
      h: Math.max(60, height - L.sceneH - 52),
    };
    L.btn = { x: width - 12 - 76, y: 10, w: 76, h: 38 };
    L.input = { x: 12, y: 10, w: width - 24 - 76 - 8, h: 38 };
  } else {
    // Wide: scene on the left ~64%, memo text in the empty space on the right.
    L.sceneW = width * 0.64;
    L.u = Math.min(L.sceneW / DW, height / DH);
    L.ox = (L.sceneW - DW * L.u) / 2;
    L.oy = (height - DH * L.u) / 2;
    L.panel = {
      x: L.sceneW + 10,
      y: height * 0.14,
      w: Math.max(80, width - L.sceneW - 50),
      h: height * 0.64,
    };
    const ih = Math.max(30, 30 * L.u),
      bw = Math.max(64, 56 * L.u),
      iw = Math.max(120, 250 * L.u - bw - 8);
    L.input = {
      x: L.ox + 685 * L.u - bw - 8 - iw,
      y: L.oy + 10 * L.u,
      w: iw,
      h: ih,
    };
    L.btn = { x: L.ox + 685 * L.u - bw, y: L.input.y, w: bw, h: ih }; // reset button right next to the input
  }
}

function setupInput() {
  inputEl = document.getElementById("memo-input");
  if (!inputEl) {
    inputEl = document.createElement("input");
    inputEl.id = "memo-input";
    inputEl.type = "text";
    document.body.appendChild(inputEl);
  }
  // Style inline so the box is visible even if the host page has no matching CSS.
  Object.assign(inputEl.style, {
    position: "fixed",
    boxSizing: "border-box",
    padding: "0 14px",
    background: "transparent",
    color: "#F4F4F4",
    border: "1.5px solid #DCDCDC",
    borderRadius: "0",
    outline: "none",
    fontFamily: "sans-serif",
    zIndex: "10",
    display: "block",
  });
  inputEl.maxLength = 200;
  inputEl.placeholder = "Write a thought, press Enter";
  inputEl.autocomplete = "off";
  if (!document.getElementById("memo-input-style")) {
    const st = document.createElement("style");
    st.id = "memo-input-style";
    st.textContent =
      "#memo-input::placeholder{color:#6E6E6E}#memo-input:focus{border-color:#fff!important}";
    document.head.appendChild(st);
  }
  // Enter submits. IME-safe (Korean): if Enter arrives mid-composition we wait for
  // compositionend so the last syllable is included and nothing is submitted twice.
  inputEl.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (e.isComposing) {
      pendingSubmit = true;
      setTimeout(() => {
        pendingSubmit = false;
      }, 500);
    } else if (e.keyCode === 229) {
      setTimeout(submitMemo, 0); // Safari-style: composition already ended
    } else {
      submitMemo();
    }
  });
  inputEl.addEventListener("compositionend", () => {
    if (pendingSubmit) {
      pendingSubmit = false;
      setTimeout(submitMemo, 0);
    }
  });
}

function placeInput() {
  const r = L.input,
    s = inputEl.style;
  s.left = r.x + "px";
  s.top = r.y + "px";
  s.width = r.w + "px";
  s.height = r.h + "px";
  s.fontSize = Math.max(14, Math.min(20, r.h * 0.45)) + "px";
  if (resetBtn) {
    const b = L.btn,
      bs = resetBtn.style;
    bs.left = b.x + "px";
    bs.top = b.y + "px";
    bs.width = b.w + "px";
    bs.height = b.h + "px";
    bs.fontSize = s.fontSize;
  }
}

function submitMemo() {
  if (listOpen) return; // locked while the memo list is open
  const text = inputEl.value;
  if (text.trim() === "") return; // empty / whitespace-only: no fish
  spawnFish(text); // memo text is stored exactly as typed
  inputEl.value = "";
}

/* ==========================================================================
   Fish creation
   ========================================================================== */
function spawnFish(text) {
  const size = random(58, 96);
  const dir = random() < 0.5 ? -1 : 1;
  // Drop from the bottom-centre of the input box (converted to design space).
  const d = toDesign(L.input.x + L.input.w / 2, L.input.y + L.input.h);
  fishes.push(
    buildFish({
      id: nextId++,
      memo: text,
      size,
      dir,
      speed: random(18, 52),
      baseY: random(UW.top + size * 0.2, UW.bottom - size * 0.2),
      col: lerpColor(
        color(random(FISH_PALETTE)),
        color(random(FISH_PALETTE)),
        random(),
      ),
      x: constrain(d.x + random(-30, 30), UW.l + size / 2, UW.r - size / 2),
      y: d.y - 4,
      phase: random(TWO_PI),
      state: "dropping",
    }),
  );
  saveState(); // important change: a new memo exists
}

// Single place where a fish object is made (new memo or restored from storage).
function buildFish(o) {
  const col = typeof o.col === "string" ? color(o.col) : o.col;
  const fillCol = lerpColor(col, color(COL.bg), 0.18);
  return {
    id: o.id,
    memo: o.memo,
    x: o.x,
    y: o.y,
    vy: 0,
    vx: 0,
    dir: o.dir,
    speed: o.speed,
    size: o.size,
    baseY: o.baseY,
    col,
    fillCol,
    textCol: bestTextColor(fillCol),
    state: o.state, // dropping | swimming | hooked | retrieving | caught | dragging | released | thrown | eaten | bucketed
    faceX: o.dir,
    rot: 0,
    scale: 1,
    fillAmt: 0,
    textAlpha: 0,
    phase: o.phase,
    noHookUntil: 0,
    hookedT: 0,
    retrieveT: 0,
    p0: null,
    fit: null,
    sCaught: 2,
  };
}

/* ==========================================================================
   Persistence (localStorage). Saved on important changes only (new memo, bookmark, release/landing,
   throw, reset, page hide) — not every frame. Bookmarks are stored separately from the fish, and the
   bucket count is always computed from the bookmark list.
   ========================================================================== */
function saveState() {
  try {
    const water = fishes
      .filter(
        (f) => !f.removed && !["thrown", "eaten", "bucketed"].includes(f.state),
      )
      .concat(
        bucketPour && bucketPour.mode === "water"
          ? bucketPour.queue.map((q) => q.fish)
          : [],
      ); // fish still inside a tipping bucket
    if (water.length === 0 && bookmarks.length === 0) {
      localStorage.removeItem(STORE_KEY);
      return;
    }
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        v: 1,
        nextId,
        fishes: water.map((f) => ({
          id: f.id,
          memo: f.memo,
          x: f.x,
          baseY: f.baseY,
          dir: f.dir,
          speed: f.speed,
          size: f.size,
          col: f.col.toString("#rrggbb"),
          phase: f.phase,
        })),
        bookmarks: bookmarks.map((b) => ({ id: b.id, memo: b.memo, at: b.at })),
        bookmarkCount: bookmarks.length, // informational only; never trusted on load
      }),
    );
  } catch (e) {
    console.warn("save failed", e);
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    if (!d || typeof d !== "object") return;
    const seen = new Set();
    let maxId = 0;
    const okMemo = (o) =>
      o &&
      typeof o.memo === "string" &&
      o.memo.trim() !== "" &&
      Number.isFinite(o.id) &&
      !seen.has(o.id);
    const bms = [],
      fs = [];
    if (Array.isArray(d.bookmarks))
      for (const b of d.bookmarks) {
        // bookmarks first: they win on duplicate ids
        if (bms.length >= MAX_BM || !okMemo(b)) continue;
        seen.add(b.id);
        maxId = Math.max(maxId, b.id);
        bms.push({
          id: b.id,
          memo: b.memo,
          at: Number.isFinite(b.at) ? b.at : 0,
        });
      }
    if (Array.isArray(d.fishes))
      for (const o of d.fishes) {
        if (!okMemo(o)) continue;
        seen.add(o.id);
        maxId = Math.max(maxId, o.id);
        const size = constrain(
          Number.isFinite(o.size) ? o.size : random(58, 96),
          58,
          96,
        );
        const baseY = constrain(
          Number.isFinite(o.baseY) ? o.baseY : random(UW.top, UW.bottom),
          UW.top + size * 0.2,
          UW.bottom - size * 0.2,
        );
        const col =
          typeof o.col === "string" && /^#[0-9a-fA-F]{6}$/.test(o.col)
            ? o.col
            : random(FISH_PALETTE);
        fs.push(
          buildFish({
            id: o.id,
            memo: o.memo,
            size,
            baseY,
            col,
            dir: o.dir === -1 ? -1 : 1,
            speed: constrain(Number.isFinite(o.speed) ? o.speed : 30, 10, 60),
            x: constrain(
              Number.isFinite(o.x) ? o.x : 300,
              UW.l + size / 2,
              UW.r - size / 2,
            ),
            y: baseY,
            phase: Number.isFinite(o.phase) ? o.phase : random(TWO_PI),
            state: "swimming", // everything resumes swimming
          }),
        );
      }
    bookmarks = bms;
    fishes = fs;
    nextId = Math.max(Number.isFinite(d.nextId) ? d.nextId : 1, maxId + 1);
  } catch (e) {
    console.warn("stored data unreadable, starting empty", e);
    bookmarks = [];
    fishes = [];
  }
}

/* ---------- Reset button + confirmation modal (built here so it always matches the sketch's look) ---------- */
function buildResetUI() {
  const st = document.createElement("style");
  st.textContent =
    "#reset-btn{position:fixed;box-sizing:border-box;background:transparent;color:#F4F4F4;border:1.5px solid #DCDCDC;border-radius:0;font-family:sans-serif;cursor:pointer;z-index:10;padding:0 8px;white-space:nowrap}" +
    "#reset-btn:hover{background:#2C2C2C}" +
    "#reset-modal{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(20,20,20,.85);z-index:100;font-family:sans-serif}" +
    "#reset-modal .box{box-sizing:border-box;max-width:min(420px,calc(100vw - 32px));padding:28px;background:#1F1F1F;border:1.5px solid #DCDCDC;color:#F4F4F4;font-size:16px;line-height:1.6}" +
    "#reset-modal .row{display:flex;gap:10px;justify-content:flex-end;margin-top:22px}" +
    "#reset-modal button{font:inherit;font-size:15px;padding:9px 16px;border:1.5px solid #DCDCDC;border-radius:0;background:transparent;color:#F4F4F4;cursor:pointer}" +
    "#reset-modal button.danger{background:#DCDCDC;color:#1F1F1F}";
  document.head.appendChild(st);

  resetBtn = document.createElement("button");
  resetBtn.id = "reset-btn";
  resetBtn.type = "button";
  resetBtn.textContent = "초기화";
  document.body.appendChild(resetBtn);

  resetModal = document.createElement("div");
  resetModal.id = "reset-modal";
  resetModal.innerHTML =
    '<div class="box" role="dialog" aria-modal="true"><div>모든 메모와 양동이에 저장된 메모를 영구적으로 삭제할까요? 이 작업은 되돌릴 수 없습니다.</div>' +
    '<div class="row"><button type="button" id="reset-cancel">취소</button><button type="button" id="reset-confirm" class="danger">네, 초기화</button></div></div>';
  document.body.appendChild(resetModal);

  const close = () => {
    resetModal.style.display = "none";
  };
  resetBtn.addEventListener("click", () => {
    inputEl.blur();
    resetModal.style.display = "flex";
    document.getElementById("reset-cancel").focus();
  });
  document.getElementById("reset-cancel").addEventListener("click", close); // cancel: nothing changes
  document.getElementById("reset-confirm").addEventListener("click", () => {
    close();
    resetAll();
  });
  resetModal.addEventListener("click", (e) => {
    if (e.target === resetModal) close();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
}

// Wipe everything: swimming fish, the caught fish, the bucket, and all stored data.
function resetAll() {
  fishes = [];
  throws = [];
  splashes = [];
  bookmarks = [];
  activeFish = null;
  press = null;
  drag = null;
  toast = null;
  panelCache = {};
  nextId = 1;
  bucketPour = null;
  bucketPress = null;
  dumped = [];
  if (listOpen) closeList();
  bucket.x = BUCKET.mouthX;
  bucket.y = BUCKET.y + BUCKET.h;
  bucket.rot = 0;
  bucket.vrot = 0;
  hook.mode = "water";
  hook.vx = hook.vy = 0;
  hook.lockUntil = millis() + 300;
  inputEl.value = "";
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.indexOf("fishingMemo") === 0) localStorage.removeItem(k);
    }
  } catch (e) {
    console.warn("reset: storage unavailable", e);
  }
}

function lum(c) {
  const f = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(red(c)) + 0.7152 * f(green(c)) + 0.0722 * f(blue(c));
}
function bestTextColor(bg) {
  // pick whichever of near-white / charcoal contrasts more
  const l = lum(bg);
  return 1.05 / (l + 0.05) >= (l + 0.05) / 0.0637
    ? color("#FAFAFA")
    : color("#1F1F1F");
}

/* ==========================================================================
   Text fitting: largest font size that fits a shape, wrapping as needed.
   shape = {type:'rect', w, h}  or  {type:'ellipse', a, b} (semi-axes, centred on 0,0)
   ========================================================================== */
function fitText(text, shape, fsMax) {
  let lo = 0.3,
    hi = fsMax; // binary search on font size
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (layoutAt(text, shape, mid)) lo = mid;
    else hi = mid;
  }
  let fs = lo,
    res = layoutAt(text, shape, fs);
  while (!res && fs > 0.02) {
    fs *= 0.85;
    res = layoutAt(text, shape, fs);
  }
  if (!res) res = { lines: [text], lh: fs * 1.18 }; // last resort: never drop text
  return { fs, lh: res.lh, lines: res.lines };
}

function layoutAt(text, shape, fs) {
  textSize(fs);
  const lh = fs * 1.18;
  const maxH = shape.type === "rect" ? shape.h : shape.b * 2 * 0.94;
  const maxN = Math.floor(maxH / lh);
  for (let n = 1; n <= maxN; n++) {
    // try 1 line, 2 lines, ...
    const limits = [];
    for (let i = 0; i < n; i++) limits.push(lineLimit(shape, n, i, lh));
    const lines = wrapLines(text, n, limits);
    if (lines) return { lines, lh };
  }
  return null;
}

// Allowed width of line i when the block has n lines (narrower toward an ellipse's top/bottom).
function lineLimit(shape, n, i, lh) {
  if (shape.type === "rect") return shape.w;
  const y0 = (-n * lh) / 2 + i * lh,
    y1 = y0 + lh;
  const r = Math.max(Math.abs(y0), Math.abs(y1)) / (shape.b * 0.96);
  if (r >= 1) return 0;
  return 2 * shape.a * Math.sqrt(1 - r * r) * 0.94;
}

// Greedy wrap into at most n lines, keeping explicit line breaks and splitting
// over-long words (e.g. Korean without spaces) per character. Returns null if it doesn't fit.
function wrapLines(text, n, limits) {
  const lines = [];
  for (const para of text.split("\n")) {
    let cur = "";
    for (const w of para.split(" ")) {
      if (lines.length >= n) return null;
      const cand = cur === "" ? w : cur + " " + w;
      if (textWidth(cand) <= limits[lines.length]) {
        cur = cand;
        continue;
      }
      if (cur !== "") {
        lines.push(cur);
        cur = "";
        if (lines.length >= n) return null;
        if (textWidth(w) <= limits[lines.length]) {
          cur = w;
          continue;
        }
      }
      for (const ch of Array.from(w)) {
        // word too long: break by character
        if (lines.length >= n) return null;
        const c2 = cur + ch;
        if (textWidth(c2) <= limits[lines.length]) cur = c2;
        else {
          if (cur === "") return null;
          lines.push(cur);
          cur = "";
          if (lines.length >= n) return null;
          if (textWidth(ch) <= limits[lines.length]) cur = ch;
          else return null;
        }
      }
    }
    lines.push(cur);
    if (lines.length > n) return null;
  }
  return lines;
}

// Text area inside a fish body is an ellipse (see fishShape); computed per fish from its size.
function computeFishFit(f) {
  const shape = { type: "ellipse", a: 0.27 * f.size, b: 0.12 * f.size };
  f.fit = fitText(f.memo, shape, shape.b * 2); // fs is in the fish's local units
  const sMax = Math.min(4.2, 270 / f.size);
  const s0 = Math.min(constrain(210 / f.size, 2, 3.4), sMax);
  // If the text would be < 12px on screen, enlarge the caught fish (never truncate).
  const need = 12 / (f.fit.fs * L.u);
  f.sCaught = Math.min(sMax, Math.max(s0, need));
}

/* ==========================================================================
   Helpers
   ========================================================================== */
const kk = (rate) => 1 - Math.exp(-dt * rate);
const easeInOut = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const smooth = (a, b, x) => {
  const t = constrain((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function toDesign(px, py) {
  return { x: (px - L.ox) / L.u, y: (py - L.oy) / L.u };
}
function mouseD() {
  return toDesign(mouseX, mouseY);
}
function rightEdgeD() {
  return (width - L.ox) / L.u;
}

function waveY(x) {
  let y =
    WATER_Y +
    5 * Math.sin(x * 0.045 + clock * 2.2) +
    3.5 * Math.sin(x * 0.11 - clock * 1.7);
  for (const s of splashes) {
    const d = (x - s.x) / 55;
    y += -9 * Math.exp(-2.4 * s.t) * Math.exp(-d * d) * Math.cos(s.t * 14);
  }
  return y;
}
function addSplash(x) {
  splashes.push({ x, t: 0 });
}

function handPos() {
  return {
    x: SHOULDER.x + ARM_LEN * Math.cos(armPhi),
    y: SHOULDER.y + ARM_LEN * Math.sin(armPhi),
  };
}
function rodBase() {
  const h = handPos();
  return { x: h.x - 6, y: h.y + 8 };
}
function rodTip() {
  const b = rodBase();
  return {
    x: b.x + ROD_LEN * Math.cos(rod.ang),
    y: b.y + ROD_LEN * Math.sin(rod.ang),
  };
}
function hangAngle() {
  return 14 * DEG + Math.sin(clock * 1.7) * 0.025;
}
function sEff(f) {
  return Math.min(f.sCaught, Math.max(1.3, (690 - rodTip().x - 8) / f.size));
}
function holdProgress(f) {
  return press && press.fish === f && !press.thrown && !press.dragging
    ? Math.min(1, (millis() - press.start) / HOLD_MS)
    : 0;
}

function distSeg(p, a, b) {
  const vx = b.x - a.x,
    vy = b.y - a.y;
  const t = constrain(
    ((p.x - a.x) * vx + (p.y - a.y) * vy) / (vx * vx + vy * vy),
    0,
    1,
  );
  return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
}
function rodHit(m) {
  const b = rodBase(),
    t = rodTip();
  return (
    distSeg(m, b, t) < 16 ||
    Math.hypot(m.x - t.x, m.y - t.y) < 26 ||
    distSeg(m, t, { x: hook.x, y: hook.y - 10 }) < 12
  ); // the line itself is grabbable too
}
function fishHit(f, m) {
  // point-in-ellipse in the fish's rotated/scaled frame
  const dx = m.x - f.x,
    dy = m.y - f.y,
    c = Math.cos(-f.rot),
    s = Math.sin(-f.rot);
  const lx = (dx * c - dy * s) / f.scale,
    ly = (dx * s + dy * c) / f.scale;
  return (lx / (f.size * 0.55)) ** 2 + (ly / (f.size * 0.22)) ** 2 <= 1;
}

/* ==========================================================================
   Main loop: update then render
   ========================================================================== */
function draw() {
  dt = Math.min(deltaTime / 1000, 0.05);
  clock += dt;

  bucketPulse = Math.max(0, bucketPulse - dt * 3);
  if (toast) {
    toast.t += dt;
    if (toast.t > 2.4) toast = null;
  }
  for (const s of splashes) s.t += dt;
  splashes = splashes.filter((s) => s.t < 2.5);

  checkHold();
  advanceThrows(); // advances throw clocks + arm swing
  updateHook();
  updateBucket();
  updateDumped();
  for (const f of fishes) updateFish(f);
  for (const th of throws) updateThrowFish(th);
  throws = throws.filter((t) => !t.done);
  fishes = fishes.filter((f) => !f.removed);
  checkCatch();

  render();
}

/* ---------- Gesture timing: hold 2s => throw (exactly once) ---------- */
function checkHold() {
  if (!press || press.thrown || press.dragging) return;
  const f = press.fish;
  if (f.state !== "caught" || activeFish !== f) {
    press = null;
    return;
  }
  if (millis() - press.start >= HOLD_MS) {
    press.thrown = true; // marks the gesture as consumed: release will do nothing
    startThrow(f);
  }
}

/* ---------- Hook: hangs at tip + line length, or is driven by the fish state ---------- */
function updateHook() {
  const tip = rodTip();
  const holdY = Math.max(tip.y + 50, 135);
  if (hook.mode === "water") {
    // The line length decides the hook's depth: target = tip + len. A damped spring (slightly
    // under-damped) eases the hook there, so it settles softly instead of snapping, and it
    // trails sideways a little while the line is being reeled.
    const tx =
      tip.x + constrain(-hook.vy * 0.02, -8, 8) + Math.sin(clock * 1.1) * 1.5;
    const ty =
      Math.min(tip.y + rod.len, UW.bottom - 6) + Math.sin(clock * 1.9) * 1.5;
    const K = 60,
      C = 12;
    hook.vx += (K * (tx - hook.x) - C * hook.vx) * dt;
    hook.vy += (K * (ty - hook.y) - C * hook.vy) * dt;
    hook.x += hook.vx * dt;
    hook.y += hook.vy * dt;
    return;
  }
  hook.vx = hook.vy = 0;
  if (hook.mode === "retrieve" && activeFish) {
    const e = easeInOut(activeFish.retrieveT);
    hook.x = lerp(hook.startX, tip.x, e);
    hook.y = lerp(hook.startY, holdY, e);
  } else if (hook.mode === "hold") {
    const k = kk(10); // eases back to the rod tip (e.g. after a missed bucket drop)
    hook.x += (tip.x + Math.sin(clock * 1.7) * 3 - hook.x) * k;
    hook.y += (holdY + Math.sin(clock * 2.1) * 2 - hook.y) * k;
  } else if (hook.mode === "drag") {
    // dragging a caught fish: the hook (and fish) follow the pointer
    const m = mouseD(),
      k = kk(25);
    hook.x += (m.x + hook.dragOff.x - hook.x) * k;
    hook.y += (m.y + hook.dragOff.y - hook.y) * k;
  }
  // 'hooked': hook stays where the fish bit.
}

/* ---------- Catch: the hook endpoint touching a swimming fish ---------- */
function checkCatch() {
  if (
    listOpen ||
    activeFish ||
    hook.mode !== "water" ||
    millis() < hook.lockUntil
  )
    return; // no fishing while the list is open
  if (hook.y < waveY(hook.x) + 6) return; // hook must be underwater
  let best = null,
    bd = Infinity;
  for (const f of fishes) {
    if (f.state !== "swimming" || millis() < f.noHookUntil) continue;
    const nx = (hook.x - f.x) / (f.size * 0.5 + 4),
      ny = (hook.y - f.y) / (f.size * 0.17 + 4);
    if (nx * nx + ny * ny <= 1) {
      // touching the hook point
      const d = Math.hypot(hook.x - f.x, hook.y - f.y);
      if (d < bd) {
        bd = d;
        best = f;
      } // several at once: nearest centre wins
    }
  }
  if (best) hookFish(best);
}

function hookFish(f) {
  activeFish = f; // only one fish at a time
  f.state = "hooked";
  f.hookedT = 0;
  f.textAlpha = 0;
  f.p0 = { x: f.x, y: f.y, rot: f.rot };
  hook.mode = "hooked";
  computeFishFit(f); // pre-compute font size + caught scale
}

/* ---------- Pose of a fish hanging from the hook by its mouth ---------- */
function hangPose(f, theta, s, w) {
  f.faceX += (-1 - f.faceX) * kk(9); // turn to face left so it hangs from the mouth
  f.scale = s;
  const tx = hook.x - (Math.cos(theta) * f.faceX * f.size * s) / 2;
  const ty = hook.y - (Math.sin(theta) * f.faceX * f.size * s) / 2;
  if (w < 1) {
    // blend from where the fish was when it bit
    f.x = lerp(f.p0.x, tx, w);
    f.y = lerp(f.p0.y, ty, w);
    f.rot = lerp(f.p0.rot, theta, w);
  } else {
    f.x = tx;
    f.y = ty;
    f.rot = theta;
  }
  f.fillAmt = Math.min(1, f.fillAmt + dt * 4);
}

// Memo text is only shown once the fish's body is above the water surface.
function updateTextAlpha(f) {
  const show = f.y < waveY(f.x) - 2;
  f.textAlpha = show
    ? Math.min(1, f.textAlpha + dt * 4)
    : Math.max(0, f.textAlpha - dt * 12);
}

/* ==========================================================================
   Fish state machine (per fish, per frame)
   dropping -> swimming -> hooked -> retrieving -> caught
   caught -> released -> swimming        (short click)
   caught -> thrown -> eaten -> removed  (hold 2s)
   ========================================================================== */
function updateFish(f) {
  const half = f.size / 2;

  if (f.state === "dropping") {
    // falling from the input box
    f.vy += 700 * dt;
    f.y += f.vy * dt;
    f.faceX += (f.dir - f.faceX) * kk(10);
    f.rot += (Math.atan2(f.dir * f.vy, 20) - f.rot) * kk(8);
    f.textAlpha = 0;
    if (f.y > waveY(f.x)) {
      addSplash(f.x);
      f.vy *= 0.35;
      f.state = "swimming";
    }
  } else if (f.state === "swimming") {
    f.x += f.dir * f.speed * dt;
    const minX = UW.l + half,
      maxX = UW.r - half;
    if (f.x < minX) {
      f.x = minX;
      f.dir = 1;
    } // turn around at the edges
    else if (f.x > maxX) {
      f.x = maxX;
      f.dir = -1;
    }
    const target = f.baseY + Math.sin(clock * 1.6 + f.phase) * 3;
    f.vy += (14 * (target - f.y) - 7 * f.vy) * dt; // damped spring toward swim depth
    f.y += f.vy * dt;
    f.y = Math.max(f.y, waveY(f.x) + f.size * 0.16 + 6); // stay below the surface
    f.faceX += (f.dir - f.faceX) * kk(10);
    f.scale += (1 - f.scale) * kk(6);
    f.fillAmt = Math.max(0, f.fillAmt - dt * 3);
    f.rot += (Math.sin(clock * 3 + f.phase) * 0.05 - f.rot) * kk(6);
    f.textAlpha = 0; // never readable underwater
  } else if (f.state === "released") {
    // short arc back into the water
    f.vy += G_RELEASE * dt;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.x = constrain(f.x, UW.l + half, UW.r - half);
    const sg = Math.sign(f.vx) || 1;
    f.faceX += (sg - f.faceX) * kk(10);
    f.rot += (Math.atan2(sg * f.vy, Math.abs(f.vx)) - f.rot) * kk(10);
    f.scale += (1 - f.scale) * kk(3);
    f.textAlpha = 0;
    if (f.vy > 0 && f.y > waveY(f.x) + 6) {
      // landed: swim away from the hook
      addSplash(f.x);
      f.state = "swimming";
      f.dir = sg;
      f.vy *= 0.3;
      f.baseY = random(UW.top + f.size * 0.2, UW.bottom - f.size * 0.2);
      saveState(); // back in the water
    }
  } else if (f.state === "hooked") {
    // brief tug right after biting
    f.hookedT += dt;
    const w = easeInOut(Math.min(1, f.hookedT / 0.3));
    hangPose(
      f,
      Math.sin(clock * 30) * 0.1 * Math.max(0, 1 - f.hookedT / 0.4),
      1,
      w,
    );
    f.textAlpha = 0;
    if (f.hookedT >= 0.4) {
      f.state = "retrieving";
      f.retrieveT = 0;
      hook.mode = "retrieve";
      hook.startX = hook.x;
      hook.startY = hook.y;
    }
  } else if (f.state === "retrieving") {
    // hook (and fish) pulled up out of the water
    f.retrieveT = Math.min(1, f.retrieveT + dt / 1.2);
    const e = easeInOut(f.retrieveT);
    hangPose(f, hangAngle() * e, lerp(1, sEff(f), smooth(0.1, 0.9, e)), 1);
    updateTextAlpha(f);
    if (f.retrieveT >= 1) {
      f.state = "caught";
      hook.mode = "hold";
    }
  } else if (f.state === "caught") {
    // held out of the water, memo visible
    const p = holdProgress(f); // shake/grow a little while holding
    hangPose(
      f,
      hangAngle() + Math.sin(clock * 45) * 0.04 * p,
      sEff(f) * (1 + 0.05 * p),
      1,
    );
    updateTextAlpha(f);
  } else if (f.state === "dragging") {
    // being carried toward the bucket
    const near = smooth(
      130,
      30,
      Math.hypot(f.x - BUCKET.mouthX, f.y - BUCKET.mouthY),
    );
    hangPose(f, hangAngle() * (1 - 0.6 * near), sEff(f) * (1 - 0.4 * near), 1);
    updateTextAlpha(f);
  } else if (f.state === "bucketed") {
    // sinks into the bucket, then disappears
    f.bT = Math.min(1, f.bT + dt / 0.5);
    const e = easeInOut(f.bT);
    f.x = lerp(f.b0.x, BUCKET.mouthX, e);
    f.y = lerp(f.b0.y, BUCKET.y + 28, e);
    f.scale = lerp(f.b0.s, 0.12, e);
    f.rot = lerp(f.b0.r, 0.6, e);
    f.textAlpha = Math.max(0, f.textAlpha - dt * 8);
    if (f.bT >= 1) f.removed = true;
  }
  // 'thrown' and 'eaten' are driven by updateThrowFish().
}

/* ==========================================================================
   Interaction A: short click -> release
   ========================================================================== */
function releaseFish(f, landXOverride) {
  if (f.state !== "caught" && f.state !== "dragging") return;
  f.state = "released";
  f.textAlpha = 0; // memo disappears immediately
  const dir = f.x < 500 ? 1 : -1;
  const landX = constrain(
    landXOverride !== undefined ? landXOverride : f.x + dir * 120,
    UW.l + f.size / 2,
    UW.r - f.size / 2,
  );
  const Tj = 0.85; // ballistic arc: up, then down to the surface
  f.vx = (landX - f.x) / Tj;
  f.vy = (WATER_Y + 8 - f.y - 0.5 * G_RELEASE * Tj * Tj) / Tj;
  activeFish = null;
  hook.mode = "water";
  hook.lockUntil = millis() + 1500; // hook falls back without re-catching
  f.noHookUntil = millis() + 4000; // fish can't be re-hooked immediately
  saveState(); // memo stays stored with the fish
}

/* ==========================================================================
   Bucket: drag a caught fish into the bucket zone to bookmark its memo (max 10).
   ========================================================================== */
function startFishDrag(p) {
  const f = p.fish,
    m = mouseD();
  p.dragging = true;
  f.state = "dragging"; // cancels the click/hold gestures for this press
  hook.mode = "drag";
  hook.dragOff = { x: hook.x - m.x, y: hook.y - m.y };
}

function endFishDrag(f) {
  if (f.state !== "dragging") return;
  const m = mouseD(),
    z = BUCKET.zone;
  const inZone =
    m.x >= z.x && m.x <= z.x + z.w && m.y >= z.y && m.y <= z.y + z.h;
  if (!inZone) {
    f.state = "caught";
    hook.mode = "hold";
    return;
  } // dropped elsewhere: back on the hook
  if (bookmarks.length < MAX_BM) bookmarkFish(f);
  else {
    // full: nothing is lost, fish returns to the water
    showToast("양동이가 가득 찼어요 (" + bookmarks.length + "/" + MAX_BM + ")");
    releaseFish(f, 330 + random(0, 120));
  }
}

function bookmarkFish(f) {
  bookmarks.push({ id: f.id, memo: f.memo, at: Date.now() }); // the memo now lives in the bucket list
  f.state = "bucketed";
  f.bT = 0;
  f.b0 = { x: f.x, y: f.y, s: f.scale, r: f.rot };
  activeFish = null;
  hook.mode = "water";
  hook.lockUntil = millis() + 1200;
  bucketPulse = 1;
  saveState(); // fish is excluded (bucketed), bookmark list is saved
}

function showToast(msg) {
  toast = { msg, t: 0 };
}

/* ==========================================================================
   Interaction B: hold 2s -> throw to a bird
   Timeline t: [0..T_WIND] wind-up, [..+T_SWING] swing, fish released at the end of the swing,
   then T_FLIGHT of ballistic flight to point I where the bird intercepts it.
   ========================================================================== */
function startThrow(f) {
  f.state = "thrown";
  f.textAlpha = 0; // memo disappears when thrown
  saveState(); // the bird takes it: removed from storage (bookmarks untouched)
  const I = { x: Math.min(620, rightEdgeD() - 90), y: 75 }; // interception point (upper right)
  const B0 = { x: rightEdgeD() + 70, y: 55 }; // bird enters from the right edge
  const TA = T_WIND + T_SWING + T_FLIGHT; // arrival time
  const tb = constrain((B0.x - I.x) / 300, 1.0, 2.4);
  const TS = Math.max(0, TA - tb);
  throws.push({
    fish: f,
    t: 0,
    released: false,
    carry: false,
    done: false,
    I,
    B0,
    TA,
    TS,
    spin: 3.2,
    bird: { x: B0.x, y: B0.y, vx: 0, vy: 0, face: -1, vis: false },
  });
}

function armPhiAt(t) {
  const a = 50 * DEG,
    b = -25 * DEG;
  if (t < T_WIND) return lerp(PHI0, a, easeInOut(t / T_WIND));
  if (t < T_WIND + T_SWING) return lerp(a, b, easeOut((t - T_WIND) / T_SWING));
  const r = (t - T_WIND - T_SWING) / T_RECOVER;
  return r < 1 ? lerp(b, PHI0, easeInOut(r)) : PHI0;
}

function advanceThrows() {
  armPhi = PHI0; // the arm keeps its default pose (it only swings for the bird throw)
  for (const th of throws) {
    th.t += dt;
    if (th.t < T_WIND + T_SWING + T_RECOVER) armPhi = armPhiAt(th.t);
    // Bird: flies in from the right toward the interception point, then carries the fish away.
    const b = th.bird;
    if (!th.carry) {
      if (th.t >= th.TS) {
        const u = constrain((th.t - th.TS) / (th.TA - th.TS), 0, 1);
        b.vis = true;
        b.x = lerp(th.B0.x, th.I.x, u);
        b.y =
          lerp(th.B0.y, th.I.y, u) -
          Math.sin(u * Math.PI) * 12 +
          Math.sin(th.t * 5) * 3;
        b.vx = (th.I.x - th.B0.x) / (th.TA - th.TS);
        b.vy = (th.I.y - th.B0.y) / (th.TA - th.TS);
        b.face = -1;
      }
      if (th.t >= th.TA) th.carry = true; // caught!
    } else {
      b.vx += (260 - b.vx) * kk(2.2);
      b.vy += (-150 - b.vy) * kk(2.2);
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.face += ((b.vx > 0 ? 1 : -1) - b.face) * kk(10);
    }
  }
}

function updateThrowFish(th) {
  const f = th.fish,
    tRel = T_WIND + T_SWING;
  if (!th.released) {
    // fish still on the line during wind-up/swing
    f.textAlpha = 0;
    hangPose(f, hangAngle(), sEff(f), 1);
    if (th.t < tRel) return;
    th.released = true; // leaves the hook: line is free again
    th.p0 = { x: f.x, y: f.y };
    th.v0 = {
      x: (th.I.x - f.x) / T_FLIGHT,
      y: (th.I.y - f.y - 0.5 * G_THROW * T_FLIGHT * T_FLIGHT) / T_FLIGHT,
    };
    activeFish = null;
    hook.mode = "water";
    hook.lockUntil = millis() + 1500;
  }
  const tf = th.t - tRel;
  if (tf < T_FLIGHT) {
    // flying in a long arc, tumbling
    f.x = th.p0.x + th.v0.x * tf;
    f.y = th.p0.y + th.v0.y * tf + 0.5 * G_THROW * tf * tf;
    f.rot += th.spin * dt;
    f.faceX += (-1 - f.faceX) * kk(9);
    f.scale += (1.2 - f.scale) * kk(2);
  } else {
    // bird has it
    f.state = "eaten"; // memo permanently gone
    const b = th.bird;
    f.x = b.x;
    f.y = b.y + 24;
    f.faceX += (b.face - f.faceX) * kk(8);
    f.rot += (Math.sin(clock * 6) * 0.12 - f.rot) * kk(8);
    f.scale += (0.7 - f.scale) * kk(5);
    if (b.x > rightEdgeD() + 100 || b.y < -80) {
      // bird and fish have left the scene
      f.removed = true;
      th.done = true;
    }
  }
}

/* ==========================================================================
   Bucket: pictures, pose, memo list, drag + shake
   ========================================================================== */
// Pictures load asynchronously from setup(); if one fails, the drawn bucket is used instead.
function loadBucketImages() {
  for (const key of Object.keys(BUCKET_IMG)) {
    const e = BUCKET_IMG[key];
    e.ready = false;
    try {
      loadImage(
        encodeURI(e.file),
        (img) => {
          try {
            prepareBucketImage(e, img);
          } catch (err) {
            console.warn("bucket image", err);
          }
        },
        () => console.warn("bucket image not found:", e.file),
      );
    } catch (err) {
      console.warn(err);
    }
  }
}

// Turn the picture's dark background transparent, then measure the yellow bucket body so every
// picture can be scaled (uniformly) and aligned to the same rim width, centre and base.
function prepareBucketImage(e, img) {
  let m = { l: 0, r: img.width - 1, b: img.height - 1 }; // fallback: whole picture
  try {
    img.loadPixels();
    const p = img.pixels,
      bg = [p[0], p[1], p[2]];
    let l = img.width,
      r = -1,
      b = -1;
    for (let i = 0, n = img.width * img.height; i < n; i++) {
      const o = i * 4,
        R = p[o],
        G = p[o + 1],
        B = p[o + 2];
      const d = Math.max(
        Math.abs(R - bg[0]),
        Math.abs(G - bg[1]),
        Math.abs(B - bg[2]),
      );
      if (d < 10) p[o + 3] = 0;
      else if (d < 40) p[o + 3] = ((d - 10) / 30) * 255;
      if (R > 140 && G > 130 && B < 110 && Math.abs(R - G) < 45) {
        // yellow bucket pixels
        const x = i % img.width,
          y = (i / img.width) | 0;
        if (x < l) l = x;
        if (x > r) r = x;
        if (y > b) b = y;
      }
    }
    img.updatePixels();
    if (r >= l && b >= 0) m = { l, r, b };
  } catch (err) {
    console.warn("could not process bucket image", err);
  }
  e.img = img;
  e.m = m;
  e.ready = true;
}

// Picture for n memos, or null = the drawn bucket (also while a picture is still loading / failed).
function bucketLook(n) {
  const e = n >= 6 ? BUCKET_IMG.high : n >= 3 ? BUCKET_IMG.mid : null;
  return e && e.ready ? e : null;
}
function bucketTopOffset(n) {
  // design units from the base up to the top of what is drawn
  const e = bucketLook(n);
  return e ? e.m.b * (RIM_W / (e.m.r - e.m.l + 1)) : BUCKET.h + 8;
}
function listPose() {
  // fixed pose of the bucket while the list is open
  const wpx = constrain(Math.min(width, height) * 0.26, 110, 190);
  const p = toDesign(width / 2, height - 24);
  return { x: p.x, y: p.y, sc: wpx / (RIM_W * L.u) };
}
function bucketCenterPx() {
  return L.ox + bucket.x * L.u;
} // the one horizontal centre the list lines use
function bucketHit(m) {
  // pointer test in the bucket's own (rotated / scaled) frame
  const dx = m.x - bucket.x,
    dy = m.y - bucket.y,
    c = Math.cos(-bucket.rot),
    s = Math.sin(-bucket.rot);
  const lx = (dx * c - dy * s) / bucket.sc,
    ly = (dx * s + dy * c) / bucket.sc;
  return Math.abs(lx) <= 30 && ly >= -(BUCKET.h + 8) && ly <= 8;
}

function setUiLocked(b) {
  // memo input + reset button are off while the list is open
  inputEl.disabled = b;
  resetBtn.disabled = b;
  inputEl.style.opacity = resetBtn.style.opacity = b ? "0.35" : "1";
  if (b) inputEl.blur();
}
function openList() {
  if (bucketPour) return;
  listOpen = true;
  listScroll = 0;
  listCache = null;
  listTouch = null;
  press = null;
  drag = null;
  setUiLocked(true);
}
function closeList() {
  listOpen = false;
  listTouch = null;
  setUiLocked(false);
}

function updateBucket() {
  const target = listOpen ? 1 : 0;
  listSlide += (target - listSlide) * kk(7);
  if (Math.abs(target - listSlide) < 0.003) listSlide = target;
  const lp = listPose(),
    s = listSlide;
  const home = {
    x: lerp(BUCKET.mouthX, lp.x, s),
    y: lerp(BUCKET.y + BUCKET.h, lp.y, s),
  };
  bucket.sc = lerp(1, lp.sc, s);

  if (bucketPour) {
    // tip over, empty, come back
    const P = bucketPour;
    P.t += dt;
    const tilt = P.dir * 100 * DEG;
    if (P.t < 0.35) bucket.rot = lerp(0, tilt, easeOut(P.t / 0.35));
    else if (P.t < 1.1) bucket.rot = tilt + Math.sin(P.t * 20) * 0.04;
    else if (P.t < 1.5)
      bucket.rot = lerp(tilt, 0, easeInOut((P.t - 1.1) / 0.4));
    else {
      bucket.rot = 0;
      bucketPour = null;
    }
    bucket.vrot = 0;
    while (bucketPour && P.queue.length && P.t - 0.2 >= P.queue[0].delay)
      emitPoured(P, P.queue.shift().fish);
    if (bucketPour && P.t >= 1.1) {
      bucket.x += (home.x - bucket.x) * kk(8);
      bucket.y += (home.y - bucket.y) * kk(8);
    }
  } else if (bucketPress && bucketPress.dragging && !listOpen) {
    // being dragged
    const m = mouseD(),
      k = kk(22);
    const tx = constrain(m.x - bucketPress.gx, 20, rightEdgeD() - 20),
      ty = constrain(m.y - bucketPress.gy, 60, 430);
    bucket.x += (tx - bucket.x) * k;
    bucket.y += (ty - bucket.y) * k;
    // tilt toward the direction of travel, never more than 45 degrees
    const vm = (m.x - bucketPress.lastX) / Math.max(dt, 0.001);
    bucketPress.lastX = m.x;
    bucketPress.vsm += (vm - bucketPress.vsm) * kk(10);
    const want =
      Math.sign(bucketPress.vsm) *
      45 *
      DEG *
      Math.min(1, Math.abs(bucketPress.vsm) / 300);
    bucket.rot = constrain(
      bucket.rot + (want - bucket.rot) * kk(12),
      -45 * DEG,
      45 * DEG,
    );
    bucket.vrot = 0;
    detectShake(m.x);
  } else {
    // back to the dock / list position, upright (soft wobble)
    bucket.x += (home.x - bucket.x) * kk(8);
    bucket.y += (home.y - bucket.y) * kk(8);
    bucket.vrot += (90 * (0 - bucket.rot) - 10 * bucket.vrot) * dt;
    bucket.rot += bucket.vrot * dt;
  }
}

// Fast left-right-left-right while dragging = shake. A reversal only counts if the pointer travelled
// at least 22 units since the previous one; 4 reversals within 1 s trigger the pour (once).
function detectShake(x) {
  const P = bucketPress;
  if (!P.sh) P.sh = { dir: 0, last: x, ext: x, revs: [] };
  const sh = P.sh,
    d = x - sh.last;
  if (Math.abs(d) > 0.3) {
    const nd = Math.sign(d);
    if (sh.dir !== 0 && nd !== sh.dir && Math.abs(sh.last - sh.ext) >= 22) {
      sh.revs.push(clock);
      sh.ext = sh.last;
    }
    sh.dir = nd;
    sh.last = x;
  }
  sh.revs = sh.revs.filter((t) => clock - t < 1.0);
  if (sh.revs.length >= 4 && bookmarks.length > 0 && !bucketPour) triggerPour(); // empty bucket: nothing happens
}

// On the dock (x < WATER_X0): memos are deleted for good. Over the water: they become swimming fish again.
function triggerPour() {
  const water = bucket.x >= WATER_X0;
  const dir = water ? (bucket.x < 480 ? 1 : -1) : bucket.x < 156 ? 1 : -1;
  const items = bookmarks.slice();
  bookmarks = [];
  bucketPress = null; // list is emptied right away (count + picture update)
  const queue = items.map((b, i) => {
    const size = random(58, 96);
    return {
      delay: i * 0.07,
      fish: buildFish({
        // same id + memo text as the bookmark
        id: b.id,
        memo: b.memo,
        size,
        dir: random() < 0.5 ? -1 : 1,
        speed: random(18, 52),
        baseY: random(UW.top + size * 0.2, UW.bottom - size * 0.2),
        col: lerpColor(
          color(random(FISH_PALETTE)),
          color(random(FISH_PALETTE)),
          random(),
        ),
        x: bucket.x,
        y: bucket.y,
        phase: random(TWO_PI),
        state: "pouring",
      }),
    };
  });
  bucketPour = { t: 0, mode: water ? "water" : "land", dir, queue };
  showToast(
    water
      ? items.length + "개의 물고기를 놓아줬어요"
      : items.length + "개의 메모를 삭제했어요",
  );
  saveState(); // land: gone for good. water: the queued fish are saved with the fish list.
}

function emitPoured(P, f) {
  const h = BUCKET.h * bucket.sc;
  const mx = bucket.x + Math.sin(bucket.rot) * h,
    my = bucket.y - Math.cos(bucket.rot) * h; // bucket mouth
  f.x = mx;
  f.y = my;
  f.scale = 0.5;
  f.fillAmt = 1;
  f.faceX = P.dir;
  f.rot = 0;
  f.textAlpha = 0;
  if (P.mode === "water") {
    f.vx = P.dir * random(50, 150);
    f.vy = -random(20, 90);
    f.state = "released"; // existing physics: falls in, splashes, swims on, saves
    f.noHookUntil = millis() + 4000;
    fishes.push(f);
  } else {
    f.scale = 0.55;
    const floor = WATER_Y - 3 - f.size * 0.06,
      vy0 = -random(20, 80),
      H = Math.max(10, floor - my);
    const tf = (-vy0 + Math.sqrt(vy0 * vy0 + 2 * G_RELEASE * H)) / G_RELEASE;
    const landX = constrain(mx + P.dir * random(25, 110), 48, 262);
    Object.assign(f, {
      state: "dumped",
      vx: (landX - mx) / tf,
      vy: vy0,
      spin: random(-4, 4),
      floor,
      landed: false,
      lt: 0,
      alpha: 1,
    });
    dumped.push(f);
  }
}

function updateDumped() {
  // fish on the dock: fall, flop, fade out
  for (const d of dumped) {
    if (!d.landed) {
      d.vy += G_RELEASE * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.rot += d.spin * dt;
      if (d.vy > 0 && d.y >= d.floor) {
        d.y = d.floor;
        d.landed = true;
        d.lt = 0;
        d.r0 = d.rot;
      }
    } else {
      d.lt += dt;
      d.rot = lerp(
        d.r0,
        Math.sin(d.lt * 16) * 0.35 * Math.max(0, 1 - d.lt / 0.9),
        smooth(0, 0.12, d.lt),
      );
      d.alpha = d.lt > 1.1 ? Math.max(0, 1 - (d.lt - 1.1) / 0.5) : 1;
      if (d.lt > 1.6) d.removed = true;
    }
  }
  dumped = dumped.filter((d) => !d.removed);
}
function drawDumped() {
  for (const d of dumped) {
    drawingContext.globalAlpha = d.alpha;
    drawFish(d);
    drawingContext.globalAlpha = 1;
  }
}

/* ---------- Memo list panel (px space). Dotted lines are centred on bucketCenterPx(). ---------- */
function buildListLayout() {
  const key = bookmarks.map((b) => b.id).join(",") + "|" + width;
  if (listCache && listCache.key === key) return listCache;
  let colW = Math.min(width - 48, Math.max(320, Math.min(560, width * 0.6)));
  colW = Math.round(colW / 6.5) * 6.5; // multiple of the dot spacing: dots at both ends, symmetric
  const lh = 27,
    padY = 16;
  textSize(18);
  const items = bookmarks.map((b) => {
    const lines = wrapLines(b.memo, 400, new Array(400).fill(colW - 28)) || [
      b.memo,
    ];
    return { lines, h: lines.length * lh + padY * 2 };
  });
  listCache = {
    key,
    colW,
    lh,
    padY,
    items,
    total: items.reduce((a, it) => a + it.h, 0),
  };
  return listCache;
}

function drawListPanel() {
  const a = smooth(0, 0.6, listSlide);
  if (a <= 0.01) return;
  const top = L.input.y + L.input.h + 12,
    left = 12,
    w = width - 24,
    h = height - top - 12;
  noStroke();
  fill(31, 31, 31, 245 * a);
  stroke(220, 220, 220, 200 * a);
  strokeWeight(1.5);
  rect(left, top, w, h);

  const lay = buildListLayout(),
    cx = bucketCenterPx();
  const lp = listPose(),
    n = bookmarks.length;
  const bucketTopPx =
    L.oy + lp.y * L.u - bucketTopOffset(n) * lp.sc * L.u - 22 * lp.sc; // incl. the n/10 label
  const viewTop = top + 40,
    viewBottom = Math.max(viewTop + 40, bucketTopPx - 16),
    viewH = viewBottom - viewTop;
  listScroll = constrain(listScroll, 0, Math.max(0, lay.total - viewH));

  noStroke();
  fill(119, 119, 119, 255 * a);
  textAlign(CENTER, TOP);
  textSize(13);
  text("양동이를 다시 누르면 닫혀요", cx, top + 14);

  const x1 = cx - lay.colW / 2,
    x2 = cx + lay.colW / 2; // x1..x2 midpoint == bucket centre
  drawingContext.save();
  drawingContext.beginPath();
  drawingContext.rect(x1 - 6, viewTop, lay.colW + 12 + 16, viewH);
  drawingContext.clip();
  if (n === 0) {
    fill(150, 150, 150, 255 * a);
    textAlign(CENTER, CENTER);
    textSize(16);
    text("양동이가 비어 있어요", cx, (viewTop + viewBottom) / 2 - 12);
    fill(105, 105, 105, 255 * a);
    textSize(13);
    text(
      "낚은 물고기를 양동이로 끌어다 놓으면 메모가 보관돼요",
      cx,
      (viewTop + viewBottom) / 2 + 14,
    );
  } else {
    let y = viewTop - listScroll;
    for (const it of lay.items) {
      if (y + it.h >= viewTop && y <= viewBottom) {
        noStroke();
        fill(244, 244, 244, 255 * a);
        textAlign(LEFT, TOP);
        textSize(18);
        it.lines.forEach((ln, i) =>
          text(ln, x1 + 14, y + lay.padY + i * lay.lh),
        );
      }
      y += it.h;
      stroke(220, 220, 220, 170 * a);
      strokeWeight(2.2);
      strokeCap(ROUND); // dotted separator under each memo
      drawingContext.setLineDash([0.01, 6.49]);
      line(x1, y, x2, y);
      drawingContext.setLineDash([]);
    }
  }
  drawingContext.restore();
  const maxS = Math.max(0, lay.total - viewH);
  if (n > 0 && maxS > 0) {
    // small scroll thumb
    const th = Math.max(24, (viewH * viewH) / lay.total),
      ty = viewTop + (viewH - th) * (listScroll / maxS);
    stroke(220, 220, 220, 120 * a);
    strokeWeight(3);
    line(x2 + 12, ty, x2 + 12, ty + th);
  }
}

/* ==========================================================================
   Mouse input
   ========================================================================== */
function mousePressed(e) {
  // Clicks on the input, reset button or modal never reach the fishing logic.
  if (e && e.target && e.target.tagName && e.target.tagName !== "CANVAS")
    return;
  const m = mouseD();
  // While the memo list is open only two things react: the bucket (click = close) and scrolling.
  if (listOpen) {
    if (!bucketPour && bucketHit(m))
      bucketPress = { x0: mouseX, y0: mouseY, dragging: false };
    else listTouch = { y0: mouseY, s0: listScroll };
    return;
  }
  // 1) Caught fish: start timing; release / throw / bucket-drag is decided later.
  if (activeFish && activeFish.state === "caught" && fishHit(activeFish, m)) {
    press = {
      fish: activeFish,
      start: millis(),
      thrown: false,
      dragging: false,
      x0: mouseX,
      y0: mouseY,
    };
    return;
  }
  // 2) Bucket: a plain click toggles the memo list, a drag moves it (shaking it empties it).
  if (!bucketPour && bucketHit(m)) {
    bucketPress = {
      x0: mouseX,
      y0: mouseY,
      dragging: false,
      gx: m.x - bucket.x,
      gy: m.y - bucket.y,
      lastX: m.x,
      vsm: 0,
      sh: null,
    };
    return;
  }
  // 3) Rod / tip / line: dragging up and down changes the line length.
  if (rodHit(m)) drag = {};
}

function mouseDragged() {
  if (listOpen) {
    // list open: drag-scroll (touch) only
    if (listTouch) listScroll = listTouch.s0 - (mouseY - listTouch.y0); // clamped when drawn
    if (bucketPress && dist(mouseX, mouseY, bucketPress.x0, bucketPress.y0) > 8)
      bucketPress = null; // no longer a click
    return false;
  }
  if (bucketPress) {
    // click vs drag: > 8px = drag
    if (
      !bucketPress.dragging &&
      dist(mouseX, mouseY, bucketPress.x0, bucketPress.y0) > 8
    )
      bucketPress.dragging = true;
    return false;
  }
  if (press && !press.thrown && !press.dragging) {
    // moved far enough => carry the fish
    if (
      dist(mouseX, mouseY, press.x0, press.y0) > 8 &&
      press.fish.state === "caught" &&
      activeFish === press.fish
    )
      startFishDrag(press);
    return false;
  }
  if (drag) {
    // longer / shorter line, not a moving rod
    rod.len = constrain(rod.len + (mouseY - pmouseY) / L.u, LEN_MIN, LEN_MAX);
    return false;
  }
}

function mouseReleased() {
  if (listOpen) {
    if (bucketPress) closeList(); // a plain click on the bucket closes the list
    bucketPress = null;
    listTouch = null;
    return;
  }
  if (bucketPress) {
    if (!bucketPress.dragging && !bucketPour) openList(); // plain click opens the list; a drag only moved the bucket
    bucketPress = null; // (the bucket springs back to the dock)
    return;
  }
  if (press) {
    const f = press.fish;
    if (press.dragging)
      endFishDrag(f); // drop: bucket / full bucket / elsewhere
    else if (!press.thrown && f.state === "caught" && activeFish === f)
      releaseFish(f); // short click
    press = null; // (after a throw, nothing else happens)
  }
  drag = null;
}

function mouseWheel(e) {
  // scroll also reels the line in/out
  if (listOpen) {
    listScroll += e.delta;
    return false;
  } // list open: wheel scrolls the list only
  rod.len = constrain(rod.len + e.delta * 0.15, LEN_MIN, LEN_MAX);
  return false;
}

/* ==========================================================================
   Rendering
   ========================================================================== */
function render() {
  background(COL.bg);

  const m = mouseD();
  const overFish =
    activeFish && activeFish.state === "caught" && fishHit(activeFish, m);
  const overBucket = !bucketPour && bucketHit(m);
  cursor(
    listOpen
      ? overBucket
        ? HAND
        : ARROW
      : drag ||
          (press && press.dragging) ||
          (bucketPress && bucketPress.dragging)
        ? "grabbing"
        : overFish || rodHit(m) || overBucket
          ? HAND
          : ARROW,
  );

  push();
  translate(L.ox, L.oy);
  scale(L.u);
  drawPerson();
  for (const f of fishes) if (f.state === "bucketed") drawFish(f); // drawn behind the bucket: looks like it drops in
  if (listSlide <= 0.003) drawBucket(); // while the list is open the bucket is drawn above the panel instead
  drawDumped();
  for (const f of fishes)
    if (f.state === "dropping" || f.state === "swimming") drawFish(f);
  drawWater();
  drawLineAndHook();
  for (const f of fishes)
    if (
      f.state !== "dropping" &&
      f.state !== "swimming" &&
      f.state !== "bucketed"
    )
      drawFish(f);
  drawRod();
  for (const th of throws) if (th.bird.vis) drawBird(th.bird, th.fish.id);
  drawHoldRing();
  pop();

  drawMemoPanel();
  drawHint();
  drawToast();

  if (listSlide > 0.003) {
    // memo list panel, then the bucket on top of it
    drawListPanel();
    push();
    translate(L.ox, L.oy);
    scale(L.u);
    drawBucket();
    pop();
  }
}

function drawPerson() {
  noStroke();
  fill(COL.dock);
  rect(35, 272, 242, 14); // dock
  rect(110, 230, 72, 13); // stool seat
  rect(118, 243, 13, 29);
  rect(160, 243, 13, 29); // stool legs
  fill(COL.person);
  circle(142, 95, 50); // head
  rect(124, 124, 36, 98); // torso
  rect(124, 196, 91, 26); // thigh
  rect(201, 222, 14, 44); // shin
  quad(201, 258, 236, 262, 237, 272, 201, 270); // foot
  const h = handPos(); // arm (swings during the throw)
  stroke(COL.person);
  strokeWeight(12);
  strokeCap(SQUARE);
  line(SHOULDER.x, SHOULDER.y, h.x, h.y);
  strokeCap(ROUND);
}

function drawRod() {
  const b = rodBase(),
    t = rodTip();
  stroke(COL.rod);
  strokeWeight(8);
  strokeCap(SQUARE);
  line(b.x, b.y, t.x, t.y);
  strokeCap(ROUND);
  noFill();
  stroke(138, 138, 138, 130);
  strokeWeight(1.2);
  circle(t.x, t.y, 16); // drag handle hint at the tip
}

function drawWater() {
  noFill();
  stroke(COL.water);
  strokeWeight(6);
  strokeCap(ROUND);
  strokeJoin(ROUND);
  beginShape();
  for (let x = 277; x <= 686; x += 4) vertex(x, waveY(x));
  endShape();
}

function drawLineAndHook() {
  const t = rodTip(),
    hx = hook.x,
    hy = hook.y;
  stroke(COL.line);
  strokeWeight(1.5);
  noFill();
  const sag = constrain(hook.vy * 0.03, -14, 14); // line bows while it is being reeled
  const cx = lerp(t.x, hx, 0.4) + 6 + Math.sin(clock * 1.3) * 3 - sag,
    cy = lerp(t.y, hy, 0.55);
  bezier(t.x, t.y, cx, cy, cx, cy, hx, hy - 10); // slightly bowed line
  strokeWeight(1.8); // small J-hook: the catch point is its tip
  beginShape();
  vertex(hx, hy - 10);
  vertex(hx, hy - 3);
  bezierVertex(hx, hy + 4, hx + 8, hy + 4, hx + 8, hy - 2); // hook tip points away from the angler (right)
  endShape();
}

// Fish outline in local coords, head toward +x, length len.
function fishShape(len) {
  beginShape();
  vertex(0.5 * len, 0.02 * len);
  bezierVertex(
    0.3 * len,
    -0.17 * len,
    -0.05 * len,
    -0.2 * len,
    -0.3 * len,
    -0.02 * len,
  );
  vertex(-0.5 * len, -0.14 * len);
  bezierVertex(
    -0.45 * len,
    -0.05 * len,
    -0.45 * len,
    0.05 * len,
    -0.5 * len,
    0.14 * len,
  );
  vertex(-0.3 * len, 0.03 * len);
  bezierVertex(
    -0.05 * len,
    0.2 * len,
    0.3 * len,
    0.17 * len,
    0.5 * len,
    0.02 * len,
  );
  endShape(CLOSE);
}

function drawFish(f) {
  const len = f.size;
  push();
  translate(f.x, f.y);
  rotate(f.rot);
  scale(f.scale);
  // body (mirrored by faceX so the fish can turn); text is drawn afterwards, un-mirrored
  push();
  const fx =
    Math.abs(f.faceX) < 0.03 ? 0.03 * (Math.sign(f.faceX) || 1) : f.faceX;
  scale(fx, 1);
  strokeWeight(2.2 / Math.sqrt(f.scale));
  strokeJoin(ROUND);
  stroke(lerpColor(f.col, color(255), f.fillAmt * 0.35));
  if (f.fillAmt > 0.01)
    fill(red(f.fillCol), green(f.fillCol), blue(f.fillCol), 255 * f.fillAmt);
  else noFill();
  fishShape(len);
  noStroke();
  fill(lerpColor(f.col, color(COL.bg), f.fillAmt));
  circle(0.34 * len, -0.04 * len, len * 0.045); // eye
  pop();

  // Memo text inside the body: only when caught and out of the water.
  if (f.textAlpha > 0.01 && f.fit) {
    noStroke();
    fill(red(f.textCol), green(f.textCol), blue(f.textCol), 255 * f.textAlpha);
    textAlign(CENTER, CENTER);
    textSize(f.fit.fs);
    const cx = f.faceX * 0.075 * len,
      cy = 0.005 * len,
      n = f.fit.lines.length;
    for (let i = 0; i < n; i++)
      text(f.fit.lines[i], cx, cy - (n * f.fit.lh) / 2 + (i + 0.5) * f.fit.lh);
  }
  pop();
}

function drawBird(b, seed) {
  push();
  translate(b.x, b.y);
  scale(1.7 * b.face, 1.7); // drawn facing +x, mirrored by face
  noStroke();
  const w = Math.sin(clock * 16 + seed);
  fill(COL.bird);
  triangle(-4, -2, 6, -2, 0, -17 * w); // flapping wing
  fill(COL.person);
  ellipse(0, 0, 24, 11); // body
  triangle(-10, 0, -21, -3, -21, 3); // tail
  circle(11, -3, 8); // head
  fill(COL.bird);
  triangle(14, -4, 20, -2, 14, -1); // beak
  fill(COL.bg);
  circle(12, -4, 1.6); // eye
  pop();
}

function drawHoldRing() {
  const f = activeFish;
  if (!f || f.state !== "caught") return;
  const p = holdProgress(f);
  if (p < 0.08) return; // don't flash on quick clicks
  const r = Math.max(f.size * f.scale * 0.36, 30);
  noFill();
  strokeWeight(4);
  strokeCap(ROUND);
  stroke(71, 184, 224, 70);
  circle(f.x, f.y, r * 2);
  stroke(COL.water);
  arc(f.x, f.y, r * 2, r * 2, -HALF_PI, -HALF_PI + TWO_PI * p);
}

// Big memo text in the empty space (right on wide screens, below the scene on narrow ones).
function drawMemoPanel() {
  if (listSlide > 0.003) return;
  const f = activeFish;
  if (
    !f ||
    !(f.state === "retrieving" || f.state === "caught") ||
    f.textAlpha <= 0.01
  )
    return;
  const P = L.panel,
    fsMax = L.narrow ? 32 : 58;
  const key =
    f.id + "|" + Math.round(P.w) + "x" + Math.round(P.h) + "|" + fsMax;
  let fit = panelCache[key];
  if (!fit) {
    fit = fitText(f.memo, { type: "rect", w: P.w, h: P.h }, fsMax);
    panelCache[key] = fit;
  }
  noStroke();
  fill(244, 244, 244, 255 * f.textAlpha);
  textSize(fit.fs);
  textAlign(L.narrow ? CENTER : LEFT, CENTER);
  const n = fit.lines.length,
    y0 = P.y + P.h / 2 - (n * fit.lh) / 2;
  const x = L.narrow ? P.x + P.w / 2 : P.x;
  for (let i = 0; i < n; i++) text(fit.lines[i], x, y0 + (i + 0.5) * fit.lh);
}

function drawHint() {
  if (listSlide > 0.003) return;
  let msg;
  if (fishes.length === 0)
    msg = "메모를 적고 Enter를 누르면 물고기가 물속으로 들어가요.";
  else if (
    activeFish &&
    (activeFish.state === "caught" || activeFish.state === "dragging")
  )
    msg =
      "클릭: 놓아주기  ·  2초 누르기: 새에게 던지기  ·  양동이로 드래그: 북마크";
  else if (!activeFish)
    msg = "낚싯대를 위아래로 드래그해 낚싯줄 길이를 조절하세요.";
  else return;
  noStroke();
  fill(119);
  textSize(14);
  textAlign(CENTER, BOTTOM);
  const w = L.narrow ? width - 32 : L.sceneW - 32;
  text(msg, 16, height - 62, w, 46);
}

function toPx(dx, dy) {
  return { x: L.ox + dx * L.u, y: L.oy + dy * L.u };
}

// Bucket on the dock + "n/10" label above it (they never overlap). While a fish is dragged, the
// dashed rectangle shows the drop zone.
function drawBucket() {
  const B = BUCKET,
    n = bookmarks.length,
    look = bucketLook(n); // look = picture for this count (null = drawn bucket)
  push();
  translate(bucket.x, bucket.y);
  rotate(bucket.rot);
  scale(bucket.sc * (1 + 0.1 * bucketPulse));
  if (look) {
    const k = RIM_W / (look.m.r - look.m.l + 1); // one uniform scale: never stretched
    image(
      look.img,
      -((look.m.l + look.m.r) / 2) * k,
      -look.m.b * k,
      look.img.width * k,
      look.img.height * k,
    );
  } else {
    noStroke();
    fill("#CCC444");
    quad(-24, -55, 24, -55, 18, 0, -18, 0);
    fill("#B2AD39");
    rect(-26, -58, 52, 5, 2); // rim
  }
  pop();
  noStroke();
  fill(n >= MAX_BM ? "#E8D95A" : "#DCDCDC");
  textAlign(CENTER, BOTTOM);
  textSize(13 * bucket.sc);
  text(n + "/" + MAX_BM, bucket.x, bucket.y - bucketTopOffset(n) * bucket.sc); // label above, never on the picture
  if (activeFish && activeFish.state === "dragging") {
    const z = B.zone,
      m = mouseD();
    const inside =
      m.x >= z.x && m.x <= z.x + z.w && m.y >= z.y && m.y <= z.y + z.h;
    drawingContext.setLineDash([6, 5]);
    noFill();
    stroke(204, 196, 68, inside ? 255 : 140);
    strokeWeight(1.5);
    rect(z.x, z.y, z.w, z.h, 6);
    drawingContext.setLineDash([]);
  }
}

function drawToast() {
  // short feedback, e.g. when the bucket is full
  if (!toast) return;
  const a = constrain((2.4 - toast.t) / 0.6, 0, 1);
  const p = toPx(BUCKET.x, BUCKET.y - 38);
  textSize(14);
  textAlign(LEFT, BOTTOM);
  const x = constrain(p.x, 8, Math.max(8, width - textWidth(toast.msg) - 8));
  noStroke();
  fill(232, 217, 90, 255 * a);
  text(toast.msg, x, p.y);
}
