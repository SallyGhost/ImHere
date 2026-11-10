import { apiRequest } from "./api.js";

const QR_CODE_SCRIPT = "https://cdn.jsdelivr.net/npm/qrcode@1.5.4/build/qrcode.min.js";
let qrCodeLibrary;

function loadQrCodeLibrary() {
  if (window.QRCode) return Promise.resolve(window.QRCode);
  if (!qrCodeLibrary) {
    qrCodeLibrary = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = QR_CODE_SCRIPT;
      script.async = true;
      script.onload = () => window.QRCode ? resolve(window.QRCode) : reject(new Error("QR library did not load"));
      script.onerror = () => reject(new Error("Could not load the QR image library"));
      document.head.append(script);
    });
  }
  return qrCodeLibrary;
}

export async function showLessonQr({ lessonId, canvas, countdown, onError = () => {} }) {
  const qrCode = await loadQrCodeLibrary();
  let stopped = false;
  let refreshing = false;
  let validUntil = 0;
  let serverOffset = 0;
  let currentSlot = null;
  let retryAt = 0;

  async function refresh() {
    if (stopped || refreshing) return;
    refreshing = true;
    try {
      const result = await apiRequest(
        `/api/qr/lessons/${encodeURIComponent(lessonId)}/token`,
      );
      await qrCode.toCanvas(canvas, JSON.stringify(result.token), {
        width: 280,
        margin: 2,
        errorCorrectionLevel: "M",
      });
      currentSlot = result.token.timeSlot;
      validUntil = result.validUntil;
      serverOffset = result.serverTime - Date.now();
      retryAt = 0;
      onError(null);
    } catch (error) {
      retryAt = Date.now() + 3000;
      onError(error);
    } finally {
      refreshing = false;
    }
  }

  await refresh();
  const timer = window.setInterval(() => {
    const serverNow = Date.now() + serverOffset;
    const secondsLeft = Math.max(0, Math.ceil((validUntil - serverNow) / 1000));
    if (countdown) countdown.textContent = `${secondsLeft} с`;
    if (validUntil && serverNow >= validUntil) {
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
      currentSlot = null;
    }
    if ((!validUntil || currentSlot === null) && Date.now() >= retryAt) {
      void refresh();
    }
  }, 500);

  return () => {
    stopped = true;
    window.clearInterval(timer);
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    if (countdown) countdown.textContent = "";
  };
}
