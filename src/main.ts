import * as THREE from 'three';

// Data configuration
const DATA_CONFIG = {
  numSources: 8,
  samplingRate: 512, // Hz
  duration: 2 * 60 * 60, // 2 hours in seconds
  maxPointsPerWave: 2000, // Maximum points to render per wave
} as const;

// Calculate total samples
const totalSamples = DATA_CONFIG.samplingRate * DATA_CONFIG.duration;

// Decimation function
function decimateData(data: number[], targetLength: number): number[] {
  if (data.length <= targetLength) return data;
  
  const ratio = Math.floor(data.length / targetLength);
  const result: number[] = [];
  
  for (let i = 0; i < targetLength; i++) {
    const index = i * ratio;
    result.push(data[index]);
  }
  
  return result;
}

// Create scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

// Create camera
const camera = new THREE.OrthographicCamera(
  -10, 10, 5, -5, 0.1, 1000
);
camera.position.z = 5;

// Create renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Generate sample data (replace this with your actual data source)
function generateSampleData(sourceIndex: number): number[] {
  const data: number[] = [];
  for (let i = 0; i < totalSamples; i++) {
    // Generate a sample sine wave with some noise
    const t = i / DATA_CONFIG.samplingRate;
    const frequency = 10 + sourceIndex * 0.5; // Different frequency for each source
    data.push(Math.sin(2 * Math.PI * frequency * t) + (Math.random() - 0.5) * 0.1);
  }
  return data;
}

// Create waves
const waves: THREE.LineSegments[] = [];
const colors = [
  0xff0000, 0xff7f00, 0xffff00, 0x00ff00, 0x0000ff,
  0x4b0082, 0x9400d3, 0xff1493, 0x00ffff, 0xffffff
];

// Initialize waves with decimated data
for (let i = 0; i < DATA_CONFIG.numSources; i++) {
  const rawData = generateSampleData(i);
  const decimatedData = decimateData(rawData, DATA_CONFIG.maxPointsPerWave);
  
  const points: THREE.Vector3[] = [];
  const yOffset = 4 - (i * (8 / DATA_CONFIG.numSources)); // Scale vertical spacing

  decimatedData.forEach((value, index) => {
    const x = (index / decimatedData.length) * 20 - 10;
    const y = value * 0.3 + yOffset;
    points.push(new THREE.Vector3(x, y, 0));
  });

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ 
    color: colors[i % colors.length],
    linewidth: 1
  });
  
  const wave = new THREE.LineSegments(geometry, material);
  waves.push(wave);
  scene.add(wave);
}

// Handle window resize
window.addEventListener('resize', () => {
  const aspect = window.innerWidth / window.innerHeight;
  camera.left = -10 * aspect;
  camera.right = 10 * aspect;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.render(scene, camera);
});

// Initial render
renderer.render(scene, camera); 