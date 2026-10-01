const { getZonedDate, getValidTodayKeys } = require("./sheet-helper");

function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {Array<Object>} rows
 * @param {Array<string>} [knownProjects] - project names from options/redis,
 *        used to correctly identify headings even when the project name itself
 *        contains a dash or colon (e.g. "PrintInspection - KBPS").
 */
function generateReport(rows, knownProjects = []) {
    const zoned = getZonedDate();
    const displayDate = `${zoned.day}-${zoned.monthStr}-${zoned.fullYear}`;
    const validTodayKeys = getValidTodayKeys();

    let todayRow = null;

    for (const row of rows) {
        const dateValue = Object.values(row)[0];
        if (!dateValue) continue;

        const cleanVal = String(dateValue).trim().toLowerCase();
        if (validTodayKeys.includes(cleanVal)) {
            todayRow = row;
            break;
        }
    }

    if (!todayRow) {
        const emptyBody = `<div style="font-size:16px;font-weight:bold;text-decoration:underline;margin:0px 0px 4px 0px;padding:0px;display:block;">🟡 IP Team Daily Status ${displayDate}</div><p style="margin:4px 0px 0px 0px;padding:0px;">No tasks found for today.</p>`;
        return {
            report: `🟡 IP Team Daily Status ${displayDate}\nNo tasks found for today.`,
            htmlReport: emptyBody,
            copyHtml: emptyBody
        };
    }

    const projectHeadingRegexes = [...knownProjects]
        .filter(Boolean)
        .sort((a, b) => b.length - a.length)
        .map(proj => ({
            name: proj,
            regex: new RegExp(`^${escapeRegExp(proj)}\\s*(?:-|:)\\s*(.+)$`, 'i')
        }));

    const fallbackHeadingRegex = /^([A-Za-z0-9][A-Za-z0-9 ()]{0,49}?)\s*(?:\s*-\s*|:\s*)(.+)$/;

    function matchHeading(line) {
        for (const { name, regex } of projectHeadingRegexes) {
            const m = line.match(regex);
            if (m) {
                return { heading: name, content: m[1].trim() };
            }
        }
        const m2 = line.match(fallbackHeadingRegex);
        if (m2) {
            return { heading: m2[1].trim(), content: m2[2].trim() };
        }
        return null;
    }

    function stripLeadingMarker(line) {
        return line.replace(/^[•\u2022\-\*]\s*/, '').trim();
    }

    let report = `🟡 IP Team Daily Status ${displayDate}\n`;
    const headerHtml = `<div style="font-size:16px;font-weight:bold;text-decoration:underline;margin:0px 0px 4px 0px;padding:0px;display:block;">🟡 IP Team Daily Status ${displayDate}</div>`;
    let htmlReport = headerHtml;
    let copyHtml = headerHtml;

    const entries = Object.entries(todayRow);

    for (let i = 1; i < entries.length; i++) {
        const [person, tasks] = entries[i];

        if (!person || person.trim() === "" || person.trim() === "__PowerAppsId__") continue;

        report += `${person}:\n`;
        htmlReport += `<p style="margin:6px 0px 2px 0px;padding:0px;"><strong><u>${person}:</u></strong> <button class="delete-icon-btn" onclick="deleteDirectEntry('${person}')" title="Delete today's entry for ${person}" style="user-select:none;-webkit-user-select:none;"><svg class="delete-icon-svg" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path></svg></button></p>`;
        copyHtml += `<p style="margin:6px 0px 2px 0px;padding:0px;"><strong><u>${person}:</u></strong></p>`;

        if (!tasks || String(tasks).trim() === "") {
            report += `\t  • CatchUp Not filled\n`;
            htmlReport += `<ul style="margin:2px 0px;padding-left:20px;"><li>CatchUp Not Filled yet</li></ul>`;
            copyHtml += `<ul style="margin:2px 0px;padding-left:20px;"><li>CatchUp Not Filled yet</li></ul>`;
            continue;
        }

        const taskText = String(tasks).trim();

        const lowerTask = taskText.toLowerCase();
        if (lowerTask === "on leave" || lowerTask === "first half leave" || lowerTask === "on permission") {
            const displayLabel = lowerTask === "on leave" ? "On Leave" : (lowerTask === "first half leave" ? "First Half Leave" : "On Permission");
            report += `\t  • ${displayLabel}\n`;
            htmlReport += `<ul style="margin:2px 0px;padding-left:20px;"><li>${displayLabel}</li></ul>`;
            copyHtml += `<ul style="margin:2px 0px;padding-left:20px;"><li>${displayLabel}</li></ul>`;
            continue;
        }

        const lines = taskText.split("\n").map(x => x.trim()).filter(Boolean);

        const groups = [];
        let currentGroup = null;

        for (const rawLine of lines) {
            const match = matchHeading(rawLine);
            if (match) {
                currentGroup = { heading: match.heading, items: [stripLeadingMarker(match.content)] };
                groups.push(currentGroup);
            } else {
                const cleanItem = stripLeadingMarker(rawLine);
                if (!currentGroup) {
                    currentGroup = { heading: null, items: [] };
                    groups.push(currentGroup);
                }
                currentGroup.items.push(cleanItem);
            }
        }

        for (const group of groups) {
            if (group.heading) {
                report += `  ${group.heading}:\n`;
                const headingHtml = `<p style="margin:2px 0px;padding-left:10px;"><strong>${group.heading}:</strong></p><ul style="margin:2px 0px 4px 0px;padding-left:30px;">`;
                htmlReport += headingHtml;
                copyHtml += headingHtml;
                for (const item of group.items) {
                    report += `\t  • ${item}\n`;
                    htmlReport += `<li style="margin-bottom:2px;">${item}</li>`;
                    copyHtml += `<li style="margin-bottom:2px;">${item}</li>`;
                }
                htmlReport += `</ul>`;
                copyHtml += `</ul>`;
            } else {
                htmlReport += `<ul style="margin:2px 0px 4px 0px;padding-left:20px;">`;
                copyHtml += `<ul style="margin:2px 0px 4px 0px;padding-left:20px;">`;
                for (const item of group.items) {
                    report += `\t  • ${item}\n`;
                    htmlReport += `<li style="margin-bottom:2px;">${item}</li>`;
                    copyHtml += `<li style="margin-bottom:2px;">${item}</li>`;
                }
                htmlReport += `</ul>`;
                copyHtml += `</ul>`;
            }
        }
    }

    report = report.trimEnd();

    return { report, htmlReport, copyHtml };
}

module.exports = generateReport;
