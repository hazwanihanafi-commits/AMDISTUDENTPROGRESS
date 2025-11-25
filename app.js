import express from "express";
import session from "express-session";

import indexRouter from "./routes/index.js";
import apiRouter from "./routes/api.js";
import studentRouter from "./routes/student.js";
import authRouter from "./routes/auth.js";

const app = express();

// Views
app.set("views", "./views");
app.set("view engine", "ejs");

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(
  session({
    secret: "supersecret",
    resave: false,
    saveUninitialized: true
  })
);

// Routes
app.use("/", authRouter);     // Login BEFORE index
app.use("/", indexRouter);
app.use("/api", apiRouter);
app.use("/student", studentRouter);

// 404
app.use((req, res) => {
  res.status(404).send("Page Not Found");
});

export default app;
