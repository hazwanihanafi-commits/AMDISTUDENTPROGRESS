import express from "express";
import indexRouter from "./routes/index.js";
import apiRouter from "./routes/api.js";
import studentRouter from "./routes/student.js";

const app = express();

app.set("views", "./views");
app.set("view engine", "ejs");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// ROUTES
app.use("/", indexRouter);
app.use("/api", apiRouter);
app.use("/student", studentRouter);

export default app;
