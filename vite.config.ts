import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Stable vendor chunks: app changes no longer invalidate the cached 3D libraries after a deploy.
// Cesium stays inside the lazily loaded Earth view chunk.
const vendor = (id: string) => {
  if (!id.includes('node_modules')) return undefined;
  if (/node_modules\/(three|three-stdlib)\//.test(id)) return 'vendor-three';
  if (/node_modules\/@react-three\//.test(id)) return 'vendor-r3f';
  if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'vendor-react';
  return undefined;
};
export default defineConfig({
  plugins: [react()],
  define: { CESIUM_BASE_URL: JSON.stringify('/cesium/') },
  build: { rollupOptions: { output: { manualChunks: vendor } } },
});
