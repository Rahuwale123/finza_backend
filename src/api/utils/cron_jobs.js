const cron = require('node-cron');
const prisma = require('../../config/db');

const initCronJobs = () => {
  // Run every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    console.log('[CRON] Cleaning up expired OTPs...');
    try {
      const deleted = await prisma.otp.deleteMany({
        where: {
          expiresAt: { lt: new Date() }
        }
      });
      console.log(`[CRON] Deleted ${deleted.count} expired OTPs.`);
    } catch (error) {
      console.error('[CRON] Error cleaning up OTPs:', error);
    }
  });
};

module.exports = initCronJobs;
