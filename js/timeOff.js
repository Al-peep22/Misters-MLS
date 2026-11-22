const timeOffDates = {
    today() {
        const date = new Date();
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    },

    parse(value) {
        if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
        const [year, month, day] = value.split("-").map(Number);
        const date = new Date(year, month - 1, day);
        if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
        date.setHours(0, 0, 0, 0);
        return date;
    },

    isRange(start, end) {
        return Boolean(this.parse(start) && this.parse(end) && start <= end);
    },

    canSave(start, end, existingStart = null) {
        const today = this.today();
        return this.isRange(start, end) && end >= today
            && (start >= today || start === existingStart);
    },

    updateInputs(startInput, endInput, existingStart = null) {
        const today = this.today();
        startInput.min = existingStart && existingStart < today ? existingStart : today;
        endInput.min = startInput.value > today ? startInput.value : today;
    },

    removeExpired(employeeData) {
        const today = this.today();
        let removed = 0;
        ["GSS", "GSS_key_holder", "Manager"].forEach(group => {
            (employeeData[group] || []).forEach(employee => {
                if (!Array.isArray(employee.timeOff)) return;
                employee.timeOff = employee.timeOff.filter(period => {
                    if (period && this.isRange(period.start_date, period.end_date) && period.end_date < today) {
                        removed++;
                        return false;
                    }
                    return true;
                });
            });
        });
        return removed;
    }
};
