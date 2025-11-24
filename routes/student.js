// routes/student.js
import express from "express";
import { readMasterTracking } from "../services/googleSheets.js";

const router = express.Router();

/**
 * GET /student/:matric
 * Loads a single student's data from Google Sheets,
 * computes their timeline + progress, and renders student.ejs
 */
router.get("/:matric", async (req, res) => {
  try {
    const matric = String(req.params.matric || "").trim();

    // Load all students
    const students = await readMasterTracking(process.env.SHEET_ID);

    // Find student
    const student = students.find(
      (s) => String(s.matric).trim() === matric
    );

    if (!student) {
      return res.status(404).send("Student not found");
    }

    // Render the student profile page using student.timeline directly
    res.render("student", {
      student
    });

  } catch (err) {
    console.error("ERROR in /student/:matric →", err);
    res.status(500).send("Internal Server Error");
  }
});

export default router;
