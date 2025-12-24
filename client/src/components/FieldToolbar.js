/**
 * FIELD TOOLBAR COMPONENT
 * 
 * Toolbar for adding new fields and uploading PDFs
 */

import React, { useRef } from 'react';
import '../styles/FieldToolbar.css';

function FieldToolbar({ onFieldAdd, onFileUpload }) {
  const fileInputRef = useRef(null);

  const fieldTypes = [
    { type: 'signature', label: 'Signature', icon: '✍️' },
    { type: 'text', label: 'Text Field', icon: '📝' },
    { type: 'image', label: 'Image', icon: '🖼️' },
    { type: 'date', label: 'Date', icon: '📅' },
    { type: 'radio', label: 'Radio Button', icon: '⭕' }
  ];

  const handleFieldDragStart = (fieldType) => (e) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('fieldId', `new-${fieldType}`);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="field-toolbar">
      <div className="toolbar-section">
        <h3>Fields</h3>
        <div className="field-buttons">
          {fieldTypes.map(({ type, label, icon }) => (
            <div
              key={type}
              draggable
              className="field-button"
              onDragStart={handleFieldDragStart(type)}
              title={`Drag to add ${label}`}
            >
              <span className="icon">{icon}</span>
              <span className="label">{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="toolbar-section">
        <h3>Document</h3>
        <button
          className="upload-button"
          onClick={handleUploadClick}
        >
          📄 Upload PDF
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          onChange={onFileUpload}
          style={{ display: 'none' }}
        />
      </div>

      <div className="toolbar-info">
        <p><strong>Instructions:</strong></p>
        <ul>
          <li>Drag field buttons onto the PDF</li>
          <li>Click and drag fields to move</li>
          <li>Drag the corner to resize</li>
          <li>Click "Sign" to add signature</li>
        </ul>
      </div>
    </div>
  );
}

export default FieldToolbar;
