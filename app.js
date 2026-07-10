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

// 1. Safe Camera Track Initializer (Matches your working constraint rules)
const constraints = {
    video: {
        facingMode: { ideal: "environment" }, 
        width: { ideal: 1280 },
        height: { ideal: 720 },
        aspectRatio: { ideal: 1.7777777778 } 
    },
    audio: false
};

navigator.mediaDevices.getUserMedia(constraints)
    .then((stream) => {
        video.srcObject = stream;
        video.play();
    })
    .catch((err) => {
        console.error("Camera connection failed:", err);
    });

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        const tracks = video.srcObject?.getTracks();
        if (tracks && tracks.length > 0 && tracks[0].readyState === "ended") {
            navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: "environment" } },
                audio: false
            })
            .then(stream => {
                video.srcObject = stream;
                video.onloadedmetadata = () => {
                    video.play().catch(err => console.error("Video play failed:", err));
                };
            })
            .catch(err => console.error("Camera reinitialization error:", err));
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

// FIXED: Restores the live screen to one continuous wide background frame
function draw(){
    const w = window.innerWidth;
    const h = canvas.height / (window.devicePixelRatio || 1);
    ctx.clearRect(0, 0, w, h);

    if(video.readyState >= 2){
        // Draw one unbroken background across the whole screen width
        drawCamera(ctx, w);

        // Shift ONLY the letter vector drawing origin to the right half-screen box
        ctx.save();
        ctx.translate(w / 2, 0); 
        drawLetter(ctx, w / 2);  
        ctx.restore();
    }
    requestAnimationFrame(draw);
}

if (document.fonts && document.fonts.load) {
    document.fonts.load("700 16px AndroidSystemFont").then(() => {
        if (video.readyState >= 2) {
            draw();
        } else {
            video.addEventListener("loadeddata", draw);
        }
    }).catch(err => {
        console.error("Font trace loop mismatch:", err);
        if (video.readyState >= 2) draw(); else video.addEventListener("loadeddata", draw);
    });
} else {
    video.addEventListener("loadeddata", draw);
}

// FIXED: Generates a perfectly matched side-by-side snapshot file when clicked
function capture() {
    const w = window.innerWidth;
    const h = canvas.height / (window.devicePixelRatio || 1);
    const dpr = window.devicePixelRatio || 1;

    const stitchCanvas = document.createElement("canvas");
    
    // Canvas is double-wide to fit the side-by-side layout panels perfectly
    stitchCanvas.width = (w * dpr) * 2;
    stitchCanvas.height = h * dpr;
    const stitchCtx = stitchCanvas.getContext("2d");

    // --- LEFT STITCH PANEL (Raw Image View Only) ---
    stitchCtx.save();
    stitchCtx.scale(dpr, dpr);
    drawCamera(stitchCtx, w); 
    stitchCtx.restore();

    // --- RIGHT STITCH PANEL (Image View + Outline) ---
    stitchCtx.save();
    stitchCtx.translate(w * dpr, 0); 
    stitchCtx.scale(dpr, dpr);
    drawCamera(stitchCtx, w);        
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
        try {
            await navigator.share({
                files: [file],
                title: `Hebrew Trace: ${letter}`,
                text: 'Side-by-side composition snapshot trace.'
            });
        } catch (err) {
            console.log("Share canceled:", err);
        }
    } else {
        alert("Sharing sheet interface is blocked or unsupported in this context.");
    }
}

// FIXED: Binds functions safely using modern listeners to bridge file module boundaries
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
