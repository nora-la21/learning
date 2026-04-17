import type { GameQuestion } from '../types'
import type { AnswerFeedback } from '../components/GameShell'
import MultipleChoice from './MultipleChoice'

interface Props {
  question: GameQuestion
  onAnswer: (chosen: string, timeMs: number) => void
  feedback: AnswerFeedback
}

export default function ReverseMultipleChoice({ question, onAnswer, feedback }: Props) {
  return (
    <MultipleChoice
      question={question}
      onAnswer={onAnswer}
      feedback={feedback}
      showSourceSpeaker={true}
    />
  )
}
