const { google } = require("googleapis");
const generateReport = require("../report");
const { getOptions } = require("../storage");

const authOptions = {
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
};

if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
  authOptions.credentials = {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  };
} else {
  authOptions.keyFile = require("path").join(process.cwd(), "service_account.json");
}

const auth = new google.auth.GoogleAuth(authOptions);
const sheets = google.sheets({ version: "v4", auth });

function getCurrentSheetName() {
  const now = new Date();
  const month = now.toLocaleDateString("en-US", { month: "short" });
  const year = now.getFullYear().toString().slice(-2);
  return `${month}-${year}`;
}

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const spreadsheetId = process.env.SPREADSHEET_ID;
    const sheetName = getCurrentSheetName();

    // This is the same Redis-backed source used by Manage Names/Projects.
    const persistentData = await getOptions();
    const activeNames = new Set(persistentData.names || []);

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A1:ZZ1000`,
    });

    const rowsData = response.data.values || [];
    if (rowsData.length === 0) {
      return res.json({
        report: "No data found.",
        htmlReport: "<p>No data found in sheet.</p>",
      });
    }

    const headers = rowsData[0] || [];
    const rows = [];

    for (let i = 1; i < rowsData.length; i++) {
      const rowObj = {};
      headers.forEach((header, colIdx) => {
        if (!header) return;
        const cleanHeader = String(header).trim();
        if (!cleanHeader || cleanHeader === "__PowerAppsId__") return;

        const key = colIdx === 0 ? "Date" : cleanHeader;
        if (key === "Date" || activeNames.has(key)) {
          rowObj[key] = rowsData[i][colIdx] || "";
        }
      });
      rows.push(rowObj);
    }

    return res.status(200).json(
      generateReport(rows, persistentData.projects || [])
    );
  } catch (err) {
    console.error("Error generating Redis-backed daily status:", err);
    return res.status(500).json({ error: err.message });
  }
};
