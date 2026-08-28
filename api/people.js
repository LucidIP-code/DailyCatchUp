const { getPeople, upsertPerson, deletePerson } = require("../storage");

module.exports = async (req, res) => {
  try {
    if (req.method === "GET") {
      return res.status(200).json({ people: await getPeople() });
    }

    if (req.method === "POST") {
      const { name, email } = req.body || {};
      return res.status(200).json({
        success: true,
        people: await upsertPerson(name, email),
      });
    }

    if (req.method === "DELETE") {
      const { name } = req.body || {};
      return res.status(200).json({
        success: true,
        people: await deletePerson(name),
      });
    }

    res.setHeader("Allow", ["GET", "POST", "DELETE"]);
    return res.status(405).json({ error: "Method not allowed." });
  } catch (error) {
    console.error("People API error:", error);
    return res.status(400).json({ error: error.message || "Unable to update people." });
  }
};
