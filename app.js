import express from "express";
import authRouter from "./routes/auth.js";
import indexRouter from "./routes/index.js";
import apiRouter from "./routes/api.js";
import studentRouter from "./routes/student.js";

const app = express();

app.set("views", "./views");
app.set("view engine", "ejs");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use("/", authRouter);
app.use("/", indexRouter);
app.use("/api", apiRouter);       // <-- VERY IMPORTANT
app.use("/student", studentRouter);

app.use((req, res) => {
  res.status(404).send("Page Not Found");
});

export default app;
