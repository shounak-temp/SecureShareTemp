document.addEventListener('DOMContentLoaded', () => {
  const saveBtn = document.getElementById('saveSession');
  const testBtn = document.getElementById('testSession');
  const sessionInput = document.getElementById('sessionId');
  const statusDiv = document.getElementById('status');

  saveBtn.addEventListener('click', () => {
    const sessionId = sessionInput.value.trim();
    if (sessionId) {
      chrome.runtime.sendMessage({ type: 'set_session_id', sessionId }, (resp) => {
        statusDiv.textContent = resp && resp.success ? 'Session ID saved!' : 'Failed to save.';
      });
    }
  });

  testBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'test_native_capture' }, (resp) => {
      statusDiv.textContent = resp && resp.ok ? 'Native capture triggered.' : 'Failed.';
    });
  });
});