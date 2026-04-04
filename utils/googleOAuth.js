const fs = require("fs");
const path = require("path");

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function readGoogleSecretFile(secretPath) {
  if (!secretPath) return null;

  try {
    const resolvedPath = path.resolve(secretPath);
    if (!fs.existsSync(resolvedPath)) return null;

    const raw = fs.readFileSync(resolvedPath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed.web || parsed.installed || null;
  } catch (error) {
    console.warn(`Unable to read Google OAuth config file at ${secretPath}: ${error.message}`);
    return null;
  }
}

function resolveBaseUrl(fileConfig) {
  const explicitBase =
    process.env.GOOGLE_CALLBACK_BASE_URL ||
    process.env.APP_BASE_URL ||
    process.env.RENDER_EXTERNAL_URL;

  if (explicitBase && explicitBase.trim()) {
    return trimTrailingSlash(explicitBase.trim());
  }

  const fileRedirect = fileConfig?.redirect_uris?.[0];
  if (fileRedirect) {
    return trimTrailingSlash(fileRedirect);
  }

  return `http://localhost:${process.env.PORT || "3000"}`;
}

function getGoogleOAuthConfig() {
  const fileConfig = readGoogleSecretFile(process.env.GOOGLE_OAUTH_CONFIG_PATH);

  const clientId = (process.env.GOOGLE_ID || fileConfig?.client_id || "").trim();
  const clientSecret = (process.env.GOOGLE_SECRET || fileConfig?.client_secret || "").trim();

  const explicitCallback =
    process.env.GOOGLE_CALLBACK_URL ||
    process.env.GOOGLE_REDIRECT_URI ||
    "";

  const callbackURL = explicitCallback.trim() || `${resolveBaseUrl(fileConfig)}/auth/google/callback`;

  return {
    enabled: Boolean(clientId && clientSecret && callbackURL),
    clientId,
    clientSecret,
    callbackURL,
  };
}

module.exports = {
  getGoogleOAuthConfig,
};
