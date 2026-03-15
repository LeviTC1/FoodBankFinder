import type {
  OpeningHoursParsed,
  OpeningRange,
  WeekdayKey
} from "@foodbankfinder/shared";

const weekdayOrder: WeekdayKey[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday"
];

const weekdayAliases: Array<{ pattern: RegExp; day: WeekdayKey }> = [
  { pattern: /^mon(?:day)?$/, day: "monday" },
  { pattern: /^tue(?:s|sday)?$/, day: "tuesday" },
  { pattern: /^wed(?:nesday)?$/, day: "wednesday" },
  { pattern: /^thu(?:r|rs|rsday)?$/, day: "thursday" },
  { pattern: /^fri(?:day)?$/, day: "friday" },
  { pattern: /^sat(?:urday)?$/, day: "saturday" },
  { pattern: /^sun(?:day)?$/, day: "sunday" }
];

const dayTokenPattern =
  "(mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)";

const dayRangeRegex = new RegExp(
  `\\b${dayTokenPattern}(?:\\s*(?:-|to)\\s*${dayTokenPattern})?\\b`,
  "gi"
);

const timeRangeRegex =
  /(\d{1,2}(?::\d{2})?(?:\s*[ap]m)?)\s*(?:-|–|—|to)\s*(\d{1,2}(?::\d{2})?(?:\s*[ap]m)?)/gi;

const isClosedToken = (value: string): boolean =>
  /\b(closed|appointment|tbc|unknown|none|n\/a)\b/i.test(value);

const toDay = (token?: string | null): WeekdayKey | null => {
  if (!token) return null;
  const normalized = token.trim().toLowerCase().replace(/\.$/, "");
  for (const alias of weekdayAliases) {
    if (alias.pattern.test(normalized)) {
      return alias.day;
    }
  }
  return null;
};

const expandDays = (
  startToken?: string | null,
  endToken?: string | null
): WeekdayKey[] => {
  const startDay = toDay(startToken);
  if (!startDay) return [];

  const endDay = toDay(endToken);
  if (!endDay || endDay === startDay) {
    return [startDay];
  }

  const startIndex = weekdayOrder.indexOf(startDay);
  const endIndex = weekdayOrder.indexOf(endDay);
  if (startIndex < 0 || endIndex < 0) {
    return [startDay];
  }

  if (startIndex <= endIndex) {
    return weekdayOrder.slice(startIndex, endIndex + 1);
  }

  return [...weekdayOrder.slice(startIndex), ...weekdayOrder.slice(0, endIndex + 1)];
};

interface ParsedTime {
  minutes: number;
  normalized: string;
  meridiem: "am" | "pm" | null;
}

const parseTime = (
  value: string,
  meridiemHint: "am" | "pm" | null = null
): ParsedTime | null => {
  const compact = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/\./g, ":");
  const match = compact.match(/^(\d{1,2})(?::(\d{2}))?([ap]m)?$/);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  const explicitMeridiem = (match[3] ?? null) as "am" | "pm" | null;
  const meridiem = explicitMeridiem ?? meridiemHint;

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  if (meridiem) {
    if (hour > 12) return null;
    if (hour === 12) {
      hour = meridiem === "am" ? 0 : 12;
    } else if (meridiem === "pm") {
      hour += 12;
    }
  }

  const normalized = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return {
    minutes: hour * 60 + minute,
    normalized,
    meridiem: explicitMeridiem
  };
};

const parseRange = (startRaw: string, endRaw: string): OpeningRange | null => {
  const endParsed = parseTime(endRaw);
  if (!endParsed) return null;

  let startParsed = parseTime(startRaw, endParsed.meridiem ?? null);
  if (!startParsed) return null;

  const hasStartMeridiem = /[ap]m/i.test(startRaw);
  if (!hasStartMeridiem && endParsed.meridiem === "pm" && startParsed.minutes > endParsed.minutes) {
    const startWithoutHint = parseTime(startRaw);
    if (startWithoutHint && startWithoutHint.minutes < endParsed.minutes) {
      startParsed = startWithoutHint;
    }
  }

  return {
    start: startParsed.normalized,
    end: endParsed.normalized
  };
};

const normalizeInput = (input: string): string =>
  input
    .replace(/\u202f/g, " ")
    .replace(/\u2009/g, " ")
    .replace(/[|]/g, ";")
    .replace(/\s+/g, " ")
    .replace(/\s*;\s*/g, ";")
    .trim();

const appendRanges = (
  parsed: OpeningHoursParsed,
  day: WeekdayKey,
  ranges: OpeningRange[]
) => {
  if (!ranges.length) return;
  const existing = parsed[day] ?? [];
  parsed[day] = [...existing, ...ranges];
};

export const parseOpeningHours = (
  openingHours?: string | null
): OpeningHoursParsed | null => {
  if (!openingHours) return null;

  const input = normalizeInput(openingHours);
  if (!input || isClosedToken(input)) {
    return null;
  }

  const dayMatches = Array.from(input.matchAll(dayRangeRegex));
  if (!dayMatches.length) {
    return null;
  }

  const parsed: OpeningHoursParsed = {};

  dayMatches.forEach((match, index) => {
    const segmentStart = match.index ?? 0;
    const segmentEnd =
      dayMatches[index + 1]?.index != null ? dayMatches[index + 1].index : input.length;
    const segment = input.slice(segmentStart, segmentEnd);

    if (!segment || isClosedToken(segment)) {
      return;
    }

    const days = expandDays(match[1], match[2]);
    if (!days.length) {
      return;
    }

    const ranges: OpeningRange[] = [];
    for (const timeMatch of segment.matchAll(timeRangeRegex)) {
      const range = parseRange(timeMatch[1], timeMatch[2]);
      if (range) {
        ranges.push(range);
      }
    }

    days.forEach((day) => appendRanges(parsed, day, ranges));
  });

  return Object.keys(parsed).length ? parsed : null;
};
