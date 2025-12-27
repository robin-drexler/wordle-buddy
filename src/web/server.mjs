import express from "express";

const app = express();

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

app.get("/", (req, res) => {
  res.send("hello world");
});

export default app;
