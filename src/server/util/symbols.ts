export const REFUSED: unique symbol = Symbol('Refused');
export const SCORE_SYSTEM_CHANGE: unique symbol = Symbol(
  'Score System Changed'
);
export const MISSING: unique symbol = Symbol('Missing observation');
export const NO_READINGS_FOR_24_HOURS: unique symbol = Symbol(
  'No readings for 24 hours'
);

export type REFUSED = typeof REFUSED;
export type SCORE_SYSTEM_CHANGE = typeof SCORE_SYSTEM_CHANGE;
export type MISSING = typeof MISSING;
export type NO_READINGS_FOR_24_HOURS = typeof NO_READINGS_FOR_24_HOURS;
export type SpecialValue =
  | REFUSED
  | SCORE_SYSTEM_CHANGE
  | MISSING
  | NO_READINGS_FOR_24_HOURS;

export function isSpecialValue(r: unknown): r is SpecialValue {
  switch (r) {
    case REFUSED:
    case SCORE_SYSTEM_CHANGE:
    case MISSING:
    case NO_READINGS_FOR_24_HOURS:
      return true;
  }
  return false;
}
