import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { CoverageCell, FoodBank } from "@foodbankfinder/shared";
import L from "leaflet";
import {
  MapContainer,
  Marker,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents
} from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import { CoverageHeatmap } from "./CoverageHeatmap";
import { getFoodbankIcon } from "./foodbankIcon";

const ukCenter: [number, number] = [54.5, -3];
const VIEWPORT_FILTER_THRESHOLD = 3000;
const VIEWPORT_PADDING = 0.35;

interface FocusLocation {
  latitude: number;
  longitude: number;
}

interface FoodBankMapProps {
  foodBanks: FoodBank[];
  coverageCells?: CoverageCell[];
  layer: "foodbanks" | "coverage";
  selectedId?: string;
  userLocation: FocusLocation | null;
  focusLocation?: FocusLocation | null;
  onSelect: (foodBank: FoodBank) => void;
}

interface ViewportWatcherProps {
  onBoundsChange: (bounds: L.LatLngBounds) => void;
}

const ViewportWatcher = ({ onBoundsChange }: ViewportWatcherProps) => {
  const map = useMapEvents({
    moveend: () => onBoundsChange(map.getBounds()),
    zoomend: () => onBoundsChange(map.getBounds())
  });

  useEffect(() => {
    onBoundsChange(map.getBounds());
  }, [map, onBoundsChange]);

  return null;
};

interface RecenterOnLocationProps {
  location: FocusLocation | null;
}

const RecenterOnLocation = ({ location }: RecenterOnLocationProps) => {
  const map = useMap();
  const lastLocationRef = useRef<string>("");

  useEffect(() => {
    if (!location) return;

    const nextKey = `${location.latitude.toFixed(4)}:${location.longitude.toFixed(4)}`;
    if (lastLocationRef.current === nextKey) return;

    map.setView([location.latitude, location.longitude], 11, {
      animate: true
    });
    lastLocationRef.current = nextKey;
  }, [location, map]);

  return null;
};

const FoodBankMapComponent = ({
  foodBanks,
  coverageCells = [],
  layer,
  selectedId,
  userLocation,
  focusLocation,
  onSelect
}: FoodBankMapProps) => {
  const [bounds, setBounds] = useState<L.LatLngBounds | null>(null);

  const mappableFoodBanks = useMemo(
    () =>
      foodBanks.filter(
        (foodBank) =>
          foodBank.latitude != null &&
          foodBank.longitude != null &&
          Number.isFinite(foodBank.latitude) &&
          Number.isFinite(foodBank.longitude)
      ),
    [foodBanks]
  );

  const visibleFoodBanks = useMemo(() => {
    if (
      !bounds ||
      !bounds.isValid() ||
      mappableFoodBanks.length <= VIEWPORT_FILTER_THRESHOLD
    ) {
      return mappableFoodBanks;
    }

    const paddedBounds = bounds.pad(VIEWPORT_PADDING);
    const filtered = mappableFoodBanks.filter((foodBank) =>
      paddedBounds.contains([foodBank.latitude as number, foodBank.longitude as number])
    );

    return filtered.length ? filtered : mappableFoodBanks;
  }, [bounds, mappableFoodBanks]);

  const markerNodes = useMemo(
    () =>
      visibleFoodBanks.map((foodBank) => {
        const markerId = String(foodBank.id ?? "");

        return (
          <Marker
            key={markerId || `${foodBank.name}-${foodBank.latitude}-${foodBank.longitude}`}
            position={[foodBank.latitude as number, foodBank.longitude as number]}
            icon={getFoodbankIcon(foodBank.referral_type, foodBank.open_now)}
            zIndexOffset={markerId === selectedId ? 1000 : 0}
            eventHandlers={{
              click: () => onSelect(foodBank)
            }}
          >
            <Tooltip direction="top" offset={[0, -36]} opacity={0.95}>
              {foodBank.name}
            </Tooltip>
          </Marker>
        );
      }),
    [visibleFoodBanks, onSelect, selectedId]
  );

  return (
    <div className="map-frame relative h-[52vh] overflow-hidden rounded-2xl border border-white/20 lg:h-full">
      <MapContainer
        center={ukCenter}
        zoom={6}
        minZoom={5}
        maxZoom={18}
        scrollWheelZoom
        preferCanvas
        crs={L.CRS.EPSG3857}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; CARTO'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />

        <ViewportWatcher onBoundsChange={setBounds} />
        <RecenterOnLocation location={focusLocation ?? userLocation} />

        {layer === "coverage" ? (
          <CoverageHeatmap cells={coverageCells} />
        ) : (
          <MarkerClusterGroup
            chunkedLoading
            maxClusterRadius={65}
            spiderfyOnMaxZoom
            showCoverageOnHover={false}
          >
            {markerNodes}
          </MarkerClusterGroup>
        )}
      </MapContainer>

      <div className="pointer-events-none absolute bottom-3 left-3 rounded-xl border border-white/20 bg-slate-950/70 px-3 py-2 text-xs text-slate-200 backdrop-blur-xl">
        <p className="mb-1 font-semibold text-slate-100">Referral legend</p>
        <div className="space-y-1">
          <p className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-400" />
            Green - walk-in support available
          </p>
          <p className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400" />
            Amber - soft referral
          </p>
          <p className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-rose-400" />
            Red - referral required
          </p>
        </div>
      </div>
    </div>
  );
};

export const FoodBankMap = memo(FoodBankMapComponent);
