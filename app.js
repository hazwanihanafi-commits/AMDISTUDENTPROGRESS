// app.js
import express from "express";
import session from "express-session";

import authRouter from "./routes/auth.js";
import indexRouter from "./routes/index.js";
import apiRouter from "./routes/api.js";
import studentRouter from "./routes/student.js";
import adminRouter from "./routes/admin.js";

// ... earlier setup ...
app.use("/api", apiRouter);     // existing

const app = express();

// ----------------------------
// View Engine
// ----------------------------
app.set("views", "./views");
app.set("view engine", "ejs");

// ----------------------------
// Middlewares
// ----------------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(
  session({
    secret: "supersecretkey123",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }, // Render uses HTTP, not HTTPS
  })
);

// ----------------------------
// ROUTES (VERY IMPORTANT ORDER)
// ----------------------------

// 1️⃣ Auth first (login, logout)
app.use("/", authRouter);

// 2️⃣ Admin dashboard (protected)
app.use("/admin", adminRouter);

// 3️⃣ API
app.use("/api", apiRouter);

// 4️⃣ Student pages
app.use("/student", studentRouter);

// 5️⃣ Homepage
app.use("/", indexRouter);

// ----------------------------
// 404
// ----------------------------
app.use((req, res) => {
  res.status(404).send("Page Not Found");
});

export default app;
