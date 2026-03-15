import type { FoodBank, OpeningHoursParsed, WeekdayKey } from "@foodbankfinder/shared";
import { parseOpeningHours } from "./parseOpeningHours.js";

const weekdayOrder: WeekdayKey[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday"
];

const parseMinutes = (value: string): number | null => {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }
  return hours * 60 + minutes;
};

const getWeekday = (at: Date): WeekdayKey => weekdayOrder[at.getDay()] ?? "monday";

const isWithinRange = (timeNow: number, start: number, end: number): boolean => {
  if (start === end) return false;
  if (start < end) {
    return timeNow >= start && timeNow < end;
  }
  return timeNow >= start || timeNow < end;
};

const resolveParsedHours = (
  foodbank: Pick<FoodBank, "opening_hours" | "opening_hours_parsed">
): OpeningHoursParsed | null =>
  foodbank.opening_hours_parsed ?? parseOpeningHours(foodbank.opening_hours);

export const isOpenNow = (
  foodbank: Pick<FoodBank, "opening_hours" | "opening_hours_parsed">,
  at: Date = new Date()
): boolean => {
  const parsed = resolveParsedHours(foodbank);
  if (!parsed) return false;

  const weekday = getWeekday(at);
  const ranges = parsed[weekday];
  if (!ranges || ranges.length === 0) return false;

  const nowMinutes = at.getHours() * 60 + at.getMinutes();

  return ranges.some((range) => {
    const start = parseMinutes(range.start);
    const end = parseMinutes(range.end);
    if (start == null || end == null) return false;
    return isWithinRange(nowMinutes, start, end);
  });
};
