import { ENV } from "./src/config/env.js";
import { db } from "./src/config/db.js";
import { favoritesTable } from "./src/db/schema.js";
import { eq } from "drizzle-orm";

async function testDatabase() {
  try {
    console.log("Testing database connection...");
    console.log("Database URL:", ENV.DATABASE_URL ? "Set" : "Not set");
    
    if (!ENV.DATABASE_URL) {
      console.error("❌ DATABASE_URL is not set in environment variables");
      console.log("Please create a .env file with your Neon database URL");
      return;
    }

    // Test basic connection
    const result = await db.execute("SELECT NOW()");
    console.log("✅ Database connection successful:", result);

    // Test if favorites table exists
    try {
      const tableCheck = await db.execute(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'favorites'
        );
      `);
      
      const tableExists = tableCheck[0]?.exists;
      console.log("📋 Favorites table exists:", tableExists);

      if (!tableExists) {
        console.log("❌ Favorites table does not exist");
        console.log("Run: npx drizzle-kit push");
      } else {
        console.log("✅ Favorites table exists");
        
        // Test inserting a sample record
        const sampleData = {
          userId: "test_user",
          recipeId: 123,
          title: "Test Recipe",
          image: "https://example.com/image.jpg",
          cookTime: "30 minutes",
          servings: "4"
        };

        const insertResult = await db.insert(favoritesTable).values(sampleData).returning();
        console.log("✅ Insert test successful:", insertResult[0]);

        // Clean up test data
        await db.delete(favoritesTable).where(eq(favoritesTable.userId, "test_user"));
        console.log("✅ Cleanup successful");
      }
    } catch (tableError) {
      console.error("❌ Error checking/creating table:", tableError.message);
    }

  } catch (error) {
    console.error("❌ Database connection failed:", error.message);
    console.log("Please check your DATABASE_URL in the .env file");
  }
}

testDatabase(); 