const mongoose = require('mongoose');

const isValidObjectId = (value) =>
  typeof value === 'string' && mongoose.Types.ObjectId.isValid(value);

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

const isSeatNumberArray = (value) =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every((n) => Number.isInteger(n) && n > 0);

module.exports = { isValidObjectId, isNonEmptyString, isSeatNumberArray };
