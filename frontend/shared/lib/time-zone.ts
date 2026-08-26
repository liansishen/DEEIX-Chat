export function detectCurrentTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Etc/UTC";
  } catch {
    return "Etc/UTC";
  }
}

type DateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function dateTimePartsInTimeZone(value: Date, timeZone: string): DateTimeParts | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(value);
    const values = Object.fromEntries(
      parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number.parseInt(part.value, 10)]),
    );
    if (!["year", "month", "day", "hour", "minute", "second"].every((key) => Number.isFinite(values[key]))) {
      return null;
    }
    return values as DateTimeParts;
  } catch {
    return null;
  }
}

function dateTimePartsToUTC(parts: DateTimeParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

export function formatDateTimeLocalInTimeZone(value: string, timeZone: string): string {
  const date = new Date(value);
  const parts = dateTimePartsInTimeZone(date, timeZone);
  if (Number.isNaN(date.getTime()) || !parts) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function parseDateTimeLocalInTimeZone(value: string, timeZone: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const requested: DateTimeParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: 0,
  };
  const naiveUTC = dateTimePartsToUTC(requested);
  if (!Number.isFinite(naiveUTC)) return null;

  let candidateUTC = naiveUTC;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actual = dateTimePartsInTimeZone(new Date(candidateUTC), timeZone);
    if (!actual) return null;
    const offset = dateTimePartsToUTC(actual) - candidateUTC;
    const nextCandidateUTC = naiveUTC - offset;
    if (nextCandidateUTC === candidateUTC) break;
    candidateUTC = nextCandidateUTC;
  }

  const resolved = dateTimePartsInTimeZone(new Date(candidateUTC), timeZone);
  if (!resolved || dateTimePartsToUTC(resolved) !== naiveUTC) return null;
  return new Date(candidateUTC);
}

export function resolveTimeZoneOptions(): string[] {
  const options = new Set<string>(["Etc/UTC"]);
  const intlWithSupportedValues = Intl as typeof Intl & {
    supportedValuesOf?: (key: "timeZone") => string[];
  };

  for (const timeZone of intlWithSupportedValues.supportedValuesOf?.("timeZone") ?? []) {
    options.add(timeZone);
  }

  return Array.from(options).sort((left, right) => left.localeCompare(right));
}
