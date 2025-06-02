import * as THREE from 'three';

// Data configuration
const DATA_CONFIG = {
  numSources: 8,
  samplingRate: 512, // Hz
  duration: 2 * 60 * 60, // 2 hours in seconds
  maxPointsPerWave: 2000, // Maximum points to render per wave
  amplitudeScale: 2.0, // Multiplicative factor for signal amplitude
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

// Function to read EDF file
async function readEDFFile(filePath: string): Promise<number[][]> {
  try {
    const response = await fetch(filePath);
    const arrayBuffer = await response.arrayBuffer();
    const dataView = new DataView(arrayBuffer);
    
    // Read header information
    const numSignals = parseInt(new TextDecoder().decode(new Uint8Array(arrayBuffer.slice(252, 256))).trim());
    const numDataRecords = parseInt(new TextDecoder().decode(new Uint8Array(arrayBuffer.slice(236, 244))).trim());
    const durationOfDataRecord = parseFloat(new TextDecoder().decode(new Uint8Array(arrayBuffer.slice(244, 252))).trim());
    
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
    
    return signals;
  } catch (error) {
    console.error('Error reading EDF file:', error);
    throw error;
  }
}

// Create waves
const waves: THREE.Line[] = [];
const colors = [
  0xff0000, 0xff7f00, 0xffff00, 0x00ff00, 0x0000ff,
  0x4b0082, 0x9400d3, 0xff1493, 0x00ffff, 0xffffff
];

// Initialize visualization with EDF data
async function initializeVisualization() {
  try {
    const signals = await readEDFFile('/demo.edf');
    
    // Take only the configured number of channels
    const selectedSignals = signals.slice(0, DATA_CONFIG.numSources);
    
    // Create waves for each signal
    selectedSignals.forEach((signal, i) => {
      const decimatedData = decimateData(signal, DATA_CONFIG.maxPointsPerWave);
      
      const points: THREE.Vector3[] = [];
      const xOffset = -9; // Start from left side
      const yOffset = 4 - (i * (8 / DATA_CONFIG.numSources)); // Scale vertical spacing based on numSources

      decimatedData.forEach((value, index) => {
        const x = (index / decimatedData.length) * 18 + xOffset; // Scale x to fit view
        const y = (value / 32768) * DATA_CONFIG.amplitudeScale + yOffset; // Apply amplitude scaling
        points.push(new THREE.Vector3(x, y, 0));
      });

      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({ 
        color: colors[i % colors.length],
        linewidth: 1
      });
      
      const wave = new THREE.Line(geometry, material);
      waves.push(wave);
      scene.add(wave);
    });

    // Initial render
    renderer.render(scene, camera);
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
  renderer.render(scene, camera);
});

// Start visualization
initializeVisualization();