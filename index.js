import express from "express";
import mongoose from "mongoose";
import bodyParser from "body-parser";
import { configDotenv } from "dotenv";
import connectDB from "./utils/connection.js";
import bcrypt from "bcryptjs";
import session from "express-session";
import passport from "passport";
import LocalStrategy from "passport-local";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";

configDotenv();
const app = express();
const PORT = 3000;

connectDB();

// Schemas
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
  },
  { timestamps: true }
);

const Blog = mongoose.model("Blog", blogSchema);
const User = mongoose.model("User", userSchema);

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.set("view engine", "ejs");

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

// Passport Local Strategy
passport.use(
  new LocalStrategy(async (username, password, done) => {
    try {
      const user = await User.findOne({ username });
      if (!user) {
        return done(null, false, { message: "Incorrect username." });
      }
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return done(null, false, { message: "Incorrect password." });
      }
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  })
);

// google oauth 2.0 strategy

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
          return cb(null, user);
        }
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

// Middleware to check authentication
const isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
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
    res.render("Register", {
      title: "Register",
      year: new Date().getFullYear(),
    });
  })
  .post(async (req, res) => {
    const { username, password } = req.body;
    try {
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(password, salt);

      const newUser = new User({ username, password: hash });
      await newUser.save();

      res.redirect("/login"); // Redirect to login instead of compose
    } catch (err) {
      res.status(400).json({ error: "User registration failed!" });
    }
  });

app
  .route("/login")
  .get((req, res) => {
    res.render("Login", { title: "Login", year: new Date().getFullYear() });
  })
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

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
