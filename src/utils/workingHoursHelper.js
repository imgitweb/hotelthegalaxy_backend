// ─── utils/workingHoursHelper.js ─────────────────────────────────────────────
// Single source of truth for calculating working hours from dutyLogs.
// Logic: sum all (Available → Offline/CheckOut) windows.
// If shift is still active (no checkOutTime), use Date.now() as end.

/**
 * @param {Array}  dutyLogs    - Array of { action, time } objects from attendance doc
 * @param {Date|null} checkOutTime - null if shift still active
 * @returns {number} total working milliseconds
 */
const calculateWorkingMs = (dutyLogs = [], checkOutTime = null) => {
  let totalMs = 0;

  for (let i = 0; i < dutyLogs.length; i++) {
    if (dutyLogs[i].action === "Available") {
      const startTime = new Date(dutyLogs[i].time).getTime();
      let endTime = null;

      // Find the very next Offline or CheckOut after this Available
      for (let j = i + 1; j < dutyLogs.length; j++) {
        if (dutyLogs[j].action === "Offline" || dutyLogs[j].action === "CheckOut") {
          endTime = new Date(dutyLogs[j].time).getTime();
          i = j; // advance outer loop past this segment
          break;
        }
      }

      // Shift still running — live running hours
      if (endTime === null && !checkOutTime) {
        endTime = Date.now();
      }

      if (startTime && endTime && endTime > startTime) {
        totalMs += endTime - startTime;
      }
    }
  }

  return totalMs;
};

/**
 * Converts milliseconds to a human-readable string like "5h 30m"
 */
const msToHoursStr = (ms) => {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
};

/**
 * Converts milliseconds to decimal hours (e.g. 5.5)
 */
const msToHoursDecimal = (ms) => (ms / 3600000).toFixed(1);

module.exports = { calculateWorkingMs, msToHoursStr, msToHoursDecimal };