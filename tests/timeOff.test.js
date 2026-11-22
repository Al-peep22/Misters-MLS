const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "js", "timeOff.js"), "utf8");
const timeOffDates = vm.runInNewContext(`${source}\ntimeOffDates`);
timeOffDates.today = () => "2026-11-21";

test("validates new time off and preserves an existing ongoing start", () => {
    assert.equal(timeOffDates.canSave("2026-11-21", "2026-11-21"), true);
    assert.equal(timeOffDates.canSave("2026-11-20", "2026-11-22"), false);
    assert.equal(timeOffDates.canSave("2026-11-22", "2026-11-21"), false);
    assert.equal(timeOffDates.canSave("2026-02-30", "2026-03-01"), false);
    assert.equal(timeOffDates.canSave("2026-11-20", "2026-11-22", "2026-11-20"), true);
    assert.equal(timeOffDates.canSave("2026-11-20", "2026-11-20", "2026-11-20"), false);
});

test("removes only periods ending before today across employee groups", () => {
    const employeeData = {
        GSS: [{ timeOff: [
            { start_date: "2026-11-18", end_date: "2026-11-20" },
            { start_date: "2026-11-19", end_date: "2026-11-21" },
            { start_date: "2026-11-22", end_date: "2026-11-23" }
        ] }],
        Manager: [{ timeOff: [{ start_date: "2026-11-01", end_date: "2026-11-01" }] }]
    };
    assert.equal(timeOffDates.removeExpired(employeeData), 2);
    assert.deepEqual(employeeData.GSS[0].timeOff.map(period => period.end_date), ["2026-11-21", "2026-11-23"]);
    assert.equal(employeeData.Manager[0].timeOff.length, 0);
});
