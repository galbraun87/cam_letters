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
 * Targets the back-facing main wide-angle camera (1x) specifically.
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

            targetDeviceId = mainBackCamera ? mainBackCamera.deviceId : (genericBackCamera ? genericBackCamera.deviceId : videoDevices.deviceId);
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
    context.direction = "ltr"; // Sets target rendering baseline bounds direction
    context.font = `700 ${computedFontSize}px AndroidSystemFont, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineWidth = Math.max(4, Math.floor(renderHeight * 0.006)); 
    context.strokeStyle = "white";

    // CRITICAL FIX: Prepending the Left-to-Right marker (\u200E) strips dynamic 
    // RTL character offset anomalies across mobile layouts completely.
    const baselineText = "\u200E" + letter;

    // Standard baseline text coordinates placed dead-center in the local panel workspace
    context.strokeText(baselineText, panelWidth / 2, renderHeight * 0.50);
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
        // 1. Draw live background across the entire canvas space
        drawCamera(ctx, totalWidth, totalHeight);

        // 2. Right Half-Screen Isolation Box
        ctx.save();
        
        // Translate coordinates directly to the middle line of the screen
        const halfWidthPixels = totalWidth / 2;
        ctx.translate(halfWidthPixels, 0); 
        
        // Draws inside the relative width boundaries of the right box
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

    // PANEL 1: Left side raw camera capture view
    stitchCtx.save();
    drawCamera(stitchCtx, liveRenderWidth, liveRenderHeight); 
    stitchCtx.restore();

    // PANEL 2: Right side layout overlay trace view
    stitchCtx.save();
    stitchCtx.translate(liveRenderWidth, 0); 
    drawCamera(stitchCtx, liveRenderWidth, liveRenderHeight);        
    
    // In stitch mode, total panel drawing bounds is exactly liveRenderWidth
    drawLetter(stitchCtx, liveRenderWidth, liveRenderHeight);        
    stitchCtx.restore();

    activeFilename = `hebrew_trace_${getTimestamp()}.jpg`;

    stitchCanvas.toBlob((blob) => {
        if (!blob) return;
        activeBlob = blob;
        
        const previewImg = document.getElementById("previewImage");
        if (previewImg) {
            previewImg.src = URL.createObjectURL(blob);
        }
        
        const overlay = document.getElementById("previewOverlay");
        if (overlay) {
            overlay.style.display = "flex";
        }
    }, "image/jpeg", 0.95);
}

/**
 * UI Event Handlers linked directly to index.html IDs
 */
function setupUIEventListeners() {
    const captureBtn = document.getElementById("captureBtn");
    if (captureBtn) {
        captureBtn.addEventListener("click", (e) => {
            e.preventDefault();
            capture();
        });
    }

    const cancelBtn = document.getElementById("cancelBtn");
    if (cancelBtn) {
        cancelBtn.addEventListener("click", (e) => {
            e.preventDefault();
            const overlay = document.getElementById("previewOverlay");
            if (overlay) overlay.style.display = "none";
        });
    }

    const downloadBtn = document.getElementById("downloadBtn");
    if (downloadBtn) {
        downloadBtn.addEventListener("click", (e) => {
            e.preventDefault();
            if (!activeBlob) return;
            const link = document.createElement("a");
            link.href = URL.createObjectURL(activeBlob);
            link.download = activeFilename;
            link.click();
        });
    }

    const shareBtn = document.getElementById("shareBtn");
    if (shareBtn) {
        shareBtn.addEventListener("click", async (e) => {
            e.preventDefault();
            if (!activeBlob) return;
            
            if (!navigator.share) {
                alert("Web Share API is not supported on this browser context. Use the save download option instead.");
                return;
            }
            
            try {
                const file = new File([activeBlob], activeFilename, { type: "image/jpeg" });
                await navigator.share({
                    files: [file],
                    title: "Hebrew Trace Canvas Capture",
                    text: "Check out my written character trace work!"
                });
            } catch (err) {
                console.error("Share failed:", err);
            }
        });
    }
}

function getTimestamp() {
    const now = new Date();
    return now.toISOString().replace(/[:.]/g, "-");
}
