
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

app.get(
  "/books",
  (req: Request, res: Response, next: NextFunction) => {
    if (req.query.mine === "true") {
      authenticateUser(req, res, next);
      return;
    }

    next();
  },
  async (req: Request, res: Response): Promise<void> => {
    try {
      const db = await connectToDatabase();

      const limitParam = req.query.limit;
      const limit = Number(limitParam);

      if (
        req.query.mine !== undefined &&
        req.query.mine !== "true" &&
        req.query.mine !== "false"
      ) {
        res.status(400).json({
          success: false,
          message: "Invalid mine parameter.",
        });
        return;
      }

      let filter = {};

      if (req.query.mine === "true") {
        filter = { userId: res.locals.authUser.id };
      }

      let query = db
        .collection("books")
        .find(filter)
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
  }
);

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
        imagePublicId: uploadedImage.publicId,
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

// Update an Existing Book
app.patch(
  "/books/:id",
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
    let updateSucceeded = false;

    try {
  const id = req.params.id;

   if (typeof id !== "string" || !/^[0-9a-fA-F]{24}$/.test(id)) {
    res.status(400).json({
    success: false,
    message: "Invalid book ID.",
    });
    return;
     }

      const db = await connectToDatabase();
      const booksCollection = db.collection("books");

      const book = await booksCollection.findOne({
        _id: new ObjectId(id),
      });

      if (!book) {
        res.status(404).json({
          success: false,
          message: "Book not found.",
        });
        return;
      }

      if (book.userId !== res.locals.authUser.id) {
        res.status(403).json({
          success: false,
          message: "You can only update your own books.",
        });
        return;
      }

      const {
        title,
        author,
        category,
        totalCopies,
        description,
      } = req.body ?? {};

      const allowedCategories = [
        "Fiction",
        "Science",
        "History",
        "Kids",
        "Others",
      ];

      const updateData: Record<string, unknown> = {};

      if (title !== undefined) {
        if (typeof title !== "string" || !title.trim()) {
          res.status(400).json({
            success: false,
            message: "Book title cannot be empty.",
          });
          return;
        }

        updateData.title = title.trim();
      }

      if (author !== undefined) {
        if (typeof author !== "string" || !author.trim()) {
          res.status(400).json({
            success: false,
            message: "Author name cannot be empty.",
          });
          return;
        }

        updateData.author = author.trim();
      }

      if (category !== undefined) {
        if (
          typeof category !== "string" ||
          !allowedCategories.includes(category)
        ) {
          res.status(400).json({
            success: false,
            message: "Invalid book category.",
          });
          return;
        }

        updateData.category = category;
      }

      if (description !== undefined) {
        if (
          typeof description !== "string" ||
          !description.trim()
        ) {
          res.status(400).json({
            success: false,
            message: "Book description cannot be empty.",
          });
          return;
        }

        updateData.description = description.trim();
      }

      const currentTotalCopies = Number(book.totalCopies);
      const currentAvailableCopies = Number(
        book.availableCopies ?? book.totalCopies,
      );

      const borrowedCopies =
        currentTotalCopies - currentAvailableCopies;

      if (
        !Number.isInteger(currentTotalCopies) ||
        !Number.isInteger(currentAvailableCopies) ||
        borrowedCopies < 0
      ) {
        res.status(409).json({
          success: false,
          message: "Book copy information is invalid.",
        });
        return;
      }

      if (totalCopies !== undefined) {
        const newTotalCopies = Number(totalCopies);

        if (
          !Number.isInteger(newTotalCopies) ||
          newTotalCopies < 1
        ) {
          res.status(400).json({
            success: false,
            message: "Total copies must be a positive integer.",
          });
          return;
        }

        if (newTotalCopies < borrowedCopies) {
          res.status(400).json({
            success: false,
            message:
              "Total copies cannot be less than the number of borrowed copies.",
          });
          return;
        }

        updateData.totalCopies = newTotalCopies;
        updateData.availableCopies =
          newTotalCopies - borrowedCopies;
      }

      if (!req.file && Object.keys(updateData).length === 0) {
        res.status(400).json({
          success: false,
          message: "Please provide at least one field to update.",
        });
        return;
      }

      if (req.file) {
        const uploadedImage = await uploadBookImage(req.file);

        uploadedPublicId = uploadedImage.publicId;
        updateData.image = uploadedImage.imageUrl;
        updateData.imagePublicId = uploadedImage.publicId;
      }

      const updateResult = await booksCollection.updateOne(
        {
          _id: new ObjectId(id),
          userId: res.locals.authUser.id,
          totalCopies: book.totalCopies,
          availableCopies: book.availableCopies,
        },
        {
          $set: updateData,
        },
      );

      if (updateResult.matchedCount === 0) {
        if (uploadedPublicId) {
          await cloudinary.uploader.destroy(uploadedPublicId);
          uploadedPublicId = null;
        }

        res.status(409).json({
          success: false,
          message:
            "Book information changed. Please refresh and try again.",
        });
        return;
      }

      updateSucceeded = true;

  
      if (
        uploadedPublicId &&
        typeof book.imagePublicId === "string"
      ) {
        try {
          await cloudinary.uploader.destroy(book.imagePublicId);
        } catch (cleanupError) {
          console.error(
            "Old Cloudinary image cleanup failed:",
            cleanupError,
          );
        }
      }

      res.status(200).json({
        success: true,
        message: "Book updated successfully.",
        data: {
          ...book,
          ...updateData,
        },
      });
    } catch (error) {
      if (uploadedPublicId && !updateSucceeded) {
        try {
          await cloudinary.uploader.destroy(uploadedPublicId);
        } catch (cleanupError) {
          console.error(
            "New Cloudinary image cleanup failed:",
            cleanupError,
          );
        }
      }

      console.error("Update book error:", error);

      res.status(500).json({
        success: false,
        message: "Failed to update book. Please try again.",
      });
    }
  },
);



app.delete(
  "/books/:id",
  authenticateUser,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id;

      if (typeof id !== "string" || !/^[0-9a-fA-F]{24}$/.test(id)) {
        res.status(400).json({
          success: false,
          message: "Invalid book ID.",
        });
        return;
      }

      const db = await connectToDatabase();
      const booksCollection = db.collection("books");

      const book = await booksCollection.findOne({
        _id: new ObjectId(id),
      });

      if (!book) {
        res.status(404).json({
          success: false,
          message: "Book not found.",
        });
        return;
      }

      if (book.userId !== res.locals.authUser.id) {
        res.status(403).json({
          success: false,
          message: "You can only delete your own books.",
        });
        return;
      }

      const deleteResult = await booksCollection.deleteOne({
        _id: new ObjectId(id),
        userId: res.locals.authUser.id,
      });

      if (deleteResult.deletedCount === 0) {
        res.status(409).json({
          success: false,
          message: "Book could not be deleted. Please try again.",
        });
        return;
      }

      if (typeof book.imagePublicId === "string") {
        try {
          await cloudinary.uploader.destroy(book.imagePublicId);
        } catch (cleanupError) {
          console.error(
            "Cloudinary image cleanup failed:",
            cleanupError,
          );
        }
      }

      res.status(200).json({
        success: true,
        message: "Book deleted successfully.",
      });
    } catch (error) {
      console.error("Delete book error:", error);

      res.status(500).json({
        success: false,
        message: "Failed to delete book. Please try again.",
      });
    }
  },
);


// Borrow a Book
app.post(
  "/borrows",
  authenticateUser,
  async (req: Request, res: Response): Promise<void> => {
    const session = client.startSession();

    try {
      const { bookId } = req.body ?? {};

      if (
        typeof bookId !== "string" ||
        !/^[0-9a-fA-F]{24}$/.test(bookId)
      ) {
        res.status(400).json({
          success: false,
          message: "Invalid book ID.",
        });
        return;
      }

      const db = await connectToDatabase();
      const booksCollection = db.collection("books");
      const borrowsCollection = db.collection("borrows");
      const userId = res.locals.authUser.id;

    
      await borrowsCollection.createIndex(
        { userId: 1, bookId: 1 },
        {
          unique: true,
          partialFilterExpression: { status: "active" },
        },
      );

      let failureReason:
        | "not_found"
        | "own_book"
        | "unavailable"
        | null = null;

      let createdBorrow: Record<string, unknown> | null = null;

      await session.withTransaction(async () => {
        failureReason = null;
        createdBorrow = null;

        const book = await booksCollection.findOne(
          { _id: new ObjectId(bookId) },
          { session },
        );

        if (!book) {
          failureReason = "not_found";
          return;
        }

        if (book.userId === userId) {
          failureReason = "own_book";
          return;
        }

        const availableCopies = Number(
          book.availableCopies ?? book.totalCopies,
        );

        if (
          !Number.isInteger(availableCopies) ||
          availableCopies < 1
        ) {
          failureReason = "unavailable";
          return;
        }

       
        const updateResult = await booksCollection.updateOne(
          {
            _id: new ObjectId(bookId),
            availableCopies: { $gt: 0 },
            userId: { $ne: userId },
          },
          {
            $inc: { availableCopies: -1 },
          },
          { session },
        );

        if (updateResult.modifiedCount === 0) {
          failureReason = "unavailable";
          return;
        }

        const borrow = {
          bookId: new ObjectId(bookId),
          bookTitle: book.title,
          bookImage: book.image,
          userId,
          userName: res.locals.authUser.name,
          userEmail: res.locals.authUser.email,
          status: "active",
          borrowedAt: new Date(),
          returnedAt: null,
        };

        const insertResult = await borrowsCollection.insertOne(
          borrow,
          { session },
        );

        createdBorrow = {
          _id: insertResult.insertedId,
          ...borrow,
        };
      });

      if (failureReason === "not_found") {
        res.status(404).json({
          success: false,
          message: "Book not found.",
        });
        return;
      }

      if (failureReason === "own_book") {
        res.status(403).json({
          success: false,
          message: "You cannot borrow your own book.",
        });
        return;
      }

      if (failureReason === "unavailable") {
        res.status(409).json({
          success: false,
          message: "This book is currently unavailable.",
        });
        return;
      }

      if (!createdBorrow) {
        res.status(500).json({
          success: false,
          message: "Failed to borrow book.",
        });
        return;
      }

      res.status(201).json({
        success: true,
        message: "Book borrowed successfully.",
        data: createdBorrow,
      });
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === 11000
      ) {
        res.status(409).json({
          success: false,
          message: "You have already borrowed this book.",
        });
        return;
      }

      console.error("Borrow book error:", error);

      res.status(500).json({
        success: false,
        message: "Failed to borrow book. Please try again.",
      });
    } finally {
      await session.endSession();
    }
  },
);

// Get Current User's Borrowed Books
app.get(
  "/borrows",
  authenticateUser,
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const db = await connectToDatabase();

      const borrows = await db
        .collection("borrows")
        .find({
          userId: res.locals.authUser.id,
        })
        .sort({ borrowedAt: -1 })
        .toArray();

      res.status(200).json({
        success: true,
        message: "Borrow history fetched successfully.",
        data: borrows,
      });
    } catch (error) {
      console.error("Fetch borrow history error:", error);

      res.status(500).json({
        success: false,
        message: "Failed to fetch borrow history.",
      });
    }
  },
);


app.delete(
  "/borrows/:id",
  authenticateUser,
  async (req: Request, res: Response): Promise<void> => {
    const session = client.startSession();

    try {
      const id = req.params.id;

      if (typeof id !== "string" || !/^[0-9a-fA-F]{24}$/.test(id)) {
        res.status(400).json({
          success: false,
          message: "Invalid borrow ID.",
        });
        return;
      }

      const db = await connectToDatabase();
      const borrowsCollection = db.collection("borrows");
      const booksCollection = db.collection("books");

      let failureReason:
        | "not_found"
        | "already_returned"
        | "book_missing"
        | null = null;

      await session.withTransaction(async () => {
        failureReason = null;

        const borrow = await borrowsCollection.findOne(
          {
            _id: new ObjectId(id),
            userId: res.locals.authUser.id,
          },
          { session },
        );

        if (!borrow) {
          failureReason = "not_found";
          return;
        }

        if (borrow.status !== "active") {
          failureReason = "already_returned";
          return;
        }

        const bookUpdate = await booksCollection.updateOne(
          { _id: borrow.bookId },
          { $inc: { availableCopies: 1 } },
          { session },
        );

        if (bookUpdate.matchedCount === 0) {
          failureReason = "book_missing";
          return;
        }

        await borrowsCollection.updateOne(
          {
            _id: new ObjectId(id),
            userId: res.locals.authUser.id,
            status: "active",
          },
          {
            $set: {
              status: "returned",
              returnedAt: new Date(),
            },
          },
          { session },
        );
      });

      if (failureReason === "not_found") {
        res.status(404).json({
          success: false,
          message: "Active borrow record not found.",
        });
        return;
      }

      if (failureReason === "already_returned") {
        res.status(409).json({
          success: false,
          message: "This book has already been returned.",
        });
        return;
      }

      if (failureReason === "book_missing") {
        res.status(404).json({
          success: false,
          message: "The original book no longer exists.",
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: "Book returned successfully.",
      });
    } catch (error) {
      console.error("Return book error:", error);

      res.status(500).json({
        success: false,
        message: "Failed to return book. Please try again.",
      });
    } finally {
      await session.endSession();
    }
  },
);

// লোকাল ডেভেলপমেন্টের জন্য app.listen, Vercel-এ এটি ইগনোর হবে
if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`BookNook server is running on port ${PORT}`);
  });
}

// Vercel-এর জন্য অ্যাপ এক্সপোর্ট
export default app;
