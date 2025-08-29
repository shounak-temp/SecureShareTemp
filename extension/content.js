console.log('SecureShare content script injected');

// Helper: Override getDisplayMedia to inject watermark
function overrideGetDisplayMedia(sessionId) {
  const orig = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getDisplayMedia = async function(constraints) {
    const stream = await orig(constraints);
    try {
      // Watermark injection (invisible pixel)
      const videoTrack = stream.getVideoTracks()[0];
      const { width, height } = videoTrack.getSettings();
      if (width && height) {
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext('2d');
        const watermark = `WM-${sessionId}-${Date.now()}`;
        ctx.font = '1px Arial';
        ctx.fillStyle = 'rgba(0,0,0,0.001)';
        ctx.fillText(watermark, 0, 1);
        // Optionally, draw canvas to stream for persistent watermark
      }
      // Notify background to trigger native capture
      chrome.runtime.sendMessage({ type: 'screen_share_started', sessionId });
    } catch (e) {
      console.warn('Watermark injection failed:', e);
    }
    return stream;
  };
}

// On load, get sessionId and override getDisplayMedia
chrome.storage.local.get('sessionId', ({ sessionId }) => {
  if (sessionId) {
    overrideGetDisplayMedia(sessionId);
    console.log('SecureShare: getDisplayMedia overridden with watermark');
  } else {
    console.warn('SecureShare: No sessionId found in storage');
  }
});

// Listen for direct capture requests (from popup or background)
chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  if (msg.type === 'manual_capture') {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      // Optionally, capture a frame and send to background
      sendResponse({ success: true });
    } catch (err) {
      sendResponse({ success: false, error: err.message });
    }
    return true;
  }
});