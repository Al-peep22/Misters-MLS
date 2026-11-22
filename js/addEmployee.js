// ===============================
// INITIAL SETUP
// ===============================
document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("employeeForm");
    const jobButtons = document.querySelectorAll(".job-position-buttons button");
    const jobInput = document.getElementById("jobPosition");

    let timeOff = [];
    let availabilityCustomized = false;
    let selectedProfileImage = "";
    const employeeColorOptions = [
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
    let profileImageRead = Promise.resolve();
    const profileImageFile = document.getElementById("profileImageFile");
    const profileImageError = document.getElementById("profileImageError");
    const createEmployeeError = document.getElementById("createEmployeeError");
    const employeeColorSelect = document.getElementById("employeeColor");

    function refreshEmployeeColorOptions() {
        const storedEmployees = JSON.parse(localStorage.getItem("employees") || "{}");
        const usedColors = new Set([
            ...(storedEmployees.GSS || []),
            ...(storedEmployees.GSS_key_holder || []),
            ...(storedEmployees.Manager || [])
        ].map(employee => employee.scheduleColor));
        const previousValue = employeeColorSelect.value;
        const randomOption = document.createElement("option");
        randomOption.value = "random";
        randomOption.textContent = "Random available color";
        const options = [randomOption];
        employeeColorOptions.forEach(color => {
            const option = document.createElement("option");
            option.value = color.value;
            option.textContent = usedColors.has(color.value) ? `${color.label} (in use)` : color.label;
            option.style.backgroundColor = color.value;
            option.style.color = getColorTextColor(color.value);
            option.disabled = usedColors.has(color.value);
            options.push(option);
        });
        employeeColorSelect.replaceChildren(...options);
        if (previousValue && [...employeeColorSelect.options].some(option =>
            option.value === previousValue && !option.disabled
        )) {
            employeeColorSelect.value = previousValue;
        } else {
            employeeColorSelect.value = "random";
        }
        const availableColorCount = employeeColorOptions.filter(color => !usedColors.has(color.value)).length;
        randomOption.disabled = availableColorCount === 0;
        return availableColorCount;
    }

    function getColorTextColor(hexColor) {
        const channels = hexColor.match(/[0-9a-f]{2}/gi).map(value => parseInt(value, 16));
        const luminance = (channels[0] * 299 + channels[1] * 587 + channels[2] * 114) / 1000;
        return luminance > 150 ? "#111827" : "#ffffff";
    }

    refreshEmployeeColorOptions();
    window.addEventListener("employee-colors-changed", refreshEmployeeColorOptions);

    profileImageFile.addEventListener("change", () => {
        const file = profileImageFile.files[0];
        selectedProfileImage = "";
        profileImageError.textContent = "";
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            profileImageError.textContent = "Choose a valid image file.";
            profileImageFile.value = "";
            return;
        }

        profileImageRead = new Promise(resolve => {
            const reader = new FileReader();
            reader.addEventListener("load", () => {
                if (typeof reader.result === "string") selectedProfileImage = reader.result;
                resolve();
            });
            reader.addEventListener("error", () => {
                profileImageError.textContent = "The selected image could not be read.";
                profileImageFile.value = "";
                resolve();
            });
            reader.readAsDataURL(file);
        });
    });

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

    availabilitySection.addEventListener("click", event => {
        if (event.target.closest(".avail-cell") || event.target.closest("#availabilityTable thead th[data-day]")) {
            availabilityCustomized = true;
            updateAvailabilitySummary();
        }
    });

    // ===============================
    // TIME OFF FORM
    // ===============================
    const timeOffStart = document.getElementById("timeOffStart");
    const timeOffEnd = document.getElementById("timeOffEnd");
    timeOffStart.addEventListener("input", () => timeOffDates.updateInputs(timeOffStart, timeOffEnd));

    document.getElementById("addTimeOffBtn").addEventListener("click", () => {
        timeOffDates.updateInputs(timeOffStart, timeOffEnd);
        document.getElementById("timeOffForm").hidden = false;
    });

    document.getElementById("cancelTimeOffBtn").addEventListener("click", () => {
        document.getElementById("timeOffForm").hidden = true;
    });

    document.getElementById("submitTimeOffBtn").addEventListener("click", () => {
        const start = timeOffStart.value;
        const end = timeOffEnd.value;

        if (!timeOffDates.canSave(start, end)) {
            createEmployeeError.textContent = "Choose time-off dates starting today or later; the end date cannot be before the start date.";
            return;
        }
        timeOff.push({ start_date: start, end_date: end });
        document.querySelector(".employeeFormTimeOff").textContent =
            `${timeOff.length} time off block(s) set`;
        document.getElementById("timeOffForm").hidden = true;
        createEmployeeError.textContent = "";
    });

    // ===============================
    // FORM SUBMIT — CREATE EMPLOYEE
    // ===============================
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        await profileImageRead;

        const name = document.getElementById("employeeName").value.trim();
        const profileInput = document.getElementById("profileImage");
        const profile = selectedProfileImage || profileInput.value.trim();
        const position = jobInput.value;

        const today = timeOffDates.today();
        if (timeOff.some(period => period.start_date < today)) {
            timeOff = timeOff.filter(period => period.end_date >= today).map(period => ({
                ...period,
                start_date: period.start_date < today ? today : period.start_date
            }));
            document.querySelector(".employeeFormTimeOff").textContent =
                timeOff.length ? `${timeOff.length} time off block(s) set` : "n/a";
            createEmployeeError.textContent = "Some pending time-off dates passed. Expired periods were removed and ongoing periods now start today; review and submit again.";
            return;
        }
        if (timeOff.some(period => !timeOffDates.canSave(period.start_date, period.end_date))) {
            createEmployeeError.textContent = "Time off must start today or later, and the end date cannot be before the start date.";
            return;
        }
        if (!name || !position) {
            createEmployeeError.textContent = "Name and job position are required.";
            return;
        }
        if (!selectedProfileImage && profileInput.value) {
            let validImageUrl = false;
            try {
                const imageUrl = new URL(profileInput.value);
                validImageUrl = imageUrl.protocol === "http:" || imageUrl.protocol === "https:";
            } catch {
                validImageUrl = false;
            }
            if (!validImageUrl) {
                createEmployeeError.textContent = "Enter a valid HTTP or HTTPS image URL, or choose an image file.";
                return;
            }
        }

        // Load existing employees
        const stored = JSON.parse(localStorage.getItem("employees") || "{}");
        if (!stored[position]) stored[position] = [];
        const existingEmployees = [
            ...(stored.GSS || []),
            ...(stored.GSS_key_holder || []),
            ...(stored.Manager || [])
        ];
        const usedColors = new Set(existingEmployees.map(employee => employee.scheduleColor));
        const availableColors = employeeColorOptions.filter(color => !usedColors.has(color.value));
        const selectedColor = employeeColorSelect.value === "random"
            ? availableColors[Math.floor(Math.random() * availableColors.length)]?.value
            : employeeColorSelect.value;
        if (!selectedColor || !availableColors.some(color => color.value === selectedColor)) {
            createEmployeeError.textContent = availableColors.length
                ? "That color is already used. Choose a different available color."
                : "All schedule colors are in use. Add another color option before creating an employee.";
            refreshEmployeeColorOptions();
            return;
        }

        const newId = Date.now();

        const newEmployee = {
            id: newId,
            name,
            job_position: position,
            scheduleColor: selectedColor,
            availability: availabilityCustomized ? extractAvailability() : null,
            timeOff
        };
        if (profile) newEmployee.profile_image = profile;

        stored[position].push(newEmployee);
        try {
            localStorage.setItem("employees", JSON.stringify(stored));
        } catch (error) {
            createEmployeeError.textContent = "Could not save this employee. The image may be too large for local storage.";
            return;
        }

        // Reset form
        form.reset();
        jobInput.value = "";
        selectedProfileImage = "";
        timeOff = [];
        availabilityCustomized = false;
        document.querySelector(".employeeFormTimeOff").textContent = "n/a";
        document.querySelector(".employeeFormAvailabilityTxt").textContent = "Fully Available";
        document.getElementById("availabilitySection").hidden = true;
        document.getElementById("adjustAvailabilityBtn").textContent = "Show Availability";
        jobButtons.forEach(btn => btn.classList.remove("selected"));
        generateAvailabilityGrid();

        if (document.getElementById("createEmployeeDialog")) {
            window.dispatchEvent(new CustomEvent("employee-colors-changed"));
            window.dispatchEvent(new CustomEvent("employee-created"));
        } else {
            window.location.href = "schedules.html";
        }
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
    "18:00","19:00","20:00","21:00"
];

function formatAvailabilityTime(time) {
    const hour = Number(time.slice(0, 2));
    const suffix = hour < 12 ? "am" : "pm";
    return `${hour % 12 || 12}${suffix}`;
}

function generateAvailabilityGrid() {
    const body = document.getElementById("availabilityBody");
    body.innerHTML = "";

    times.forEach(time => {
        const row = document.createElement("tr");

        // Time label
        const timeCell = document.createElement("td");
        timeCell.textContent = formatAvailabilityTime(time);
        timeCell.classList.add("time-label");
        row.appendChild(timeCell);

        // Days
        ["sun","mon","tue","wed","thu","fri","sat"].forEach(day => {
            const cell = document.createElement("td");
            cell.classList.add("avail-cell", "available");
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

function updateAvailabilitySummary() {
    const unavailableCount = document.querySelectorAll(".avail-cell.unavailable").length;
    const summary = document.querySelector(".employeeFormAvailabilityTxt");
    summary.textContent = unavailableCount === 0
        ? "Fully Available"
        : "Availability restrictions set";
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
            block_1: { start_time: null, end_time: null }
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
            blocks.push({ start, end: getNextHour(prev) });
            start = current;
        }

        prev = current;
    }

    blocks.push({ start, end: getNextHour(prev) });

    return Object.fromEntries(blocks.map((block, index) => [
        `block_${index + 1}`,
        { start_time: block.start, end_time: block.end }
    ]));
}

function getNextHour(time) {
    const [hour, minute] = time.split(":").map(Number);
    return `${String(hour + 1).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
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
