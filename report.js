function generateReport(rows) {
    const today = new Date();
    const day = today.getDate();
    const dayPadded = String(day).padStart(2, '0');
    const monthStr = today.toLocaleDateString("en-US", { month: "short" });
    const monthNum = String(today.getMonth() + 1).padStart(2, '0');
    const shortYear = today.getFullYear().toString().slice(-2);
    const fullYear = today.getFullYear();

    const displayDate = `${day}-${monthStr}-${fullYear}`;

    const validTodayKeys = [
        `${day}-${monthStr}-${shortYear}`,
        `${dayPadded}-${monthStr}-${shortYear}`,
        `${day}/${monthNum}/${fullYear}`,
        `${dayPadded}/${monthNum}/${fullYear}`,
        `${monthNum}/${dayPadded}/${fullYear}`
    ];

    let todayRow = null;

    for (const row of rows) {
        const dateValue = Object.values(row)[0];
        if (!dateValue) continue;
        
        const cleanVal = String(dateValue).trim();
        if (validTodayKeys.includes(cleanVal)) {
            todayRow = row;
            break;
        }
    }

    if (!todayRow) {
        return {
            report: `🟡 IP Team Daily Status ${displayDate}\nNo tasks found for today.`,
            htmlReport: `<div style="font-size:16px;font-weight:bold;text-decoration:underline;margin:0px 0px 4px 0px;padding:0px;display:block;">🟡 IP Team Daily Status ${displayDate}</div><p style="margin:4px 0px 0px 0px;padding:0px;">No tasks found for today.</p>`
        };
    }

    let report = `🟡 IP Team Daily Status ${displayDate}\n`;
    let htmlReport = `<div style="font-size:16px;font-weight:bold;text-decoration:underline;margin:0px 0px 4px 0px;padding:0px;display:block;">🟡 IP Team Daily Status ${displayDate}</div>`;

    const entries = Object.entries(todayRow);

    for (let i = 1; i < entries.length; i++) {
        const [person, tasks] = entries[i];

        if (!person || person.trim() === "" || person.trim() === "__PowerAppsId__") continue;

        report += `${person}:\n`;
        
        // Adds direct delete icon in UI status report
        htmlReport += `<p style="margin:6px 0px 2px 0px;padding:0px;"><strong><u>${person}:</u></strong> <button class="delete-icon-btn" onclick="deleteDirectEntry('${person}')" title="Delete today's entry for ${person}">🗑️</button></p>`;

        if (!tasks || String(tasks).trim() === "") {
            report += `\t  • CatchUp Not filled\n`;
            htmlReport += `<ul style="margin:2px 0px;padding-left:20px;"><li>CatchUp Not Filled yet</li></ul>`;
            continue;
        }

        const taskText = String(tasks).trim();

        if (taskText.toLowerCase() === "on leave") {
            report += `\t  • On Leave\n`;
            htmlReport += `<ul style="margin:2px 0px;padding-left:20px;"><li>On Leave</li></ul>`;
            continue;
        }

        const lines = taskText.split("\n").map(x => x.trim()).filter(Boolean);
        const headingRegex = /^([A-Za-z0-9][A-Za-z0-9 ()]{0,49}?)\s*(?:\s*-\s*|:\s*)(.+)$/;
        
        const groups = [];
        let currentGroup = null;

        for (const line of lines) {
            const match = line.match(headingRegex);
            if (match) {
                currentGroup = { heading: match[1].trim(), items: [match[2].trim()] };
                groups.push(currentGroup);
            } else {
                if (!currentGroup || currentGroup.heading !== null) {
                    currentGroup = { heading: null, items: [] };
                    groups.push(currentGroup);
                }
                currentGroup.items.push(line);
            }
        }

        for (const group of groups) {
            if (group.heading) {
                report += `  ${group.heading}:\n`;
                htmlReport += `<p style="margin:2px 0px;padding-left:10px;"><strong>${group.heading}:</strong></p><ul style="margin:2px 0px 4px 0px;padding-left:30px;">`;
                for (const item of group.items) {
                    report += `\t  • ${item}\n`;
                    htmlReport += `<li style="margin-bottom:2px;">${item}</li>`;
                }
                htmlReport += `</ul>`;
            } else {
                htmlReport += `<ul style="margin:2px 0px 4px 0px;padding-left:20px;">`;
                for (const item of group.items) {
                    report += `\t  • ${item}\n`;
                    htmlReport += `<li style="margin-bottom:2px;">${item}</li>`;
                }
                htmlReport += `</ul>`;
            }
        }
    }

    report = report.trimEnd();

    return { report, htmlReport };
}

module.exports = generateReport;