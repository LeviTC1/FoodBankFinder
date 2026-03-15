import { useEffect, useMemo } from "react";
import type { CoverageCell } from "@foodbankfinder/shared";
import L from "leaflet";
import "leaflet.heat";
import { useMap } from "react-leaflet";

interface CoverageHeatmapProps {
  cells: CoverageCell[];
}

export const CoverageHeatmap = ({ cells }: CoverageHeatmapProps) => {
  const map = useMap();

  const points = useMemo(
    () =>
      cells
        .filter((cell) => Number.isFinite(cell.lat) && Number.isFinite(cell.lng))
        .map(
          (cell) =>
            [cell.lat, cell.lng, Math.max(0.08, Math.min(1, cell.coverage_score))] as [
              number,
              number,
              number
            ]
        ),
    [cells]
  );

  useEffect(() => {
    if (!points.length) return;

    const layer = L.heatLayer(points, {
      radius: 24,
      blur: 18,
      maxZoom: 11,
      minOpacity: 0.35,
      gradient: {
        0.1: "#ef4444",
        0.45: "#f59e0b",
        0.75: "#84cc16",
        1: "#22c55e"
      }
    });

    layer.addTo(map);
    return () => {
      map.removeLayer(layer);
    };
  }, [map, points]);

  return null;
};
