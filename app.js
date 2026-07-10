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

// FIX 1: Strict camera track constraints tailored for mobile Chrome engines
const constraints = {
    video: {
        // Enforces fallback standard camera rules if permission queries are masked
        facingMode: { exact: "environment" }, 
        // Forces Chrome on Android to use the primary 1x lens instead of ultra-wide tracks
        zoom: { ideal: 1.0 },                 
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
        console.warn("Strict camera fallback path initiated:", err);
        // Secondary softer fallback configuration if 'exact' environment causes a failure
        navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" } },
            audio: false
        })
        .then(stream => { video.srcObject = stream; video.play(); })
        .catch(e => console.error("Camera completely failed:", e));
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

// FIX 2: Universal camera rendering math that takes a specific customWidth parameter safely
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

// FIX 3: Centers the tracing outline exactly over whatever width bounding box is passed to it
function drawLetter(context, customWidth = null){
    const w = customWidth || window.innerWidth;
    const h = canvas.height / (window.devicePixelRatio || 1); 
    
    const computedFontSize = Math.floor(h * 0.85);

    context.font = `700 ${computedFontSize}px AndroidSystemFont, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineWidth = 12; // Thicker border profile matching your reference screenshots
    context.strokeStyle = "white";

    context.strokeText(letter, w / 2, h * 0.48);
}

// FIX 4: Complete rewriting of the live viewing engine loop to explicitly create side-by-side squares
function draw(){
    const w = window.innerWidth;
    const h = canvas.height / (window.devicePixelRatio || 1);
    ctx.clearRect(0, 0, w, h);

    if(video.readyState >= 2){
        // Slice your smartphone screen into two perfectly identical panel partitions
        const singlePanelWidth = w / 2;

        // Render Left Side (Camera Stream Only)
        ctx.save();
        drawCamera(ctx, singlePanelWidth);
        ctx.restore();

        // Render Right Side (Camera Stream shifted over + Letter Trace Bounds)
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

// FIX 5: Synchronized snapshot generation layout engine matching the half-width live view bounds
function capture() {
    const singleWidth = window.innerWidth / 2; 
    const h = canvas.height / (window.devicePixelRatio || 1);
    const dpr = window.devicePixelRatio || 1;

    const stitchCanvas = document.createElement("canvas");
    
    stitchCanvas.width = window.innerWidth * dpr;
    stitchCanvas.height = h * dpr;
    const stitchCtx = stitchCanvas.getContext("2d");

    // --- SNAPSHOT RENDER LEFT SIDE ---
    stitchCtx.save();
    stitchCtx.scale(dpr, dpr);
    drawCamera(stitchCtx, singleWidth); 
    stitchCtx.restore();

    // --- SNAPSHOT RENDER RIGHT SIDE ---
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
