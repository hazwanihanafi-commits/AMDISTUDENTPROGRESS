// routes/student.js
import express from "express";
import { readMasterTracking } from "../services/googleSheets.js";

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

    // IMPORTANT:
    // Do NOT compute timeline again.
    // readMasterTracking already produced:
    // student.timeline = { quarters, milestones, status }

    res.render("student", {
      student,
      timeline: student.timeline, // correct!
      imagePath: "/assets/timeline.png", // optional
    });

  } catch (err) {
    console.error("Error in /student route:", err);
    next(err);
  }
});

export default router;
