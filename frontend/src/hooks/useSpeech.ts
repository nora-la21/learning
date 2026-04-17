import { useCallback, useEffect, useState } from 'react'

const LANG_MAP: Record<string, string> = {
  nl: 'nl-NL',
  en: 'en-US',
  fr: 'fr-FR',
  de: 'de-DE',
  es: 'es-ES',
  pt: 'pt-PT',
  it: 'it-IT',
}

function toBCP47(lang: string): string {
  return LANG_MAP[lang.toLowerCase()] ?? lang
}

export function useSpeech() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!window.speechSynthesis) return
    const voices = window.speechSynthesis.getVoices()
    if (voices.length > 0) {
      setReady(true)
    } else {
      const handler = () => setReady(true)
      window.speechSynthesis.addEventListener('voiceschanged', handler)
      return () => window.speechSynthesis.removeEventListener('voiceschanged', handler)
    }
  }, [])

  const speak = useCallback((text: string, lang: string = 'nl', rate = 0.85) => {
    if (!window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    const bcp = toBCP47(lang)
    utterance.lang = bcp
    utterance.rate = rate
    utterance.pitch = 1.0

    const voices = window.speechSynthesis.getVoices()
    utterance.voice =
      voices.find(v => v.lang === bcp) ??
      voices.find(v => v.lang.startsWith(lang.split('-')[0])) ??
      null

    window.speechSynthesis.speak(utterance)
  }, [])

  const cancel = useCallback(() => {
    window.speechSynthesis?.cancel()
  }, [])

  return { speak, cancel, ready }
}
