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

module.exports = {
    generateSlots
};
