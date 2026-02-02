const { logger } = require('@librechat/data-schemas');
const { CacheKeys } = require('librechat-data-provider');
const { loadDefaultModels, loadConfigModels } = require('~/server/services/Config');
const { getLogStores } = require('~/cache');

/**
 * @param {ServerRequest} req
 * @param {Object} options
 * @param {boolean} [options.includeDetails=false] - Whether to include model parameter details.
 * @returns {Promise<TModelsConfig|{models: TModelsConfig, modelDetails: Record<string, TModelDetails>}>} The models config.
 */
const getModelsConfig = async (req, options = {}) => {
  const { includeDetails = false } = options;
  const cacheKey = includeDetails ? CacheKeys.MODELS_CONFIG + '_details' : CacheKeys.MODELS_CONFIG;
  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  let modelsConfig = await cache.get(cacheKey);
  if (!modelsConfig) {
    modelsConfig = await loadModels(req, options);
  }

  return modelsConfig;
};

/**
 * Loads the models from the config.
 * @param {ServerRequest} req - The Express request object.
 * @param {Object} options
 * @param {boolean} [options.includeDetails=false] - Whether to include model parameter details.
 * @returns {Promise<TModelsConfig|{models: TModelsConfig, modelDetails: Record<string, TModelDetails>}>} The models config.
 */
async function loadModels(req, options = {}) {
  const { includeDetails = false } = options;
  const cacheKey = includeDetails ? CacheKeys.MODELS_CONFIG + '_details' : CacheKeys.MODELS_CONFIG;
  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  const cachedModelsConfig = await cache.get(cacheKey);
  if (cachedModelsConfig) {
    return cachedModelsConfig;
  }

  const defaultModelsConfig = await loadDefaultModels(req);

  if (includeDetails) {
    const customResult = await loadConfigModels(req, { includeDetails: true });
    const modelConfig = {
      models: { ...defaultModelsConfig, ...customResult.models },
      modelDetails: customResult.modelDetails || {},
    };
    await cache.set(cacheKey, modelConfig);
    return modelConfig;
  }

  const customModelsConfig = await loadConfigModels(req);
  const modelConfig = { ...defaultModelsConfig, ...customModelsConfig };

  await cache.set(cacheKey, modelConfig);
  return modelConfig;
}

async function modelController(req, res) {
  try {
    const includeDetails = req.query.includeDetails === 'true';
    const modelConfig = await loadModels(req, { includeDetails });
    res.send(modelConfig);
  } catch (error) {
    logger.error('Error fetching models:', error);
    res.status(500).send({ error: error.message });
  }
}

module.exports = { modelController, loadModels, getModelsConfig };
