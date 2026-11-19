/** Buffer at most the given number of decoded bytes from an upstream response. */
export async function readBoundedResponse(response: Response, maximum: number, truncate = false): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let remaining = maximum;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return text + decoder.decode();
      if (value.byteLength > remaining) {
        if (!truncate) throw new Error('RESPONSE_TOO_LARGE');
        return text + decoder.decode(value.subarray(0, remaining));
      }
      text += decoder.decode(value, { stream: true });
      remaining -= value.byteLength;
    }
  } finally {
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
