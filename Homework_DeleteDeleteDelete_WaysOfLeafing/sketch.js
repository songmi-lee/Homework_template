// ============================================================
//  Delete, Delete, Delete  —  CLICK / DRAG / HOLD
//  나무 좌표계는 880x880 "디자인 공간"이며 창 크기에 맞춰 자동 스케일됩니다.
// ============================================================

// ---------- [수정 가능한 설정값] ----------
const DESIGN_W = 1309,
  DESIGN_H = 1201; // 디자인 공간 = 첨부 나무 이미지 크기 (창 크기에 맞춰 자동 스케일)
const LEAF_SIZE_MULT = 1.0; // 잎 전체 크기 배율
const GREEN = [141, 182, 82]; // 초록
const RED = [200, 55, 40]; // 빨강
const BROWN = [125, 78, 42]; // 갈색
const TRUNK_COLOR = [124, 70, 40]; // 줄기/가지 색

// ---------- 나뭇가지 두께 (첨부 이미지에서 측정한 값. 계층별로 바깥으로 갈수록 가늘어짐) ----------
const TRUNK_THICKNESS = 76; // 주 줄기 밑동 두께 (가장 두꺼움)
const TRUNK_TAPER_END = 0.07; // 줄기 끝 두께 = 밑동 * 이 값
const BRANCH_RATIO = 0.7; // BRANCH_SPEC에 w가 없을 때: 시작 두께 = 붙은 지점의 부모 두께 * 이 값
const TAPER_END = 0.55; // 가지 끝 두께 = 가지 시작 두께 * 이 값
const MIN_THICKNESS = 2; // 가장 얇은 부분의 최소 두께
const MAX_DEPTH = 3; // 0=줄기, 1=1차, 2=2차
const TRUNK_FLARE = 22; // 밑동에 추가되는 두께
const TRUNK_FLARE_POWER = 4; // 클수록 아주 아래쪽에만 퍼짐 (2~6)

// ---------- 잎 부착 설정 ----------
const LEAF_EMBED = 3; // 잎 밑동(attachment point)이 가지 안쪽으로 파고드는 깊이(px) → 틈 방지
const ATTACHED_GAP = 3.5; // 원본 이미지에서 가지와 이 거리(px) 이하면 '이미 붙어 있는 잎' → 그대로 유지

const GRAVITY = 0.45; // CLICK 낙하 중력 (px/frame^2)
const CLICK_SPIN = 0.04; // CLICK 낙하 회전 속도
const WIND_GRAVITY = 0.12; // DRAG 바람 낙하 중력
const WIND_SWAY = 0.35; // DRAG 좌우 흔들림 세기
const DRAG_FOLLOW = 0.035; // DRAG 시 마우스를 따라가는 정도(작을수록 관성 큼)
const DRAG_DAMP = 0.93; // DRAG 속도 감쇠

const DRAG_THRESHOLD = 10; // px 이상 움직이면 DRAG
const HOLD_JUDGE_MS = 500; // 이 시간 이상 누르면 HOLD 판정
const HOLD_RED_MS = 2000; // 이 시점에 red
const HOLD_TOTAL_MS = 3000; // 이 시점에 brown → crumble
const DYING_MS = 250; // 갈색 상태로 떨리는 시간 (crumble 직전)
const FRAGMENTS = 36; // 바스러질 때 파편 개수
const TRAIL_OFFSET = 18; // 곡선 시작점: 잎의 attachment point(가지 쪽 꼭짓점)에서 바깥쪽으로 떨어진 거리
const VERTICAL_THRESHOLD = 2.0; // abs(dy) > abs(dx) * 이 값 이면 '수직 낙하'로 보고 곡선 숨김
const TRAIL_LENGTH_RATIO = 0.25; // 곡선 최대 길이 = canvas 폭의 1/4 (세로 화면이면 짧은 변 기준)
const TRAIL_TURN_ANGLE = 60; // 이동 방향이 이 각도(deg) 이상 꺾이면 곡선 삭제

// ---------- 나무 데이터 (첨부 이미지에서 초록 픽셀을 분리해 추출) ----------
// 잎: [중심x, 중심y, 길이, 방향(deg: 밑동→끝), 가지까지의 원본 거리(px)]  ← 개수/크기/형태는 원본 그대로
const LEAF_DATA = [
  [678, 61, 99, -109, 3.0],
  [421, 137, 89, -61, 2.0],
  [628, 136, 83, -176, 9.1],
  [718, 142, 81, -31, 1.0],
  [367, 195, 85, -168, 1.0],
  [467, 212, 78, -55, 1.0],
  [800, 222, 90, -119, 2.0],
  [883, 225, 102, -25, 2.0],
  [615, 232, 84, -158, 9.0],
  [532, 255, 89, -87, 12.0],
  [1055, 251, 84, -114, 1.4],
  [701, 214, 56, -25, 1.0],
  [1130, 256, 89, -20, 2.0],
  [417, 265, 76, 175, 2.8],
  [753, 293, 84, -155, 12.6],
  [296, 310, 87, -59, 1.4],
  [982, 323, 87, -126, 2.2],
  [384, 332, 72, -101, 1.0],
  [843, 322, 76, -28, 5.4],
  [216, 328, 102, -163, 3.0],
  [595, 335, 76, -39, 1.4],
  [486, 329, 77, 180, 2.2],
  [699, 360, 89, -21, 3.0],
  [1075, 343, 76, 12, 1.0],
  [260, 396, 85, 147, 8.5],
  [500, 405, 91, 139, 1.4],
  [828, 396, 64, -15, 7.0],
  [1014, 400, 72, -5, 1.4],
  [877, 441, 78, -86, 1.4],
  [338, 442, 77, 122, 37.0],
  [735, 451, 73, -150, 1.0],
  [584, 459, 90, 163, 2.2],
  [940, 465, 55, 2, 1.4],
  [1068, 484, 88, -38, 1.4],
  [1000, 496, 78, -113, 1.0],
  [806, 508, 61, -59, 1.0],
  [76, 539, 74, -52, 1.0],
  [435, 534, 90, -162, 1.4],
  [520, 545, 79, -52, 1.0],
  [842, 550, 68, 27, 1.4],
  [917, 575, 86, -119, 14.8],
  [1042, 569, 78, 19, 1.4],
  [777, 594, 70, 23, 1.4],
  [0, 616, 82, -115, 1.0],
  [448, 603, 86, 157, 10.3],
  [577, 613, 70, -66, 1.0],
  [847, 658, 85, -119, 20.2],
  [632, 667, 62, -96, 1.0],
  [977, 663, 87, 7, 1.4],
  [463, 675, 65, -112, 1.0],
  [243, 676, 95, 158, 6.7],
  [341, 705, 74, 109, 1.4],
  [563, 699, 70, -24, 1.0],
  [797, 747, 68, -112, 1.4],
  [427, 748, 88, 135, 11.0],
  [904, 748, 74, 16, 1.4],
  [508, 763, 75, 162, 23.3],
  [590, 802, 84, 122, 40.0],
  [867, 820, 82, 54, 18.4],
];
// 줄기 곡선 (3차 베지어 4점). 줄기/가지는 절대 움직이지 않음
const TRUNK_CURVE = [
  [695, 1175],
  [761, 654],
  [598, 519],
  [692, 112],
];
// 가지(원본 이미지의 가지 7개 그대로): parent=어느 가지에서 뻗는지, from=부모 위 접점(가장 가까운 점에 자동 부착), w=시작 두께
const BRANCH_SPEC = [
  {
    id: "b1",
    parent: "trunk",
    from: [655, 475],
    c1: [600, 378],
    c2: [467, 289],
    end: [402, 180],
    w: 20,
  }, // 1차
  {
    id: "b2",
    parent: "b1",
    from: [578, 380],
    c1: [466, 358],
    c2: [360, 396],
    end: [268, 347],
    w: 11,
  }, // 2차
  {
    id: "b3",
    parent: "trunk",
    from: [703, 655],
    c1: [778, 582],
    c2: [769, 395],
    end: [832, 250],
    w: 19,
  }, // 1차
  {
    id: "b4",
    parent: "b3",
    from: [752, 556],
    c1: [880, 514],
    c2: [990, 390],
    end: [1090, 275],
    w: 11,
  }, // 2차
  {
    id: "b5",
    parent: "trunk",
    from: [725, 830],
    c1: [855, 806],
    c2: [927, 658],
    end: [1035, 515],
    w: 19,
  }, // 1차
  {
    id: "b6",
    parent: "trunk",
    from: [688, 745],
    c1: [605, 693],
    c2: [527, 626],
    end: [478, 552],
    w: 19,
  }, // 1차
  {
    id: "b7",
    parent: "b6",
    from: [652, 722],
    c1: [497, 750],
    c2: [423, 675],
    end: [290, 653],
    w: 11,
  }, // 2차
];

let leaves = [];
let branches = []; // 줄기 + 모든 가지(끝가지 포함)
let S = 1,
  OX = 0,
  OY = 0; // 스케일/오프셋
let activeLeaf = null; // 지금 누르고 있는 잎

function setup() {
  createCanvas(windowWidth, windowHeight);
  computeTransform();
  buildTree(); // 가지 생성 + 모든 잎을 가지에 부착
}
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  computeTransform();
}
function computeTransform() {
  S = min(width / DESIGN_W, height / DESIGN_H);
  OX = (width - DESIGN_W * S) / 2;
  OY = (height - DESIGN_H * S) / 2;
}
// 마우스/화면 좌표 <-> 디자인 좌표
const mx = () => (mouseX - OX) / S;
const my = () => (mouseY - OY) / S;
// 화면 밖 판정 (디자인 좌표 기준)
function offscreen(x, y) {
  const sx = x * S + OX,
    sy = y * S + OY,
    m = 80;
  return sy > height + m || sy < -m * 3 || sx < -m * 2 || sx > width + m * 2;
}

function draw() {
  background(255);
  const dt = min(deltaTime, 50); // ms (탭 전환 시 튀는 것 방지)
  push();
  translate(OX, OY);
  scale(S);

  drawTree(); // 줄기/가지: 절대 움직이지 않음
  for (const l of leaves) l.update(dt);
  for (const l of leaves) l.draw();
  leaves = leaves.filter((l) => l.state !== "deleted");
  pop();

  drawHint(); // ← 이 한 줄만 추가 (pop() 다음, 함수 맨 끝)
}

// ============================================================
//  나뭇가지: 3차 베지어 곡선 + 위치별 두께(polygon으로 면적 있게 그림)
// ============================================================
const bz = (a, b, c, d, t) => {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
};
const bzd = (a, b, c, d, t) => {
  const u = 1 - t;
  return 3 * u * u * (b - a) + 6 * u * t * (c - b) + 3 * t * t * (d - c);
};

class Branch {
  constructor(id, parent, pts, w0, taper) {
    this.id = id;
    this.parent = parent;
    this.depth = parent ? min(parent.depth + 1, MAX_DEPTH) : 0;
    this.p = pts; // [[x,y] x4]
    this.w0 = w0;
    this.taper = taper;
  }
  point(t) {
    const p = this.p;
    return {
      x: bz(p[0][0], p[1][0], p[2][0], p[3][0], t),
      y: bz(p[0][1], p[1][1], p[2][1], p[3][1], t),
    };
  }
  angle(t) {
    const p = this.p;
    return atan2(
      bzd(p[0][1], p[1][1], p[2][1], p[3][1], t),
      bzd(p[0][0], p[1][0], p[2][0], p[3][0], t),
    );
  }
  width(t) {
    let w = this.w0 * (1 - (1 - this.taper) * t);
    if (this.depth === 0) w += TRUNK_FLARE * pow(1 - t, TRUNK_FLARE_POWER); // 줄기 밑동 flare
    return max(MIN_THICKNESS, w);
  } // 바깥(t=1)으로 갈수록 얇아짐
  closestT(x, y) {
    let best = 0,
      bd = Infinity;
    for (let i = 0; i <= 80; i++) {
      const q = this.point(i / 80),
        d = dist(q.x, q.y, x, y);
      if (d < bd) {
        bd = d;
        best = i / 80;
      }
    }
    return best;
  }
  draw() {
    const N = 36,
      Lp = [],
      Rp = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N,
        q = this.point(t),
        a = this.angle(t),
        w = this.width(t) / 2;
      Lp.push([q.x + cos(a - PI / 2) * w, q.y + sin(a - PI / 2) * w]);
      Rp.push([q.x + cos(a + PI / 2) * w, q.y + sin(a + PI / 2) * w]);
    }
    noStroke();
    fill(TRUNK_COLOR);
    beginShape();
    for (const v of Lp) vertex(v[0], v[1]);
    for (let i = Rp.length - 1; i >= 0; i--) vertex(Rp[i][0], Rp[i][1]);
    endShape(CLOSE);
    const e = this.point(1);
    circle(e.x, e.y, this.width(1)); // 끝을 둥글게
  }
}

// 가지 생성 → 잎을 기존 가지에 직접 부착 (새 가지/끝가지는 만들지 않음)
function buildTree() {
  branches = [];
  leaves = [];
  const byId = {};
  const trunk = new Branch(
    "trunk",
    null,
    TRUNK_CURVE,
    TRUNK_THICKNESS,
    TRUNK_TAPER_END,
  );
  byId.trunk = trunk;
  branches.push(trunk);
  for (const sp of BRANCH_SPEC) {
    const par = byId[sp.parent],
      t0 = par.closestT(sp.from[0], sp.from[1]),
      p0 = par.point(t0);
    const w0 = sp.w !== undefined ? sp.w : par.width(t0) * BRANCH_RATIO;
    const b = new Branch(
      sp.id,
      par,
      [[p0.x, p0.y], sp.c1, sp.c2, sp.end],
      w0,
      TAPER_END,
    );
    byId[sp.id] = b;
    branches.push(b);
  }
  const data = LEAF_DATA.map((d) => ({
    cx: d[0],
    cy: d[1],
    len: d[2] * LEAF_SIZE_MULT,
    ang: radians(d[3]),
    gap: d[4],
  }));
  const clash = (x, y, len) =>
    leaves.some((l) => dist(l.x, l.y, x, y) < 0.32 * (l.len + len)); // 잎끼리 겹침 방지

  // (A) 이미 가지에 붙어 있는 잎: 위치/회전 그대로 (밑동 → 가장 가까운 가지 지점)
  for (const d of data) {
    if (d.gap > ATTACHED_GAP) continue;
    const bx = d.cx - (cos(d.ang) * d.len) / 2,
      by = d.cy - (sin(d.ang) * d.len) / 2;
    let nb = null,
      nt = 0,
      nd = Infinity;
    for (const b of branches) {
      const t = b.closestT(bx, by),
        q = b.point(t),
        dd = dist(q.x, q.y, bx, by);
      if (dd < nd) {
        nd = dd;
        nb = b;
        nt = t;
      }
    }
    leaves.push(new Leaf(nb, nt, d.ang - nb.angle(nt), d.len));
  }
  // (B) 떠 있던 잎: 원래 위치와 가장 가까운(겹치지 않는) 기존 가지 지점으로 이동. 가지에서 바깥쪽으로 ±35~55° 기울여 자연스럽게
  for (const d of data) {
    if (d.gap <= ATTACHED_GAP) continue;
    let best = null,
      bc = Infinity;
    for (const b of branches)
      for (let i = 0; i <= 100; i++) {
        const t = i / 100,
          A = b.point(t),
          ta = b.angle(t);
        for (const off of [-55, -35, 35, 55]) {
          const rot = ta + radians(off),
            reach = d.len / 2 - LEAF_EMBED;
          const x = A.x + cos(rot) * reach,
            y = A.y + sin(rot) * reach;
          const c = dist(x, y, d.cx, d.cy) + (clash(x, y, d.len) ? 1000 : 0);
          if (c < bc) {
            bc = c;
            best = { b, t, off: radians(off) };
          }
        }
      }
    leaves.push(new Leaf(best.b, best.t, best.off, d.len));
  }
}

function drawTree() {
  for (const b of branches) b.draw();
  noStroke();
  fill(92, 38, 24); // 땅
  arc(701, 1195, 610, 96, PI, TWO_PI);
}

// 오른쪽 아래 구석 안내 문구 (화면 좌표 기준 → 창 크기와 상관없이 항상 구석에 고정)
function drawHint() {
  push();
  noStroke();
  fill(0); // 검정
  textSize(16); // 글자 크기
  textAlign(RIGHT, BOTTOM); // 오른쪽·아래 기준 정렬
  text("tap, drag, hold the leaves", width - 24, height - 24); // 구석에서 24px 안쪽
  pop();
}

// ============================================================
//  Leaf: 각 잎이 독립 객체. 상태:
//  attached / holding / falling / dragging / dying / crumbling / deleted
//  (attached 상태에서도 holdProgress는 유지되어 PAUSE 색상이 보존됨)
// ============================================================
class Leaf {
  // branch = 붙은 가지, branchPos = 가지 위 위치(0~1), angleOffset = 가지 진행방향 대비 회전(rad)
  constructor(branch, branchPos, angleOffset, len) {
    this.branch = branch;
    this.branchPos = branchPos;
    this.angleOffset = angleOffset;
    this.len = len;
    this.wid = len * 0.55;
    this.place(); // attachment point / rot / x, y 계산
    this.hx = this.x;
    this.hy = this.y; // 가지에 붙어있는 원래 위치
    this.state = "attached";
    this.holdProgress = 0; // 0~3000ms, release해도 절대 초기화하지 않음
    this.gesture = "none"; // none / pending / click / drag / hold
    this.pressStart = 0;
    this.px = 0;
    this.py = 0;
    this.vx = 0;
    this.vy = 0;
    this.vr = 0;
    this.wind = false; // DRAG 후 바람 낙하인지
    this.trail = [];
    this.refDir = null; // 곡선의 기준 진행 방향
    this.svx = 0;
    this.svy = 0; // 수직 판정용 부드럽게 평균낸 속도
    this.frags = [];
    this.stateTime = 0;
    this.seed = random(1000);
  }

  // attachment point(잎 밑동 꼭짓점)를 가지 위 한 점에 두고, 잎 몸통은 가지 진행방향 바깥으로 뻗게 배치
  place() {
    const A = this.branch.point(this.branchPos);
    this.attach = A; // attachment point
    this.rot = this.branch.angle(this.branchPos) + this.angleOffset; // 가지 방향에 맞춘 잎 방향
    const reach = this.len / 2 - LEAF_EMBED; // 밑동을 가지 안쪽으로 살짝 파고들게
    this.x = A.x + cos(this.rot) * reach;
    this.y = A.y + sin(this.rot) * reach;
  }

  // ---- 마우스가 잎 위에 있는지 (회전된 타원 근사) ----
  hit(x, y) {
    const dx = x - this.x,
      dy = y - this.y;
    const c = cos(-this.rot),
      s = sin(-this.rot);
    const lx = dx * c - dy * s,
      ly = dx * s + dy * c;
    const a = this.len / 2 + 4,
      b = this.wid / 2 + 4;
    return (lx * lx) / (a * a) + (ly * ly) / (b * b) <= 1;
  }
  get interactive() {
    return this.state === "attached";
  } // 낙하/삭제 과정의 잎은 대상 아님

  // ---- mousePressed: 입력 시작 → PENDING (아직 아무것도 확정 안 함) ----
  press() {
    this.gesture = "pending";
    this.pressStart = millis();
    this.px = mx();
    this.py = my();
  }

  // ---- mouseReleased ----
  release() {
    if (this.gesture === "pending") {
      // 500ms 이전 + 10px 미만 → CLICK : 즉시 낙하
      this.gesture = "click";
      this.startFall(false);
    } else if (this.gesture === "hold") {
      // HOLD 종료 → PAUSE. holdProgress는 그대로 두고 색도 유지
      this.state = "attached";
    } else if (this.gesture === "drag") {
      // DRAG 종료 → 관성을 유지한 채 바람에 날려 떨어짐
      this.startFall(true);
    }
  }

  // ---- [Interaction 1: CLICK] 즉각 낙하 ----
  startFall(wind) {
    this.state = "falling";
    this.wind = wind;
    if (!wind) {
      this.vx = random(-0.3, 0.3);
      this.vy = 0;
      this.vr = random(-CLICK_SPIN, CLICK_SPIN);
    }
  }

  update(dt) {
    const f = dt / 16.67; // 프레임 보정 계수
    this.stateTime += dt;

    switch (this.state) {
      case "attached":
        this.updatePress();
        break;
      case "holding":
        this.updateHold(dt);
        break;
      case "dragging":
        this.updateDrag(f);
        break;
      case "falling":
        this.updateFall(f);
        break;
      case "dying":
        if (this.stateTime >= DYING_MS) this.startCrumble();
        break;
      case "crumbling":
        this.updateCrumble(f, dt);
        break;
    }
  }

  // 판정 단계: PENDING 상태에서 DRAG / HOLD 확정 검사
  updatePress() {
    if (activeLeaf !== this || this.gesture !== "pending") return;
    const moved = dist(mx(), my(), this.px, this.py);
    if (moved >= DRAG_THRESHOLD) {
      // movement >= 10px → DRAG
      this.gesture = "drag";
      this.state = "dragging";
      this.trail = [];
      this.refDir = null;
      this.svx = this.svy = 0;
      this.vx = this.vy = 0;
    } else if (millis() - this.pressStart >= HOLD_JUDGE_MS) {
      // 500ms 유지 → HOLD
      this.gesture = "hold";
      this.state = "holding";
    }
  }

  // ---- [Interaction 3: HOLD] 누르는 동안만 holdProgress 누적 ----
  updateHold(dt) {
    // 한번 HOLD가 되면 마우스가 움직여도 DRAG로 바뀌지 않음
    if (activeLeaf === this && mouseIsPressed) {
      this.holdProgress = min(this.holdProgress + dt, HOLD_TOTAL_MS);
      this.x =
        this.hx + random(-0.4, 0.4) * (this.holdProgress / HOLD_TOTAL_MS); // 미세 떨림
      if (this.holdProgress >= HOLD_TOTAL_MS) {
        this.state = "dying";
        this.stateTime = 0; // 3초 충족 → 갈색 → crumble
        activeLeaf = null;
      }
    }
  }
  // holdProgress → 색상 (0~2000: green→red, 2000~3000: red→brown)
  currentColor() {
    const p = this.holdProgress;
    const g = color(...GREEN),
      r = color(...RED),
      b = color(...BROWN);
    if (p <= HOLD_RED_MS) return lerpColor(g, r, p / HOLD_RED_MS);
    return lerpColor(
      r,
      b,
      min((p - HOLD_RED_MS) / (HOLD_TOTAL_MS - HOLD_RED_MS), 1),
    );
  }

  // ---- [Interaction 2: DRAG] 관성 + 바람 + 궤적 ----
  updateDrag(f) {
    if (!mouseIsPressed || activeLeaf !== this) return;
    const t = millis() * 0.004 + this.seed;
    // 마우스를 느슨한 스프링으로 따라감 → 관성/곡선 움직임
    this.vx += (mx() - this.x) * DRAG_FOLLOW * f + sin(t) * WIND_SWAY * 0.3 * f;
    this.vy += (my() - this.y) * DRAG_FOLLOW * f + WIND_GRAVITY * f;
    this.vx *= pow(DRAG_DAMP, f);
    this.vy *= pow(DRAG_DAMP, f);
    this.x += this.vx * f;
    this.y += this.vy * f;
    this.rot = lerp(
      this.rot,
      atan2(this.vy, this.vx) * 0.6 + sin(t * 1.7) * 0.5,
      0.08 * f,
    );
    this.pushTrail();
    if (offscreen(this.x, this.y)) this.finish();
  }

  updateFall(f) {
    const t = millis() * 0.004 + this.seed;
    if (this.wind) {
      // DRAG 후: 바람에 날리며 천천히 낙하
      this.vx += sin(t) * WIND_SWAY * 0.3 * f;
      this.vy += WIND_GRAVITY * f;
      this.vx *= pow(0.985, f);
      this.vy *= pow(0.985, f);
      this.rot += sin(t * 1.3) * 0.04 * f;
      this.pushTrail();
    } else {
      // CLICK: 중력 가속도로 곧장 낙하
      this.vy += GRAVITY * f;
      this.rot += this.vr * f;
    }
    this.x += this.vx * f;
    this.y += this.vy * f;
    if (offscreen(this.x, this.y)) this.finish();
  }
  // 곡선 시작점 = attachment point(잎 밑동)에서 잎 바깥쪽(가지 방향)으로 TRAIL_OFFSET 만큼 떨어진 점.
  // 이 점이 지나간 경로를 곡선으로 그림 → 곡선이 잎에 붙지 않고 살짝 떨어져 보임
  pushTrail() {
    // 속도를 부드럽게 평균내어 수직 판정이 깜빡이지 않게 함
    this.svx = lerp(this.svx, this.vx, 0.15);
    this.svy = lerp(this.svy, this.vy, 0.15);

    const reach = this.len / 2 + TRAIL_OFFSET;
    const bx = this.x - cos(this.rot) * reach;
    const by = this.y - sin(this.rot) * reach;

    // 수직에 가까운 이동이면 곡선을 숨기고(비우고) 새로 시작
    if (abs(this.svy) > abs(this.svx) * VERTICAL_THRESHOLD) {
      this.trail = [];
      this.refDir = null;
      return;
    }

    // 방향 전환 감지: 이동 방향이 기준 방향에서 크게 꺾이면 곡선 즉시 삭제
    if (mag(this.vx, this.vy) > 0.8) {
      const a = atan2(this.vy, this.vx);
      if (this.refDir === null) this.refDir = a;
      const diff = atan2(sin(a - this.refDir), cos(a - this.refDir));
      if (abs(diff) > radians(TRAIL_TURN_ANGLE)) {
        this.trail = [];
        this.refDir = a;
      } else this.refDir += diff * 0.05; // 완만한 곡선 변화는 따라감
    }

    const last = this.trail[this.trail.length - 1];
    if (!last || dist(last.x, last.y, bx, by) > 1.5)
      this.trail.push({ x: bx, y: by });

    // 길이 제한: 끝(잎 쪽)에서부터 길이를 합산해 한도를 넘는 오래된 점은 제거
    const maxLen = (min(width, height) * TRAIL_LENGTH_RATIO) / S; // 화면 px → 디자인 좌표
    let total = 0;
    for (let i = this.trail.length - 1; i > 0; i--) {
      total += dist(
        this.trail[i].x,
        this.trail[i].y,
        this.trail[i - 1].x,
        this.trail[i - 1].y,
      );
      if (total > maxLen) {
        this.trail.splice(0, i);
        break;
      }
    }
  }
  finish() {
    this.state = "deleted";
    if (activeLeaf === this) activeLeaf = null;
  }

  // ---- HOLD 완료 후: 바스러짐 ----
  startCrumble() {
    this.state = "crumbling";
    this.stateTime = 0;
    for (let i = 0; i < FRAGMENTS; i++) {
      const lx = random(-this.len / 2, this.len / 2),
        ly = random(-this.wid / 3, this.wid / 3);
      const c = cos(this.rot),
        s = sin(this.rot);
      this.frags.push({
        x: this.x + lx * c - ly * s,
        y: this.y + lx * s + ly * c,
        vx: random(-1.5, 1.5),
        vy: random(-2, 0.5),
        r: random(TWO_PI),
        vr: random(-0.2, 0.2),
        sz: random(2.5, 7),
        life: random(900, 2000),
        age: 0,
      });
    }
  }
  updateCrumble(f, dt) {
    let alive = 0;
    for (const p of this.frags) {
      p.age += dt;
      p.vy += 0.12 * f;
      p.vx *= pow(0.99, f);
      p.x += p.vx * f;
      p.y += p.vy * f;
      p.r += p.vr * f;
      if (p.age < p.life) alive++;
    }
    if (alive === 0) this.finish(); // 파편이 전부 사라지면 최종 삭제
  }

  // ---------------- 렌더링 ----------------
  draw() {
    if (this.state === "deleted") return;
    if (this.state === "crumbling") {
      this.drawFrags();
      return;
    }

    // DRAG 궤적: 잎 밑동에서 뒤로 이어지는 가느다란 검은 곡선
    if (this.trail.length >= 2) this.drawTrail();

    push();
    translate(this.x, this.y);
    rotate(this.rot);
    // dying: 갈색 상태로 부르르 떨림
    if (this.state === "dying") translate(random(-1.5, 1.5), random(-1.5, 1.5));
    fill(this.currentColor());
    if (this.wind || this.state === "dragging") {
      stroke(20);
      strokeWeight(1);
    } else noStroke();
    this.leafShape();
    pop();
  }
  leafShape() {
    const L = this.len,
      W = this.wid;
    beginShape();
    vertex(-L / 2, 0);
    bezierVertex(-L / 4, -W * 0.75, L / 5, -W * 0.7, L / 2, -W * 0.05); // 윗면(볼록)
    bezierVertex(L / 5, W * 0.55, -L / 4, W * 0.6, -L / 2, 0); // 아랫면
    endShape(CLOSE);
  }
  drawTrail() {
    const t = this.trail;
    noFill();
    stroke(20);
    strokeWeight(1.1);
    beginShape();
    curveVertex(t[0].x, t[0].y);
    for (const p of t) curveVertex(p.x, p.y);
    curveVertex(t[t.length - 1].x, t[t.length - 1].y);
    endShape();
  }
  drawFrags() {
    noStroke();
    for (const p of this.frags) {
      if (p.age >= p.life) continue;
      const a = 255 * (1 - p.age / p.life);
      fill(BROWN[0], BROWN[1], BROWN[2], a);
      push();
      translate(p.x, p.y);
      rotate(p.r);
      triangle(-p.sz, p.sz * 0.6, p.sz, p.sz * 0.3, 0, -p.sz);
      pop();
    }
  }
}

// ============================================================
//  마우스 이벤트 (터치도 p5가 마우스 이벤트로 전달)
// ============================================================
function mousePressed() {
  // 위에 그려진 잎부터 검사
  for (let i = leaves.length - 1; i >= 0; i--) {
    const l = leaves[i];
    if (l.interactive && l.hit(mx(), my())) {
      activeLeaf = l;
      l.press(); // → PENDING
      return false;
    }
  }
}
function mouseReleased() {
  if (activeLeaf) {
    const l = activeLeaf;
    activeLeaf = null;
    l.release(); // CLICK / HOLD pause / DRAG 낙하 처리
  }
  return false;
}
