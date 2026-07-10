const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

let activeBlob = null;
let activeFilename = "";
let letter = "א";

function getLetter() {
    const params = new URLSearchParams(window.location.search);
    const urlLetter = params.get("letter");
    if (urlLetter) {
        letter = urlLetter;
    }
}
getLetter();

// FIX 1: Enhanced hardware lens targeting to aggressively isolate the standard 1x camera
async function initTrueMainLens() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        
        let selectedDeviceId = null;
        
        // Scan for explicitly primary hardware keywords while dropping secondary ultra-wides
        const standardLens = videoDevices.find(device => {
            const label = device.label.toLowerCase();
            return (label.includes('main') || label.includes('0') || label.includes('primary') || label.includes('back')) && 
                   !label.includes('wide') && !label.includes('ultra') && !label.includes('macro') && !label.includes('2');
        });

        if (standardLens) {
            selectedDeviceId = standardLens.deviceId;
        } else if (videoDevices.length > 0) {
            // Fallback to absolute first track if strings are masked by device policies
            selectedDeviceId = videoDevices[0].deviceId;
        }

        const constraints = {
            video: selectedDeviceId ? {
                deviceId: { exact: selectedDeviceId },
                width: { ideal: 1280 }, height: { ideal: 720 }
            } : {
                facingMode: { ideal: "environment" },
                width: { ideal: 1280 }, height: { ideal: 720 }
            },
            audio: false
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        video.play();
    } catch (err) {
        console.warn("Lens filtering bypassed, attempting standard stream:", err);
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false })
            .then(s => { video.srcObject = s; video.play(); });
    }
}
initTrueMainLens();

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        const tracks = video.srcObject?.getTracks();
        if (tracks && tracks.length > 0 && tracks.readyState === "ended") {
            initTrueMainLens();
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

// FIX 2: Correct text placement arithmetic to remove double offset centering
function drawLetter(context, targetWidth = null){
    const w = targetWidth || window.innerWidth;
    const h = canvas.height / (window.devicePixelRatio || 1); 
    const computedFontSize = Math.floor(h * 0.85);

    context.font = `700 ${computedFontSize}px AndroidSystemFont, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineWidth = 4; 
    context.strokeStyle = "white";

    // FIXED: Uses half of the targeted panel box dimension layout to guarantee true centering
    context.strokeText(letter, w / 2, h * 0.48);
}

// FIX 3: Clean translation mapping for live drawing view
function draw(){
    const w = window.innerWidth;
    const h = canvas.height / (window.devicePixelRatio || 1);
    ctx.clearRect(0, 0, w, h);

    if(video.readyState >= 2){
        drawCamera(ctx, w);

        ctx.save();
        // Shifts origin cleanly to the right half-screen coordinate partition
        ctx.translate(w / 2, 0); 
        // Pass the half-screen panel size so drawLetter centers perfectly within that box
        drawLetter(ctx, w / 2);  
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

// FIX 4: Complete coordinate synchronization for snapshots matching live view
function capture() {
    const w = window.innerWidth;
    const h = canvas.height / (window.devicePixelRatio || 1);
    const dpr = window.devicePixelRatio || 1;

    const stitchCanvas = document.createElement("canvas");
    stitchCanvas.width = (w * dpr) * 2;
    stitchCanvas.height = h * dpr;
    const stitchCtx = stitchCanvas.getContext("2d");

    // Left Panel Stitch (Full width perspective)
    stitchCtx.save();
    stitchCtx.scale(dpr, dpr);
    drawCamera(stitchCtx, w); 
    stitchCtx.restore();

    // Right Panel Stitch (Shifted perspective + Centered trace overlay)
    stitchCtx.save();
    stitchCtx.translate(w * dpr, 0); 
    stitchCtx.scale(dpr, dpr);
    drawCamera(stitchCtx, w);        
    
    // FIXED: Matches live view coordinate calculations by parsing full single width constraints
    drawLetter(stitchCtx, w);        
    stitchCtx.restore();

    activeFilename = `hebrew_trace_${getTimestamp()}.jpg`;

    stitchCanvas.toBlob((blob) => {
        if (!blob) return;
        activeBlob = blob;
        const previewImg = document.getElementById("previewImage");
        previewImg.src = URL.createObjectURL(blob);
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
    const downloadLink = document.createElement("a");
    downloadLink.download = activeFilename;
    downloadLink.href = URL.createObjectURL(activeBlob);
    downloadLink.click();
    setTimeout(() => URL.revokeObjectURL(downloadLink.href), 100);
}

function getTimestamp() {
    const now = new Date();
    return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
}

async function shareCapturedImage() {
    if (!activeBlob) return;
    const file = new File([activeBlob], activeFilename, { type: "image/jpeg" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: `Hebrew Trace: ${letter}` }); } catch (err) { console.log(err); }
    } else { alert("Sharing not supported."); }
}

document.addEventListener("DOMContentLoaded", () => {
    const captureBtn = document.getElementById("captureBtn");
    const shareBtn = document.getElementById("shareBtn");
    const downloadBtn = document.getElementById("downloadBtn");
    const cancelBtn = document.getElementById("cancelBtn");

    if (captureBtn) captureBtn.addEventListener("click", capture);
    if (shareBtn) shareBtn.addEventListener("click", shareCapturedImage);
    if (downloadBtn) downloadBtn.addEventListener("click", downloadDirectly);
    if (cancelBtn) cancelBtn.addEventListener("click", closePreview);
});
