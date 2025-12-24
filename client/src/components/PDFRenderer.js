/**
 * PDF RENDERER COMPONENT
 * 
 * Renders PDF and manages draggable/resizable fields
 * Maintains pixel-perfect coordinate accuracy
 */

import React, { useState, useEffect, useRef, memo, useCallback } from 'react';
import { pdfjs } from 'react-pdf';
import DraggableField from './DraggableField';
import '../styles/PDFRenderer.css';

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

function PDFRenderer({
  pdf,
  fields,
  onFieldDropped,
  onFieldUpdated,
  onFieldSelected,
  onFieldDelete,
  onPDFLoaded,
  onSignatureClick,
  containerSize
}) {
  const [pageSize, setPageSize] = useState(null);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const renderingRef = useRef(false);

  // Render PDF using canvas
  useEffect(() => {
    if (!pdf || !canvasRef.current || renderingRef.current) return;

    let isMounted = true;
    renderingRef.current = true;

    const renderPDF = async () => {
      try {
        // Convert base64 to Uint8Array for PDF.js
        let pdfData;
        if (typeof pdf === 'string') {
          // Decode base64 to binary string
          const binaryString = atob(pdf);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          pdfData = bytes;
        } else {
          pdfData = pdf;
        }

        const pdf_ = await pdfjs.getDocument({ data: pdfData }).promise;

        if (!isMounted) return;

        // For now, render only first page for field placement
        // Full multi-page support can be added later
        const page = await pdf_.getPage(1);
        const viewport = page.getViewport({ scale: 1 });
        
        if (!isMounted) return;

        // Setup canvas
        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        // Render page to canvas
        const renderTask = page.render({
          canvasContext: context,
          viewport: viewport
        });

        await renderTask.promise;

        if (!isMounted) return;

        // Update state only once after rendering
        setPageSize({
          width: viewport.width,
          height: viewport.height
        });

        onPDFLoaded({
          width: viewport.width,
          height: viewport.height
        });

        console.log('PDF rendered:', {
          numPages: pdf_.numPages,
          pageSize: { width: viewport.width, height: viewport.height }
        });

      } catch (error) {
        console.error('Error rendering PDF:', error);
      } finally {
        renderingRef.current = false;
      }
    };

    renderPDF();

    return () => {
      isMounted = false;
    };
  }, [pdf, onPDFLoaded]);

  // Calculate scale and offset for responsive layout
  useEffect(() => {
    if (!containerRef.current || !pageSize) return;

    const container = containerRef.current;
    const containerAspectRatio = container.offsetWidth / container.offsetHeight;
    const pageAspectRatio = pageSize.width / pageSize.height;

    let newScale;
    let newOffsetX = 0;
    let newOffsetY = 0;

    if (pageAspectRatio > containerAspectRatio) {
      // Page is wider - scale by width
      newScale = container.offsetWidth / pageSize.width;
      newOffsetY = (container.offsetHeight - pageSize.height * newScale) / 2;
    } else {
      // Page is taller - scale by height
      newScale = container.offsetHeight / pageSize.height;
      newOffsetX = (container.offsetWidth - pageSize.width * newScale) / 2;
    }

    setScale(newScale);
    setOffset({ x: newOffsetX, y: newOffsetY });
  }, [containerSize, pageSize]);

  const handleDragOver = (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (event) => {
    event.preventDefault();
    
    const fieldId = event.dataTransfer.getData('fieldId');
    
    // If it's a new field being added
    if (fieldId.startsWith('new-')) {
      const fieldType = fieldId.replace('new-', '');
      const rect = canvasRef.current.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      onFieldDropped({
        type: fieldType,
        x: x / scale,
        y: y / scale,
        width: 120 / scale,
        height: 60 / scale
      });
    }
  };

  return (
    <div className="pdf-renderer">
      <div
        className="pdf-canvas-wrapper"
        ref={containerRef}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px)`,
          width: pageSize ? `${pageSize.width * scale}px` : '100%',
          height: pageSize ? `${pageSize.height * scale}px` : '100%'
        }}
      >
        <canvas
          ref={canvasRef}
          className="pdf-canvas"
          style={{
            transform: `scale(${scale})`,
            transformOrigin: '0 0'
          }}
        />

        {/* Draggable fields overlay */}
        {fields.map(field => (
          <DraggableField
            key={field.id}
            field={field}
            scale={scale}
            offset={offset}
            pageSize={pageSize}
            onUpdate={(updated) => onFieldUpdated(updated)}
            onSelect={() => onFieldSelected(field.id)}
            onDelete={() => onFieldDelete(field.id)}
            onSignatureClick={() => onSignatureClick(field.id)}
          />
        ))}
      </div>
    </div>
  );
}

export default PDFRenderer;
