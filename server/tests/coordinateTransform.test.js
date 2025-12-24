/**
 * COORDINATE TRANSFORMATION TESTS
 * 
 * Validates all coordinate transformations work correctly
 */

const {
  normalizeFrontendCoordinates,
  normalizedToPDFPoints,
  transformFrontendToPDF,
  transformPDFToFrontend,
  isValidNormalizedCoordinate,
  A4_WIDTH_POINTS,
  A4_HEIGHT_POINTS
} = require('../utils/coordinateTransform');

// Test configuration
const A4_PAGE = {
  width: A4_WIDTH_POINTS,   // 595.28
  height: A4_HEIGHT_POINTS  // 841.89
};

// Test cases
const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function assertEqual(actual, expected, tolerance = 0.01) {
  if (typeof actual === 'object') {
    Object.keys(expected).forEach(key => {
      const diff = Math.abs(actual[key] - expected[key]);
      if (diff > tolerance) {
        throw new Error(
          `${key}: expected ${expected[key]}, got ${actual[key]} (diff: ${diff})`
        );
      }
    });
  } else {
    if (Math.abs(actual - expected) > tolerance) {
      throw new Error(`Expected ${expected}, got ${actual}`);
    }
  }
}

function assertTrue(value, message) {
  if (!value) throw new Error(message || 'Assertion failed');
}

// ============================================================================
// TEST SUITE
// ============================================================================

test('Desktop viewport (1200x1600) - signature at center', () => {
  const frontend = { x: 300, y: 300, width: 100, height: 50 };
  const container = { width: 1200, height: 1600 };

  const result = transformFrontendToPDF(frontend, container, A4_PAGE);

  // Check normalized coordinates
  assertTrue(result.normalized.x > 0 && result.normalized.x < 1, 'X in bounds');
  assertTrue(result.normalized.y > 0 && result.normalized.y < 1, 'Y in bounds');

  // Check PDF points
  assertTrue(result.x > 0 && result.x < A4_PAGE.width, 'PDF X in bounds');
  assertTrue(result.y > 0 && result.y < A4_PAGE.height, 'PDF Y in bounds');
});

test('Mobile viewport (375x667) - same signature', () => {
  const frontend = { x: 100, y: 100, width: 50, height: 25 };
  const container = { width: 375, height: 667 };

  const result = transformFrontendToPDF(frontend, container, A4_PAGE);

  // Normalized coordinates should be similar to desktop
  // (accounting for different viewport sizes)
  assertTrue(result.normalized.x > 0, 'Normalized X positive');
  assertTrue(result.normalized.y > 0, 'Normalized Y positive');
});

test('Reverse transformation - PDF to Frontend', () => {
  const frontend = { x: 150, y: 200, width: 100, height: 50 };
  const container = { width: 1200, height: 1600 };

  // Forward transform
  const pdfCoords = transformFrontendToPDF(frontend, container, A4_PAGE);

  // Reverse transform
  const restored = transformPDFToFrontend(
    {
      x: pdfCoords.x,
      y: pdfCoords.y,
      width: pdfCoords.width,
      height: pdfCoords.height
    },
    container,
    A4_PAGE
  );

  // Should be close to original
  assertEqual(restored, frontend, 1);
});

test('Y-axis flip - top-left to bottom-left', () => {
  const frontend = { x: 100, y: 100, width: 50, height: 50 };
  const container = { width: 600, height: 800 };

  const normalized = normalizeFrontendCoordinates(frontend, container, A4_PAGE);
  const pdfCoords = normalizedToPDFPoints(normalized, A4_PAGE);

  // In normalized coords, Y=0 is top
  // In PDF coords, Y=0 is bottom
  // So PDF Y should be (page_height - normalized_y - normalized_height) * page_height
  const expectedY = A4_PAGE.height - (normalized.y + normalized.height) * A4_PAGE.height;
  assertEqual(pdfCoords.y, expectedY);
});

test('Aspect ratio handling - portrait PDF', () => {
  const container = { width: 800, height: 600 }; // Landscape viewport
  const portraitPage = { width: 595, height: 842 }; // Portrait PDF

  const frontend = { x: 100, y: 100, width: 100, height: 100 };
  const result = transformFrontendToPDF(frontend, container, portraitPage);

  assertTrue(isValidNormalizedCoordinate(result.normalized), 'Valid normalized');
});

test('Aspect ratio handling - landscape PDF', () => {
  const container = { width: 600, height: 800 }; // Portrait viewport
  const landscapePage = { width: 1000, height: 600 }; // Landscape PDF

  const frontend = { x: 100, y: 100, width: 100, height: 100 };
  const result = transformFrontendToPDF(frontend, container, landscapePage);

  assertTrue(isValidNormalizedCoordinate(result.normalized), 'Valid normalized');
});

test('Boundary conditions - top-left corner', () => {
  const frontend = { x: 0, y: 0, width: 50, height: 50 };
  const container = { width: 1200, height: 1600 };

  const result = transformFrontendToPDF(frontend, container, A4_PAGE);

  // Top-left corner should map to high Y in PDF (near top)
  assertTrue(result.normalized.x < 0.1, 'X is at left edge');
  assertTrue(result.normalized.y < 0.1, 'Y is at top edge');
});

test('Boundary conditions - bottom-right corner', () => {
  const container = { width: 1200, height: 1600 };
  const scale = 1200 / A4_PAGE.width; // ~2.015

  const frontend = {
    x: A4_PAGE.width * scale - 50,
    y: A4_PAGE.height * scale - 50,
    width: 50,
    height: 50
  };

  const result = transformFrontendToPDF(frontend, container, A4_PAGE);

  // Should clamp to valid range
  assertTrue(
    result.normalized.x + result.normalized.width <= 1,
    'X within bounds'
  );
  assertTrue(
    result.normalized.y + result.normalized.height <= 1,
    'Y within bounds'
  );
});

test('Validation - valid normalized coordinates', () => {
  const valid = { x: 0.25, y: 0.5, width: 0.2, height: 0.1 };
  assertTrue(isValidNormalizedCoordinate(valid), 'Valid coordinates');
});

test('Validation - invalid normalized coordinates', () => {
  const invalid = { x: 1.1, y: 0.5, width: 0.2, height: 0.1 };
  assertTrue(!isValidNormalizedCoordinate(invalid), 'Invalid X (>1)');

  const invalid2 = { x: 0.9, y: 0.5, width: 0.2, height: 0.1 };
  assertTrue(!isValidNormalizedCoordinate(invalid2), 'Invalid sum (>1)');
});

test('Edge case - very small field', () => {
  const frontend = { x: 100, y: 100, width: 1, height: 1 };
  const container = { width: 1200, height: 1600 };

  const result = transformFrontendToPDF(frontend, container, A4_PAGE);

  // Should still be valid
  assertTrue(isValidNormalizedCoordinate(result.normalized), 'Valid small field');
});

test('Edge case - very large field', () => {
  const frontend = { x: 10, y: 10, width: 1180, height: 1580 };
  const container = { width: 1200, height: 1600 };

  const result = transformFrontendToPDF(frontend, container, A4_PAGE);

  // Should clamp properly
  assertTrue(
    result.normalized.x + result.normalized.width <= 1,
    'Clamped to right edge'
  );
});

test('High-precision math - no rounding loss', () => {
  const frontend = { x: 123.456, y: 234.567, width: 89.123, height: 45.678 };
  const container = { width: 1234, height: 1567 };

  const result = transformFrontendToPDF(frontend, container, A4_PAGE);

  // Forward and back
  const restored = transformPDFToFrontend(
    {
      x: result.x,
      y: result.y,
      width: result.width,
      height: result.height
    },
    container,
    A4_PAGE
  );

  // Should preserve precision within 1 pixel
  assertEqual(restored.x, frontend.x, 1);
  assertEqual(restored.y, frontend.y, 1);
  assertEqual(restored.width, frontend.width, 1);
  assertEqual(restored.height, frontend.height, 1);
});

// ============================================================================
// RUN TESTS
// ============================================================================

console.log('\n📋 Coordinate Transformation Tests\n');
console.log('═'.repeat(60));

let passed = 0;
let failed = 0;

tests.forEach(({ name, fn }) => {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`✗ ${name}`);
    console.log(`  ${error.message}`);
    failed++;
  }
});

console.log('═'.repeat(60));
console.log(`\nResults: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
