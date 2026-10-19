// ===============================
// INITIAL SETUP
// ===============================
document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("employeeForm");
    const jobButtons = document.querySelectorAll(".job-position-buttons button");
    const jobInput = document.getElementById("jobPosition");

    let timeOff = [];

    // ===============================
    // JOB POSITION SELECTOR
    // ===============================
    jobButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            jobButtons.forEach(b => b.classList.remove("selected"));
            btn.classList.add("selected");
            jobInput.value = btn.dataset.position;
        });
    });

    // ===============================
    // TIME OFF FORM
    // ===============================
    document.getElementById("addTimeOffBtn").addEventListener("click", () => {
        document.getElementById("timeOffForm").hidden = false;
    });

    document.getElementById("cancelTimeOffBtn").addEventListener("click", () => {
        document.getElementById("timeOffForm").hidden = true;
    });

    document.getElementById("submitTimeOffBtn").addEventListener("click", () => {
        const start = document.getElementById("timeOffStart").value;
        const end = document.getElementById("timeOffEnd").value;

        if (start && end) {
            timeOff.push({ start_date: start, end_date: end });
            document.querySelector(".employeeFormTimeOff").textContent =
                `${timeOff.length} time off block(s) set`;
            document.getElementById("timeOffForm").hidden = true;
        }
    });

    // ===============================
    // FORM SUBMIT — CREATE EMPLOYEE
    // ===============================
    form.addEventListener("submit", (e) => {
        e.preventDefault();

        const name = document.getElementById("employeeName").value.trim();
        const profile = document.getElementById("profileImage").value.trim();
        const position = jobInput.value;

        if (!name || !position) {
            alert("Name and job position are required.");
            return;
        }

        // Load existing employees
        const stored = JSON.parse(localStorage.getItem("employees") || "{}");
        if (!stored[position]) stored[position] = [];

        const newId = Date.now();

        const newEmployee = {
            id: newId,
            profile_image: profile || "./images/default.png",
            name,
            job_position: position,
            availability: extractAvailability(),
            timeOff
        };

        stored[position].push(newEmployee);
        localStorage.setItem("employees", JSON.stringify(stored));

        // Reset form
        form.reset();
        jobInput.value = "";
        timeOff = [];
        document.querySelector(".employeeFormTimeOff").textContent = "n/a";

        // Redirect
        window.location.href = "schedules.html";
    });
  generateAvailabilityGrid();
});


// ===============================
// AVAILABILITY SECTION TOGGLE
// ===============================
const adjustBtn = document.getElementById("adjustAvailabilityBtn");
const availabilitySection = document.getElementById("availabilitySection");

adjustBtn.addEventListener("click", () => {
    const isHidden = availabilitySection.hasAttribute("hidden");

    if (isHidden) {
        availabilitySection.removeAttribute("hidden");
        adjustBtn.textContent = "Hide Availability";
    } else {
        availabilitySection.setAttribute("hidden", "");
        adjustBtn.textContent = "Show Availability";
    }
});



// ===============================
// AVAILABILITY GRID GENERATION
// ===============================
const times = [
    "06:00","07:00","08:00","09:00","10:00","11:00",
    "12:00","13:00","14:00","15:00","16:00","17:00",
    "18:00","19:00","20:00","21:00","22:00"
];

function generateAvailabilityGrid() {
    const body = document.getElementById("availabilityBody");
    body.innerHTML = "";

    times.forEach(time => {
        const row = document.createElement("tr");

        // Time label
        const timeCell = document.createElement("td");
        timeCell.textContent = time;
        timeCell.classList.add("time-label");
        row.appendChild(timeCell);

        // Days
        ["sun","mon","tue","wed","thu","fri","sat"].forEach(day => {
            const cell = document.createElement("td");
            cell.classList.add("avail-cell", "unavailable");
            cell.dataset.day = day;
            cell.dataset.time = time;

            cell.addEventListener("click", () => {
                cell.classList.toggle("available");
                cell.classList.toggle("unavailable");
            });

            row.appendChild(cell);
        });

        body.appendChild(row);
    });
}

// ===============================
// EXTRACT AVAILABILITY INTO BLOCKS
// ===============================
function extractAvailability() {
    const availability = {
        sun: { block_1: {}, block_2: {} },
        mon: { block_1: {}, block_2: {} },
        tue: { block_1: {}, block_2: {} },
        wed: { block_1: {}, block_2: {} },
        thu: { block_1: {}, block_2: {} },
        fri: { block_1: {}, block_2: {} },
        sat: { block_1: {}, block_2: {} }
    };

    ["sun","mon","tue","wed","thu","fri","sat"].forEach(day => {
        const dayCells = [...document.querySelectorAll(`.avail-cell[data-day="${day}"]`)];

        const availableTimes = dayCells
            .filter(cell => cell.classList.contains("available"))
            .map(cell => cell.dataset.time);

        availability[day] = convertTimesToBlocks(availableTimes);
    });

    return availability;
}


// ===============================
// CONVERT SHADED CELLS INTO BLOCKS
// ===============================
function convertTimesToBlocks(times) {
    if (times.length === 0) {
        return {
            block_1: { start_time: null, end_time: null },
            block_2: { start_time: null, end_time: null }
        };
    }

    const blocks = [];
    let start = times[0];
    let prev = times[0];

    for (let i = 1; i < times.length; i++) {
        const current = times[i];
        const prevHour = Number(prev.split(":")[0]);
        const currHour = Number(current.split(":")[0]);

        if (currHour !== prevHour + 1) {
            blocks.push({ start, end: prev });
            start = current;
        }

        prev = current;
    }

    blocks.push({ start, end: prev });

    return {
        block_1: blocks[0] || { start_time: null, end_time: null },
        block_2: blocks[1] || { start_time: null, end_time: null }
    };
}

document.querySelectorAll("#availabilityTable thead th[data-day]").forEach(th => {
    th.addEventListener("click", () => {
        const day = th.dataset.day;
        const cells = document.querySelectorAll(`.avail-cell[data-day="${day}"]`);

        // Check if majority are available
        const availableCount = [...cells].filter(c => c.classList.contains("available")).length;
        const makeAvailable = availableCount < cells.length / 2;

        cells.forEach(cell => {
            if (makeAvailable) {
                cell.classList.add("available");
                cell.classList.remove("unavailable");
            } else {
                cell.classList.remove("available");
                cell.classList.add("unavailable");
            }
        });
    });
});
