// public/js/student.js
// Simple status checker: redirect to /student/:matric
// Usage: <input id="matric"> <button onclick="checkStatus()">Check</button>

function checkStatus() {
  const matricInput = document.getElementById("matric");
  const result = document.getElementById("result");

  if (!matricInput) {
    console.error("Element #matric not found in DOM.");
    return;
  }

  const matric = matricInput.value.trim();

  if (!matric) {
    if (result) {
      result.innerHTML = "<span style='color:red;'>Please enter a matric number.</span>";
    } else {
      alert("Please enter a matric number.");
    }
    return;
  }

  // Clear any message and redirect to the student page
  if (result) result.innerHTML = "Opening student progress page...";
  // Use encodeURIComponent to keep URL safe
  window.location.href = `/student/${encodeURIComponent(matric)}`;
}

// Optional: allow Enter key in the input to trigger checkStatus
document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("matric");
  if (input) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        checkStatus();
      }
    });
  }
});
