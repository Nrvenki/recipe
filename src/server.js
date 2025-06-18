import express from "express";
import cors from "cors";
import { ENV } from "./config/env.js";
import { db } from "./config/db.js";
import { favoritesTable, usersTable } from "./db/schema.js";
import { and, eq, desc, count } from "drizzle-orm";
import job from "./config/cron.js";

const app = express();
const PORT = ENV.PORT || 5001;

if (ENV.NODE_ENV === "production") job.start();

// CORS configuration
app.use(cors({
  origin: ENV.NODE_ENV === 'production' 
    ? [
        'https://your-production-domain.com', // Add your production domain here
      ]
    : [
        'http://localhost:8081', // React Native Metro bundler
        'http://localhost:19006', // Expo development server
        'http://localhost:19000', // Expo web
        'exp://localhost:19000', // Expo Go
        'exp://192.168.1.100:19000', // Expo Go on local network
        'http://localhost:3000', // React development server
        'http://localhost:3001', // Alternative React port
        /^https?:\/\/localhost:\d+$/, // Any localhost port
        /^exp:\/\/.*$/, // Any Expo URL
      ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

app.use(express.json());

// Add security headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.get("/api/health", (req, res) => {
  res.status(200).json({ success: true });
});

app.post("/api/favorites", async (req, res) => {
  try {
    const { userId, recipeId, title, image, cookTime, servings } = req.body;

    if (!userId || !recipeId || !title) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const newFavorite = await db
      .insert(favoritesTable)
      .values({
        userId,
        recipeId,
        title,
        image,
        cookTime,
        servings,
      })
      .returning();

    res.status(201).json(newFavorite[0]);
  } catch (error) {
    console.log("Error adding favorite", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.get("/api/favorites/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const userFavorites = await db
      .select()
      .from(favoritesTable)
      .where(eq(favoritesTable.userId, userId));

    res.status(200).json(userFavorites);
  } catch (error) {
    console.log("Error fetching the favorites", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.delete("/api/favorites/:userId/:recipeId", async (req, res) => {
  try {
    const { userId, recipeId } = req.params;

    if (!userId || !recipeId) {
      return res.status(400).json({ error: "User ID and Recipe ID are required" });
    }

    await db
      .delete(favoritesTable)
      .where(
        and(eq(favoritesTable.userId, userId), eq(favoritesTable.recipeId, parseInt(recipeId)))
      );

    res.status(200).json({ message: "Favorite removed successfully" });
  } catch (error) {
    console.log("Error removing a favorite", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// User registration endpoint
app.post("/api/users/register", async (req, res) => {
  try {
    const { clerkUserId, email, firstName, lastName } = req.body;

    if (!clerkUserId || !email) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Check if user already exists
    const existingUser = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.clerkUserId, clerkUserId));

    if (existingUser.length > 0) {
      // Update last sign in time
      await db
        .update(usersTable)
        .set({ lastSignInAt: new Date() })
        .where(eq(usersTable.clerkUserId, clerkUserId));
      
      return res.status(200).json(existingUser[0]);
    }

    // Create new user
    const newUser = await db
      .insert(usersTable)
      .values({
        clerkUserId,
        email,
        firstName,
        lastName,
        lastSignInAt: new Date(),
      })
      .returning();

    res.status(201).json(newUser[0]);
  } catch (error) {
    console.log("Error registering user", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// Get user statistics
app.get("/api/users/stats/:clerkUserId", async (req, res) => {
  try {
    const { clerkUserId } = req.params;

    if (!clerkUserId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    // Get total number of users
    const totalUsersResult = await db
      .select({ count: count() })
      .from(usersTable);
    
    const totalUsers = totalUsersResult[0]?.count || 0;

    // Get user's registration order
    const userOrderResult = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.clerkUserId, clerkUserId));

    if (userOrderResult.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const userOrder = userOrderResult[0].id;

    res.status(200).json({
      totalUsers,
      userOrder,
      registrationNumber: userOrder
    });
  } catch (error) {
    console.log("Error fetching user stats", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.listen(PORT, () => {
  console.log("Server is running on PORT:", PORT);
});
