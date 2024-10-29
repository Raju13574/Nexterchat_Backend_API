const CustomError = require('../utils/CustomError');

module.exports = (err, req, res, next) => {
  console.error(err);

  if (err instanceof CustomError) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  res.status(500).json({ error: 'An unexpected error occurred' });
};