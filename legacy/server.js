const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 8080;
const PUBLIC_DIR = __dirname;
const TIMEOUT_MS = 8000;

app.use(express.static(PUBLIC_DIR));

app.get("/api/public-profile", async (req, res) => {
  const address = req.query.address;
  if (!address) {
    return res.status(400).json({ error: "address required" });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const url = new URL("https://gamma-api.polymarket.com/public-profile");
    url.searchParams.set("address", address);

    const response = await fetch(url.toString(), { signal: controller.signal });
    const body = await response.text();

    res.status(response.status);
    res.set("content-type", response.headers.get("content-type") || "application/json");
    return res.send(body);
  } catch (error) {
    return res.status(502).json({ error: "Upstream request failed." });
  } finally {
    clearTimeout(timer);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://127.0.0.1:${PORT}`);
});
