
import express from "express";

const app = express();

const PORT = 5000;

app.get("/", (_req, res) => {
  res.send("BookNook Server is running!");
});

app.listen(PORT, () => {
  console.log(`BookNook server is running on port ${PORT}`);
});
