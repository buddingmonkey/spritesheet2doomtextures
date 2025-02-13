const imageInput = document.getElementById('imageInput');
const imageCanvas = document.getElementById('imageCanvas');
const ctx = imageCanvas.getContext('2d');
const outputButton = document.getElementById('outputButton');
const outputDiv = document.getElementById('output');

let filename = "FILENAME";
let transparentColor = undefined; // Default transparent
let boundingBoxes = []; // Store bounding boxes for output generation

let tolerance = 2;

function getSubimageBoundingBoxes(pngImage, backgroundColor) {
  if (!transparentColor) return;

  boundingBoxes = []; // Clear the array
  const bgR = backgroundColor.r;
  const bgG = backgroundColor.g;
  const bgB = backgroundColor.b;
  const bgA = backgroundColor.a === undefined ? 255 : backgroundColor.a;

  const imageData = ctx.getImageData(0, 0, pngImage.width, pngImage.height).data; // Get ALL pixel data at once for efficiency

  const visited = new Array(pngImage.height).fill(null).map(() => new Array(pngImage.width).fill(false));

  function findBoundingBox(x, y) {
    if (x < 0 || x >= pngImage.width || y < 0 || y >= pngImage.height || visited[y][x]) {
      return null;
    }

    const index = (y * pngImage.width + x) * 4;
    const r = imageData[index];
    const g = imageData[index + 1];
    const b = imageData[index + 2];
    const a = imageData[index + 3];

    if (r === bgR && g === bgG && b === bgB && a === bgA) {
      return null; // Background pixel
    }

    visited[y][x] = true;

    let minX = x;
    let minY = y;
    let maxX = x;
    let maxY = y;

    // Explore adjacent pixels (8-connected)
    const adjacentPixels = [
      [0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]
    ];

    for (const [dx, dy] of adjacentPixels) {
      const result = findBoundingBox(x + dx, y + dy);
      if (result) {
        minX = Math.min(minX, result.minX);
        minY = Math.min(minY, result.minY);
        maxX = Math.max(maxX, result.maxX);
        maxY = Math.max(maxY, result.maxY);
      }
    }

    return { minX, minY, maxX, maxY };
  }

  for (let y = 0; y < pngImage.height; y++) {
    for (let x = 0; x < pngImage.width; x++) {
      if (!visited[y][x]) {
        const box = findBoundingBox(x, y);
        if (box) {
          boundingBoxes.push({
            x: box.minX,
            y: box.minY,
            width: box.maxX - box.minX + 1,
            height: box.maxY - box.minY + 1
          });
        }
      }
    }
  }
  
  let combinedBoxes = combineOverlappingBoxes();
  boundingBoxes = combinedBoxes;

  // it has to run twice because the overlaps might overlap
  combinedBoxes = combineOverlappingBoxes();

  let globalTop = Math.min(...combinedBoxes.map(box => box.y));

  combinedBoxes.sort((a, b) => {
      const aTop = a.y;
      const bTop = b.y;
      const aCenterX = a.x + a.width / 2;
      const bCenterX = b.x + b.width / 2;

      const rowA = Math.floor((aTop - globalTop) / 20); // Adjust 20 for row height/spacing
      const rowB = Math.floor((bTop - globalTop) / 20);

      if (rowA === rowB) {
          return aCenterX - bCenterX; // Sort by center X if on the same row
      }

      return rowA - rowB; // Sort by row index
  });

  boundingBoxes = combinedBoxes;

  return boundingBoxes;
}


function combineOverlappingBoxes() {
  const combinedBoxes = [];
  while (boundingBoxes.length > 0) {
    const currentBox = boundingBoxes.shift(); // Get the first box and remove it from the array
    let merged = false;

    for (let i = 0; i < combinedBoxes.length; i++) {
      const existingBox = combinedBoxes[i];

      if (overlaps(currentBox, existingBox, tolerance)) {
        const combined = combineBoxes(currentBox, existingBox);
        combinedBoxes[i] = combined; // Replace the existing box with the combined one
        merged = true;
        break; // Exit the inner loop since we've merged
      }
    }

    if (!merged) {
      combinedBoxes.push(currentBox); // If no overlap, add the box as is
    }
  }
  return combinedBoxes;
}

function overlaps(box1, box2, tolerance = 2) {  // Added tolerance parameter
  return !(
      box1.x + box1.width + tolerance <= box2.x - tolerance || // box1 is to the left of box2 (with tolerance)
      box1.x - tolerance >= box2.x + box2.width + tolerance || // box1 is to the right of box2 (with tolerance)
      box1.y + box1.height + tolerance <= box2.y - tolerance || // box1 is above box2 (with tolerance)
      box1.y - tolerance >= box2.y + box2.height + tolerance    // box1 is below box2 (with tolerance)
  );
}

function combineBoxes(box1, box2) {
    const minX = Math.min(box1.x, box2.x);
    const minY = Math.min(box1.y, box2.y);
    const maxX = Math.max(box1.x + box1.width, box2.x + box2.width);
    const maxY = Math.max(box1.y + box1.height, box2.y + box2.height);

    return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY
    };
}

imageInput.addEventListener('change', (event) => {
  const file = event.target.files[0];
  filename = file.name.replace(/\.[^/.]+$/, "");
  const reader = new FileReader();

  reader.onload = (e) => {
    const pngImage = new Image();
    pngImage.src = e.target.result;

    pngImage.onload = () => {
      imageCanvas.width = pngImage.width;
      imageCanvas.height = pngImage.height;
      ctx.drawImage(pngImage, 0, 0);

      function redraw() {
        ctx.clearRect(0, 0, imageCanvas.width, imageCanvas.height); // Clear the canvas
        ctx.drawImage(pngImage, 0, 0); // Redraw the image

        boundingBoxes = getSubimageBoundingBoxes(pngImage, transparentColor, tolerance); // Use current tolerance
        
        if (!boundingBoxes) return;

        boundingBoxes.forEach((box, index) => {
          ctx.strokeStyle = 'red';
          ctx.lineWidth = 2;
          ctx.strokeRect(box.x, box.y, box.width, box.height);

          // Draw order number
          ctx.font = "12px Arial"; // Adjust font as needed
          ctx.fillStyle = "red";
          ctx.textAlign = "right"; // Align text to the right
          ctx.textBaseline = "bottom"; // Align text to the bottom
          ctx.fillText(index + 1, box.x + box.width - 2, box.y + box.height - 2);
        });
      }
        
      // Color picking from the image
      imageCanvas.addEventListener('click', (event) => {
        const x = event.offsetX;
        const y = event.offsetY;
        const pixelData = ctx.getImageData(x, y, 1, 1).data;
        transparentColor = {
          r: pixelData[0],
          g: pixelData[1],
          b: pixelData[2],
          a: pixelData[3]
        };

        console.log("Transparent color selected:", transparentColor); // For debugging

        // Redraw with the new transparent color
        redraw();
      });

      // Tolerance slider event listener
      toleranceSlider.addEventListener('input', () => {
        tolerance = parseInt(toleranceSlider.value); // Get the numeric value
        toleranceValue.textContent = tolerance; // Update the displayed value

        if (pngImage && pngImage.complete) { // Check if the image is loaded
            redraw(); // Redraw with the new tolerance
        }
      });
    };
    pngImage.onerror = () => {
        alert("Error loading image.");
    };
  };

  reader.readAsDataURL(file);
});

outputButton.addEventListener('click', () => {
	let spriteName = document.getElementById("patchname").value;
  spriteName = spriteName ? spriteName : "SPRT";
  let outputText = "";
  for (let i = 0; i < boundingBoxes.length; i++) {
    const box = boundingBoxes[i];
    outputText += `Sprite "${spriteName}${i + 1}", ${box.width}, ${box.height}\n`;
    outputText += "{\n";
    outputText += `\tPatch "${filename}", -${box.x}, -${box.y}\n`; // X and Y are already relative to 0,0
    outputText += "}\n\n";
  }
  outputDiv.textContent = outputText;
});
