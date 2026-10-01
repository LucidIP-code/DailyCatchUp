const { getOptions } = require("../storage");
const {
  sheets,
  getCurrentSheetName,
  ensureSheetExists,
  getColumnLetter,
  getValidTodayKeys,
  getZonedDate,
} = require("../sheet-helper");

function sheetNameFor(date) {
  return getCurrentSheetName(date);
}

function parseStatus(status, knownProjects) {
  const text = String(status || "").trim();
  if (!text || /^catchup not filled$/i.test(text) || /^on leave$/i.test(text)) return [];

  const projects = (knownProjects || [])
    .map((p) => String(p).trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const result = [];
  let current = null;

  for (const line of lines) {
    if (
      /^first half leave$/i.test(line) ||
      /^on permission$/i.test(line) ||
      /^on leave$/i.test(line) ||
      /^catchup not filled$/i.test(line)
    ) {
      continue;
    }
    let project = null;
    let detail = "";

    for (const candidate of projects) {
      const prefix = `${candidate} -`;
      if (line.toLowerCase().startsWith(prefix.toLowerCase())) {
        project = candidate;
        detail = line.slice(prefix.length).trim();
        break;
      }
    }

    if (!project) {
      const match = line.match(/^(.+?)\s+-\s+(.*)$/);
      if (match) {
        project = match[1].trim();
        detail = match[2].trim();
      }
    }

    if (project) {
      current = {
        project,
        details: detail.replace(/^[•●▪◦*-]\s*/, "").trim(),
      };
      result.push(current);
    } else if (current) {
      const item = line.replace(/^[•●▪◦*-]\s*/, "").trim();
      if (item) current.details = current.details ? `${current.details}\n${item}` : item;
    }
  }

  return result.filter((item) => item.project && item.details);
}

async function readSheet(spreadsheetId, sheetName) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:ZZ1000`,
  });
  return response.data.values || [];
}

async function findOrCreatePersonColumn(spreadsheetId, sheetName, name) {
  let rows = await readSheet(spreadsheetId, sheetName);
  if (!rows.length) rows = [["Date"]];
  const headers = rows[0] || ["Date"];
  let index = headers.findIndex(
    (h) => String(h || "").trim().toLowerCase() === name.toLowerCase()
  );

  if (index >= 0) return { rows, index };

  index = headers.length;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!${getColumnLetter(index)}1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[name]] },
  });
  return { rows, index };
}

function findDateRow(rows, date) {
  const wanted = new Set(getValidTodayKeys(date));
  for (let i = 1; i < rows.length; i++) {
    const value = String(rows[i][0] || "").trim().toLowerCase();
    if (wanted.has(value)) return i;
  }
  return -1;
}

async function findLastFilledStatus(spreadsheetId, name, knownProjects) {
  const cache = new Map();

  // Fetch spreadsheet metadata once to obtain all existing sheet titles
  let existingSheets = new Set();
  try {
    const metadata = await sheets.spreadsheets.get({ spreadsheetId });
    existingSheets = new Set(
      (metadata.data.sheets || []).map((s) => s.properties.title)
    );
  } catch (err) {
    console.error("Error fetching spreadsheet metadata:", err);
  }

  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - 1);

  // Search backward up to 60 days
  for (let daysBack = 1; daysBack <= 60; daysBack++) {
    const sheetName = sheetNameFor(date);

    // Skip sheets that do not exist in the Google Spreadsheet
    if (existingSheets.size > 0 && !existingSheets.has(sheetName)) {
      date.setDate(date.getDate() - 1);
      continue;
    }

    let rows;
    if (cache.has(sheetName)) {
      rows = cache.get(sheetName);
    } else {
      try {
        rows = await readSheet(spreadsheetId, sheetName);
      } catch (error) {
        rows = [];
      }
      cache.set(sheetName, rows);
    }

    if (rows.length) {
      const headers = rows[0] || [];
      const nameIndex = headers.findIndex(
        (h) => String(h || "").trim().toLowerCase() === name.toLowerCase()
      );

      if (nameIndex >= 0) {
        const rowIndex = findDateRow(rows, date);
        if (rowIndex >= 0) {
          const status = String(rows[rowIndex]?.[nameIndex] || "").trim();
          const tasks = parseStatus(status, knownProjects);

          if (tasks.length) {
            const zoned = getZonedDate(date);
            const dateStr = `${zoned.fullYear}-${zoned.monthNum}-${zoned.dayPadded}`;
            return {
              date: dateStr,
              tasks,
            };
          }
        }
      }
    }

    date.setDate(date.getDate() - 1);
  }

  return null;
}

async function getTodayStatus(spreadsheetId, name) {
  const today = new Date();
  const sheetName = sheetNameFor(today);
  let rows;
  try {
    rows = await readSheet(spreadsheetId, sheetName);
  } catch (error) {
    return "";
  }

  if (!rows.length) return "";
  const headers = rows[0] || [];
  const nameIndex = headers.findIndex(
    (h) => String(h || "").trim().toLowerCase() === name.toLowerCase()
  );
  if (nameIndex < 0) return "";

  const rowIndex = findDateRow(rows, today);
  if (rowIndex < 0) return "";
  return String(rows[rowIndex]?.[nameIndex] || "").trim();
}

module.exports = async (req, res) => {
  try {
    const name = String(
      req.method === "GET" ? req.query.name || "" : req.body?.name || ""
    ).trim();
    if (!name) return res.status(400).json({ error: "Name is required." });

    const spreadsheetId = process.env.SPREADSHEET_ID;
    if (!spreadsheetId)
      return res.status(500).json({ error: "SPREADSHEET_ID is not configured." });

    if (req.method === "GET") {
      if (String(req.query.mode || "").toLowerCase() === "today") {
        const status = await getTodayStatus(spreadsheetId, name);
        const options = await getOptions();
        const tasks = parseStatus(status, options.projects || []);
        return res.json({ name, status, tasks });
      }

      const options = await getOptions();
      const result = await findLastFilledStatus(spreadsheetId, name, options.projects || []);

      if (!result) {
        return res.json({ name, tasks: [] });
      }

      return res.json({
        name,
        date: result.date,
        tasks: result.tasks,
      });
    }

    if (req.method === "POST") {
      const action = String(req.body?.action || "leave").trim().toLowerCase();
      const statusByAction = {
        leave: "On Leave",
        "first-half": "First Half Leave",
        permission: "On Permission",
        unmark: "",
      };

      if (!Object.prototype.hasOwnProperty.call(statusByAction, action)) {
        return res.status(400).json({ error: "Invalid leave action." });
      }

      const today = new Date();
      const sheetName = sheetNameFor(today);
      await ensureSheetExists(spreadsheetId, sheetName);

      const { rows, index } = await findOrCreatePersonColumn(spreadsheetId, sheetName, name);
      const rowIndex = findDateRow(rows, today);
      if (rowIndex < 0) {
        return res.status(400).json({ error: "Today's date was not found in the sheet." });
      }

      const range = `${sheetName}!${getColumnLetter(index)}${rowIndex + 1}`;
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [[statusByAction[action]]] },
      });

      const messages = {
        leave: `Marked ${name} as On Leave.`,
        "first-half": `Marked ${name} as First Half Leave.`,
        permission: `Marked ${name} as On Permission.`,
        unmark: `Status removed for ${name}.`,
      };
      return res.json({
        success: true,
        status: statusByAction[action],
        message: messages[action],
      });
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).json({ error: "Method not allowed." });
  } catch (error) {
    console.error("Previous status / leave API error:", error);
    return res.status(500).json({ error: error.message || "Unable to process request." });
  }
};
