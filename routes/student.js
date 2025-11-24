// routes/student.js
import express from "express";
import { readMasterTracking } from "../services/googleSheets.js";
import { computeTimeline } from "../helpers/computeTimeline.js";

const router = express.Router();

router.get("/:matric", async (req, res, next) => {
  try {
    // Load all students
    const students = await readMasterTracking(process.env.SHEET_ID);

    // Find student by matric number
    const student = students.find(
      (s) => String(s.matric).trim() === String(req.params.matric).trim()
    );

    if (!student) {
      return res.status(404).send("Student not found");
    }

    // Compute additional timeline (actual submission dates)
    const timelineExtra = computeTimeline(student);

    // Pass timelineExtra + student.timeline (expected timeline)
    res.render("student", {
      student,
      timeline: timelineExtra,
      imagePath: "/assets/timeline.png",
    });
  } catch (err) {
    console.error("Error in /student route:", err);
    next(err);
  }
});

export default router;
