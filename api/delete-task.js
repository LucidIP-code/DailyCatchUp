const {
  sheets,
  getCurrentSheetName,
  ensureSheetExists,
  getValidTodayKeys,
  getColumnLetter,
} = require("../sheet-helper");

module.exports = async (req, res) => {
  if (req.method !== "POST" && req.method !== "DELETE") {
    res.setHeader("Allow", ["POST", "DELETE"]);
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    const { name } = req.body || {};
    const cleanName = String(name || "").trim();
    if (!cleanName) {
      return res.status(400).json({ error: "Name is required." });
    }

    const spreadsheetId = process.env.SPREADSHEET_ID;
    if (!spreadsheetId) {
      return res.status(500).json({ error: "SPREADSHEET_ID environment variable is not configured." });
    }

    const sheetName = getCurrentSheetName();
    await ensureSheetExists(spreadsheetId, sheetName);

    const readRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A1:ZZ1000`,
    });

    const rows = readRes.data.values || [];
    if (rows.length === 0) {
      return res.status(400).json({ error: "Sheet is empty." });
    }

    const headers = rows[0] || [];
    const nameColIndex = headers.findIndex(
      (h) => String(h || "").trim().toLowerCase() === cleanName.toLowerCase()
    );

    if (nameColIndex === -1) {
      return res.status(400).json({ error: `Name '${cleanName}' does not exist in the sheet.` });
    }

    const validTodayKeys = getValidTodayKeys();
    let targetRowIndex = -1;

    for (let i = 1; i < rows.length; i++) {
      const cellDate = String(rows[i][0] || "").trim().toLowerCase();
      if (validTodayKeys.includes(cellDate)) {
        targetRowIndex = i + 1;
        break;
      }
    }

    if (targetRowIndex === -1) {
      return res.status(400).json({ error: "Today's date was not found in sheet." });
    }

    const colLetter = getColumnLetter(nameColIndex);
    const cellRange = `${sheetName}!${colLetter}${targetRowIndex}`;

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: cellRange,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[""]] },
    });

    return res.status(200).json({ success: true, message: `Cleared entry for ${cleanName}.` });
  } catch (err) {
    console.error("Error deleting entry:", err);
    return res.status(500).json({ error: err.message || "Unable to delete entry." });
  }
};
