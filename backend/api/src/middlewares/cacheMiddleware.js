// Declare cache variables globally OUTSIDE the middleware function
// This memory stays warm across serverless requests!
let cachedSettings = null;
let cacheExpiry = 0;

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export const loadGlobalSettings = async (req, res, next) => {
  const now = Date.now();

  // 1. If cache is fresh, attach it to the request object and move on
  if (cachedSettings && now < cacheExpiry) {
    req.siteSettings = cachedSettings;
    return next();
  }

  // 2. Cache Miss: Fetch fresh data from DynamoDB
  try {
    // Replace "Setting" with your actual imported OneTable Model instance
    const globalConfig = await Setting.get({ key: 'GLOBAL' });
    
    const settingsData = globalConfig ? JSON.parse(globalConfig.value) : {};

    // 3. Save to global variables for the next warm Express requests
    cachedSettings = settingsData;
    cacheExpiry = now + CACHE_TTL_MS;

    // 4. Attach to the request object
    req.siteSettings = cachedSettings;
    next();
  } catch (error) {
    console.error('Failed to reload site settings:', error);
    
    // Fallback: If DynamoDB is down, use stale cache data if available
    if (cachedSettings) {
      req.siteSettings = cachedSettings;
      return next();
    }
    
    res.status(500).json({ error: 'Failed to load system configurations' });
  }
};
