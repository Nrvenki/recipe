# Backend Setup Guide

## Environment Variables Setup

To fix the database connection issues, you need to set up your environment variables:

1. **Create a `.env` file** in the `backend` directory:
   ```bash
   touch backend/.env
   ```

2. **Add your database URL** to the `.env` file:
   ```
   PORT=5001
   DATABASE_URL=your_neon_db_url_here
   NODE_ENV=development
   ```

3. **Get your Neon Database URL**:
   - Go to [Neon Console](https://console.neon.tech/)
   - Create a new project or select existing one
   - Go to Connection Details
   - Copy the connection string (starts with `postgresql://`)

4. **Run database migrations**:
   ```bash
   cd backend
   npx drizzle-kit push
   ```

5. **Start the server**:
   ```bash
   npm run dev
   ```

## Database Setup

The favorites table should be created automatically when you run:
```bash
npx drizzle-kit push
```

If you get errors, try:
```bash
npx drizzle-kit migrate
```

## Troubleshooting

If you still get "relation does not exist" errors:

1. Check that your DATABASE_URL is correct
2. Make sure you're using a Neon database (not local PostgreSQL)
3. Verify the database connection works
4. Run the migrations again

## Note

The `.env` file is gitignored for security reasons. Make sure to add your actual Neon database URL, not the placeholder text. 