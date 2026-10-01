const {
  sheets,
  getCurrentSheetName,
  ensureSheetExists,
  getValidTodayKeys,
  getColumnLetter,
} = require("../sheet-helper");
const { addOption } = require("../storage");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    const { name, tasks } = req.body || {};
    if (!name || !Array.isArray(tasks)) {
      return res.status(400).json({ error: "Name and tasks array are required." });
    }

    const cleanName = String(name).trim();
    if (!cleanName) {
      return res.status(400).json({ error: "A valid name is required." });
    }

    const spreadsheetId = process.env.SPREADSHEET_ID;
    if (!spreadsheetId) {
      return res.status(500).json({ error: "SPREADSHEET_ID environment variable is not configured." });
    }

    const sheetName = getCurrentSheetName();
    await ensureSheetExists(spreadsheetId, sheetName);

    // Bug 2.1 Fix: Sync new/active name into Redis options so daily status view recognizes it
    try {
      await addOption("name", cleanName);
    } catch (e) {
      console.warn("Could not sync name to Redis:", e.message);
    }

    const readRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A1:ZZ1000`,
    });

    let rows = readRes.data.values || [["Date"]];
    let headers = rows[0] || ["Date"];
    let nameColIndex = headers.findIndex(
      (h) => String(h || "").trim().toLowerCase() === cleanName.toLowerCase()
    );

    if (nameColIndex === -1) {
      // Intentionally insert new person at Column B (index 1)
      nameColIndex = 1;
      console.log(`📌 Inserting new column for '${cleanName}' in Column B...`);

      for (let i = 0; i < rows.length; i++) {
        if (i === 0) {
          rows[i].splice(1, 0, cleanName);
        } else {
          rows[i].splice(1, 0, "");
        }
      }

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A1`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: rows },
      });
    }

    // Bug 3.2 Fix: Case-insensitive date matching
    const validTodayKeys = getValidTodayKeys();
    let targetRowIndex = -1;

    for (let i = 1; i < rows.length; i++) {
      const cellDate = String(rows[i][0] || "").trim().toLowerCase();
      if (validTodayKeys.includes(cellDate)) {
        targetRowIndex = i + 1; // 1-indexed for Google Sheets
        break;
      }
    }

    if (targetRowIndex === -1) {
      return res.status(400).json({
        error: `Today's date was not found in Column A for tab '${sheetName}'.`,
      });
    }

    const formattedCellText = tasks
      .map((t) => {
        const lines = String(t.task || "")
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);
        if (lines.length === 0) return "";
        const project = String(t.project || "").trim();
        const firstLine = `${project} - ${lines[0].replace(/^[•\-\*\d+\.]\s*/, "")}`;
        const restLines = lines
          .slice(1)
          .map((line) => `   ${line.replace(/^[•\-\*\d+\.]\s*/, "")}`);
        return [firstLine, ...restLines].join("\n");
      })
      .filter(Boolean)
      .join("\n\n");

    const colLetter = getColumnLetter(nameColIndex);
    const cellRange = `${sheetName}!${colLetter}${targetRowIndex}`;

    const existingCell =
      (rows[targetRowIndex - 1] && rows[targetRowIndex - 1][nameColIndex]) || "";
    const finalCellText = existingCell
      ? `${existingCell}\n\n${formattedCellText}`
      : formattedCellText;

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: cellRange,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[finalCellText]] },
    });

    return res.status(200).json({ success: true, message: "Tasks saved successfully!" });
  } catch (err) {
    console.error("Error saving task:", err);
    return res.status(500).json({ error: err.message || "Unable to save task." });
  }
};
