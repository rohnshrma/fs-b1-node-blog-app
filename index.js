import express from "express";
import mongoose from "mongoose";
import bodyParser from "body-parser";
import { config as configDotenv } from "dotenv";
import connectDB from "./utils/connection.js";
import bcrypt from "bcryptjs";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import twilio from "twilio";
import { isValidPhoneNumber } from "libphonenumber-js";

configDotenv(); // Load environment variables from .env file

// Initialize Express application
const app = express();
const PORT = 3000;

// Twilio Configuration
const OTP_STORE = {}; // Temporary storage for OTP (for demo, consider DB or session in production)
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Middleware Setup
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json()); // For parsing JSON bodies
app.use(express.static("public"));
app.set("view engine", "ejs");

// Session and Passport Setup
app.use(
  session({
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 }, // 30 days
  })
);
app.use(passport.initialize());
app.use(passport.session());

// Database Connection
connectDB();

// Mongoose Schemas and Models
const blogSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, minLength: 20 },
    content: { type: String, required: true, minLength: 100 },
  },
  { timestamps: true }
);

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true },
    password: String,
    googleId: { type: String, unique: true },
    phone: { type: String, required: true },
    isPhoneVerified: { type: Boolean, default: false }, // Track phone verification
  },
  { timestamps: true }
);

const Blog = mongoose.model("Blog", blogSchema);
const User = mongoose.model("User", userSchema);

// Passport Strategies
passport.use(
  new LocalStrategy(async (username, password, done) => {
    try {
      const user = await User.findOne({ username });
      if (!user) return done(null, false, { message: "Incorrect username." });

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch)
        return done(null, false, { message: "Incorrect password." });

      return done(null, user);
    } catch (err) {
      return done(err);
    }
  })
);

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, cb) => {
      try {
        let user = await User.findOne({ googleId: profile.id });
        if (!user) {
          user = new User({
            username: profile.displayName,
            googleId: profile.id,
          });
          await user.save();
        }
        return cb(null, user);
      } catch (err) {
        return cb(err);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});

// Twilio OTP Routes
app.post("/send-otp", async (req, res) => {
  const { phone, username, password } = req.body;
  if (!phone || !username || !password) {
    return res.status(400).json({ error: "All fields are required" });
  }

  // Generate OTP
  const otp = Math.floor(100000 + Math.random() * 900000);

  try {
    // Save user data temporarily (in memory)
    OTP_STORE[phone] = { otp, username, password };

    // Send OTP via Twilio
    await client.messages.create({
      body: `Your OTP for registration is: ${otp}`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone,
    });

    // Redirect to OTP verification page with phone number
    res.redirect(`/verify-otp?phone=${phone}`);
  } catch (err) {
    res.status(500).json({ error: "Failed to send OTP", details: err.message });
  }
});

app.get("/verify-otp", (req, res) => {
  const phone = req.query.phone;
  if (!phone) {
    return res.status(400).json({ error: "Phone number is required" });
  }
  res.render("Verification", {
    title: "Verify OTP",
    year: new Date().getFullYear(),
    phone,
  });
});

app.post("/verify-otp", async (req, res) => {
  const { phone, otp } = req.body;

  if (!phone || !otp) {
    return res.status(400).json({ error: "Phone and OTP are required" });
  }

  // Check if the OTP matches
  if (OTP_STORE[phone] && OTP_STORE[phone].otp === otp) {
    // Create the user after OTP is verified
    const { username, password } = OTP_STORE[phone];
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    const newUser = new User({ username, password: hash, phone });
    await newUser.save();

    // Remove OTP from the store after successful verification
    delete OTP_STORE[phone];

    res.status(200).json({ message: "User registered successfully" });
  } else {
    res.status(400).json({ error: "Invalid OTP" });
  }
});

// Authentication Middleware
const isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) return next();
  res.redirect("/login");
};

// Routes
app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile"] })
);

app.get(
  "/auth/google/success",
  passport.authenticate("google", {
    successRedirect: "/compose",
    failureRedirect: "/login",
  })
);

app
  .route("/register")
  .get((req, res) => {
    if (!req.session.isPhoneVerified) {
      return res.redirect("/verify-phone"); // Redirect to phone verification if not verified
    }
    res.render("Register", {
      title: "Register",
      year: new Date().getFullYear(),
    });
  })
  .post(async (req, res) => {
    const { username, password, phone } = req.body;

    if (!req.session.isPhoneVerified) {
      return res.status(400).json({ error: "Phone number not verified" });
    }

    try {
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(password, salt);

      const newUser = new User({
        username,
        password: hash,
        phone,
        isPhoneVerified: true,
      });
      await newUser.save();
      res.redirect("/login");
    } catch (err) {
      if (err.code === 11000) {
        return res.status(400).json({ error: "Username already exists!" });
      }
      res.status(400).json({ error: "User registration failed!" });
    }
  });

app
  .route("/login")
  .get((req, res) =>
    res.render("Login", { title: "Login", year: new Date().getFullYear() })
  )
  .post(
    passport.authenticate("local", {
      successRedirect: "/compose",
      failureRedirect: "/login",
    })
  );

app.route("/").get((req, res) => {
  res.render("Home", { title: "Home", year: new Date().getFullYear() });
});

app
  .route("/compose")
  .get(isAuthenticated, (req, res) => {
    res.render("Compose", {
      title: "Add New Blog",
      year: new Date().getFullYear(),
    });
  })
  .post(isAuthenticated, async (req, res) => {
    const { title, content } = req.body;
    try {
      const newBlog = new Blog({ title, content });
      await newBlog.save();
      res.redirect("/blogs");
    } catch (err) {
      res.status(400).json({ error: "Failed to create blog post!" });
    }
  });

app.route("/blogs").get(isAuthenticated, async (req, res) => {
  try {
    const blogs = await Blog.find({});
    res.render("Blogs", {
      title: "Blogs Page",
      year: new Date().getFullYear(),
      blogs: blogs.length > 0 ? blogs : "No Blogs Found",
    });
  } catch (err) {
    res.status(400).json({ error: "Failed to fetch blogs!" });
  }
});

app.route("/delete/:deleteId").get(isAuthenticated, async (req, res) => {
  try {
    await Blog.findByIdAndDelete(req.params.deleteId);
    res.redirect("/blogs");
  } catch (err) {
    res.status(400).json({ error: "Failed to delete blog!" });
  }
});

// Start Server
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
