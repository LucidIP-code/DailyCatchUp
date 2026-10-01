module.exports = (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method not allowed." });
  }

  const spreadsheetId = process.env.SPREADSHEET_ID || "";
  return res.status(200).json({
    url: spreadsheetId ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}` : "#",
  });
};
