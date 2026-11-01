
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, type Db } from "mongodb";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 5000;

// MongoDB connection
const mongoConnectionString = process.env.MONGODB_URI;

if (!mongoConnectionString) {
  throw new Error("MONGODB_URI is missing from environment variables");
}

const client = new MongoClient(mongoConnectionString);

let db: Db;

// Book types
type BookCategory =
  | "Fiction"
  | "Science"
  | "History"
  | "Kids"
  | "Others";

interface Book {
  _id?: string;
  title: string;
  author: string;
  category: BookCategory;
  image: string;
  description: string;
  userName: string;
  userEmail: string;
  createdAt: Date;
  totalCopies: number;
}

type CreateBookInput = Omit<
  Book,
  "_id" | "userName" | "userEmail" | "createdAt"
>;

app.use(cors());
app.use(express.json());

// Server health check
app.get("/", (_req, res) => {
  res.send("BookNook Server is running!");
});

// GET /books - Get all books
app.get("/books", async (req, res) => {
  try {
    const limitParam = req.query.limit;
    const limit = Number(limitParam);

    let query = db
      .collection("books")
      .find({})
      .sort({ createdAt: -1 });

    if (limitParam !== undefined) {
      if (!Number.isInteger(limit) || limit < 1) {
        res.status(400).json({
          success: false,
          message: "Limit must be a positive integer.",
        });
        return;
      }

      query = query.limit(limit);
    }

    const books = await query.toArray();

    res.status(200).json({
      success: true,
      message: "Books fetched successfully.",
      data: books,
    });
  } catch (error) {
    console.error("Failed to fetch books:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch books.",
    });
  }
});

// Start server
const startServer = async () => {
  try {
    await client.connect();

    db = client.db("booknook_library");

    console.log("MongoDB connected successfully!");

    app.listen(PORT, () => {
      console.log(`BookNook server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error);
    process.exit(1);
  }
};

startServer();

export default app;
