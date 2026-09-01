const { getHolidays, addHoliday, deleteHoliday } = require("../storage");

function requestYear(req, fallback) {
  const value = req.query && req.query.year ? req.query.year : fallback;
  return String(value || "").trim();
}

module.exports = async (req, res) => {
  try {
    if (req.method === "GET") {
      const year = requestYear(req, String(new Date().getFullYear()));
      return res.status(200).json({ year, holidays: await getHolidays(year) });
    }

    if (req.method === "POST") {
      const { year, date, name } = req.body || {};
      return res.status(200).json({
        success: true,
        year: String(year || "").trim(),
        holidays: await addHoliday(year, date, name),
      });
    }

    if (req.method === "DELETE") {
      const { year, date } = req.body || {};
      return res.status(200).json({
        success: true,
        year: String(year || "").trim(),
        holidays: await deleteHoliday(year, date),
      });
    }

    res.setHeader("Allow", ["GET", "POST", "DELETE"]);
    return res.status(405).json({ error: "Method not allowed." });
  } catch (error) {
    console.error("Holidays API error:", error);
    return res.status(400).json({ error: error.message || "Unable to update holidays." });
  }
};
