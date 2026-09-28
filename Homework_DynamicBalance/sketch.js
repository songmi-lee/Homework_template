// ===== Dynamic Balance =====
// p5.js + Matter.js / 자동 실행: 정렬 → 낙하 → 충돌 → 안정

const Engine = Matter.Engine;
const Bodies = Matter.Bodies;
const Composite = Matter.Composite;
const Body = Matter.Body;
const Events = Matter.Events;

// ---------- ① 전체 설정 (여기서 조절) ----------
const CANVAS_SIZE = 800;
const SLOPE_DEG = 6; // ④ 바닥 기울기 (5~8 추천, 오른쪽이 낮아짐)
const GRAVITY = 1.1; // 중력 세기
const START_DELAY = 90; // Phase 1 정지 시간 (프레임, 60 = 1초)
const STAGGER = 5; // 도형이 하나씩 풀려나는 간격 (프레임)
const BAR_THICKNESS = 14; // 막대 두께
const FLASH_SPEED = 4; // 이 속도 이상 충돌하면 살짝 밝아짐
const FLASH_FRAMES = 8;
const Sleeping = Matter.Sleeping;

// ---------- ③ 색상 (3~4색 + 배경/바닥) ----------
const COLORS = {
  bg: "#f2efe9",
  circle: "#e63b2e",
  square: "#2a49b8",
  triangle: "#f4b62a",
  bar: "#1b1b1b",
  ground: "#7a746a",
};

// ---------- ① 도형별 물리값 (여기서 조절) ----------
const PHYS = {
  // friction 낮음 + 탄성 큼 → 잘 굴러가고 튕김
  circle: {
    friction: 0.3,
    frictionStatic: 0.0,
    frictionAir: 0.005,
    restitution: 0.55,
    density: 0.0012,
  },
  // 무겁고 안정적으로 쌓임
  square: {
    friction: 0.07,
    frictionStatic: 0.0,
    frictionAir: 0.012,
    restitution: 0.25,
    density: 0.0025,
  },
  // 꼭짓점 때문에 넘어지고 회전
  triangle: {
    friction: 0.05,
    frictionStatic: 0.0,
    frictionAir: 0.01,
    restitution: 0.2,
    density: 0.0016,
  },
  // 길어서 회전하며 다른 도형을 밀어냄
  bar: {
    friction: 0.15,
    frictionStatic: 0.0,
    frictionAir: 0.004,
    restitution: 0.9,
    density: 0.0018,
  },
};

// ---------- ② 초기 배치 (도형 종류/개수/크기 조절) ----------
// [종류, x, y, 크기, 초기각도(rad), 낙하 시작 시 회전속도]
// 크기: circle=반지름 / square=한 변 / triangle=한 변 / bar=길이
const LAYOUT = [
  // 1열 (y=90)
  ["circle", 100, 90, 30, 0, 0.02],
  ["square", 230, 90, 56, 0, 0.03],
  ["triangle", 360, 90, 64, 0, 0.04],
  ["circle", 490, 90, 18, 0, -0.03],
  ["square", 620, 90, 36, 0, -0.03],
  ["triangle", 730, 90, 40, 0, 0.05],
  // 2열 (y=200) 막대 위주
  ["bar", 170, 200, 150, -0.08, 0.03],
  ["circle", 300, 200, 24, 0, 0.0],
  ["bar", 420, 200, 110, 0.05, -0.04],
  ["square", 520, 200, 44, 0, 0.02],
  ["bar", 650, 200, 150, -0.05, 0.03],
  // 3열 (y=310)
  ["circle", 130, 310, 38, 0, 0.0],
  ["triangle", 260, 310, 56, 0, -0.04],
  ["circle", 330, 310, 14, 0, 0.0],
  ["square", 400, 310, 66, 0, 0.0],
  ["circle", 480, 310, 16, 0, 0.0],
  ["triangle", 550, 310, 84, 0, 0.03],
  ["circle", 690, 310, 22, 0, 0.0],
];

let engine;
let bodies = []; // 움직이는 도형들
let ground, lip; // 기울어진 바닥, 오른쪽 낮은 턱
let frame = 0;

function preload() {
  // 외부 파일 없음 (Matter.js는 index.html에서 로드)
}

function setup() {
  createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  noStroke();
  initWorld();
}

function draw() {
  background(COLORS.bg);
  frame++;

  releaseShapes(); // Phase 1 → 2: 정지해 있던 도형을 차례로 풀어줌
  Engine.update(engine, 1000 / 60);
  keepInside(); // 화면 밖으로 나간 도형 안전장치

  drawStatic(ground, COLORS.ground);
  drawStatic(lip, COLORS.ground);
  for (const b of bodies) drawShape(b);
  if (frame === 60 * 15) engine.enableSleeping = true; // 15초 뒤 sleeping을 켜서 최종 떨림 방지
}

// ===== 월드 생성 =====
function initWorld() {
  engine = Engine.create({
    enableSleeping: false, // 처음엔 sleeping을 꺼서 느린 도형이 중간에 멈추지 않게 함
    positionIterations: 8,
    velocityIterations: 6,
  });
  engine.gravity.y = GRAVITY;
  bodies = [];
  frame = 0;

  buildBoundaries();
  buildComposition();
  Events.on(engine, "collisionStart", onCollisionStart);
}

// 바닥 + 턱 + 보이지 않는 벽
function buildBoundaries() {
  const a = radians(SLOPE_DEG);
  const gx = 400,
    gy = 700; // 바닥 중심

  ground = Bodies.rectangle(gx, gy, 900, 30, {
    isStatic: true,
    angle: a,
    friction: 0.9,
    frictionStatic: 0,
    restitution: 0.1,
  });

  // 기울어진 바닥의 오른쪽 끝에 붙는 낮은 턱 (바닥 좌표계 기준 위치를 회전 변환)
  const lx = 385,
    ly = -35;
  lip = Bodies.rectangle(
    gx + lx * cos(a) - ly * sin(a),
    gy + lx * sin(a) + ly * cos(a),
    30,
    40,
    { isStatic: true, angle: a, friction: 0.9 },
  );

  // 좌우 벽 + 아래 안전 바닥 (도형이 화면 밖으로 사라지지 않게)
  const wallL = Bodies.rectangle(-30, 400, 60, 3000, { isStatic: true });
  const wallR = Bodies.rectangle(CANVAS_SIZE + 30, 400, 60, 3000, {
    isStatic: true,
  });
  const floor = Bodies.rectangle(400, 900, 2000, 60, { isStatic: true });

  Composite.add(engine.world, [ground, lip, wallL, wallR, floor]);
}

// 초기 composition 만들기
function buildComposition() {
  for (const [type, x, y, size, ang, spin] of LAYOUT) {
    let b;
    if (type === "circle") b = createCircle(x, y, size);
    else if (type === "square") b = createSquare(x, y, size);
    else if (type === "triangle") b = createTriangle(x, y, size);
    else b = createBar(x, y, size);

    Body.setAngle(b, ang + b.angle);
    b.spin = spin;
    Body.setStatic(b, true); // Phase 1: 정돈된 상태로 정지
    bodies.push(b);
  }

  // 아래쪽 도형부터 먼저 떨어지도록 낙하 시점 지정
  const order = [...bodies].sort(
    (p, q) => q.position.y - p.position.y || p.position.x - q.position.x,
  );
  order.forEach((b, i) => (b.releaseAt = START_DELAY + i * STAGGER));

  Composite.add(engine.world, bodies);
}

// ===== 도형 생성 함수 =====
function createCircle(x, y, r) {
  const b = Bodies.circle(x, y, r, { ...PHYS.circle, sleepThreshold: 60 });
  b.label = "circle";
  b.col = COLORS.circle;
  return b;
}

function createSquare(x, y, s) {
  const b = Bodies.rectangle(x, y, s, s, {
    ...PHYS.square,
    sleepThreshold: 60,
  });
  b.label = "square";
  b.col = COLORS.square;
  return b;
}

function createTriangle(x, y, s) {
  // polygon의 반지름 = 한 변 / √3, 꼭짓점이 위로 향하도록 회전
  const b = Bodies.polygon(x, y, 3, s / sqrt(3), {
    ...PHYS.triangle,
    sleepThreshold: 60,
  });
  Body.rotate(b, -HALF_PI);
  b.label = "triangle";
  b.col = COLORS.triangle;
  return b;
}

function createBar(x, y, len) {
  const b = Bodies.rectangle(x, y, len, BAR_THICKNESS, {
    ...PHYS.bar,
    sleepThreshold: 60,
  });
  b.label = "bar";
  b.col = COLORS.bar;
  return b;
}

// ===== 낙하 시작 / 충돌 / 안전장치 =====
function releaseShapes() {
  for (const b of bodies) {
    if (b.isStatic && frame >= b.releaseAt) {
      Body.setStatic(b, false);
      Sleeping.set(b, false); // static 동안 잠든 상태를 깨움 (핵심 수정)
      Body.setAngularVelocity(b, b.spin); // 살짝 회전을 주어 움직임 차이를 만듦
    }
  }
}

function onCollisionStart(e) {
  for (const pair of e.pairs) {
    const a = pair.bodyA,
      b = pair.bodyB;
    if (a.speed + b.speed > FLASH_SPEED) {
      if (!a.isStatic) a.flash = FLASH_FRAMES; // 강한 충돌 시 잠깐 밝아짐
      if (!b.isStatic) b.flash = FLASH_FRAMES;
    }
  }
}

function keepInside() {
  for (const b of bodies) {
    const p = b.position;
    if (p.y > height + 100 || p.x < -50 || p.x > width + 50) {
      Body.setPosition(b, { x: width / 2, y: -40 });
      Body.setVelocity(b, { x: 0, y: 0 });
    }
  }
}

// ===== 그리기 =====
function drawShape(b) {
  let c = color(b.col);
  if (b.flash > 0) {
    c = lerpColor(c, color(255), 0.35 * (b.flash / FLASH_FRAMES));
    b.flash--;
  }
  fill(c);

  if (b.label === "circle") {
    const r = b.circleRadius;
    push();
    translate(b.position.x, b.position.y);
    rotate(b.angle);
    circle(0, 0, r * 2);
    fill(COLORS.bg); // 굴러가는 것이 보이도록 작은 점 표시
    circle(r * 0.55, 0, r * 0.35);
    pop();
  } else {
    beginShape();
    for (const v of b.vertices) vertex(v.x, v.y);
    endShape(CLOSE);
  }
}

function drawStatic(b, col) {
  fill(col);
  beginShape();
  for (const v of b.vertices) vertex(v.x, v.y);
  endShape(CLOSE);
}

// 다시 시작 (디버깅용, 필요 없으면 삭제해도 됨)
function restart() {
  initWorld();
}
function keyPressed() {
  if (key === "r" || key === "R") restart();
}
