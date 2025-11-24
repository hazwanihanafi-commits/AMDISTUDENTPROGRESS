import express from "express";
import indexRouter from "./routes/index.js";
import apiRouter from "./routes/api.js";
import studentRouter from "./routes/student.js";

const app = express();

// View engine
app.set("views", "./views");
app.set("view engine", "ejs");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// ROUTES
app.use("/", indexRouter);
app.use("/api", apiRouter);
app.use("/student", studentRouter);   // <-- ONLY ONCE

// 404 handler
app.use((req, res, next) => {
  res.status(404).send("Page Not Found");
});

// Error handler
app.use((err, req, res, next) => {
  console.error("ERROR:", err);
  res.status(err.status || 500);
  res.render("error");
});

export default app;
