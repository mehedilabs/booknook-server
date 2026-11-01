
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
import multer from "multer";

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


const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (_req, file, callback) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

    if (!allowedTypes.includes(file.mimetype)) {
      callback(new Error("Only JPG, PNG, and WEBP images are allowed."));
      return;
    }

    callback(null, true);
  },
});


const uploadBookImage = (
  file: Express.Multer.File
): Promise<{ imageUrl: string; publicId: string }> => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "booknook/books",
        resource_type: "image",
      },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error("Image upload failed."));
          return;
        }

        resolve({
          imageUrl: result.secure_url,
          publicId: result.public_id,
        });
      }
    );

    uploadStream.end(file.buffer);
  });
};

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

// Add a New Book
app.post(
  "/books",
  authenticateUser,
  (req: Request, res: Response, next: NextFunction) => {
    upload.single("image")(req, res, (error) => {
      if (error instanceof multer.MulterError) {
        const message =
          error.code === "LIMIT_FILE_SIZE"
            ? "Image size must be 5 MB or smaller."
            : error.message;

        res.status(400).json({
          success: false,
          message,
        });
        return;
      }

      if (error) {
        res.status(400).json({
          success: false,
          message:
            error instanceof Error
              ? error.message
              : "Invalid image upload.",
        });
        return;
      }

      next();
    });
  },
  async (req: Request, res: Response): Promise<void> => {
    let uploadedPublicId: string | null = null;

    try {
     const { title, author, category, totalCopies, description } =
            req.body ?? {};

      if (
        !title?.trim() ||
        !author?.trim() ||
        !category?.trim() ||
        !totalCopies ||
        !description?.trim()
      ) {
        res.status(400).json({
          success: false,
          message: "All fields are required.",
        });
        return;
      }

      if (!req.file) {
        res.status(400).json({
          success: false,
          message: "Book cover image is required.",
        });
        return;
      }

      const allowedCategories = [
        "Fiction",
        "Science",
        "History",
        "Kids",
        "Others",
      ];

      if (!allowedCategories.includes(category)) {
        res.status(400).json({
          success: false,
          message: "Invalid book category.",
        });
        return;
      }

      const copies = Number(totalCopies);

      if (!Number.isInteger(copies) || copies < 1) {
        res.status(400).json({
          success: false,
          message: "Total copies must be a positive integer.",
        });
        return;
      }

      const uploadedImage = await uploadBookImage(req.file);
      uploadedPublicId = uploadedImage.publicId;

      const db = await connectToDatabase();

      const newBook = {
        title: title.trim(),
        author: author.trim(),
        category,
        totalCopies: copies,
        availableCopies: copies,
        description: description.trim(),
        image: uploadedImage.imageUrl,
        userId: res.locals.authUser.id,
        userName: res.locals.authUser.name,
        userEmail: res.locals.authUser.email,
        createdAt: new Date(),
      };

      const result = await db.collection("books").insertOne(newBook);

      res.status(201).json({
        success: true,
        message: "Book added successfully.",
        data: {
          _id: result.insertedId,
          ...newBook,
        },
      });
    } catch (error) {
      if (uploadedPublicId) {
        try {
          await cloudinary.uploader.destroy(uploadedPublicId);
        } catch (cleanupError) {
          console.error("Cloudinary cleanup failed:", cleanupError);
        }
      }

      console.error("Add book error:", error);

      res.status(500).json({
        success: false,
        message: "Failed to add book. Please try again.",
      });
    }
  }
);

// লোকাল ডেভেলপমেন্টের জন্য app.listen, Vercel-এ এটি ইগনোর হবে
if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`BookNook server is running on port ${PORT}`);
  });
}

// Vercel-এর জন্য অ্যাপ এক্সপোর্ট
export default app;
