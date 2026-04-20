export type TurnStartTime = number

export type PersistedFile = {
  filename: string
  file_id: string
}

export type FailedPersistence = {
  filename: string
  error: string
}

export type FilesPersistedEventData = {
  files: PersistedFile[]
  failed: FailedPersistence[]
}

// Session output files are stored under {cwd}/{sessionId}/outputs.
export const OUTPUTS_SUBDIR = 'outputs'

// Match the Files API helper's default concurrency unless configured elsewhere.
export const DEFAULT_UPLOAD_CONCURRENCY = 5

// Guard against pathological uploads from an output directory gone wrong.
export const FILE_COUNT_LIMIT = 1000
