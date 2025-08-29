import { runtime } from 'webextension-polyfill';
import * as jose from 'jose';

let sessionId = null;
const serverUrl = 'http://localhost:3000';
let pingInterval;

chrome.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'install') {
    const url = new URL(runtime.getURL(''));
    sessionId = url.searchParams.get('sessionId');
    await chrome.storage.local.set({ sessionId });
    startPings();
    console.log('Extension installed, sessionId:', sessionId);
  }
});

function startPings() {
  if (pingInterval) clearInterval(pingInterval); // Prevent duplicate intervals
  pingInterval = setInterval(async () => {
    try {
      const { sessionId } = await chrome.storage.local.get('sessionId');
      if (!sessionId) {
        console.log('No sessionId, skipping ping');
        return;
      }
      const secret = new TextEncoder().encode('my_super_secret_12345');
      const token = await new jose.SignJWT({ sessionId })
        .setProtectedHeader({ alg: 'HS256' })
        .sign(secret);
      const response = await fetch(`${serverUrl}/ping`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) console.log(`Ping sent for session ${sessionId}`);
      else console.error('Ping failed with status:', response.status);
    } catch (err) {
      console.error('Ping error:', err);
    }
  }, 10000);
}

chrome.onSuspend.addListener(() => {
  if (pingInterval) clearInterval(pingInterval);
  console.log('Extension suspended');
});

const originalGetDisplayMedia = navigator.mediaDevices.getDisplayMedia;
navigator.mediaDevices.getDisplayMedia = async (constraints) => {
  const stream = await originalGetDisplayMedia(constraints);
  const videoTrack = stream.getVideoTracks()[0];
  const { width, height } = videoTrack.getSettings();
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const watermarkText = `WM-${Date.now()}`;
  ctx.font = '1px Arial';
  ctx.fillStyle = 'rgba(0,0,0,0.001)';
  ctx.fillText(watermarkText, 0, 1);

  chrome.sendNativeMessage('com.secureshare.native', { action: 'start_capture' })
    .then(response => {
      if (response.success) {
        sendToBackend({ type: 'validate', watermark: watermarkText, nativeData: response.data, screenshot: response.screenshot, hasOverlay: response.hasOverlay });
        console.log('Native capture response:', response);
      }
    }).catch(err => console.error('Native error:', err));
  
  return stream;
};

async function sendToBackend(data) {
  const { sessionId } = await chrome.storage.local.get('sessionId');
  data.sessionId = sessionId;
  const secret = new TextEncoder().encode('my_super_secret_12345');
  const token = await new jose.SignJWT(data)
    .setProtectedHeader({ alg: 'HS256' })
    .sign(secret);
  try {
    const res = await fetch(`${serverUrl}/validate`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const result = await res.json();
    if (result.anomaly) {
      chrome.sendMessage({ type: 'alert_anomaly', sessionId });
      console.log('Anomaly validated:', result);
    }
  } catch (err) {
    console.error('Backend error:', err);
  }
}

chrome.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'alert_anomaly') {
    console.log('Anomaly detected in tab:', sender.tab.id);
    alert('Anomaly detected! Check dashboard.');
  } else if (msg.type === 'set_session_id') {
    sessionId = msg.sessionId;
    chrome.storage.local.set({ sessionId });
    startPings();
    console.log('Session ID set to:', sessionId);
    sendResponse({ success: true });
  } else if (msg.type === 'test_capture') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'start_capture' }, (response) => {
          if (chrome.runtime.lastError) console.warn('Test failed:', chrome.runtime.lastError.message);
          else console.log('Test capture response:', response);
          sendResponse(response);
        });
      }
    });
    return true; // Async response
  }
});

let captureInterval = null;

// Listen for sessionId from popup or onboarding
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'set_session_id' && msg.sessionId) {
    sessionId = msg.sessionId;
    chrome.storage.local.set({ sessionId });
    sendResponse({ success: true });
  }

  // Trigger manual native capture (for testing)
  if (msg.type === 'test_native_capture') {
    triggerNativeCapture();
    sendResponse({ ok: true });
  }
});

// Listen for screen share start from content script
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'screen_share_started' && msg.sessionId) {
    sessionId = msg.sessionId;
    startNativeCaptureLoop();
  }
});

// Periodically request screenshots from native host
function startNativeCaptureLoop() {
  if (captureInterval) clearInterval(captureInterval);
  captureInterval = setInterval(triggerNativeCapture, 5000); // every 5s
}

function triggerNativeCapture() {
  if (!sessionId) return;
  const port = chrome.runtime.connectNative('com.secureshare.native');
  port.postMessage({ type: 'capture', sessionId });
  port.onMessage.addListener((response) => {
    if (response.screenshot) {
      // Send screenshot and overlay info to backend
      fetch('http://localhost:3000/screenshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          screenshot: response.screenshot,
          overlays: response.overlays || [],
          timestamp: Date.now()
        })
      });
    }
  });
  port.onDisconnect.addListener(() => {
    // Optionally, alert dashboard if native host is missing
  });
}

// Auto-uninstall after session ends (call this when appropriate)
function autoUninstall() {
  chrome.management.uninstallSelf();
}
