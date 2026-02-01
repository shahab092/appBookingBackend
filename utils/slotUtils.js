/**
 * Generates time slots between startTime and endTime based on duration.
 * @param {string} startTime - Start time in HH:mm format (e.g., "09:00")
 * @param {string} endTime - End time in HH:mm format (e.g., "17:00")
 * @param {number} duration - Duration of each slot in minutes
 * @returns {string[]} - Array of time strings
 */
const generateSlots = (startTime, endTime, duration) => {
    const slots = [];
    let current = new Date(`2000-01-01T${startTime}:00`);
    const end = new Date(`2000-01-01T${endTime}:00`);

    while (current < end) {
        const hours = current.getHours().toString().padStart(2, '0');
        const minutes = current.getMinutes().toString().padStart(2, '0');
        slots.push(`${hours}:${minutes}`);
        current.setMinutes(current.getMinutes() + duration);
    }

    return slots;
};

/**
 * Converts any time string (12h or 24h) to a standardized 24h HH:mm format.
 * @param {string} timeStr - Time string (e.g., "02:00 PM", "14:00", "2:00 Pm")
 * @returns {string} - Standardized 24h time string (e.g., "14:00")
 */
const convertTo24Hour = (timeStr) => {
    if (!timeStr) return null;

    // Check if it's already HH:mm and not containing AM/PM
    const timeClean = timeStr.trim().toUpperCase();
    const is12Hour = timeClean.includes('AM') || timeClean.includes('PM');

    if (!is12Hour) {
        // Assume it's already 24h, just ensure HH:mm
        const [h, m] = timeClean.split(':');
        return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
    }

    // Handle 12-hour format
    const match = timeClean.match(/(\d+):(\d+)\s*(AM|PM)/);
    if (!match) return timeClean; // Fallback

    let hours = parseInt(match[1]);
    const minutes = match[2];
    const modifier = match[3];

    if (hours === 12) {
        hours = 0;
    }

    if (modifier === 'PM') {
        hours += 12;
    }

    return `${hours.toString().padStart(2, '0')}:${minutes}`;
};

module.exports = {
    generateSlots,
    convertTo24Hour
};
