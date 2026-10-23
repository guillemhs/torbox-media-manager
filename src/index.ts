import "dotenv/config";

import express from "express";
import { getLibrary, triggerLibraryScan, syncLibraryTorbox, getLibraryStatus } from "./services/media.service";

const app = express();
const PORT = process.env.PORT || 6666;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.get("/library", getLibrary);
app.post("/library/scan", triggerLibraryScan);
app.post("/library/sync", syncLibraryTorbox);
app.get("/library/status", getLibraryStatus);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", mode: process.env.TORBOX_API_KEY ? "torbox-integrated" : "local-offline" });
});

// Start server
app.listen(PORT, () => {
  console.log(`Torbox Media Manager running on port ${PORT}`);
  console.log(`Mode: ${process.env.TORBOX_API_KEY ? "Torbox Integrated" : "Local Offline"}`);
  console.log(`API Key configured: ${!!process.env.TORBOX_API_KEY}`);
});