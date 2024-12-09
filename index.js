import express from "express";
import bodyParser from "body-parser";
import { v4 as uuidv4 } from "uuid";

const app = express();
const PORT = 3000;

var data = [];

// middlwares
// bodyparser
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.set("view engine", "ejs");

// Routes
// home / root route : "/"
app.route("/").get(function (req, res) {
  res.render("Home", {
    title: "Home",
    year: new Date().getFullYear(),
  });
});

// compose route : "/compose"
app
  .route("/compose")
  .get(function (req, res) {
    res.render("Compose", {
      title: "Compose",
      year: new Date().getFullYear(),
    });
  })
  .post(function (req, res) {
    console.log(req.body);
    data.push({ id: uuidv4(), ...req.body });
    console.log(data);
    res.redirect("/blogs");
  });
// blogs route : "/blogs"
app.route("/blogs").get(function (req, res) {
  res.render("Blogs", {
    blogs: data.length > 0 ? data : "No Blogs Found",
    title: "Blogs",
    year: new Date().getFullYear(),
  });
});

app.listen(PORT, function () {
  console.log("Server started on port :", PORT);
});
