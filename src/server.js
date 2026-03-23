require('dotenv').config();
const app = require('./app');
const initCronJobs = require('./api/utils/cron_jobs');

// Initialize Cron Jobs
initCronJobs();

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
