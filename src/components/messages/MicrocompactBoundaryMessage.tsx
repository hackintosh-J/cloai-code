import React from 'react'
import { Box, Text } from '../../ink.js'

type Props = {
  metadata?: {
    trigger?: string
    tokensSaved?: number
    compactedToolIds?: string[]
  }
}

export function MicrocompactBoundaryMessage({ metadata }: Props) {
  const trigger = metadata?.trigger ?? 'auto'
  const toolsCleared = metadata?.compactedToolIds?.length ?? 0
  const tokensSaved = metadata?.tokensSaved ?? 0

  return (
    <Box marginY={1}>
      <Text dimColor>
        {`Microcompact (${trigger}) cleared ${toolsCleared} tool result${toolsCleared === 1 ? '' : 's'} and saved ~${tokensSaved} tokens`}
        {` · if cache read drops on this turn, compare it with this marker`}
      </Text>
    </Box>
  )
}
