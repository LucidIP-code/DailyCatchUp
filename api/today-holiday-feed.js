const { getHolidays } = require("../storage");

const TIME_ZONE = process.env.APP_TIME_ZONE || "Asia/Kolkata";

function getTodayDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildFeed(holiday, today) {
  const item = holiday
    ? `\n    <item>\n      <title>${escapeXml(holiday.name)}</title>\n      <description>${escapeXml(holiday.name)} - ${escapeXml(today)}</description>\n      <pubDate>${new Date().toUTCString()}</pubDate>\n      <guid isPermaLink="false">dailycatchup-holiday-${escapeXml(today)}</guid>\n    </item>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n  <channel>\n    <title>Daily Catch Up - Today Holiday</title>\n    <description>Holiday check for Daily Catch Up</description>\n    <link>https://daily-catch-up.vercel.app/</link>\n    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>${item}\n  </channel>\n</rss>`;
}

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const today = getTodayDate();
    const year = today.slice(0, 4);
    const holidays = await getHolidays(year);
    const holiday = holidays.find((entry) => entry.date === today) || null;

    res.setHeader("Content-Type", "application/rss+xml; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, max-age=0");
    return res.status(200).send(buildFeed(holiday, today));
  } catch (error) {
    console.error("Today holiday feed error:", error);
    res.setHeader("Content-Type", "application/rss+xml; charset=utf-8");
    return res.status(500).send(
      `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Daily Catch Up - Today Holiday</title><description>${escapeXml(error.message || "Unable to check holiday")}</description></channel></rss>`
    );
  }
};
