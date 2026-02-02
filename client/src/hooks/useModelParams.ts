import { useCallback, useMemo } from 'react';
import { LocalStorageKeys } from 'librechat-data-provider';
import { useGetModelsWithDetailsQuery } from 'librechat-data-provider/react-query';
import type { TModelParameter, TModelDetails } from 'librechat-data-provider';
import useLocalStorage from './useLocalStorageAlt';

export type ModelParamValues = Record<string, unknown>;

interface UseModelParamsOptions {
  modelId: string | undefined;
}

interface UseModelParamsResult {
  /** Parameter definitions for the current model */
  parameters: TModelParameter[];
  /** Current parameter values (user-saved or defaults) */
  values: ModelParamValues;
  /** Update a single parameter value */
  updateParam: (name: string, value: unknown) => void;
  /** Update multiple parameter values at once */
  updateParams: (params: ModelParamValues) => void;
  /** Reset all parameters to their default values */
  resetToDefaults: () => void;
  /** Whether the model has any configurable parameters */
  hasParameters: boolean;
  /** Whether the model details are still loading */
  isLoading: boolean;
}

/**
 * Hook for managing model-specific parameters.
 * Parameters are stored per-model in localStorage and persist across sessions.
 */
export function useModelParams({ modelId }: UseModelParamsOptions): UseModelParamsResult {
  const storageKey = modelId
    ? `${LocalStorageKeys.MODEL_PARAMS_PREFIX}${modelId}`
    : LocalStorageKeys.MODEL_PARAMS_PREFIX;

  const [savedValues, setSavedValues] = useLocalStorage<ModelParamValues>(storageKey, {});

  const { data: modelsData, isLoading } = useGetModelsWithDetailsQuery();

  const modelDetails: TModelDetails | undefined = useMemo(() => {
    if (!modelId || !modelsData?.modelDetails) {
      return undefined;
    }
    return modelsData.modelDetails[modelId];
  }, [modelId, modelsData?.modelDetails]);

  const parameters: TModelParameter[] = useMemo(() => {
    return modelDetails?.parameters ?? [];
  }, [modelDetails]);

  const hasParameters = parameters.length > 0;

  // Compute current values: user-saved values merged with defaults
  const values: ModelParamValues = useMemo(() => {
    const result: ModelParamValues = {};
    for (const param of parameters) {
      const savedValue = savedValues[param.name];
      if (savedValue !== undefined) {
        result[param.name] = savedValue;
      } else if (param.default_value !== undefined) {
        result[param.name] = param.default_value;
      }
    }
    return result;
  }, [parameters, savedValues]);

  const updateParam = useCallback(
    (name: string, value: unknown) => {
      const newValues = {
        ...savedValues,
        [name]: value,
      };
      setSavedValues(newValues);
    },
    [savedValues, setSavedValues],
  );

  const updateParams = useCallback(
    (params: ModelParamValues) => {
      const newValues = {
        ...savedValues,
        ...params,
      };
      setSavedValues(newValues);
    },
    [savedValues, setSavedValues],
  );

  const resetToDefaults = useCallback(() => {
    setSavedValues({});
  }, [setSavedValues]);

  return {
    parameters,
    values,
    updateParam,
    updateParams,
    resetToDefaults,
    hasParameters,
    isLoading,
  };
}

export default useModelParams;
