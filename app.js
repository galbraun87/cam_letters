// Global State Variables
let stream = null;
let activeBlob = null;
let activeFilename = "";
const letter = "א"; // Default letter, can be dynamically changed

// DOM Elements
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

// Initialize application on load
window.addEventListener("DOMContentLoaded", () => {
    initCamera();
    setupResizeHandler();
    setupUIEventListeners();
    requestAnimationFrame(draw);
});

/**
 * Camera Initialization
 * Targets the back-facing main wide-angle camera (1x) specifically.
 */
async function initCamera() {
    try {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }

        // Fetch all available media devices
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        
        let targetDeviceId = null;

        // Look for the standard back camera, avoiding ultra-wide or telephoto lenses
        if (videoDevices.length > 0) {
            // Priority 1: Match standard 'environment' label while filtering out auxiliary lenses
            const mainBackCamera = videoDevices.find(device => {
                const label = device.label.toLowerCase();
                return label.includes('back') && 
                      !label.includes('ultra') && 
                      !label.includes('wide') && 
                      !label.includes('tele');
            });

            // Priority 2: Fallback to any back/environment camera if specific labels aren't clear
            const genericBackCamera = videoDevices.find(device => 
                device.label.toLowerCase().includes('back') || 
                device.label.toLowerCase().includes('environment')
            );

            targetDeviceId = mainBackCamera ? mainBackCamera.deviceId : (genericBackCamera ? genericBackCamera.deviceId : videoDevices[0].deviceId);
        }

        const constraints = {
            video: {
                deviceId: targetDeviceId ? { exact: targetDeviceId } : undefined,
                facingMode: targetDeviceId ? undefined : "environment",
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        };

        stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        video.setAttribute("playsinline", true);
        video.play();

    } catch (err) {
        console.error("Error accessing the camera: ", err);
        alert("Could not access the camera. Please check permissions.");
    }
}

/**
 * Canvas Resolution and DPI Scaling
 */
function setupResizeHandler() {
    function resizeCanvas() {
        const dpr = window.devicePixelRatio || 1;
        // Set actual canvas internal rendering resolution
        canvas.width = window.innerWidth * dpr;
        canvas.height = window.innerHeight * dpr;
        // Match CSS display parameters
        canvas.style.width = `${window.innerWidth}px`;
        canvas.style.height = `${window.innerHeight}px`;
    }
    
    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();
}

/**
 * Shared Draw Utilities - Operating entirely on pure, absolute pixel positions
 */
function drawCamera(context, renderWidth, renderHeight) {
    const vWidth = video.videoWidth;
    const vHeight = video.videoHeight;
    const videoRatio = vWidth / vHeight;
    const canvasRatio = renderWidth / renderHeight;

    let sx, sy, sWidth, sHeight;

    if (canvasRatio > videoRatio) {
        sWidth = vWidth;
        sHeight = vWidth / canvasRatio;
        sx = 0;
        sy = (vHeight - sHeight) / 2;
    } else {
        sHeight = vHeight;
        sWidth = vHeight * canvasRatio;
        sx = (vWidth - sWidth) / 2;
        sy = 0;
    }

    context.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, renderWidth, renderHeight);
}

function drawLetter(context, panelWidth, renderHeight) {
    // Dynamic size scaling matched directly against standard portrait canvas height tracking
    const computedFontSize = Math.floor(renderHeight * 0.85);

    context.font = `700 ${computedFontSize}px AndroidSystemFont, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineWidth = Math.max(4, Math.floor(renderHeight * 0.006)); // Scales outline stroke dynamically with resolution
    context.strokeStyle = "white";

    // Standard baseline text coordinates placed dead-center in the local panel workspace
    context.strokeText(letter, panelWidth / 2, renderHeight * 0.50);
}

/**
 * Continuous Live Feed Animation Loop
 */
function draw() {
    // Rely exclusively on internal render width/height coordinates 
    const totalWidth = canvas.width;
    const totalHeight = canvas.height;

    ctx.clearRect(0, 0, totalWidth, totalHeight);

    if (video.readyState >= 2) {
        // 1. Draw live feed backdrop stretching across full target canvas space
        drawCamera(ctx, totalWidth, totalHeight);

        // 2. Translate focus and isolation matrix to the right half-screen coordinate partition
        ctx.save();
        ctx.translate(totalWidth / 2, 0); 
        
        // Pass the half-screen box dimensions explicitly
        drawLetter(ctx, totalWidth / 2, totalHeight);  
        ctx.restore();
    }
    requestAnimationFrame(draw);
}

/**
 * Snapshot Capture and Side-by-Side Image Stitching Logic
 */
function capture() {
    const liveRenderWidth = canvas.width;
    const liveRenderHeight = canvas.height;

    // Create a temporary layout canvas doubling the internal resolution width
    const stitchCanvas = document.createElement("canvas");
    stitchCanvas.width = liveRenderWidth * 2;
    stitchCanvas.height = liveRenderHeight;
    const stitchCtx = stitchCanvas.getContext("2d");

    // PANEL 1: Left Side Stitch (Raw Image View)
    stitchCtx.save();
    drawCamera(stitchCtx, liveRenderWidth, liveRenderHeight); 
    stitchCtx.restore();

    // PANEL 2: Right Side Stitch (Image View + Trace Outline Overlay)
    stitchCtx.save();
    stitchCtx.translate(liveRenderWidth, 0); // Translate exactly one full frame block over
    drawCamera(stitchCtx, liveRenderWidth, liveRenderHeight);        
    
    // Pass identical frame block measurements to match live sizing logic perfectly
    drawLetter(stitchCtx, liveRenderWidth, liveRenderHeight);        
    stitchCtx.restore();

    activeFilename = `hebrew_trace_${getTimestamp()}.jpg`;

    // Process high-resolution blob data and reveal view overlay container
    stitchCanvas.toBlob((blob) => {
        if (!blob) return;
        activeBlob = blob;
        const previewImg = document.getElementById("previewImage");
        previewImg.src = URL.createObjectURL(blob);
        document.getElementById("previewOverlay").style.display = "flex";
    }, "image/jpeg", 0.95);
}

/**
 * UI Event Handlers and Helpers
 */
function setupUIEventListeners() {
    const captureBtn = document.getElementById("captureBtn");
    if (captureBtn) {
        captureBtn.addEventListener("click", capture);
    }

    const closePreviewBtn = document.getElementById("closePreviewBtn");
    if (closePreviewBtn) {
        closePreviewBtn.addEventListener("click", () => {
            document.getElementById("previewOverlay").style.display = "none";
        });
    }

    const saveBtn = document.getElementById("saveBtn");
    if (saveBtn) {
        saveBtn.addEventListener("click", () => {
            if (!activeBlob) return;
            const link = document.createElement("a");
            link.href = URL.createObjectURL(activeBlob);
            link.download = activeFilename;
            link.click();
        });
    }
}

function getTimestamp() {
    const now = new Date();
    return now.toISOString().replace(/[:.]/g, "-");
}
