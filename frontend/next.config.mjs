// Keep the local handoff server independent from production build artifacts.
export default {
  distDir: process.env.FOODTOUR_PREVIEW === '1' ? '.next-preview' : '.next'
};
