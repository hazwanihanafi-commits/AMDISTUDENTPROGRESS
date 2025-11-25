// app.js
import express from "express";
import session from "express-session";

import indexRouter from "./routes/index.js";
import apiRouter from "./routes/api.js";
import studentRouter from "./routes/student.js";
import authRouter from "./routes/auth.js";
import dashboardRouter from "./routes/dashboard.js";

const app = express();   // ✅ MUST COME FIRST

// =======================
//  VIEW ENGINE
// =======================
app.set("views", "./views");
app.set("view engine", "ejs");

// =======================
//  MIDDLEWARES
// =======================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// ✅ Correct session initialization (only ONCE)
app.use(
  session({
    secret: "supersecretkey123",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Render uses HTTP
  })
);

// =======================
//  ROUTES ORDER
// =======================
app.use("/", authRouter);        // Login first
app.use("/", indexRouter);
app.use("/", dashboardRouter);   // Dashboard AFTER login check
app.use("/api", apiRouter);
app.use("/student", studentRouter);

// =======================
//  404 HANDLER
// =======================
app.use((req, res) => {
  res.status(404).send("Page Not Found");
});

export default app;
