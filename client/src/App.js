/**
 * SIGNATURE INJECTION ENGINE - FRONTEND
 * 
 * React app for PDF rendering and signature placement
 */

import React, { useState, useEffect } from 'react';
import PDFEditor from './components/PDFEditor';
import './App.css';

function App() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Check backend availability
    fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/health`)
      .then(res => res.json())
      .then(data => {
        console.log('Backend health:', data);
        setIsReady(true);
      })
      .catch(err => {
        console.error('Backend unavailable:', err);
        setIsReady(false);
      });
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Signature Injection Engine</h1>
        <p>Pixel-perfect PDF signature placement</p>
        <div className={`status ${isReady ? 'ready' : 'not-ready'}`}>
          {isReady ? '✓ Backend Connected' : '✗ Backend Disconnected'}
        </div>
      </header>

      <main className="app-main">
        {isReady ? (
          <PDFEditor />
        ) : (
          <div className="error-state">
            <h2>Backend Service Unavailable</h2>
            <p>Ensure the backend server is running on port 5000</p>
            <code>npm run server</code>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
