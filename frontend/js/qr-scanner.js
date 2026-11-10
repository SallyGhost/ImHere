import { apiRequest } from "./api.js";
import { apiErrorMessage, showNotice } from "./utils.js";

const SCANNER_SCRIPT = "https://unpkg.com/@zxing/browser@0.2.1";
let scannerLibrary;

function loadScannerLibrary() {
  if (window.ZXingBrowser?.BrowserQRCodeReader) return Promise.resolve(window.ZXingBrowser);
  if (!scannerLibrary) {
    scannerLibrary = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SCANNER_SCRIPT;
      script.async = true;
      script.onload = () => window.ZXingBrowser?.BrowserQRCodeReader
        ? resolve(window.ZXingBrowser)
        : reject(new Error("QR scanner library did not load"));
      script.onerror = () => reject(new Error("Could not load the QR scanner library"));
      document.head.append(script);
    });
  }
  return scannerLibrary;
}

function parseToken(text) {
  let token;
  try {
    token = JSON.parse(text);
  } catch {
    throw new Error("This QR code is not an ImHere attendance token");
  }
  if (
    token === null || typeof token !== "object" || token.version !== 1 ||
    typeof token.lessonId !== "string" || !Number.isSafeInteger(token.timeSlot) ||
    typeof token.signature !== "string" || !/^[0-9a-f]{64}$/i.test(token.signature)
  ) {
    throw new Error("This QR code has an invalid format");
  }
  return token;
}

export async function listQrCameras() {
  const ZXingBrowser = await loadScannerLibrary();
  const reader = new ZXingBrowser.BrowserQRCodeReader();
  return reader.listVideoInputDevices();
}

export async function startQrScanner({ elementId, deviceId, onResult = () => {}, onError = () => {} }) {
  if (!window.isSecureContext) {
    const error = new Error("Camera access requires HTTPS (localhost is allowed for development)");
    onError(error);
    throw error;
  }
  const ZXingBrowser = await loadScannerLibrary();
  const host = document.getElementById(elementId);
  if (!host) throw new Error(`QR scanner element '${elementId}' was not found`);
  const video = host instanceof HTMLVideoElement ? host : document.createElement("video");
  video.playsInline = true;
  video.setAttribute("aria-label", "QR code camera preview");
  if (video !== host) host.replaceChildren(video);
  const reader = new ZXingBrowser.BrowserQRCodeReader();
  let submitting = false;
  let stopped = false;
  let lastAttemptedText = null;
  let lastAttemptAt = 0;

  let controls;
  controls = await reader.decodeFromConstraints(
    { video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "environment" } },
    video,
    async (result, error) => {
      if (!result) {
        if (error && !String(error).includes("NotFoundException")) onError(error);
        return;
      }
      const decodedText = result.getText();
      if (submitting || stopped) return;
      if (decodedText === lastAttemptedText && Date.now() - lastAttemptAt < 8000) return;
      submitting = true;
      lastAttemptedText = decodedText;
      lastAttemptAt = Date.now();
      try {
        const token = parseToken(decodedText);
        const result = await apiRequest("/api/attendance/qr", {
          method: "POST",
          body: { token },
        });
        controls.stop();
        stopped = true;
        video.srcObject = null;
        onResult(result);
      } catch (error) {
        onError(error);
      } finally {
        submitting = false;
      }
    },
  );

  return async () => {
    if (stopped) return;
    stopped = true;
    controls.stop();
    video.srcObject = null;
  };
}

export function initScanPage() {
  const notice = document.getElementById("scan-message");
  const startButton = document.getElementById("camera-start");
  const stopButton = document.getElementById("camera-stop");
  const cameraChoice = document.getElementById("camera-choice");
  const host = document.getElementById("scanner");
  let stopScanner = null;
  const finish = (result) => {
    void stopScanner?.();
    const status = result?.error?.code === "ALREADY_ATTENDED" ? "duplicate" : result?.success ? "success" : "error";
    window.location.assign(`./attendance-confirm.html?result=${status}`);
  };
  const submitToken = async (token) => {
    try {
      const result = await apiRequest("/api/attendance/qr", { method: "POST", body: { token } });
      finish(result);
    } catch (error) {
      if (error?.code === "ALREADY_ATTENDED") { finish(error); return; }
      showNotice(notice, apiErrorMessage(error));
    }
  };

  if (window.isSecureContext) {
    void listQrCameras().then((cameras) => {
      if (!cameras.length) return;
      cameraChoice.innerHTML = cameras.map((camera, index) => `<option value="${camera.deviceId}">${camera.label || `Камера ${index + 1}`}</option>`).join("");
      const rearCamera = cameras.find((camera) => /back|rear|environment|задн/i.test(camera.label));
      if (rearCamera) cameraChoice.value = rearCamera.deviceId;
    }).catch(() => {});
  }

  startButton.addEventListener("click", async () => {
    startButton.disabled = true;
    showNotice(notice, "Запрашиваем доступ к камере…", "warning");
    try {
      stopScanner = await startQrScanner({
        elementId: "scanner",
        deviceId: cameraChoice.value || undefined,
        onResult: () => { window.location.assign("./attendance-confirm.html?result=success"); },
        onError: (error) => showNotice(notice, apiErrorMessage(error)),
      });
      stopButton.disabled = false;
      showNotice(notice, "Наведите камеру на QR-код. После успешной отметки камера остановится.", "success");
    } catch (error) {
      startButton.disabled = false;
      showNotice(notice, apiErrorMessage(error));
    }
  });
  stopButton.addEventListener("click", async () => {
    await stopScanner?.(); stopScanner = null; host.replaceChildren();
    stopButton.disabled = true; startButton.disabled = false;
    showNotice(notice, "Камера остановлена.", "warning");
  });
  document.getElementById("manual-token-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const raw = new FormData(event.currentTarget).get("token").trim();
    try {
      const token = JSON.parse(raw);
      showNotice(notice, "Проверяем токен на сервере…", "warning");
      await submitToken(token);
    } catch (error) {
      showNotice(notice, error instanceof SyntaxError ? "Введите содержимое QR в формате JSON." : apiErrorMessage(error));
    }
  });
  window.addEventListener("pagehide", () => void stopScanner?.(), { once: true });
}
