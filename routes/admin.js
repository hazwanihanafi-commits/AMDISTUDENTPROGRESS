// routes/admin.js
import express from "express";
import { readMasterTracking } from "../services/googleSheets.js";
import { requireLogin } from "../middleware/auth.js";

const router = express.Router();

// Admin dashboard
router.get("/admin", requireLogin, async (req, res) => {
  try {
    const students = await readMasterTracking(process.env.SHEET_ID);

    res.render("dashboard-admin", {
      user: req.session.user,
      students
    });

  } catch (err) {
    console.error("ADMIN ERROR:", err);
    res.status(500).send("Server Error (Admin)");
  }
});

export default router;
