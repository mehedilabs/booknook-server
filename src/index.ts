
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ObjectId, type Db } from "mongodb";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { v2 as cloudinary } from "cloudinary";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 5000;

const mongoConnectionString = process.env.MONGODB_URI;

if (!mongoConnectionString) {
  throw new Error("MONGODB_URI is missing from environment variables");
}

const betterAuthUrl = process.env.BETTER_AUTH_URL;

if (!betterAuthUrl) {
  throw new Error("BETTER_AUTH_URL is missing from environment variables");
}

const cloudinaryCloudName = process.env.CLOUDINARY_CLOUD_NAME;
const cloudinaryApiKey = process.env.CLOUDINARY_API_KEY;
const cloudinaryApiSecret = process.env.CLOUDINARY_API_SECRET;

if (!cloudinaryCloudName || !cloudinaryApiKey || !cloudinaryApiSecret) {
  throw new Error("Cloudinary environment variables are missing.");
}

cloudinary.config({
  cloud_name: cloudinaryCloudName,
  api_key: cloudinaryApiKey,
  api_secret: cloudinaryApiSecret,
});


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

const JWKS = createRemoteJWKSet(
  new URL("/api/auth/jwks", betterAuthUrl)
);


const authenticateUser = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({
      success: false,
      message: "Authentication required. Please log in.",
    });
    return;
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    res.status(401).json({
      success: false,
      message: "Invalid authorization header.",
    });
    return;
  }

 const token = match[1];

if (!token) {
  res.status(401).json({
    success: false,
    message: "Authentication token is missing.",
  });
  return;
}

try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: betterAuthUrl,
      audience: betterAuthUrl,
    });

    if (!payload.sub || typeof payload.email !== "string") {
      res.status(401).json({
        success: false,
        message: "Invalid user information in token.",
      });
      return;
    }

    // যাচাইকৃত User-এর তথ্য পরবর্তী Route-এ পাঠানো হচ্ছে
    res.locals.authUser = {
      id: payload.sub,
      name: typeof payload.name === "string" ? payload.name : "",
      email: payload.email,
    };

    next();
  } catch (error) {
    console.error("JWT verification failed:", error);

    res.status(401).json({
      success: false,
      message: "Invalid or expired authentication token.",
    });
  }
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

app.get("/auth-check", authenticateUser, (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Authentication successful.",
    user: res.locals.authUser,
  });
});

app.get("/books", async (req, res) => {
  try {
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

app.get("/books/:id", async (req, res) => {
  try {
    const db = await connectToDatabase();

    const { id } = req.params;

    if (!/^[0-9a-fA-F]{24}$/.test(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid book ID.",
      });
      return;
    }

    const book = await db.collection("books").findOne({
      _id: new ObjectId(id),
    });

    if (!book) {
      res.status(404).json({
        success: false,
        message: "Book not found.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Book fetched successfully.",
      data: book,
    });
  } catch (error) {
    console.error("Failed to fetch book:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch book.",
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
