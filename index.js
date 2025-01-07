import express from "express";
import mongoose, { mongo } from "mongoose";
import bodyParser from "body-parser";
import { configDotenv } from "dotenv";
import connectDB from "./utils/connection.js";
import bcrypt from "bcryptjs";

configDotenv();
const app = express();
const PORT = 3000;

connectDB();

// schema
// blog schema
const blogSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, minLength: 20 },
    content: { type: String, required: true, minLength: 100 },
  },
  {
    timestamps: true,
  }
);

// userschema
const userschema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true, minLength: 8 },
  },
  { timestamps: true }
);

// model | collection
const Blog = mongoose.model("Blog", blogSchema);
const User = mongoose.model("User", userschema);

// bodyparser
app.use(bodyParser.urlencoded({ extended: true }));
// static files
app.use(express.static("public"));
// set view engine
app.set("view engine", "ejs");

// ROUTES

// register
app
  .route("/register")
  .get(function (req, res) {
    res.render("Register", {
      title: "Register",
      year: new Date().getFullYear(),
    });
  })
  .post(async (req, res) => {
    const { username, password } = req.body;

    try {
      var salt = await bcrypt.genSalt(10);
      var hash = await bcrypt.hash(password, salt);

      const newuser = new User({
        username: username,
        password: hash,
      });

      await newuser.save();

      console.log(newuser);
      res.redirect("/compose");
    } catch (err) {
      return res.status(400).json({ error: err });
    }
  });

// LOGIN ROUTE
app
  .route("/login")
  .get(function (req, res) {
    res.render("Login", {
      title: "Login",
      year: new Date().getFullYear(),
    });
  })
  .post(async (req, res) => {
    const { username, password } = req.body;

    try {
      const existingUser = await User.findOne({ username: username });
      if (!existingUser) {
        return res.status(404).json({ error: "User Not Found" });
      }
      var result = await bcrypt.compare(password, existingUser.password);
      if (!result) {
        return res.status(400).json({ error: "Incorrect Password" });
      }
      res.redirect("/compose");
    } catch (err) {
      return res.status(400).json({ error: err });
    }
  });

// HOME : ROOT : "/"
app.route("/").get(function (req, res) {
  res.render("Home", {
    title: "Home",
    year: new Date().getFullYear(),
  });
});
// Compose route : "/compose"
app
  .route("/compose")
  .get(function (req, res) {
    res.render("Compose", {
      title: "Add New Blog",
      year: new Date().getFullYear(),
    });
  })
  .post(async function (req, res) {
    // creating a new mongodb doc | item

    // console.log(req.body);

    const { title, content } = req.body;

    const newBlog = new Blog({ title, content });

    try {
      await newBlog.save();
      console.log("added blog : ", newBlog);
      res.redirect("/blogs");
    } catch (err) {
      res
        .json({
          error: err,
          message: "Something went wrong while creating new blog",
        })
        .status(400);
    }
  });

// BLOGS : "/blogs"
app.route("/blogs").get(async function (req, res) {
  let foundBlogs;

  try {
    foundBlogs = await Blog.find({});
    res.render("Blogs", {
      title: "Blogs Page",
      year: new Date().getFullYear(),
      blogs: foundBlogs.length > 0 ? foundBlogs : "No Blogs Found",
    });
  } catch (err) {
    res
      .json({
        error: err,
        message: "Something went wrong while fetching blogs from db",
      })
      .status(400);
  }
});

app.route("/delete/:deleteId").get(async function (req, res) {
  const deleteId = req.params.deleteId;

  try {
    const deletedBlog = await Blog.findByIdAndDelete(deleteId);
    console.log("Deleted Blog =>", deletedBlog);
    res.redirect("/blogs");
  } catch (err) {
    res
      .json({
        error: err,
        message: "Something went wrong while fetching blogs from db",
      })
      .status(400);
  }
});

app.listen(PORT, function () {
  console.log("Server started on port ", PORT);
});
