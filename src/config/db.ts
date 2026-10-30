
import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const mongoConnectionString = process.env.MONGODB_URI;

if (!mongoConnectionString) {
  throw new Error("MONGODB_URI is missing from environment variables");
}

const client = new MongoClient(mongoConnectionString);

export const connectDB = async () => {
  try {
    await client.connect();

    console.log("MongoDB connected successfully!");

    return client.db("booknook_library");
  } catch (error) {
    console.error("MongoDB connection failed:", error);
    process.exit(1);
  }
};
