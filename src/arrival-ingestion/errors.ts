export class ArrivalIngestionError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export function asArrivalIngestionError(error: unknown): ArrivalIngestionError {
  if (error instanceof ArrivalIngestionError) return error;
  const code = error instanceof Error ? error.message : '';
  if (code === 'AI_EXTRACTION_NOT_CONFIGURED') {
    return new ArrivalIngestionError('AI_EXTRACTION_NOT_CONFIGURED', 'Le service d’extraction AI n’est pas configuré.', 503);
  }
  if (code === 'EXTRACTION_RESPONSE_INVALID') {
    return new ArrivalIngestionError('EXTRACTION_RESPONSE_INVALID', 'La réponse d’extraction n’est pas exploitable.', 502);
  }
  return new ArrivalIngestionError('ARRIVAL_INGESTION_FAILED', 'L’opération n’a pas pu être terminée.', 500);
}
