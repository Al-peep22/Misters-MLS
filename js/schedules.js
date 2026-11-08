// ===============================
// LOAD JSON FILES
// ===============================

// Load JSON file helper
async function loadJSON(path) {
    const response = await fetch(path);
    return await response.json();
}

// Global data
let scheduleWeeks = {};
let employees = {};
let defaultShifts = {};

let currentWeekId = null;
let selectedShift = null;
let selectedEmployeeId = null;
let scheduleLocked = false;
let employeePendingDeletion = null;
let activeDetailsEmployee = null;
let activeDetailsGroupKey = null;
let timeOffDraft = [];
let editingTimeOffIndex = null;
let pendingProfileImage = "";
let profileImageRead = Promise.resolve();
const undoHistoryLimit = 50;
let undoHistory = [];
let redoHistory = [];
let undoHistoryReady = false;
let undoHistoryUpdateQueued = false;
let restoringUndoState = false;
const schedulePreferencesKey = "schedulePreferences";
const scheduleDays = [
    { key: "sun", label: "Sunday" },
    { key: "mon", label: "Monday" },
    { key: "tue", label: "Tuesday" },
    { key: "wed", label: "Wednesday" },
    { key: "thu", label: "Thursday" },
    { key: "fri", label: "Friday" },
    { key: "sat", label: "Saturday" }
];
const scheduleTimes = Array.from({ length: 16 }, (_, index) =>
    `${String(index + 6).padStart(2, "0")}:00`
);
const employeeColors = [
    { value: "#52B8DA", label: "Sky Blue" }, { value: "#1212DE", label: "Electric Blue" },
    { value: "#12DE12", label: "Bright Green" }, { value: "#DE6712", label: "Orange" },
    { value: "#C878E2", label: "Light Purple" }, { value: "#E2E278", label: "Pale Yellow" },
    { value: "#3EEFB4", label: "Mint" }, { value: "#1F5093", label: "Navy" },
    { value: "#46931F", label: "Olive Green" }, { value: "#1256DE", label: "Royal Blue" },
    { value: "#93761F", label: "Dark Mustard" }, { value: "#ABDE12", label: "Lime" },
    { value: "#1F9376", label: "Teal" }, { value: "#C33EEF", label: "Violet" },
    { value: "#6D1F93", label: "Plum" }, { value: "#DEAB12", label: "Gold" },
    { value: "#68A2F3", label: "Periwinkle" }, { value: "#F3A268", label: "Light Orange" },
    { value: "#3EEFEF", label: "Turquoise" }, { value: "#3EEF79", label: "Spring Green" },
    { value: "#98A50D", label: "Dark Lime" }, { value: "#9CE278", label: "Light Green" },
    { value: "#270DA5", label: "Indigo" }, { value: "#93501F", label: "Brown" },
    { value: "#7878E2", label: "Light Indigo" }, { value: "#1F3393", label: "Deep Blue" },
    { value: "#1F6D93", label: "Steel Blue" }, { value: "#EFE13E", label: "Yellow" },
    { value: "#5EC62A", label: "Leaf Green" }, { value: "#0DA559", label: "Emerald" },
    { value: "#9668F3", label: "Purple" }, { value: "#1F8A93", label: "Deep Teal" }
];


// ===============================
// INITIALIZATION
// ===============================

document.addEventListener("DOMContentLoaded", async () => {

    // Check login
    const user = localStorage.getItem("mistersUser");
    if (!user) {
        window.location.href = "index.html";
        return;
    }

    applyScheduleTheme(getSchedulePreferences().theme);

    // Load JSON files
    scheduleWeeks = JSON.parse(localStorage.getItem("scheduleWeeks") || "null")
        || await loadJSON("./json/scheduleWeeks.json");
    const savedEmployees = localStorage.getItem("employees");
    employees = savedEmployees === null
        ? await loadJSON("./json/employees.json")
        : JSON.parse(savedEmployees);
    if (savedEmployees === null) {
        localStorage.setItem("employees", JSON.stringify(employees));
    }
    if (!ensureUniqueEmployeeColors()) {
        showScheduleError("There are more employees than unique schedule colors. Add more colors to the palette before assigning colors.");
    }
    window.dispatchEvent(new CustomEvent("employee-colors-changed"));
    defaultShifts = await loadJSON("./json/defaultShifts.json");

    // Populate UI
    const availableWeekIds = populateWeekSelector();
    populateEmployeeSidebar();
    const savedWeekId = getSchedulePreferences().weekId;
    const preferredWeekId = availableWeekIds.includes(savedWeekId)
        ? savedWeekId
        : availableWeekIds[availableWeekIds.length - 1];
    const firstWeek = preferredWeekId;
    if (!firstWeek) {
        document.getElementById("weekSelect").disabled = true;
        showScheduleError("No schedule weeks are available for the previous or current week.");
        return;
    }
    document.getElementById("weekSelect").disabled = false;
    document.getElementById("weekSelect").value = firstWeek;
    loadWeek(firstWeek);
    initializeUndoHistory();
});

function applyScheduleTheme(theme) {
    const activeTheme = theme === "dark" ? "dark" : "light";
    document.body.dataset.theme = activeTheme;
    const isDark = activeTheme === "dark";
    const logo = document.getElementById("scheduleLogo");
    const toggle = document.getElementById("themeToggleBtn");
    if (logo) logo.src = isDark ? "./images/Logo_Dark.png" : "./images/Logo_Light.png";
    if (toggle) {
        toggle.textContent = isDark ? "Light mode" : "Dark mode";
        toggle.setAttribute("aria-label", `Switch to ${isDark ? "light" : "dark"} mode`);
        toggle.setAttribute("aria-pressed", String(isDark));
    }
}

document.getElementById("themeToggleBtn").addEventListener("click", () => {
    const nextTheme = document.body.dataset.theme === "dark" ? "light" : "dark";
    applyScheduleTheme(nextTheme);
    saveSchedulePreferences({ theme: nextTheme });
});


// ===============================
// WEEK SELECTOR
// ===============================

function populateWeekSelector() {
    const weekSelect = document.getElementById("weekSelect");
    weekSelect.innerHTML = "";

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const currentWeekStart = getWeekStartDate(today);
    const previousWeekStart = new Date(currentWeekStart);
    previousWeekStart.setDate(previousWeekStart.getDate() - 7);
    ensureScheduleWeeks([previousWeekStart, currentWeekStart]);
    const visibleWeeks = Object.entries(scheduleWeeks)
        .map(([weekId, week]) => ({
            weekId,
            week,
            weekStart: getWeekStartDate(getWeekReferenceDate(weekId, week))
        }))
        .filter(entry => entry.weekStart
            && entry.weekStart >= previousWeekStart
            && entry.weekStart <= currentWeekStart)
        .sort((first, second) => first.weekStart - second.weekStart);

    visibleWeeks.forEach(({ weekId, weekStart }) => {
        const opt = document.createElement("option");
        opt.value = weekId;
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        opt.textContent = `${formatMonthDay(weekStart)} - ${formatMonthDay(weekEnd)}`;
        weekSelect.appendChild(opt);
    });
    weekSelect.value = visibleWeeks[visibleWeeks.length - 1]?.weekId || "";

    weekSelect.onchange = () => {
        loadWeek(weekSelect.value);
    };
    return visibleWeeks.map(week => week.weekId);
}

function ensureScheduleWeeks(weekStarts) {
    let changed = false;
    weekStarts.forEach(weekStart => {
        const weekAlreadyExists = Object.entries(scheduleWeeks).some(([weekId, week]) => {
            const referenceDate = getWeekReferenceDate(weekId, week);
            const existingWeekStart = getWeekStartDate(referenceDate);
            return existingWeekStart && existingWeekStart.getTime() === weekStart.getTime();
        });
        if (weekAlreadyExists) return;

        const weekDate = dateToScheduleKey(weekStart);
        let weekId = weekDate;
        let suffix = 2;
        while (Object.prototype.hasOwnProperty.call(scheduleWeeks, weekId)) {
            weekId = `${weekDate}_${suffix++}`;
        }
        scheduleWeeks[weekId] = {
            date: weekDate,
            locked: false,
            days: Object.fromEntries(scheduleDays.map(day => [day.key, {}]))
        };
        changed = true;
    });
    if (changed) persistSchedule();
}

function getWeekReferenceDate(weekId, week) {
    return parseScheduleDate(week && week.date) || parseScheduleDate(weekId);
}

function parseScheduleDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
        return null;
    }
    date.setHours(0, 0, 0, 0);
    return date;
}

function parseImportedDate(value) {
    const text = String(value || "").trim();
    const isoDate = parseScheduleDate(text);
    if (isoDate) return dateToScheduleKey(isoDate);
    const localizedDate = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!localizedDate) return null;
    const [, month, day, year] = localizedDate.map(Number);
    const parsedDate = new Date(year, month - 1, day);
    if (parsedDate.getFullYear() !== year
        || parsedDate.getMonth() !== month - 1
        || parsedDate.getDate() !== day) {
        return null;
    }
    return dateToScheduleKey(parsedDate);
}

function getWeekStartDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
    const weekStart = new Date(date);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    return weekStart;
}

function getScheduleDateForDay(weekId, day) {
    const week = scheduleWeeks[weekId];
    const date = getWeekStartDate(week && getWeekReferenceDate(weekId, week));
    const dayOffset = scheduleDays.findIndex(scheduleDay => scheduleDay.key === day);
    if (!date || dayOffset < 0) return null;
    date.setDate(date.getDate() + dayOffset);
    return dateToScheduleKey(date);
}

function getAutoScheduleBoundaries(weekId, day) {
    const scheduleDate = getScheduleDateForDay(weekId, day);
    if (!scheduleDate) throw new Error(`Could not determine the schedule date for ${getDayLabel(day)}.`);
    const monthAndDay = scheduleDate.slice(5);
    const shortHoursSeason = monthAndDay >= "11-01" || monthAndDay <= "03-14";
    const openingTime = day === "sun" ? "07:00" : "06:00";
    const closingTime = shortHoursSeason ? "21:00" : "22:00";
    return {
        openingTime,
        closingTime,
        openingIndex: (timeToMinutes(openingTime) - 360) / 60,
        closingIndex: (timeToMinutes(closingTime) - 360) / 60
    };
}

function dateToScheduleKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function getSchedulePreferences() {
    try {
        const preferences = JSON.parse(localStorage.getItem(schedulePreferencesKey) || "{}");
        return preferences && typeof preferences === "object" ? preferences : {};
    } catch (error) {
        console.error("Could not read saved schedule preferences.", error);
        return {};
    }
}

function saveSchedulePreferences(changes) {
    try {
        localStorage.setItem(schedulePreferencesKey, JSON.stringify({
            ...getSchedulePreferences(),
            ...changes
        }));
    } catch (error) {
        showScheduleError("Could not save your local schedule preferences.");
        console.error("Could not save schedule preferences.", error);
    }
}

function formatMonthDay(date) {
    return `${date.getMonth() + 1}/${date.getDate()}`;
}

function getOrdinalDay(day) {
    const lastTwoDigits = day % 100;
    if (lastTwoDigits >= 11 && lastTwoDigits <= 13) return `${day}th`;
    switch (day % 10) {
        case 1: return `${day}st`;
        case 2: return `${day}nd`;
        case 3: return `${day}rd`;
        default: return `${day}th`;
    }
}

function getScheduleWeekStart(weekId) {
    const week = scheduleWeeks[weekId];
    return getWeekStartDate(week && getWeekReferenceDate(weekId, week));
}

function updateScheduleMonthHeader() {
    const weekStart = getScheduleWeekStart(currentWeekId);
    if (!weekStart) return;
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const monthFormatter = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
    const startMonth = monthFormatter.format(weekStart);
    const endMonth = monthFormatter.format(weekEnd);
    const left = document.getElementById("scheduleMonthLeft");
    const single = document.getElementById("scheduleMonthSingle");
    const right = document.getElementById("scheduleMonthRight");
    if (weekStart.getMonth() === weekEnd.getMonth()
        && weekStart.getFullYear() === weekEnd.getFullYear()) {
        left.textContent = "";
        single.textContent = startMonth;
        right.textContent = "";
    } else {
        left.textContent = startMonth;
        single.textContent = "";
        right.textContent = endMonth;
    }
}


// ===============================
// LOAD WEEK
// ===============================

function loadWeek(weekId) {
    currentWeekId = weekId;
    selectedShift = null;
    saveSchedulePreferences({ weekId });

    const weekData = scheduleWeeks[weekId];
    if (!weekData || !weekData.days) {
        throw new Error(`Schedule week "${weekId}" has no day data.`);
    }
    scheduleLocked = Boolean(weekData.locked);

    document.getElementById("lockCheckbox").checked = scheduleLocked;

    setupScheduleResizeHandle();
    updateScheduleMonthHeader();
    renderScheduleGrid();
    updateScheduleControls();
}


// ===============================
// RENDER SCHEDULE GRID (TIMELINE)
// ===============================

function renderScheduleGrid() {
    const grid = document.getElementById("scheduleGrid");
    grid.innerHTML = "";
    const table = document.createElement("table");
    table.classList.add("schedule-table");
    table.setAttribute("aria-label", "Weekly employee schedule");
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    const timeHeader = document.createElement("th");
    timeHeader.scope = "col";
    timeHeader.textContent = "Time";
    headerRow.appendChild(timeHeader);
    const availabilityEmployeeId = selectedEmployeeId;
    scheduleDays.forEach(day => {
        const header = document.createElement("th");
        header.scope = "col";
        const scheduleDate = parseScheduleDate(getScheduleDateForDay(currentWeekId, day.key));
        header.textContent = scheduleDate
            ? `${day.label} ${getOrdinalDay(scheduleDate.getDate())}`
            : day.label;
        header.title = "Right-click to remove all shifts for this day";
        header.addEventListener("contextmenu", event => {
            event.preventDefault();
            removeDayShifts(day.key);
        });
        if (availabilityEmployeeId !== null && availabilityEmployeeId !== undefined
            && scheduleTimes.every(time =>
                !isEmployeeAvailableAt(availabilityEmployeeId, day.key, time).available
            )) {
            header.classList.add("day-unavailable");
            header.setAttribute("aria-label", `${header.textContent}: unavailable all day`);
        }
        headerRow.appendChild(header);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    const shiftsByDay = Object.fromEntries(scheduleDays.map(day => [day.key, getDayShifts(day.key)]));

    scheduleTimes.forEach((time, rowIndex) => {
        const row = document.createElement("tr");
        const timeCell = document.createElement("th");
        timeCell.scope = "row";
        timeCell.textContent = formatScheduleTime(time);
        row.appendChild(timeCell);

        scheduleDays.forEach(day => {
            const cell = document.createElement("td");
            const availability = availabilityEmployeeId === null
                ? { available: true }
                : isEmployeeAvailableAt(availabilityEmployeeId, day.key, time);
            const occupyingShifts = shiftsByDay[day.key].filter(shift =>
                rowIndex >= shift.startIndex && rowIndex < shift.endIndex
            );
            cell.classList.add("schedule-slot", availability.available ? "available" : "unavailable");
            cell.setAttribute("aria-label", `${day.label} ${formatScheduleTime(time)}: ${availability.available ? "available" : "unavailable"}`);
            const orderedShifts = occupyingShifts.slice().sort((first, second) => {
                if (selectedShift && selectedShift.day === day.key) {
                    const firstSelected = first.key === selectedShift.shiftKey;
                    const secondSelected = second.key === selectedShift.shiftKey;
                    if (firstSelected !== secondSelected) return Number(secondSelected) - Number(firstSelected);
                }
                if (selectedEmployeeId === null) return 0;
                const firstMatches = String(first.info.employee) === String(selectedEmployeeId);
                const secondMatches = String(second.info.employee) === String(selectedEmployeeId);
                return Number(secondMatches) - Number(firstMatches);
            });
            const selectedInCell = orderedShifts.find(shift =>
                selectedShift && selectedShift.day === day.key && selectedShift.shiftKey === shift.key
            );

            if (occupyingShifts.length) {
                const isSelected = Boolean(selectedInCell);
                cell.classList.add("occupied");
                if (occupyingShifts.length > 1) {
                    cell.classList.add("overlapping", `overlap-depth-${Math.min(occupyingShifts.length, 4)}`);
                }
                if (isSelected) {
                    cell.classList.add("shift-selected");
                    if (selectedInCell.startIndex === rowIndex) cell.classList.add("shift-selected-start");
                    if (selectedInCell.endIndex - 1 === rowIndex) cell.classList.add("shift-selected-end");
                }
                const colorLanes = document.createElement("div");
                colorLanes.classList.add("shift-color-lanes");
                const dayShiftByKey = new Map(occupyingShifts.map(shift => [shift.key, shift]));
                const laneOrder = [];
                Object.keys(scheduleWeeks[currentWeekId].days[day.key] || {}).forEach(shiftKey => {
                    const shift = dayShiftByKey.get(shiftKey);
                    if (!shift) return;
                    laneOrder.splice(Math.floor((laneOrder.length + 1) / 2), 0, shift);
                });
                laneOrder.forEach(shift => {
                    const lane = document.createElement("button");
                    lane.type = "button";
                    lane.classList.add("shift-color-lane");
                    lane.style.backgroundColor = getEmployeeColor(shift.info.employee);
                    const isShiftSelected = selectedShift
                        && selectedShift.day === day.key
                        && selectedShift.shiftKey === shift.key;
                    lane.setAttribute("aria-label", `Select ${getEmployeeName(shift.info.employee)}'s shift`);
                    lane.setAttribute("aria-pressed", String(Boolean(isShiftSelected)));
                    lane.title = `${getEmployeeName(shift.info.employee)}'s shift`;
                    lane.addEventListener("click", event => {
                        event.stopPropagation();
                        if (selectedEmployeeId !== null
                            && String(selectedEmployeeId) !== String(getShiftEmployeeId(shift.info))) {
                            createShift(day.key, time);
                            return;
                        }
                        selectShift(day.key, shift.key);
                    });
                    colorLanes.appendChild(lane);
                });
                cell.appendChild(colorLanes);
                const segment = document.createElement("div");
                segment.classList.add("shift-segment");
                if (isSelected) segment.classList.add("selected");
                if (isSelected && !scheduleLocked && selectedInCell.startIndex === rowIndex) {
                    segment.classList.add("has-top-controls");
                    segment.appendChild(createShiftControls([
                        ["↑", "Extend shift up one hour", "extend-up"],
                        ["↓", "Shrink shift from the top by one hour", "shrink-top"],
                        ["⇈", "Extend shift to the top of the day", "extend-to-top"]
                    ]));
                }

                orderedShifts.filter(shift => shift.startIndex === rowIndex).forEach(shift => {
                    const shiftLabel = document.createElement("button");
                    shiftLabel.type = "button";
                    shiftLabel.classList.add("shift-segment-label");
                    shiftLabel.textContent = `${getEmployeeName(shift.info.employee)} ${formatScheduleTime(indexToTime(shift.startIndex))}-${formatScheduleTime(indexToTime(shift.endIndex))}`;
                    const shiftColor = getEmployeeColor(shift.info.employee);
                    shiftLabel.style.backgroundColor = shiftColor;
                    shiftLabel.style.color = getContrastingTextColor(shiftColor);
                    const isShiftSelected = selectedShift
                        && selectedShift.day === day.key
                        && selectedShift.shiftKey === shift.key;
                    shiftLabel.setAttribute("aria-pressed", String(Boolean(isShiftSelected)));
                    shiftLabel.addEventListener("click", event => {
                        event.stopPropagation();
                        if (selectedEmployeeId !== null
                            && String(selectedEmployeeId) !== String(getShiftEmployeeId(shift.info))) {
                            createShift(day.key, shift.startTime);
                            return;
                        }
                        selectShift(day.key, shift.key);
                    });
                    segment.appendChild(shiftLabel);
                });

                if (isSelected && !scheduleLocked && selectedInCell.endIndex - 1 === rowIndex) {
                    segment.classList.add("has-bottom-controls");
                    segment.appendChild(createShiftControls([
                        ["↓", "Extend shift down one hour", "extend-down"],
                        ["↑", "Shrink shift from the bottom by one hour", "shrink-bottom"],
                        ["⇊", "Extend shift to the bottom of the day", "extend-to-bottom"]
                    ]));
                }
                cell.appendChild(segment);
            }

            cell.addEventListener("click", () => {
                if (occupyingShifts.length) {
                    const selectedEmployeeHasShift = selectedEmployeeId !== null
                        && occupyingShifts.some(shift =>
                            String(shift.info.employee) === String(selectedEmployeeId)
                        );
                    if (selectedEmployeeId !== null && !selectedEmployeeHasShift) {
                        createShift(day.key, time);
                    }
                } else if (selectedEmployeeId !== null) {
                    createShift(day.key, time);
                } else if (selectedShift) {
                    selectedShift = null;
                    clearScheduleError();
                    renderScheduleGrid();
                    updateScheduleControls();
                } else {
                    createShift(day.key, time);
                }
            });
            row.appendChild(cell);
        });
        tbody.appendChild(row);
    });
    const closingRow = document.createElement("tr");
    closingRow.classList.add("schedule-closing-row");
    const closingTime = document.createElement("th");
    closingTime.scope = "row";
    closingTime.textContent = formatScheduleTime(indexToTime(scheduleTimes.length));
    closingRow.appendChild(closingTime);
    scheduleDays.forEach(day => {
        const closingCell = document.createElement("td");
        closingCell.classList.add("schedule-closing-cell");
        closingCell.setAttribute("aria-label", `${day.label}: store closes at 10pm`);
        closingRow.appendChild(closingCell);
    });
    tbody.appendChild(closingRow);
    table.appendChild(tbody);
    grid.appendChild(table);
    updateEmployeeWeeklyHours();
}

function createShiftControls(actions) {
    const controls = document.createElement("div");
    controls.classList.add("shift-edge-controls");
    actions.forEach(([icon, label, action]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.classList.add("shift-edge-control");
        button.textContent = icon;
        button.title = label;
        button.setAttribute("aria-label", label);
        button.addEventListener("click", event => {
            event.stopPropagation();
            resizeSelectedShift(action);
        });
        controls.appendChild(button);
    });
    return controls;
}

function selectShift(day, shiftKey) {
    const shiftInfo = scheduleWeeks[currentWeekId].days[day][shiftKey];
    if (!shiftInfo) return;
    if (selectedEmployeeId !== null
        && String(selectedEmployeeId) !== String(getShiftEmployeeId(shiftInfo))) return;
    const wasSelected = selectedShift
        && selectedShift.day === day
        && selectedShift.shiftKey === shiftKey;
    selectedShift = wasSelected ? null : { day, shiftKey };
    clearScheduleError();
    renderScheduleGrid();
    updateScheduleControls();
}

function getContrastingTextColor(backgroundColor) {
    const channels = backgroundColor.match(/[0-9a-f]{2}/gi)?.map(channel => parseInt(channel, 16) / 255);
    if (!channels || channels.length < 3) return "#111827";
    const luminance = channels
        .slice(0, 3)
        .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
        .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
    return luminance > 0.179 ? "#111827" : "#ffffff";
}

function getDayShifts(day, weekId = currentWeekId) {
    const dayData = scheduleWeeks[weekId].days[day] || {};
    return Object.entries(dayData)
        .map(([key, info]) => {
            const shift = info && (info.start_time && info.end_time
                ? info
                : defaultShifts[info.shift]);
            if (!shift) return null;
            const start = timeToMinutes(shift.start_time);
            const end = timeToMinutes(shift.end_time);
            if (start === null || end === null || end <= start) return null;
            return {
                key,
                info,
                startTime: shift.start_time,
                endTime: shift.end_time,
                startIndex: Math.floor((start - 360) / 60),
                endIndex: Math.ceil((end - 360) / 60)
            };
        })
        .filter(shift => shift && shift.endIndex > 0 && shift.startIndex < scheduleTimes.length)
        .sort((a, b) => a.startIndex - b.startIndex);
}

function validateWeekSchedule(weekId) {
    const issues = [];
    const week = scheduleWeeks[weekId];
    if (!week || !week.days) {
        return [`${weekId}: schedule data is missing.`];
    }

    scheduleDays.forEach(day => {
        const shifts = getDayShifts(day.key, weekId)
            .map(shift => {
                const employeeId = getShiftEmployeeId(shift.info);
                const employee = getEmployeeById(employeeId);
                return employee ? { ...shift, employee, position: getEmployeePosition(employee) } : null;
            })
            .filter(Boolean);
        const scheduleDate = getScheduleDateForDay(weekId, day.key);
        shifts.forEach(shift => {
            if (isEmployeeOnTimeOff(shift.employee, scheduleDate)) {
                issues.push(`${day.label}: ${shift.employee.name || "An employee"} is scheduled during time off (${formatEmployeeDate(scheduleDate)}).`);
            }
            const unavailableIndexes = [];
            for (let index = Math.max(0, shift.startIndex);
                index < Math.min(scheduleTimes.length, shift.endIndex);
                index++) {
                if (!isEmployeeAvailableAt(shift.employee.id, day.key, scheduleTimes[index], false, weekId).available) {
                    unavailableIndexes.push(index);
                }
            }
            if (unavailableIndexes.length) {
                issues.push(`Availability conflict — ${formatAvailabilityConflict({
                    weekId,
                    day: day.key,
                    employeeId: shift.employee.id,
                    unavailableIndexes
                })}.`);
            }
        });
        const { openingTime, closingTime } = getAutoScheduleBoundaries(weekId, day.key);
        const openingEmployees = shifts.filter(shift => shift.startTime === openingTime);
        const closingEmployees = shifts.filter(shift => shift.endTime === closingTime);
        const openingCount = new Set(openingEmployees.map(shift => String(shift.employee.id))).size;
        const closingCount = new Set(closingEmployees.map(shift => String(shift.employee.id))).size;

        if (openingCount < 2) {
            issues.push(`${day.label}: needs 2 openers starting at ${formatScheduleTime(openingTime)} (currently ${openingCount}).`);
        }
        if (closingCount < 3) {
            issues.push(`${day.label}: needs 3 closers ending at ${formatScheduleTime(closingTime)} (currently ${closingCount}).`);
        }

        const managerlessKeyHolderHours = [];
        const managerlessUncoveredHours = [];
        const understaffedHours = [];
        const { openingIndex, closingIndex } = getAutoScheduleBoundaries(weekId, day.key);
        scheduleTimes.forEach((time, index) => {
            if (index < openingIndex || index >= closingIndex) return;
            const working = shifts.filter(shift => index >= shift.startIndex && index < shift.endIndex);
            if (new Set(working.map(shift => String(shift.employee.id))).size < 2) {
                understaffedHours.push(time);
            }
            const hasManager = working.some(shift => shift.position === "Manager");
            if (!hasManager) {
                if (working.some(shift => shift.position === "GSS_key_holder")) {
                    managerlessKeyHolderHours.push(time);
                } else {
                    managerlessUncoveredHours.push(time);
                }
            }
        });

        if (understaffedHours.length) {
            issues.push(`${day.label}: at least 2 employees are required at ${formatScheduleTimeList(understaffedHours)}.`);
        }
        if (managerlessUncoveredHours.length) {
            issues.push(`${day.label}: a manager or working key holder is required at ${formatScheduleTimeList(managerlessUncoveredHours)}.`);
        }
        if (managerlessKeyHolderHours.length > 3) {
            issues.push(`${day.label}: key holders cover ${managerlessKeyHolderHours.length} managerless hours; the limit is 3 (${formatScheduleTimeList(managerlessKeyHolderHours)}).`);
        }
    });

    return issues;
}

function getEmployeePosition(employee) {
    if (employee.job_position) return employee.job_position;
    if ((employees.Manager || []).includes(employee)) return "Manager";
    if ((employees.GSS_key_holder || []).includes(employee)) return "GSS_key_holder";
    if ((employees.GSS || []).includes(employee)) return "GSS";
    return "";
}

function formatScheduleTimeList(times) {
    return times.map(formatScheduleTime).join(", ");
}

function indexToTime(index) {
    return `${String(Math.min(index + 6, 22)).padStart(2, "0")}:00`;
}

function formatScheduleTime(time) {
    const minutes = timeToMinutes(time);
    if (minutes === null) return time;
    const hour = Math.floor(minutes / 60);
    const period = hour < 12 ? "am" : "pm";
    return `${hour % 12 || 12}${period}`;
}

function createShift(day, startTime) {
    clearScheduleError();
    if (scheduleLocked) {
        showScheduleError("This schedule is locked. Unlock it before making changes.");
        return;
    }
    const employee = getEmployeeById(selectedEmployeeId);
    if (!employee) {
        showScheduleError("Select an employee by clicking their name before choosing a time.");
        return;
    }

    const startIndex = scheduleTimes.indexOf(startTime);
    if (startIndex < 0) return;
    if (getDayShifts(day).some(shift => String(shift.info.employee) === String(selectedEmployeeId))) {
        showScheduleError(`${employee.name} already has a shift on ${getDayLabel(day)}.`);
        return;
    }
    if (!isEmployeeAvailableAt(selectedEmployeeId, day, startTime).available) {
        showScheduleError(`${employee.name} is unavailable on ${getDayLabel(day)} at ${formatScheduleTime(startTime)}.`);
        return;
    }

    let endIndex = startIndex;
    const maxEndIndex = Math.min(startIndex + 8, scheduleTimes.length);
    while (endIndex < maxEndIndex
        && isEmployeeAvailableAt(selectedEmployeeId, day, scheduleTimes[endIndex]).available) {
        endIndex++;
    }
    if (endIndex - startIndex < 3) {
        showScheduleError(`Cannot create a shift for ${employee.name}: fewer than 3 consecutive available hours remain at ${formatScheduleTime(startTime)}.`);
        return;
    }

    let shiftKey = `shift_${Date.now()}`;
    while (Object.prototype.hasOwnProperty.call(scheduleWeeks[currentWeekId].days[day], shiftKey)) {
        shiftKey = `shift_${Number(shiftKey.slice(6)) + 1}`;
    }
    scheduleWeeks[currentWeekId].days[day][shiftKey] = {
        start_time: startTime,
        end_time: indexToTime(endIndex),
        employee: selectedEmployeeId
    };
    selectedShift = { day, shiftKey };
    selectedEmployeeId = employee.id;
    populateEmployeeSidebar();
    persistSchedule();
    renderScheduleGrid();
    updateScheduleControls();
}

function removeSelectedShift() {
    if (!selectedShift || scheduleLocked) return;
    delete scheduleWeeks[currentWeekId].days[selectedShift.day][selectedShift.shiftKey];
    selectedShift = null;
    persistSchedule();
    renderScheduleGrid();
    updateScheduleControls();
}

function removeDayShifts(day) {
    if (scheduleLocked) {
        showScheduleError("Unlock this schedule before removing shifts.");
        return;
    }
    const shifts = scheduleWeeks[currentWeekId]?.days?.[day];
    if (!shifts || !Object.keys(shifts).length) return;

    const removedCount = Object.keys(shifts).length;
    scheduleWeeks[currentWeekId].days[day] = {};
    if (selectedShift?.day === day) selectedShift = null;
    persistSchedule();
    renderScheduleGrid();
    updateScheduleControls();
    showScheduleSuccess(`Removed ${removedCount} shift${removedCount === 1 ? "" : "s"} for ${getDayLabel(day)}.`);
}

function resizeSelectedShift(mode) {
    if (!selectedShift || scheduleLocked) return;
    const shiftInfo = scheduleWeeks[currentWeekId].days[selectedShift.day][selectedShift.shiftKey];
    const shift = shiftInfo && (shiftInfo.start_time && shiftInfo.end_time
        ? shiftInfo
        : defaultShifts[shiftInfo.shift]);
    if (!shift) return;

    const start = timeToMinutes(shift.start_time);
    const end = timeToMinutes(shift.end_time);
    if (start === null || end === null) return;
    const startIndex = Math.floor((start - 360) / 60);
    const endIndex = Math.ceil((end - 360) / 60);

    let newStartIndex = startIndex;
    let newEndIndex = endIndex;
    const duration = endIndex - startIndex;

    if (mode === "extend-up" || mode === "extend-to-top") {
        const target = mode === "extend-up" ? startIndex - 1 : 0;
        while (newStartIndex > target) {
            const candidateTime = scheduleTimes[newStartIndex - 1];
            if (!candidateTime) break;
            if (!isEmployeeAvailableAt(shiftInfo.employee, selectedShift.day, candidateTime).available) {
                if (mode === "extend-up") {
                    showScheduleError(`Cannot extend up: ${getEmployeeName(shiftInfo.employee)} is unavailable at ${formatScheduleTime(candidateTime)}.`);
                    return;
                }
                break;
            }
            newStartIndex--;
        }
    } else if (mode === "extend-down" || mode === "extend-to-bottom") {
        const target = mode === "extend-down" ? endIndex + 1 : scheduleTimes.length;
        while (newEndIndex < target) {
            const candidateTime = scheduleTimes[newEndIndex];
            if (!candidateTime) break;
            if (!isEmployeeAvailableAt(shiftInfo.employee, selectedShift.day, candidateTime).available) {
                if (mode === "extend-down") {
                    showScheduleError(`Cannot extend down: ${getEmployeeName(shiftInfo.employee)} is unavailable at ${formatScheduleTime(candidateTime)}.`);
                    return;
                }
                break;
            }
            newEndIndex++;
        }
    } else if (mode === "shrink-top") {
        if (duration <= 3) return;
        newStartIndex++;
    } else if (mode === "shrink-bottom") {
        if (duration <= 3) return;
        newEndIndex--;
    }

    if (newStartIndex === startIndex && newEndIndex === endIndex) return;
    shiftInfo.start_time = indexToTime(newStartIndex);
    shiftInfo.end_time = indexToTime(newEndIndex);

    persistSchedule();
    clearScheduleError();
    renderScheduleGrid();
    updateScheduleControls();
}

function updateScheduleControls() {
    const employee = getEmployeeById(selectedEmployeeId);
    document.getElementById("selectedEmployeeLabel").textContent = employee
        ? `Selected: ${employee.name || "Unnamed employee"}`
        : "Select an employee by clicking their name.";
    const shiftDetails = document.getElementById("selectedShiftDetails");
    const selectedDay = selectedShift && scheduleWeeks[currentWeekId]?.days?.[selectedShift.day];
    const shiftInfo = selectedDay?.[selectedShift.shiftKey];
    const shift = shiftInfo && (shiftInfo.start_time && shiftInfo.end_time
        ? shiftInfo
        : defaultShifts[shiftInfo.shift]);
    const startMinutes = shift && timeToMinutes(shift.start_time);
    const endMinutes = shift && timeToMinutes(shift.end_time);
    const shiftEmployee = shiftInfo && getEmployeeById(getShiftEmployeeId(shiftInfo));
    if (selectedShift && shiftEmployee && startMinutes !== null && endMinutes !== null && endMinutes > startMinutes) {
        const duration = (endMinutes - startMinutes) / 60;
        const durationLabel = Number.isInteger(duration) ? `${duration} hours` : `${duration.toFixed(1)} hours`;
        shiftDetails.replaceChildren();
        [
            `Shift: ${shiftEmployee.name || "Unnamed employee"}`,
            `Hours: ${formatScheduleTime(shift.start_time)}-${formatScheduleTime(shift.end_time)}`,
            `Duration: ${durationLabel}`
        ].forEach(text => {
            const line = document.createElement("span");
            line.textContent = text;
            shiftDetails.appendChild(line);
        });
        shiftDetails.hidden = false;
    } else {
        shiftDetails.replaceChildren();
        shiftDetails.hidden = true;
    }
    document.getElementById("removeShiftBtn").disabled = !selectedShift || scheduleLocked;
}

function setupScheduleResizeHandle() {
    const handle = document.getElementById("scheduleResizeHandle");
    const main = document.querySelector(".schedule-main");
    if (handle.dataset.resizeReady) return;
    handle.dataset.resizeReady = "true";

    const resizeTo = clientX => {
        const bounds = main.getBoundingClientRect();
        const minScheduleWidth = 820;
        const minSidebarWidth = 280;
        const handleWidth = handle.getBoundingClientRect().width;
        const availableWidth = bounds.width - 32;
        const maxScheduleWidth = availableWidth - minSidebarWidth - handleWidth - 16;
        if (maxScheduleWidth < minScheduleWidth) return;
        const scheduleWidth = Math.max(minScheduleWidth, Math.min(clientX - bounds.left - 16, maxScheduleWidth));
        main.style.gridTemplateColumns = `${scheduleWidth}px ${handleWidth}px minmax(${minSidebarWidth}px, 1fr)`;
    };
    const saveScheduleWidth = () => {
        saveSchedulePreferences({
            scheduleWidth: document.querySelector(".schedule-grid-container").getBoundingClientRect().width
        });
    };

    const savedWidth = Number(getSchedulePreferences().scheduleWidth);
    if (Number.isFinite(savedWidth) && savedWidth > 0) {
        resizeTo(main.getBoundingClientRect().left + savedWidth + 16);
    }

    handle.addEventListener("pointerdown", event => {
        event.preventDefault();
        handle.setPointerCapture(event.pointerId);
        resizeTo(event.clientX);
    });
    handle.addEventListener("pointermove", event => {
        if (handle.hasPointerCapture(event.pointerId)) resizeTo(event.clientX);
    });
    handle.addEventListener("pointerup", saveScheduleWidth);
    handle.addEventListener("keydown", event => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const currentWidth = document.querySelector(".schedule-grid-container").getBoundingClientRect().width;
        const nextWidth = currentWidth + (event.key === "ArrowRight" ? 24 : -24);
        resizeTo(main.getBoundingClientRect().left + nextWidth + 16);
        saveScheduleWidth();
    });
}

function persistSchedule() {
    localStorage.setItem("scheduleWeeks", JSON.stringify(scheduleWeeks));
    recordUndoHistory();
}

function showScheduleError(message) {
    const error = document.getElementById("scheduleError");
    const panel = error.closest(".schedule-error-panel");
    const openButton = document.getElementById("openScheduleErrorBtn");
    const closeButton = document.getElementById("closeScheduleErrorBtn");
    const isLongError = message.split(/\r?\n/).length > 5;

    error.textContent = message;
    panel.classList.add("has-error");
    panel.classList.remove("is-success");
    panel.classList.toggle("has-long-error", isLongError);
    panel.classList.remove("expanded");
    openButton.textContent = "Open errors";
    closeButton.textContent = "Close errors";
    openButton.hidden = !isLongError;
    closeButton.hidden = true;
}

function showScheduleSuccess(message) {
    showScheduleError(message);
    const panel = document.querySelector(".schedule-error-panel");
    panel.classList.add("is-success");
    document.getElementById("openScheduleErrorBtn").textContent = "Open details";
    document.getElementById("closeScheduleErrorBtn").textContent = "Close details";
}

function clearScheduleError() {
    document.getElementById("scheduleError").textContent = "";
    const panel = document.querySelector(".schedule-error-panel");
    panel.classList.remove("has-error", "has-long-error", "expanded", "is-success");
    const openButton = document.getElementById("openScheduleErrorBtn");
    const closeButton = document.getElementById("closeScheduleErrorBtn");
    openButton.hidden = true;
    closeButton.hidden = true;
    openButton.textContent = "Open errors";
    closeButton.textContent = "Close errors";
}

document.getElementById("openScheduleErrorBtn").addEventListener("click", () => {
    const panel = document.querySelector(".schedule-error-panel");
    panel.classList.add("expanded");
    document.getElementById("openScheduleErrorBtn").hidden = true;
    document.getElementById("closeScheduleErrorBtn").hidden = false;
});

document.getElementById("closeScheduleErrorBtn").addEventListener("click", () => {
    const panel = document.querySelector(".schedule-error-panel");
    panel.classList.remove("expanded");
    document.getElementById("closeScheduleErrorBtn").hidden = true;
    document.getElementById("openScheduleErrorBtn").hidden = false;
});

document.getElementById("removeShiftBtn").addEventListener("click", removeSelectedShift);

function getUndoSnapshot() {
    return {
        employees: localStorage.getItem("employees") || JSON.stringify(employees),
        scheduleWeeks: localStorage.getItem("scheduleWeeks") || JSON.stringify(scheduleWeeks)
    };
}

function initializeUndoHistory() {
    undoHistory = [getUndoSnapshot()];
    redoHistory = [];
    undoHistoryReady = true;
}

function recordUndoHistory() {
    if (!undoHistoryReady || restoringUndoState || undoHistoryUpdateQueued) return;
    undoHistoryUpdateQueued = true;
    queueMicrotask(() => {
        undoHistoryUpdateQueued = false;
        if (!undoHistoryReady || restoringUndoState) return;
        const snapshot = getUndoSnapshot();
        const previous = undoHistory[undoHistory.length - 1];
        if (previous
            && previous.employees === snapshot.employees
            && previous.scheduleWeeks === snapshot.scheduleWeeks) return;
        undoHistory.push(snapshot);
        if (undoHistory.length > undoHistoryLimit) undoHistory.shift();
        redoHistory = [];
    });
}

function restoreUndoSnapshot(snapshot) {
    const previousEmployees = localStorage.getItem("employees");
    const previousWeeks = localStorage.getItem("scheduleWeeks");
    try {
        localStorage.setItem("employees", snapshot.employees);
        localStorage.setItem("scheduleWeeks", snapshot.scheduleWeeks);
    } catch (error) {
        try {
            if (previousEmployees === null) localStorage.removeItem("employees");
            else localStorage.setItem("employees", previousEmployees);
            if (previousWeeks === null) localStorage.removeItem("scheduleWeeks");
            else localStorage.setItem("scheduleWeeks", previousWeeks);
        } catch (restoreError) {
            console.error("Could not restore local data after failed undo or redo.", restoreError);
        }
        showScheduleError("Could not restore the previous local changes. Check available browser storage.");
        console.error("Could not restore the schedule history.", error);
        return false;
    }

    restoringUndoState = true;
    try {
        employees = JSON.parse(snapshot.employees);
        scheduleWeeks = JSON.parse(snapshot.scheduleWeeks);
        selectedShift = null;
        if (selectedEmployeeId !== null && !getEmployeeById(selectedEmployeeId)) {
            selectedEmployeeId = null;
        }
        populateEmployeeSidebar();
        window.dispatchEvent(new CustomEvent("employee-colors-changed"));
        loadWeek(currentWeekId);
        clearScheduleError();
    } finally {
        restoringUndoState = false;
    }
    return true;
}

function undoScheduleChange() {
    if (undoHistory.length < 2) return;
    const previous = undoHistory[undoHistory.length - 2];
    const current = undoHistory[undoHistory.length - 1];
    if (!restoreUndoSnapshot(previous)) return;
    undoHistory.pop();
    redoHistory.push(current);
}

function redoScheduleChange() {
    if (!redoHistory.length) return;
    const next = redoHistory[redoHistory.length - 1];
    if (!restoreUndoSnapshot(next)) return;
    redoHistory.pop();
    undoHistory.push(next);
    if (undoHistory.length > undoHistoryLimit) undoHistory.shift();
}

document.addEventListener("keydown", event => {
    const target = event.target;
    if (target instanceof Element
        && (target.closest("input, textarea, select, [contenteditable='true'], dialog[open]"))) {
        return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redoScheduleChange();
        else undoScheduleChange();
        return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redoScheduleChange();
        return;
    }

    if ((event.key === "Backspace" || event.key === "Delete") && selectedShift) {
        event.preventDefault();
        removeSelectedShift();
        return;
    }

    if ((event.code === "Space" || event.key === " ") && (selectedShift || selectedEmployeeId !== null)) {
        event.preventDefault();
        selectedShift = null;
        selectedEmployeeId = null;
        populateEmployeeSidebar();
        clearScheduleError();
        renderScheduleGrid();
        updateScheduleControls();
    }
});

document.getElementById("addEmployeeBtn").addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("employee-colors-changed"));
    document.getElementById("createEmployeeDialog").showModal();
});

document.getElementById("closeCreateEmployeeBtn").addEventListener("click", () => {
    document.getElementById("createEmployeeDialog").close();
});

document.getElementById("createEmployeeDialog").addEventListener("click", event => {
    if (event.target === event.currentTarget) event.currentTarget.close();
});

window.addEventListener("employee-created", () => {
    employees = JSON.parse(localStorage.getItem("employees") || "{}");
    recordUndoHistory();
    populateEmployeeSidebar();
    document.getElementById("createEmployeeDialog").close();
    document.getElementById("createEmployeeError").textContent = "";
    updateScheduleControls();
});

function isEmployeeAvailableAt(employeeId, day, time, includeTimeOff = true, weekId = currentWeekId) {
    const employee = getEmployeeById(employeeId);
    if (!employee) return { available: false };
    if (includeTimeOff && isEmployeeOnTimeOff(employee, getScheduleDateForDay(weekId, day))) {
        return { available: false, reason: "timeOff" };
    }
    const availability = employee.availability;
    if (!availability || typeof availability !== "object"
        || !Object.prototype.hasOwnProperty.call(availability, day)) {
        return { available: true };
    }

    const dayAvailability = availability[day];
    const blocks = dayAvailability && typeof dayAvailability === "object"
        ? Object.values(dayAvailability).filter(block => block && typeof block === "object")
        : [];
    const ranges = blocks
        .map(block => ({
            start: block.start_time || block.start,
            end: block.end_time || block.end
        }))
        .filter(range => range.start && range.end);
    const legacyDefault = blocks.length >= 2 && blocks.every(block =>
        !block.start_time && !block.start && !block.end_time && !block.end
    );
    if (legacyDefault) return { available: true };
    if (ranges.length === 0) {
        const explicitlyRestricted = blocks.some(block =>
            Object.prototype.hasOwnProperty.call(block, "start_time")
            || Object.prototype.hasOwnProperty.call(block, "start")
            || Object.prototype.hasOwnProperty.call(block, "end_time")
            || Object.prototype.hasOwnProperty.call(block, "end")
        );
        return { available: !explicitlyRestricted };
    }

    const slotStart = timeToMinutes(time);
    const slotEnd = slotStart === null ? null : slotStart + 60;
    return {
        available: ranges.some(range => {
            const start = timeToMinutes(range.start);
            const end = timeToMinutes(range.end);
            return start !== null && end !== null && slotStart >= start && slotEnd <= end;
        })
    };
}

function isEmployeeOnTimeOff(employee, scheduleDate) {
    if (!scheduleDate || !Array.isArray(employee.timeOff)) return false;
    return employee.timeOff.some(period => {
        const startDate = parseScheduleDate(period && period.start_date);
        const endDate = parseScheduleDate(period && period.end_date);
        return startDate && endDate
            && scheduleDate >= dateToScheduleKey(startDate)
            && scheduleDate <= dateToScheduleKey(endDate);
    });
}

function reconcileAvailabilityConflicts(employeeIds = null, weekIds = Object.keys(scheduleWeeks)) {
    const affectedIds = employeeIds && new Set([...employeeIds].map(String));
    const result = { removed: [], locked: [] };
    let changed = false;

    weekIds.forEach(weekId => {
        const week = scheduleWeeks[weekId];
        if (!week || !week.days) return;
        scheduleDays.forEach(day => {
            const shifts = getDayShifts(day.key, weekId);
            shifts.forEach(shift => {
                const employeeId = getShiftEmployeeId(shift.info);
                if (employeeId === null || employeeId === undefined
                    || (affectedIds && !affectedIds.has(String(employeeId)))) return;
                const unavailableIndexes = [];
                for (let index = Math.max(0, shift.startIndex);
                    index < Math.min(scheduleTimes.length, shift.endIndex);
                    index++) {
                    if (!isEmployeeAvailableAt(employeeId, day.key, scheduleTimes[index], true, weekId).available) {
                        unavailableIndexes.push(index);
                    }
                }
                if (!unavailableIndexes.length) return;

                const conflict = { weekId, day: day.key, employeeId, unavailableIndexes };
                const conflicts = week.locked ? result.locked : result.removed;
                conflicts.push(conflict);
                if (!week.locked) {
                    delete week.days[day.key][shift.key];
                    if (weekId === currentWeekId
                        && selectedShift?.day === day.key
                        && selectedShift.shiftKey === shift.key) {
                        selectedShift = null;
                    }
                    changed = true;
                }
            });
        });
    });

    if (changed) persistSchedule();
    return result;
}

function formatAvailabilityConflict(conflict) {
    const date = parseScheduleDate(getScheduleDateForDay(conflict.weekId, conflict.day));
    const dateLabel = date ? ` ${formatMonthDay(date)}` : "";
    const times = conflict.unavailableIndexes;
    const ranges = [];
    let start = times[0];
    let previous = times[0];
    times.slice(1).forEach(index => {
        if (index !== previous + 1) {
            ranges.push(`${formatScheduleTime(scheduleTimes[start])}-${formatScheduleTime(indexToTime(previous + 1))}`);
            start = index;
        }
        previous = index;
    });
    ranges.push(`${formatScheduleTime(scheduleTimes[start])}-${formatScheduleTime(indexToTime(previous + 1))}`);
    return `${getEmployeeName(conflict.employeeId)}: ${getDayLabel(conflict.day)}${dateLabel}, ${ranges.join(", ")}`;
}

function showAvailabilityConflictResult(result, message) {
    const details = [
        ...result.removed.map(conflict => `Removed shift for availability conflict — ${formatAvailabilityConflict(conflict)}.`),
        ...result.locked.map(conflict => `Locked schedule has an availability conflict — ${formatAvailabilityConflict(conflict)}.`)
    ];
    if (details.length) showScheduleError(`${message}\n${details.join("\n")}`);
    else clearScheduleError();
}


// ===============================
// EMPLOYEE SIDEBAR
// ===============================

function populateEmployeeSidebar() {
    const list = document.getElementById("employeeList");
    list.innerHTML = "";

    const groups = [
        { key: "GSS", label: "GSS", data: employees.GSS || [] },
        { key: "GSS_key_holder", label: "Key Holders", data: employees.GSS_key_holder || [] },
        { key: "Manager", label: "Managers", data: employees.Manager || [] }
    ];

    groups.forEach(group => {
        const header = document.createElement("h3");
        header.textContent = group.label;
        list.appendChild(header);

        group.data.forEach(emp => {
            const div = document.createElement("div");
            div.classList.add("employee-item");

            const avatarButton = document.createElement("button");
            avatarButton.type = "button";
            avatarButton.classList.add("employee-avatar-button");
            avatarButton.setAttribute("aria-label", `View ${emp.name || "employee"} details`);
            avatarButton.addEventListener("click", () => showEmployeeDetails(emp, group.key));

            const avatar = document.createElement("span");
            avatar.classList.add("employee-avatar");
            avatar.style.backgroundColor = getEmployeeColor(emp.id);

            const initials = document.createElement("span");
            initials.textContent = getEmployeeInitials(emp.name);
            avatar.appendChild(initials);

            const profileImage = emp.profile_image || emp.profileImage;
            if (profileImage) {
                const image = document.createElement("img");
                image.alt = "";
                image.addEventListener("load", () => {
                    initials.hidden = true;
                });
                image.addEventListener("error", () => {
                    image.hidden = true;
                });
                avatar.appendChild(image);
                image.src = profileImage;
            }

            const detailsButton = document.createElement("button");
            detailsButton.type = "button";
            detailsButton.classList.add("employee-details-button");
            detailsButton.textContent = emp.name || "Unnamed employee";
            detailsButton.style.borderLeft = `5px solid ${getEmployeeColor(emp.id)}`;
            const isSelected = String(emp.id) === String(selectedEmployeeId);
            detailsButton.classList.toggle("selected", isSelected);
            detailsButton.setAttribute("aria-pressed", String(isSelected));
            detailsButton.addEventListener("click", () => selectEmployee(emp));

            const hours = document.createElement("span");
            hours.classList.add("employee-weekly-hours");
            hours.dataset.employeeId = String(emp.id);

            avatarButton.appendChild(avatar);
            div.append(avatarButton, detailsButton, hours);

            list.appendChild(div);
        });
    });
    updateEmployeeWeeklyHours();
}

function updateEmployeeWeeklyHours() {
    if (!currentWeekId || !scheduleWeeks[currentWeekId]) return;
    getAllEmployees().forEach(employee => {
        const totalMinutes = scheduleDays.flatMap(day => getDayShifts(day.key).filter(shift =>
            String(getShiftEmployeeId(shift.info)) === String(employee.id)
        )).reduce((total, shift) => {
            const start = timeToMinutes(shift.startTime);
            const end = timeToMinutes(shift.endTime);
            return start === null || end === null ? total : total + end - start;
        }, 0);
        const hours = totalMinutes / 60;
        const displayHours = Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
        const badge = document.querySelector(`.employee-weekly-hours[data-employee-id="${CSS.escape(String(employee.id))}"]`);
        if (!badge) return;
        badge.textContent = `${displayHours}h`;
        badge.classList.toggle("over-40-hours", hours >= 40);
        badge.classList.toggle("low-hours", hours <= 15);
        badge.classList.toggle("hours-size-small", hours <= 15);
        badge.classList.toggle("hours-size-medium", hours > 15 && hours < 40);
        badge.classList.toggle("hours-size-large", hours >= 40);
        badge.setAttribute("aria-label", `${displayHours} scheduled hours this week`);
        badge.title = `${displayHours} scheduled hours this week`;
    });
}

function selectEmployee(employee) {
    selectedShift = null;
    selectedEmployeeId = String(selectedEmployeeId) === String(employee.id)
        ? null
        : employee.id;
    populateEmployeeSidebar();
    clearScheduleError();
    renderScheduleGrid();
    updateScheduleControls();
}

function getEmployeeInitials(name) {
    return (name || "?")
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map(part => part.charAt(0))
        .join("")
        .toUpperCase() || "?";
}

function getAllEmployees() {
    return [
        ...(employees.GSS || []),
        ...(employees.GSS_key_holder || []),
        ...(employees.Manager || [])
    ];
}

function getEmployeeById(id) {
    if (id === null || id === undefined) return null;
    return getAllEmployees().find(employee => String(employee.id) === String(id)) || null;
}

function getDayLabel(day) {
    return {
        sun: "Sunday",
        mon: "Monday",
        tue: "Tuesday",
        wed: "Wednesday",
        thu: "Thursday",
        fri: "Friday",
        sat: "Saturday"
    }[day] || day;
}

function timeToMinutes(time) {
    if (typeof time !== "string" || !/^\d{2}:\d{2}$/.test(time)) return null;
    const [hour, minute] = time.split(":").map(Number);
    if (hour > 23 || minute > 59) return null;
    return hour * 60 + minute;
}

function showEmployeeDetails(employee, groupKey) {
    const dialog = document.getElementById("employeeDetailsDialog");
    const image = document.getElementById("detailsProfileImage");
    const fallback = document.getElementById("detailsAvatarFallback");
    const name = employee.name || "Unnamed employee";

    document.getElementById("detailsEmployeeName").textContent = name;
    document.getElementById("detailsJobPosition").textContent =
        getJobPositionLabel(employee.job_position || groupKey);
    document.getElementById("detailsEmployeeId").textContent =
        employee.id === undefined || employee.id === null ? "Not provided" : String(employee.id);
    fallback.textContent = getEmployeeInitials(name);
    fallback.hidden = false;

    image.hidden = true;
    image.removeAttribute("src");
    const profileImage = employee.profile_image || employee.profileImage;
    if (profileImage) {
        image.src = profileImage;
        image.hidden = false;
        image.onload = () => {
            fallback.hidden = true;
        };
        image.onerror = () => {
            image.hidden = true;
        };
    }

    populateEmployeeDetailsList(
        document.getElementById("detailsAvailability"),
        formatEmployeeAvailability(employee.availability)
    );
    populateEmployeeDetailsList(
        document.getElementById("detailsTimeOff"),
        formatEmployeeTimeOff(employee.timeOff)
    );

    activeDetailsEmployee = employee;
    activeDetailsGroupKey = groupKey;
    editingTimeOffIndex = null;
    timeOffDraft = Array.isArray(employee.timeOff)
        ? employee.timeOff.map(period => ({ ...period }))
        : [];
    document.getElementById("availabilityEditSection").hidden = true;
    document.getElementById("editAvailabilityBtn").textContent = "Edit Availability";
    document.getElementById("timeOffEditSection").hidden = true;
    document.getElementById("editTimeOffBtn").textContent = "Edit Time Off";
    document.getElementById("employeeTimeOffForm").hidden = true;
    document.getElementById("timeOffEditError").textContent = "";
    renderTimeOffDraft();
    employeePendingDeletion = { employee, groupKey };
    dialog.showModal();
}

document.getElementById("editProfileImageBtn").addEventListener("click", () => {
    if (!activeDetailsEmployee) return;
    const image = activeDetailsEmployee.profile_image || activeDetailsEmployee.profileImage || "";
    document.getElementById("updatedProfileImageUrl").value =
        image.startsWith("data:image/") ? "" : image;
    document.getElementById("updatedProfileImageFile").value = "";
    document.getElementById("profileImageEditError").textContent = "";
    pendingProfileImage = "";
    profileImageRead = Promise.resolve();
    document.getElementById("editProfileImageDialog").showModal();
});

document.getElementById("updatedProfileImageFile").addEventListener("change", event => {
    const file = event.currentTarget.files[0];
    pendingProfileImage = "";
    document.getElementById("profileImageEditError").textContent = "";
    if (!file) {
        profileImageRead = Promise.resolve();
        return;
    }
    if (!file.type.startsWith("image/")) {
        document.getElementById("profileImageEditError").textContent = "Choose a valid image file.";
        event.currentTarget.value = "";
        profileImageRead = Promise.resolve();
        return;
    }
    profileImageRead = new Promise(resolve => {
        const reader = new FileReader();
        reader.addEventListener("load", () => {
            if (typeof reader.result === "string") pendingProfileImage = reader.result;
            resolve();
        });
        reader.addEventListener("error", () => {
            document.getElementById("profileImageEditError").textContent = "The selected image could not be read.";
            event.currentTarget.value = "";
            resolve();
        });
        reader.readAsDataURL(file);
    });
});

document.getElementById("saveProfileImageBtn").addEventListener("click", async () => {
    if (!activeDetailsEmployee) return;
    await profileImageRead;
    const url = document.getElementById("updatedProfileImageUrl").value.trim();
    let imageSource = pendingProfileImage;
    if (!imageSource && url) {
        try {
            const parsedUrl = new URL(url);
            if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") throw new Error("Unsupported image URL protocol.");
            imageSource = url;
        } catch {
            document.getElementById("profileImageEditError").textContent = "Enter a valid HTTP or HTTPS image URL, or choose an image file.";
            return;
        }
    }
    if (!imageSource) {
        document.getElementById("profileImageEditError").textContent =
            "Enter an image URL or choose an image file.";
        return;
    }

    const previousImage = activeDetailsEmployee.profile_image;
    const previousLegacyImage = activeDetailsEmployee.profileImage;
    activeDetailsEmployee.profile_image = imageSource;
    delete activeDetailsEmployee.profileImage;
    try {
        persistEmployees();
    } catch (error) {
        if (previousImage === undefined) delete activeDetailsEmployee.profile_image;
        else activeDetailsEmployee.profile_image = previousImage;
        if (previousLegacyImage !== undefined) activeDetailsEmployee.profileImage = previousLegacyImage;
        document.getElementById("profileImageEditError").textContent = "Could not save this image. It may be too large for local storage.";
        return;
    }
    refreshEmployeeDetailsHeader();
    populateEmployeeSidebar();
    renderScheduleGrid();
    document.getElementById("editProfileImageDialog").close();
});

document.getElementById("cancelProfileImageBtn").addEventListener("click", () => {
    document.getElementById("editProfileImageDialog").close();
});

document.getElementById("editEmployeeInfoBtn").addEventListener("click", () => {
    if (!activeDetailsEmployee) return;
    document.getElementById("updatedEmployeeName").value = activeDetailsEmployee.name || "";
    document.getElementById("updatedEmployeePosition").value =
        activeDetailsEmployee.job_position || activeDetailsGroupKey;
    populateEmployeeColorSelect(
        document.getElementById("updatedEmployeeColor"),
        activeDetailsEmployee.scheduleColor,
        activeDetailsEmployee
    );
    document.getElementById("employeeInfoEditError").textContent = "";
    document.getElementById("editEmployeeInfoDialog").showModal();
});

document.getElementById("cancelEmployeeInfoBtn").addEventListener("click", () => {
    document.getElementById("editEmployeeInfoDialog").close();
});

document.getElementById("saveEmployeeInfoBtn").addEventListener("click", () => {
    if (!activeDetailsEmployee || !activeDetailsGroupKey) return;
    const name = document.getElementById("updatedEmployeeName").value.trim();
    const position = document.getElementById("updatedEmployeePosition").value;
    if (!name) {
        document.getElementById("employeeInfoEditError").textContent = "Employee name is required.";
        return;
    }
    const oldGroup = activeDetailsGroupKey;
    const previousName = activeDetailsEmployee.name;
    const previousPosition = activeDetailsEmployee.job_position;
    const previousColor = activeDetailsEmployee.scheduleColor;
    const color = document.getElementById("updatedEmployeeColor").value;
    if (!isEmployeeColorAvailable(color, activeDetailsEmployee)) {
        document.getElementById("employeeInfoEditError").textContent =
            "That color is already assigned. Choose an available color.";
        return;
    }
    activeDetailsEmployee.name = name;
    activeDetailsEmployee.job_position = position;
    activeDetailsEmployee.scheduleColor = color;
    if (oldGroup !== position) {
        employees[oldGroup] = (employees[oldGroup] || []).filter(employee => employee !== activeDetailsEmployee);
        employees[position] = employees[position] || [];
        employees[position].push(activeDetailsEmployee);
    }
    try {
        persistEmployees();
    } catch (error) {
        activeDetailsEmployee.name = previousName;
        if (previousPosition === undefined) delete activeDetailsEmployee.job_position;
        else activeDetailsEmployee.job_position = previousPosition;
        if (previousColor === undefined) delete activeDetailsEmployee.scheduleColor;
        else activeDetailsEmployee.scheduleColor = previousColor;
        if (oldGroup !== position) {
            employees[position] = (employees[position] || []).filter(employee => employee !== activeDetailsEmployee);
            employees[oldGroup] = employees[oldGroup] || [];
            employees[oldGroup].push(activeDetailsEmployee);
        }
        document.getElementById("employeeInfoEditError").textContent = "Could not save employee changes.";
        return;
    }
    activeDetailsGroupKey = position;
    if (employeePendingDeletion) employeePendingDeletion.groupKey = position;
    refreshEmployeeDetailsHeader();
    populateEmployeeSidebar();
    renderScheduleGrid();
    document.getElementById("editEmployeeInfoDialog").close();
});

function refreshEmployeeDetailsHeader() {
    if (!activeDetailsEmployee) return;
    const image = document.getElementById("detailsProfileImage");
    const fallback = document.getElementById("detailsAvatarFallback");
    const name = activeDetailsEmployee.name || "Unnamed employee";
    document.getElementById("detailsEmployeeName").textContent = name;
    document.getElementById("detailsJobPosition").textContent =
        getJobPositionLabel(activeDetailsEmployee.job_position || activeDetailsGroupKey);
    fallback.textContent = getEmployeeInitials(name);
    fallback.hidden = false;
    image.hidden = true;
    image.removeAttribute("src");
    const profileImage = activeDetailsEmployee.profile_image || activeDetailsEmployee.profileImage;
    if (!profileImage) return;
    image.onload = () => { fallback.hidden = true; };
    image.onerror = () => { image.hidden = true; };
    image.src = profileImage;
    image.hidden = false;
}

function renderEmployeeAvailabilityEditor(employee) {
    const body = document.getElementById("employeeAvailabilityBody");
    body.replaceChildren();
    scheduleTimes.forEach(time => {
        const row = document.createElement("tr");
        const timeLabel = document.createElement("td");
        timeLabel.classList.add("time-label");
        timeLabel.textContent = formatScheduleTime(time);
        row.appendChild(timeLabel);

        scheduleDays.forEach(day => {
            const cell = document.createElement("td");
            cell.classList.add("avail-cell");
            cell.dataset.day = day.key;
            cell.dataset.time = time;
            cell.classList.add(isEmployeeAvailableAt(employee.id, day.key, time, false).available
                ? "available"
                : "unavailable");
            row.appendChild(cell);
        });
        body.appendChild(row);
    });
}

function saveEmployeeAvailability() {
    if (!activeDetailsEmployee) return;
    const availability = {};
    let hasUnavailableTime = false;
    scheduleDays.forEach(day => {
        const dayCells = [...document.querySelectorAll(`#employeeAvailabilityBody .avail-cell[data-day="${day.key}"]`)];
        const availableIndexes = dayCells
            .filter(cell => cell.classList.contains("available"))
            .map(cell => scheduleTimes.indexOf(cell.dataset.time));
        if (availableIndexes.length !== scheduleTimes.length) hasUnavailableTime = true;
        availability[day.key] = availabilityBlocksFromIndexes(availableIndexes);
    });
    activeDetailsEmployee.availability = hasUnavailableTime ? availability : null;
    persistEmployees();
    const conflicts = reconcileAvailabilityConflicts(new Set([activeDetailsEmployee.id]));
    document.getElementById("availabilityEditSection").hidden = true;
    document.getElementById("editAvailabilityBtn").textContent = "Edit Availability";
    populateEmployeeDetailsList(
        document.getElementById("detailsAvailability"),
        formatEmployeeAvailability(activeDetailsEmployee.availability)
    );
    renderScheduleGrid();
    updateScheduleControls();
    showAvailabilityConflictResult(conflicts, "Availability saved.");
}

function availabilityBlocksFromIndexes(indexes) {
    if (!indexes.length) return { block_1: { start_time: null, end_time: null } };
    const blocks = [];
    let start = indexes[0];
    let previous = indexes[0];
    indexes.slice(1).forEach(index => {
        if (index !== previous + 1) {
            blocks.push({ start_time: indexToTime(start), end_time: indexToTime(previous + 1) });
            start = index;
        }
        previous = index;
    });
    blocks.push({ start_time: indexToTime(start), end_time: indexToTime(previous + 1) });
    return Object.fromEntries(blocks.map((block, index) => [`block_${index + 1}`, block]));
}

function persistEmployees() {
    localStorage.setItem("employees", JSON.stringify(employees));
    recordUndoHistory();
}

function renderTimeOffDraft() {
    const list = document.getElementById("timeOffEditList");
    list.replaceChildren();
    if (timeOffDraft.length === 0) {
        const empty = document.createElement("p");
        empty.textContent = "No days off scheduled.";
        list.appendChild(empty);
        return;
    }

    timeOffDraft.forEach((period, index) => {
        const row = document.createElement("div");
        row.classList.add("time-off-edit-item");
        const dates = document.createElement("span");
        dates.textContent = formatEmployeeTimeOff([period])[0];
        const updateButton = document.createElement("button");
        updateButton.type = "button";
        updateButton.textContent = "Update";
        updateButton.addEventListener("click", () => openTimeOffEditor(index));
        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.classList.add("delete-employee-button");
        deleteButton.textContent = "Delete";
        deleteButton.addEventListener("click", () => {
            timeOffDraft.splice(index, 1);
            renderTimeOffDraft();
        });
        row.append(dates, updateButton, deleteButton);
        list.appendChild(row);
    });
}

function openTimeOffEditor(index) {
    const period = timeOffDraft[index];
    if (!period) return;
    editingTimeOffIndex = index;
    document.getElementById("editTimeOffStart").value = period.start_date || "";
    document.getElementById("editTimeOffEnd").value = period.end_date || "";
    document.getElementById("editTimeOffError").textContent = "";
    document.getElementById("editTimeOffDialog").showModal();
}

function isValidTimeOffRange(start, end) {
    return Boolean(start && end && start <= end);
}

function getJobPositionLabel(position) {
    return {
        GSS: "GSS",
        GSS_key_holder: "GSS-Key Holder",
        Manager: "Manager"
    }[position] || position || "Not provided";
}

function populateEmployeeDetailsList(list, entries) {
    list.replaceChildren();
    entries.forEach(entry => {
        const item = document.createElement("li");
        item.textContent = entry;
        list.appendChild(item);
    });
}

function formatEmployeeAvailability(availability) {
    if (!availability || typeof availability !== "object") {
        return ["All days: Fully available (6am-10pm)"];
    }

    const days = [
        ["sun", "Sunday"],
        ["mon", "Monday"],
        ["tue", "Tuesday"],
        ["wed", "Wednesday"],
        ["thu", "Thursday"],
        ["fri", "Friday"],
        ["sat", "Saturday"]
    ];

    return days.map(([key, label]) => {
        if (!Object.prototype.hasOwnProperty.call(availability, key)) {
            return `${label}: Fully available (6am-10pm)`;
        }
        const dayAvailability = availability[key] || {};
        const blocks = Object.values(dayAvailability)
            .filter(block => block && (block.start_time || block.start) && (block.end_time || block.end))
            .map(block => `${formatScheduleTime(block.start_time || block.start)}-${formatScheduleTime(block.end_time || block.end)}`);
        const explicitlyRestricted = Object.values(dayAvailability).some(block =>
            block && typeof block === "object"
            && (Object.prototype.hasOwnProperty.call(block, "start_time")
                || Object.prototype.hasOwnProperty.call(block, "start")
                || Object.prototype.hasOwnProperty.call(block, "end_time")
                || Object.prototype.hasOwnProperty.call(block, "end"))
        );
        const legacyDefaultAvailability = Object.keys(dayAvailability).length >= 2
            && Object.values(dayAvailability).every(block =>
                block && typeof block === "object"
                && !block.start_time && !block.start && !block.end_time && !block.end
            );
        if (legacyDefaultAvailability) return `${label}: Fully available (6am-10pm)`;
        return `${label}: ${blocks.length ? blocks.join(", ") : explicitlyRestricted ? "Unavailable" : "Fully available (6am-10pm)"}`;
    });
}

function formatEmployeeTimeOff(timeOff) {
    if (!Array.isArray(timeOff) || timeOff.length === 0) return ["None scheduled"];

    return timeOff.map(period => {
        if (!period || (!period.start_date && !period.end_date)) return "Dates not provided";
        const start = formatEmployeeDate(period.start_date);
        const end = formatEmployeeDate(period.end_date);
        return start === end ? start : `${start} - ${end}`;
    });
}

function formatEmployeeDate(date) {
    if (!date) return "Date not provided";
    const parsedDate = new Date(`${date}T00:00:00`);
    return Number.isNaN(parsedDate.getTime())
        ? String(date)
        : parsedDate.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

document.getElementById("closeEmployeeDetailsBtn").addEventListener("click", () => {
    document.getElementById("employeeDetailsDialog").close();
});

document.getElementById("editAvailabilityBtn").addEventListener("click", event => {
    const section = document.getElementById("availabilityEditSection");
    if (section.hidden) {
        renderEmployeeAvailabilityEditor(activeDetailsEmployee);
        section.hidden = false;
        event.currentTarget.textContent = "Save Availability";
    } else {
        saveEmployeeAvailability();
    }
});

document.getElementById("employeeAvailabilityBody").addEventListener("click", event => {
    const cell = event.target.closest(".avail-cell");
    if (!cell) return;
    cell.classList.toggle("available");
    cell.classList.toggle("unavailable");
});

document.querySelectorAll("#employeeAvailabilityTable thead th[data-day]").forEach(header => {
    header.addEventListener("click", () => {
        const cells = [...document.querySelectorAll(
            `#employeeAvailabilityBody .avail-cell[data-day="${header.dataset.day}"]`
        )];
        const makeAvailable = cells.some(cell => cell.classList.contains("unavailable"));
        cells.forEach(cell => {
            cell.classList.toggle("available", makeAvailable);
            cell.classList.toggle("unavailable", !makeAvailable);
        });
    });
});

document.getElementById("editTimeOffBtn").addEventListener("click", event => {
    const section = document.getElementById("timeOffEditSection");
    if (section.hidden) {
        timeOffDraft = Array.isArray(activeDetailsEmployee.timeOff)
            ? activeDetailsEmployee.timeOff.map(period => ({ ...period }))
            : [];
        renderTimeOffDraft();
        section.hidden = false;
        event.currentTarget.textContent = "Save Time Off";
    } else {
        if (!document.getElementById("employeeTimeOffForm").hidden) {
            document.getElementById("timeOffEditError").textContent =
                "Add the date range or close the add form before saving.";
            return;
        }
        activeDetailsEmployee.timeOff = timeOffDraft.map(period => ({ ...period }));
        persistEmployees();
        const conflicts = reconcileAvailabilityConflicts(new Set([activeDetailsEmployee.id]));
        populateEmployeeDetailsList(
            document.getElementById("detailsTimeOff"),
            formatEmployeeTimeOff(activeDetailsEmployee.timeOff)
        );
        renderScheduleGrid();
        updateScheduleControls();
        showAvailabilityConflictResult(conflicts, "Time off saved.");
        section.hidden = true;
        event.currentTarget.textContent = "Edit Time Off";
        document.getElementById("timeOffEditError").textContent = "";
    }
});

document.getElementById("addEmployeeTimeOffBtn").addEventListener("click", () => {
    const form = document.getElementById("employeeTimeOffForm");
    form.hidden = !form.hidden;
    document.getElementById("timeOffEditError").textContent = "";
});

document.getElementById("saveNewEmployeeTimeOffBtn").addEventListener("click", () => {
    const start = document.getElementById("employeeTimeOffStart").value;
    const end = document.getElementById("employeeTimeOffEnd").value;
    if (!isValidTimeOffRange(start, end)) {
        document.getElementById("timeOffEditError").textContent =
            "Choose a valid start and end date; the end date cannot be before the start date.";
        return;
    }
    timeOffDraft.push({ start_date: start, end_date: end });
    document.getElementById("employeeTimeOffStart").value = "";
    document.getElementById("employeeTimeOffEnd").value = "";
    document.getElementById("employeeTimeOffForm").hidden = true;
    document.getElementById("timeOffEditError").textContent = "";
    renderTimeOffDraft();
});

document.getElementById("saveEditedTimeOffBtn").addEventListener("click", () => {
    const start = document.getElementById("editTimeOffStart").value;
    const end = document.getElementById("editTimeOffEnd").value;
    if (!isValidTimeOffRange(start, end)) {
        document.getElementById("editTimeOffError").textContent =
            "Choose a valid start and end date; the end date cannot be before the start date.";
        return;
    }
    if (editingTimeOffIndex === null || !timeOffDraft[editingTimeOffIndex]) return;
    timeOffDraft[editingTimeOffIndex] = { start_date: start, end_date: end };
    renderTimeOffDraft();
    editingTimeOffIndex = null;
    document.getElementById("editTimeOffDialog").close();
});

document.getElementById("deleteEditedTimeOffBtn").addEventListener("click", () => {
    if (editingTimeOffIndex === null) return;
    timeOffDraft.splice(editingTimeOffIndex, 1);
    renderTimeOffDraft();
    editingTimeOffIndex = null;
    document.getElementById("editTimeOffDialog").close();
});

document.getElementById("cancelEditedTimeOffBtn").addEventListener("click", () => {
    editingTimeOffIndex = null;
    document.getElementById("editTimeOffDialog").close();
});

document.getElementById("deleteEmployeeBtn").addEventListener("click", () => {
    if (!employeePendingDeletion) return;

    document.getElementById("deleteEmployeeMessage").textContent =
        `Are you sure you want to delete ${employeePendingDeletion.employee.name || "this employee"}? This will also remove them from any assigned shifts.`;
    document.getElementById("deleteEmployeeDialog").showModal();
});

document.getElementById("cancelEmployeeDeleteBtn").addEventListener("click", () => {
    document.getElementById("deleteEmployeeDialog").close();
});

document.getElementById("confirmEmployeeDeleteBtn").addEventListener("click", () => {
    if (!employeePendingDeletion) return;

    const { employee, groupKey } = employeePendingDeletion;
    employees[groupKey] = (employees[groupKey] || []).filter(emp => emp.id !== employee.id);
    localStorage.setItem("employees", JSON.stringify(employees));
    removeEmployeeFromSchedule(employee.id);
    if (String(selectedEmployeeId) === String(employee.id)) selectedEmployeeId = null;
    populateEmployeeSidebar();
    renderScheduleGrid();
    updateScheduleControls();

    document.getElementById("deleteEmployeeDialog").close();
    document.getElementById("employeeDetailsDialog").close();
    employeePendingDeletion = null;
});

function removeEmployeeFromSchedule(empId) {
    Object.keys(scheduleWeeks).forEach(weekId => {
        const week = scheduleWeeks[weekId];

        Object.keys(week.days).forEach(day => {
            const shifts = week.days[day];

            Object.keys(shifts).forEach(shiftKey => {
                if (String(getShiftEmployeeId(shifts[shiftKey])) === String(empId)) {
                    if (weekId === currentWeekId
                        && selectedShift?.day === day
                        && selectedShift.shiftKey === shiftKey) {
                        selectedShift = null;
                    }
                    delete shifts[shiftKey];
                }
            });
        });
    });

    persistSchedule();
}

function getShiftEmployeeId(shift) {
    const employee = shift?.employee ?? shift?.employeeId ?? shift?.employee_id;
    if (employee && typeof employee === "object") {
        return employee.id ?? employee.employeeId ?? employee.employee_id;
    }
    return employee;
}


// ===============================
// GET EMPLOYEE NAME
// ===============================

function getEmployeeName(id) {
    if (id === null || id === undefined) return "Unassigned";

    const all = [
        ...(employees.GSS || []),
        ...(employees.GSS_key_holder || []),
        ...(employees.Manager || [])
    ];

    const emp = all.find(e => String(e.id) === String(id));
    return emp ? emp.name : "Unknown";
}

function getEmployeeColor(employeeId) {
    const employee = getEmployeeById(employeeId);
    return getEmployeeBaseColor(employee || { id: employeeId });
}

function getEmployeeBaseColor(employee) {
    if (employeeColors.some(color => color.value === employee.scheduleColor)) {
        return employee.scheduleColor;
    }
    const key = String(employee.id ?? "unassigned");
    const stableIndex = [...key].reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0, 0)
        % employeeColors.length;
    return employeeColors[stableIndex].value;
}

function getUsedEmployeeColors(excludedEmployee = null) {
    return new Set(getAllEmployees()
        .filter(employee => employee !== excludedEmployee)
        .map(employee => employee.scheduleColor)
        .filter(color => employeeColors.some(option => option.value === color)));
}

function isEmployeeColorAvailable(color, excludedEmployee = null) {
    return employeeColors.some(option => option.value === color)
        && !getUsedEmployeeColors(excludedEmployee).has(color);
}

function populateEmployeeColorSelect(select, selectedValue = "random", excludedEmployee = null) {
    const usedColors = getUsedEmployeeColors(excludedEmployee);
    select.replaceChildren();
    employeeColors.forEach(color => {
        const option = document.createElement("option");
        option.value = color.value;
        option.textContent = usedColors.has(color.value) ? `${color.label} (in use)` : color.label;
        option.style.backgroundColor = color.value;
        option.style.color = getColorTextColor(color.value);
        option.disabled = usedColors.has(color.value);
        select.appendChild(option);
    });
    const desiredColorAvailable = employeeColors.some(color => color.value === selectedValue)
        && !usedColors.has(selectedValue);
    if (desiredColorAvailable) select.value = selectedValue;
    else {
        const firstAvailable = employeeColors.find(color => !usedColors.has(color.value));
        if (firstAvailable) select.value = firstAvailable.value;
        else select.value = "";
    }
}

function ensureUniqueEmployeeColors() {
    const usedColors = new Set();
    const allEmployees = getAllEmployees();
    for (const employee of allEmployees) {
        const currentColor = employee.scheduleColor;
        const isValidAndUnused = employeeColors.some(color => color.value === currentColor)
            && !usedColors.has(currentColor);
        const assignedColor = isValidAndUnused
            ? currentColor
            : employeeColors.find(color => !usedColors.has(color.value))?.value;
        if (!assignedColor) return false;
        employee.scheduleColor = assignedColor;
        usedColors.add(assignedColor);
    }
    persistEmployees();
    return true;
}

function getColorTextColor(hexColor) {
    const channels = hexColor.match(/[0-9a-f]{2}/gi).map(value => parseInt(value, 16));
    const luminance = (channels[0] * 299 + channels[1] * 587 + channels[2] * 114) / 1000;
    return luminance > 150 ? "#111827" : "#ffffff";
}

// ===============================
// LOCK TOGGLE
// ===============================

document.getElementById("lockCheckbox").addEventListener("change", (e) => {
    if (e.target.checked) {
        const issues = validateWeekSchedule(currentWeekId);
        if (issues.length) {
            e.target.checked = false;
            scheduleLocked = false;
            showScheduleError(`Cannot lock this schedule until these requirements are met:\n${issues.map(issue => `- ${issue}`).join("\n")}`);
            return;
        }
        clearScheduleError();
    }

    const wasLocked = scheduleLocked;
    scheduleLocked = e.target.checked;
    scheduleWeeks[currentWeekId].locked = scheduleLocked;
    persistSchedule();
    if (wasLocked && !scheduleLocked) {
        const conflicts = reconcileAvailabilityConflicts(null, [currentWeekId]);
        renderScheduleGrid();
        showAvailabilityConflictResult(conflicts, "Schedule unlocked.");
    }
    updateScheduleControls();
});


// ===============================
// AUTO SCHEDULE
// ===============================

document.getElementById("autoScheduleBtn").addEventListener("click", () => {
    if (scheduleLocked) {
        showScheduleError("Unlock this schedule before creating an auto-schedule.");
        return;
    }
    populateAutoScheduleOptions();
    document.getElementById("autoScheduleDialog").showModal();
});

document.getElementById("cancelAutoScheduleBtn").addEventListener("click", () => {
    document.getElementById("autoScheduleDialog").close();
});

document.getElementById("autoScheduleDialog").addEventListener("click", event => {
    if (event.target === event.currentTarget) event.currentTarget.close();
});

document.getElementById("autoScheduleForm").addEventListener("submit", event => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    try {
        createAutoSchedule();
        document.getElementById("autoScheduleDialog").close();
    } catch (error) {
        showScheduleError(`Auto-schedule failed: ${error.message}`);
        console.error("Could not create an auto-schedule.", error);
    }
});

function populateAutoScheduleOptions() {
    const employeeOptions = document.getElementById("autoScheduleEmployees");
    employeeOptions.replaceChildren();
    getAllEmployees().forEach((employee, index) => {
        const label = document.createElement("label");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = true;
        checkbox.dataset.employeeId = String(employee.id);
        checkbox.id = `autoScheduleEmployee${index}`;
        const name = document.createElement("span");
        name.textContent = `${employee.name || "Unnamed employee"} (${getEmployeePosition(employee)})`;
        label.htmlFor = checkbox.id;
        label.append(checkbox, name);
        employeeOptions.appendChild(label);
    });

    const dayOptions = document.getElementById("autoScheduleDays");
    dayOptions.replaceChildren();
    scheduleDays.forEach((day, index) => {
        const label = document.createElement("label");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = true;
        checkbox.dataset.day = day.key;
        checkbox.id = `autoScheduleDay${index}`;
        const name = document.createElement("span");
        name.textContent = day.label;
        label.htmlFor = checkbox.id;
        label.append(checkbox, name);
        dayOptions.appendChild(label);
    });
}

function getAutoScheduleGaps(shifts, day, weekId) {
    let understaffedHours = 0;
    let uncoveredRoleHours = 0;
    let managerlessKeyHolderHours = 0;
    const { openingIndex, closingIndex } = getAutoScheduleBoundaries(weekId, day);
    scheduleTimes.forEach((time, index) => {
        if (index < openingIndex || index >= closingIndex) return;
        const working = shifts.filter(shift => index >= shift.startIndex && index < shift.endIndex);
        const employeeIds = new Set(working.map(shift => String(shift.employee.id)));
        if (employeeIds.size < 2) understaffedHours++;
        if (!working.some(shift => getEmployeePosition(shift.employee) === "Manager")) {
            if (working.some(shift => getEmployeePosition(shift.employee) === "GSS_key_holder")) {
                managerlessKeyHolderHours++;
            } else {
                uncoveredRoleHours++;
            }
        }
    });
    const openerIds = new Set(shifts
        .filter(shift => shift.startIndex === openingIndex)
        .map(shift => String(shift.employee.id)));
    const closerIds = new Set(shifts
        .filter(shift => shift.endIndex === closingIndex)
        .map(shift => String(shift.employee.id)));
    const middleIds = new Set(shifts
        .filter(shift => shift.startIndex !== openingIndex && shift.endIndex !== closingIndex)
        .map(shift => String(shift.employee.id)));
    const employeeIds = new Set(shifts.map(shift => String(shift.employee.id)));
    const missingOpeners = Math.max(0, 2 - openerIds.size);
    const excessOpeners = Math.max(0, openerIds.size - 2);
    const missingClosers = Math.max(0, 3 - closerIds.size);
    const excessClosers = Math.max(0, closerIds.size - 4);
    const excessMiddleShifts = Math.max(0, middleIds.size - 1);
    const missingEmployees = Math.max(0, 5 - employeeIds.size);
    const excessEmployees = Math.max(0, employeeIds.size - 7);
    const excessManagerlessKeyHolderHours = Math.max(0, managerlessKeyHolderHours - 3);
    return {
        understaffedHours,
        uncoveredRoleHours,
        managerlessKeyHolderHours,
        excessManagerlessKeyHolderHours,
        missingOpeners,
        excessOpeners,
        missingClosers,
        excessClosers,
        excessMiddleShifts,
        missingEmployees,
        excessEmployees,
        openers: openerIds.size,
        closers: closerIds.size,
        middleShifts: middleIds.size,
        employeeCount: employeeIds.size,
        penalty: understaffedHours * 8 + uncoveredRoleHours * 12 + excessManagerlessKeyHolderHours * 12
            + missingOpeners * 8 + excessOpeners * 16
            + missingClosers * 8 + excessClosers * 16
            + excessMiddleShifts * 12 + missingEmployees * 8 + excessEmployees * 32
    };
}

function createAutoSchedule() {
    if (scheduleLocked) throw new Error("Unlock this schedule before creating an auto-schedule.");
    const weeklyMax = Number(document.getElementById("autoScheduleWeeklyMax").value);
    const dailyMax = Number(document.getElementById("autoScheduleDailyMax").value);
    if (!Number.isInteger(weeklyMax) || weeklyMax < 0 || weeklyMax > 168) {
        throw new Error("The weekly maximum must be between 0 and 168 hours.");
    }
    if (!Number.isInteger(dailyMax) || dailyMax < 3 || dailyMax > 16) {
        throw new Error("The daily maximum must be between 3 and 16 hours.");
    }
    const selectedEmployeeIds = new Set([...document.querySelectorAll("#autoScheduleEmployees input:checked")]
        .map(checkbox => checkbox.dataset.employeeId));
    const selectedDays = new Set([...document.querySelectorAll("#autoScheduleDays input:checked")]
        .map(checkbox => checkbox.dataset.day));
    if (!selectedDays.size) throw new Error("Select at least one day to schedule.");

    const nextWeeks = cloneEmployeeData(scheduleWeeks);
    const nextWeek = nextWeeks[currentWeekId];
    if (!nextWeek || !nextWeek.days) throw new Error("The selected week is not available.");
    const weeklyMinutes = new Map(getAllEmployees().map(employee => [String(employee.id), 0]));
    scheduleDays.forEach(day => {
        if (selectedDays.has(day.key)) {
            nextWeek.days[day.key] = {};
            return;
        }
        getDayShifts(day.key, currentWeekId).forEach(shift => {
            const employeeId = getShiftEmployeeId(shift.info);
            if (employeeId === null || employeeId === undefined) return;
            const start = timeToMinutes(shift.startTime);
            const end = timeToMinutes(shift.endTime);
            if (start === null || end === null || end <= start) return;
            const key = String(employeeId);
            weeklyMinutes.set(key, (weeklyMinutes.get(key) || 0) + end - start);
        });
    });

    let generatedShiftCount = 0;
    let shiftSequence = 0;
    const remainingGaps = [];
    scheduleDays.filter(day => selectedDays.has(day.key)).forEach(day => {
        const shifts = [];
        const scheduledToday = new Set();
        const candidates = [];
        const { openingIndex, closingIndex } = getAutoScheduleBoundaries(currentWeekId, day.key);
        getAllEmployees().forEach(employee => {
            const employeeId = String(employee.id);
            if (!selectedEmployeeIds.has(employeeId)) return;
            for (let startIndex = openingIndex; startIndex < closingIndex; startIndex++) {
                for (let duration = 3; duration <= dailyMax && startIndex + duration <= closingIndex; duration++) {
                    const endIndex = startIndex + duration;
                    let available = true;
                    for (let index = startIndex; index < endIndex; index++) {
                        if (!isEmployeeAvailableAt(employee.id, day.key, scheduleTimes[index], true, currentWeekId).available) {
                            available = false;
                            break;
                        }
                    }
                    if (available) candidates.push({ employee, startIndex, endIndex, duration });
                }
            }
        });

        while (true) {
            const currentGaps = getAutoScheduleGaps(shifts, day.key, currentWeekId);
            if (!currentGaps.penalty) break;
            let best = null;
            candidates.forEach(candidate => {
                const employeeId = String(candidate.employee.id);
                if (scheduledToday.has(employeeId)) return;
                const currentMinutes = weeklyMinutes.get(employeeId) || 0;
                if (currentMinutes + candidate.duration * 60 > weeklyMax * 60) return;
                const possibleShift = {
                    employee: candidate.employee,
                    startIndex: candidate.startIndex,
                    endIndex: candidate.endIndex
                };
                const improvedGaps = getAutoScheduleGaps([...shifts, possibleShift], day.key, currentWeekId);
                const boundaryBenefit = currentGaps.missingOpeners + currentGaps.missingClosers
                    - improvedGaps.missingOpeners - improvedGaps.missingClosers;
                const benefit = currentGaps.penalty - improvedGaps.penalty;
                if (boundaryBenefit <= 0 && benefit <= 0) return;
                const fairness = (weeklyMax * 60 - currentMinutes) / (weeklyMax * 60 + 1);
                const boundaryPriority = candidate.startIndex === openingIndex || candidate.endIndex === closingIndex
                    ? 0.1
                    : 0;
                const shiftLengthPreference = 8 - Math.abs(candidate.duration - 8) * 2;
                const managerExtensionPriority = getEmployeePosition(candidate.employee) === "Manager"
                    ? Math.max(0, candidate.duration - 8) * 0.25
                    : 0;
                const managerPriority = getEmployeePosition(candidate.employee) === "Manager" ? 0.1 : 0;
                const score = boundaryBenefit * 1000 + benefit
                    + managerExtensionPriority + managerPriority
                    + shiftLengthPreference + fairness * 0.001 + boundaryPriority;
                if (!best || score > best.score) best = { ...candidate, score };
            });
            if (!best) break;

            const employeeId = String(best.employee.id);
            const startTime = indexToTime(best.startIndex);
            const endTime = indexToTime(best.endIndex);
            shifts.push({
                employee: best.employee,
                startIndex: best.startIndex,
                endIndex: best.endIndex,
                startTime,
                endTime
            });
            scheduledToday.add(employeeId);
            weeklyMinutes.set(employeeId, (weeklyMinutes.get(employeeId) || 0) + best.duration * 60);
            shiftSequence++;
            nextWeek.days[day.key][`auto_${Date.now()}_${shiftSequence}`] = {
                start_time: startTime,
                end_time: endTime,
                employee: best.employee.id
            };
            generatedShiftCount++;
        }

        const gaps = getAutoScheduleGaps(shifts, day.key, currentWeekId);
        if (gaps.penalty) {
            const issues = [];
            const addIssue = (count, singular, plural = `${singular}s`) => {
                if (count) issues.push(`${count} ${count === 1 ? singular : plural}`);
            };
            addIssue(gaps.understaffedHours, "understaffed hour");
            addIssue(gaps.uncoveredRoleHours, "hour without a manager or key holder", "hours without managers or key holders");
            addIssue(gaps.excessManagerlessKeyHolderHours, "excess managerless key-holder hour");
            addIssue(gaps.missingOpeners, "missing opener");
            addIssue(gaps.excessOpeners, "excess opener");
            addIssue(gaps.missingClosers, "missing closer");
            addIssue(gaps.excessClosers, "excess closer");
            addIssue(gaps.excessMiddleShifts, "excess middle shift");
            if (gaps.missingEmployees) {
                issues.push(`needs ${gaps.missingEmployees} more employee${gaps.missingEmployees === 1 ? "" : "s"} to reach 5`);
            }
            if (gaps.excessEmployees) {
                issues.push(`${gaps.excessEmployees} employee${gaps.excessEmployees === 1 ? "" : "s"} above the 7-person limit`);
            }
            remainingGaps.push(`${day.label}: ${issues.join("; ")}.`);
        }
    });

    scheduleWeeks = nextWeeks;
    selectedShift = null;
    persistSchedule();
    renderScheduleGrid();
    updateScheduleControls();
    if (remainingGaps.length) {
        showScheduleError(`Auto-schedule saved ${generatedShiftCount} shift(s), but could not meet all coverage requirements:\n${remainingGaps.join("\n")}`);
    } else {
        showScheduleSuccess(`Auto-schedule complete. Created ${generatedShiftCount} shift(s) for ${selectedDays.size} day(s).`);
    }
}


// ===============================
// LOGOUT
// ===============================

document.getElementById("logoutBtn").addEventListener("click", () => {
    localStorage.removeItem("mistersUser");
    window.location.href = "index.html";
});


// ===============================
// EXPORT SCHEDULE DATA
// ===============================
document.getElementById("importScheduleBtn").addEventListener("click", () => {
    document.getElementById("importFileInput").click();
});

document.getElementById("importFileInput").addEventListener("change", async (event) => {
    const input = event.currentTarget;
    try {
        const files = [...input.files];
        if (!files.length) return;
        if (files.length !== 1) throw new Error("Import one JSON backup file at a time.");
        await importScheduleJson(await files[0].text());
    } catch (error) {
        showScheduleError(`Import failed: ${error.message}`);
        console.error("Could not import schedule data.", error);
    } finally {
        input.value = "";
    }
});

document.getElementById("exportScheduleBtn").addEventListener("click", async () => {
    try {
        const backup = {
            format: "misters-mls-schedule-backup",
            version: 1,
            employees: cloneEmployeeData(employees),
            scheduleWeeks: {
                [currentWeekId]: {
                    date: scheduleWeeks[currentWeekId].date,
                    days: cloneEmployeeData(scheduleWeeks[currentWeekId].days)
                }
            }
        };

        const links = document.getElementById("scheduleExportLinks");
        links.replaceChildren();
        links.appendChild(createJsonDownloadLink(backup));
        document.getElementById("scheduleExportDialog").showModal();
    } catch (error) {
        showScheduleError(`Export failed: ${error.message}`);
        console.error("Could not export schedule data.", error);
    }
});

function getAvailabilityCsvRows(employee) {
    const employeeAvailability = employee.availability;
    return scheduleDays.flatMap(day => {
        const dayAvailability = employeeAvailability && employeeAvailability[day.key];
        if (!dayAvailability || typeof dayAvailability !== "object") {
            return [[employee.id, day.key, "true", "", ""]];
        }
        const blocks = Object.values(dayAvailability).filter(block => block && typeof block === "object");
        const legacyDefault = blocks.length >= 2 && blocks.every(block =>
            !block.start_time && !block.start && !block.end_time && !block.end
        );
        if (legacyDefault) return [[employee.id, day.key, "true", "", ""]];

        const ranges = blocks
            .map(block => [block.start_time || block.start, block.end_time || block.end])
            .filter(([start, end]) => start && end);
        if (ranges.length) return ranges.map(([start, end]) => [employee.id, day.key, "false", start, end]);
        const explicitlyRestricted = blocks.some(block =>
            Object.prototype.hasOwnProperty.call(block, "start_time")
            || Object.prototype.hasOwnProperty.call(block, "start")
            || Object.prototype.hasOwnProperty.call(block, "end_time")
            || Object.prototype.hasOwnProperty.call(block, "end")
        );
        return explicitlyRestricted
            ? [[employee.id, day.key, "false", "", ""]]
            : [[employee.id, day.key, "true", "", ""]];
    });
}

function csvEscape(value) {
    const text = value === null || value === undefined ? "" : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function createJsonDownloadLink(data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.className = "schedule-export-link";
    link.href = url;
    link.download = "schedule_data.json";
    link.textContent = "Download schedule_data.json";
    link.dataset.blobUrl = url;
    return link;
}

document.getElementById("closeScheduleExportBtn").addEventListener("click", () => {
    document.getElementById("scheduleExportDialog").close();
});

document.getElementById("scheduleExportDialog").addEventListener("close", () => {
    const links = document.getElementById("scheduleExportLinks");
    links.querySelectorAll("a[data-blob-url]").forEach(link => URL.revokeObjectURL(link.dataset.blobUrl));
    links.replaceChildren();
});

function parseCsvText(text) {
    const records = [];
    let row = [];
    let value = "";
    let quoted = false;
    const source = text.replace(/^\uFEFF/, "");
    for (let index = 0; index < source.length; index++) {
        const character = source[index];
        if (quoted) {
            if (character === '"' && source[index + 1] === '"') {
                value += '"';
                index++;
            } else if (character === '"') {
                quoted = false;
            } else {
                value += character;
            }
        } else if (character === '"' && value.length === 0) {
            quoted = true;
        } else if (character === ",") {
            row.push(value);
            value = "";
        } else if (character === "\n" || character === "\r") {
            if (character === "\r" && source[index + 1] === "\n") index++;
            row.push(value);
            if (row.some(field => field.trim() !== "")) records.push(row);
            row = [];
            value = "";
        } else {
            value += character;
        }
    }
    if (quoted) throw new Error("A CSV file has an unclosed quoted field.");
    row.push(value);
    if (row.some(field => field.trim() !== "")) records.push(row);
    if (records.length < 1) throw new Error("A CSV file is empty.");

    const normalizeHeader = header => {
        const normalized = header.trim().toLowerCase().replace(/[\s-]+/g, "_");
        return {
            employee_name: "name",
            job_title: "job_position",
            profile_image_url: "profile_image",
            available_from: "start_time",
            available_until: "end_time",
            first_day_off: "start_date",
            last_day_off: "end_date",
            shift_start: "start_time",
            shift_end: "end_time"
        }[normalized] || normalized;
    };
    const sectionForHeaders = headers => {
        const headerSet = new Set(headers);
        if (headerSet.has("record_type") && headerSet.has("employee_id")) return "complete";
        if (headerSet.has("name") && headerSet.has("job_position") && headerSet.has("employee_id")) return "employees";
        if (headerSet.has("employee_id") && headerSet.has("day") && headerSet.has("fully_available")) return "availability";
        if (headerSet.has("employee_id") && headerSet.has("start_date") && headerSet.has("end_date")) return "time_off";
        if (headerSet.has("day") && headerSet.has("employee_id") && headerSet.has("start_time") && headerSet.has("end_time")) return "schedule";
        return null;
    };
    const headerIndex = records.findIndex(record => sectionForHeaders(record.map(normalizeHeader)));
    if (headerIndex === -1) throw new Error("CSV columns were not recognized. Select exported employees, availability, time_off, or schedule CSV files.");
    const headers = records[headerIndex].map(normalizeHeader);
    if (new Set(headers).size !== headers.length) throw new Error("A CSV file has duplicate column names.");
    const rows = records.slice(headerIndex + 1)
        .filter(record => !record[0].trim().toLowerCase().startsWith("# help"))
        .map(record => Object.fromEntries(headers.map((header, index) => [
        header,
        record[index] || ""
    ])));
    return { headers, rows };
}

function parseCsvSection(text) {
    const parsedCsv = parseCsvText(text);
    const { headers: csvHeaders, rows } = parsedCsv;
    const headers = new Set(csvHeaders);
    if (headers.has("record_type") && headers.has("employee_id")) {
        return { name: "complete", rows };
    }
    if (headers.has("name") && headers.has("job_position") && headers.has("employee_id")) {
        return { name: "employees", rows };
    }
    if (headers.has("employee_id") && headers.has("day") && headers.has("fully_available")) {
        return { name: "availability", rows };
    }
    if (headers.has("employee_id") && headers.has("start_date") && headers.has("end_date")) {
        return { name: "time_off", rows };
    }
    if (headers.has("day") && headers.has("employee_id") && headers.has("start_time") && headers.has("end_time")) {
        return { name: "schedule", rows };
    }
    throw new Error("CSV columns were not recognized. Select exported employees, availability, time_off, or schedule CSV files.");
}

function parseBooleanField(value, label) {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
    throw new Error(`${label} must be true or false.`);
}

function normalizeEmployeeGroup(position) {
    const value = String(position || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (value === "gss") return "GSS";
    if (value === "gss_key_holder" || value === "key_holder") return "GSS_key_holder";
    if (value === "manager") return "Manager";
    throw new Error(`Unknown employee position "${position}".`);
}

function cloneEmployeeData(source) {
    return JSON.parse(JSON.stringify(source));
}

function findEmployeeInData(employeeData, employeeId) {
    return ["GSS", "GSS_key_holder", "Manager"]
        .flatMap(group => employeeData[group] || [])
        .find(employee => String(employee.id) === String(employeeId));
}

function mergeEmployeeRows(employeeData, rows) {
    const importedIds = new Set();
    rows.forEach((row, index) => {
        const employeeId = row.employee_id.trim();
        const name = row.name.trim();
        if (!employeeId || !name) throw new Error(`Employees CSV row ${index + 2} needs an employee ID and name.`);
        if (importedIds.has(employeeId)) throw new Error(`Employees CSV contains duplicate ID "${employeeId}".`);
        importedIds.add(employeeId);
        const group = normalizeEmployeeGroup(row.job_position);
        const existing = findEmployeeInData(employeeData, employeeId);
        const employee = existing || { id: /^\d+$/.test(employeeId) ? Number(employeeId) : employeeId, availability: null, timeOff: [] };
        employee.name = name;
        employee.job_position = group;
        employee.scheduleColor = row.schedule_color.trim() || employee.scheduleColor || "";
        if (row.profile_image) employee.profile_image = row.profile_image;
        else {
            delete employee.profile_image;
            delete employee.profileImage;
        }
        ["GSS", "GSS_key_holder", "Manager"].forEach(key => {
            employeeData[key] = (employeeData[key] || []).filter(candidate => candidate !== employee);
        });
        employeeData[group] = employeeData[group] || [];
        employeeData[group].push(employee);
    });
}

function applyAvailabilityRows(employeeData, rows) {
    const grouped = new Map();
    rows.forEach((row, index) => {
        const employeeId = row.employee_id.trim();
        const day = row.day.trim().toLowerCase().slice(0, 3);
        const fullyAvailable = parseBooleanField(row.fully_available.trim(), `Availability CSV row ${index + 2} fully_available`);
        if (!scheduleDays.some(item => item.key === day)) throw new Error(`Availability CSV row ${index + 2} has an invalid day.`);
        const employee = findEmployeeInData(employeeData, employeeId);
        if (!employee) throw new Error(`Availability CSV references unknown employee ID "${employeeId}". Import that employee first.`);
        const start = row.start_time.trim();
        const end = row.end_time.trim();
        if (Boolean(start) !== Boolean(end)
            || (start && (timeToMinutes(start) === null
                || timeToMinutes(end) === null
                || timeToMinutes(start) < 360
                || timeToMinutes(end) > 1320
                || timeToMinutes(end) <= timeToMinutes(start)))) {
            throw new Error(`Availability CSV row ${index + 2} has an invalid time range.`);
        }
        const key = `${employeeId}:${day}`;
        if (!grouped.has(key)) grouped.set(key, { employee, day, entries: [] });
        grouped.get(key).entries.push({ fullyAvailable, start, end });
    });

    const changedEmployees = new Set();
    grouped.forEach(({ employee, day, entries }) => {
        employee.availability = employee.availability && typeof employee.availability === "object"
            ? { ...employee.availability }
            : {};
        const dayEntries = entries.filter(entry => !entry.fullyAvailable);
        if (dayEntries.length === 0) {
            delete employee.availability[day];
        } else {
            const ranges = dayEntries.filter(entry => entry.start && entry.end);
            employee.availability[day] = ranges.length
                ? Object.fromEntries(ranges.map((range, index) => [`block_${index + 1}`, {
                    start_time: range.start,
                    end_time: range.end
                }]))
                : { block_1: { start_time: null, end_time: null } };
        }
        changedEmployees.add(employee);
    });
    changedEmployees.forEach(employee => {
        if (!Object.keys(employee.availability).length) employee.availability = null;
    });
}

function applyTimeOffRows(employeeData, rows) {
    const byEmployee = new Map();
    rows.forEach((row, index) => {
        const employeeId = row.employee_id.trim();
        const employee = findEmployeeInData(employeeData, employeeId);
        if (!employee) throw new Error(`Time-off CSV references unknown employee ID "${employeeId}". Import that employee first.`);
        if (!byEmployee.has(employeeId)) byEmployee.set(employeeId, { employee, periods: [] });
        const start = row.start_date.trim();
        const end = row.end_date.trim();
        if (!start && !end) return;
        const normalizedStart = parseImportedDate(start);
        const normalizedEnd = parseImportedDate(end);
        if (!normalizedStart || !normalizedEnd || !isValidTimeOffRange(normalizedStart, normalizedEnd)) {
            throw new Error(`Time-off CSV row ${index + 2} has an invalid date range.`);
        }
        byEmployee.get(employeeId).periods.push({ start_date: normalizedStart, end_date: normalizedEnd });
    });
    byEmployee.forEach(({ employee, periods }) => {
        employee.timeOff = periods;
    });
}

function applyScheduleRows(week, employeeData, rows) {
    const days = Object.fromEntries(scheduleDays.map(day => [day.key, {}]));
    const employeeDays = new Set();
    rows.forEach((row, index) => {
        const day = row.day.trim().toLowerCase().slice(0, 3);
        const employeeId = row.employee_id.trim();
        const start = row.start_time.trim();
        const end = row.end_time.trim();
        if (!scheduleDays.some(item => item.key === day)) throw new Error(`Schedule CSV row ${index + 2} has an invalid day.`);
        if (timeToMinutes(start) === null || timeToMinutes(end) === null
            || timeToMinutes(start) < 360 || timeToMinutes(end) > 1320
            || timeToMinutes(end) - timeToMinutes(start) < 180) {
            throw new Error(`Schedule CSV row ${index + 2} needs a valid shift of at least 3 hours between 6am and 10pm.`);
        }
        if (employeeId && !findEmployeeInData(employeeData, employeeId)) {
            throw new Error(`Schedule CSV references unknown employee ID "${employeeId}". Import that employee first.`);
        }
        if (employeeId) {
            const employeeDay = `${employeeId}:${day}`;
            if (employeeDays.has(employeeDay)) throw new Error(`Schedule CSV gives employee "${employeeId}" more than one shift on ${day}.`);
            employeeDays.add(employeeDay);
        }
        const shiftKey = `import_${index + 1}`;
        days[day][shiftKey] = {
            start_time: start,
            end_time: end,
            employee: employeeId ? (/^\d+$/.test(employeeId) ? Number(employeeId) : employeeId) : null
        };
    });
    week.days = days;
}

function normalizeImportedEmployeeColors(employeeData) {
    const used = new Set();
    let reassigned = 0;
    for (const group of ["GSS", "GSS_key_holder", "Manager"]) {
        for (const employee of employeeData[group] || []) {
            const current = employee.scheduleColor;
            const colorIsAvailable = employeeColors.some(option => option.value === current) && !used.has(current);
            const assigned = colorIsAvailable ? current : employeeColors.find(option => !used.has(option.value))?.value;
            if (!assigned) throw new Error("There are more employees than unique schedule colors.");
            if (assigned !== current) reassigned++;
            employee.scheduleColor = assigned;
            used.add(assigned);
        }
    }
    return reassigned;
}

function importCompleteCsv(rows) {
    const sectionNames = ["employees", "availability", "time_off", "schedule"];
    const sections = new Map(sectionNames.map(name => [name, []]));
    rows.forEach((row, index) => {
        const type = row.record_type.trim().toLowerCase();
        const sectionName = type === "employee" ? "employees" : type;
        if (!sections.has(sectionName)) {
            throw new Error(`CSV row ${index + 2} has an invalid record type "${row.record_type}".`);
        }
        const normalizedRow = { ...row };
        if (sectionName === "availability") {
            normalizedRow.start_time = row.availability_start_time;
            normalizedRow.end_time = row.availability_end_time;
        } else if (sectionName === "schedule") {
            normalizedRow.start_time = row.schedule_start_time;
            normalizedRow.end_time = row.schedule_end_time;
        }
        sections.get(sectionName).push(normalizedRow);
    });
    return importCsvSections(sections);
}

function commitImportedData(nextEmployees, nextWeeks) {
    const previousEmployees = localStorage.getItem("employees");
    const previousWeeks = localStorage.getItem("scheduleWeeks");
    try {
        localStorage.setItem("employees", JSON.stringify(nextEmployees));
        localStorage.setItem("scheduleWeeks", JSON.stringify(nextWeeks));
    } catch (error) {
        try {
            if (previousEmployees === null) localStorage.removeItem("employees");
            else localStorage.setItem("employees", previousEmployees);
            if (previousWeeks === null) localStorage.removeItem("scheduleWeeks");
            else localStorage.setItem("scheduleWeeks", previousWeeks);
        } catch (restoreError) {
            console.error("Could not restore local data after failed import.", restoreError);
        }
        throw new Error("Could not save imported data locally. Check available browser storage.");
    }
    employees = nextEmployees;
    scheduleWeeks = nextWeeks;
    selectedShift = null;
    if (selectedEmployeeId !== null && !getEmployeeById(selectedEmployeeId)) selectedEmployeeId = null;
    populateEmployeeSidebar();
    window.dispatchEvent(new CustomEvent("employee-colors-changed"));
    loadWeek(currentWeekId);
    recordUndoHistory();
}

async function importCsvSections(sections) {
    if (!sections.size) return;
    if (scheduleLocked && sections.has("schedule")) {
        throw new Error("Unlock the selected week before importing its schedule.");
    }
    const nextEmployees = cloneEmployeeData(employees);
    const nextWeeks = cloneEmployeeData(scheduleWeeks);
    if (sections.has("employees")) mergeEmployeeRows(nextEmployees, sections.get("employees"));
    if (sections.has("availability")) applyAvailabilityRows(nextEmployees, sections.get("availability"));
    if (sections.has("time_off")) applyTimeOffRows(nextEmployees, sections.get("time_off"));
    if (sections.has("schedule")) {
        const selectedWeek = nextWeeks[currentWeekId];
        if (!selectedWeek || !selectedWeek.days) throw new Error("The selected week is not available.");
        applyScheduleRows(selectedWeek, nextEmployees, sections.get("schedule"));
    }
    const changedAvailabilityIds = new Set([
        ...(sections.get("availability") || []).map(row => row.employee_id.trim()),
        ...(sections.get("time_off") || []).map(row => row.employee_id.trim())
    ]);
    const recoloredCount = normalizeImportedEmployeeColors(nextEmployees);
    commitImportedData(nextEmployees, nextWeeks);
    const conflicts = changedAvailabilityIds.size
        ? reconcileAvailabilityConflicts(changedAvailabilityIds)
        : { removed: [], locked: [] };
    if (conflicts.removed.some(conflict => conflict.weekId === currentWeekId)) {
        renderScheduleGrid();
        updateScheduleControls();
    }
    const scheduleMessage = sections.has("schedule")
        ? "The selected week's schedule was updated; other weeks and local-only preferences were left unchanged."
        : "Existing schedules and local-only preferences were left unchanged.";
    const importMessage = `Imported ${[...sections.keys()].join(", ")}. ${scheduleMessage}${recoloredCount ? ` ${recoloredCount} employee color(s) were reassigned to keep colors unique.` : ""}`;
    if (conflicts.removed.length || conflicts.locked.length) {
        showAvailabilityConflictResult(conflicts, importMessage);
    } else {
        showScheduleSuccess(importMessage);
    }
}

async function importScheduleJson(text) {
    const importedData = JSON.parse(text);
    if (!importedData.employees || !importedData.scheduleWeeks) {
        throw new Error("The JSON file is not a valid schedule backup; employees and schedule weeks are required.");
    }
    if (scheduleLocked) throw new Error("Unlock the selected week before importing its schedule.");

    const nextEmployees = cloneEmployeeData(employees);
    const importedEmployees = ["GSS", "GSS_key_holder", "Manager"]
        .flatMap(group => (importedData.employees[group] || []).map(employee => ({
            ...employee,
            job_position: employee.job_position || group
        })));
    mergeEmployeeRows(nextEmployees, importedEmployees.map(employee => ({
        employee_id: String(employee.id ?? ""),
        name: employee.name || "",
        job_position: employee.job_position || "",
        schedule_color: employee.scheduleColor || "",
        profile_image: employee.profile_image || employee.profileImage || ""
    })));
    importedEmployees.forEach(imported => {
        const existing = findEmployeeInData(nextEmployees, imported.id);
        if (existing) {
            existing.availability = imported.availability ?? null;
            existing.timeOff = Array.isArray(imported.timeOff) ? imported.timeOff : [];
        }
    });

    const sourceWeeks = Object.entries(importedData.scheduleWeeks);
    const currentDate = scheduleWeeks[currentWeekId].date;
    const sourceWeek = sourceWeeks.find(([, week]) => week.date === currentDate)?.[1] || sourceWeeks[0]?.[1];
    if (!sourceWeek || !sourceWeek.days) throw new Error("The JSON backup does not contain a valid week schedule.");
    const nextWeeks = cloneEmployeeData(scheduleWeeks);
    nextWeeks[currentWeekId].days = cloneEmployeeData(sourceWeek.days);
    normalizeImportedEmployeeColors(nextEmployees);
    commitImportedData(nextEmployees, nextWeeks);
    const importedEmployeeIds = new Set(importedEmployees.map(employee => String(employee.id)));
    const conflicts = reconcileAvailabilityConflicts(importedEmployeeIds);
    if (conflicts.removed.some(conflict => conflict.weekId === currentWeekId)) {
        renderScheduleGrid();
        updateScheduleControls();
    }
    const importMessage = "Imported the JSON backup's employees and schedule into the selected week. Other weeks and local-only preferences were left unchanged.";
    if (conflicts.removed.length || conflicts.locked.length) {
        showAvailabilityConflictResult(conflicts, importMessage);
    } else {
        showScheduleSuccess(importMessage);
    }
}
