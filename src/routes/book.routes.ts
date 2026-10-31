
import { Router } from "express";
import type { Db } from "mongodb";

export const createBookRouter = (db: Db) => {
  const router = Router();

  router.get("/", async (req, res) => {
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

  return router;
};
