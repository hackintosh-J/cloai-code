import type { LocalCommandCall } from '../../types/command.js'
import { saveGlobalConfig, getGlobalConfig } from '../../utils/config.js'
import {
  getActiveProviderConfig,
  getProviderKeyFromConfig,
  readCustomApiStorage,
  writeCustomApiStorage,
} from '../../utils/customApiStorage.js'

export const call: LocalCommandCall = async (args, _context) => {
  const targetModel = args.trim()
  if (!targetModel) {
    return {
      type: 'text',
      value: 'Usage: /remove-model <model-name>',
    }
  }

  const currentConfig = getGlobalConfig()
  const savedModels = currentConfig.customApiEndpoint?.savedModels ?? []
  const secureStored = readCustomApiStorage()
  const activeProvider = getActiveProviderConfig(secureStored)
  const activeProviderModels = activeProvider?.models ?? []
  const existsInSavedModels = savedModels.includes(targetModel)
  const existsInActiveProvider = activeProviderModels.includes(targetModel)
  if (!existsInSavedModels && !existsInActiveProvider) {
    return {
      type: 'text',
      value: `Model not found in saved list: ${targetModel}`,
    }
  }

  const remainingModels = existsInSavedModels
    ? savedModels.filter(model => model !== targetModel)
    : savedModels
  const currentModel = currentConfig.customApiEndpoint?.model
  const nextCurrentModel =
    currentModel === targetModel ? (remainingModels[0] ?? undefined) : currentModel

  saveGlobalConfig(current => ({
    ...current,
    customApiEndpoint: {
      ...current.customApiEndpoint,
      model: nextCurrentModel,
      savedModels: remainingModels,
    },
  }))
  const updatedProviders = activeProvider
    ? (secureStored.providers ?? []).map(provider =>
        getProviderKeyFromConfig(provider) === getProviderKeyFromConfig(activeProvider)
          ? {
              ...provider,
              models: provider.models.filter(model => model !== targetModel),
            }
          : provider,
      )
    : secureStored.providers
  const secureCurrentModel = secureStored.activeModel ?? secureStored.model
  const nextSecureModel =
    secureCurrentModel === targetModel
      ? (
          updatedProviders?.find(provider =>
            activeProvider &&
            getProviderKeyFromConfig(provider) === getProviderKeyFromConfig(activeProvider),
          )?.models[0] ?? nextCurrentModel
        )
      : secureCurrentModel
  writeCustomApiStorage({
    ...secureStored,
    model: nextSecureModel,
    activeModel: nextSecureModel,
    providers: updatedProviders,
    savedModels: remainingModels,
  })

  if (currentModel === targetModel || secureCurrentModel === targetModel) {
    if (nextSecureModel) {
      process.env.ANTHROPIC_MODEL = nextSecureModel
    } else {
      delete process.env.ANTHROPIC_MODEL
    }
  }

  return {
    type: 'text',
    value: `Removed custom model: ${targetModel}`,
  }
}
