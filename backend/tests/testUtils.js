require('dotenv').config();

process.env.MONGODB_URI = process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/sortmyscene_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret';
if (process.env.DISABLE_RATE_LIMIT === undefined) {
  process.env.DISABLE_RATE_LIMIT = 'true';
}

const mongoose = require('mongoose');
const app = require('../app');

async function connectTestDB() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI);
  }
}

async function clearTestDB() {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
}

async function disconnectTestDB() {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}

module.exports = { app, connectTestDB, clearTestDB, disconnectTestDB };
