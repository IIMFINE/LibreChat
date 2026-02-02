const { isUserProvided, fetchModels, fetchModelsWithDetails } = require('@librechat/api');
const {
  EModelEndpoint,
  extractEnvVariable,
  normalizeEndpointName,
} = require('librechat-data-provider');
const { getAppConfig } = require('./app');

/**
 * Load config endpoints from the cached configuration object
 * @function loadConfigModels
 * @param {ServerRequest} req - The Express request object.
 * @param {Object} options - Options for loading models.
 * @param {boolean} [options.includeDetails=false] - Whether to include model parameter details.
 * @returns {Promise<Object>} The models config, optionally with modelDetails.
 */
async function loadConfigModels(req, options = {}) {
  const { includeDetails = false } = options;
  const appConfig = await getAppConfig({ role: req.user?.role });
  if (!appConfig) {
    return includeDetails ? { models: {}, modelDetails: {} } : {};
  }
  const modelsConfig = {};
  /** @type {Record<string, import('librechat-data-provider').TModelDetails>} */
  const allModelDetails = {};

  const azureConfig = appConfig.endpoints?.[EModelEndpoint.azureOpenAI];
  const { modelNames } = azureConfig ?? {};

  if (modelNames && azureConfig) {
    modelsConfig[EModelEndpoint.azureOpenAI] = modelNames;
  }

  if (azureConfig?.assistants && azureConfig.assistantModels) {
    modelsConfig[EModelEndpoint.azureAssistants] = azureConfig.assistantModels;
  }

  if (!Array.isArray(appConfig.endpoints?.[EModelEndpoint.custom])) {
    return includeDetails ? { models: modelsConfig, modelDetails: allModelDetails } : modelsConfig;
  }

  const customEndpoints = appConfig.endpoints[EModelEndpoint.custom].filter(
    (endpoint) =>
      endpoint.baseURL &&
      endpoint.apiKey &&
      endpoint.name &&
      endpoint.models &&
      (endpoint.models.fetch || endpoint.models.default),
  );

  /**
   * @type {Record<string, Promise<string[]|{models: string[], modelDetails: Record<string, any>}>>}
   * Map for promises keyed by unique combination of baseURL and apiKey */
  const fetchPromisesMap = {};
  /**
   * @type {Record<string, string[]>}
   * Map to associate unique keys with endpoint names; note: one key may can correspond to multiple endpoints */
  const uniqueKeyToEndpointsMap = {};
  /**
   * @type {Record<string, Partial<TEndpoint>>}
   * Map to associate endpoint names to their configurations */
  const endpointsMap = {};

  for (let i = 0; i < customEndpoints.length; i++) {
    const endpoint = customEndpoints[i];
    const { models, name: configName, baseURL, apiKey, headers: endpointHeaders } = endpoint;
    const name = normalizeEndpointName(configName);
    endpointsMap[name] = endpoint;

    const API_KEY = extractEnvVariable(apiKey);
    const BASE_URL = extractEnvVariable(baseURL);

    const uniqueKey = `${BASE_URL}__${API_KEY}`;

    modelsConfig[name] = [];

    if (models.fetch && !isUserProvided(API_KEY) && !isUserProvided(BASE_URL)) {
      const fetchFn = includeDetails ? fetchModelsWithDetails : fetchModels;
      fetchPromisesMap[uniqueKey] =
        fetchPromisesMap[uniqueKey] ||
        fetchFn({
          name,
          apiKey: API_KEY,
          baseURL: BASE_URL,
          user: req.user.id,
          userObject: req.user,
          headers: endpointHeaders,
          direct: endpoint.directEndpoint,
          userIdQuery: models.userIdQuery,
        });
      uniqueKeyToEndpointsMap[uniqueKey] = uniqueKeyToEndpointsMap[uniqueKey] || [];
      uniqueKeyToEndpointsMap[uniqueKey].push(name);
      continue;
    }

    if (Array.isArray(models.default)) {
      modelsConfig[name] = models.default.map((model) =>
        typeof model === 'string' ? model : model.name,
      );
    }
  }

  const fetchedData = await Promise.all(Object.values(fetchPromisesMap));
  const uniqueKeys = Object.keys(fetchPromisesMap);

  for (let i = 0; i < fetchedData.length; i++) {
    const currentKey = uniqueKeys[i];
    const data = fetchedData[i];
    const associatedNames = uniqueKeyToEndpointsMap[currentKey];

    for (const name of associatedNames) {
      const endpoint = endpointsMap[name];

      if (includeDetails && data && typeof data === 'object' && 'models' in data) {
        // fetchModelsWithDetails returns { models, modelDetails }
        const { models: modelList, modelDetails } = data;
        modelsConfig[name] = !modelList?.length ? (endpoint.models.default ?? []) : modelList;
        // Merge model details
        if (modelDetails) {
          Object.assign(allModelDetails, modelDetails);
        }
      } else {
        // fetchModels returns string[]
        modelsConfig[name] = !data?.length ? (endpoint.models.default ?? []) : data;
      }
    }
  }

  if (includeDetails) {
    return { models: modelsConfig, modelDetails: allModelDetails };
  }

  return modelsConfig;
}

module.exports = loadConfigModels;
