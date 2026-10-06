import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const TAU = Math.PI * 2;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const wrap = (v, size) => ((v % size) + size) % size;

// Three flat tones give the cartoon "cel" look.
const tones = new THREE.DataTexture(new Uint8Array([125, 190, 255]), 3, 1, THREE.RedFormat);
tones.minFilter = tones.magFilter = THREE.NearestFilter;
tones.needsUpdate = true;

const toon = (color, extra = {}) => new THREE.MeshToonMaterial({ color, gradientMap: tones, ...extra });
const inkMaterial = new THREE.MeshBasicMaterial({ color: 0x3a6178, side: THREE.BackSide });

function part(parent, geometry, material, { position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1], ink = 1.07 } = {}) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.scale.set(...scale);
  parent.add(mesh);
  if (ink) {
    const hull = new THREE.Mesh(geometry, inkMaterial);
    hull.position.copy(mesh.position);
    hull.rotation.copy(mesh.rotation);
    hull.scale.copy(mesh.scale).multiplyScalar(ink);
    parent.add(hull);
  }
  return mesh;
}

function lights(scene, sun = 0xfff1d6) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0xcfe3ff, 1.5));
  const key = new THREE.DirectionalLight(sun, 2.3);
  key.position.set(-3, 4, 5);
  scene.add(key);
}

function dotTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

// Chubby toy plane, nose towards +X, wings along Z.
function toyPlane() {
  const group = new THREE.Group();
  const cream = toon(0xfff3dc), coral = toon(0xff8f70), teal = toon(0x4fc3b8), glass = toon(0x9be7f4);
  part(group, new THREE.CapsuleGeometry(0.12, 0.44, 6, 16), cream, { rotation: [0, 0, Math.PI / 2] });
  part(group, new THREE.CapsuleGeometry(0.06, 0.78, 4, 12), coral, { position: [0.04, -0.03, 0], rotation: [Math.PI / 2, 0, 0], scale: [2.1, 1, 0.5] });
  part(group, new THREE.CapsuleGeometry(0.045, 0.28, 4, 10), coral, { position: [-0.36, 0.01, 0], rotation: [Math.PI / 2, 0, 0], scale: [1.9, 1, 0.5] });
  part(group, new THREE.CapsuleGeometry(0.04, 0.16, 4, 10), coral, { position: [-0.38, 0.14, 0], scale: [1.8, 1, 0.5] });
  part(group, new THREE.SphereGeometry(0.075, 16, 12), teal, { position: [0.36, 0, 0] });
  part(group, new THREE.SphereGeometry(0.1, 16, 12), glass, { position: [0.1, 0.1, 0], scale: [1.3, 0.8, 0.9] });

  const prop = new THREE.Group();
  prop.position.set(0.44, 0, 0);
  const bladeMaterial = new THREE.MeshBasicMaterial({ color: 0x3a6178 });
  prop.add(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.46, 0.06), bladeMaterial));
  prop.add(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.46), bladeMaterial));
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(0.24, 24),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
  );
  disc.rotation.y = Math.PI / 2;
  prop.add(disc);
  group.add(prop);
  return { group, prop };
}

function fluffyCloud(scale = 1, tint = 0xffffff) {
  const cloud = new THREE.Group();
  const material = toon(tint);
  [[0, 0, 0, 0.5], [0.55, -0.05, 0.05, 0.38], [-0.55, -0.06, 0, 0.36], [0.25, 0.28, 0, 0.34], [-0.2, 0.25, 0.05, 0.3], [0.9, -0.14, 0, 0.24], [-0.9, -0.14, 0, 0.22]]
    .forEach(([x, y, z, r]) => {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), material);
      puff.position.set(x, y, z);
      cloud.add(puff);
    });
  cloud.scale.setScalar(scale);
  return cloud;
}

// Basis: x = heading, y ~ up, z = right wing.
function orient(object, heading, up, bank = 0) {
  const x = heading.clone().normalize();
  const z = new THREE.Vector3().crossVectors(x, up).normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  object.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  object.rotateX(bank);
}

// ---------- scene engine ----------
const entries = [];

function mount(id, build, { fov = 32 } = {}) {
  const host = document.getElementById(id);
  if (!host) return;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch (error) {
    host.textContent = 'WebGL is unavailable in this browser';
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  host.replaceChildren(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 60);
  const entry = { renderer, scene, camera, visible: false, update: build({ scene, camera, renderer }) };
  new ResizeObserver(() => {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }).observe(host);
  new IntersectionObserver(([hit]) => { entry.visible = hit.isIntersecting; }).observe(host);
  entries.push(entry);
}

function frame(now) {
  const t = reduced ? 2.4 : now / 1000;
  for (const entry of entries) {
    if (!entry.visible) continue;
    entry.update(t);
    entry.renderer.render(entry.scene, entry.camera);
  }
  requestAnimationFrame(frame);
}

// ---------- 1. cartoon Earth ----------
const CONTINENTS = [
  [[-168, 70], [-145, 72], [-132, 60], [-124, 50], [-116, 48], [-110, 42], [-100, 49], [-92, 48], [-83, 44], [-78, 34], [-96, 25], [-105, 20], [-115, 29], [-120, 35], [-128, 49], [-145, 58]],
  [[-73, 10], [-58, 8], [-48, -2], [-42, -12], [-50, -23], [-54, -34], [-66, -55], [-73, -42], [-78, -20], [-81, -5]],
  [[-52, 82], [-25, 76], [-34, 60], [-46, 59], [-58, 68]],
  [[-11, 36], [-8, 50], [4, 58], [18, 70], [38, 68], [48, 56], [34, 45], [30, 37], [18, 35], [10, 42]],
  [[-17, 35], [5, 37], [31, 31], [42, 12], [50, -12], [37, -35], [18, -35], [8, -18], [-4, 4], [-15, 14]],
  [[35, 70], [60, 72], [90, 68], [112, 60], [136, 53], [153, 60], [175, 51], [160, 42], [139, 35], [124, 22], [110, 8], [98, 18], [83, 8], [71, 20], [57, 24], [48, 38], [37, 48]],
  [[66, 24], [79, 28], [91, 22], [88, 8], [78, 6], [72, 14]],
  [[112, -11], [131, -10], [153, -20], [145, -39], [123, -43], [114, -28]],
  [[47, -13], [51, -16], [50, -25], [46, -24]],
];

function earthTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const g = canvas.getContext('2d');
  const sea = g.createLinearGradient(0, 0, 0, 512);
  sea.addColorStop(0, '#8ad8f4');
  sea.addColorStop(0.5, '#55b8e8');
  sea.addColorStop(1, '#8ad8f4');
  g.fillStyle = sea;
  g.fillRect(0, 0, 1024, 512);
  g.lineJoin = 'round';
  const project = ([lon, lat]) => [(lon + 180) / 360 * 1024, (90 - lat) / 180 * 512];
  CONTINENTS.forEach(points => {
    g.beginPath();
    points.map(project).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.lineWidth = 9;
    g.strokeStyle = '#d4f2b0';
    g.stroke();
    g.fillStyle = '#8fdc92';
    g.fill();
  });
  const cap = (y0, y1) => {
    const grad = g.createLinearGradient(0, y0, 0, y1);
    grad.addColorStop(0, 'rgba(255,255,255,.95)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, Math.min(y0, y1), 1024, Math.abs(y1 - y0));
  };
  cap(0, 56);
  cap(512, 456);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function buildEarth({ scene, camera }) {
  camera.position.set(0, 0.7, 5.4);
  camera.lookAt(0, 0, 0);
  lights(scene);

  const tilt = new THREE.Group();
  tilt.rotation.z = -0.28;
  scene.add(tilt);
  const spin = new THREE.Group();
  tilt.add(spin);
  spin.add(new THREE.Mesh(new THREE.SphereGeometry(0.82, 64, 48), toon(0xffffff, { map: earthTexture() })));
  tilt.add(new THREE.Mesh(new THREE.SphereGeometry(0.9, 48, 32), new THREE.MeshBasicMaterial({ color: 0x9fe3ff, transparent: true, opacity: 0.22, side: THREE.BackSide })));

  const clouds = new THREE.Group();
  tilt.add(clouds);
  [[0.4, 0], [0.2, 1.2], [-0.3, 2.1], [0.55, 3.0], [-0.5, 4.1], [0.1, 5.0], [0.65, 5.8]].forEach(([lat, lon]) => {
    const cloud = fluffyCloud(0.2);
    cloud.position.set(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)).multiplyScalar(0.9);
    cloud.lookAt(0, 0, 0);
    cloud.scale.z = 0.12;
    clouds.add(cloud);
  });

  const A = 1.6, B = 1.25;
  const orbit = new THREE.Group();
  orbit.rotation.set(0.42, 0, -0.25);
  scene.add(orbit);
  const ringPoints = [];
  for (let i = 0; i <= 160; i++) ringPoints.push(new THREE.Vector3(A * Math.sin(i / 160 * TAU), 0, B * Math.cos(i / 160 * TAU)));
  const ring = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(ringPoints),
    new THREE.LineDashedMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, dashSize: 0.06, gapSize: 0.05 }),
  );
  ring.computeLineDistances();
  orbit.add(ring);

  const { group: plane, prop } = toyPlane();
  plane.scale.setScalar(0.85);
  scene.add(plane);

  const COUNT = 22;
  const trail = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }), COUNT);
  scene.add(trail);
  const matrix = new THREE.Matrix4();
  const point = new THREE.Vector3();
  const heading = new THREE.Vector3();
  const up = new THREE.Vector3();

  return t => {
    spin.rotation.y = t * 0.14;
    clouds.rotation.y = t * 0.2;
    orbit.updateMatrixWorld(true);
    const phi = t * 0.55;
    point.set(A * Math.sin(phi), 0, B * Math.cos(phi));
    plane.position.copy(orbit.localToWorld(point.clone()));
    heading.set(A * Math.cos(phi), 0, -B * Math.sin(phi)).transformDirection(orbit.matrixWorld);
    up.set(0, 1, 0).transformDirection(orbit.matrixWorld);
    orient(plane, heading, up, -0.4 + Math.sin(t * 2) * 0.05);
    prop.rotation.x = t * 40;
    for (let i = 0; i < COUNT; i++) {
      const a = phi - 0.2 - i * 0.045;
      point.set(A * Math.sin(a), 0, B * Math.cos(a));
      orbit.localToWorld(point);
      const s = 1 - i / COUNT;
      matrix.makeScale(s, s, s).setPosition(point);
      trail.setMatrixAt(i, matrix);
    }
    trail.instanceMatrix.needsUpdate = true;
  };
}

// ---------- 2. cloud hop ----------
function buildCloudHop({ scene, camera }) {
  camera.position.set(0, 1.7, 7);
  camera.lookAt(0, 0, 0);
  lights(scene);

  const sun = new THREE.Mesh(new THREE.SphereGeometry(0.7, 32, 24), new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
  sun.position.set(2.2, 1.3, -3);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(1.05, 32, 24), new THREE.MeshBasicMaterial({ color: 0xfff3c9, transparent: true, opacity: 0.35 }));
  halo.position.copy(sun.position);
  scene.add(sun, halo);

  const field = [
    { x: -4, y: 1.2, z: -1, s: 0.9, v: 0.45 }, { x: 0, y: -1.3, z: -0.5, s: 1.2, v: 0.6 }, { x: 3.2, y: 0.3, z: -2, s: 0.8, v: 0.3 },
    { x: -2.4, y: -0.4, z: 1.6, s: 0.7, v: 0.9 }, { x: 2.2, y: -1.6, z: 1.3, s: 0.6, v: 1.0 }, { x: 4.5, y: 1.4, z: 0.5, s: 0.55, v: 0.7 },
  ].map(cfg => {
    const mesh = fluffyCloud(1);
    scene.add(mesh);
    return { ...cfg, mesh };
  });

  const streaks = [];
  const streakGeometry = new THREE.CapsuleGeometry(0.012, 0.5, 2, 6);
  const streakMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.65 });
  [[-0.9, 0.7, 0.2], [0.8, -0.2, 0.6], [-0.4, 1.0, 1.0], [1.0, -0.9, 1.4], [-0.7, -0.6, 1.9], [0.3, 0.5, 2.3]].forEach(([y, z, offset]) => {
    const streak = new THREE.Mesh(streakGeometry, streakMaterial);
    streak.rotation.z = Math.PI / 2;
    scene.add(streak);
    streaks.push({ streak, y: y * 1.2, z, offset });
  });

  const yaw = new THREE.Group();
  yaw.rotation.y = 0.35;
  scene.add(yaw);
  const pose = new THREE.Group();
  yaw.add(pose);
  const { group: plane, prop } = toyPlane();
  plane.scale.setScalar(1.9);
  pose.add(plane);

  return t => {
    field.forEach(c => {
      const x = wrap(c.x - t * c.v + 6, 12) - 6;
      c.mesh.position.set(x, c.y + Math.sin(t * 0.6 + c.x) * 0.06, c.z);
      c.mesh.scale.setScalar(c.s * (1 - smooth(4.2, 5.6, Math.abs(x))));
    });
    streaks.forEach(s => {
      const x = wrap(-t * 3.2 + s.offset * 2.4, 9) - 4.5;
      s.streak.position.set(x, s.y, s.z);
      s.streak.scale.setScalar(1 - smooth(3, 4.4, Math.abs(x)) + 0.001);
    });
    pose.position.y = Math.sin(t * 1.5) * 0.14;
    pose.rotation.set(Math.sin(t * 1.1) * 0.1, 0, Math.cos(t * 1.5) * 0.06);
    prop.rotation.x = t * 45;
  };
}

// ---------- 3. floating island ----------
function buildIsland({ scene, camera }) {
  camera.position.set(0, 1.2, 6.4);
  camera.lookAt(0, 0.1, 0);
  lights(scene);

  const island = new THREE.Group();
  scene.add(island);
  part(island, new THREE.ConeGeometry(0.95, 1.4, 8), toon(0xc49a80), { position: [0, -0.85, 0], rotation: [Math.PI, 0, 0] });
  part(island, new THREE.CylinderGeometry(1.05, 0.95, 0.28, 8), toon(0x93dd95), { ink: 1.04 });
  const pond = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 20), toon(0x7fd3f2));
  pond.position.set(0.15, 0.15, 0.48);
  island.add(pond);

  const trunk = new THREE.CylinderGeometry(0.05, 0.07, 0.3, 8);
  [[0.5, 0.1, 0x5cc08a], [-0.55, -0.15, 0xffb3c7]].forEach(([x, z, leaf]) => {
    part(island, trunk, toon(0xb98d6a), { position: [x, 0.28, z], ink: 1.12 });
    part(island, new THREE.SphereGeometry(0.26, 16, 12), toon(leaf), { position: [x, 0.62, z] });
    part(island, new THREE.SphereGeometry(0.17, 16, 12), toon(leaf), { position: [x, 0.88, z] });
  });
  part(island, new THREE.BoxGeometry(0.36, 0.28, 0.32), toon(0xfff3dc), { position: [-0.05, 0.28, -0.4] });
  part(island, new THREE.ConeGeometry(0.31, 0.22, 4), toon(0xff8f70), { position: [-0.05, 0.52, -0.4], rotation: [0, Math.PI / 4, 0] });

  const drifters = [0, 1, 2].map(i => {
    const cloud = fluffyCloud(0.45 - i * 0.06);
    scene.add(cloud);
    return { cloud, radius: 2.5 + i * 0.25, height: 0.9 - i * 0.9, offset: i * 2.1 };
  });

  const COUNT = 36;
  const positions = new Float32Array(COUNT * 3);
  const seeds = Array.from({ length: COUNT }, (_, i) => ({ a: i * 2.399, r: 0.8 + (i % 7) * 0.28, y: (i * 0.37) % 3, v: 0.12 + (i % 5) * 0.03 }));
  const sparkGeometry = new THREE.BufferGeometry();
  sparkGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  scene.add(new THREE.Points(sparkGeometry, new THREE.PointsMaterial({ size: 0.16, map: dotTexture(), transparent: true, opacity: 0.9, depthWrite: false, color: 0xfff6c8 })));

  return t => {
    island.position.y = Math.sin(t * 0.9) * 0.12;
    island.rotation.y = t * 0.25;
    drifters.forEach(d => {
      const a = t * 0.18 + d.offset;
      d.cloud.position.set(Math.cos(a) * d.radius, d.height + Math.sin(t * 0.5 + d.offset) * 0.08, Math.sin(a) * d.radius);
    });
    seeds.forEach((s, i) => {
      positions[i * 3] = Math.cos(s.a + t * 0.2) * s.r;
      positions[i * 3 + 1] = -1.2 + wrap(s.y + t * s.v, 3.2);
      positions[i * 3 + 2] = Math.sin(s.a + t * 0.2) * s.r;
    });
    sparkGeometry.attributes.position.needsUpdate = true;
  };
}

// ---------- 4. hot-air balloons ----------
function stripes(colors) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 4;
  const g = canvas.getContext('2d');
  const n = 8;
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[i % colors.length];
    g.fillRect(i * (256 / n), 0, 256 / n + 1, 4);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function balloon(colors, scale) {
  const group = new THREE.Group();
  part(group, new THREE.SphereGeometry(0.55, 32, 24), toon(0xffffff, { map: stripes(colors) }), { position: [0, 0.35, 0], scale: [1, 1.2, 1] });
  part(group, new THREE.CylinderGeometry(0.13, 0.17, 0.12, 12), toon(0xf4d58d), { position: [0, -0.36, 0], ink: 1.1 });
  part(group, new THREE.BoxGeometry(0.24, 0.17, 0.24), toon(0xc99a6b), { position: [0, -0.68, 0], ink: 1.1 });
  const ropes = [];
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => ropes.push(sx * 0.1, -0.6, sz * 0.1, sx * 0.1, -0.42, sz * 0.1));
  group.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(ropes, 3)), new THREE.LineBasicMaterial({ color: 0x7a5c4a })));
  group.scale.setScalar(scale);
  return group;
}

function buildBalloons({ scene, camera }) {
  camera.position.set(0, 0, 7.2);
  lights(scene);
  const fleet = [
    { colors: ['#ff8f70', '#fff3dc'], x: -1.8, y: 0.1, z: -0.4, s: 1.0, p: 0 },
    { colors: ['#5fc9c0', '#fff3dc', '#ffd36e'], x: 0.2, y: 0.55, z: 0.3, s: 1.15, p: 1.7 },
    { colors: ['#b79cf2', '#ffd1e0'], x: 2.0, y: -0.15, z: -1.3, s: 0.85, p: 3.1 },
  ].map(cfg => {
    const mesh = balloon(cfg.colors, cfg.s);
    scene.add(mesh);
    return { ...cfg, mesh };
  });
  const sea = [-4, -1.5, 1.2, 3.7].map((x, i) => {
    const cloud = fluffyCloud(1.1 + (i % 2) * 0.25);
    scene.add(cloud);
    return { cloud, x, y: -1.95 + (i % 2) * 0.25, z: -0.6 + i * 0.35, v: 0.12 + i * 0.03 };
  });

  return t => {
    fleet.forEach(b => {
      b.mesh.position.set(b.x + Math.sin(t * 0.4 + b.p) * 0.14, b.y + Math.sin(t * 0.9 + b.p) * 0.18, b.z);
      b.mesh.rotation.z = Math.sin(t * 0.8 + b.p) * 0.05;
      b.mesh.rotation.y = t * 0.15 + b.p;
    });
    sea.forEach(c => {
      const x = wrap(c.x - t * c.v + 6, 12) - 6;
      c.cloud.position.set(x, c.y, c.z);
      c.cloud.scale.setScalar((1.1 + (c.z > 0 ? 0.1 : 0)) * (1 - smooth(4.4, 5.8, Math.abs(x))) + 0.001);
    });
  };
}

// ---------- 5. paper plane doodle ----------
function paperPlane() {
  const group = new THREE.Group();
  const N = [0.5, 0, 0], S = [-0.4, -0.06, 0], L = [-0.4, 0.12, 0.34], R = [-0.4, 0.12, -0.34], K = [-0.3, -0.2, 0];
  const faces = [[[...N, ...S, ...L], 0xffffff], [[...N, ...R, ...S], 0xdcd4ff], [[...N, ...S, ...K], 0xffb8d0]];
  faces.forEach(([vertices, color]) => {
    const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    group.add(new THREE.Mesh(geometry, toon(color, { side: THREE.DoubleSide })));
    group.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: 0x4a5d96 })));
  });
  return group;
}

function buildPaper({ scene, camera }) {
  camera.position.set(0, 2.6, 6.2);
  camera.lookAt(0, 0, 0);
  lights(scene);
  const path = (phi, out) => out.set(2.0 * Math.sin(phi), 0.5 * Math.sin(2 * phi), 0.9 * Math.cos(phi));

  const plane = paperPlane();
  plane.scale.setScalar(1.5);
  scene.add(plane);

  const COUNT = 36;
  const trail = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), COUNT);
  trail.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(COUNT * 3), 3);
  scene.add(trail);
  const matrix = new THREE.Matrix4(), color = new THREE.Color();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);

  return t => {
    const phi = t * 0.7;
    path(phi, a);
    path(phi + 0.02, b);
    plane.position.copy(a);
    orient(plane, b.sub(a), up, -0.6 * Math.sin(phi));
    for (let i = 0; i < COUNT; i++) {
      path(phi - 0.12 - i * 0.04, a);
      const s = (1 - i / COUNT) * 1.1;
      matrix.makeScale(s, s, s).setPosition(a);
      trail.setMatrixAt(i, matrix);
      trail.setColorAt(i, color.setHSL(wrap(0.55 + i * 0.012 + t * 0.05, 1), 0.75, 0.74));
    }
    trail.instanceMatrix.needsUpdate = true;
    trail.instanceColor.needsUpdate = true;
  };
}

mount('gl-earth', buildEarth);
mount('gl-clouds', buildCloudHop);
mount('gl-island', buildIsland);
mount('gl-balloons', buildBalloons);
mount('gl-paper', buildPaper);
requestAnimationFrame(frame);

const caption = document.getElementById('gl-earth-caption');
if (caption && !reduced) {
  const lines = ['Planning a smooth route', 'Checking the skies ahead', 'Packing a little sunshine', 'Almost cleared for takeoff'];
  let index = 0;
  setInterval(() => {
    caption.classList.add('swap');
    setTimeout(() => { index = (index + 1) % lines.length; caption.textContent = lines[index]; caption.classList.remove('swap'); }, 300);
  }, 3400);
}
