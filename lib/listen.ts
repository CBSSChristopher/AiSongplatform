/** Server + client shared listen-gate thresholds. */
export const LISTEN_MIN_SECONDS = 8;
export const LISTEN_MIN_FRACTION = 0.5;

export function meetsListenRequirement(listenedSeconds: number, durationSeconds = 0): boolean {
  const heard = Number.isFinite(listenedSeconds) ? Math.max(0, listenedSeconds) : 0;
  if (heard >= LISTEN_MIN_SECONDS) return true;
  const duration = Number.isFinite(durationSeconds) ? Math.max(0, durationSeconds) : 0;
  if (duration > 0 && heard >= duration * LISTEN_MIN_FRACTION) return true;
  return false;
}

export function listenRequirementHint(listenedSeconds: number, durationSeconds = 0): string {
  if (meetsListenRequirement(listenedSeconds, durationSeconds)) {
    return "Preview listened — checkout unlocked";
  }
  const heard = Math.max(0, listenedSeconds || 0);
  const duration = Math.max(0, durationSeconds || 0);
  const needByTime = LISTEN_MIN_SECONDS;
  const needByHalf = duration > 0 ? duration * LISTEN_MIN_FRACTION : needByTime;
  const remaining = Math.ceil(Math.min(needByTime, needByHalf) - heard);
  if (remaining <= 0) return "Almost there — keep playing";
  return `Play about ${remaining}s more to unlock checkout`;
}
