import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

// DOM Elements
const viewer = document.getElementById("viewer");
const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const browseButton = document.getElementById("browseButton");
const loading = document.getElementById("loading");
const loadingText = document.getElementById("loadingText");
const toast = document.getElementById("toast");
const toolbar = document.getElementById("toolbar");
const modelInfo = document.getElementById("modelInfo");
const resetCameraButton = document.getElementById("resetCamera");
const gridToggleButton = document.getElementById("gridToggle");
const wireframeToggleButton = document.getElementById("wireframeToggle");
const envToggleButton = document.getElementById("envToggle");
const animControls = document.getElementById("animControls");
const playPauseAnimButton = document.getElementById("playPauseAnim");
const playIcon = document.getElementById("playIcon");
const pauseIcon = document.getElementById("pauseIcon");
const animSelect = document.getElementById("animSelect");

// Scene Setup
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  45,
  viewer.clientWidth / viewer.clientHeight,
  0.01,
  1000
);
camera.position.set(3, 2, 5);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(viewer.clientWidth, viewer.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = false;
viewer.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(0, 0, 0);

// Lighting & PBR Studio Environment
const pmremGenerator = new THREE.PMREMGenerator(renderer);
const roomEnvironment = new RoomEnvironment();
const envTexture = pmremGenerator.fromScene(roomEnvironment).texture;
scene.environment = null;

const ambientLight = new THREE.HemisphereLight(0xffffff, 0x334155, 1.4);
scene.add(ambientLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
keyLight.position.set(5, 8, 5);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x90b0ff, 1.2);
fillLight.position.set(-5, 3, -4);
scene.add(fillLight);

const backLight = new THREE.DirectionalLight(0xffffff, 0.8);
backLight.position.set(0, 4, -8);
scene.add(backLight);

// Grid Helper
const grid = new THREE.GridHelper(20, 20, 0x6366f1, 0x334155);
grid.position.y = -0.01;
grid.visible = false;
scene.add(grid);

// Setup Draco Loader
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath("https://www.gstatic.com/draco/v1/decoders/");

// State Variables
let currentModel = null;
let animations = [];
let mixer = null;
let currentAction = null;
let isPlaying = true;
let wireframe = false;
let studioLight = false;
let cameraStart = {
  position: camera.position.clone(),
  target: controls.target.clone()
};
let createdBlobUrls = [];

// Enforce initial default states
grid.visible = false;
gridToggleButton.classList.remove("active");
wireframeToggleButton.classList.remove("active");
envToggleButton.classList.remove("active");
scene.environment = null;

// Event Listeners
browseButton.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async (event) => {
  const files = Array.from(event.target.files || []);
  if (files.length) await loadFiles(files);
  fileInput.value = "";
});

["dragenter", "dragover"].forEach(type => {
  viewer.addEventListener(type, (event) => {
    event.preventDefault();
    dropZone.classList.add("dragover");
  });
});

["dragleave", "drop"].forEach(type => {
  viewer.addEventListener(type, (event) => {
    event.preventDefault();
    dropZone.classList.remove("dragover");
  });
});

viewer.addEventListener("drop", async (event) => {
  const files = Array.from(event.dataTransfer.files || []);
  if (files.length) await loadFiles(files);
});

resetCameraButton.addEventListener("click", resetCamera);

gridToggleButton.addEventListener("click", () => {
  grid.visible = !grid.visible;
  gridToggleButton.classList.toggle("active", grid.visible);
});

wireframeToggleButton.addEventListener("click", () => {
  wireframe = !wireframe;
  wireframeToggleButton.classList.toggle("active", wireframe);
  if (currentModel) setWireframe(currentModel, wireframe);
});

envToggleButton.addEventListener("click", () => {
  studioLight = !studioLight;
  scene.environment = studioLight ? envTexture : null;
  envToggleButton.classList.toggle("active", studioLight);
});

playPauseAnimButton.addEventListener("click", toggleAnimationPlay);

animSelect.addEventListener("change", (e) => {
  const index = parseInt(e.target.value, 10);
  if (!isNaN(index) && animations[index]) {
    playAnimation(index);
  }
});

window.addEventListener("resize", resize);
new ResizeObserver(resize).observe(viewer);

// Loading Manager Helper
function createLoadingManager(files) {
  const manager = new THREE.LoadingManager();
  const fileMap = new Map();

  files.forEach(file => {
    fileMap.set(file.name.toLowerCase(), file);
    if (file.webkitRelativePath) {
      fileMap.set(file.webkitRelativePath.toLowerCase(), file);
    }
  });

  manager.setURLModifier((url) => {
    const cleanUrl = decodeURIComponent(url.replace(/^blob:/, "")).split("?")[0];
    const fileName = cleanUrl.split("/").pop().toLowerCase();

    if (fileMap.has(fileName)) {
      const blobUrl = URL.createObjectURL(fileMap.get(fileName));
      createdBlobUrls.push(blobUrl);
      return blobUrl;
    }

    return url;
  });

  return manager;
}

// Model Loading Routine
async function loadFiles(files) {
  const modelFile = files.find(file => /\.(glb|gltf|fbx|obj|stl)$/i.test(file.name));
  if (!modelFile) {
    showToast("No supported 3D model (.glb, .gltf, .fbx, .obj, .stl) found in selection.");
    return;
  }

  showLoading(true, `Loading ${modelFile.name}…`);
  revokeCreatedUrls();

  try {
    clearModel();

    const extension = modelFile.name.split(".").pop().toLowerCase();
    const manager = createLoadingManager(files);
    const objectUrl = URL.createObjectURL(modelFile);
    createdBlobUrls.push(objectUrl);

    let loadedObject = null;
    let loadedAnimations = [];

    if (extension === "glb" || extension === "gltf") {
      const loader = new GLTFLoader(manager);
      loader.setDRACOLoader(dracoLoader);
      const gltf = await new Promise((resolve, reject) => {
        loader.load(objectUrl, resolve, undefined, reject);
      });
      loadedObject = gltf.scene;
      loadedAnimations = gltf.animations || [];
    } else if (extension === "fbx") {
      const loader = new FBXLoader(manager);
      loadedObject = await new Promise((resolve, reject) => {
        loader.load(objectUrl, resolve, undefined, reject);
      });
      loadedAnimations = loadedObject.animations || [];
    } else if (extension === "obj") {
      const mtlFile = files.find(file => /\.mtl$/i.test(file.name));
      let materials = null;

      if (mtlFile) {
        const mtlLoader = new MTLLoader(manager);
        const mtlUrl = URL.createObjectURL(mtlFile);
        createdBlobUrls.push(mtlUrl);
        materials = await new Promise((resolve, reject) => {
          mtlLoader.load(mtlUrl, resolve, undefined, reject);
        });
        materials.preload();
      }

      const objLoader = new OBJLoader(manager);
      if (materials) objLoader.setMaterials(materials);

      loadedObject = await new Promise((resolve, reject) => {
        objLoader.load(objectUrl, resolve, undefined, reject);
      });
    } else if (extension === "stl") {
      const stlLoader = new STLLoader(manager);
      const geometry = await new Promise((resolve, reject) => {
        stlLoader.load(objectUrl, resolve, undefined, reject);
      });
      geometry.computeVertexNormals();
      const material = new THREE.MeshStandardMaterial({
        color: 0x90a4ae,
        roughness: 0.4,
        metalness: 0.2
      });
      loadedObject = new THREE.Mesh(geometry, material);
    }

    setupModel(loadedObject, modelFile.name, loadedAnimations, extension);
  } catch (error) {
    console.error("Failed to load model:", error);
    showToast(`Error loading model: ${error.message || "Invalid or corrupted 3D file."}`);
  } finally {
    showLoading(false);
  }
}

// Configure Loaded Model
function setupModel(model, fileName, modelAnimations = [], extension = "") {
  currentModel = model;
  animations = modelAnimations;
  scene.add(model);

  // Traverse & configure materials
  model.traverse((child) => {
    if (child.isMesh) {
      if (child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach(mat => {
          if (mat) {
            mat.side = THREE.DoubleSide;
            mat.wireframe = wireframe;
          }
        });
      }
    }
  });

  // Keep grid & studio lighting explicitly synced to their current toggle states
  grid.visible = gridToggleButton.classList.contains("active");
  scene.environment = studioLight ? envTexture : null;

  // Calculate Bounding Box & Fit Camera
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  // Center model at origin
  model.position.sub(center);

  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const fov = camera.fov * (Math.PI / 180);
  let cameraDistance = Math.abs(maxDim / (2 * Math.tan(fov / 2))) * 1.8;
  cameraDistance = Math.max(cameraDistance, 1);

  camera.near = Math.max(cameraDistance / 500, 0.001);
  camera.far = Math.min(cameraDistance * 500, 100000);
  camera.updateProjectionMatrix();

  camera.position.set(cameraDistance * 0.8, cameraDistance * 0.5, cameraDistance);
  controls.target.set(0, 0, 0);
  controls.maxDistance = cameraDistance * 10;
  controls.update();

  cameraStart = {
    position: camera.position.clone(),
    target: controls.target.clone()
  };

  // Configure Animations
  setupAnimationUI();

  // Statistics
  const stats = collectStats(model);
  modelInfo.innerHTML = `
    <strong>${escapeHtml(fileName)}</strong>
    <div class="stat-row"><span>Format:</span><span class="stat-val">${extension.toUpperCase()}</span></div>
    <div class="stat-row"><span>Meshes:</span><span class="stat-val">${stats.meshes}</span></div>
    <div class="stat-row"><span>Triangles:</span><span class="stat-val">${stats.triangles.toLocaleString()}</span></div>
    <div class="stat-row"><span>Vertices:</span><span class="stat-val">${stats.vertices.toLocaleString()}</span></div>
    <div class="stat-row"><span>Materials:</span><span class="stat-val">${stats.materials}</span></div>
    <div class="stat-row"><span>Animations:</span><span class="stat-val">${animations.length}</span></div>
  `;

  dropZone.classList.add("hidden");
  toolbar.classList.remove("hidden");
  modelInfo.classList.remove("hidden");
}

function setupAnimationUI() {
  if (animations.length > 0) {
    mixer = new THREE.AnimationMixer(currentModel);
    animSelect.innerHTML = "";

    animations.forEach((anim, i) => {
      const option = document.createElement("option");
      option.value = i;
      option.textContent = anim.name || `Animation ${i + 1}`;
      animSelect.appendChild(option);
    });

    animControls.classList.remove("hidden");
    playAnimation(0);
  } else {
    animControls.classList.add("hidden");
    mixer = null;
    currentAction = null;
  }
}

function playAnimation(index) {
  if (!mixer || !animations[index]) return;
  if (currentAction) currentAction.stop();

  currentAction = mixer.clipAction(animations[index]);
  currentAction.play();
  isPlaying = true;
  updatePlayPauseIcons();
}

function toggleAnimationPlay() {
  if (!currentAction) return;
  isPlaying = !isPlaying;
  currentAction.paused = !isPlaying;
  updatePlayPauseIcons();
}

function updatePlayPauseIcons() {
  playIcon.classList.toggle("hidden", isPlaying);
  pauseIcon.classList.toggle("hidden", !isPlaying);
}

// Calculate Geometry Statistics
function collectStats(model) {
  let meshes = 0;
  let triangles = 0;
  let vertices = 0;
  const materials = new Set();

  model.traverse((child) => {
    if (!child.isMesh) return;

    meshes++;
    const geometry = child.geometry;
    if (geometry) {
      if (geometry.index) {
        triangles += geometry.index.count / 3;
      } else if (geometry.attributes.position) {
        triangles += geometry.attributes.position.count / 3;
      }

      if (geometry.attributes.position) {
        vertices += geometry.attributes.position.count;
      }
    }

    const mats = Array.isArray(child.material) ? child.material : [child.material];
    mats.forEach(mat => {
      if (mat) materials.add(mat.uuid);
    });
  });

  return {
    meshes,
    triangles: Math.floor(triangles),
    vertices,
    materials: materials.size
  };
}

function setWireframe(model, enabled) {
  model.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    mats.forEach(mat => {
      if (mat) mat.wireframe = enabled;
    });
  });
}

function clearModel() {
  if (currentModel) {
    scene.remove(currentModel);
    currentModel.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach(mat => {
          if (mat) {
            for (const key of ["map", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap", "aoMap", "alphaMap"]) {
              if (mat[key]) mat[key].dispose();
            }
            mat.dispose();
          }
        });
      }
    });
  }

  currentModel = null;
  mixer = null;
  currentAction = null;
  animations = [];
  modelInfo.classList.add("hidden");
  toolbar.classList.add("hidden");
  animControls.classList.add("hidden");
  dropZone.classList.remove("hidden");
}

function resetCamera() {
  camera.position.copy(cameraStart.position);
  controls.target.copy(cameraStart.target);
  controls.update();
}

function showLoading(show, text = "Loading model…") {
  loadingText.textContent = text;
  loading.classList.toggle("hidden", !show);
}

function showToast(message, duration = 4000) {
  toast.textContent = message;
  toast.classList.remove("hidden");
  setTimeout(() => {
    toast.classList.add("hidden");
  }, duration);
}

function revokeCreatedUrls() {
  createdBlobUrls.forEach(url => URL.revokeObjectURL(url));
  createdBlobUrls = [];
}

function resize() {
  const width = viewer.clientWidth;
  const height = viewer.clientHeight;
  if (!width || !height) return;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

// Animation Loop
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  if (mixer && isPlaying) mixer.update(delta);

  controls.update();
  renderer.render(scene, camera);
}

animate();

