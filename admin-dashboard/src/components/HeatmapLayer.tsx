import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';

interface HeatmapLayerProps {
  points: Array<[number, number, number?]>; // [lat, lng, intensity?]
}

/** Thin wrapper so leaflet.heat (a plain Leaflet plugin, not a React component) plays nicely inside react-leaflet's <MapContainer>. */
export default function HeatmapLayer({ points }: HeatmapLayerProps) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) return;
    // @ts-expect-error — leaflet.heat augments L with heatLayer at runtime; @types/leaflet.heat covers the layer type but not the L.heatLayer factory augmentation cleanly across versions.
    const layer = L.heatLayer(points, { radius: 28, blur: 22, maxZoom: 16, gradient: { 0.2: '#2563EB', 0.5: '#F59E0B', 0.85: '#E11D3C' } });
    layer.addTo(map);
    return () => {
      map.removeLayer(layer);
    };
  }, [map, points]);

  return null;
}
