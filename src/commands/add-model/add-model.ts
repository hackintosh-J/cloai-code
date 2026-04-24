import type { LocalCommandCall } from '../../types/command.js'
import { saveGlobalConfig } from '../../utils/config.js'
import {
  getActiveProviderConfig,
  getProviderKeyFromConfig,
  readCustomApiStorage,
  writeCustomApiStorage,
} from '../../utils/customApiStorage.js'

export const call: LocalCommandCall = async (args, _context) => {
  const nextModel = args.trim()
  if (!nextModel) {
    return {
      type: 'text',
      value: 'Usage: /add-model <model-name>',
    }
  }

  saveGlobalConfig(current => ({
    ...current,
    customApiEndpoint: {
      ...current.customApiEndpoint,
      model: nextModel,
      savedModels: [...new Set([...(current.customApiEndpoint?.savedModels ?? []), nextModel])],
    },
  }))
  const secureStored = readCustomApiStorage()
  const activeProvider = getActiveProviderConfig(secureStored)
  const updatedProviders = activeProvider
    ? (secureStored.providers ?? []).map(provider =>
        getProviderKeyFromConfig(provider) === getProviderKeyFromConfig(activeProvider)
          ? {
              ...provider,
              models: [...new Set([...provider.models, nextModel])],
            }
          : provider,
      )
    : secureStored.providers
  writeCustomApiStorage({
    ...secureStored,
    model: nextModel,
    activeModel: nextModel,
    providers: updatedProviders,
    savedModels: [...new Set([...(secureStored.savedModels ?? []), nextModel])]
  })

  process.env.ANTHROPIC_MODEL = nextModel

  return {
    type: 'text',
    value: `Added custom model: ${nextModel}`,
  }
}
