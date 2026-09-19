/** Never interpret IME confirmation or an in-flight draft as a send/stop command. */
export function shouldSubmitComposer(
  key: { key: string; shiftKey?: boolean; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean; isComposing?: boolean; keyCode?: number },
  state: { canSend: boolean; isGenerating: boolean; isRecording: boolean; isTranscribing: boolean },
): boolean {
  return key.key === 'Enter' && !key.shiftKey && !key.ctrlKey && !key.altKey && !key.metaKey
    && !key.isComposing && key.keyCode !== 229
    && state.canSend && !state.isGenerating && !state.isRecording && !state.isTranscribing;
}

export function recordingTime(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

/** Internal command only. Preserve paragraphs, indentation and meaningful Unicode. */
export function cleanAssistantText(text: string): string {
  return text.replaceAll('[[OPEN_LENS]]', '').trim();
}
