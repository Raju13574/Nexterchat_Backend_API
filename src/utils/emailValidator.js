const dotenv = require('dotenv');
dotenv.config();

const ALLOWED_DOMAINS = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com']; // Common email domains

function isValidUserDomain(email) {
  const domain = email.split('@')[1];
  return ALLOWED_DOMAINS.includes(domain.toLowerCase());
}

module.exports = { isValidUserDomain };