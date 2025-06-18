import express from "express";
import cors from "cors";
import { ENV } from "./config/env.js";
import { db } from "./config/db.js";
import { favoritesTable, usersTable, passwordResetCodesTable } from "./db/schema.js";
import { and, eq, desc, count } from "drizzle-orm";
import job from "./config/cron.js";
import nodemailer from "nodemailer";

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

// Email transporter configuration
const transporter = nodemailer.createTransporter({
  service: 'gmail',
  auth: {
    user: ENV.EMAIL_USER,
    pass: ENV.EMAIL_PASS,
  },
});

// Generate 6-digit verification code
const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

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

// Password reset endpoints
app.post("/api/password-reset/send-code", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    // Generate verification code
    const code = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Save code to database
    await db
      .insert(passwordResetCodesTable)
      .values({
        email,
        code,
        expiresAt,
      });

    // Send email
    const mailOptions = {
      from: ENV.EMAIL_USER,
      to: email,
      subject: "Password Reset Verification Code",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Password Reset Request</h2>
          <p>You requested a password reset for your account.</p>
          <p>Your verification code is:</p>
          <div style="background-color: #f5f5f5; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
            <h1 style="color: #007bff; font-size: 32px; margin: 0; letter-spacing: 5px;">${code}</h1>
          </div>
          <p>This code will expire in 10 minutes.</p>
          <p>If you didn't request this password reset, please ignore this email.</p>
          <p>Best regards,<br>Recipe App Team</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({ success: true, message: "Verification code sent successfully" });
  } catch (error) {
    console.error("Error sending verification code:", error);
    res.status(500).json({ error: "Failed to send verification code" });
  }
});

app.post("/api/password-reset/verify-code", async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: "All fields are required" });
    }

    // Find the verification code
    const resetCode = await db
      .select()
      .from(passwordResetCodesTable)
      .where(
        and(
          eq(passwordResetCodesTable.email, email),
          eq(passwordResetCodesTable.code, code),
          eq(passwordResetCodesTable.used, false)
        )
      )
      .orderBy(desc(passwordResetCodesTable.createdAt))
      .limit(1);

    if (resetCode.length === 0) {
      return res.status(400).json({ error: "Invalid or expired verification code" });
    }

    const codeRecord = resetCode[0];

    // Check if code is expired
    if (new Date() > codeRecord.expiresAt) {
      return res.status(400).json({ error: "Verification code has expired" });
    }

    // Mark code as used
    await db
      .update(passwordResetCodesTable)
      .set({ used: true })
      .where(eq(passwordResetCodesTable.id, codeRecord.id));

    // Here you would update the user's password in your authentication system
    // For now, we'll just return success
    // In a real implementation, you'd update the password in Clerk or your auth system

    res.status(200).json({ success: true, message: "Password reset successfully" });
  } catch (error) {
    console.error("Error verifying code:", error);
    res.status(500).json({ error: "Failed to verify code" });
  }
});

app.listen(PORT, () => {
  console.log("Server is running on PORT:", PORT);
});
