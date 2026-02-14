import { useState, useRef, useCallback, useEffect } from 'react';

export function useMediaRecorder(
  stream: MediaStream | null,
  onRecordingComplete?: (blob: Blob, durationMs: number, startedAt: Date, endedAt: Date) => void
) {
  const [isRecording, setIsRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<Date | null>(null);
  // Always use latest callback via ref so onstop never calls a stale closure
  const callbackRef = useRef(onRecordingComplete);
  useEffect(() => {
    callbackRef.current = onRecordingComplete;
  }, [onRecordingComplete]);

  const startRecording = useCallback(() => {
    if (!stream || isRecording) return;

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
        ? 'video/webm;codecs=vp8,opus'
        : MediaRecorder.isTypeSupported('video/webm')
          ? 'video/webm'
          : 'video/mp4';

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 2500000,
        audioBitsPerSecond: 128000,
      });
    } catch (e) {
      console.error('Failed to create MediaRecorder:', e);
      return;
    }

    chunksRef.current = [];
    startTimeRef.current = new Date();

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      setIsRecording(false);
      if (chunksRef.current.length === 0) {
        console.warn('Recording stopped but no data chunks were captured');
        return;
      }
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const endedAt = new Date();
      const startedAt = startTimeRef.current ?? endedAt;
      const durationMs = endedAt.getTime() - startedAt.getTime();
      // Use ref to get the latest callback, not the one from when startRecording was called
      callbackRef.current?.(blob, durationMs, startedAt, endedAt);
    };

    recorder.onerror = (e) => {
      console.error('MediaRecorder error:', e);
      setIsRecording(false);
      recorderRef.current = null;
    };

    recorder.start(1000);
    recorderRef.current = recorder;
    setIsRecording(true);
  }, [stream, isRecording]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
    recorderRef.current = null;
  }, []);

  return { isRecording, startRecording, stopRecording };
}
