import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import words from "../src/words.json" with { type: "json" };

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

// Serve static files from the dist folder (local dev only; ignored by Vercel in prod)
app.use(express.static(join(process.cwd(), "src", "web", "dist")));

app.get("/api/words", (req, res) => {
  res.json(words);
});

app.get("/api/:date", async (req, res) => {
  const { date } = req.params;

  // Validate date format (YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) {
    return res
      .status(400)
      .json({ error: "Invalid date format. Expected YYYY-MM-DD" });
  }

  try {
    const response = await fetch(
      `https://www.nytimes.com/svc/wordle/v2/${date}.json`
    );
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch wordle data" });
  }
});

// Serve the SPA for all other routes
app.get("*", (req, res) => {
  res.sendFile(join(process.cwd(), "src", "web", "dist", "index.html"));
});

export default app;
