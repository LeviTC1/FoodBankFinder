import { pool, withClient } from "../backend/src/database/pool.js";

interface CoveragePoint {
  lat: number;
  lng: number;
}

const UK_BOUNDS = {
  minLat: 49.8,
  maxLat: 59.3,
  minLng: -8.8,
  maxLng: 1.9
};

const GRID_SPACING_KM = Number(process.env.COVERAGE_GRID_KM ?? 10);
const GAP_THRESHOLD_KM = Number(process.env.COVERAGE_GAP_THRESHOLD_KM ?? 15);
const SCORE_MAX_DISTANCE_KM = Number(process.env.COVERAGE_SCORE_MAX_DISTANCE_KM ?? 30);
const LAND_PROXIMITY_CAP_KM = Number(process.env.COVERAGE_LAND_PROXIMITY_KM ?? 80);
const BATCH_SIZE = 1200;

const KM_PER_LAT_DEGREE = 110.574;

const round = (value: number): number => Number(value.toFixed(5));

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const generateGrid = (): CoveragePoint[] => {
  const points: CoveragePoint[] = [];
  const latStep = GRID_SPACING_KM / KM_PER_LAT_DEGREE;

  for (let lat = UK_BOUNDS.minLat; lat <= UK_BOUNDS.maxLat; lat += latStep) {
    const kmPerLngDegree = 111.32 * Math.cos((lat * Math.PI) / 180);
    const lngStep = GRID_SPACING_KM / Math.max(kmPerLngDegree, 0.01);

    for (let lng = UK_BOUNDS.minLng; lng <= UK_BOUNDS.maxLng; lng += lngStep) {
      points.push({
        lat: round(lat),
        lng: round(lng)
      });
    }
  }

  return points;
};

const insertCoverageBatch = async (
  batch: CoveragePoint[],
  scoreMaxDistanceKm: number,
  landProximityCapKm: number
) => {
  if (!batch.length) return 0;

  const latArray = batch.map((point) => point.lat);
  const lngArray = batch.map((point) => point.lng);

  const res = await pool.query<{ inserted: number }>(
    `
      INSERT INTO coverage_cells (
        lat,
        lng,
        geom,
        distance_to_foodbank,
        coverage_score,
        created_at,
        updated_at
      )
      SELECT
        points.lat,
        points.lng,
        geom_source.geom,
        nearest.distance_km,
        GREATEST(0, LEAST(1, 1 - (nearest.distance_km / $3::double precision))) AS coverage_score,
        NOW(),
        NOW()
      FROM UNNEST($1::double precision[], $2::double precision[]) AS points(lat, lng)
      CROSS JOIN LATERAL (
        SELECT ST_SetSRID(ST_MakePoint(points.lng, points.lat), 4326)::geography AS geom
      ) AS geom_source
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(ST_Distance(geom_source.geom, foodbanks.geom) / 1000, $3::double precision) AS distance_km
        FROM foodbanks
        WHERE foodbanks.geom IS NOT NULL
        ORDER BY geom_source.geom <-> foodbanks.geom
        LIMIT 1
      ) AS nearest ON true
      WHERE nearest.distance_km <= $4::double precision
      RETURNING 1
    `,
    [latArray, lngArray, scoreMaxDistanceKm, landProximityCapKm]
  );

  return res.rowCount ?? 0;
};

const main = async () => {
  if (!Number.isFinite(GRID_SPACING_KM) || GRID_SPACING_KM <= 0) {
    throw new Error("COVERAGE_GRID_KM must be a positive number.");
  }

  const points = generateGrid();
  const scoreMaxDistance = clamp(SCORE_MAX_DISTANCE_KM, 1, 200);
  const landProximityCap = clamp(LAND_PROXIMITY_CAP_KM, scoreMaxDistance, 300);

  await withClient(async (client) => {
    await client.query("BEGIN");
    try {
      await client.query("TRUNCATE TABLE coverage_cells");
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });

  let totalInserted = 0;
  for (let i = 0; i < points.length; i += BATCH_SIZE) {
    const batch = points.slice(i, i + BATCH_SIZE);
    totalInserted += await insertCoverageBatch(batch, scoreMaxDistance, landProximityCap);
  }

  const stats = await pool.query<{
    cells: number;
    avg_distance_km: number;
    gaps: number;
  }>(
    `
      SELECT
        COUNT(*)::int AS cells,
        COALESCE(AVG(distance_to_foodbank), 0)::float AS avg_distance_km,
        COUNT(*) FILTER (WHERE distance_to_foodbank > $1)::int AS gaps
      FROM coverage_cells
    `,
    [GAP_THRESHOLD_KM]
  );

  const payload = {
    grid_spacing_km: GRID_SPACING_KM,
    score_max_distance_km: scoreMaxDistance,
    land_proximity_cap_km: landProximityCap,
    gap_threshold_km: GAP_THRESHOLD_KM,
    generated_points: points.length,
    inserted_cells: totalInserted,
    cells: stats.rows[0]?.cells ?? 0,
    average_distance_km: Number((stats.rows[0]?.avg_distance_km ?? 0).toFixed(2)),
    gaps_detected: stats.rows[0]?.gaps ?? 0,
    finished_at: new Date().toISOString()
  };

  console.log(JSON.stringify(payload, null, 2));
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
