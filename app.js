// app.js
import express from "express";
import session from "express-session";

import indexRouter from "./routes/index.js";
import apiRouter from "./routes/api.js";
import studentRouter from "./routes/student.js";
import authRouter from "./routes/auth.js";
import dashboardRouter from "./routes/dashboard.js";

const app = express();

// View engine
app.set("views", "./views");
app.set("view engine", "ejs");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// Session (ONLY ONCE)
app.use(
  session({
    secret: "supersecretkey123",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
  })
);

// ROUTES – ORDER IS IMPORTANT
app.use("/", authRouter);         // login routes
app.use("/", indexRouter);        // homepage
app.use("/dashboard", dashboardRouter); // protected pages
app.use("/api", apiRouter);       // internal api
app.use("/student", studentRouter);

// 404 fallback
app.use((req, res) => {
  res.status(404).send("Page Not Found");
});

export default app;
