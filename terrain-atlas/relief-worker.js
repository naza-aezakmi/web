"use strict";

importScripts("relief-codec.js");

const index = fetch("relief/index.json").then(async (response) => {
  if (!response.ok) throw new Error("index");
  return response.json();
});
const cachedTiles = new Map();

function tile(world, name) {
  const url = "relief/" + world + "/" + name;
  if (!cachedTiles.has(url)) {
    const load = fetch(url).then(async (response) => {
      if (!response.ok || !response.body) throw new Error(url);
      const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
      return new Response(stream).arrayBuffer();
    }).catch((error) => {
      cachedTiles.delete(url);
      throw error;
    });
    cachedTiles.set(url, load);
  }
  return cachedTiles.get(url);
}

function rotations(values, size) {
  const results = [values];
  while (results.length < 4) {
    const last = results.at(-1);
    results.push(last.map((_, i) => last[(size - 1 - i % size) * size + Math.floor(i / size)]));
  }
  return results;
}

// The 5 × 5 sampling window has centered, orthogonal east and north axes.
const AXIS = [-5000, -2500, 0, 2500, 5000];
const AXIS_SQUARES = 156250000;

function terrainStats(values, scale) {
  let sum = 0;
  let square = 0;
  let east = 0;
  let north = 0;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const value = values[i] * scale;
    sum += value;
    square += value * value;
    east += value * AXIS[i % 5];
    north += value * AXIS[4 - Math.floor(i / 5)];
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  const slope = Math.atan(Math.hypot(east, north) / AXIS_SQUARES) * 180 / Math.PI;
  const mean = sum / values.length;
  const roughness = Math.sqrt(Math.max(0, (square - (east ** 2 + north ** 2) / AXIS_SQUARES) /
    values.length - mean ** 2));
  return {mean: mean / scale, range: max - min, slope, roughness};
}

function readNative(layer, buffer, lat, lon) {
  const x = Math.floor(((lon - layer.west) % 360 + 360) % 360 / layer.dx);
  const north = layer.south + layer.height * layer.dy;
  const y = Math.min(layer.height - 1, Math.floor((north - lat) / layer.dy));
  if (x < 0 || x >= layer.width || y < 0 || y >= layer.height) return NaN;
  return buffer.getFloat32((y * layer.width + x) * 4, true);
}

const eligibility = new Map();
function readEligibility(layer) {
  if (!layer) return null;
  if (!eligibility.has(layer.file)) {
    eligibility.set(layer.file, fetch(layer.file).then(async (response) => {
      if (!response.ok) throw new Error(layer.file);
      const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
      const view = new DataView(await new Response(stream).arrayBuffer());
      if (view.byteLength !== layer.width * layer.height * 4) throw new Error(layer.file);
      return view;
    }).catch((error) => {
      eligibility.delete(layer.file);
      throw error;
    }));
  }
  return eligibility.get(layer.file);
}

function point(rows, radius, step, index) {
  let low = 0;
  let high = rows.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (rows[mid][2] <= index) low = mid;
    else high = mid - 1;
  }
  const [j, width, start] = rows[low];
  const i = index - start - width;
  const edge = radius * Math.acos(Math.min(Math.abs(i), Math.abs(i + 1)) * step / (Math.PI * radius));
  const y = (Math.max(j * step, -edge) + Math.min((j + 1) * step, edge)) / 2;
  const limit = Math.PI * radius * Math.cos(y / radius);
  const x = (Math.max(i * step, -limit) + Math.min((i + 1) * step, limit)) / 2;
  return {lat: y / radius * 180 / Math.PI, lon: x / limit * 180};
}

async function queryProfile(world, position, manifest) {
  const info = manifest.worlds[world];
  const size = manifest.samples ** 2;
  const block = info.tiles.find((item) => position >= item.first && position < item.first + item.count);
  if (!block) throw new Error("invalid query cell");
  const view = new DataView(decodeReliefProfile(await tile(world, block.file), block.count, manifest.samples, false));
  if (view.byteLength !== block.count * size * 2) throw new Error("invalid query tile");
  const start = (position - block.first) * size * 2;
  return Array.from({length: size}, (_, i) => view.getInt16(start + i * 2, true));
}

let earthPromise;

function loadEarth(info, size, onProgress) {
  if (!earthPromise) {
    const parts = info.tiles.filter((item) => item.file);
    let next = 0;
    let complete = 0;
    const load = async () => {
      while (next < parts.length) {
        const part = parts[next++];
        const view = new DataView(decodeReliefProfile(await tile("earth", part.file), part.count, Math.sqrt(size), true));
        if (view.byteLength !== part.count * (4 + size * 2)) throw new Error("invalid Earth tile");
        part.view = view;
        onProgress(++complete, parts.length);
      }
    };
    earthPromise = Promise.allSettled(Array.from({length: 6}, load)).then((results) => {
      if (results.some((result) => result.status === "rejected")) throw new Error("Earth tiles");
      return parts;
    }).catch((error) => {
      earthPromise = undefined;
      throw error;
    });
  }
  return earthPromise;
}

function findMatches(tiles, query, manifest, options) {
  if (manifest.samples !== AXIS.length) throw new Error("unexpected profile resolution");
  const rotated = rotations(query, manifest.samples);
  const size = query.length;
  const source = terrainStats(query, manifest.scale);
  const international = [];
  const unitedStates = [];
  const byTerrain = (a, b) => a.score - b.score || a.position - b.position;
  const candidate = new Int16Array(size);
  const keep = 8;
  const usaSlots = 3;
  let eligibleCount = 0;
  const stride = 4 + size * 2;
  const earth = manifest.worlds.earth;
  const weights = options.weights ?? {profile: .45, range: .25, slope: .20, roughness: .10};
  const profileWeight = weights.profile * manifest.scale ** 2 / (size * 100 ** 2);
  for (const {view} of tiles) {
    for (let offset = 0; offset < view.byteLength; offset += stride) {
      const position = view.getUint32(offset, true);
      const flags = options.screen?.[position];
      if (options.screen && !(flags & 1)) continue;
      eligibleCount++;
      const usa = Boolean(flags & 2);
      const best = usa ? unitedStates : international;
      const cutoff = best.length === keep ? best.at(-1).score : Infinity;
      for (let i = 0; i < size; i++) candidate[i] = view.getInt16(offset + 4 + i * 2, true);
      const target = terrainStats(candidate, manifest.scale);
      const features = weights.range * ((target.range - source.range) / 150) ** 2 +
        weights.slope * ((target.slope - source.slope) / 2) ** 2 +
        weights.roughness * ((target.roughness - source.roughness) / 50) ** 2;
      if (features > cutoff) continue;

      const shift = target.mean - source.mean;
      const bound = (cutoff - features) / profileWeight;
      let error = Infinity;
      let rotation = -1;
      for (let turn = 0; turn < rotated.length; turn++) {
        let squared = 0;
        const reference = rotated[turn];
        let i = 0;
        for (; i < size && squared < error && squared <= bound; i++) {
          squared += (candidate[i] - reference[i] - shift) ** 2;
        }
        if (i === size && squared < error) {
          error = squared;
          rotation = turn;
        }
      }
      if (rotation === -1) continue;
      const score = features + error * profileWeight;
      if (score > cutoff || (score === cutoff && position >= best.at(-1)?.position)) continue;
      const location = point(earth.rows, earth.radius, manifest.step, position);
      const bare = options.bare ? readNative(options.layer, options.bare, location.lat, location.lon) : NaN;
      if (options.threshold > 0 && !(bare >= options.threshold)) continue;
      const volcanic = options.volcanic ? readNative(options.volcanicLayer, options.volcanic, location.lat, location.lon) : NaN;
      if (options.requireVolcanic && volcanic !== 1) continue;
      const values = rotations(Array.from(candidate), manifest.samples)[(4 - rotation) % 4];
      best.push({position, rotation, score, usa, ...location,
        range: target.range, slope: target.slope, roughness: target.roughness,
        bare: Number.isFinite(bare) ? bare : null,
        volcanic: Number.isFinite(volcanic) ? volcanic === 1 : null,
        error: Math.sqrt(error / size) * manifest.scale,
        values: values.map((value) => value * manifest.scale)});
      best.sort(byTerrain);
      if (best.length > keep) best.pop();
    }
  }
  const usaCount = Math.min(usaSlots, unitedStates.length);
  const internationalCount = Math.min(keep - usaCount, international.length);
  const matches = [
    ...unitedStates.slice(0, keep - internationalCount),
    ...international.slice(0, internationalCount),
  ].sort(byTerrain);
  return {matches, criteria: source, eligibleCount};
}

let current;
self.onmessage = async ({data}) => {
  const {id, body, position, threshold, layer, volcanicLayer, requireVolcanic, weights, screen} = data;
  current = id;
  try {
    const manifest = await index;
    const query = await queryProfile(body, position, manifest);
    if (current !== id) return;
    const report = (done, total) => self.postMessage({id, kind: "loading", done, total});
    report(0, 0);
    const [tiles, bare, volcanic] = await Promise.all([
      loadEarth(manifest.worlds.earth, query.length, report),
      layer ? readEligibility(layer).catch((error) => {
        if (threshold > 0) throw error;
        return null;
      }) : null,
      volcanicLayer ? readEligibility(volcanicLayer).catch((error) => {
        if (requireVolcanic) throw error;
        return null;
      }) : null,
    ]);
    if (current !== id) return;
    const {matches, criteria, eligibleCount} = findMatches(tiles, query, manifest, {bare, threshold, layer, volcanic, volcanicLayer, requireVolcanic, weights, screen});
    self.postMessage({id, kind: "results", matches, criteria, eligibleCount, size: manifest.samples,
      query: query.map((value) => value * manifest.scale), landCount: manifest.worlds.earth.landCount});
  } catch {
    self.postMessage({id, kind: "error"});
  }
};
