import * as THREE from 'three';

// Data configuration
let DATA_CONFIG = {
  numSources: 0, // Will be set from EDF file
  samplingRate: 0, // Will be set from EDF file
  duration: 0, // Will be set from EDF file
  maxPointsPerWave: 100, // Maximum points to render per wave
  amplitudeScale: 2.0, // Multiplicative factor for signal amplitude
};

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

// Function to read EDF file and extract labels
async function readEDFFile(filePath: string): Promise<{signals: number[][], labels: string[]}> {
  try {
    const response = await fetch(filePath);
    const arrayBuffer = await response.arrayBuffer();
    const dataView = new DataView(arrayBuffer);
    
    // Read header information
    const numSignals = parseInt(new TextDecoder().decode(new Uint8Array(arrayBuffer.slice(252, 256))).trim());
    const numDataRecords = parseInt(new TextDecoder().decode(new Uint8Array(arrayBuffer.slice(236, 244))).trim());
    const durationOfDataRecord = parseFloat(new TextDecoder().decode(new Uint8Array(arrayBuffer.slice(244, 252))).trim());
    
    // Sampling rate: samples per record per channel (assume all channels have the same rate)
    const samplesPerRecord = parseInt(new TextDecoder().decode(new Uint8Array(arrayBuffer.slice(256 + 216 * numSignals, 256 + 216 * numSignals + 8))).trim());
    const samplingRate = samplesPerRecord / durationOfDataRecord;
    
    // Set DATA_CONFIG fields
    DATA_CONFIG.numSources = numSignals;
    DATA_CONFIG.samplingRate = samplingRate;
    DATA_CONFIG.duration = numDataRecords * durationOfDataRecord;
    
    // Channel labels are at 256 + 16*i, each 16 bytes, for i in 0..numSignals-1
    const labels: string[] = [];
    for (let i = 0; i < numSignals; i++) {
      const start = 256 + i * 16;
      const end = start + 16;
      const label = new TextDecoder().decode(new Uint8Array(arrayBuffer.slice(start, end))).trim();
      labels.push(label);
    }
    
    // Calculate header size and data start position
    const headerSize = 256 + (256 * numSignals);
    const dataStart = headerSize;
    
    // Read signals
    const signals: number[][] = Array(numSignals).fill(0).map(() => []);
    const bytesPerValue = 2; // EDF uses 16-bit integers
    
    for (let record = 0; record < numDataRecords; record++) {
      const recordStart = dataStart + (record * numSignals * bytesPerValue);
      
      for (let signal = 0; signal < numSignals; signal++) {
        const value = dataView.getInt16(recordStart + (signal * bytesPerValue), true);
        signals[signal].push(value);
      }
    }
    
    // Extract physical and digital min/max for each channel
    const physMin: number[] = [];
    const physMax: number[] = [];
    const digMin: number[] = [];
    const digMax: number[] = [];
    for (let i = 0; i < numSignals; i++) {
      // Each field is 8 bytes, see EDF spec
      const physMinStart = 256 + 104 * numSignals + i * 8;
      const physMaxStart = 256 + 112 * numSignals + i * 8;
      const digMinStart = 256 + 120 * numSignals + i * 8;
      const digMaxStart = 256 + 128 * numSignals + i * 8;
      physMin.push(parseFloat(new TextDecoder().decode(new Uint8Array(arrayBuffer.slice(physMinStart, physMinStart + 8))).trim()));
      physMax.push(parseFloat(new TextDecoder().decode(new Uint8Array(arrayBuffer.slice(physMaxStart, physMaxStart + 8))).trim()));
      digMin.push(parseInt(new TextDecoder().decode(new Uint8Array(arrayBuffer.slice(digMinStart, digMinStart + 8))).trim()));
      digMax.push(parseInt(new TextDecoder().decode(new Uint8Array(arrayBuffer.slice(digMaxStart, digMaxStart + 8))).trim()));
    }
    // Log mean value of every channel in microvolts (scientific notation)
    labels.forEach((label, i) => {
      const signal = signals[i];
      const meanDigital = signal.reduce((sum, v) => sum + v, 0) / signal.length;
      // Convert mean to microvolts
      const meanPhysical = ((meanDigital - digMin[i]) * (physMax[i] - physMin[i]) / (digMax[i] - digMin[i])) + physMin[i];
      console.log(`Channel ${i} (${label}): mean = ${meanPhysical.toExponential(6)} uV`);
    });
    
    return { signals, labels };
  } catch (error) {
    console.error('Error reading EDF file:', error);
    throw error;
  }
}

// Helper to create a text sprite
function makeTextSprite(message: string, color: string = '#ffffff', fontSize: number = 48): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d')!;
  context.font = `${fontSize}px Arial`;
  // Set canvas size based on text
  const textWidth = context.measureText(message).width;
  canvas.width = textWidth;
  canvas.height = fontSize * 1.2;
  // Redraw with correct size
  context.font = `${fontSize}px Arial`;
  context.fillStyle = color;
  context.textBaseline = 'top';
  context.textAlign = 'right';
  context.fillText(message, textWidth, 0);
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  // Scale sprite to reasonable size in world units
  sprite.scale.set(0.75, 0.25, 1);
  return sprite;
}

// Create waves
const waves: THREE.Line[] = [];
const colors = [
  0xff0000, 0xff7f00, 0xffff00, 0x00ff00, 0x0000ff,
  0x4b0082, 0x9400d3, 0xff1493, 0x00ffff, 0xffffff
];

let globalSignals: number[][] = [];
let globalLabels: string[] = [];
let scrollbar: HTMLInputElement | null = null;

// Helper to get the current window start index based on scrollbar
function getWindowStart(totalLength: number): number {
  if (!scrollbar) return 0;
  const scrollValue = parseInt(scrollbar.value);
  return Math.min(scrollValue, Math.max(0, totalLength - DATA_CONFIG.maxPointsPerWave));
}

// Redraw the plot for the current window
function renderWindow() {
  // Remove all objects except camera lights (if any)
  while (scene.children.length > 0) scene.remove(scene.children[0]);

  // Show current time window above the scrollbar
  const timeDiv = document.getElementById('time-range');
  if (timeDiv && globalSignals.length > 0 && DATA_CONFIG.samplingRate > 0) {
    const start = getWindowStart(globalSignals[0].length);
    const end = Math.min(start + DATA_CONFIG.maxPointsPerWave, globalSignals[0].length);
    const startSec = (start / DATA_CONFIG.samplingRate).toFixed(2);
    const endSec = (end / DATA_CONFIG.samplingRate).toFixed(2);
    timeDiv.textContent = `Viewing: ${startSec} to ${endSec} seconds`;
  }

  const colors = [
    0xff0000, 0xff7f00, 0xffff00, 0x00ff00, 0x0000ff,
    0x4b0082, 0x9400d3, 0xff1493, 0x00ffff, 0xffffff
  ];

  const selectedSignals = globalSignals.slice(0, DATA_CONFIG.numSources);
  const selectedLabels = globalLabels.slice(0, DATA_CONFIG.numSources);

  selectedSignals.forEach((signal, i) => {
    const start = getWindowStart(signal.length);
    const end = Math.min(start + DATA_CONFIG.maxPointsPerWave, signal.length);
    const windowData = signal.slice(start, end);
    const decimatedData = decimateData(windowData, DATA_CONFIG.maxPointsPerWave);

    const points: THREE.Vector3[] = [];
    const xOffset = -9;
    const yOffset = 4 - (i * (8 / DATA_CONFIG.numSources));

    decimatedData.forEach((value, index) => {
      const x = (index / decimatedData.length) * 18 + xOffset;
      const y = (value / 32768) * DATA_CONFIG.amplitudeScale + yOffset;
      points.push(new THREE.Vector3(x, y, 0));
    });

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ 
      color: colors[i % colors.length],
      linewidth: 1
    });
    const wave = new THREE.Line(geometry, material);
    scene.add(wave);

    // Add channel label as a sprite
    const labelSprite = makeTextSprite(selectedLabels[i], '#ffffff', 64);
    labelSprite.position.set(xOffset - 1.2, yOffset, 0);
    scene.add(labelSprite);
  });

  renderer.render(scene, camera);
}

// Initialize visualization with EDF data
async function initializeVisualization() {
  try {
    const { signals, labels } = await readEDFFile('/demo.edf');
    globalSignals = signals;
    globalLabels = labels;
    scrollbar = document.getElementById('scrollbar') as HTMLInputElement;
    if (scrollbar) {
      const dataLen = signals[0].length;
      const maxScroll = Math.max(0, dataLen - DATA_CONFIG.maxPointsPerWave);
      scrollbar.max = maxScroll.toString();
      scrollbar.value = '0';
      scrollbar.disabled = dataLen <= DATA_CONFIG.maxPointsPerWave;
      scrollbar.style.display = dataLen <= DATA_CONFIG.maxPointsPerWave ? 'none' : 'block';
      scrollbar.addEventListener('input', () => renderWindow());
    }
    renderWindow();
  } catch (error) {
    console.error('Failed to initialize visualization:', error);
  }
}

// Handle window resize
window.addEventListener('resize', () => {
  const aspect = window.innerWidth / window.innerHeight;
  camera.left = -10 * aspect;
  camera.right = 10 * aspect;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderWindow();
});

// Start visualization
initializeVisualization();