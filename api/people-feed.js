const { getPeople } = require("../storage");

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

module.exports = async (req, res) => {
  try {
    const people = await getPeople();
    const now = new Date().toUTCString();

    const items = people
      .filter((person) => person.email)
      .map((person) => `
      <item>
        <title>${escapeXml(person.name)}</title>
        <description>${escapeXml(person.email)}</description>
        <pubDate>${now}</pubDate>
        <guid isPermaLink="false">dailycatchup-person-${escapeXml(person.name)}</guid>
      </item>`)
      .join("");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Daily Catch Up People</title>
    <description>Current Daily Catch Up people and email addresses</description>
    <link>https://daily-catch-up.vercel.app/</link>
    <lastBuildDate>${now}</lastBuildDate>${items}
  </channel>
</rss>`;

    res.setHeader("Content-Type", "application/rss+xml; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, max-age=0");
    return res.status(200).send(xml);
  } catch (error) {
    console.error("People RSS feed error:", error);
    res.setHeader("Content-Type", "application/rss+xml; charset=utf-8");
    return res.status(500).send(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Daily Catch Up People</title><description>${escapeXml(error.message || "Unable to load people.")}</description></channel></rss>`);
  }
};
