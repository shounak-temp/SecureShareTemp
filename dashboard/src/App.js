import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';

const BACKEND_URL = 'http://localhost:3000';

function App() {
  const [sessionId, setSessionId] = useState('');
  const [status, setStatus] = useState('Inactive');
  const [anomalies, setAnomalies] = useState(0);
  const [screenshots, setScreenshots] = useState([]);

  useEffect(() => {
    if (!sessionId) return;
    const socket = io(BACKEND_URL);
    socket.on('anomaly', (data) => {
      if (data.sessionId === sessionId) {
        setAnomalies((a) => a + (data.overlays ? data.overlays.length : 1));
        setScreenshots((prev) => [...prev, data]);
      }
    });
    return () => socket.disconnect();
  }, [sessionId]);

  const createSession = async () => {
    const resp = await fetch(`${BACKEND_URL}/create-session`, { method: 'POST' });
    const data = await resp.json();
    setSessionId(data.sessionId);
    setStatus('Active');
    setAnomalies(0);
    setScreenshots([]);
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>SecureShare Interview Dashboard</h2>
      <button onClick={createSession}>Create Session</button>
      {sessionId && (
        <>
          <div>
            <b>Share with candidate:</b> <a href={`http://localhost:3000/install?sessionId=${sessionId}`}>{`http://localhost:3000/install?sessionId=${sessionId}`}</a>
          </div>
          <div>Status: {status}</div>
          <div>Anomalies: {anomalies}</div>
          <div>
            <h4>Screenshots with overlays:</h4>
            {screenshots.map((s, i) => (
              <div key={i}>
                <img src={`data:image/png;base64,${s.screenshot}`} alt="screenshot" width={200} />
                <div>Overlays: {JSON.stringify(s.overlays)}</div>
                <div>Time: {new Date(s.timestamp).toLocaleTimeString()}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default App;
