import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useCleanRecording } from '@/features/sonim/useCleanRecording';
const mockRecord = jest.fn(), mockStop = jest.fn(async () => {}), mockRelease = jest.fn();
const mockPermission = jest.fn(async () => ({ granted: true }));
const mockSend = jest.fn(async () => ({ data: { text: 'Bonjour Clean' } }));
jest.mock('@/session/session', () => ({ useSessionId: () => 'session-one' }));
jest.mock('@/api/client', () => ({ apiSend: (...args: unknown[]) => mockSend(...args as []) }));
jest.mock('expo-file-system', () => ({ File: class { delete() {} } }));
jest.mock('expo-audio', () => ({
  requestRecordingPermissionsAsync: () => mockPermission(), setAudioModeAsync: jest.fn(async () => {}),
  RecordingPresets: { HIGH_QUALITY: {} },
  AudioModule: { AudioRecorder: class { uri = 'file:///voice.m4a'; prepareToRecordAsync = async () => {}; record = mockRecord; stop = mockStop; release = mockRelease; } },
}));
beforeEach(() => { jest.clearAllMocks(); mockPermission.mockResolvedValue({ granted: true }); mockSend.mockResolvedValue({ data: { text: 'Bonjour Clean' } }); });
it('requests permission, records only after consent and sends authenticated STT only after stopping', async () => {
  const onText = jest.fn(); const hook = renderHook(() => useCleanRecording('one', onText));
  await act(async () => { await hook.result.current.start(); });
  expect(hook.result.current.state).toBe('recording'); expect(mockSend).not.toHaveBeenCalled();
  await act(async () => { await hook.result.current.finish(); });
  expect(mockStop).toHaveBeenCalled(); expect(onText).toHaveBeenCalledWith('Bonjour Clean');
  expect(mockSend.mock.calls[0]).toEqual(['POST', '/api/assistant/transcribe', expect.objectContaining({ headers: { 'x-session-id': 'session-one' }, form: expect.any(FormData), signal: expect.anything() })]);
  expect(hook.result.current.state).toBe('idle'); hook.unmount();
});
it('does not capture or send when permission is refused', async () => {
  mockPermission.mockResolvedValue({ granted: false });
  const hook = renderHook(() => useCleanRecording('one', jest.fn()));
  await act(async () => { await hook.result.current.start(); });
  expect(hook.result.current.error).toBe(true); expect(mockRecord).not.toHaveBeenCalled(); expect(mockSend).not.toHaveBeenCalled(); hook.unmount();
});
it('drops a permission response arriving after cancellation', async () => {
  let resolve!: (p: { granted: boolean }) => void;
  mockPermission.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  const hook = renderHook(() => useCleanRecording('one', jest.fn()));
  let pending!: Promise<void>; act(() => { pending = hook.result.current.start(); });
  await waitFor(() => expect(mockPermission).toHaveBeenCalled());
  act(() => hook.result.current.cancel());
  await act(async () => { resolve({ granted: true }); await pending; });
  expect(mockRecord).not.toHaveBeenCalled(); expect(hook.result.current.state).toBe('idle'); hook.unmount();
});
it('stops and releases capture on unmount without posting audio', async () => {
  const hook = renderHook(() => useCleanRecording('one', jest.fn()));
  await act(async () => { await hook.result.current.start(); }); hook.unmount();
  await act(async () => {});
  expect(mockStop).toHaveBeenCalled(); expect(mockRelease).toHaveBeenCalled(); expect(mockSend).not.toHaveBeenCalled();
});
it('ignores transcription returned after conversation ownership changes', async () => {
  let resolve!: (p: { data: { text: string } }) => void;
  mockSend.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  const onText = jest.fn();
  const hook = renderHook<ReturnType<typeof useCleanRecording>, { owner: string }>(({ owner }) => useCleanRecording(owner, onText), { initialProps: { owner: 'one' } });
  await act(async () => { await hook.result.current.start(); });
  let pending!: Promise<void>; act(() => { pending = hook.result.current.finish(); });
  await waitFor(() => expect(mockSend).toHaveBeenCalled());
  hook.rerender({ owner: 'two' });
  await act(async () => { resolve({ data: { text: 'stale recording' } }); await pending; });
  expect(onText).not.toHaveBeenCalled(); expect(hook.result.current.state).toBe('idle'); hook.unmount();
});
