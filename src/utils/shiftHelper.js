// ─── utils/shiftHelper.js ────────────────────────────────────────────────────
// Day Shift:   Check-in between 06:00 AM – 09:59 PM  (360 min – 1319 min)
// Night Shift: Check-in between 10:00 PM – 05:59 AM  (1320 min+ OR 0–359 min)

const detectShift = (date) => {
  const hour = date.getHours();
  const minute = date.getMinutes();
  const totalMinutes = hour * 60 + minute;

  // Night shift window: 22:00 (1320) onwards OR before 06:00 (360)
  if (totalMinutes >= 1320 || totalMinutes < 360) {
    return "Night";
  }
  return "Day";
};

/**
 * Returns the canonical "shift date" — always the date when the shift STARTED.
 * For night shifts that began before midnight, shiftDate = check-in date (correct).
 * For night shifts that began after midnight (e.g. 01:00 AM next day still same night),
 * we subtract one day so the shift groups with its starting evening.
 */
const getShiftDate = (date) => {
  const shift = detectShift(date);
  const hour = date.getHours();

  if (shift === "Night" && hour < 6) {
    // Past-midnight portion of a night shift → belongs to previous calendar day
    const prev = new Date(date);
    prev.setDate(prev.getDate() - 1);
    return prev.toLocaleDateString("en-CA"); // YYYY-MM-DD
  }
  return date.toLocaleDateString("en-CA");
};

module.exports = { detectShift, getShiftDate };