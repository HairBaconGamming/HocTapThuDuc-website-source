const crypto = require('crypto');

const generatedSecrets = new Map();

function getEnvSecret(name) {
  const value = process.env[name] && process.env[name].trim();
  return value || '';
}

function getSecret(name, { allowGeneratedInDev = false } = {}) {
  const value = getEnvSecret(name);
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
  const sessionSecret = getEnvSecret('SESSION_SECRET');
  if (sessionSecret) return sessionSecret;

  const jwtSecret = getEnvSecret('JWT_SECRET');
  if (jwtSecret) {
    console.warn('SESSION_SECRET is missing; falling back to JWT_SECRET. Set SESSION_SECRET explicitly to use a separate session secret.');
    return jwtSecret;
  }

  return getSecret('SESSION_SECRET', { allowGeneratedInDev: true });
}

function getJwtSecret() {
  const jwtSecret = getEnvSecret('JWT_SECRET');
  if (jwtSecret) return jwtSecret;

  const sessionSecret = getEnvSecret('SESSION_SECRET');
  if (sessionSecret) {
    console.warn('JWT_SECRET is missing; falling back to SESSION_SECRET. Set JWT_SECRET explicitly to use a separate JWT signing secret.');
    return sessionSecret;
  }

  return getSecret('JWT_SECRET', { allowGeneratedInDev: true });
}

module.exports = {
  getSessionSecret,
  getJwtSecret,
};
