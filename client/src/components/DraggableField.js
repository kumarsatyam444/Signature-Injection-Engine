/**
 * DRAGGABLE FIELD COMPONENT
 * 
 * Individual field element with drag and resize capability
 * Maintains coordinate precision throughout interactions
 */

import React, { useState, useRef, useCallback } from 'react';
import '../styles/DraggableField.css';

function DraggableField({
  field,
  scale,
  offset,
  pageSize,
  onUpdate,
  onSelect,
  onDelete,
  onSignatureClick
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const fieldRef = useRef(null);

  const handleMouseDown = (event) => {
    if (event.target.classList.contains('resize-handle')) {
      setIsResizing(true);
    } else {
      setIsDragging(true);
    }

    setDragStart({
      x: event.clientX,
      y: event.clientY,
      fieldX: field.x,
      fieldY: field.y,
      fieldWidth: field.width,
      fieldHeight: field.height
    });

    onSelect();
    event.preventDefault();
  };

  const handleMouseMove = useCallback((event) => {
    if (!isDragging && !isResizing) return;

    const deltaX = event.clientX - dragStart.x;
    const deltaY = event.clientY - dragStart.y;

    if (isDragging) {
      const newX = dragStart.fieldX + deltaX / scale;
      const newY = dragStart.fieldY + deltaY / scale;

      // Clamp to page boundaries
      const clampedX = Math.max(0, Math.min(newX, pageSize.width - field.width));
      const clampedY = Math.max(0, Math.min(newY, pageSize.height - field.height));

      onUpdate({
        ...field,
        x: clampedX,
        y: clampedY
      });
    } else if (isResizing) {
      const newWidth = Math.max(30, dragStart.fieldWidth + deltaX / scale);
      const newHeight = Math.max(30, dragStart.fieldHeight + deltaY / scale);

      // Clamp to page boundaries
      const clampedWidth = Math.min(newWidth, pageSize.width - field.x);
      const clampedHeight = Math.min(newHeight, pageSize.height - field.y);

      onUpdate({
        ...field,
        width: clampedWidth,
        height: clampedHeight
      });
    }
  }, [isDragging, isResizing, dragStart, field, scale, pageSize, onUpdate]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsResizing(false);
  }, []);

  React.useEffect(() => {
    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, isResizing, handleMouseMove, handleMouseUp]);

  const screenX = field.x * scale;
  const screenY = field.y * scale;
  const screenWidth = field.width * scale;
  const screenHeight = field.height * scale;

  const fieldIcon = {
    'signature': '✍️',
    'text': '📝',
    'image': '🖼️',
    'date': '📅',
    'radio': '⭕'
  }[field.type] || '□';

  return (
    <div
      ref={fieldRef}
      className={`draggable-field ${field.selected ? 'selected' : ''}`}
      style={{
        left: `${screenX}px`,
        top: `${screenY}px`,
        width: `${screenWidth}px`,
        height: `${screenHeight}px`
      }}
      onMouseDown={handleMouseDown}
    >
      <div className="field-content">
        <span className="field-icon">{fieldIcon}</span>
        <span className="field-type">{field.type}</span>
      </div>

      {field.selected && (
        <>
          <div className="resize-handle resize-handle-se" />
          <button
            className="delete-button"
            onClick={onDelete}
            title="Delete field"
          >
            ✕
          </button>

          {field.type === 'signature' && (
            <button
              className="sign-button"
              onClick={onSignatureClick}
              title="Add signature"
            >
              Sign
            </button>
          )}
        </>
      )}
    </div>
  );
}

export default DraggableField;
