require("dotenv").config();
const express = require("express");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Mount modular API handlers
app.all("/api/options", require("./api/options"));
app.all("/api/daily-status", require("./api/daily-status"));
app.all("/api/previous-status", require("./api/previous-status"));
app.all("/api/holidays", require("./api/holidays"));
app.all("/api/people", require("./api/people"));
app.all("/api/people-feed", require("./api/people-feed"));
app.all("/api/today-holiday-feed", require("./api/today-holiday-feed"));
app.all("/api/submit-task", require("./api/submit-task"));
app.all("/api/delete-task", require("./api/delete-task"));
app.all("/api/sheet-url", require("./api/sheet-url"));

// Static app route fallback
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: `API route not found: ${req.path}` });
  }
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start local HTTP server if executed directly
if (require.main === module) {
  let PORT = parseInt(process.env.PORT, 10) || 3000;
  const startServer = (port) => {
    const server = app.listen(port, () => {
      console.log("Server active on port " + port);
    });
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.warn(`Port ${port} is in use, trying port ${port + 1}...`);
        startServer(port + 1);
      } else {
        console.error("Server error:", err);
      }
    });
  };
  startServer(PORT);
}

module.exports = app;
