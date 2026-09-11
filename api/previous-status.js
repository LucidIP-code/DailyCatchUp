const path = require("path");
const { google } = require("googleapis");
const { getOptions } = require("../storage");

const authOptions = { scopes: ["https://www.googleapis.com/auth/spreadsheets"] };
if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
  authOptions.credentials = {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  };
} else {
  authOptions.keyFile = path.join(process.cwd(), "service_account.json");
}

const auth = new google.auth.GoogleAuth(authOptions);
const sheets = google.sheets({ version: "v4", auth });

function getWorkingDayBeforeToday() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  while (date.getDay() === 0 || date.getDay() === 6) date.setDate(date.getDate() - 1);
  return date;
}

function sheetNameFor(date) {
  const month = date.toLocaleDateString("en-US", { month: "short" });
  return `${month}-${String(date.getFullYear()).slice(-2)}`;
}

function dateKeysFor(date) {
  const day = date.getDate();
  const paddedDay = String(day).padStart(2, "0");
  const month = date.getMonth() + 1;
  const paddedMonth = String(month).padStart(2, "0");
  const year = date.getFullYear();
  const shortYear = String(year).slice(-2);
  const monthText = date.toLocaleDateString("en-US", { month: "short" }).toLowerCase();
  return new Set([
    `${day}-${monthText}-${shortYear}`,
    `${paddedDay}-${monthText}-${shortYear}`,
    `${day}/${month}/${year}`,
    `${paddedDay}/${month}/${year}`,
    `${paddedDay}/${paddedMonth}/${year}`,
    `${month}/${paddedDay}/${year}`,
    `${paddedMonth}/${paddedDay}/${year}`
  ]);
}

function columnLetter(index) {
  let result = "";
  while (index >= 0) {
    result = String.fromCharCode((index % 26) + 65) + result;
    index = Math.floor(index / 26) - 1;
  }
  return result;
}

function parseStatus(status, knownProjects) {
  const text = String(status || "").trim();
  if (!text || /^catchup not filled$/i.test(text) || /^on leave$/i.test(text)) return [];

  const projects = (knownProjects || [])
    .map(p => String(p).trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const result = [];
  let current = null;

  for (const line of lines) {
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
        details: detail.replace(/^[•●▪◦*-]\s*/, "").trim()
      };
      result.push(current);
    } else if (current) {
      const item = line.replace(/^[•●▪◦*-]\s*/, "").trim();
      if (item) current.details = current.details ? `${current.details}\n${item}` : item;
    }
  }

  return result.filter(item => item.project && item.details);
}

async function readSheet(spreadsheetId, sheetName) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:ZZ1000`
  });
  return response.data.values || [];
}

async function ensureSheet(spreadsheetId, sheetName) {
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  if (spreadsheet.data.sheets.some(s => s.properties.title === sheetName)) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: sheetName } } }] }
  });
}

async function findOrCreatePersonColumn(spreadsheetId, sheetName, name) {
  let rows = await readSheet(spreadsheetId, sheetName);
  if (!rows.length) rows = [["Date"]];
  const headers = rows[0] || ["Date"];
  let index = headers.findIndex(h => String(h || "").trim() === name);

  if (index >= 0) return { rows, index };

  index = headers.length;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!${columnLetter(index)}1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[name]] }
  });
  return { rows, index };
}

async function findTodayRow(rows, date) {
  const wanted = dateKeysFor(date);
  for (let i = 1; i < rows.length; i++) {
    const value = String(rows[i][0] || "").trim().toLowerCase();
    if (wanted.has(value)) return i + 1;
  }
  return -1;
}

module.exports = async (req, res) => {
  try {
    const name = String(req.method === "GET" ? req.query.name || "" : req.body?.name || "").trim();
    if (!name) return res.status(400).json({ error: "Name is required." });

    const spreadsheetId = process.env.SPREADSHEET_ID;
    if (!spreadsheetId) return res.status(500).json({ error: "SPREADSHEET_ID is not configured." });

    if (req.method === "GET") {
      const previousDate = getWorkingDayBeforeToday();
      const sheetName = sheetNameFor(previousDate);
      const rows = await readSheet(spreadsheetId, sheetName);
      if (!rows.length) return res.json({ name, tasks: [] });

      const headers = rows[0] || [];
      const nameIndex = headers.findIndex(h => String(h || "").trim() === name);
      if (nameIndex < 0) return res.json({ name, tasks: [] });

      const rowIndex = await findTodayRow(rows, previousDate);
      if (rowIndex < 0) return res.json({ name, tasks: [] });

      const status = rows[rowIndex - 1]?.[nameIndex] || "";
      const options = await getOptions();
      return res.json({
        name,
        date: previousDate.toISOString().slice(0, 10),
        tasks: parseStatus(status, options.projects || [])
      });
    }

    if (req.method === "POST") {
      const today = new Date();
      const sheetName = sheetNameFor(today);
      await ensureSheet(spreadsheetId, sheetName);

      const { rows, index } = await findOrCreatePersonColumn(spreadsheetId, sheetName, name);
      const rowIndex = await findTodayRow(rows, today);
      if (rowIndex < 0) {
        return res.status(400).json({ error: "Today's date was not found in the sheet." });
      }

      const range = `${sheetName}!${columnLetter(index)}${rowIndex}`;
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [["On Leave"]] }
      });

      return res.json({ success: true, message: `Marked ${name} as On Leave.` });
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).json({ error: "Method not allowed." });
  } catch (error) {
    console.error("Previous status / leave API error:", error);
    return res.status(500).json({ error: error.message || "Unable to process request." });
  }
};
