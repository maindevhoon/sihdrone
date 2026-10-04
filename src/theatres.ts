// Operating theatres for the sensor view. Geographic theatres stream imagery and terrain onto the
// real location; the synthetic district is rendered locally. Coordinates are published locations
// (see `source`); the nominal elevation is only used until the real ground height is sampled.
export type TheatreKind = 'synthetic' | 'urban' | 'mountain' | 'desert' | 'plains';
export type TheatreId = 'district' | 'india-gate' | 'tololing' | 'galwan' | 'chamba' | 'nathu-la' | 'tawang' | 'longewala' | 'attari';
export type Theatre = {
  id: TheatreId; name: string; region: string; kind: TheatreKind; terrainLabel: string;
  latitude?: number; longitude?: number; elevation?: number; source?: string;
};

export const THEATRES: Theatre[] = [
  { id: 'district', name: 'Training district', region: 'Synthetic city block', kind: 'synthetic', terrainLabel: 'Synthetic urban' },
  { id: 'india-gate', name: 'India Gate', region: 'New Delhi', kind: 'urban', terrainLabel: 'Dense urban', latitude: 28.6126, longitude: 77.2268, elevation: 215 },
  { id: 'tololing', name: 'Tololing', region: 'Drass sector, Kargil, Ladakh', kind: 'mountain', terrainLabel: 'High-altitude ridgeline', latitude: 34.4709, longitude: 75.7952, elevation: 4500, source: 'Tololing Top, Drass (Mapcarta / OSM)' },
  { id: 'galwan', name: 'Galwan Valley', region: 'Galwan–Shyok confluence, Ladakh', kind: 'mountain', terrainLabel: 'High-altitude valley', latitude: 34.7492, longitude: 78.1656, elevation: 4000, source: 'Galwan River mouth (Wikipedia)' },
  { id: 'chamba', name: 'Chamba hills', region: 'Chamba district, Himachal Pradesh', kind: 'mountain', terrainLabel: 'Forested Himalayan ridges', latitude: 32.68549, longitude: 76.1662, elevation: 2000 },
  { id: 'nathu-la', name: 'Nathu La', region: 'Dongkya Range, Sikkim', kind: 'mountain', terrainLabel: 'High mountain pass', latitude: 27.38681, longitude: 88.83095, elevation: 4310, source: 'Nathu La (Wikipedia)' },
  { id: 'tawang', name: 'Tawang', region: 'Tawang district, Arunachal Pradesh', kind: 'mountain', terrainLabel: 'Mountain town and valley', latitude: 27.58833, longitude: 91.86528, elevation: 3000, source: 'Tawang (Wikipedia)' },
  { id: 'longewala', name: 'Longewala', region: 'Thar Desert, Jaisalmer, Rajasthan', kind: 'desert', terrainLabel: 'Open desert', latitude: 27.524942, longitude: 70.156693, elevation: 160, source: 'Battle of Longewala (Wikipedia)' },
  { id: 'attari', name: 'Attari', region: 'Attari–Wagah crossing, Punjab', kind: 'plains', terrainLabel: 'Border plains', latitude: 31.60464, longitude: 74.5731, elevation: 220, source: 'Attari–Wagah border ceremony (Wikipedia)' },
];
export const theatreById = (id: string) => THEATRES.find(t => t.id === id) ?? THEATRES[0];
export const isGeographic = (t: Theatre) => t.kind !== 'synthetic';

/** Camera framing per terrain: wider, higher views over mountains so slopes never fill the frame.
 *  Pitches stay at or below -12°, the satellite navigation's tilt limit. */
export type Framing = { heading: number; pitch: number; range: number };
export const cameraFraming: Record<Exclude<TheatreKind, 'synthetic'>, Record<'overview' | 'rooftop' | 'street', Framing>> = {
  urban: { overview: { heading: 0, pitch: -60, range: 1250 }, rooftop: { heading: 25, pitch: -18, range: 360 }, street: { heading: 0, pitch: -12, range: 200 } },
  mountain: { overview: { heading: 30, pitch: -30, range: 2600 }, rooftop: { heading: 35, pitch: -14, range: 1100 }, street: { heading: 10, pitch: -12, range: 650 } },
  desert: { overview: { heading: 30, pitch: -36, range: 1800 }, rooftop: { heading: 25, pitch: -15, range: 700 }, street: { heading: 0, pitch: -12, range: 350 } },
  plains: { overview: { heading: 30, pitch: -38, range: 1700 }, rooftop: { heading: 25, pitch: -16, range: 600 }, street: { heading: 0, pitch: -12, range: 300 } },
};
export const cameraLabels: Record<TheatreKind, Record<'overview' | 'rooftop' | 'street', string>> = {
  synthetic: { overview: 'Overview', rooftop: 'Rooftop', street: 'Street' },
  urban: { overview: 'Overview', rooftop: 'Rooftop', street: 'Street' },
  mountain: { overview: 'Overview', rooftop: 'Ridgeline', street: 'Ground' },
  desert: { overview: 'Overview', rooftop: 'Dune top', street: 'Ground' },
  plains: { overview: 'Overview', rooftop: 'Tower', street: 'Ground' },
};
/** Sample points (rings at 150 m and 320 m) used to set the airspace datum above the highest nearby ground. */
export function groundSamplePoints(t: Theatre) {
  const lat = t.latitude ?? 0, lon = t.longitude ?? 0, perLat = 111320, perLon = 111320*Math.cos(lat*Math.PI/180);
  const points: [number, number][] = [[lon, lat]];
  for (const radius of [150, 320]) for (let i = 0; i < 8; i++) {
    const a = i*Math.PI/4;
    points.push([lon + Math.sin(a)*radius/perLon, lat + Math.cos(a)*radius/perLat]);
  }
  return points;
}
