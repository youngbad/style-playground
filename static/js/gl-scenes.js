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
  const entry = { visible: false, ready: false, t0: undefined };

  const start = () => {
    entry.ready = true;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (error) {
      host.textContent = 'WebGL is unavailable in this browser';
      entry.visible = false;
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    host.replaceChildren(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 60);
    Object.assign(entry, { renderer, scene, camera, update: build({ scene, camera, renderer }) });
    const resize = () => {
      const w = host.clientWidth, h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    new ResizeObserver(resize).observe(host);
    resize();
  };

  new IntersectionObserver(([hit]) => {
    entry.visible = hit.isIntersecting;
    if (!entry.visible) entry.t0 = undefined;
    else if (!entry.ready) start();
  }).observe(host);
  entries.push(entry);
}

function frame(now) {
  const t = reduced ? 2.4 : now / 1000;
  for (const entry of entries) {
    if (!entry.visible || !entry.update) continue;
    entry.t0 ??= t;
    entry.update(t, reduced ? 10 : t - entry.t0);
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

// ---------- business scenes: calm PBR look, app palette ----------
const PALETTE = { navy: 0x1f4e79, blue: 0x2f7fc1, sky: 0x4f9bd1, teal: 0x1f8a8a, amber: 0xe0a030 };

function businessLights(scene) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9c6d3, 1.7));
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(-2, 4, 5);
  scene.add(key);
  return key;
}

function hardDot() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(16, 16, 14, 0, TAU);
  g.fill();
  return new THREE.CanvasTexture(canvas);
}

function landMask() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#000';
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = '#fff';
  CONTINENTS.forEach(points => {
    g.beginPath();
    points.forEach(([lon, lat], i) => {
      const x = (lon + 180) / 360 * 512, y = (90 - lat) / 180 * 256;
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    });
    g.closePath();
    g.fill();
  });
  return g.getImageData(0, 0, 512, 256).data;
}

const geo = (lat, lon, r = 1) => {
  const phi = lat * Math.PI / 180, lam = lon * Math.PI / 180;
  return new THREE.Vector3(Math.cos(phi) * Math.sin(lam), Math.sin(phi), Math.cos(phi) * Math.cos(lam)).multiplyScalar(r);
};

function greatCircle(a, b, lift) {
  const angle = a.angleTo(b), points = [];
  for (let i = 0; i <= 48; i++) {
    const s = i / 48;
    const v = a.clone().multiplyScalar(Math.sin((1 - s) * angle)).add(b.clone().multiplyScalar(Math.sin(s * angle))).divideScalar(Math.sin(angle));
    points.push(v.multiplyScalar(1 + lift * Math.sin(Math.PI * s) * angle));
  }
  return new THREE.CatmullRomCurve3(points);
}

const FALLBACK_AIRPORTS = [
  { icao: 'KSFO', lat: 37.62, lon: -122.38 }, { icao: 'KDEN', lat: 39.86, lon: -104.67 }, { icao: 'KLAX', lat: 33.94, lon: -118.41 },
  { icao: 'KBOS', lat: 42.36, lon: -71.01 }, { icao: 'KSEA', lat: 47.45, lon: -122.31 }, { icao: 'KAUS', lat: 30.19, lon: -97.67 },
  { icao: 'KTEB', lat: 40.85, lon: -74.06 }, { icao: 'KLAS', lat: 36.08, lon: -115.15 }, { icao: 'KPHX', lat: 33.43, lon: -112.01 },
];
const ROUTES = [['KSFO', 'KDEN'], ['KLAX', 'KBOS'], ['KSEA', 'KAUS'], ['KSFO', 'KTEB'], ['KLAS', 'KPHX'], ['KDEN', 'KTEB']];

// Pale sphere with land dots; userData.glow is a separate atmosphere mesh that must not spin with it.
function dottedGlobe(radius = 1) {
  const globe = new THREE.Group();
  globe.add(new THREE.Mesh(new THREE.SphereGeometry(radius * 0.985, 64, 48), new THREE.MeshStandardMaterial({ color: 0xe9f0f6, roughness: 0.9 })));
  const mask = landMask(), positions = [], N = 7000, golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - 2 * (i + 0.5) / N, lat = Math.asin(y) * 180 / Math.PI;
    const lon = ((i * golden * 180 / Math.PI + 180) % 360) - 180;
    const px = Math.floor((lon + 180) / 360 * 512), py = Math.min(255, Math.floor((90 - lat) / 180 * 256));
    if (mask[(py * 512 + px) * 4] > 128) positions.push(...geo(lat, lon, radius * 1.002).toArray());
  }
  const dotGeometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  globe.add(new THREE.Points(dotGeometry, new THREE.PointsMaterial({ size: 0.06, map: hardDot(), alphaTest: 0.5, transparent: true, color: 0x4f7396 })));
  globe.userData.glow = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.07, 48, 32), new THREE.MeshBasicMaterial({ color: 0x8fc0e0, transparent: true, opacity: 0.14, side: THREE.BackSide }));
  return globe;
}

// 6. route network: dotted globe + live airport data
function buildNetwork({ scene, camera }) {
  camera.position.set(0, 0.3, 4.2);
  camera.lookAt(0, 0, 0);
  businessLights(scene);

  const tilt = new THREE.Group();
  tilt.rotation.set(0.62, 0, 0.08);
  scene.add(tilt);
  const globe = dottedGlobe();
  tilt.add(globe);
  tilt.add(globe.userData.glow);

  const live = [];
  const addRoutes = airports => {
    const byCode = Object.fromEntries(airports.map(a => [a.icao, a]));
    const used = new Set();
    ROUTES.forEach(([from, to], i) => {
      if (!byCode[from] || !byCode[to]) return;
      const a = geo(byCode[from].lat, byCode[from].lon), b = geo(byCode[to].lat, byCode[to].lon);
      const curve = greatCircle(a, b, 0.22);
      globe.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.0045, 6, false), new THREE.MeshBasicMaterial({ color: PALETTE.teal, transparent: true, opacity: 0.6 })));
      const pulse = new THREE.Mesh(new THREE.SphereGeometry(0.024, 14, 10), new THREE.MeshBasicMaterial({ color: PALETTE.amber }));
      globe.add(pulse);
      live.push({ curve, pulse, offset: i * 0.27 });
      [from, to].forEach(code => {
        if (used.has(code)) return;
        used.add(code);
        const marker = new THREE.Mesh(new THREE.SphereGeometry(0.022, 14, 10), new THREE.MeshBasicMaterial({ color: PALETTE.navy }));
        marker.position.copy(geo(byCode[code].lat, byCode[code].lon, 1.01));
        globe.add(marker);
      });
    });
  };
  fetch('/api/catalog').then(r => r.json()).then(data => addRoutes(data.airports)).catch(() => addRoutes(FALLBACK_AIRPORTS));

  return t => {
    cameraDrift(camera, [0, 0.3, 4.2], [0, 0, 0], t, 0.12);
    globe.rotation.y = 1.75 + Math.sin(t * 0.18) * 0.45;
    live.forEach(route => {
      const f = wrap(t * 0.14 + route.offset, 1.5);
      route.pulse.visible = f < 1;
      if (f < 1) {
        route.pulse.position.copy(route.curve.getPoint(f));
        route.pulse.scale.setScalar(0.5 + Math.sin(Math.PI * f) * 0.6);
      }
    });
  };
}

// 7. coverage shield: glossy PBR object with orbiting markers
function shieldShape() {
  const s = new THREE.Shape();
  s.moveTo(0, 1.2);
  s.bezierCurveTo(0.25, 1.05, 0.65, 0.98, 0.95, 0.98);
  s.lineTo(0.95, 0.15);
  s.bezierCurveTo(0.95, -0.55, 0.5, -0.95, 0, -1.25);
  s.bezierCurveTo(-0.5, -0.95, -0.95, -0.55, -0.95, 0.15);
  s.lineTo(-0.95, 0.98);
  s.bezierCurveTo(-0.65, 0.98, -0.25, 1.05, 0, 1.2);
  return s;
}

function capsuleBetween(a, b, radius, material) {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 6, 14), material);
  mesh.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0);
  mesh.rotation.z = Math.atan2(b[1] - a[1], b[0] - a[0]) - Math.PI / 2;
  return mesh;
}

function buildShield({ scene, camera }) {
  camera.position.set(0, 0.5, 6.2);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9c6d3, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  scene.add(key);

  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 128;
  const sg = shadowCanvas.getContext('2d');
  const grad = sg.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(20,45,70,.28)');
  grad.addColorStop(1, 'rgba(20,45,70,0)');
  sg.fillStyle = grad;
  sg.fillRect(0, 0, 128, 128);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -1.5;
  scene.add(shadow);

  const emblem = new THREE.Group();
  scene.add(emblem);
  const geometry = new THREE.ExtrudeGeometry(shieldShape(), { depth: 0.2, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 8, curveSegments: 40 });
  geometry.center();
  const gloss = color => new THREE.MeshPhysicalMaterial({ color, roughness: 0.38, metalness: 0.08, clearcoat: 1, clearcoatRoughness: 0.18 });
  emblem.add(new THREE.Mesh(geometry, gloss(PALETTE.navy)));
  const inner = new THREE.Mesh(geometry, gloss(PALETTE.blue));
  inner.scale.set(0.78, 0.78, 1);
  inner.position.z = 0.05;
  emblem.add(inner);
  const mark = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45 });
  [[[-0.34, -0.02], [-0.08, -0.3]], [[-0.08, -0.3], [0.4, 0.28]]].forEach(([a, b]) => {
    const stroke = capsuleBetween(a, b, 0.075, mark);
    stroke.position.z = 0.27;
    emblem.add(stroke);
  });

  const orbit = new THREE.Group();
  orbit.rotation.set(1.15, 0, 0.25);
  scene.add(orbit);
  orbit.add(new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.006, 8, 180), new THREE.MeshBasicMaterial({ color: 0x9fb4c7 })));
  const markers = [PALETTE.teal, PALETTE.amber, PALETTE.sky].map(color => {
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 20, 14), new THREE.MeshStandardMaterial({ color, roughness: 0.4 }));
    orbit.add(dot);
    return dot;
  });

  return t => {
    cameraDrift(camera, [0, 0.5, 6.2], [0, 0, 0], t, 0.15);
    emblem.rotation.set(Math.sin(t * 0.4) * 0.08, Math.sin(t * 0.5) * 0.5, 0);
    emblem.position.y = Math.sin(t * 0.9) * 0.05;
    key.position.set(Math.sin(t * 0.6) * 4, 3, 5);
    markers.forEach((dot, i) => {
      const a = t * 0.5 + i * (TAU / 3);
      dot.position.set(Math.cos(a) * 1.75, Math.sin(a) * 1.75, 0);
    });
    shadow.scale.setScalar(1 + Math.sin(t * 0.9) * 0.03);
  };
}

// 8. premium breakdown: stacked columns that morph between two quotes
function buildPremium({ scene, camera }) {
  camera.position.set(4.3, 3.8, 5.6);
  camera.lookAt(0, 0.85, 0);
  businessLights(scene);

  const grid = new THREE.GridHelper(4.6, 11, 0xc3cfdb, 0xdae2ea);
  scene.add(grid);

  const colors = [PALETTE.navy, PALETTE.sky, PALETTE.amber];
  const quotes = [
    [[1.6, 0.9, 0.3], [2.1, 1.2, 0.4], [1.1, 0.6, 0.25], [2.6, 1.5, 0.5]],
    [[1.8, 1.0, 0.35], [1.7, 1.3, 0.3], [1.5, 0.7, 0.25], [2.2, 1.1, 0.6]],
  ];
  const slots = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  const unit = new THREE.CylinderGeometry(0.34, 0.34, 1, 48);
  const stack = new THREE.Group();
  scene.add(stack);
  const columns = slots.map(([x, z]) => {
    const segments = colors.map(color => {
      const mesh = new THREE.Mesh(unit, new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.05 }));
      mesh.position.x = x;
      mesh.position.z = z;
      stack.add(mesh);
      return mesh;
    });
    return segments;
  });
  const ease = x => 1 - Math.pow(1 - x, 3);
  const SCALE = 0.55, GAP = 0.03;

  return (t, local) => {
    cameraDrift(camera, [4.3, 3.8, 5.6], [0, 0.85, 0], t, 0.15);
    stack.rotation.y = Math.sin(t * 0.25) * 0.22;
    const n = Math.floor(t / 4), blend = smooth(0, 1.2, t % 4);
    const from = quotes[n % 2], to = quotes[(n + 1) % 2];
    columns.forEach((segments, c) => {
      const intro = ease(Math.min(1, Math.max(0, (local - c * 0.15) / 1.1)));
      const breathe = 1 + Math.sin(t * 0.8 + c) * 0.008;
      let base = 0;
      segments.forEach((mesh, s) => {
        const value = from[c][s] + (to[c][s] - from[c][s]) * blend;
        const h = Math.max(0.001, value * SCALE * intro * breathe - GAP);
        mesh.scale.y = h;
        mesh.position.y = base + h / 2;
        base += h + GAP;
      });
    });
  };
}

// ---------- plane loaders: realistic airliner, calm palette ----------
function sleekPlane() {
  const group = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: 0xf4f7fa, roughness: 0.35, metalness: 0.25 });
  const trim = new THREE.MeshStandardMaterial({ color: PALETTE.navy, roughness: 0.4, metalness: 0.2 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x24384a, roughness: 0.2, metalness: 0.4 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xd3dbe3, roughness: 0.3, metalness: 0.5 });

  const fuselage = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.62, 8, 20), hull);
  fuselage.rotation.z = Math.PI / 2;
  group.add(fuselage);
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.04, 14, 10), glass);
  cockpit.scale.set(1.7, 0.55, 1.1);
  cockpit.position.set(0.3, 0.032, 0);
  group.add(cockpit);

  const flat = (points, depth) => {
    const shape = new THREE.Shape();
    points.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    geometry.translate(0, 0, -depth / 2);
    return geometry;
  };
  const wingGeometry = flat([[0.14, 0.03], [-0.06, 0.44], [-0.15, 0.44], [-0.07, 0.03], [-0.07, -0.03], [-0.15, -0.44], [-0.06, -0.44], [0.14, -0.03]], 0.014);
  wingGeometry.rotateX(Math.PI / 2);
  const wing = new THREE.Mesh(wingGeometry, hull);
  wing.position.set(0.02, -0.02, 0);
  group.add(wing);
  const tailplane = new THREE.Mesh(wingGeometry, hull);
  tailplane.scale.set(0.42, 1, 0.42);
  tailplane.position.set(-0.34, 0, 0);
  group.add(tailplane);
  const fin = new THREE.Mesh(flat([[0, 0], [-0.09, 0.15], [-0.16, 0.15], [-0.13, 0]], 0.014), trim);
  fin.position.set(-0.28, 0.04, 0);
  group.add(fin);
  [-1, 1].forEach(side => {
    const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.024, 0.13, 14), metal);
    engine.rotation.z = Math.PI / 2;
    engine.position.set(0.07, -0.05, side * 0.17);
    group.add(engine);
  });
  return group;
}

function trailMesh(count, { color = 0xffffff, radius = 0.025, opacity = 0.7 } = {}) {
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(radius, 10, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }), count);
  mesh.frustumCulled = false;
  const m = new THREE.Matrix4();
  mesh.place = (i, point, s) => mesh.setMatrixAt(i, m.makeScale(s, s, s).setPosition(point));
  mesh.commit = () => { mesh.instanceMatrix.needsUpdate = true; };
  return mesh;
}

function blobShadow(size = 0.7) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(20,45,70,.3)');
  grad.addColorStop(1, 'rgba(20,45,70,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false }));
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

const circlePoints = (radius, count = 160) => Array.from({ length: count + 1 }, (_, i) => new THREE.Vector3(radius * Math.sin(i / count * TAU), 0, radius * Math.cos(i / count * TAU)));

// Frame-rate independent easing toward a target.
const damp = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-rate * dt));
// Smooth pseudo-random value in about [-1, 1]; different seeds decorrelate channels.
const drift = (t, seed = 0) => 0.5 * Math.sin(t * 1.3 + seed) + 0.3 * Math.sin(t * 2.9 + seed * 2.1) + 0.2 * Math.sin(t * 0.6 + seed * 0.7);

function stepper() {
  let last;
  return t => {
    const dt = Math.min(0.1, Math.max(0.001, t - (last ?? t - 0.016)));
    last = t;
    return dt;
  };
}

function cameraDrift(camera, base, look, t, amount = 0.25) {
  camera.position.set(base[0] + Math.sin(t * 0.21) * amount, base[1] + Math.sin(t * 0.33) * amount * 0.5, base[2] + Math.cos(t * 0.17) * amount * 0.4);
  camera.lookAt(look[0], look[1], look[2]);
}

// Rolls into the turn smoothly and adds a little pitch/yaw turbulence.
function fly(plane, heading, up, state, { bank, t, dt, seed = 0 }) {
  state.bank = damp(state.bank ?? 0, bank, 2.4, dt);
  orient(plane, heading, up, state.bank + drift(t, seed) * 0.05);
  plane.rotateZ(drift(t * 1.1, seed + 3) * 0.035);
  plane.rotateY(drift(t * 0.9, seed + 6) * 0.03);
}

// 9. orbit loader: airliner on a slowly precessing orbit around a dotted globe
function buildOrbitLoader({ scene, camera }) {
  camera.position.set(0, 0.4, 5.0);
  camera.lookAt(0, 0, 0);
  const sun = businessLights(scene);

  const tilt = new THREE.Group();
  tilt.rotation.set(0.35, 0, 0.2);
  scene.add(tilt);
  const globe = dottedGlobe(0.9);
  tilt.add(globe, globe.userData.glow);

  const R = 1.3;
  const orbit = new THREE.Group();
  scene.add(orbit);
  orbit.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(circlePoints(R)), new THREE.LineBasicMaterial({ color: 0xaebfcf, transparent: true, opacity: 0.35 })));

  // Waypoints pulse right after the plane passes them, so the loop reads as progress.
  const waypoints = [0, 1, 2, 3].map(k => {
    const angle = k * TAU / 4 + 0.6, color = k % 2 ? PALETTE.teal : PALETTE.amber;
    const marker = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), new THREE.MeshBasicMaterial({ color }));
    const pulse = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false }));
    marker.position.set(R * Math.sin(angle), 0, R * Math.cos(angle));
    pulse.position.copy(marker.position);
    orbit.add(marker, pulse);
    return { angle, pulse };
  });

  const plane = sleekPlane();
  plane.scale.setScalar(0.8);
  scene.add(plane);
  const COUNT = 90;
  const trail = trailMesh(COUNT, { color: 0x8cc0e6, radius: 0.02, opacity: 0.8 });
  scene.add(trail);
  const point = new THREE.Vector3(), ahead = new THREE.Vector3(), heading = new THREE.Vector3(), up = new THREE.Vector3();
  const state = {}, step = stepper();
  const phase = tt => tt * 0.7 + 0.2 * Math.sin(tt * 0.9);
  // Orbit-local position: speed, radius and height all breathe a little.
  const spot = (tt, out) => {
    const r = R * (1 + 0.035 * Math.sin(tt * 0.55));
    return out.set(r * Math.sin(phase(tt)), 0.1 * Math.sin(tt * 1.1), r * Math.cos(phase(tt)));
  };

  return t => {
    const dt = step(t);
    cameraDrift(camera, [0, 0.4, 5.0], [0, 0, 0], t, 0.2);
    sun.position.set(Math.cos(t * 0.25) * 4, 3, Math.sin(t * 0.25) * 4 + 2);
    globe.rotation.y = t * 0.12;
    orbit.rotation.set(0.85 + Math.sin(t * 0.31) * 0.1, t * 0.09, -0.35 + Math.sin(t * 0.23) * 0.1);
    orbit.updateMatrixWorld(true);

    plane.position.copy(orbit.localToWorld(spot(t, point)));
    heading.copy(orbit.localToWorld(spot(t + 0.03, ahead))).sub(plane.position);
    up.set(0, 1, 0).transformDirection(orbit.matrixWorld);
    fly(plane, heading, up, state, { bank: -0.32 + drift(t * 0.5) * 0.1, t, dt });

    // The contrail lengthens and shortens like an indeterminate progress bar and tapers at both ends.
    const length = 1.5 + 0.9 * Math.sin(t * 0.5);
    for (let i = 0; i < COUNT; i++) {
      const u = i / COUNT;
      const size = Math.max(0.0001, Math.min(1, u * 7) * Math.pow(1 - u, 1.1) * 1.15);
      trail.place(i, orbit.localToWorld(spot(t - 0.12 - u * length, point)), size);
    }
    trail.commit();

    waypoints.forEach(w => {
      const f = wrap(phase(t) - w.angle, TAU) / 1.4;
      w.pulse.visible = f < 1;
      if (f < 1) {
        w.pulse.scale.setScalar(1 + f * 3.5);
        w.pulse.material.opacity = Math.pow(1 - f, 2) * 0.55;
      }
    });
  };
}

// 10. progress-arc loader: the arc behind the plane grows and shrinks
function wireSphere(radius) {
  const points = [];
  [-60, -30, 0, 30, 60].forEach(lat => {
    for (let i = 0; i < 72; i++) points.push(geo(lat, i / 72 * 360, radius), geo(lat, (i + 1) / 72 * 360, radius));
  });
  for (let lon = 0; lon < 360; lon += 30) {
    for (let i = 0; i < 36; i++) points.push(geo(-90 + i * 5, lon, radius), geo(-85 + i * 5, lon, radius));
  }
  return new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0x7fa3c2, transparent: true, opacity: 0.5 }));
}

function buildArcLoader({ scene, camera }) {
  camera.position.set(0, 0.6, 5.2);
  camera.lookAt(0, 0, 0);
  businessLights(scene);

  const core = new THREE.Group();
  core.rotation.z = 0.35;
  scene.add(core);
  core.add(new THREE.Mesh(new THREE.SphereGeometry(0.88, 48, 32), new THREE.MeshBasicMaterial({ color: 0xdbe8f3, transparent: true, opacity: 0.55 })));
  core.add(wireSphere(0.89));

  const R = 1.35;
  const ring = new THREE.Group();
  ring.rotation.set(1.05, 0, 0.18);
  scene.add(ring);
  ring.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(circlePoints(R)), new THREE.LineBasicMaterial({ color: 0xc3d1de })));

  const COUNT = 80;
  const arc = trailMesh(COUNT, { radius: 0.03, opacity: 0.95 });
  const from = new THREE.Color(PALETTE.teal), to = new THREE.Color(PALETTE.blue), tint = new THREE.Color();
  for (let i = 0; i < COUNT; i++) arc.setColorAt(i, tint.lerpColors(from, to, i / COUNT));
  scene.add(arc);

  const plane = sleekPlane();
  plane.scale.setScalar(0.5);
  scene.add(plane);
  const point = new THREE.Vector3(), ahead = new THREE.Vector3(), heading = new THREE.Vector3(), up = new THREE.Vector3();
  const state = {}, step = stepper();
  const headAngle = tt => tt * 0.95 + 0.25 * Math.sin(tt * 0.7);
  const radius = tt => R * (1 + 0.03 * Math.sin(tt * 0.9));
  const height = tt => 0.07 * Math.sin(tt * 1.3);
  const spot = (tt, out) => out.set(radius(tt) * Math.sin(headAngle(tt)), height(tt), radius(tt) * Math.cos(headAngle(tt)));

  return t => {
    const dt = step(t);
    cameraDrift(camera, [0, 0.6, 5.2], [0, 0, 0], t, 0.3);
    core.rotation.set(Math.sin(t * 0.4) * 0.08, t * 0.15, 0.35);
    core.scale.setScalar(1 + Math.sin(t * 1.2) * 0.012);
    ring.updateMatrixWorld(true);
    plane.position.copy(ring.localToWorld(spot(t, point)));
    heading.copy(ring.localToWorld(spot(t + 0.03, ahead))).sub(plane.position);
    up.set(0, 1, 0).transformDirection(ring.matrixWorld);
    fly(plane, heading, up, state, { bank: -0.32 + drift(t * 0.5, 2) * 0.1, t, dt, seed: 2 });
    const theta = headAngle(t), length = 1.6 + Math.sin(t * 0.8) * 0.9, r = radius(t);
    for (let i = 0; i < COUNT; i++) {
      const a = theta - 0.12 - (i / COUNT) * length;
      point.set(r * Math.sin(a), height(t), r * Math.cos(a));
      arc.place(i, ring.localToWorld(point), Math.pow(1 - i / COUNT, 1.3) * 1.2);
    }
    arc.commit();
  };
}

// 11. radar loader: instrument dial with a sweeping beam
function buildRadarLoader({ scene, camera }) {
  camera.position.set(0, 3.9, 4.6);
  camera.lookAt(0, 0, 0.1);
  businessLights(scene);

  const flatMesh = (geometry, material, y = 0) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
    scene.add(mesh);
    return mesh;
  };
  flatMesh(new THREE.CircleGeometry(1.95, 96), new THREE.MeshStandardMaterial({ color: 0xf3f7fb, roughness: 0.95 }));
  [0.6, 1.1, 1.5, 1.9].forEach(r => flatMesh(new THREE.RingGeometry(r - 0.004, r + 0.004, 128), new THREE.MeshBasicMaterial({ color: r > 1.8 ? 0x9fb3c6 : 0xcfdae5 }), 0.002));

  const ticks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.012, 0.002, 0.07), new THREE.MeshBasicMaterial({ color: 0x6f8aa3 }), 72);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 72; i++) {
    const a = i / 72 * TAU, major = i % 6 === 0;
    dummy.position.set(Math.sin(a) * 1.8, 0.004, Math.cos(a) * 1.8);
    dummy.rotation.y = a;
    dummy.scale.set(major ? 1.6 : 1, 1, major ? 1.8 : 1);
    dummy.updateMatrix();
    ticks.setMatrixAt(i, dummy.matrix);
  }
  scene.add(ticks);
  [[0, -2.02, PALETTE.amber], [2.02, 0, PALETTE.navy], [0, 2.02, PALETTE.navy], [-2.02, 0, PALETTE.navy]].forEach(([x, z, color]) => {
    const marker = new THREE.Mesh(new THREE.SphereGeometry(0.035, 14, 10), new THREE.MeshBasicMaterial({ color }));
    marker.position.set(x, 0.01, z);
    scene.add(marker);
  });

  const beam = document.createElement('canvas');
  beam.width = beam.height = 256;
  const g = beam.getContext('2d');
  const cone = g.createConicGradient(0, 128, 128);
  cone.addColorStop(0, 'rgba(31,138,138,0)');
  cone.addColorStop(0.78, 'rgba(31,138,138,0)');
  cone.addColorStop(1, 'rgba(31,138,138,.5)');
  g.fillStyle = cone;
  g.fillRect(0, 0, 256, 256);
  const sweep = new THREE.Group();
  scene.add(sweep);
  const beamMesh = new THREE.Mesh(new THREE.CircleGeometry(1.9, 96), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(beam), transparent: true, depthWrite: false }));
  beamMesh.rotation.x = -Math.PI / 2;
  beamMesh.position.y = 0.003;
  sweep.add(beamMesh);

  const blips = [[0.5, 0.7, PALETTE.amber], [1.0, 2.3, PALETTE.teal], [1.45, 3.6, PALETTE.amber], [0.8, 4.6, PALETTE.teal], [1.6, 5.7, PALETTE.amber]].map(([r, a, color]) => {
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(0.045, 20), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(r * Math.cos(a), 0.007, r * Math.sin(a));
    scene.add(mesh);
    return { mesh, angle: a };
  });
  const pings = [0, 1].map(() => {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 96), new THREE.MeshBasicMaterial({ color: PALETTE.teal, transparent: true, opacity: 0, depthWrite: false }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.004;
    scene.add(mesh);
    return mesh;
  });

  const plane = sleekPlane();
  plane.scale.setScalar(0.7);
  scene.add(plane);
  const shadow = blobShadow(0.7);
  shadow.position.y = 0.005;
  scene.add(shadow);
  const COUNT = 30;
  const trail = trailMesh(COUNT, { color: 0x7fb8e0, radius: 0.02 });
  scene.add(trail);
  const heading = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), point = new THREE.Vector3(), ahead = new THREE.Vector3();
  const state = {}, step = stepper();
  // Angle, radius and height all vary slowly, so the path is an easing spiral rather than a perfect circle.
  const theta = tt => tt * 0.9 + 0.22 * Math.sin(tt * 0.6);
  const spot = (tt, out) => {
    const r = 1.2 + 0.16 * Math.sin(tt * 0.45), h = 0.32 + 0.05 * Math.sin(tt * 1.3);
    return out.set(r * Math.cos(theta(tt)), h, r * Math.sin(theta(tt)));
  };

  return t => {
    const dt = step(t);
    cameraDrift(camera, [0, 3.9, 4.6], [0, 0, 0.1], t, 0.28);
    const head = theta(t);
    sweep.rotation.y = -head;
    spot(t, point);
    plane.position.copy(point);
    heading.copy(spot(t + 0.03, ahead)).sub(point);
    fly(plane, heading, up, state, { bank: 0.32 + drift(t * 0.5, 1) * 0.1, t, dt, seed: 1 });
    shadow.position.set(point.x, 0.005, point.z);
    shadow.scale.setScalar(1 + (point.y - 0.32) * 1.5);
    blips.forEach(b => {
      const behind = wrap(head - b.angle, TAU) / TAU;
      b.mesh.material.opacity = behind < 0.7 ? Math.pow(1 - behind / 0.7, 2) * 0.9 : 0;
      b.mesh.scale.setScalar(1 + (1 - Math.min(1, behind * 4)) * 0.8);
    });
    pings.forEach((ping, k) => {
      const f = wrap(t / 3.2 + k * 0.5, 1);
      ping.scale.setScalar(0.05 + f * 1.9);
      ping.material.opacity = Math.pow(1 - f, 2) * 0.35;
    });
    for (let i = 0; i < COUNT; i++) trail.place(i, spot(t - 0.17 - i * 0.055, point), 1 - i / COUNT);
    trail.commit();
  };
}

// 12. holding pattern: racetrack over a map grid
function buildHoldingLoader({ scene, camera }) {
  camera.position.set(0, 3.6, 4.6);
  camera.lookAt(0, 0, 0);
  businessLights(scene);
  scene.fog = new THREE.Fog(0xeaf0f6, 6.5, 11);
  scene.add(new THREE.GridHelper(5, 20, 0xc3cfdb, 0xdde5ec));

  const L = 2.3, R = 0.75, ARC = Math.PI * R, P = 2 * L + 2 * ARC, H = 0.3;
  // Clockwise racetrack seen from above (right-hand turns, as in a real hold).
  const track = (u, out, dir) => {
    u = wrap(u, P);
    if (u < L) { out.set(-L / 2 + u, 0, R); dir.set(1, 0, 0); }
    else if (u < L + ARC) { const f = (u - L) / R; out.set(L / 2 + R * Math.sin(f), 0, R * Math.cos(f)); dir.set(Math.cos(f), 0, -Math.sin(f)); }
    else if (u < 2 * L + ARC) { out.set(L / 2 - (u - L - ARC), 0, -R); dir.set(-1, 0, 0); }
    else { const f = (u - 2 * L - ARC) / R; out.set(-L / 2 - R * Math.sin(f), 0, -R * Math.cos(f)); dir.set(-Math.cos(f), 0, Math.sin(f)); }
    out.z *= -1;
    dir.z *= -1;
  };

  const probe = new THREE.Vector3(), dir = new THREE.Vector3();
  const outline = [];
  for (let i = 0; i < 240; i++) { track(i / 240 * P, probe, dir); outline.push(probe.clone()); }
  const path = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(outline), new THREE.LineDashedMaterial({ color: 0x9db3c7, dashSize: 0.07, gapSize: 0.05 }));
  path.computeLineDistances();
  path.position.y = 0.004;
  scene.add(path);

  const fixes = [[L / 2 + R, PALETTE.amber], [-L / 2 - R, PALETTE.teal]].map(([x, color]) => {
    const fix = new THREE.Mesh(new THREE.RingGeometry(0.08, 0.1, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }));
    fix.rotation.x = -Math.PI / 2;
    fix.position.set(x, 0.006, 0);
    scene.add(fix);
    return fix;
  });

  const plane = sleekPlane();
  plane.scale.setScalar(0.8);
  scene.add(plane);
  const shadow = blobShadow(0.9);
  shadow.position.y = 0.006;
  scene.add(shadow);
  const COUNT = 36;
  const trail = trailMesh(COUNT, { color: 0x7fb8e0, radius: 0.02 });
  scene.add(trail);
  const up = new THREE.Vector3(0, 1, 0), spot = new THREE.Vector3();
  const state = {}, step = stepper();
  let u = 0, speed = 1;

  return t => {
    const dt = step(t);
    cameraDrift(camera, [0, 3.6, 4.6], [0, 0, 0], t, 0.3);
    const along = wrap(u, P);
    const turning = (along >= L && along < L + ARC) || along >= 2 * L + ARC;
    // Slows a little through the turns and picks up on the straights.
    speed = damp(speed, turning ? 0.8 : 1.15, 1.8, dt);
    u += speed * dt;
    track(u, probe, dir);
    const h = H + Math.sin(t * 1.2) * 0.035;
    plane.position.set(probe.x, h, probe.z);
    fly(plane, dir, up, state, { bank: turning ? 0.45 : 0, t, dt });
    plane.rotateZ(turning ? 0.03 : -0.02);
    shadow.position.set(probe.x, 0.006, probe.z);
    shadow.scale.setScalar(1 + (h - H) * 2);
    for (let i = 0; i < COUNT; i++) {
      track(u - 0.2 - i * 0.045, probe, dir);
      trail.place(i, spot.set(probe.x, H + Math.sin((t - i * 0.05) * 1.2) * 0.035, probe.z), 1 - i / COUNT);
    }
    trail.commit();
    fixes.forEach((fix, k) => {
      const pulse = wrap(t * 0.7 + k * 0.5, 1);
      fix.scale.setScalar(1 + pulse * 1.4);
      fix.material.opacity = (1 - pulse) * 0.9;
    });
  };
}

mount('gl-earth', buildEarth);
mount('gl-clouds', buildCloudHop);
mount('gl-island', buildIsland);
mount('gl-balloons', buildBalloons);
mount('gl-paper', buildPaper);
mount('gl-network', buildNetwork);
mount('gl-shield', buildShield, { fov: 30 });
mount('gl-premium', buildPremium, { fov: 30 });
mount('gl-orbit', buildOrbitLoader);
mount('gl-arc', buildArcLoader);
mount('gl-radar', buildRadarLoader, { fov: 30 });
mount('gl-holding', buildHoldingLoader, { fov: 30 });
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
