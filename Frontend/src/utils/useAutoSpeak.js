import { useEffect } from "react";
import { speakText, stopSpeaking } from "./speech";

export const useAutoSpeak = (text, speechEnabled, autoSpeak) => {
  useEffect(() => {
    if (!speechEnabled || !autoSpeak) return;
    if (!text) return;

    const timer = setTimeout(() => {
      speakText(text);
    }, 500);

    return () => stopSpeaking();
  }, [text, speechEnabled, autoSpeak]);
};