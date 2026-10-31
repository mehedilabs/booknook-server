
import express from "express";
import cors from "cors";
import { connectDB } from "./config/db.js";
import { createBookRouter } from "./routes/book.routes.js";

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => {
  res.send("BookNook Server is running!");
});

const startServer = async () => {
  try {
    const db = await connectDB();

    app.use("/books", createBookRouter(db));

    app.listen(PORT, () => {
      console.log(`BookNook server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error);
    process.exit(1);
  }
};

startServer();
