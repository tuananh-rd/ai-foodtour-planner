// Keep the local handoff server independent from production build artifacts.
export default {
  distDir: process.env.FOODTOUR_PREVIEW === '1' ? '.next-preview' : '.next',
  async headers() {
    return [
      {
        source: '/maps/hoankiem-20261018.pmtiles',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable'
          }
        ]
      },
      {
        source: '/maps/maplibre-gl-worker-6.15.0.mjs',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable'
          }
        ]
      }
    ];
  }
};
