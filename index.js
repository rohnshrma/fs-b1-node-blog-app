import express from "express";
// Import the Express framework for creating the server.

import mongoose from "mongoose";
// Import Mongoose for database interactions.

import bodyParser from "body-parser";
// Import Body-Parser to parse incoming request bodies.

import { configDotenv } from "dotenv";
// Import Dotenv to manage environment variables.

import connectDB from "./utils/connection.js";
// Import a custom utility function to connect to the MongoDB database.

import bcrypt from "bcryptjs";
// Import Bcrypt.js for hashing passwords securely.

import session from "express-session";
// Import Express-Session for session management.

import passport from "passport";
// Import Passport.js for authentication.

import LocalStrategy from "passport-local";
// Import Passport's Local Strategy for username-password authentication.

import { Strategy as GoogleStrategy } from "passport-google-oauth20";
// Import Passport's Google OAuth 2.0 Strategy for Google authentication.

configDotenv();
// Load environment variables from a `.env` file.

const app = express();
// Initialize an Express application.

const PORT = 3000;
// Define the port where the server will run.

connectDB();
// Connect to the MongoDB database using the custom `connectDB` function.

// Define the schema for blog posts
const blogSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, minLength: 20 },
    // Blog title (required, minimum length 20).

    content: { type: String, required: true, minLength: 100 },
    // Blog content (required, minimum length 100).
  },
  { timestamps: true }
  // Automatically add `createdAt` and `updatedAt` timestamps.
);

// Define the schema for user accounts
const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true },
    // Username (required, unique for each user).

    password: String,
    // Password (hashed for security).

    googleId: { type: String, unique: true },
    // Google ID (for Google OAuth users, unique identifier).
  },
  { timestamps: true }
  // Automatically add `createdAt` and `updatedAt` timestamps.
);

// Create Mongoose models for the schemas
const Blog = mongoose.model("Blog", blogSchema);
// Blog model based on `blogSchema`.

const User = mongoose.model("User", userSchema);
// User model based on `userSchema`.

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
// Parse URL-encoded form data.

app.use(express.static("public"));
// Serve static files from the `public` directory.

app.set("view engine", "ejs");
// Set EJS as the view engine for rendering templates.

app.use(
  session({
    secret: process.env.SECRET,
    // Session secret key from environment variables.

    resave: false,
    // Prevent saving the session back to the store unless modified.

    saveUninitialized: false,
    // Prevent saving uninitialized sessions.

    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 },
    // Set session cookies to expire in 30 days.
  })
);

app.use(passport.initialize());
// Initialize Passport for authentication.

app.use(passport.session());
// Enable persistent login sessions with Passport.

// Passport Local Strategy for username and password login
passport.use(
  new LocalStrategy(async (username, password, done) => {
    try {
      const user = await User.findOne({ username });
      // Find a user by username.

      if (!user) {
        return done(null, false, { message: "Incorrect username." });
        // If no user is found, return an error message.
      }

      const isMatch = await bcrypt.compare(password, user.password);
      // Compare the provided password with the hashed password.

      if (!isMatch) {
        return done(null, false, { message: "Incorrect password." });
        // If the password doesn't match, return an error message.
      }

      return done(null, user);
      // If authentication succeeds, pass the user object to Passport.
    } catch (err) {
      return done(err);
      // Handle any errors during authentication.
    }
  })
);

// Google OAuth 2.0 Strategy for authentication with Google
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      // Google Client ID from environment variables.

      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      // Google Client Secret from environment variables.

      callbackURL: process.env.GOOGLE_CALLBACK_URL,
      // Callback URL after Google authentication.
    },
    async (accessToken, refreshToken, profile, cb) => {
      try {
        let user = await User.findOne({ googleId: profile.id });
        // Check if a user already exists with the given Google ID.

        if (!user) {
          user = new User({
            username: profile.displayName,
            // Use the Google profile name as the username.

            googleId: profile.id,
            // Store the Google ID.
          });
          await user.save();
          // Save the new user to the database.
        }
        return cb(null, user);
        // Return the user object to Passport.
      } catch (err) {
        return cb(err);
        // Handle any errors during authentication.
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user.id);
  // Serialize the user ID into the session.
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    // Find the user by ID from the database.

    done(null, user);
    // Deserialize the user and pass the user object.
  } catch (err) {
    done(err);
    // Handle any errors during deserialization.
  }
});

// Middleware to check if a user is authenticated
const isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
    // If authenticated, proceed to the next middleware/route handler.
  }
  res.redirect("/login");
  // If not authenticated, redirect to the login page.
};

// Routes

// Google authentication routes
app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile"] })
  // Initiates Google authentication and requests the user's profile.
);

app.get(
  "/auth/google/success",
  passport.authenticate("google", {
    successRedirect: "/compose",
    // Redirect to `/compose` on successful authentication.

    failureRedirect: "/login",
    // Redirect to `/login` on authentication failure.
  })
);

// Registration routes
app
  .route("/register")
  .get((req, res) => {
    res.render("Register", {
      title: "Register",
      year: new Date().getFullYear(),
    });
    // Render the registration page.
  })
  .post(async (req, res) => {
    const { username, password } = req.body;
    // Extract username and password from the request body.

    try {
      const salt = await bcrypt.genSalt(10);
      // Generate a salt for hashing.

      const hash = await bcrypt.hash(password, salt);
      // Hash the password with the salt.

      const newUser = new User({ username, password: hash });
      // Create a new user with the hashed password.

      await newUser.save();
      // Save the user to the database.

      res.redirect("/login");
      // Redirect to the login page after successful registration.
    } catch (err) {
      res.status(400).json({ error: "User registration failed!" });
      // Send an error response if registration fails.
    }
  });

// Login routes
app
  .route("/login")
  .get((req, res) => {
    res.render("Login", { title: "Login", year: new Date().getFullYear() });
    // Render the login page.
  })
  .post(
    passport.authenticate("local", {
      successRedirect: "/compose",
      // Redirect to `/compose` on successful login.

      failureRedirect: "/login",
      // Redirect back to `/login` on failed login.
    })
  );

// Home route
app.route("/").get((req, res) => {
  res.render("Home", { title: "Home", year: new Date().getFullYear() });
  // Render the home page.
});

// Compose route
app
  .route("/compose")
  .get(isAuthenticated, (req, res) => {
    res.render("Compose", {
      title: "Add New Blog",
      year: new Date().getFullYear(),
    });
    // Render the compose page, only for authenticated users.
  })
  .post(isAuthenticated, async (req, res) => {
    const { title, content } = req.body;
    // Extract blog title and content from the request body.

    try {
      const newBlog = new Blog({ title, content });
      // Create a new blog post.

      await newBlog.save();
      // Save the blog post to the database.

      res.redirect("/blogs");
      // Redirect to the blogs page.
    } catch (err) {
      res.status(400).json({ error: "Failed to create blog post!" });
      // Send an error response if saving fails.
    }
  });

// Blogs route
app.route("/blogs").get(isAuthenticated, async (req, res) => {
  try {
    const blogs = await Blog.find({});
    // Fetch all blog posts from the database.

    res.render("Blogs", {
      title: "Blogs Page",
      // Set the page title.

      year: new Date().getFullYear(),
      // Pass the current year to the template.

      blogs: blogs.length > 0 ? blogs : "No Blogs Found",
      // If blogs exist, pass them to the template. Otherwise, display "No Blogs Found."
    });
  } catch (err) {
    res.status(400).json({ error: "Failed to fetch blogs!" });
    // Send an error response if fetching fails.
  }
});

// Route to delete a blog post by its ID
app.route("/delete/:deleteId").get(isAuthenticated, async (req, res) => {
  try {
    await Blog.findByIdAndDelete(req.params.deleteId);
    // Delete the blog post with the given ID.

    res.redirect("/blogs");
    // Redirect to the blogs page after deletion.
  } catch (err) {
    res.status(400).json({ error: "Failed to delete blog!" });
    // Send an error response if deletion fails.
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
  // Log a message when the server starts successfully.
});
