import { useCallback } from 'react'

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

function getVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise(resolve => {
    const v = window.speechSynthesis.getVoices()
    if (v.length > 0) return resolve(v)
    const handler = () => resolve(window.speechSynthesis.getVoices())
    window.speechSynthesis.addEventListener('voiceschanged', handler, { once: true })
    // Fallback: if voiceschanged never fires, resolve after 1s with whatever we have
    setTimeout(() => resolve(window.speechSynthesis.getVoices()), 1000)
  })
}

export function useSpeech() {
  const speak = useCallback((text: string, lang: string = 'nl', rate = 0.85) => {
    if (!window.speechSynthesis) return

    const bcp = toBCP47(lang)

    getVoices().then(voices => {
      window.speechSynthesis.cancel()

      // rAF ensures the cancel is processed before we enqueue the new utterance
      requestAnimationFrame(() => {
        const utterance = new SpeechSynthesisUtterance(text)
        utterance.lang = bcp
        utterance.rate = rate
        utterance.pitch = 1.0
        utterance.voice =
          voices.find(v => v.lang === bcp) ??
          voices.find(v => v.lang.startsWith(bcp.split('-')[0])) ??
          null
        window.speechSynthesis.speak(utterance)
      })
    })
  }, [])

  const cancel = useCallback(() => {
    window.speechSynthesis?.cancel()
  }, [])

  return { speak, cancel }
}
