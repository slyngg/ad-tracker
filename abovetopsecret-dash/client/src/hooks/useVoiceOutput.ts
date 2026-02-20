import { useState, useCallback, useRef, useEffect } from 'react';

interface UseVoiceOutputOptions {
  onEnd?: () => void;
}

export function useVoiceOutput(options?: UseVoiceOutputOptions) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const onEndRef = useRef(options?.onEnd);

  // Keep callback ref fresh
  useEffect(() => {
    onEndRef.current = options?.onEnd;
  }, [options?.onEnd]);

  const isSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (isSupported) {
        window.speechSynthesis.cancel();
      }
    };
  }, [isSupported]);

  const speak = useCallback((text: string) => {
    if (!isSupported) return;

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utteranceRef.current = utterance;

    // Select best English voice
    const voices = window.speechSynthesis.getVoices();
    const englishVoice = voices.find((v) => v.lang.startsWith('en') && v.localService) ||
      voices.find((v) => v.lang.startsWith('en')) ||
      voices[0];
    if (englishVoice) {
      utterance.voice = englishVoice;
    }

    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      onEndRef.current?.();
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      onEndRef.current?.();
    };

    window.speechSynthesis.speak(utterance);
  }, [isSupported]);

  const stop = useCallback(() => {
    if (isSupported) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  }, [isSupported]);

  return { speak, stop, isSpeaking, isSupported };
}
