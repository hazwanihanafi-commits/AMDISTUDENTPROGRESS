// routes/student.js
import express from "express";
import { readMasterTracking } from "../services/googleSheets.js";
import { computeTimeline } from "../helpers/computeTimeline.js";

const router = express.Router();

router.get("/:matric", async (req, res, next) => {
  try {
    const students = await readMasterTracking(process.env.SHEET_ID);
    const student = students.find((s) => s.matric === req.params.matric);

    if (!student) {
      return res.status(404).send("Student not found");
    }

    // compute timeline from submitted dates
    const extraTimeline = computeTimeline(student);

    res.render("student", {
      student,
      timeline: extraTimeline,
      imagePath: "/assets/timeline.png",
    });
  } catch (err) {
    next(err);
  }
});

export default router;
