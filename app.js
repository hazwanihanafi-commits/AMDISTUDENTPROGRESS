import express from "express";
import indexRouter from "./routes/index.js";
import apiRouter from "./routes/api.js";
import studentRouter from "./routes/student.js";
import authRouter from "./routes/auth.js";


const app = express();
app.set("views", "./views");
app.set("view engine", "ejs");


app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));


// Register routes
app.use("/", authRouter); // login routes first
app.use("/", indexRouter);
app.use("/api", apiRouter);
app.use("/student", studentRouter);


// 404
app.use((req, res) => res.status(404).send('Page Not Found'));


export default app;
