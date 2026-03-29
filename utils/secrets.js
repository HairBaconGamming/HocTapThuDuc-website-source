const crypto = require('crypto');

const generatedSecrets = new Map();

function getSecret(name, { allowGeneratedInDev = false } = {}) {
  const value = process.env[name] && process.env[name].trim();
  if (value) return value;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  if (!allowGeneratedInDev) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  if (!generatedSecrets.has(name)) {
    generatedSecrets.set(name, crypto.randomBytes(32).toString('hex'));
    console.warn(`Using generated ${name} for this process because the environment variable is missing.`);
  }

  return generatedSecrets.get(name);
}

function getSessionSecret() {
  return getSecret('SESSION_SECRET', { allowGeneratedInDev: true });
}

function getJwtSecret() {
  return getSecret('JWT_SECRET', { allowGeneratedInDev: true });
}

module.exports = {
  getSessionSecret,
  getJwtSecret,
};
