const generateReport = require("../report");
const { getOptions } = require("../storage");
const {
  sheets,
  getCurrentSheetName,
  ensureSheetExists,
} = require("../sheet-helper");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    const spreadsheetId = process.env.SPREADSHEET_ID;
    if (!spreadsheetId) {
      return res.status(500).json({ error: "SPREADSHEET_ID environment variable is not configured." });
    }

    const sheetName = getCurrentSheetName();
    await ensureSheetExists(spreadsheetId, sheetName);

    // Redis-backed active names & projects
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
    console.error("Error generating daily status report:", err);
    return res.status(500).json({ error: err.message || "Unable to generate daily status." });
  }
};
