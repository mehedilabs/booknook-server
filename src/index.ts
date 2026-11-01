import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, type Db } from "mongodb";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 5000;

const mongoConnectionString = process.env.MONGODB_URI;

if (!mongoConnectionString) {
  throw new Error("MONGODB_URI is missing from environment variables");
}

const client = new MongoClient(mongoConnectionString);

// Vercel-এর জন্য ডাটাবেস কানেকশন ক্যাশ করা
let cachedDb: Db | null = null;

const connectToDatabase = async (): Promise<Db> => {
  if (cachedDb) {
    return cachedDb;
  }
  await client.connect();
  cachedDb = client.db("booknook_library");
  console.log("MongoDB connected successfully!");
  return cachedDb;
};

type BookCategory = "Fiction" | "Science" | "History" | "Kids" | "Others";

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

app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => {
  res.send("BookNook Server is running!");
});

app.get("/books", async (req, res) => {
  try {
    // এখানে ডাটাবেস কানেক্ট করা হচ্ছে (যদি আগে থেকে কানেক্টেড না থাকে)
    const db = await connectToDatabase();

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

// লোকাল ডেভেলপমেন্টের জন্য app.listen, Vercel-এ এটি ইগনোর হবে
if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`BookNook server is running on port ${PORT}`);
  });
}

// Vercel-এর জন্য অ্যাপ এক্সপোর্ট
export default app;
