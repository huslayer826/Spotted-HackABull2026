const bannerStatus = document.querySelector("#bannerStatus");
const statusDetail = document.querySelector("#statusDetail");
const trackCount = document.querySelector("#trackCount");
const cameraState = document.querySelector("#cameraState");
const classifierState = document.querySelector("#classifierState");
const modeText = document.querySelector("#modeText");
const modePill = document.querySelector("#modePill");
const updatedAt = document.querySelector("#updatedAt");
const clock = document.querySelector("#clock");
const refreshButton = document.querySelector("#refreshButton");
const browserFeed = document.querySelector("#browserFeed");
const viewerCanvas = document.querySelector("#viewerCanvas");
const viewerEmpty = document.querySelector("#viewerEmpty");
const feedSource = document.querySelector("#feedSource");
const feedState = document.querySelector("#feedState");

const viewerContext = viewerCanvas.getContext("2d");
const captureCanvas = document.createElement("canvas");
const captureContext = captureCanvas.getContext("2d");

let browserCameraError = "";
let latestDetections = [];
let latestFrameWidth = 0;
let latestFrameHeight = 0;
let analysisInFlight = false;
let previewReady = false;
const browserCameraId = "camera-01";

function formatTimestamp(iso) {
  if (!iso) return "No frame processed yet";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    month: "short",
    day: "2-digit"
  }).format(date);
}

function setBannerTone(banner) {
  bannerStatus.classList.remove("is-warn", "is-amber");
  if (banner.includes("concealment") || banner.includes("shoplifting") || banner.includes("unavailable")) {
    bannerStatus.classList.add("is-warn");
  } else if (banner.includes("tracking")) {
    bannerStatus.classList.add("is-amber");
  }
}

function resizeViewerCanvas() {
  const rect = viewerCanvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(rect.width * ratio));
  const height = Math.max(1, Math.round(rect.height * ratio));

  if (viewerCanvas.width !== width || viewerCanvas.height !== height) {
    viewerCanvas.width = width;
    viewerCanvas.height = height;
  }
}

function getCoverLayout(sourceWidth, sourceHeight, targetWidth, targetHeight) {
  const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const offsetX = (targetWidth - drawWidth) / 2;
  const offsetY = (targetHeight - drawHeight) / 2;
  return { scale, drawWidth, drawHeight, offsetX, offsetY };
}

function drawOverlayBox(detection, layout) {
  const x = detection.x1 * layout.scale + layout.offsetX;
  const y = detection.y1 * layout.scale + layout.offsetY;
  const width = (detection.x2 - detection.x1) * layout.scale;
  const height = (detection.y2 - detection.y1) * layout.scale;
  const kind = detection.kind || "person";
  const palette =
    kind === "concealment" || kind === "concealment-person"
      ? { stroke: "#ff5c57", fill: "rgba(255, 92, 87, 0.16)" }
      : kind === "item"
        ? { stroke: "#ffc857", fill: "rgba(255, 200, 87, 0.14)" }
        : { stroke: "#5cf2a6", fill: "rgba(92, 242, 166, 0.14)" };
  const lineWidth = Math.max(3, layout.scale * 3);
  const cornerLength = Math.max(16, Math.min(width, height) * 0.18);

  viewerContext.fillStyle = palette.fill;
  viewerContext.fillRect(x, y, width, height);

  viewerContext.strokeStyle = palette.stroke;
  viewerContext.lineWidth = lineWidth;
  viewerContext.strokeRect(x, y, width, height);

  viewerContext.beginPath();
  viewerContext.moveTo(x, y + cornerLength);
  viewerContext.lineTo(x, y);
  viewerContext.lineTo(x + cornerLength, y);

  viewerContext.moveTo(x + width - cornerLength, y);
  viewerContext.lineTo(x + width, y);
  viewerContext.lineTo(x + width, y + cornerLength);

  viewerContext.moveTo(x + width, y + height - cornerLength);
  viewerContext.lineTo(x + width, y + height);
  viewerContext.lineTo(x + width - cornerLength, y + height);

  viewerContext.moveTo(x + cornerLength, y + height);
  viewerContext.lineTo(x, y + height);
  viewerContext.lineTo(x, y + height - cornerLength);
  viewerContext.stroke();
}

function renderLoop() {
  resizeViewerCanvas();
  viewerContext.clearRect(0, 0, viewerCanvas.width, viewerCanvas.height);

  if (previewReady && browserFeed.videoWidth > 0 && browserFeed.videoHeight > 0) {
    const videoLayout = getCoverLayout(
      browserFeed.videoWidth,
      browserFeed.videoHeight,
      viewerCanvas.width,
      viewerCanvas.height
    );
    viewerContext.drawImage(
      browserFeed,
      videoLayout.offsetX,
      videoLayout.offsetY,
      videoLayout.drawWidth,
      videoLayout.drawHeight
    );

    viewerContext.fillStyle = "rgba(3, 8, 6, 0.22)";
    viewerContext.fillRect(0, 0, viewerCanvas.width, viewerCanvas.height);

    const overlaySourceWidth = latestFrameWidth || browserFeed.videoWidth;
    const overlaySourceHeight = latestFrameHeight || browserFeed.videoHeight;
    const overlayLayout = getCoverLayout(
      overlaySourceWidth,
      overlaySourceHeight,
      viewerCanvas.width,
      viewerCanvas.height
    );
    for (const detection of latestDetections) {
      drawOverlayBox(detection, overlayLayout);
    }
  }

  requestAnimationFrame(renderLoop);
}

async function analyzeCurrentFrame() {
  if (!previewReady || analysisInFlight || browserFeed.videoWidth === 0) return;

  analysisInFlight = true;
  try {
    captureCanvas.width = 960;
    captureCanvas.height = Math.max(
      1,
      Math.round((browserFeed.videoHeight / browserFeed.videoWidth) * captureCanvas.width)
    );
    captureContext.drawImage(browserFeed, 0, 0, captureCanvas.width, captureCanvas.height);
    const blob = await new Promise((resolve) =>
      captureCanvas.toBlob(resolve, "image/jpeg", 0.92)
    );

    if (!blob) {
      throw new Error("Could not encode video frame.");
    }

    const response = await fetch("/analyze_frame", {
      method: "POST",
      headers: {
        "Content-Type": "image/jpeg",
        "X-Camera-Id": browserCameraId
      },
      body: blob
    });
    if (!response.ok) {
      throw new Error(`Frame analysis failed: ${response.status}`);
    }

    const data = await response.json();
    latestDetections = Array.isArray(data.detections) ? data.detections : [];
    latestFrameWidth = Number(data.frame_width || 0);
    latestFrameHeight = Number(data.frame_height || 0);
    const concealmentCount = latestDetections.filter(
      (detection) => detection.kind === "concealment" || detection.kind === "concealment-person"
    ).length;
    feedState.textContent =
      concealmentCount > 0
        ? `${concealmentCount} concealment alerts`
        : `${latestDetections.length} detections`;
  } catch (error) {
    browserCameraError = error.message;
    feedState.textContent = "analysis error";
  } finally {
    analysisInFlight = false;
  }
}

async function refreshStatus() {
  const response = await fetch("/status", { cache: "no-store" });
  if (!response.ok) throw new Error(`Status request failed: ${response.status}`);
  const data = await response.json();

  const banner = String(data.banner || "unknown").replace(/-/g, " ");
  bannerStatus.textContent = previewReady ? banner || "live" : "booting";
  statusDetail.textContent =
    browserCameraError ||
    (previewReady
      ? "Live webcam preview with browser-side overlay rendering is active."
      : "Starting browser webcam preview.");

  trackCount.textContent = String(data.active_tracks ?? latestDetections.length);
  cameraState.textContent = String(data.camera || "unknown");
  classifierState.textContent = String(data.classifier || "offline");
  modeText.textContent = data.mode || "unknown";
  modePill.textContent = data.mode || "unknown";
  updatedAt.textContent = formatTimestamp(data.updated_at);
  setBannerTone(banner);
}

async function startBrowserPreview() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });

    browserFeed.srcObject = stream;
    browserFeed.muted = true;
    browserFeed.playsInline = true;

    await new Promise((resolve) => {
      if (browserFeed.readyState >= 1) {
        resolve();
        return;
      }
      browserFeed.onloadedmetadata = () => resolve();
    });

    await browserFeed.play();
    previewReady = true;
    browserCameraError = "";
    viewerEmpty.classList.add("is-hidden");
    feedSource.textContent = "camera 01 · browser live preview + overlay";
    feedState.textContent = `${browserFeed.videoWidth || 0}x${browserFeed.videoHeight || 0} live`;
  } catch (error) {
    previewReady = false;
    viewerEmpty.classList.remove("is-hidden");
    feedSource.textContent = "camera 01 · browser preview failed";
    feedState.textContent = "camera error";
    browserCameraError = `Browser camera error: ${error.name || "unknown"}${error.message ? ` - ${error.message}` : ""}`;
    statusDetail.textContent = browserCameraError;
    bannerStatus.textContent = "browser preview failed";
    bannerStatus.classList.add("is-warn");
  }
}

async function restartBrowserPreview() {
  const stream = browserFeed.srcObject;
  if (stream) {
    for (const track of stream.getTracks()) {
      track.stop();
    }
  }

  latestDetections = [];
  previewReady = false;
  browserFeed.srcObject = null;
  viewerEmpty.classList.remove("is-hidden");
  await startBrowserPreview();
}

function tickClock() {
  clock.textContent = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date());
}

refreshButton.addEventListener("click", restartBrowserPreview);
window.addEventListener("resize", resizeViewerCanvas);

setInterval(tickClock, 1000);
tickClock();
setInterval(() => {
  refreshStatus().catch((error) => {
    bannerStatus.textContent = "backend offline";
    bannerStatus.classList.add("is-warn");
    statusDetail.textContent = error.message;
  });
}, 900);
setInterval(() => {
  analyzeCurrentFrame();
}, 300);

requestAnimationFrame(renderLoop);
startBrowserPreview();
refreshStatus().catch(() => {});
