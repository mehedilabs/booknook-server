
import express from "express";
import { connectDB } from "./config/db.js";

const app = express();

const PORT = 5000;

app.get("/", (_req, res) => {
  res.send("BookNook Server is running!");
});

const startServer = async () => {
  try {
    await connectDB();

    app.listen(PORT, () => {
      console.log(`BookNook server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error);
    process.exit(1);
  }
};

startServer();
