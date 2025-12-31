<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import * as L from 'leaflet';
import html2canvas from 'html2canvas';


// IMPORTANT: When using module imports, the CSS must be imported as well.
import 'leaflet/dist/leaflet.css';

// --- TYPES ---
interface Coordinate {
  lat: number;
  lng: number;
  timestamp: number;
  isManual?: boolean;
}

// --- REACTIVE VARIABLES ---
const recordedPath = ref<Coordinate[]>([]);
const isRecording = ref(false);
const message = ref('');

// Use ReturnType<typeof L.map> / L.polyline to avoid referencing namespace exports
// directly (works around duplicate type-declarations and avoids incorrect
// "Namespace 'leaflet' has no exported member 'Map'" errors when
// @types/leaflet is present alongside Leaflet's bundled types).
let map: ReturnType<typeof L.map> | null = null;
let pathLayer: ReturnType<typeof L.polyline> | null = null;
let watchId: number | null = null;

let startMarker: ReturnType<typeof L.marker> | null = null;
let endMarker: ReturnType<typeof L.marker> | null = null;
let manualMarkers: ReturnType<typeof L.marker>[] = [];


// --- UTILITY FUNCTIONS ---
/**
 * Calculates the distance between two coordinates in meters (Haversine formula).
 */
const getDistance = (c1: Coordinate, c2: Coordinate): number => {
  const R = 6371e3; // metres
  const φ1 = c1.lat * Math.PI / 180;
  const φ2 = c2.lat * Math.PI / 180;
  const Δφ = (c2.lat - c1.lat) * Math.PI / 180;
  const Δλ = (c2.lng - c1.lng) * Math.PI / 180;

  // Haversine formula
  const a = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

/**
 * Updates the Leaflet map's path and markers.
 */
const updateMapPath = (isFinal = false) => {
  // Now we just check for map availability; L is imported.
  if (!map) return;

  // Convert reactive coordinates to Leaflet LatLng format
  const latlngs = recordedPath.value.map(c => [c.lat, c.lng]);

  // Update path layer
  if (pathLayer) {
    pathLayer.setLatLngs(latlngs);
  } else if (latlngs.length) {
    pathLayer = L.polyline(latlngs, { color: '#1e40af', weight: 5, opacity: 0.8 }).addTo(map);
  }

  // Set map view to the last recorded point
  if (latlngs.length) {
    map.setView(latlngs[latlngs.length-1], map.getZoom() < 14 ? 14 : map.getZoom());
  }

  // Remove old markers (but not the path polyline)
  if (startMarker) {
    map.removeLayer(startMarker);
    startMarker = null;
  }
  if (endMarker) {
    map.removeLayer(endMarker);
    endMarker = null;
  }
  manualMarkers.forEach(m => map.removeLayer(m));
  manualMarkers = [];


  if (latlngs.length) {
    const start = recordedPath.value[0];
    const end = recordedPath.value[recordedPath.value.length-1];

    if (!start || !end) return; 

    // Define icons using L.divIcon
    const createIcon = (htmlContent: string, className: string) => L.divIcon({ 
        html: `<div class="marker ${className}">${htmlContent}</div>`, 
        className: `custom-${className}`, 
        iconSize:[36,36], 
        iconAnchor:[25,25] 
    });

    const startIcon = createIcon('S', 'start-marker');
    const endIcon = createIcon('E', isFinal ? 'end-marker-final' : 'end-marker-active');
    const manualIcon = createIcon('+', 'manual-marker');

    // Start Marker
    L.marker([start.lat, start.lng], { icon: startIcon }).addTo(map);

    // End Marker
    if (latlngs.length > 1) {
      L.marker([end.lat, end.lng], { icon: endIcon }).addTo(map);
    }

    // Manual markers
    recordedPath.value.forEach(c => {
      if (c.isManual) {
        L.marker([c.lat,c.lng], { icon: manualIcon }).addTo(map);
      }
    });
  }
};

/**
 * Filters and records a new coordinate.
 */
const recordCoordinate = (pos: GeolocationPosition, isManual: boolean = false) => {
  const newCoord: Coordinate = { 
    lat: pos.coords.latitude, 
    lng: pos.coords.longitude, 
    timestamp: Date.now(), 
    isManual 
  };
  const lastCoord = recordedPath.value[recordedPath.value.length-1];

  // Outlier Filtering Logic
  if (lastCoord && !isManual) {
    const timeDiff = (newCoord.timestamp - lastCoord.timestamp)/1000;
    const distanceMeters = getDistance(lastCoord, newCoord);
    const speed = distanceMeters / timeDiff;
    
    // Discard if computed speed is > 50 m/s (180 km/h) AND distance is significant
    if (speed > 50 && distanceMeters > 50) {
      message.value = 'Skipped GPS outlier';
      return;
    }
  }

  recordedPath.value.push(newCoord);
  message.value = isManual ? 'Manual marker dropped' : 'Path recorded';
  updateMapPath();
};

// --- BUTTON HANDLERS ---
/**
 * START button functionality: Starts watching the GPS position.
 */
const startTracking = () => {
  if (isRecording.value) return;

  // Clear previous state
  recordedPath.value = [];
  if (pathLayer) { map?.removeLayer(pathLayer); pathLayer = null; }

  if (navigator.geolocation) {
    watchId = navigator.geolocation.watchPosition(
      (pos) => recordCoordinate(pos, false),
      (err) => { 
        console.error('Geolocation Error:', err); 
        message.value = `Geolocation error: ${err.message}`; 
      }, 
      { enableHighAccuracy:true, timeout:5000, maximumAge:0 }
    );
    isRecording.value = true;
    message.value = 'Tracking started. Recording path...';
  } else {
    message.value = 'Geolocation not supported by this browser.';
  }
};

/**
 * STOP button functionality: Stops GPS tracking and takes a screenshot.
 */

const freezeLeaflet = (mapEl: HTMLElement) => {
  // Disable CSS transforms by adding a class
  mapEl.classList.add("leaflet-freeze");

  // Force Leaflet to redraw everything without transforms
  (map as any)._leaflet_pos = null;
};

const freezeMap = () => {
  if (!map) return;
  map.dragging.disable();
  map.touchZoom.disable();
  map.doubleClickZoom.disable();
  map.scrollWheelZoom.disable();
  map.boxZoom.disable();
  map.keyboard.disable();
};

const restoreLeaflet = (mapEl: HTMLElement) => {
  mapEl.classList.remove("leaflet-freeze");
};

const unfreezeMap = () => {
  if (!map) return;
  map.dragging.enable();
  map.touchZoom.enable();
  map.doubleClickZoom.enable();
  map.scrollWheelZoom.enable();
  map.boxZoom.enable();
  map.keyboard.enable();
};

 
const stopAndScreenshot = () => {
  if (!isRecording.value) { message.value='Tracking not running'; return; }
  
  // Clear geolocation watch
  if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
  isRecording.value = false;
  message.value = 'Tracking stopped. Preparing screenshot...';
  
  updateMapPath(true); // Finalize map state (make end marker final color)

  nextTick(async () => {
  const mapEl = document.getElementById("map-container");
  if (!mapEl) {
    message.value = "Screenshot failed: Map element not found.";
    return;
  }

  freezeMap();
  freezeLeaflet(mapEl);

  // Allow Leaflet to settle
  await new Promise((resolve) => setTimeout(resolve, 150));

  html2canvas(mapEl, {
    backgroundColor: "#ffffff",
    useCORS: true,
  })
    .then((canvas) => {
      restoreLeaflet(mapEl);
      unfreezeMap();

      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      link.download = `path_${Date.now()}.png`;
      link.click();

      message.value = "Tracking stopped. Screenshot saved.";
    })
    .catch((err) => {
      console.error("Screenshot error:", err);
      restoreLeaflet(mapEl);
      unfreezeMap();
      message.value = "Screenshot failed during capture.";
    });
});



};



/**
 * (+) button functionality: Drops a manual marker at the current location.
 */
const dropMarker = () => {
  if (!isRecording.value) {
    message.value = "Start tracking first to drop a marker.";
    return;
  }

  // If we already have a last known coordinate — use it immediately
  const last = recordedPath.value[recordedPath.value.length - 1];
  if (last) {
    recordCoordinate(
      {
        coords: {
          latitude: last.lat,
          longitude: last.lng,
          accuracy: 0,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      } as GeolocationPosition,
      true
    );
    return;
  }

  // Otherwise, fall back to GPS call
  navigator.geolocation.getCurrentPosition(
    pos => recordCoordinate(pos, true),
    err => {
      console.error("Marker Geolocation Error:", err);
      message.value = `Marker error: ${err.message}`;
    },
    { enableHighAccuracy: true, timeout: 5000 }
  );
};


// --- LIFECYCLE ---
onMounted(() => {
  // Temporary default center while fetching real position (KL)
  const fallbackLat = 3.1390, fallbackLng = 101.6869;

  map = L.map("map-container").setView([fallbackLat, fallbackLng], 13);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  message.value = "Detecting your current location...";

  // Now request the user's real current location
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        // Move map to user's real location
        map!.setView([lat, lng], 15);

        // Optional: Add a small marker at initial location
        L.marker([lat, lng]).addTo(map!);

        message.value = "Location detected. Click START to begin tracking.";
      },
      (err) => {
        console.error("Geolocation error:", err);
        message.value = "Unable to access location. Using default map center.";
      },
      { enableHighAccuracy: true, timeout: 5000 }
    );
  } else {
    message.value =
      "Geolocation not supported. Using default map center (KL).";
  }
});


onUnmounted(() => {
  // Cleanup GPS tracking
  if (watchId!==null) navigator.geolocation.clearWatch(watchId);
  // Cleanup map instance
  map?.remove();
});

// Expose to template
defineExpose({ startTracking, stopAndScreenshot, dropMarker });
</script>

<template>
  <div class="gps-tracker-container">
    <h1 class="component-title">Task 1: GPS Path Tracker</h1>
    
    <!-- Map Container -->
    <div id="map-container" class="map-style">
      <!-- Map will be initialized here -->
    </div>

    <!-- Controls and Status -->
    <div class="controls-container">
      
      <!-- Status Message -->
      <div class="status-message">{{ message }}</div>
      
      <!-- Buttons -->
      <div class="button-group">
        <button 
          @click="startTracking" 
          :disabled="isRecording"
          class="control-button start-button"
          :class="{'button-disabled': isRecording}"
        >
          START
        </button>
        
        <button 
          @click="dropMarker" 
          :disabled="!isRecording"
          class="control-button marker-button"
          :class="{'button-disabled': !isRecording}"
        >
          +
        </button>

        <button 
          @click="stopAndScreenshot" 
          :disabled="!isRecording"
          class="control-button stop-button"
          :class="{'button-disabled': !isRecording}"
        >
          STOP
        </button>
      </div>
    </div>
    
  </div>
</template>

<style scoped>
/* Main Container */
.gps-tracker-container {
    padding: 24px;
    background-color: #ffffff;
    border-radius: 12px;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
    /* width: 100%; */
    /* margin: 0 auto; */
}

.component-title {
    font-size: 1.5rem;
    font-weight: 700;
    color: #1f2937;
    margin-bottom: 16px;
    border-bottom: 1px solid #e5e7eb;
    padding-bottom: 8px;
}

/* Map Styling */
.map-style {
    /* width: 100%; */
    border-radius: 12px;
    box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.06);
    margin-bottom: 16px;
    height: 500px;
    z-index: 1; 
}

/* Controls and Status */
.controls-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
}

@media (min-width: 768px) {
    .controls-container {
        flex-direction: row;
        justify-content: space-between;
        gap: 0;
    }
}

.status-message {
    font-size: 0.875rem;
    font-weight: 500;
    padding: 12px 0px;
    border-radius: 12px;
    width: 100%;
    text-align: center;
    background-color: #f3f4f6;
    color: #4b5563;
    overflow-wrap: break-word;
}

@media (min-width: 768px) {
    .status-message {
        width: auto;
    }
}

.button-group {
    display: flex;
    gap: 12px;
    width: 100%;
}

@media (min-width: 768px) {
    .button-group {
        width: auto;
    }
}

.control-button {
    flex: 1;
    padding: 12px 20px;
    color: white;
    font-weight: 600;
    border: none;
    border-radius: 12px;
    transition: all 0.2s ease-in-out;
    cursor: pointer;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    transform: translateZ(0);
}

.control-button:hover:not(.button-disabled) {
    transform: scale(1.02);
    box-shadow: 0 6px 10px rgba(0, 0, 0, 0.15);
}


.start-button {
    background-color: #10b981;
}
.start-button:hover:not(.button-disabled) {
    background-color: #059669;
}

.stop-button {
    background-color: #ef4444;
}
.stop-button:hover:not(.button-disabled) {
    background-color: #dc2626;
}

.marker-button {
    flex-grow: 0; 
    background-color: #f59e0b;
}
.marker-button:hover:not(.button-disabled) {
    background-color: #d97706;
}

.button-disabled {
    background-color: #9ca3af !important;
    cursor: not-allowed;
    box-shadow: none;
    transform: none;
}

/* Custom Marker Styles (S, E, +) - Target the inner div defined in L.divIcon */
.marker {
    color: white;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    font-size: 1rem;
    border-radius: 50%;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);
}
.start-marker { background-color: #10b981; } 
.end-marker-final { background-color: #ef4444; } 
.end-marker-active { background-color: #3b82f6;
animation: pulse 2s infinite; } 
.manual-marker { background-color: #f59e0b; } 

.leaflet-freeze .leaflet-pane,
.leaflet-freeze .leaflet-marker-pane,
.leaflet-freeze .leaflet-shadow-pane,
.leaflet-freeze .leaflet-overlay-pane,
.leaflet-freeze .leaflet-tile,
.leaflet-freeze .leaflet-tile-container {
  transform: none !important;
}


@keyframes pulse {
    0% {
        box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7);
    }
    70% {
        box-shadow: 0 0 0 10px rgba(59, 130, 246, 0);
    }
    100% {
        box-shadow: 0 0 0 0 rgba(59, 130, 246, 0);
    }
}
</style>