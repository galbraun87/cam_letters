const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

let activeBlob = null;
let activeFilename = "";
let letter = "א";

function getLetter() {
    const params = new URLSearchParams(window.location.search);
    const urlLetter = params.get("letter");
    if (urlLetter) { letter = urlLetter; }
}
getLetter();

// CAMERA FIX: Loop through hardware devices to ignore 'wide' or 'ultra' lenses
async function initStandardCamera() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        
        let selectedDeviceId = null;
        
        const standardBackCamera = videoDevices.find(device => {
            const label = device.label.toLowerCase();
            return (label.includes('back') || label.includes('rear') || label.includes('environment')) && 
                   !label.includes('wide') && !label.includes('ultra') && !label.includes('tele');
        });

        if (standardBackCamera) {
            selectedDeviceId = standardBackCamera.deviceId;
        } else if (videoDevices.length > 0) {
            selectedDeviceId = videoDevices[videoDevices.length - 1].deviceId;
        }

        const constraints = {
            video: selectedDeviceId ? {
                deviceId: { exact: selectedDeviceId },
                width: { ideal: 1280 }, height: { ideal: 720 }, aspectRatio: { ideal: 1.7777777778 }
            } : {
                facingMode: { ideal: "environment" },
                width: { ideal: 1280 }, height: { ideal: 720 }, aspectRatio: { ideal: 1.7777777778 }
            },
            audio: false
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        video.play();
    } catch (err) {
        console.error("Camera setup failed: ", err);
    }
}
initStandardCamera();

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        const tracks = video.srcObject?.getTracks();
        if (tracks && tracks.length > 0 && tracks[0].readyState === "ended") {
            initStandardCamera();
        }
    }
});

function resize(){
    const displayHeight = window.innerHeight; 
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = displayHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);
resize();

function drawCamera(context, customWidth = null){
    const w = customWidth || window.innerWidth; 
    const h = canvas.height / (window.devicePixelRatio || 1);
    const vw = video.videoWidth;
    const vh = video.videoHeight;

    if (!vw || !vh) return;

    const scale = Math.max(w / vw, h / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    const dx = (w - dw) / 2;
    const dy = (h - dh) / 2;

    context.drawImage(video, dx, dy, dw, dh);
}

function drawLetter(context, targetWidth = null){
    const w = targetWidth || window.innerWidth;
    const h = canvas.height / (window.devicePixelRatio || 1); 
    const computedFontSize = Math.floor(h * 0.85);

    context.font = `700 ${computedFontSize}px AndroidSystemFont, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineWidth = 12; 
    context.strokeStyle = "white";

    context.strokeText(letter, w / 2, h * 0.48);
}

// LIVE VIEW FIX: Forces live loop to be split into two panels matching the snapshot
function draw(){
    const w = window.innerWidth;
    const h = canvas.height / (window.devicePixelRatio || 1);
    ctx.clearRect(0, 0, w, h);

    if(video.readyState >= 2){
        const singlePanelWidth = w / 2;

        ctx.save();
        drawCamera(ctx, singlePanelWidth);
        ctx.restore();

        ctx.save();
        ctx.translate(singlePanelWidth, 0);
        drawCamera(ctx, singlePanelWidth);
        drawLetter(ctx, singlePanelWidth);
        ctx.restore();
    }
    requestAnimationFrame(draw);
}

if (document.fonts && document.fonts.load) {
    document.fonts.load("700 16px AndroidSystemFont").then(() => {
        if (video.readyState >= 2) draw(); else video.addEventListener("loadeddata", draw);
    }).catch(err => {
        if (video.readyState >= 2) draw(); else video.addEventListener("loadeddata", draw);
    });
} else {
    video.addEventListener("loadeddata", draw);
}

function capture() {
    const singleWidth = window.innerWidth / 2; 
    const h = canvas.height / (window.devicePixelRatio || 1);
    const dpr = window.devicePixelRatio || 1;

    const stitchCanvas = document.createElement("canvas");
    stitchCanvas.width = window.innerWidth * dpr;
    stitchCanvas.height = h * dpr;
    const stitchCtx = stitchCanvas.getContext("2d");

    stitchCtx.save();
    stitchCtx.scale(dpr, dpr);
    drawCamera(stitchCtx, singleWidth); 
    stitchCtx.restore();

    stitchCtx.save();
    stitchCtx.translate(singleWidth * dpr, 0); 
    stitchCtx.scale(dpr, dpr);
    drawCamera(stitchCtx, singleWidth); 
    drawLetter(stitchCtx, singleWidth);
    stitchCtx.restore();

    activeFilename = `hebrew_trace_${getTimestamp()}.jpg`;

    stitchCanvas.toBlob((blob) => {
        if (!blob) return;
        activeBlob = blob;
        document.getElementById("previewImage").src = URL.createObjectURL(blob);
        document.getElementById("previewOverlay").style.display = "flex";
    }, "image/jpeg", 0.92);
}

function closePreview() {
    document.getElementById("previewOverlay").style.display = "none";
    if (activeBlob) {
        URL.revokeObjectURL(document.getElementById("previewImage").src);
        activeBlob = null;
    }
}

function downloadDirectly() {
    if (!activeBlob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(activeBlob);
    a.download = activeFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function getTimestamp() {
    const now = new Date();
    return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
}

async function shareCapturedImage() {
    if (!activeBlob) return;
    const file = new File([activeBlob], activeFilename, { type: "image/jpeg" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({ files: [file], title: 'Hebrew Trace Capture' });
        } catch (err) { console.error(err); }
    } else {
        alert("Sharing is not supported.");
    }
}

// Modern event binding replaces old onclick layout rules safely
document.getElementById("captureBtn").addEventListener("click", capture);
document.getElementById("shareBtn").addEventListener("click", shareCapturedImage);
document.getElementById("downloadBtn").addEventListener("click", downloadDirectly);
document.getElementById("cancelBtn").addEventListener("click", closePreview);
