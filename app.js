// Global State Variables
let stream = null;
let activeBlob = null;
let activeFilename = "";
let letter = "א"; // Default fallback letter

// DOM Elements
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

// Initialize application on load
window.addEventListener("DOMContentLoaded", () => {
    readLetterFromUrl();
    initCamera();
    setupResizeHandler();
    setupUIEventListeners();
    requestAnimationFrame(draw);
});

/**
 * Parses the URL parameters to dynamically extract the target letter.
 */
function readLetterFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const urlLetter = urlParams.get('letter');
    if (urlLetter) {
        letter = decodeURIComponent(urlLetter);
    }
}

/**
 * Camera Initialization
 */
async function initCamera() {
    try {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }

        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        
        let targetDeviceId = null;

        if (videoDevices.length > 0) {
            const mainBackCamera = videoDevices.find(device => {
                const label = device.label.toLowerCase();
                return label.includes('back') && 
                      !label.includes('ultra') && 
                      !label.includes('wide') && 
                      !label.includes('tele');
            });

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
function drawCamera(context, renderWidth, renderHeight) {
    const vWidth = video.videoWidth;
    const vHeight = video.videoHeight;
    if (!vWidth || !vHeight) return;

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
    const computedFontSize = Math.floor(renderHeight * 0.85);

    context.save(); 
    context.direction = "ltr"; 
    context.font = `700 ${computedFontSize}px AndroidSystemFont, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineWidth = Math.max(4, Math.floor(renderHeight * 0.006)); 
    context.strokeStyle = "white";

    // Draw perfectly centered in the panel coordinate bounding window
    context.strokeText(letter, panelWidth / 2, renderHeight * 0.50);
    context.restore(); 
}

/**
 * Continuous Live Feed Animation Loop
 */
function draw() {
    const totalWidth = canvas.width;
    const totalHeight = canvas.height;

    ctx.clearRect(0, 0, totalWidth, totalHeight);

    if (video.readyState >= 2) {
        // 1. Draw global backdrop
        drawCamera(ctx, totalWidth, totalHeight);

        // 2. Right Half-Screen Isolation Block
        ctx.save();
        
        // HORIZONTAL SHIFT FIX: Using absolute pixel math instead of relative view widths
        // completely locks down horizontal drift across different mobile screen densities.
        const halfWidthPixels = totalWidth / 2;
        ctx.translate(halfWidthPixels, 0); 
        
        drawLetter(ctx, halfWidthPixels, totalHeight);  
        ctx.restore();
    }
    requestAnimationFrame(draw);
}

/**
 * Snapshot Capture and Image Stitching Logic
 */
function capture() {
    const liveRenderWidth = canvas.width;
    const liveRenderHeight = canvas.height;

    const stitchCanvas = document.createElement("canvas");
    stitchCanvas.width = liveRenderWidth * 2;
    stitchCanvas.height = liveRenderHeight;
    const stitchCtx = stitchCanvas.getContext("2d");

    // Left Panel
    stitchCtx.save();
    drawCamera(stitchCtx, liveRenderWidth, liveRenderHeight); 
    stitchCtx.restore();

    // Right Panel
    stitchCtx.save();
    stitchCtx.translate(liveRenderWidth, 0); 
    drawCamera(stitchCtx, liveRenderWidth, liveRenderHeight);        
    drawLetter(stitchCtx, liveRenderWidth, liveRenderHeight);        
    stitchCtx.restore();

    activeFilename = `hebrew_trace_${getTimestamp()}.jpg`;

    stitchCanvas.toBlob((blob) => {
        if (!blob) return;
        activeBlob = blob;
        
        const previewImg = document.getElementById("previewImage") || document.querySelector("img[id*='preview']");
        if (previewImg) {
            previewImg.src = URL.createObjectURL(blob);
        }
        
        const overlay = document.getElementById("previewOverlay") || document.querySelector("div[id*='overlay']");
        if (overlay) {
            overlay.style.display = "flex";
        }
    }, "image/jpeg", 0.95);
}

/**
 * Robust UI Event Handlers
 */
function setupUIEventListeners() {
    // Fail-safe listeners: Try finding elements by raw ID first, falling back to substring selectors
    const captureBtn = document.getElementById("captureBtn") || document.querySelector("[id*='capture']");
    if (captureBtn) {
        captureBtn.onclick = (e) => { e.preventDefault(); capture(); };
    }

    const closePreviewBtn = document.getElementById("closePreviewBtn") || document.querySelector("[id*='close']");
    if (closePreviewBtn) {
        closePreviewBtn.onclick = (e) => {
            e.preventDefault();
            const overlay = document.getElementById("previewOverlay") || document.querySelector("div[id*='overlay']");
            if (overlay) overlay.style.display = "none";
        };
    }

    const saveBtn = document.getElementById("saveBtn") || document.querySelector("[id*='save']");
    if (saveBtn) {
        saveBtn.onclick = (e) => {
            e.preventDefault();
            if (!activeBlob) return;
            const link = document.createElement("a");
            link.href = URL.createObjectURL(activeBlob);
            link.download = activeFilename;
            link.click();
        };
    }
}

function getTimestamp() {
    const now = new Date();
    return now.toISOString().replace(/[:.]/g, "-");
}
