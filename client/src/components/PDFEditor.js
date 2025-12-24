/**
 * PDF EDITOR COMPONENT
 * 
 * Handles PDF rendering, field placement, and signature capture
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import PDFRenderer from './PDFRenderer';
import FieldToolbar from './FieldToolbar';
import SignatureCanvas from './SignatureCanvas';
import '../styles/PDFEditor.css';

function PDFEditor() {
  const [pdf, setPDF] = useState(null);
  const [selectedField, setSelectedField] = useState(null);
  const [fields, setFields] = useState([]);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [pdfPageSize, setPDFPageSize] = useState(null);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [signing, setSigning] = useState(false);
  const containerRef = useRef(null);
  const signatureCanvasRef = useRef(null);
  const pdfsLoadedRef = useRef(false);

  // Load sample PDF on mount
  useEffect(() => {
    const handleResizeEvent = () => {
      if (containerRef.current) {
        setContainerSize({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight
        });
      }
    };

    loadSamplePDF();
    handleResizeEvent();
    window.addEventListener('resize', handleResizeEvent);
    return () => window.removeEventListener('resize', handleResizeEvent);
  }, []);

  const handleResize = () => {
    if (containerRef.current) {
      setContainerSize({
        width: containerRef.current.offsetWidth,
        height: containerRef.current.offsetHeight
      });
    }
  };

  const loadSamplePDF = async () => {
    try {
      // For demo, use a sample PDF
      // In production, allow users to upload their own
      const response = await fetch('/sample.pdf');
      const buffer = await response.arrayBuffer();
      setPDF(buffer);
    } catch (error) {
      console.error('Error loading PDF:', error);
      // Create a fallback PDF for testing
      createSamplePDF();
    }
  };

  const createSamplePDF = async () => {
    // For development, create a simple test PDF
    console.log('Using mock PDF for testing');
    setPDF(new ArrayBuffer(1)); // Placeholder
  };

  const handlePDFLoaded = useCallback((pageSize) => {
    setPDFPageSize(pageSize);
  }, []);

  const handleFieldDropped = useCallback((field) => {
    const newField = {
      id: `field-${Date.now()}`,
      ...field,
      selected: true
    };
    
    const updatedFields = fields.map(f => ({ ...f, selected: false }));
    updatedFields.push(newField);
    
    setFields(updatedFields);
    setSelectedField(newField.id);
  }, [fields]);

  const handleFieldUpdated = useCallback((updatedField) => {
    setFields(f => f.map(field => 
      field.id === updatedField.id ? updatedField : field
    ));
  }, []);

  const handleFieldSelected = useCallback((fieldId) => {
    setFields(f => f.map(field => ({
      ...field,
      selected: field.id === fieldId
    })));
    setSelectedField(fieldId);
  }, []);

  const handleDeleteField = useCallback((fieldId) => {
    setFields(f => f.filter(field => field.id !== fieldId));
    setSelectedField(null);
  }, []);

  const handleSignatureClick = useCallback((fieldId) => {
    setSelectedField(fieldId);
    setShowSignaturePad(true);
  }, []);

  const handleSignatureCapture = async (signatureImage) => {
    if (!selectedField || !signatureImage || !pdf || !pdfPageSize || !containerSize.width) {
      console.error('Missing required data:', {
        hasSelectedField: !!selectedField,
        hasSignatureImage: !!signatureImage,
        hasPdf: !!pdf,
        hasPdfPageSize: !!pdfPageSize,
        hasContainerSize: !!containerSize.width
      });
      alert('Missing required data. Please try again.');
      return;
    }

    setSigning(true);
    try {
      // Find the selected field
      const field = fields.find(f => f.id === selectedField);
      if (!field) {
        alert('Field not found');
        return;
      }

      // PDF is already in base64 format
      const pdfBase64 = pdf;

      console.log('Signing PDF with:', {
        fieldId: field.id,
        fieldCoordinates: {
          x: field.x,
          y: field.y,
          width: field.width,
          height: field.height
        },
        containerSize: {
          width: containerSize.width,
          height: containerSize.height
        },
        pdfPageSize: {
          width: pdfPageSize.width,
          height: pdfPageSize.height
        }
      });

      // Validate coordinates
      if (field.x < 0 || field.y < 0 || field.width <= 0 || field.height <= 0) {
        alert('Invalid field coordinates. Please reposition the field.');
        setSigning(false);
        return;
      }

      if (field.x + field.width > pdfPageSize.width || field.y + field.height > pdfPageSize.height) {
        alert('Field extends beyond PDF boundaries. Please reposition it.');
        setSigning(false);
        return;
      }

      const apiUrl = `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/sign-pdf`;
      console.log('API URL:', apiUrl);

      // Call backend to sign PDF
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pdfId: `pdf-${Date.now()}`,
          pdfBuffer: pdfBase64,
          signature: {
            image: signatureImage,
            imageType: 'png'
          },
          coordinates: {
            frontend: {
              x: field.x,
              y: field.y,
              width: field.width,
              height: field.height
            },
            container: containerSize,
            pageIndex: 0
          },
          pageSize: pdfPageSize,
          metadata: {
            email: 'user@example.com',
            name: 'User Name',
            reason: 'Signature',
            timestamp: new Date().toISOString()
          }
        })
      });

      console.log('Response status:', response.status);
      const result = await response.json();
      console.log('Response data:', result);

      if (!response.ok) {
        throw new Error(result.error || `HTTP ${response.status}`);
      }

      console.log('PDF signed successfully:', result);
      
      // Download signed PDF
      const link = document.createElement('a');
      link.href = `data:application/pdf;base64,${result.signedPdf}`;
      link.download = `signed-${Date.now()}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setShowSignaturePad(false);
      alert('PDF signed successfully!');
    } catch (error) {
      console.error('Error signing PDF:', error);
      alert(`Failed to sign PDF: ${error.message}`);
    } finally {
      setSigning(false);
    }
  };

  const handleFileUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      // Store as base64 string, not ArrayBuffer
      const base64String = e.target.result.split(',')[1] || e.target.result;
      setPDF(base64String);
      setFields([]); // Clear fields on new PDF
      setSelectedField(null);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="pdf-editor">
      <FieldToolbar
        onFieldAdd={handleFieldDropped}
        onFileUpload={handleFileUpload}
      />

      <div className="editor-container">
        <div className="pdf-viewer-container" ref={containerRef}>
          {pdf ? (
            <PDFRenderer
              pdf={pdf}
              fields={fields}
              onFieldDropped={handleFieldDropped}
              onFieldUpdated={handleFieldUpdated}
              onFieldSelected={handleFieldSelected}
              onFieldDelete={handleDeleteField}
              onPDFLoaded={handlePDFLoaded}
              onSignatureClick={handleSignatureClick}
              containerSize={containerSize}
            />
          ) : (
            <div className="pdf-placeholder">
              <p>Click "Upload PDF" to get started</p>
            </div>
          )}
        </div>
      </div>

      {showSignaturePad && (
        <SignatureCanvas
          ref={signatureCanvasRef}
          onCapture={handleSignatureCapture}
          onCancel={() => setShowSignaturePad(false)}
          isSigning={signing}
        />
      )}
    </div>
  );
}

export default PDFEditor;
