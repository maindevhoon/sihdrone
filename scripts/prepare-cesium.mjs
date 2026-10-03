import { cpSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
mkdirSync(`${root}/public/cesium`, { recursive: true });
for (const directory of ['Assets', 'Workers', 'ThirdParty', 'Widgets']) {
  cpSync(`${root}/node_modules/cesium/Build/Cesium/${directory}`, `${root}/public/cesium/${directory}`, { recursive: true });
}
