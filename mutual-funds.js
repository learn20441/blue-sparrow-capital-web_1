async function loadPlan() {
  try {
    const res = await fetch('/api/plan');
    const data = await res.json();

    // Show summary only
    document.getElementById('plan-summary').innerHTML = `
      <h2>${data.summary.title}</h2>
      <p>${data.summary.description}</p>
      <ul>
        ${data.summary.highlights.map(h => `<li>${h}</li>`).join('')}
      </ul>
    `;

    // PDF download
    document.getElementById('download-pdf').addEventListener('click', () => {
      window.open('/api/plan/pdf', '_blank');
    });
  } catch (err) {
    console.error('Error loading plan:', err);
  }
}

loadPlan();
