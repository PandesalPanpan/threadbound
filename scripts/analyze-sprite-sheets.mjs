import path from 'node:path';
import sharp from 'sharp';

const sources = process.argv.slice(2);
if (!sources.length) throw new Error('Pass one or more sprite-sheet paths.');

function occupiedSegments(values, minimum, joinGap = 2) {
  const raw = [];
  let start = null;
  for (let index = 0; index <= values.length; index += 1) {
    const occupied = index < values.length && values[index] >= minimum;
    if (occupied && start === null) start = index;
    if (!occupied && start !== null) {
      raw.push([start, index - 1]);
      start = null;
    }
  }
  const merged = [];
  for (const segment of raw) {
    const previous = merged.at(-1);
    if (previous && segment[0] - previous[1] - 1 <= joinGap) previous[1] = segment[1];
    else merged.push(segment);
  }
  return merged;
}

for (const source of sources) {
  const image = sharp(source).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const rows = new Uint32Array(info.height);
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * 4 + 3] > 16) rows[y] += 1;
    }
  }
  const rowSegments = occupiedSegments(rows, 8, 6);
  const result = rowSegments.map(([top, bottom]) => {
    const columns = new Uint32Array(info.width);
    for (let y = top; y <= bottom; y += 1) {
      for (let x = 0; x < info.width; x += 1) {
        if (data[(y * info.width + x) * 4 + 3] > 16) columns[x] += 1;
      }
    }
    return { top, bottom, columns: occupiedSegments(columns, 3, 3) };
  });
  const visited = new Uint8Array(info.width * info.height);
  const components = [];
  const stack = [];
  for (let origin = 0; origin < visited.length; origin += 1) {
    if (visited[origin] || data[origin * 4 + 3] <= 16) continue;
    visited[origin] = 1;
    stack.push(origin);
    let pixels = 0;
    let left = info.width;
    let right = 0;
    let top = info.height;
    let bottom = 0;
    while (stack.length) {
      const current = stack.pop();
      const x = current % info.width;
      const y = Math.floor(current / info.width);
      pixels += 1;
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= info.width || ny < 0 || ny >= info.height) continue;
        const next = ny * info.width + nx;
        if (!visited[next] && data[next * 4 + 3] > 16) { visited[next] = 1; stack.push(next); }
      }
    }
    if (pixels >= 100) components.push({ pixels, left, top, right, bottom });
  }
  components.sort((a, b) => a.top - b.top || a.left - b.left);
  console.log(JSON.stringify({ source: path.basename(source), width: info.width, height: info.height, projectionRows: result, componentCount: components.length, components }, null, 2));
}
