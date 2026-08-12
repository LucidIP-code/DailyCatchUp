require("dotenv").config();
const express = require("express");
const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");
const generateReport = require("./report");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

const DATA_FILE = process.env.VERCEL
  ? path.join("/tmp", "data.json")
  : path.join(__dirname, "data.json");

// Setup Google Sheets API Auth
// Setup Google Sheets API Auth (Hybrid: Local file + Vercel Env Vars)
const authOptions = {
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
};

if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
  // Used on Vercel deployment
  authOptions.credentials = {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  };
} else {
  // Fallback for Local Development (uses service_account.json on D: drive)
  authOptions.keyFile = path.join(__dirname, "service_account.json");
}

const auth = new google.auth.GoogleAuth(authOptions);

const sheets = google.sheets({ version: "v4", auth });

function getPersistentData() {
  if (!fs.existsSync(DATA_FILE)) {
    const sourcePath = path.join(__dirname, "data.json");
    const initialData = fs.existsSync(sourcePath)
      ? fs.readFileSync(sourcePath, "utf-8")
      : JSON.stringify({ names: [], projects: [] }, null, 2);

    fs.writeFileSync(DATA_FILE, initialData);
  }
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  } catch (e) {
    return { names: [], projects: [] };
  }
}
function sortOptions(data) {
  if (Array.isArray(data.names)) {
    data.names.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }
  if (Array.isArray(data.projects)) {
    data.projects.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }
  return data;
}
function getCurrentSheetName() {
  const now = new Date();
  const month = now.toLocaleDateString("en-US", { month: "short" });
  const year = now.getFullYear().toString().slice(-2);
  return `${month}-${year}`; // e.g., "Aug-26"
}

function getColumnLetter(colIndex) {
  let temp = '';
  let letter = '';
  while (colIndex >= 0) {
    temp = (colIndex % 26);
    letter = String.fromCharCode(temp + 65) + letter;
    colIndex = Math.floor(colIndex / 26) - 1;
  }
  return letter;
}

function generateMonthDates() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dateRows = [];

  const monthStr = now.toLocaleDateString("en-US", { month: "short" });
  const shortYear = year.toString().slice(-2);

  for (let day = 1; day <= daysInMonth; day++) {
    dateRows.push([`${day}-${monthStr}-${shortYear}`]);
  }
  return dateRows;
}

async function ensureSheetExists(spreadsheetId, sheetName) {
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetExists = spreadsheet.data.sheets.some(
    s => s.properties.title === sheetName
  );

  if (!sheetExists) {
    console.log(`📌 Tab '${sheetName}' missing. Creating new sheet...`);

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: sheetName } } }]
      }
    });

    const persistentData = getPersistentData();
    const headers = ["Date", ...(persistentData.names || [])];
    const dates = generateMonthDates();
    const fullRows = [headers];

    dates.forEach(dateArr => {
      fullRows.push([dateArr[0]]);
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: fullRows }
    });

    console.log(`✅ Created tab '${sheetName}' with headers and dates.`);
  }
}

app.get("/api/options", (req, res) => {
  const data = getPersistentData();
  res.json(sortOptions(data));
});

// 2. Add New Dropdown Option (Pushes and Sorts A-Z)
app.post("/api/options", (req, res) => {
  const { type, value } = req.body;
  if (!type || !value) {
    return res.status(400).json({ error: "Type and value are required." });
  }

  const data = getPersistentData();
  const trimmedValue = value.trim();

  if (type === "name" && !data.names.includes(trimmedValue)) {
    data.names.push(trimmedValue);
  } else if (type === "project" && !data.projects.includes(trimmedValue)) {
    data.projects.push(trimmedValue);
  }

  sortOptions(data);
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  res.json({ success: true, data });
});

// 3. Delete Dropdown Option (Removes and maintains A-Z Sort)
app.delete("/api/options", (req, res) => {
  try {
    const { type, value } = req.body;
    if (!type || !value) {
      return res.status(400).json({ error: "Type and value are required." });
    }

    const data = getPersistentData();

    if (type === "name" && data.names) {
      data.names = data.names.filter(item => item !== value);
    } else if (type === "project" && data.projects) {
      data.projects = data.projects.filter(item => item !== value);
    }

    sortOptions(data);
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    res.json({ success: true, data });
  } catch (err) {
    console.error("Error removing option:", err);
    res.status(500).json({ error: err.message });
  }
});

// 4. Get Google Sheet Link
app.get("/api/sheet-url", (req, res) => {
  res.json({ url: `https://docs.google.com/spreadsheets/d/${process.env.SPREADSHEET_ID}` });
});

// 5. Read Today's Status Report
// 5. Read Today's Status Report (Filters out deleted names from summary)
app.get("/api/daily-status", async (req, res) => {
  try {
    const spreadsheetId = process.env.SPREADSHEET_ID;
    const sheetName = getCurrentSheetName();
    const persistentData = getPersistentData();
    const activeNames = persistentData.names || [];

    await ensureSheetExists(spreadsheetId, sheetName);

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A1:ZZ1000`,
    });

    const rowsData = response.data.values || [];
    if (rowsData.length === 0) {
      return res.json({ report: "No data found.", htmlReport: "<p>No data found in sheet.</p>" });
    }

    const headers = rowsData[0];
    const rows = [];

    for (let i = 1; i < rowsData.length; i++) {
      const rowObj = {};
      headers.forEach((header, colIdx) => {
        if (!header) return;
        const cleanHeader = header.trim();
        if (cleanHeader === "__PowerAppsId__") return;

        const key = colIdx === 0 ? "Date" : cleanHeader;

        // ONLY include columns that are "Date" OR belong to currently active names in data.json
        if (key === "Date" || activeNames.includes(key)) {
          rowObj[key] = rowsData[i][colIdx] || "";
        }
      });
      rows.push(rowObj);
    }

    const result = generateReport(rows);
    res.json(result);
  } catch (err) {
    console.error("Error generating report:", err);
    res.status(500).json({ error: err.message });
  }
});

// 6. Submit Task Entry
app.post("/api/submit-task", async (req, res) => {
  try {
    const { name, tasks } = req.body;
    const spreadsheetId = process.env.SPREADSHEET_ID;
    const sheetName = getCurrentSheetName();

    await ensureSheetExists(spreadsheetId, sheetName);

    const readRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A1:ZZ1000`,
    });

    let rows = readRes.data.values || [["Date"]];
    let headers = rows[0] || ["Date"];
    let nameColIndex = headers.indexOf(name);

    if (nameColIndex === -1) {
      nameColIndex = 1;
      console.log(`📌 Inserting new column for '${name}' in Column B...`);

      for (let i = 0; i < rows.length; i++) {
        if (i === 0) {
          rows[i].splice(1, 0, name);
        } else {
          rows[i].splice(1, 0, "");
        }
      }

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A1`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: rows }
      });
    }

    const now = new Date();
    const day = now.getDate();
    const dayPadded = String(day).padStart(2, '0');
    const monthStr = now.toLocaleDateString("en-US", { month: "short" });
    const monthNum = String(now.getMonth() + 1).padStart(2, '0');
    const shortYear = now.getFullYear().toString().slice(-2);
    const fullYear = now.getFullYear();

    const validTodayKeys = [
      `${day}-${monthStr}-${shortYear}`,
      `${dayPadded}-${monthStr}-${shortYear}`,
      `${day}/${monthNum}/${fullYear}`,
      `${dayPadded}/${monthNum}/${fullYear}`,
      `${monthNum}/${dayPadded}/${fullYear}`
    ];

    let targetRowIndex = -1;

    for (let i = 1; i < rows.length; i++) {
      const cellDate = String(rows[i][0] || "").trim();
      if (validTodayKeys.includes(cellDate)) {
        targetRowIndex = i + 1;
        break;
      }
    }

    if (targetRowIndex === -1) {
      const primaryFormat = `${day}-${monthStr}-${shortYear}`;
      return res.status(400).json({ 
        error: `Today's date (${primaryFormat}) was not found in Column A.` 
      });
    }

    const formattedCellText = tasks
      .map(t => {
        const lines = t.task.split("\n").map(l => l.trim()).filter(Boolean);
        if (lines.length === 0) return "";
        const firstLine = `${t.project} - ${lines[0].replace(/^[•\-\*\d+\.]\s*/, '')}`;
        const restLines = lines.slice(1).map(line => `  • ${line.replace(/^[•\-\*\d+\.]\s*/, '')}`);
        return [firstLine, ...restLines].join("\n");
      })
      .filter(Boolean)
      .join("\n\n");

    const colLetter = getColumnLetter(nameColIndex);
    const cellRange = `${sheetName}!${colLetter}${targetRowIndex}`;

    const existingCell = (rows[targetRowIndex - 1] && rows[targetRowIndex - 1][nameColIndex]) || "";
    const finalCellText = existingCell ? `${existingCell}\n\n${formattedCellText}` : formattedCellText;

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: cellRange,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[finalCellText]] },
    });

    res.json({ success: true, message: "Tasks saved successfully!" });
  } catch (err) {
    console.error("Error saving task:", err);
    res.status(500).json({ error: err.message });
  }
});

// 7. Delete/Clear Today's Entry for Selected Person
app.post("/api/delete-task", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required." });

    const spreadsheetId = process.env.SPREADSHEET_ID;
    const sheetName = getCurrentSheetName();

    await ensureSheetExists(spreadsheetId, sheetName);

    const readRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A1:ZZ1000`,
    });

    const rows = readRes.data.values || [];
    if (rows.length === 0) return res.status(400).json({ error: "Sheet is empty." });

    const headers = rows[0] || [];
    const nameColIndex = headers.indexOf(name);

    if (nameColIndex === -1) {
      return res.status(400).json({ error: `Name '${name}' does not exist in the sheet.` });
    }

    const now = new Date();
    const day = now.getDate();
    const dayPadded = String(day).padStart(2, '0');
    const monthStr = now.toLocaleDateString("en-US", { month: "short" });
    const monthNum = String(now.getMonth() + 1).padStart(2, '0');
    const shortYear = now.getFullYear().toString().slice(-2);
    const fullYear = now.getFullYear();

    const validTodayKeys = [
      `${day}-${monthStr}-${shortYear}`,
      `${dayPadded}-${monthStr}-${shortYear}`,
      `${day}/${monthNum}/${fullYear}`,
      `${dayPadded}/${monthNum}/${fullYear}`,
      `${monthNum}/${dayPadded}/${fullYear}`
    ];

    let targetRowIndex = -1;

    for (let i = 1; i < rows.length; i++) {
      const cellDate = String(rows[i][0] || "").trim();
      if (validTodayKeys.includes(cellDate)) {
        targetRowIndex = i + 1;
        break;
      }
    }

    if (targetRowIndex === -1) {
      return res.status(400).json({ error: "Today's date not found in sheet." });
    }

    const colLetter = getColumnLetter(nameColIndex);
    const cellRange = `${sheetName}!${colLetter}${targetRowIndex}`;

    // Clear cell value
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: cellRange,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[""]] }
    });

    res.json({ success: true, message: `Cleared entry for ${name}.` });
  } catch (err) {
    console.error("Error deleting entry:", err);
    res.status(500).json({ error: err.message });
  }
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Server active on port " + (process.env.PORT || 3000));
});
