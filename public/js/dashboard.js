const API_BASE = "https://amdistudentprogress.onrender.com";

// Load Google Charts
google.charts.load('current', { packages: ['corechart'] });
google.charts.setOnLoadCallback(loadDashboardData);

async function loadDashboardData() {
  try {
    const res = await fetch(`${API_BASE}/api/all`);
    const data = await res.json();

    // KPI
    document.getElementById("kpi-total").innerText = data.total || 0;
    document.getElementById("kpi-completed").innerText = data.completed || 0;

    // Chart
    drawChart(data.stages);

  } catch (err) {
    console.error("Dashboard error:", err);
  }
}

function drawChart(stages) {
  var chartData = google.visualization.arrayToDataTable([
    ["Stage", "Count"],
    ["P1 Submitted", stages.P1 || 0],
    ["P3 Submitted", stages.P3 || 0],
    ["P4 Submitted", stages.P4 || 0],
    ["P5 Submitted", stages.P5 || 0]
  ]);

  var options = {
    title: "Submission Counts by Stage",
    pieHole: 0.4,
    colors: ["#4b2e83", "#ffb81c", "#0f4c81", "#0f9aa3"]
  };

  var chart = new google.visualization.PieChart(document.getElementById("chart_div"));
  chart.draw(chartData, options);
}
