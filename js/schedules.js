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
let currentDay = "sun";
let selectedShift = null;
let scheduleLocked = false;


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

    // Load JSON files
    scheduleWeeks = await loadJSON("./json/scheduleWeeks.json");
    employees = JSON.parse(localStorage.getItem("employees") || "{}");
    defaultShifts = await loadJSON("./json/defaultShifts.json");

    // Populate UI
    populateWeekSelector();
    populateEmployeeSidebar();
    setupDayTabs();
    setupButtons();

    // Load first week
    const firstWeek = Object.keys(scheduleWeeks)[0];
    loadWeek(firstWeek);
});


// ===============================
// WEEK SELECTOR
// ===============================

function populateWeekSelector() {
    const weekSelect = document.getElementById("weekSelect");
    weekSelect.innerHTML = "";

    Object.keys(scheduleWeeks).forEach(weekId => {
        const opt = document.createElement("option");
        opt.value = weekId;
        opt.textContent = `${weekId} (${scheduleWeeks[weekId].date})`;
        weekSelect.appendChild(opt);
    });

    weekSelect.addEventListener("change", () => {
        loadWeek(weekSelect.value);
    });
}


// ===============================
// LOAD WEEK
// ===============================

function loadWeek(weekId) {
    currentWeekId = weekId;
    selectedShift = null;

    const weekData = scheduleWeeks[weekId];
    scheduleLocked = weekData.locked;

    document.getElementById("lockCheckbox").checked = scheduleLocked;

    renderScheduleGrid();
    renderDay(currentDay);
}


// ===============================
// DAY TABS
// ===============================

function setupDayTabs() {
    const tabs = document.querySelectorAll(".day-tab");

    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            tabs.forEach(t => t.classList.remove("active"));
            tab.classList.add("active");

            currentDay = tab.dataset.day;
            renderDay(currentDay);
        });
    });

    // Default active
    document.querySelector(".day-tab[data-day='sun']").classList.add("active");
}


// ===============================
// RENDER SCHEDULE GRID (TIMELINE)
// ===============================

function renderScheduleGrid() {
    const grid = document.getElementById("scheduleGrid");
    grid.innerHTML = "";

    // Timeline hours 6am–10pm
    const hours = [
        "06:00","07:00","08:00","09:00","10:00","11:00",
        "12:00","13:00","14:00","15:00","16:00","17:00",
        "18:00","19:00","20:00","21:00","22:00"
    ];

    const timeline = document.createElement("div");
    timeline.classList.add("timeline");

    hours.forEach(h => {
        const block = document.createElement("div");
        block.classList.add("timeline-hour");
        block.textContent = h;
        timeline.appendChild(block);
    });

    grid.appendChild(timeline);
}


// ===============================
// RENDER DAY SHIFTS
// ===============================

function renderDay(day) {
    const grid = document.getElementById("scheduleGrid");

    // Remove old shift blocks
    const oldBlocks = document.querySelectorAll(".shift-block");
    oldBlocks.forEach(b => b.remove());

    const weekData = scheduleWeeks[currentWeekId];
    const dayData = weekData.days[day];

    Object.keys(dayData).forEach(shiftKey => {
        const shiftInfo = dayData[shiftKey];
        const shiftId = shiftInfo.shift;
        const employeeId = shiftInfo.employee;

        const shiftData = defaultShifts[shiftId];
        if (!shiftData) return;

        const block = document.createElement("div");
        block.classList.add("shift-block");
        block.dataset.shiftKey = shiftKey;
        block.dataset.shiftId = shiftId;

        block.innerHTML = `
            <p>${shiftData.type.toUpperCase()}</p>
            <p>${shiftData.start_time} - ${shiftData.end_time}</p>
            <p class="assigned-employee">${getEmployeeName(employeeId)}</p>
        `;

        block.addEventListener("click", () => selectShift(shiftKey, shiftId));

        grid.appendChild(block);
    });
}


// ===============================
// SELECT SHIFT
// ===============================

function selectShift(shiftKey, shiftId) {
    selectedShift = { shiftKey, shiftId };

    document.getElementById("selectedShiftLabel").textContent =
        `Selected: ${shiftId}`;

    populateAvailableEmployees();
    updateAssignmentButtons();
}


// ===============================
// AVAILABLE EMPLOYEES
// ===============================

function populateAvailableEmployees() {
    const container = document.getElementById("availableEmployees");
    container.innerHTML = "";

    const allEmployees = [
        ...(employees.GSS || []),
        ...(employees.GSS_key_holder || []),
        ...(employees.Manager || [])
    ];

    allEmployees.forEach(emp => {
        const div = document.createElement("div");
        div.classList.add("available-employee");
        div.dataset.empId = emp.id;

        div.textContent = emp.name;

        div.addEventListener("click", () => {
            document.querySelectorAll(".available-employee")
                .forEach(e => e.classList.remove("selected"));

            div.classList.add("selected");
        });

        container.appendChild(div);
    });
}


// ===============================
// ASSIGN EMPLOYEE TO SHIFT
// ===============================

document.getElementById("assignShiftBtn").addEventListener("click", () => {
    if (!selectedShift) return;

    const selectedEmp = document.querySelector(".available-employee.selected");
    if (!selectedEmp) return;

    const empId = Number(selectedEmp.dataset.empId);

    scheduleWeeks[currentWeekId].days[currentDay][selectedShift.shiftKey].employee = empId;

    renderDay(currentDay);
});


// ===============================
// REMOVE EMPLOYEE FROM SHIFT
// ===============================

document.getElementById("removeShiftBtn").addEventListener("click", () => {
    if (!selectedShift) return;

    scheduleWeeks[currentWeekId].days[currentDay][selectedShift.shiftKey].employee = null;

    renderDay(currentDay);
});


// ===============================
// UPDATE ASSIGNMENT BUTTONS
// ===============================

function updateAssignmentButtons() {
    const assignBtn = document.getElementById("assignShiftBtn");
    const removeBtn = document.getElementById("removeShiftBtn");

    if (!selectedShift || scheduleLocked) {
        assignBtn.disabled = true;
        removeBtn.disabled = true;
    } else {
        assignBtn.disabled = false;
        removeBtn.disabled = false;
    }
}


// ===============================
// EMPLOYEE SIDEBAR
// ===============================

function populateEmployeeSidebar() {
    const list = document.getElementById("employeeList");
    list.innerHTML = "";

    const groups = [
        { label: "GSS", data: employees.GSS || [] },
        { label: "Key Holders", data: employees.GSS_key_holder || [] },
        { label: "Managers", data: employees.Manager || [] }
    ];

    groups.forEach(group => {
        const header = document.createElement("h3");
        header.textContent = group.label;
        list.appendChild(header);

        group.data.forEach(emp => {
            const div = document.createElement("div");
            div.classList.add("employee-item");

            div.innerHTML = `
                <span>${emp.name}</span>
                <button class="remove-employee-btn" data-id="${emp.id}" data-role="${group.label}">
                    Remove
                </button>
            `;

            list.appendChild(div);
        });
    });

    attachRemoveEmployeeListeners();
}


function attachRemoveEmployeeListeners() {
    document.querySelectorAll(".remove-employee-btn").forEach(btn => {
        btn.onclick = () => {
            const id = Number(btn.dataset.id);
            const role = btn.dataset.role;
            removeEmployee(id, role);
        };
    });
}


function removeEmployee(id, role) {
    const confirmDelete = confirm("Are you sure you want to remove this employee?");
    if (!confirmDelete) return;

    // Determine correct group
    let groupKey = "";
    if (role === "GSS") groupKey = "GSS";
    else if (role === "Key Holders") groupKey = "GSS_key_holder";
    else if (role === "Managers") groupKey = "Manager";

    // Remove employee from the group
    employees[groupKey] = employees[groupKey].filter(emp => emp.id !== id);

    // Save updated list
    localStorage.setItem("employees", JSON.stringify(employees));

    // Remove employee from any assigned shifts
    removeEmployeeFromSchedule(id);

    // Refresh UI
    populateEmployeeSidebar();
    renderDay(currentDay);

    alert("Employee removed successfully.");
}

function removeEmployeeFromSchedule(empId) {
    Object.keys(scheduleWeeks).forEach(weekId => {
        const week = scheduleWeeks[weekId];

        Object.keys(week.days).forEach(day => {
            const shifts = week.days[day];

            Object.keys(shifts).forEach(shiftKey => {
                if (shifts[shiftKey].employee === empId) {
                    shifts[shiftKey].employee = null;
                }
            });
        });
    });

    // Save updated schedule
    localStorage.setItem("scheduleWeeks", JSON.stringify(scheduleWeeks));
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

    const emp = all.find(e => e.id === id);
    return emp ? emp.name : "Unknown";
}


// ===============================
// LOCK TOGGLE
// ===============================

document.getElementById("lockCheckbox").addEventListener("change", (e) => {
    scheduleLocked = e.target.checked;
    scheduleWeeks[currentWeekId].locked = scheduleLocked;
    updateAssignmentButtons();
});


// ===============================
// AUTO SCHEDULE (placeholder)
// ===============================

document.getElementById("autoScheduleBtn").addEventListener("click", () => {
    alert("Auto-schedule coming soon!");
});


// ===============================
// IMPORT / EXPORT (placeholder)
// ===============================

document.getElementById("importScheduleBtn").addEventListener("click", () => {
    alert("Import coming soon!");
});

document.getElementById("exportScheduleBtn").addEventListener("click", () => {
    alert("Export coming soon!");
});


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
document.getElementById("exportScheduleBtn").addEventListener("click", () => {
    const data = {
        employees: employees,
        scheduleWeeks: scheduleWeeks,
        defaultShifts: defaultShifts
    };
    
    const blob = new Blob([JSON.stringify(data, null, 4)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = url;
    a.download = "misters_schedule_export.json";
    a.click();
    
    URL.revokeObjectURL(url);
});

// ===============================
// IMPORT SCHEDULE DATA
// ===============================

document.getElementById("importScheduleBtn").addEventListener("click", () => {
    document.getElementById("importFileInput").click();
});

document.getElementById("importFileInput").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
        const text = await file.text();
        const importedData = JSON.parse(text);

        // Validate structure
        if (!importedData.employees || !importedData.scheduleWeeks) {
            alert("Invalid file format.");
            return;
        }

        // Replace local data
        employees = importedData.employees;
        scheduleWeeks = importedData.scheduleWeeks;

        // Save to localStorage
        localStorage.setItem("employees", JSON.stringify(employees));
        localStorage.setItem("scheduleWeeks", JSON.stringify(scheduleWeeks));

        alert("Import successful!");

        // Reload UI
        populateEmployeeSidebar();
        populateWeekSelector();

        const firstWeek = Object.keys(scheduleWeeks)[0];
        loadWeek(firstWeek);

    } catch (err) {
        alert("Error importing file.");
        console.error(err);
    }
});
