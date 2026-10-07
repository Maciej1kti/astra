/** A coarse world for choosing a timezone: land as dots, cities as places. */

/** Degrees of one dot; the map is an equirectangular grid of them. */
export const mapStep = 5;
export const mapNorth = 85;
export const mapSouth = -60;

/**
 * Land by band of latitude: the band's southern edge, then pairs of western and
 * eastern longitude. Drawn at five degrees it only has to read as a world.
 */
const land: readonly (readonly number[])[] = [
  [80, -90, -62, -60, -20],
  [75, -120, -80, -70, -20, 12, 25, 95, 108],
  [70, -125, -75, -55, -22, 52, 58, 68, 130, 135, 150],
  [65, -165, -62, -52, -25, 14, 180],
  [60, -165, -92, -80, -64, -50, -42, -23, -14, 5, 178],
  [55, -160, -153, -135, -93, -78, -60, -7, -2, 8, 140, 156, 163],
  [50, -128, -56, -10, 1, 4, 140, 156, 160],
  [45, -124, -60, -59, -53, -2, 140, 141, 145],
  [40, -124, -70, -9, 3, 9, 28, 41, 49, 54, 132, 140, 145],
  [35, -122, -76, -9, 0, 13, 16, 21, 24, 27, 122, 126, 129, 137, 141],
  [30, -117, -80, -9, 12, 20, 23, 35, 122, 130, 136],
  [25, -113, -97, -82, -80, -13, 34, 35, 120],
  [20, -106, -97, -84, -76, -17, 37, 39, 59, 69, 116, 120, 121],
  [15, -104, -88, -74, -69, -17, 38, 42, 55, 73, 84, 94, 108, 120, 122],
  [10, -90, -83, -17, 48, 75, 80, 98, 109, 121, 125],
  [5, -84, -60, -13, 48, 80, 82, 99, 103, 124, 126],
  [0, -79, -50, 9, 46, 97, 104, 109, 118, 120, 128],
  [-5, -80, -45, 9, 41, 100, 106, 110, 117, 119, 123, 130, 142],
  [-10, -80, -35, 13, 39, 106, 114, 138, 148],
  [-15, -77, -37, 13, 40, 48, 50, 130, 137, 142, 144],
  [-20, -75, -39, 12, 40, 44, 50, 122, 146],
  [-25, -70, -41, 14, 35, 43, 48, 114, 150],
  [-30, -71, -48, 15, 33, 114, 153],
  [-35, -72, -51, 18, 30, 115, 152],
  [-40, -73, -57, 140, 150, 174, 178],
  [-45, -74, -63, 145, 148, 170, 174],
  [-50, -75, -66, 167, 170],
  [-55, -74, -68],
];

export type MapPoint = { x: number; y: number };

/** Map coordinates: x grows east from 180°W, y grows south from the top edge. */
export const mapPoint = (latitude: number, longitude: number): MapPoint => ({
  x: longitude + 180,
  y: mapNorth - latitude,
});

/** The centre of every dot of land. */
export function landDots(): MapPoint[] {
  const dots: MapPoint[] = [];
  for (const [south = 0, ...spans] of land)
    // A cell is land when one span covers at least a degree of it.
    for (let cell = -180; cell < 180; cell += mapStep)
      for (let index = 0; index + 1 < spans.length; index += 2) {
        const west = spans[index] ?? 0;
        const east = spans[index + 1] ?? west;
        if (Math.min(cell + mapStep, east) - Math.max(cell, west) < 1) continue;
        dots.push(mapPoint(south + mapStep / 2, cell + mapStep / 2));
        break;
      }
  return dots;
}

/** Places a click on the map can mean, each a well-known zone of its region. */
export const cities: readonly (readonly [string, number, number])[] = [
  ["Pacific/Honolulu", 21, -158],
  ["America/Anchorage", 61, -150],
  ["America/Vancouver", 49, -123],
  ["America/Los_Angeles", 34, -118],
  ["America/Phoenix", 33, -112],
  ["America/Denver", 40, -105],
  ["America/Mexico_City", 19, -99],
  ["America/Chicago", 42, -88],
  ["America/Toronto", 44, -79],
  ["America/New_York", 41, -74],
  ["America/Bogota", 5, -74],
  ["America/Lima", -12, -77],
  ["America/Santiago", -33, -71],
  ["America/Halifax", 45, -64],
  ["America/Sao_Paulo", -24, -47],
  ["America/Argentina/Buenos_Aires", -35, -58],
  ["Atlantic/Azores", 38, -26],
  ["Atlantic/Reykjavik", 64, -22],
  ["Europe/Lisbon", 39, -9],
  ["Europe/London", 51, 0],
  ["Europe/Madrid", 40, -4],
  ["Europe/Paris", 49, 2],
  ["Europe/Berlin", 52, 13],
  ["Europe/Rome", 42, 12],
  ["Europe/Stockholm", 59, 18],
  ["Europe/Warsaw", 52, 21],
  ["Europe/Athens", 38, 24],
  ["Europe/Helsinki", 60, 25],
  ["Europe/Istanbul", 41, 29],
  ["Europe/Moscow", 56, 38],
  ["Africa/Lagos", 6, 3],
  ["Africa/Cairo", 30, 31],
  ["Africa/Nairobi", -1, 37],
  ["Africa/Johannesburg", -26, 28],
  ["Asia/Dubai", 25, 55],
  ["Asia/Tehran", 36, 51],
  ["Asia/Yekaterinburg", 57, 61],
  ["Asia/Karachi", 25, 67],
  ["Asia/Kolkata", 22, 88],
  ["Asia/Novosibirsk", 55, 83],
  ["Asia/Bangkok", 14, 100],
  ["Asia/Singapore", 1, 104],
  ["Asia/Hong_Kong", 22, 114],
  ["Asia/Shanghai", 31, 121],
  ["Asia/Seoul", 37, 127],
  ["Asia/Vladivostok", 43, 132],
  ["Asia/Tokyo", 36, 140],
  ["Australia/Perth", -32, 116],
  ["Australia/Adelaide", -35, 139],
  ["Australia/Sydney", -34, 151],
  ["Pacific/Auckland", -37, 175],
];

/** The known place nearest a point of the map, among zones this browser has. */
export function nearestCity(
  point: MapPoint,
  available: (zone: string) => boolean = () => true,
): string | null {
  let best: string | null = null;
  let distance = Infinity;
  for (const [zone, latitude, longitude] of cities) {
    if (!available(zone)) continue;
    const place = mapPoint(latitude, longitude);
    const d = (place.x - point.x) ** 2 + (place.y - point.y) ** 2;
    if (d < distance) {
      distance = d;
      best = zone;
    }
  }
  return best;
}

/** Minutes east of UTC at `date`, or null when the zone is not a known one. */
export function zoneOffset(zone: string, date: Date): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(date);
    const read = (type: string) =>
      Number(parts.find((part) => part.type === type)?.value);
    const local = Date.UTC(
      read("year"),
      read("month") - 1,
      read("day"),
      read("hour"),
      read("minute"),
      read("second"),
    );
    return Math.round((local - Math.floor(date.getTime() / 1000) * 1000) / 6e4);
  } catch {
    return null;
  }
}

/** `UTC+2`, `UTC−3:30`, `UTC`. */
export function offsetLabel(minutes: number): string {
  if (!minutes) return "UTC";
  const size = Math.abs(minutes);
  const rest = size % 60;
  return `UTC${minutes > 0 ? "+" : "−"}${Math.floor(size / 60)}${rest ? `:${String(rest).padStart(2, "0")}` : ""}`;
}

/** Every zone this browser can name; empty where it cannot list them. */
export function knownZones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return [];
  }
}
