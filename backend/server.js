require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./app');
const { cleanupExpiredReservations } = require('./utils/cleanup');

const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
    // Run expired reservation cleanup every 30 seconds
    setInterval(cleanupExpiredReservations, 30000);
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });
