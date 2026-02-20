import { useState, useRef, useCallback, useEffect } from 'react';

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent {
  error: string;
}

type WakeWordState = 'idle' | 'listening' | 'captured';

const WAKE_PHRASES = ['hey optics', 'hey optic', 'hey optic data', 'hey opticsdata'];

function stripWakePhrase(transcript: string): string {
  const lower = transcript.toLowerCase().trim();
  for (const phrase of WAKE_PHRASES) {
    if (lower.startsWith(phrase)) {
      return transcript.slice(phrase.length).trim();
    }
  }
  return transcript.trim();
}

function hasWakePhrase(transcript: string): boolean {
  const lower = transcript.toLowerCase().trim();
  return WAKE_PHRASES.some((p) => lower.startsWith(p));
}

export function useWakeWord(onCommand: (command: string) => void) {
  const [state, setState] = useState<WakeWordState>('idle');
  const [active, setActive] = useState(false);
  const recognitionRef = useRef<any>(null);
  const activeRef = useRef(false);
  const onCommandRef = useRef(onCommand);

  const SpeechRecognition =
    typeof window !== 'undefined'
      ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      : null;

  const isSupported = !!SpeechRecognition;

  useEffect(() => {
    onCommandRef.current = onCommand;
  }, [onCommand]);

  const startRecognition = useCallback(() => {
    if (!SpeechRecognition || !activeRef.current) return;

    // Clean up previous
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const transcript = result[0].transcript;
          if (hasWakePhrase(transcript)) {
            const command = stripWakePhrase(transcript);
            if (command) {
              setState('captured');
              onCommandRef.current(command);
            }
            // If wake word only (no command), keep listening
          }
          // Non-wake-word speech is ignored
        }
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // "no-speech" and "aborted" are expected during continuous listening
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        console.warn('Wake word recognition error:', event.error);
      }
    };

    recognition.onend = () => {
      // Auto-restart if still active
      if (activeRef.current) {
        setTimeout(() => startRecognition(), 300);
      } else {
        setState('idle');
      }
    };

    recognitionRef.current = recognition;
    setState('listening');

    try {
      recognition.start();
    } catch (err) {
      console.warn('Failed to start wake word recognition:', err);
    }
  }, [SpeechRecognition]);

  const activate = useCallback(() => {
    if (!isSupported) return;
    activeRef.current = true;
    setActive(true);
    startRecognition();
  }, [isSupported, startRecognition]);

  const deactivate = useCallback(() => {
    activeRef.current = false;
    setActive(false);
    setState('idle');
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
      recognitionRef.current = null;
    }
  }, []);

  const resumeListening = useCallback(() => {
    if (activeRef.current) {
      setState('listening');
      startRecognition();
    }
  }, [startRecognition]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      activeRef.current = false;
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
      }
    };
  }, []);

  return {
    state,
    active,
    activate,
    deactivate,
    resumeListening,
    isSupported,
  };
}
