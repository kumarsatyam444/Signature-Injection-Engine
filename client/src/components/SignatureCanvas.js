/**
 * SIGNATURE CANVAS COMPONENT
 * 
 * HTML5 Canvas for capturing digital signatures
 * Returns base64 PNG for transmission to backend
 */

import React, { useRef, useEffect, forwardRef } from 'react';
import '../styles/SignatureCanvas.css';

const SignatureCanvas = forwardRef(({ onCapture, onCancel, isSigning }, ref) => {
  const canvasRef = useRef(null);
  const isDrawingRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    
    // Set canvas size
    canvas.width = 500;
    canvas.height = 200;

    // Set background to white
    context.fillStyle = 'white';
    context.fillRect(0, 0, canvas.width, canvas.height);

    // Add border
    context.strokeStyle = '#ccc';
    context.lineWidth = 1;
    context.strokeRect(0, 0, canvas.width, canvas.height);
  }, []);

  const startDrawing = (e) => {
    isDrawingRef.current = true;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const context = canvas.getContext('2d');

    context.beginPath();
    context.moveTo(
      e.clientX - rect.left,
      e.clientY - rect.top
    );
  };

  const draw = (e) => {
    if (!isDrawingRef.current) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const context = canvas.getContext('2d');

    context.lineWidth = 2;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#000';

    context.lineTo(
      e.clientX - rect.left,
      e.clientY - rect.top
    );
    context.stroke();
  };

  const stopDrawing = () => {
    isDrawingRef.current = false;
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    context.fillStyle = 'white';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = '#ccc';
    context.lineWidth = 1;
    context.strokeRect(0, 0, canvas.width, canvas.height);
  };

  const handleCapture = async () => {
    const canvas = canvasRef.current;
    const signatureImage = canvas.toDataURL('image/png');
    onCapture(signatureImage);
  };

  return (
    <div className="signature-canvas-modal">
      <div className="signature-canvas-container">
        <h2>Draw Your Signature</h2>

        <canvas
          ref={canvasRef}
          className="signature-canvas"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
        />

        <div className="signature-controls">
          <button
            className="btn btn-clear"
            onClick={handleClear}
            disabled={isSigning}
          >
            Clear
          </button>
          <button
            className="btn btn-cancel"
            onClick={onCancel}
            disabled={isSigning}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleCapture}
            disabled={isSigning}
          >
            {isSigning ? 'Signing...' : 'Sign Document'}
          </button>
        </div>

        <p className="signature-help">
          Draw your signature above. Click "Sign Document" when done.
        </p>
      </div>
    </div>
  );
});

SignatureCanvas.displayName = 'SignatureCanvas';

export default SignatureCanvas;
