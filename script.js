const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');

const statusText = document.getElementById('status-text');
const distText = document.getElementById('dist-text');

const toggle3d = document.getElementById('toggle-3d');
const sliderCalib = document.getElementById('slider-calib');
const sliderScale = document.getElementById('slider-scale');
const valCalib = document.getElementById('val-calib');
const valScale = document.getElementById('val-scale');

let speechEnabled = false;
let lastSpeechCategory = "";
let lastSpeechTime = 0;

// 更新 UI 數值顯示
sliderCalib.addEventListener('input', (e) => { valCalib.innerText = e.target.value; });
sliderScale.addEventListener('input', (e) => { valScale.innerText = e.target.value; });

function initSpeech() {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        let msg = new SpeechSynthesisUtterance("Voice prompt enabled");
        msg.lang = "en-US";
        msg.pitch = 1.0;
        msg.rate = 1.0;
        window.speechSynthesis.speak(msg);

        speechEnabled = true;
        const btn = document.getElementById('speech-btn');
        btn.style.backgroundColor = "#0d6efd";
        btn.innerText = "✅ Voice prompt is ready";
    }
}

function speakText(text, category) {
    if (!speechEnabled || !('speechSynthesis' in window)) return;
    let currentTime = Date.now() / 1000;
    if (category !== lastSpeechCategory || (currentTime - lastSpeechTime) >= 3.0) {
        lastSpeechCategory = category;
        lastSpeechTime = currentTime;

        window.speechSynthesis.cancel();
        let msg = new SpeechSynthesisUtterance(text);
        msg.lang = "en-US";
        msg.pitch = 1.0;
        msg.rate = 1.0;
        window.speechSynthesis.speak(msg);
    }
}

// 初始化 MediaPipe Pose
const pose = new Pose({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
});

pose.setOptions({
    modelComplexity: 0,
    smoothLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

pose.onResults(onPoseResults);

const camera = new Camera(videoElement, {
    onFrame: async () => {
        await pose.send({ image: videoElement });
    },
    width: 640,
    height: 480
});
camera.start();

function onPoseResults(results) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // 繪製鏡像攝影機畫面
    canvasCtx.scale(-1, 1);
    canvasCtx.drawImage(results.image, -canvasElement.width, 0, canvasElement.width, canvasElement.height);
    canvasCtx.restore();

    const w = canvasElement.width;
    const h = canvasElement.height;

    let use3d = toggle3d.checked;
    let calibRatio = parseFloat(sliderCalib.value);
    let scaleFactor = parseFloat(sliderScale.value);
    let minTarget = 30.0;
    let maxTarget = 32.0;

    let currentDistCm = 0.0;
    let statusStr = "No detection human body";
    let statusCategory = "NO_HUMAN";
    let lineColor = "#c8c8c8";

    if (results.poseLandmarks) {
        const landmarks = results.poseLandmarks;

        // 左右眼與左右拇指索引 (MediaPipe Pose Landmarks)
        // LEFT_EYE: 2, RIGHT_EYE: 5, LEFT_THUMB: 21, RIGHT_THUMB: 22 (約略對應)
        const leftEye = landmarks[2];
        const rightEye = landmarks[5];
        const leftThumb = landmarks[21];
        const rightThumb = landmarks[22];

        const eyeMidX = (leftEye.x + rightEye.x) / 2 * w;
        const eyeMidY = (leftEye.y + rightEye.y) / 2 * h;
        const thumbMidX = (leftThumb.x + rightThumb.x) / 2 * w;
        const thumbMidY = (leftThumb.y + rightThumb.y) / 2 * h;

        let rawDistCm = 0.0;

        if (use3d && results.poseWorldLandmarks) {
            const wl = results.poseWorldLandmarks;
            const lEyeW = wl[2], rEyeW = wl[5];
            const lThumbW = wl[21], rThumbW = wl[22];

            const eyeWId = { x: (lEyeW.x + rEyeW.x)/2, y: (lEyeW.y + rEyeW.y)/2, z: (lEyeW.z + rEyeW.z)/2 };
            const thumbWId = { x: (lThumbW.x + rThumbW.x)/2, y: (lThumbW.y + rThumbW.y)/2, z: (lThumbW.z + rThumbW.z)/2 };

            let distMeters = Math.sqrt(
                Math.pow(eyeWId.x - thumbWId.x, 2) +
                Math.pow(eyeWId.y - thumbWId.y, 2) +
                Math.pow(eyeWId.z - thumbWId.z, 2)
            );
            rawDistCm = distMeters * 100.0;
        } else {
            let pixelDist = Math.hypot(eyeMidX - thumbMidX, eyeMidY - thumbMidY);
            rawDistCm = pixelDist * scaleFactor;
        }

        currentDistCm = rawDistCm * calibRatio;
        let displayOverlayText = "";

        if (minTarget <= currentDistCm && currentDistCm <= maxTarget) {
            statusStr = "Pass";
            statusCategory = "PASS";
            displayOverlayText = "PASS";
            lineColor = "#00ff00";
            speakText("Pass", "PASS");
        } else if (currentDistCm < minTarget) {
            let diff = minTarget - currentDistCm;
            statusStr = `Please move further ${diff.toFixed(1)} cm`;
            statusCategory = "TOO_CLOSE";
            displayOverlayText = `TOO CLOSE (-${diff.toFixed(1)}cm)`;
            lineColor = "#ff0000";
            speakText("Please move back", "TOO_CLOSE");
        } else {
            let diff = currentDistCm - maxTarget;
            statusStr = `Please move closer ${diff.toFixed(1)} cm`;
            statusCategory = "TOO_FAR";
            displayOverlayText = `TOO FAR (+${diff.toFixed(1)}cm)`;
            lineColor = "#ff0000";
            speakText("Please move closer", "TOO_FAR");
        }

        // 畫點與連線
        canvasCtx.fillStyle = "#00ffff";
        canvasCtx.beginPath(); canvasCtx.arc(eyeMidX, eyeMidY, 8, 0, 2 * Math.PI); canvasCtx.fill();
        canvasCtx.fillStyle = "#ffff00";
        canvasCtx.beginPath(); canvasCtx.arc(thumbMidX, thumbMidY, 8, 0, 2 * Math.PI); canvasCtx.fill();

        canvasCtx.strokeStyle = lineColor;
        canvasCtx.lineWidth = 4;
        canvasCtx.beginPath();
        canvasCtx.moveTo(eyeMidX, eyeMidY);
        canvasCtx.lineTo(thumbMidX, thumbMidY);
        canvasCtx.stroke();

        // 畫文字覆蓋
        canvasCtx.font = "bold 20px Arial";
        canvasCtx.fillStyle = lineColor;
        canvasCtx.fillText(`${currentDistCm.toFixed(1)} cm \vert{}${displayOverlayText}`, 20, 40);

    } else {
        canvasCtx.strokeStyle = "#00ffff";
        canvasCtx.lineWidth = 2;
        canvasCtx.strokeRect(30, 30, w - 60, h - 60);
        canvasCtx.font = "bold 18px Arial";
        canvasCtx.fillStyle = "#00ffff";
        canvasCtx.fillText("PLEASE ENTER FRAME (CENTER YOURSELF)", 50, 70);
        statusCategory = "NO_HUMAN";
    }

    // 更新介面數值
    statusText.innerText = statusStr;
    distText.innerText = `${currentDistCm.toFixed(1)} cm`;
}