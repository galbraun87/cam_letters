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
        canvas.width = window.innerWidth * dpr;
        canvas.height = window.innerHeight * dpr;
        canvas.style.width = `${window.innerWidth}px`;
        canvas.style.height = `${window.innerHeight}px`;
    }
    
    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();
}

/**
 * Shared Draw Utilities
 */
function drawCamera(context, w) {
    const h = canvas.height / (window.devicePixelRatio || 1);
    
    // Calculate aspect ratios to create a 'cover' effect without stretching the feed
    const vWidth = video.videoWidth;
    const vHeight = video.videoHeight;
    const videoRatio = vWidth / vHeight;
    const canvasRatio = w / h;

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

    context.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, w, h);
}

function drawLetter(context, targetWidth = null) {
    // Falls back to full window width if no specific panel box width is provided
    const w = targetWidth || window.innerWidth;
    const h = canvas.height / (window.devicePixelRatio || 1); 
    const computedFontSize = Math.floor(h * 0.85);

    context.font = `700 ${computedFontSize}px AndroidSystemFont, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineWidth = 4; 
    context.strokeStyle = "white";

    // Draws the text exactly in the center of its designated width box
    context.strokeText(letter, w / 2, h * 0.48);
}

/**
 * Continuous Live Feed Animation Loop
 */
function draw() {
    const w = window.innerWidth;
    const h = canvas.height / (window.devicePixelRatio || 1);
    const dpr = window.devicePixelRatio || 1;

    ctx.clearRect(0, 0, w, h);

    if (video.readyState >= 2) {
        ctx.save();
        ctx.scale(dpr, dpr);

        // 1. Draw continuous video background across the whole window width
        drawCamera(ctx, w);

        // 2. Shift context to the right half-screen coordinate partition
        ctx.save();
        ctx.translate(w / 2, 0); 
        // Pass the half-screen size so the letter centers within that specific box
        drawLetter(ctx, w / 2);  
        ctx.restore();

        ctx.restore();
    }
    requestAnimationFrame(draw);
}

/**
 * Snapshot Capture and Image Stitching Logic
 */
function capture() {
    const w = window.innerWidth;
    const h = canvas.height / (window.devicePixelRatio || 1);
    const dpr = window.devicePixelRatio || 1;

    // Create a temporary canvas double the standard screen width for side-by-side output
    const stitchCanvas = document.createElement("canvas");
    stitchCanvas.width = (w * dpr) * 2;
    stitchCanvas.height = h * dpr;
    const stitchCtx = stitchCanvas.getContext("2d");

    // PANEL 1: Left Side Stitch (Raw Image View)
    stitchCtx.save();
    stitchCtx.scale(dpr, dpr);
    drawCamera(stitchCtx, w); 
    stitchCtx.restore();

    // PANEL 2: Right Side Stitch (Image View + Trace Outline Overlay)
    stitchCtx.save();
    stitchCtx.translate(w * dpr, 0); // Shift by one full high-res screen width
    stitchCtx.scale(dpr, dpr);
    drawCamera(stitchCtx, w);        
    
    // Pass 'w' so the absolute text position mirrors the live feed panel dimensions
    drawLetter(stitchCtx, w);        
    stitchCtx.restore();

    activeFilename = `hebrew_trace_${getTimestamp()}.jpg`;

    // Process output blob and display UI preview container
    stitchCanvas.toBlob((blob) => {
        if (!blob) return;
        activeBlob = blob;
        const previewImg = document.getElementById("previewImage");
        previewImg.src = URL.createObjectURL(blob);
        document.getElementById("previewOverlay").style.display = "flex";
    }, "image/jpeg", 0.92);
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
