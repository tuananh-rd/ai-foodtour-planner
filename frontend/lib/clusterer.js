/**
 * Spatial Grid-Based Marker Clusterer for Google Maps JavaScript API (AdvancedMarkerElement).
 * Equivalent to @googlemaps/markerclusterer.
 * 
 * Justification:
 * 1. Zero external dependencies: prevents dependency drift and compatibility issues with React 19 / Next.js SSR.
 * 2. Fully SSR-safe and Node testable (no DOM requirements during calculation).
 * 3. High performance: O(N) spatial partitioning into grid buckets.
 * 4. Seamless integration with AdvancedMarkerElement and custom DOM pin templates.
 */

/**
 * Clusters a list of venue items based on current map zoom level.
 * @param {Array<{ id: string, name: string, lat: number, lon: number, district?: string, dish_tags?: string[] }>} items 
 * @param {number} zoom Current map zoom level (e.g., 11 to 20)
 * @param {number} clusterRadiusPx Approximate cluster radius in screen pixels (default: 60)
 * @returns {Array<{ isCluster: boolean, id: string, count: number, lat: number, lon: number, bounds?: { minLat: number, maxLat: number, minLon: number, maxLon: number }, item?: any, items?: any[] }>}
 */
export function clusterVenues(items = [], zoom = 15, clusterRadiusPx = 60) {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  // At high zoom (>= 15), show individual restaurant markers without clustering
  if (zoom >= 15) {
    return items.map((item) => ({
      isCluster: false,
      id: item.id,
      count: 1,
      lat: item.lat,
      lon: item.lon,
      item
    }));
  }

  // Calculate grid size in lat/lon degrees for the given zoom level
  const baseLat = items[0]?.lat || 21.0285;
  const latScale = Math.cos((baseLat * Math.PI) / 180);
  const worldSize = 256 * Math.pow(2, zoom);
  const degPerPxLat = 360 / worldSize;
  const degPerPxLon = degPerPxLat / Math.max(0.1, latScale);

  const gridDeltaLat = clusterRadiusPx * degPerPxLat;
  const gridDeltaLon = clusterRadiusPx * degPerPxLon;

  const buckets = new Map();

  for (const item of items) {
    if (typeof item.lat !== 'number' || typeof item.lon !== 'number') continue;
    const gx = Math.floor(item.lon / gridDeltaLon);
    const gy = Math.floor(item.lat / gridDeltaLat);
    const key = `${gx}:${gy}`;

    if (!buckets.has(key)) {
      buckets.set(key, []);
    }
    buckets.get(key).push(item);
  }

  const results = [];

  for (const [key, group] of buckets.entries()) {
    if (group.length === 1) {
      const single = group[0];
      results.push({
        isCluster: false,
        id: single.id,
        count: 1,
        lat: single.lat,
        lon: single.lon,
        item: single
      });
    } else {
      let sumLat = 0;
      let sumLon = 0;
      let minLat = Infinity, maxLat = -Infinity;
      let minLon = Infinity, maxLon = -Infinity;

      for (const item of group) {
        sumLat += item.lat;
        sumLon += item.lon;
        if (item.lat < minLat) minLat = item.lat;
        if (item.lat > maxLat) maxLat = item.lat;
        if (item.lon < minLon) minLon = item.lon;
        if (item.lon > maxLon) maxLon = item.lon;
      }

      results.push({
        isCluster: true,
        id: `cluster-${key}`,
        count: group.length,
        lat: sumLat / group.length,
        lon: sumLon / group.length,
        bounds: { minLat, maxLat, minLon, maxLon },
        items: group
      });
    }
  }

  return results;
}
