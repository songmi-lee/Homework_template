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
  bg: "#47B8E0",
  sky: "#fff5e6",
  person: "#DCDCDC", // 새의 몸통색 (이미지 로딩 실패 시 대체 사람 그림에도 쓰임)
  dock: "#6B6B6B",
  rod: "#404040",
  line: "#a5a5a5",
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

const DOCK_Y = 272; // top surface of the dock (where things sit)
// Mean water surface. The waves rise 8.5 units and the line is 6 thick (+3), so the highest edge of the water
// is WATER_Y - 11.5. Using DOCK_Y + 12 keeps that highest point at or below the dock's top surface.
const WATER_Y = DOCK_Y + 12;
const UW = { l: 24, r: 682, top: 308, bottom: 428 }; // underwater swimming area

// Person / rod geometry (design units)
const SHOULDER = { x: 150, y: 130 },
  HAND_REST = { x: 216, y: 131 };
const ARM_LEN = Math.hypot(HAND_REST.x - SHOULDER.x, HAND_REST.y - SHOULDER.y);
const PHI0 = Math.atan2(HAND_REST.y - SHOULDER.y, HAND_REST.x - SHOULDER.x);
const ROD_LEN = 200,
  ROD_ANG = -29 * DEG; // the rod keeps one fixed pose
// Fisher illustration: assets/fisher_body_v2.png (static: head, torso, upper arm, legs, stool, dock) and
// assets/fisher_arm_v2.png (forearm + both gloves + reel + rod, ONE rigid piece). Both pictures share one pixel space
// ("full" space). ANCHOR is the dock's top-right corner in that space and lands on (DOCK_RIGHT, DOCK_Y) in the scene.
// SCALE resizes the whole fisher; ELBOW is the single rotation axis; GRIP is where the front hand holds the rod;
// TIP is the rod tip at rest (the fishing line starts there). Poses are rotation angles about ELBOW (negative = hand up).
const FISHER = {
  SCALE: 0.22,
  ANCHOR: { x: 1100, y: 1155 },
  DOCK_RIGHT: 277,
  ELBOW: { x: 695, y: 715 },
  GRIP: { x: 857, y: 617 },
  TIP: { x: 1305, y: 22 },
  BODY: { file: "assets/fisher_body_v2.png", x: 0, y: 415 }, // top-left of each cropped picture in full space
  ARM: { file: "assets/fisher_arm_v2.png", x: 677, y: 17 },
  POSE: { idle: 0, catch: -7 * DEG, feed: -16 * DEG },
  MOVE_S: 0.22, // length of a pose change (seconds); afterwards the pose is locked
  img: null,
  armImg: null,
  ok: false,
  failed: false, // 사진을 못 불러왔을 때만 true (그때만 코드로 그린 사람을 보여줌)
  COLOR: { dock: "#8B5E3C", stool: "#B07850" }, // null = 원래 크림색. 예: "#8B5E3C"
};
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
// Dashed drop-zone frame around the bucket. It is centred on the bucket (BUCKET.mouthX), so left/right are symmetric.
// halfW = half the frame width; padTop = gap above the "n/10" label; padBottom = how far below the bucket base it reaches.
const ZONE_STYLE = { halfW: 34, padTop: 12, padBottom: 6 };
// ---- Seasons + fish pictures ---------------------------------------------------------------------------
// A memo keeps TWO separate facts: createdAt (real device time, never changed) and season (which picture the fish
// uses; normally seasonOf(createdAt), but the calendar preview can pick another one).
const SEASONS = ["spring", "summer", "autumn", "winter"];
const SEASON_LABEL = {
  spring: "봄",
  summer: "여름",
  autumn: "가을",
  winter: "겨울",
};
// Dev switch: set e.g. 'winter' to force the fish picture of every NEW memo (createdAt is still the real time).
// The same can be done without editing code by opening the page with ?season=winter at the end of the URL.
const DEV_SEASON = null;
// One picture per season (replace the files to change the design). Any key of FISH_IMG_DEFAULT may be added to a season's
// entry to override it for that season only, e.g. summer: { file: '...', width: 1.2 }.
// Per-season values (width / textX / textY / textA / textB) were measured on each picture: 봄 병어, 여름 민어, 가을 전어, 겨울 아귀.
const FISH_IMG = {
  spring: {
    file: "assets/fish-spring.png",
    mouthU: 0.0105,
    mouthV: 0.529,
    width: 0.85,
    textX: 0.095,
    textY: 0,
    textA: 0.266,
    textB: 0.116,
  },
  summer: {
    file: "assets/fish-summer.png",
    mouthU: 0.0094,
    mouthV: 0.584,
    width: 1.0,
    textX: 0.089,
    textY: 0.01,
    textA: 0.307,
    textB: 0.134,
  },
  autumn: {
    file: "assets/fish-autumn.png",
    mouthU: 0.0107,
    mouthV: 0.574,
    width: 1.0,
    textX: 0.1,
    textY: 0.028,
    textA: 0.286,
    textB: 0.124,
  },
  winter: {
    file: "assets/fish-winter.png",
    mouthU: 0.0089,
    mouthV: 0.541,
    width: 1.05,
    textX: 0.154,
    textY: 0.058,
    textA: 0.269,
    textB: 0.108,
  },
};
// Size / position of the picture (relative to the fish length `size`, the point the fish moves / is caught by).
const FISH_IMG_DEFAULT = {
  width: 1.0, // picture width = size * width (height keeps the picture's own ratio)
  anchorX: 0.5,
  anchorY: 0.5, // which point of the picture (0..1) sits on the fish centre
  offsetX: 0,
  offsetY: 0, // extra shift, in units of `size`
  mouthU: 0.01,
  mouthV: 0.55, // 입 끝 위치(그림 왼쪽/위에서 0~1): 이 점이 바늘에 걸림
  facesRight: false, // false: the pictures are drawn with the head on the left (all four are)
  textX: 0.075,
  textY: 0.005, // where the memo text is centred while caught (units of `size`)
  textA: 0.27,
  textB: 0.12, // half width / half height of the text area (units of `size`)
};
const BUCKET_LABEL_FS = 11; // font size of the "n/10" label (design units; scales with the bucket)
const RIM_W = BUCKET.w + 4; // displayed width of the bucket rim (pictures are scaled to this)
const WATER_X0 = 277; // where the dock ends and the water begins
const WATER_X1 = 686; // right end of the water line (drawWater); the input box lines up with it
const RESET_MARGIN = 16; // reset button: distance from the browser window's right / bottom edge
// Dashed vertical guide (dock | water boundary) shown only while the bucket is being dragged.
// dash = [dash length, gap length] in design units.
const GUIDE_LINE = { color: "#888888", weight: 1.5, dash: [5, 5] };
// Two-line hint above the n/10 label while the memo list is open.
const BUCKET_NOTE = [
  "데크 위에서 흔들기: 메모 삭제",
  "물 위에서 흔들기: 메모 방생",
];
// "Bucket is full" toast: drawn on a dark plate in the memo-text area (position: toastAnchor()).
// Distance (design units) from the water's mean surface up to the bottom of the pour / release message.
// The waves rise ~11 units, so 16 leaves a visible gap above the crests.
const TOAST_WATER_GAP = 16;
const TOAST_STYLE = { size: 16, pad: 12, maxW: 340 };
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
let preview = { on: false, season: "spring" }; // calendar preview mode (one-shot)
let seasonBtn, seasonPop;
let titleEl; // the title above the memo box
let bucketAway = false; // true after a drag was released away from the dock: the clang plays once when it is home again
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
  buildSoundUI(); // sound on/off button (audio itself starts at the first click / key)
  buildSeasonUI();
  computeLayout();
  placeInput();
  loadState(); // restore memos + bucket from localStorage
  loadBucketImages(); // async; a failed load keeps the drawn bucket
  loadFishImages(); // async; a missing picture keeps the drawn fish
  loadFisherImages(); // async; missing pictures keep the drawn person + rod
  const t = rodTip();
  hook.x = t.x;
  hook.y = t.y + rod.len;
  window.addEventListener("pagehide", saveState);
  window.addEventListener("contextmenu", (ev) => {
    if (ev.target && ev.target.tagName === "CANVAS") ev.preventDefault();
  }); // no long-press menu on the canvas
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  computeLayout();
  placeInput();
  panelCache = {};
}

// The whole scene (everything except the text box, calendar and reset button) sits this many design units lower,
// so the rod tip can rise above the dock without covering the text box. Change this one number to move it.
const SCENE_DROP = 24;

// 제목 (메모 입력창 바로 위, 왼쪽 정렬). 글꼴 / 크기 / 색 / 굵기는 여기서 바꾸세요.
//  font: CSS font-family. 예) '"Georgia", serif'  '"Playfair Display", serif'  '"Pretendard", sans-serif'
//        (Google Fonts 같은 웹폰트는 index.html <head>에 <link>를 먼저 넣어야 보여요)
//  size: 한 줄의 글자 크기(px)   weight: 400(보통) ~ 900(가장 굵게)   lineHeight: 줄 간격 배수
//  gap: 제목과 입력창 사이 간격(px)   color: 글자색
const TITLE = {
  lines: ["Fishful", "Thinking"],
  font: '"Georgia", "Times New Roman", serif',
  size: 34,
  weight: 800,
  color: "#1f416c",
  lineHeight: 1.05,
  gap: 8,
};
function titleH() {
  return TITLE.lines.length * TITLE.size * TITLE.lineHeight; // height of the title text block (px)
}

function computeLayout() {
  L.narrow = width < 760 || width / height < 1.1;
  if (L.narrow) {
    // Phone/portrait: input on top, scene below it, memo text under the scene.
    L.u = Math.max(
      0.3,
      Math.min(
        width / DW,
        (height * 0.62 - 66 - titleH() - TITLE.gap) / (DH + SCENE_DROP),
      ),
    );
    L.ox = (width - DW * L.u) / 2;
    L.oy = 58 + titleH() + TITLE.gap + SCENE_DROP * L.u; // (the title sits above the input, so everything moves down by its height)
    L.sceneH = L.oy + DH * L.u + 8;
    L.panel = {
      x: 20,
      y: L.sceneH + 6,
      w: width - 40,
      h: Math.max(60, height - L.sceneH - 64),
    };
    L.btn = {
      x: width - RESET_MARGIN - 76,
      y: height - RESET_MARGIN - 38,
      w: 76,
      h: 38,
    };
    L.input = {
      x: 12,
      y: 10 + titleH() + TITLE.gap,
      w: width - 24 - 76 - 8,
      h: 38,
    };
  } else {
    // Wide: scene on the left ~64%, memo text in the empty space on the right.
    L.sceneW = width * 0.64;
    L.u = Math.min(L.sceneW / DW, height / (DH + SCENE_DROP));
    L.ox = (L.sceneW - DW * L.u) / 2;
    const oy0 = (height - (DH + SCENE_DROP) * L.u) / 2; // top of the (taller) layout box; the text box stays here
    L.oy = oy0 + SCENE_DROP * L.u;
    L.panel = {
      x: L.sceneW + 10,
      y: height * 0.14,
      w: Math.max(80, width - L.sceneW - 50),
      h: height * 0.64,
    };
    // Input: same left edge as before (design x 435), right edge = right end of the water line
    // (WATER_X1 plus half of the 6-unit round-capped stroke), converted with the current scale/offset.
    const ih = Math.max(30, 30 * L.u);
    const right = L.ox + (WATER_X1 + 3) * L.u;
    const iw = Math.max(120, right - (L.ox + 435 * L.u));
    // the title needs room above the input: if the window is too short, the input moves down by just enough
    L.input = {
      x: right - iw,
      y: Math.max(oy0 + 10 * L.u, titleH() + TITLE.gap + 10),
      w: iw,
      h: ih,
    };
    L.btn = {
      x: width - RESET_MARGIN - 76,
      y: height - RESET_MARGIN - 38,
      w: 76,
      h: 38,
    }; // bottom-right of the window
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
    color: "#000000",
    border: "1.5px solid #DCDCDC",
    borderRadius: "0",
    outline: "none",
    fontFamily: "sans-serif",
    zIndex: "10",
    display: "block",
  });
  titleEl = document.createElement("div");
  titleEl.id = "page-title";
  titleEl.textContent = TITLE.lines.join("\n");
  Object.assign(titleEl.style, {
    position: "fixed",
    whiteSpace: "pre",
    textAlign: "left",
    pointerEvents: "none",
    userSelect: "none",
    margin: "0",
    padding: "0",
    zIndex: "9",
  });
  document.body.appendChild(titleEl);
  inputEl.maxLength = 200;
  inputEl.placeholder = "Write a thought, press Enter";
  inputEl.autocomplete = "off";
  if (!document.getElementById("memo-input-style")) {
    const st = document.createElement("style");
    st.id = "memo-input-style";
    st.textContent =
      "#memo-input::placeholder{color:#AFAFAF}#memo-input:focus{border-color:#AFAFAF!important}";
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

// Calendar icon + season picker (plain HTML elements, so mouse and touch both work and the canvas never sees these clicks).
function buildSeasonUI() {
  const st = document.createElement("style");
  st.textContent =
    "#season-btn,#season-pop button{-webkit-tap-highlight-color:transparent}" +
    "#season-btn{position:fixed;box-sizing:border-box;display:flex;align-items:center;justify-content:center;padding:0;background:transparent;color:#DCDCDC;border:1.5px solid #DCDCDC;border-radius:0;cursor:pointer;z-index:10}" +
    "#season-btn svg{width:62%;height:62%}" +
    "#season-btn.on{color:#47B8E0;border-color:#47B8E0}" +
    "#season-pop{position:fixed;box-sizing:border-box;width:64px;display:none;flex-direction:column;gap:4px;padding:6px;background:#1F1F1F;border:1.5px solid #47B8E0;font-family:sans-serif;z-index:10}" +
    "#season-pop .hd{color:#47B8E0;font-size:12px;line-height:1.2;text-align:center;padding-bottom:2px;white-space:nowrap}" +
    "#season-pop button{font:inherit;font-size:14px;height:30px;padding:0;border:1.5px solid #6B6B6B;border-radius:0;background:transparent;color:#DCDCDC;cursor:pointer}" +
    "#season-pop button.sel{background:#DCDCDC;color:#1F1F1F;border-color:#DCDCDC}";
  document.head.appendChild(st);

  seasonBtn = document.createElement("button");
  seasonBtn.id = "season-btn";
  seasonBtn.type = "button";
  seasonBtn.setAttribute("aria-label", "계절 미리보기");
  seasonBtn.title = "계절 미리보기";
  seasonBtn.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">' +
    '<rect x="3" y="5" width="18" height="16" rx="1.5"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/></svg>';
  document.body.appendChild(seasonBtn);

  seasonPop = document.createElement("div");
  seasonPop.id = "season-pop";
  seasonPop.innerHTML =
    '<div class="hd">(미리보기)</div>' +
    SEASONS.map(
      (k) =>
        '<button type="button" data-season="' +
        k +
        '">' +
        SEASON_LABEL[k] +
        "</button>",
    ).join("");
  document.body.appendChild(seasonPop);

  seasonBtn.addEventListener("click", () => setPreview(!preview.on)); // icon again = cancel
  seasonPop.addEventListener("click", (ev) => {
    const k =
      ev.target &&
      ev.target.getAttribute &&
      ev.target.getAttribute("data-season");
    if (!SEASONS.includes(k)) return;
    preview.season = k;
    updateSeasonUI();
    if (inputEl) inputEl.focus(); // go on typing the memo
  });
  updateSeasonUI();
}

function setPreview(on) {
  preview.on = !!on;
  if (preview.on) preview.season = seasonOf(Date.now()); // start on the current season
  updateSeasonUI();
}
function updateSeasonUI() {
  if (!seasonBtn) return;
  seasonBtn.classList.toggle("on", preview.on);
  seasonBtn.setAttribute("aria-pressed", preview.on ? "true" : "false");
  seasonPop.style.display = preview.on ? "flex" : "none";
  seasonPop
    .querySelectorAll("button")
    .forEach((bt) =>
      bt.classList.toggle(
        "sel",
        bt.getAttribute("data-season") === preview.season,
      ),
    );
}

function placeInput() {
  const r = L.input,
    s = inputEl.style;
  s.left = r.x + "px";
  s.top = r.y + "px";
  s.width = r.w + "px";
  s.height = r.h + "px";
  if (titleEl) {
    const t = titleEl.style;
    t.left = r.x + "px";
    t.top = r.y - TITLE.gap - titleH() + "px"; // bottom of the title = TITLE.gap above the input
    t.fontFamily = TITLE.font;
    t.fontSize = TITLE.size + "px";
    t.fontWeight = TITLE.weight;
    t.color = TITLE.color;
    t.lineHeight = TITLE.lineHeight;
  }
  // (iOS Safari zooms the page when an input's font is under 16px, so 16 is the minimum)
  s.fontSize = Math.max(16, Math.min(20, r.h * 0.45)) + "px";
  if (seasonBtn) {
    // calendar icon: right next to the input, same height
    const sz = r.h,
      x = r.x + r.w + 8,
      ss = seasonBtn.style,
      ps = seasonPop.style;
    ss.left = x + "px";
    ss.top = r.y + "px";
    ss.width = sz + "px";
    ss.height = sz + "px";
    ps.left = Math.max(8, x + sz - 64) + "px";
    ps.top = r.y + sz + 6 + "px"; // season picker under the icon
  }
  if (resetBtn) {
    const b = L.btn,
      bs = resetBtn.style;
    // Pinned to the browser window with CSS (not to the canvas / design coordinates), so it stays put on resize.
    bs.left = "auto";
    bs.top = "auto";
    bs.right = RESET_MARGIN + "px";
    bs.bottom = RESET_MARGIN + "px";
    bs.width = b.w + "px";
    bs.height = b.h + "px";
    bs.fontSize = s.fontSize;
    if (soundBtn) {
      // sound toggle: just left of the reset button, same height / font
      const ss2 = soundBtn.style;
      ss2.left = "auto";
      ss2.top = "auto";
      ss2.right = RESET_MARGIN + b.w + 8 + "px";
      ss2.bottom = RESET_MARGIN + "px";
      ss2.width = Math.round(b.w * 1.35) + "px";
      ss2.height = b.h + "px";
      ss2.fontSize = s.fontSize;
    }
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
  const now = Date.now(); // the moment of creation: stored once, never recalculated
  const season = preview.on ? preview.season : devSeason() || seasonOf(now); // picture only; createdAt stays real
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
      createdAt: now,
      season,
    }),
  );
  saveState(); // important change: a new memo exists
  if (preview.on) setPreview(false); // preview is one-shot: closes after a memo was really created
}

// Season from a timestamp (kept separate from the picture logic below).
function seasonOf(ts) {
  const m = new Date(ts).getMonth() + 1;
  return m >= 3 && m <= 5
    ? "spring"
    : m >= 6 && m <= 8
      ? "summer"
      : m >= 9 && m <= 11
        ? "autumn"
        : "winter";
}
function devSeason() {
  let q = null;
  try {
    q = new URLSearchParams(location.search).get("season");
  } catch (e) {
    /* ignore */
  }
  return SEASONS.includes(q)
    ? q
    : SEASONS.includes(DEV_SEASON)
      ? DEV_SEASON
      : null;
}
// "2026. 10. 06. 화 09:05" from the stored creation time ('' for old memos that have none).
function formatStamp(ts) {
  if (!Number.isFinite(ts) || ts <= 0) return "";
  const d = new Date(ts),
    p = (n) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    ". " +
    p(d.getMonth() + 1) +
    ". " +
    p(d.getDate()) +
    ". " +
    "일월화수목금토"[d.getDay()] +
    " " +
    p(d.getHours()) +
    ":" +
    p(d.getMinutes())
  );
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
    createdAt:
      Number.isFinite(o.createdAt) && o.createdAt > 0 ? o.createdAt : null, // null = old memo without a stamp
    season: SEASONS.includes(o.season) ? o.season : null, // null = drawn (vector) fish
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
          createdAt: f.createdAt,
          season: f.season,
        })),
        bookmarks: bookmarks.map((b) => ({
          id: b.id,
          memo: b.memo,
          at: b.at,
          createdAt: b.createdAt,
          season: b.season,
        })),
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
          createdAt:
            Number.isFinite(b.createdAt) && b.createdAt > 0
              ? b.createdAt
              : null, // old data: no stamp, none invented
          season: SEASONS.includes(b.season) ? b.season : null,
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
            createdAt: o.createdAt,
            season: o.season,
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
    '<div class="box" role="dialog" aria-modal="true"><div>모든 메모와 양동이에 저장된 메모를 완전히 삭제할까요? 이 작업은 되돌릴 수 없습니다.</div>' +
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
  setPreview(false);
  bucketPour = null;
  bucketPress = null;
  bucketAway = false;
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
  const st = fishImg(f) ? fishImg(f).st : FISH_IMG_DEFAULT; // text area of the picture (or of the drawn fish)
  const shape = { type: "ellipse", a: st.textA * f.size, b: st.textB * f.size };
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
// Arm pose: changes only when the pose name changes (an event), eases once, then stays exactly on the pose angle.
let armPose = { goal: "idle", via: null, from: 0, to: 0, t: 1, ang: 0 };
function startArmMove(to) {
  armPose.from = armPose.ang;
  armPose.to = FISHER.POSE[to];
  armPose.t = 0;
}
function setArmPose(name) {
  if (name === armPose.goal) return;
  armPose.goal = name;
  // catch -> feed first lowers the arm to the idle pose, then raises it to feed
  if (name === "feed" && armPose.to === FISHER.POSE.catch) {
    armPose.via = "feed";
    startArmMove("idle");
  } else {
    armPose.via = null;
    startArmMove(name);
  }
}
function armPoseTarget() {
  // derived from state, so it can only change when a state changes
  if (throws.some((th) => !th.released)) return "feed";
  if (
    fishes.some(
      (f) =>
        f.state === "retrieving" ||
        f.state === "caught" ||
        f.state === "dragging",
    )
  )
    return "catch";
  return "idle";
}
function updateArmPose() {
  setArmPose(armPoseTarget());
  if (armPose.t < 1) {
    armPose.t = Math.min(1, armPose.t + dt / FISHER.MOVE_S);
    armPose.ang =
      armPose.t >= 1
        ? armPose.to
        : lerp(armPose.from, armPose.to, easeInOut(armPose.t));
    if (armPose.t >= 1 && armPose.via) {
      const v = armPose.via;
      armPose.via = null;
      startArmMove(v);
    } // second leg of catch -> idle -> feed
  }
}
function armRot(p) {
  // full-space point -> scene, rotated about the elbow by the current pose
  const F = FISHER,
    c = Math.cos(armPose.ang),
    sn = Math.sin(armPose.ang);
  const dx = p.x - F.ELBOW.x,
    dy = p.y - F.ELBOW.y;
  return fisherPt({
    x: F.ELBOW.x + dx * c - dy * sn,
    y: F.ELBOW.y + dx * sn + dy * c,
  });
}
function fisherPt(p) {
  const F = FISHER;
  return {
    x: F.DOCK_RIGHT + (p.x - F.ANCHOR.x) * F.SCALE,
    y: DOCK_Y + (p.y - F.ANCHOR.y) * F.SCALE,
  };
} // full pixel space -> scene
function rodBase() {
  if (FISHER.ok) return armRot(FISHER.GRIP);
  const h = handPos();
  return { x: h.x - 6, y: h.y + 8 };
}
function rodTip() {
  if (FISHER.ok) return armRot(FISHER.TIP); // the line starts here and follows every pose change
  const b = rodBase();
  return {
    x: b.x + ROD_LEN * Math.cos(rod.ang),
    y: b.y + ROD_LEN * Math.sin(rod.ang),
  };
}
function hangAngle() {
  return 14 * DEG;
} // tilt of a fish hanging from the hook (constant: nothing sways on its own)
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
  advanceThrows(); // advances throw clocks
  if (FISHER.ok) updateArmPose();
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
    const tx = tip.x + constrain(-hook.vy * 0.02, -8, 8);
    const ty = Math.min(tip.y + rod.len, UW.bottom - 6);
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
    hook.x += (tip.x - hook.x) * k;
    hook.y += (holdY - hook.y) * k;
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
  // The fish's mouth point (in the fish's local frame, mirrored by faceX) must sit on the hook tip.
  let mx = (f.faceX * f.size) / 2,
    my = 0;
  const e = fishImg(f);
  if (e) {
    const st = e.st,
      pw = f.size * st.width,
      ph = (pw * e.img.height) / e.img.width;
    mx =
      -f.faceX *
      ((st.mouthU - st.anchorX) * pw + st.offsetX * f.size) *
      (st.facesRight ? -1 : 1);
    my = (st.mouthV - st.anchorY) * ph + st.offsetY * f.size;
  }
  const c = Math.cos(theta),
    sn = Math.sin(theta);
  const tx = hook.x - s * (c * mx - sn * my);
  const ty = hook.y - s * (sn * mx + c * my);
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
      sfx("pop"); // sound A: new memo drops into the water
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
      if (f.sfxRel === "pour")
        sfx("splashPour", Math.random() * 0.04); // sound C: bucket released into the water (one per fish)
      else sfx("splashOne"); // sound B: one fish released
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
      sfx("reel"); // sound D1: reel ticks (a real catch only)
      if (SND.ctx) SND.reelEnd = SND.ctx.currentTime + 0.6;
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
    if (!f.sfxSurf && f.y < waveY(f.x) - 2) {
      f.sfxSurf = true; // once per catch
      sfxAfterReel("splashBig"); // sound D2: fish breaks the surface (after the reel ticks)
    }
    if (f.retrieveT >= 1) {
      if (!f.sfxSurf) {
        f.sfxSurf = true;
        sfxAfterReel("splashBig");
      }
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
  f.sfxRel = "one"; // sound B plays when it lands in the water
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
    z = bucketZone();
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
    showToast(
      "양동이가 가득 찼어요 (" + bookmarks.length + "/" + MAX_BM + ")",
      "panel",
    );
    releaseFish(f, 330 + random(0, 120));
  }
}

function bookmarkFish(f) {
  bookmarks.push({
    id: f.id,
    memo: f.memo,
    at: Date.now(),
    createdAt: f.createdAt,
    season: f.season,
  }); // the memo now lives in the bucket list
  f.state = "bucketed";
  f.bT = 0;
  f.b0 = { x: f.x, y: f.y, s: f.scale, r: f.rot };
  activeFish = null;
  hook.mode = "water";
  hook.lockUntil = millis() + 1200;
  bucketPulse = 1;
  sfx("plopBucket", 0.25); // sound H: the fish drops into the bucket (when it reaches the mouth)
  saveState(); // fish is excluded (bucketed), bookmark list is saved
}

function showToast(msg, place) {
  toast = { msg, t: 0, place: place || "bucket" };
} // place: 'bucket' (default, near the bucket) | 'panel'

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
  armPhi = PHI0; // drawn-person fallback only: the arm keeps its default pose (it only swings for the bird throw)
  for (const th of throws) {
    th.t += dt;
    if (!FISHER.ok && th.t < T_WIND + T_SWING + T_RECOVER)
      armPhi = armPhiAt(th.t); // fallback only; the pictures use setArmPose()
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
    sfx("whoosh"); // sound E1: fish starts flying
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
// Season fish pictures: loaded ONCE at start (not per fish). A missing / broken file only logs a warning and
// those fish keep the drawn look.
// 몸통 사진의 dock / 의자 크림색만 새 색으로 바꿉니다. [x0, y0, x1, y1]은 사진 안 픽셀 좌표예요.
const FISHER_RECT = { dock: [0, 735, 1104, 857], stool: [510, 515, 800, 735] };
// Why: reading pixels (loadPixels) from an image's canvas makes the browser switch THAT canvas to slow software mode
// ("Multiple readback operations using getImageData ..."); drawing it every frame then re-uploads the whole picture to
// the graphics card each time (30 fps lag with almost no JS time). A fresh copy that is never read back stays fast.
function cleanCopy(img) {
  try {
    const c = createImage(img.width, img.height);
    c.drawingContext.drawImage(img.canvas, 0, 0);
    return c;
  } catch (err) {
    return img;
  }
}

function recolorFisher(img) {
  const CREAM = [244, 236, 223],
    LINE = [14, 30, 11];
  const d = [CREAM[0] - LINE[0], CREAM[1] - LINE[1], CREAM[2] - LINE[2]],
    dd = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
  let loaded = false;
  for (const key of ["dock", "stool"]) {
    const hex = FISHER.COLOR[key];
    if (!hex) continue;
    if (!loaded) {
      img.loadPixels();
      loaded = true;
    }
    const c = color(hex),
      T = [red(c), green(c), blue(c)],
      [x0, y0, x1, y1] = FISHER_RECT[key];
    for (let y = y0; y < Math.min(y1, img.height); y++)
      for (let x = x0; x < Math.min(x1, img.width); x++) {
        const i = 4 * (y * img.width + x);
        if (img.pixels[i + 3] === 0) continue;
        const r = img.pixels[i] - LINE[0],
          g = img.pixels[i + 1] - LINE[1],
          b = img.pixels[i + 2] - LINE[2];
        const u = Math.min(
          1,
          Math.max(0, (r * d[0] + g * d[1] + b * d[2]) / dd),
        );
        const er = r - u * d[0],
          eg = g - u * d[1],
          eb = b - u * d[2];
        if (u > 0.05 && Math.hypot(er, eg, eb) < 28)
          for (let k = 0; k < 3; k++)
            img.pixels[i + k] = LINE[k] + u * (T[k] - LINE[k]);
      }
  }
  if (loaded) img.updatePixels();
}

function loadFisherImages() {
  const F = FISHER;
  loadImage(
    F.BODY.file,
    (a) =>
      loadImage(
        F.ARM.file,
        (b) => {
          recolorFisher(a);
          F.img = cleanCopy(a);
          F.armImg = b;
          F.ok = true;
          if (hook.mode === "water") {
            const t = rodTip();
            hook.x = t.x;
            hook.y = t.y + rod.len;
            hook.vx = hook.vy = 0;
          } // line start moved with the new rod
        },
        () => console.warn("fisher arm image missing, using drawn person"),
      ),
    () => {
      FISHER.failed = true;
      console.warn("fisher body image missing, using drawn person");
    },
  );
}

// Finds the inside of an outline-only fish picture: closes small gaps in the line (dilate), floods the outside from
// the picture border, and shrinks back. Returns a white silhouette image of the same size (null on failure).
function makeFishFill(img) {
  const w = img.width,
    h = img.height,
    R = Math.max(2, Math.round(w / 160));
  img.loadPixels();
  const grow = (src, r) => {
    // square dilation (separable), out-of-picture counts as 0
    const tmp = new Uint8Array(w * h),
      out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let v = 0;
        for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r) && !v; k++)
          v = src[y * w + k];
        tmp[y * w + x] = v;
      }
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let v = 0;
        for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r) && !v; k++)
          v = tmp[k * w + x];
        out[y * w + x] = v;
      }
    return out;
  };
  const ink = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) ink[i] = img.pixels[4 * i + 3] > 110 ? 1 : 0;
  const dil = grow(ink, R),
    outside = new Uint8Array(w * h),
    stack = [];
  const push2 = (i) => {
    if (!dil[i] && !outside[i]) {
      outside[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    push2(x);
    push2((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push2(y * w);
    push2(y * w + w - 1);
  }
  while (stack.length) {
    const i = stack.pop(),
      x = i % w;
    if (x > 0) push2(i - 1);
    if (x < w - 1) push2(i + 1);
    if (i >= w) push2(i - w);
    if (i < w * (h - 1)) push2(i + w);
  }
  const notInner = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) notInner[i] = outside[i] ? 1 : 0;
  const shrunk = grow(notInner, R); // 1 = still outside after shrinking the inside
  const fill = createImage(w, h);
  fill.loadPixels();
  for (let i = 0; i < w * h; i++) {
    const on = !shrunk[i];
    fill.pixels[4 * i] = fill.pixels[4 * i + 1] = fill.pixels[4 * i + 2] = 255;
    fill.pixels[4 * i + 3] = on ? 255 : 0;
  }
  fill.updatePixels();
  return fill;
}

function loadFishImages() {
  for (const key of SEASONS) {
    const e = FISH_IMG[key];
    e.ready = false;
    e.st = Object.assign({}, FISH_IMG_DEFAULT, e); // per-season overrides win over the defaults
    try {
      loadImage(
        encodeURI(e.file),
        (img) => {
          e.img = img;
          e.textCol = null;
          try {
            e.fillImg = makeFishFill(img); // inside of the outline: filled with the fish colour when caught
          } catch (err) {
            e.fillImg = null;
          }
          try {
            // average colour of the opaque pixels -> readable text colour
            img.loadPixels();
            let r = 0,
              g = 0,
              b = 0,
              n = 0;
            for (let i = 0; i < img.pixels.length; i += 16)
              if (img.pixels[i + 3] > 200) {
                r += img.pixels[i];
                g += img.pixels[i + 1];
                b += img.pixels[i + 2];
                n++;
              }
            if (n) e.textCol = bestTextColor(color(r / n, g / n, b / n));
          } catch (err) {
            /* keep the fish's own text colour */
          }
          e.img = cleanCopy(img); // draw from a canvas that was never read back (see cleanCopy)
          e.ready = true;
        },
        () => console.warn("fish image not found:", e.file),
      );
    } catch (err) {
      console.warn(err);
    }
  }
}

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
  e.img = cleanCopy(img);
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
  if (titleEl) titleEl.style.visibility = b ? "hidden" : "visible"; // hidden while the memo list covers the page
  // memo input + reset button are off while the list is open
  inputEl.disabled = b;
  resetBtn.disabled = b;
  seasonBtn.disabled = b;
  seasonBtn.style.visibility = seasonPop.style.visibility = b
    ? "hidden"
    : "visible";
  inputEl.style.visibility = resetBtn.style.visibility = b
    ? "hidden"
    : "visible"; // HTML elements sit above the canvas, so hide them
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
    bucketAway = false; // dragging again: no sound until it is released and has returned
    detectShake(m.x);
  } else {
    // back to the dock / list position, upright (soft wobble)
    bucket.x += (home.x - bucket.x) * kk(8);
    bucket.y += (home.y - bucket.y) * kk(8);
    bucket.vrot += (90 * (0 - bucket.rot) - 10 * bucket.vrot) * dt;
    bucket.rot += bucket.vrot * dt;
    if (
      bucketAway &&
      !listOpen &&
      Math.hypot(home.x - bucket.x, home.y - bucket.y) < 4
    ) {
      bucketAway = false;
      sfx("clang"); // sound G: back in place (plays once)
    }
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
  bucketAway = false;
  const queue = items.map((b, i) => {
    const size = random(58, 96);
    return {
      delay: i * 0.07,
      fish: buildFish({
        // same id + memo text as the bookmark
        id: b.id,
        memo: b.memo,
        createdAt: b.createdAt,
        season: b.season,
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
      : items.length + "개의 물고기를 삭제했어요",
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
    f.sfxRel = "pour"; // sound C plays when it lands in the water
    f.noHookUntil = millis() + 4000;
    fishes.push(f);
  } else {
    f.scale = 0.55;
    const floor = DOCK_Y - 3 - f.size * 0.06,
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
        sfx("flop", Math.random() * 0.05); // sound F: flapping on the dock
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
    const stamp = formatStamp(b.createdAt); // "memo ---- 2026. 10. 26. 월 16:25" (old memos: text only)
    if (stamp) {
      const suffix = " ---- " + stamp,
        last = lines.length - 1;
      if (textWidth(lines[last] + suffix) <= colW - 28) lines[last] += suffix;
      else lines.push("---- " + stamp);
    }
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

// px y of the top of the "n/10" label for a bucket whose base is at design y `by` with scale `sc`.
// Drop zone in design units. Its top is computed from the same numbers drawBucket() uses for the "n/10" label
// (base - bucketTopOffset(n) - label height), so the number is always inside the frame, whichever picture is shown.
function bucketZone() {
  const base = BUCKET.y + BUCKET.h,
    cx = BUCKET.mouthX;
  const top =
    base -
    bucketTopOffset(bookmarks.length) -
    BUCKET_LABEL_FS * 1.15 -
    ZONE_STYLE.padTop;
  return {
    x: cx - ZONE_STYLE.halfW,
    y: top,
    w: ZONE_STYLE.halfW * 2,
    h: base + ZONE_STYLE.padBottom - top,
  };
}

function bucketLabelTopPx(by, sc, n) {
  return (
    L.oy +
    (by - bucketTopOffset(n) * sc) * L.u -
    BUCKET_LABEL_FS * sc * L.u * 1.15
  );
}

function listNoteMetrics() {
  // font shrinks on narrow screens so the lines are never cut off
  let fs = 15;
  textSize(fs);
  while (
    fs > 10 &&
    Math.max(...BUCKET_NOTE.map((t) => textWidth(t))) > width - 32
  ) {
    fs -= 1;
    textSize(fs);
  }
  return { fs, lh: fs * 1.5, h: fs * 1.5 * BUCKET_NOTE.length };
}

function drawBucketNote() {
  // only while the list is open
  if (!listOpen) return;
  const a = smooth(0.4, 1, listSlide),
    mt = listNoteMetrics();
  const bottom = bucketLabelTopPx(bucket.y, bucket.sc, bookmarks.length) - 8; // above n/10
  noStroke();
  fill(180, 180, 180, 255 * a);
  textAlign(CENTER, BOTTOM);
  textSize(mt.fs);
  BUCKET_NOTE.forEach((ln, i) =>
    text(ln, bucketCenterPx(), bottom - (BUCKET_NOTE.length - 1 - i) * mt.lh),
  );
}

function drawListPanel() {
  const a = smooth(0, 0.6, listSlide);
  if (a <= 0.01) return;
  const top = 12,
    left = 12,
    w = width - 24,
    h = height - 24; // thin frame 12px inside the window edge
  noStroke();
  fill(31, 31, 31, 250 * a);
  rect(0, 0, width, height); // covers the whole window (top to bottom)
  noFill();
  stroke(220, 220, 220, 200 * a);
  strokeWeight(1.5);
  rect(left, top, w, h);

  const lay = buildListLayout(),
    cx = bucketCenterPx();
  const lp = listPose(),
    n = bookmarks.length;
  const bucketTopPx =
    bucketLabelTopPx(lp.y, lp.sc, n) - 8 - listNoteMetrics().h; // list ends above the n/10 label + the 2-line note
  const viewTop = top + 40,
    viewBottom = Math.max(viewTop + 40, bucketTopPx - 16),
    viewH = viewBottom - viewTop;
  listScroll = constrain(listScroll, 0, Math.max(0, lay.total - viewH));

  noStroke();
  fill(119, 119, 119, 255 * a);
  textAlign(CENTER, TOP);
  textSize(16);
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
    textSize(16);
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
    if (
      bucketPress.dragging &&
      !bucketPour &&
      Math.hypot(bucket.x - BUCKET.mouthX, bucket.y - (BUCKET.y + BUCKET.h)) >
        30
    )
      bucketAway = true; // sound G arms only if the bucket really has to come back
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

/* ==========================================================================
   Touch input (phones / tablets).
   Phones only synthesize mouse events for a quick TAP (mousedown + mouseup together, after the finger lifts) and
   never for dragging or holding, so mousePressed/mouseDragged/mouseReleased don't see those gestures.
   These handlers forward real touch events to the same mouse functions, so one code path serves both.
   Returning false stops the browser's scroll/zoom and its emulated mouse events (no double firing).
   Touches that start on the input box or the reset button are left alone.
   ========================================================================== */
let touchActive = false;
function touchStarted(e) {
  if (!e || !e.target || e.target.tagName !== "CANVAS") return; // input / button: normal behaviour
  if (touchActive || (e.touches && e.touches.length > 1)) return false; // ignore a second finger
  touchActive = true;
  mousePressed(e);
  return false;
}
function touchMoved(e) {
  if (!touchActive) return;
  mouseDragged(e);
  return false;
}
function touchEnded(e) {
  if (!touchActive) return;
  if (e && e.touches && e.touches.length > 0) return false; // another finger still down
  touchActive = false;
  mouseReleased(e);
  return false;
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
  background(COL.sky); // everything above the water / dock bottom

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
  drawBelowWater(); // dark area under the dock and the (wavy) water line
  if (bucketPress && bucketPress.dragging && !listOpen) drawGuideLine(); // dock | water boundary, only while dragging
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
    drawBucketNote();
  }
}

function drawFisherImages() {
  const F = FISHER,
    k = F.SCALE;
  push();
  imageMode(CORNER);
  const o = fisherPt(F.BODY);
  image(F.img, o.x, o.y, F.img.width * k, F.img.height * k); // static body
  const e = fisherPt(F.ELBOW);
  translate(e.x, e.y);
  rotate(armPose.ang); // forearm + hands + rod: one piece about the elbow
  image(
    F.armImg,
    (F.ARM.x - F.ELBOW.x) * k,
    (F.ARM.y - F.ELBOW.y) * k,
    F.armImg.width * k,
    F.armImg.height * k,
  );
  pop();
}

function drawPerson() {
  if (FISHER.ok) {
    drawFisherImages();
    return;
  }
  if (!FISHER.failed) return; // 사진을 불러오는 중에는 아무것도 그리지 않음
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
  if (!FISHER.ok && FISHER.failed) {
    // drawn rod only when the pictures are missing
    stroke(COL.rod);
    strokeWeight(8);
    strokeCap(SQUARE);
    line(b.x, b.y, t.x, t.y);
    strokeCap(ROUND);
  }
  noFill();
  stroke(138, 138, 138, 130);
  strokeWeight(1.2);
  circle(t.x, t.y, 16); // drag handle hint at the tip
}

function drawGuideLine() {
  push();
  noFill();
  stroke(GUIDE_LINE.color);
  strokeWeight(GUIDE_LINE.weight);
  strokeCap(SQUARE); // p5's SQUARE = butt caps: dash / gap lengths stay exact
  drawingContext.setLineDash(GUIDE_LINE.dash);
  line(WATER_X0, 0, WATER_X0, DH); // x of the real dock/water boundary, full scene height
  drawingContext.setLineDash([]); // restore: every other line is solid again
  pop();
  strokeCap(ROUND);
}

// Dark ground colour below the dock's underside and the water surface, across the whole window width.
function drawBelowWater() {
  const x0 = -L.ox / L.u - 2,
    x1 = (width - L.ox) / L.u + 2,
    yb = (height - L.oy) / L.u + 2;
  noStroke();
  fill(COL.bg);
  beginShape();
  vertex(x0, yb);
  vertex(x0, DOCK_Y + 14);
  vertex(WATER_X0, DOCK_Y + 14);
  for (let x = WATER_X0; x < WATER_X1; x += 4) vertex(x, waveY(x));
  vertex(WATER_X1, waveY(WATER_X1));
  vertex(x1, waveY(WATER_X1));
  vertex(x1, yb);
  endShape(CLOSE);
}

function drawWater() {
  noFill();
  stroke(COL.water);
  strokeWeight(6);
  strokeCap(ROUND);
  strokeJoin(ROUND);
  beginShape();
  for (let x = WATER_X0; x < WATER_X1; x += 4) vertex(x, waveY(x));
  vertex(WATER_X1, waveY(WATER_X1)); // end exactly at WATER_X1
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
  const cx = lerp(t.x, hx, 0.4) + 6 - sag,
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

// Loaded picture entry for this fish's season, or null (not loaded / failed / old memo) -> the drawn fish is used.
function fishImg(f) {
  const e = f.season ? FISH_IMG[f.season] : null;
  return e && e.ready ? e : null;
}

// The white inside-mask painted in one colour, as a small plain canvas (alpha of the mask is kept). Built ONCE per fish /
// picture and then only drawn (cheap): painting a full-size mask every frame for every fish made the page lag.
const FILL_MAXW = 512; // px width of the cached fill (enough for the biggest fish, even on a retina screen)
function paintMask(mask, col) {
  const k = Math.min(1, FILL_MAXW / mask.width),
    w = Math.max(1, Math.round(mask.width * k)),
    h = Math.max(1, Math.round(mask.height * k));
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const c = cv.getContext("2d");
  c.drawImage(mask.canvas, 0, 0, w, h);
  c.globalCompositeOperation = "source-in";
  c.fillStyle =
    "rgb(" +
    Math.round(red(col)) +
    "," +
    Math.round(green(col)) +
    "," +
    Math.round(blue(col)) +
    ")";
  c.fillRect(0, 0, w, h);
  return cv;
}

function drawFish(f) {
  const len = f.size,
    e = fishImg(f),
    st = e ? e.st : FISH_IMG_DEFAULT;
  push();
  translate(f.x, f.y);
  rotate(f.rot);
  scale(f.scale);
  // body (mirrored by faceX so the fish can turn); text is drawn afterwards, un-mirrored
  push();
  const fx =
    Math.abs(f.faceX) < 0.03 ? 0.03 * (Math.sign(f.faceX) || 1) : f.faceX;
  scale(fx, 1);
  if (e) {
    // season picture (transparent PNG), never stretched
    if (!st.facesRight) scale(-1, 1);
    const w = len * st.width,
      h = (w * e.img.height) / e.img.width;
    const wet = f.state === "swimming"; // 물속에서 헤엄치는 중: 안쪽을 물색으로 채워 겹친 물고기를 가림
    if (e.fillImg && (wet || f.fillAmt > 0.01)) {
      // inside of the outline. NOTE: p5's tint() re-computes every pixel on every call (very slow, it made the page lag),
      // so the colour is painted with the plain canvas instead.
      const ctx = drawingContext,
        a0 = ctx.globalAlpha,
        dx = -st.anchorX * w + st.offsetX * len,
        dy = -st.anchorY * h + st.offsetY * len;
      if (wet) {
        // water-coloured copy, built once per picture
        if (!e.fillWet) e.fillWet = paintMask(e.fillImg, color(COL.bg));
        ctx.drawImage(e.fillWet, dx, dy, w, h);
      } else {
        // fish colour, fading in with fillAmt (painted once per fish)
        if (!f.fillCv || f.fillCvFor !== e) {
          f.fillCv = paintMask(e.fillImg, f.fillCol);
          f.fillCvFor = e;
        }
        ctx.globalAlpha = a0 * f.fillAmt;
        ctx.drawImage(f.fillCv, dx, dy, w, h);
        ctx.globalAlpha = a0;
      }
    }
    image(
      e.img,
      -st.anchorX * w + st.offsetX * len,
      -st.anchorY * h + st.offsetY * len,
      w,
      h,
    );
  } else {
    // fallback: the original drawn fish
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
  }
  pop();

  // Memo text inside the body: only when caught and out of the water.
  if (f.textAlpha > 0.01 && f.fit) {
    const tc = e && e.textCol && !e.fillImg ? e.textCol : f.textCol; // picture: colour chosen for contrast with its average colour
    noStroke();
    fill(255, 255, 255, 255 * f.textAlpha); // 항상 흰색
    textAlign(CENTER, BASELINE); // 기준선 정렬: 브라우저 글꼴 정보와 상관없이 위치가 정확함
    textSize(f.fit.fs);
    const cx = f.faceX * st.textX * len,
      cy = st.textY * len,
      n = f.fit.lines.length;
    for (let i = 0; i < n; i++)
      text(
        f.fit.lines[i],
        cx,
        cy - (n * f.fit.lh) / 2 + (i + 0.5) * f.fit.lh + f.fit.fs * 0.36,
      );
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

// Hint text is centred on the window and vertically centred with the reset button (bottom-right).
// It shrinks / wraps (max 3 lines) to the space left of the button, so it is never hidden behind the button or cut off.
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
  // Centred on the window; the reset button stays at the bottom-right corner. The text may extend
  // symmetrically from the window centre only as far as the button's left edge (minus a 12px gap).
  const cx = width / 2,
    aw = 2 * (L.btn.x - 12 - cx);
  if (aw < 60) return;
  let fs = 16,
    lines = null;
  for (; fs >= 11 && !lines; fs--) {
    textSize(fs);
    lines = wrapLines(msg, 3, [aw, aw, aw]);
  }
  if (!lines) {
    fs = 11;
    textSize(fs);
    lines = [msg];
  }
  const lh = fs * 1.4,
    cy = L.btn.y + L.btn.h / 2;
  noStroke();
  fill(220);
  textAlign(CENTER, TOP);
  lines.forEach((ln, i) => text(ln, cx, cy - (lines.length * lh) / 2 + i * lh));
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
  fill(n >= MAX_BM ? "#b9b05c" : "#6e6d6d");
  textAlign(CENTER, BOTTOM);
  textSize(BUCKET_LABEL_FS * bucket.sc);
  text(n + "/" + MAX_BM, bucket.x, bucket.y - bucketTopOffset(n) * bucket.sc); // label above, never on the picture
  if (activeFish && activeFish.state === "dragging") {
    const z = bucketZone(),
      m = mouseD();
    const inside =
      m.x >= z.x && m.x <= z.x + z.w && m.y >= z.y && m.y <= z.y + z.h;
    push(); // keep the dash / stroke state local to this frame
    drawingContext.setLineDash([6, 5]);
    noFill();
    stroke(204, 196, 68, inside ? 255 : 140);
    strokeWeight(1.5);
    rect(z.x, z.y, z.w, z.h, 6);
    drawingContext.setLineDash([]);
    pop();
  }
}

// Where the 'panel' toast is centred (px): the middle of the memo-text area — landscape: right of the scene,
// portrait: below the scene. That area is empty while a fish is being dropped into the bucket.
function toastAnchor() {
  const P = L.panel;
  return {
    x: P.x + P.w / 2,
    y: P.y + P.h * 0.5,
    maxW: Math.min(P.w, TOAST_STYLE.maxW),
  };
}

function drawToast() {
  // short feedback, e.g. when the bucket is full
  if (!toast) return;
  const a = constrain((2.4 - toast.t) / 0.6, 0, 1);
  if (toast.place === "panel") {
    // dark plate + yellow text: readable on any background
    const A = toastAnchor(),
      S = TOAST_STYLE,
      lh = S.size * 1.4;
    textSize(S.size);
    const lines = wrapLines(
      toast.msg,
      6,
      new Array(6).fill(A.maxW - S.pad * 2),
    ) || [toast.msg];
    const bw = Math.max(...lines.map((l) => textWidth(l))) + S.pad * 2,
      bh = lines.length * lh + S.pad * 2;
    const bx = constrain(A.x - bw / 2, 8, Math.max(8, width - bw - 8));
    const by = constrain(A.y - bh / 2, 8, Math.max(8, height - bh - 8));
    fill(255, 255, 255, 235 * a);
    stroke(232, 217, 90, 255 * a);
    strokeWeight(1.5);
    rect(bx, by, bw, bh);
    noStroke();
    fill(232, 217, 90, 255 * a);
    textAlign(CENTER, TOP);
    lines.forEach((l, i) => text(l, bx + bw / 2, by + S.pad + i * lh));
    return;
  }
  // Pour / release messages: centred over the water, just above the wave crests (never touching the line).
  const p = toPx((WATER_X0 + WATER_X1) / 2, WATER_Y - TOAST_WATER_GAP);
  textSize(16);
  textAlign(CENTER, BOTTOM);
  const hw = textWidth(toast.msg) / 2;
  const x = constrain(p.x, 8 + hw, Math.max(8 + hw, width - 8 - hw));
  noStroke();
  fill(161, 148, 42, 255 * a);
  text(toast.msg, x, p.y);
}

/* ==========================================================================
   Sound (Web Audio). Everything is optional: if audio is unsupported, blocked, or a file is missing, the sketch
   keeps working silently. Sounds are triggered ONLY from real events through sfx(name, delaySec) — never from draw().
   - Background: a looping water recording from AUDIO_BG_FILES (put a real recording there; see the list below).
   - Effects: short sounds synthesised with Web Audio (no files needed).
   - Volumes are separate: SND.bgVol (background) and SND.sfxVol (effects). Start low / clear; adjust here.
   ========================================================================== */
const AUDIO_BG_FILES = [
  "assets/audio/river.mp3",
  "assets/river.mp3",
  "river.mp3",
  "assets/audio/river.ogg",
  "assets/audio/river.wav",
  "assets/river.wav",
  "assets/river.ogg",
]; // first one that loads is used
const SND = {
  ctx: null, // created on the first user gesture (browser autoplay rule)
  bgVol: 0.22, // background loop volume (0..1)  — keep clearly below the effects
  sfxVol: 1.8, // effects volume (0..1)
  muted: false,
  ready: false,
  bgBuf: null,
  bgNext: 0,
  recent: [], // start times of recent effects (limits pile-ups)
  last: {}, // last start time per effect name (limits double triggers)
  reelEnd: 0, // ctx time when the reel ticks end (the big splash waits for it)
};
try {
  SND.muted = localStorage.getItem("fishSoundMuted") === "1"; // (key does not start with "fishingMemo": reset keeps it)
} catch (e) {}

function initAudio() {
  // call from a user gesture; safe to call repeatedly
  try {
    if (SND.ctx) {
      if (SND.ctx.state === "suspended") SND.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (SND.ctx = new AC());
    SND.master = ctx.createGain();
    SND.master.gain.value = SND.muted ? 0 : 1;
    SND.master.connect(ctx.destination);
    SND.bg = ctx.createGain();
    SND.bg.gain.value = SND.bgVol;
    SND.bg.connect(SND.master);
    const comp = ctx.createDynamicsCompressor(); // keeps many overlapping effects from clipping
    comp.threshold.value = -16;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    comp.connect(SND.master);
    SND.sfx = ctx.createGain();
    SND.sfx.gain.value = SND.sfxVol;
    SND.sfx.connect(comp);
    // short noise buffer + a small reverb tail (generated, no files)
    const n = ctx.sampleRate * 2,
      nb = ctx.createBuffer(1, n, ctx.sampleRate),
      nd = nb.getChannelData(0);
    for (let i = 0; i < n; i++) nd[i] = Math.random() * 2 - 1;
    SND.noise = nb;
    const rl = Math.floor(ctx.sampleRate * 1.4),
      ir = ctx.createBuffer(2, rl, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < rl; i++)
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / rl, 2.6);
    }
    SND.rev = ctx.createConvolver();
    SND.rev.buffer = ir;
    SND.rev.connect(SND.sfx);
    SND.ready = true;
    if (ctx.state === "suspended") ctx.resume();
    loadBackground();
    loadClank();
  } catch (e) {
    console.warn("audio unavailable", e);
    SND.ready = false;
  }
}

// G: the bucket sound is a recording (assets/audio/bucket_clank.wav); if it is missing, the synthesised version below is used.
const AUDIO_CLANK_FILES = [
  "assets/audio/bucket_clank.wav",
  "assets/bucket_clank.wav",
  "bucket_clank.wav",
];
async function loadClank() {
  for (const url of AUDIO_CLANK_FILES) {
    try {
      const r = await fetch(encodeURI(url));
      if (!r.ok) continue;
      SND.clankBuf = await SND.ctx.decodeAudioData(await r.arrayBuffer());
      console.log("bucket sound loaded:", url);
      return;
    } catch (e) {
      /* next path */
    }
  }
  console.warn(
    "bucket sound file not found (" +
      AUDIO_CLANK_FILES.join(", ") +
      ") - using the synthesised one",
  );
}

// Loads the first existing file of AUDIO_BG_FILES; a missing file only logs a warning.
async function loadBackground() {
  for (const url of AUDIO_BG_FILES) {
    try {
      const r = await fetch(encodeURI(url));
      if (!r.ok) continue;
      const buf = await SND.ctx.decodeAudioData(await r.arrayBuffer());
      console.log("background sound loaded:", url);
      SND.bgBuf = buf;
      SND.bgNext = SND.ctx.currentTime + 0.05;
      scheduleBackground(true);
      setInterval(() => scheduleBackground(false), 500);
      return;
    } catch (e) {
      /* try the next file */
    }
  }
  console.warn(
    "background sound: no file found (" +
      AUDIO_BG_FILES.join(", ") +
      ") - effects still work",
  );
}

// Seamless loop: each pass fades out while the next one (same recording) fades in (equal-power crossfade).
function scheduleBackground(first) {
  const ctx = SND.ctx,
    b = SND.bgBuf;
  if (!ctx || !b) return;
  const xf = Math.min(3, b.duration / 4);
  while (SND.bgNext - ctx.currentTime < 2) {
    const t = SND.bgNext,
      src = ctx.createBufferSource(),
      g = ctx.createGain();
    const fin = first && t === SND.bgNext && !SND.bgStarted ? 1.5 : xf;
    SND.bgStarted = true;
    const N = 32,
      up = new Float32Array(N),
      dn = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      up[i] = Math.sin((i / (N - 1)) * Math.PI * 0.5);
      dn[i] = Math.cos((i / (N - 1)) * Math.PI * 0.5);
    }
    g.gain.setValueAtTime(0, t);
    g.gain.setValueCurveAtTime(up, t, fin);
    g.gain.setValueAtTime(1, t + fin);
    g.gain.setValueAtTime(1, t + b.duration - xf);
    g.gain.setValueCurveAtTime(dn, t + b.duration - xf, xf);
    src.buffer = b;
    src.connect(g);
    g.connect(SND.bg);
    src.start(t);
    src.stop(t + b.duration + 0.1);
    SND.bgNext = t + b.duration - xf;
  }
}

function setMuted(m) {
  SND.muted = m;
  try {
    localStorage.setItem("fishSoundMuted", m ? "1" : "0");
  } catch (e) {}
  if (SND.master)
    SND.master.gain.setTargetAtTime(m ? 0 : 1, SND.ctx.currentTime, 0.05);
  if (soundBtn) soundBtn.textContent = m ? "소리 OFF" : "소리 ON";
}

let soundBtn;
function buildSoundUI() {
  const st = document.createElement("style");
  st.textContent =
    "#sound-btn{position:fixed;box-sizing:border-box;background:transparent;color:#F4F4F4;border:1.5px solid #DCDCDC;border-radius:0;font-family:sans-serif;cursor:pointer;z-index:10;padding:0 8px;white-space:nowrap}" +
    "#sound-btn:hover{background:#2C2C2C}";
  document.head.appendChild(st);
  soundBtn = document.createElement("button");
  soundBtn.id = "sound-btn";
  soundBtn.type = "button";
  soundBtn.textContent = SND.muted ? "소리 OFF" : "소리 ON";
  soundBtn.addEventListener("click", () => {
    initAudio();
    setMuted(!SND.muted);
    soundBtn.blur();
  });
  document.body.appendChild(soundBtn);
  // the first click / key / touch anywhere starts the audio (autoplay rule)
  const first = () => {
    initAudio();
    for (const ev of ["pointerdown", "keydown", "touchstart"])
      window.removeEventListener(ev, first, true);
  };
  for (const ev of ["pointerdown", "keydown", "touchstart"])
    window.addEventListener(ev, first, true);
}

/* ---------- synthesis helpers ---------- */
function sOut(node, wet) {
  node.connect(SND.sfx);
  if (wet > 0) {
    const s = SND.ctx.createGain();
    s.gain.value = wet;
    node.connect(s);
    s.connect(SND.rev);
  }
}
function sEnv(g, t, att, peak, dec) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + att);
  g.gain.exponentialRampToValueAtTime(0.0001, t + att + dec);
}
function sTone(t, f0, f1, dur, peak, type, wet) {
  const c = SND.ctx,
    o = c.createOscillator(),
    g = c.createGain();
  o.type = type || "sine";
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  sEnv(g, t, Math.min(0.006, dur / 3), peak, dur);
  o.connect(g);
  sOut(g, wet || 0);
  o.start(t);
  o.stop(t + dur + 0.05);
}
function sNoise(t, dur, ftype, f0, f1, q, peak, att, wet) {
  const c = SND.ctx,
    s = c.createBufferSource(),
    f = c.createBiquadFilter(),
    g = c.createGain();
  s.buffer = SND.noise;
  f.type = ftype;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  sEnv(g, t, att || 0.005, peak, dur);
  s.connect(f);
  f.connect(g);
  sOut(g, wet || 0);
  s.start(t, Math.random() * 1.5);
  s.stop(t + dur + (att || 0.005) + 0.05);
}
const rnd = (a, b) => a + Math.random() * (b - a);

const SFX = {
  // A: new memo drops into the water — small, bright "pop"
  pop(t) {
    const r = rnd(0.94, 1.08);
    sTone(t, 520 * r, 1150 * r, 0.11, 0.38, "sine", 0.18);
    sTone(t + 0.07, 800 * r, 1500 * r, 0.07, 0.12, "sine", 0.18);
    sNoise(t, 0.03, "highpass", 3500, 3500, 0.7, 0.06, 0.002, 0);
  },
  // H: fish goes into the bucket — lower, rounder "plop"
  plopBucket(t) {
    const r = rnd(0.95, 1.05);
    sTone(t, 210 * r, 470 * r, 0.17, 0.55, "sine", 0.2);
    sTone(t + 0.1, 340 * r, 260 * r, 0.12, 0.2, "sine", 0.2);
    sNoise(t, 0.24, "lowpass", 900, 250, 0.7, 0.22, 0.004, 0.1);
  },
  // B: one released fish — a soft, low watery splash (muffled hiss + rising bubbles; no bright / crinkly noise)
  splashOne(t, v) {
    const r = rnd(0.92, 1.08);
    sNoise(t, 0.32, "lowpass", 2400 * r, 800 * r, 0.5, 0.42 * v, 0.03, 0.08);
    sNoise(
      t + 0.02,
      0.28,
      "bandpass",
      1300 * r,
      650 * r,
      0.9,
      0.2 * v,
      0.03,
      0.08,
    );
    for (let i = 0; i < 5; i++) {
      const f = rnd(350, 1000) * r;
      sTone(
        t + 0.04 + i * rnd(0.035, 0.06),
        f,
        f * rnd(1.7, 2.2),
        rnd(0.06, 0.1),
        0.16 * v,
        "sine",
        0.05,
      );
    }
  },
  // C: many fish poured into the water — a lighter splash per fish (kept cheap: few nodes, no reverb)
  splashPour(t, v) {
    const r = rnd(0.8, 1.25);
    sNoise(
      t,
      rnd(0.2, 0.3),
      "bandpass",
      4000 * r,
      1700 * r,
      0.7,
      0.26 * v,
      0.008,
      0,
    );
    for (let i = 0; i < 2; i++) {
      const f = rnd(700, 1800) * r;
      sTone(t + 0.04 + i * 0.04, f, f * 1.7, 0.05, 0.07 * v, "sine", 0);
    }
  },
  // D1: reel — quick light ratchet
  reel(t) {
    for (let i = 0; i < 14; i++) {
      const tt = t + i * 0.04;
      sNoise(tt, 0.014, "highpass", 3000, 3000, 1, 0.14 + i * 0.004, 0.001, 0);
      sTone(tt, 1500, 1150, 0.012, 0.035, "square", 0);
    }
  },
  // D2: fish breaks the surface — the same soft splash as B, a little bigger and longer
  splashBig(t) {
    const r = rnd(0.95, 1.05);
    sNoise(t, 0.45, "lowpass", 2600 * r, 750 * r, 0.5, 0.5, 0.04, 0.08);
    sNoise(
      t + 0.08,
      0.38,
      "bandpass",
      1400 * r,
      600 * r,
      0.9,
      0.24,
      0.05,
      0.08,
    );
    for (let i = 0; i < 7; i++) {
      const f = rnd(350, 1100) * r;
      sTone(
        t + 0.05 + i * rnd(0.035, 0.065),
        f,
        f * rnd(1.7, 2.2),
        rnd(0.06, 0.11),
        0.17,
        "sine",
        0.06,
      );
    }
  },
  // E1: fish leaves the hook — whoosh
  whoosh(t) {
    sNoise(t, 0.4, "bandpass", 450, 2600, 1.1, 0.38, 0.12, 0.08);
  },
  // F: fish lands on the dock — flapping on a hard floor (no water sounds; light on purpose: it can come in groups)
  flop(t, v) {
    const times = [0, 0.12, 0.26, 0.4, 0.58];
    times.forEach((d, i) => {
      const tt = t + d + rnd(-0.012, 0.012),
        a = Math.pow(0.78, i) * v;
      sNoise(tt, 0.045, "lowpass", 900, 350, 0.8, 0.4 * a, 0.002, 0);
      sTone(tt, 170 * rnd(0.9, 1.15), 80, 0.05, 0.3 * a, "sine", 0);
    });
  },
  // G: empty metal bucket settles back — "ding" then a few quick rattles ("땡그랑") with a ringing tail
  clang(t) {
    if (SND.clankBuf) {
      const src = SND.ctx.createBufferSource(),
        g = SND.ctx.createGain();
      src.buffer = SND.clankBuf;
      g.gain.value = 0.45; // the recording is loud (peak 0 dB)
      src.connect(g);
      sOut(g, 0);
      src.start(t);
      return;
    }
    const hits = [
      [0, 1, 1.0],
      [0.1, 0.78, 0.6],
      [0.19, 1.12, 0.42],
      [0.27, 0.9, 0.28],
    ];
    const P = [
      [1, 0.5, 1.1],
      [2.32, 0.35, 0.7],
      [4.25, 0.22, 0.4],
      [6.63, 0.12, 0.25],
    ];
    for (const [dt0, pm, a] of hits) {
      const f0 = 560 * pm;
      for (const [m, pa, d] of P)
        sTone(
          t + dt0,
          f0 * m,
          f0 * m * 0.997,
          d * (a > 0.5 ? 1.3 : 0.8),
          pa * a * 0.35,
          "sine",
          0.4,
        );
      sNoise(t + dt0, 0.03, "bandpass", 3500, 3500, 1.2, 0.25 * a, 0.001, 0.3);
    }
  },
};
const SFX_GAP = {
  pop: 0.08,
  plopBucket: 0.08,
  splashOne: 0.08,
  reel: 0.2,
  splashBig: 0.2,
  whoosh: 0.2,
  clang: 0.3,
}; // min seconds between starts (no double triggers)
const SFX_CROWD = { splashPour: 1, flop: 1 }; // sounds that may come in groups: quieter the more recent ones there are

// Play an effect at an event. delay in seconds. Does nothing if audio is not ready / muted.
function sfx(name, delay) {
  try {
    if (!SND.ready || SND.muted || !SFX[name]) return;
    const c = SND.ctx,
      now = c.currentTime;
    if (c.state === "suspended") c.resume();
    let v = 1;
    if (SFX_CROWD[name]) {
      SND.recent = SND.recent.filter((r) => now - r < 0.5);
      v = 1 / (1 + 0.3 * SND.recent.length); // many at once: total loudness stays limited
      if (SND.recent.length > 6) return; // enough voices: skip the rest (keeps the page smooth)
      SND.recent.push(now);
    } else {
      if (now - (SND.last[name] || -9) < (SFX_GAP[name] || 0.08)) return;
      SND.last[name] = now;
    }
    SFX[name](now + (delay || 0) + 0.005, v);
  } catch (e) {
    /* never let a sound break the sketch */
  }
}
// D: the big splash must come AFTER the reel ticks: call at the moment the fish leaves the water.
function sfxAfterReel(name) {
  if (!SND.ready) return;
  sfx(name, Math.max(0, SND.reelEnd - SND.ctx.currentTime));
}
