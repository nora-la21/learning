import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Colors, Fonts, cardStyle } from '../theme';
import { WordList, GameMode, GameQuestion, GameAnswerResponse } from '../types';
import { startGame, nextQuestion, submitAnswer, skipWord } from '../api/client';
import ProgressBarComp from '../components/ProgressBarComp';
import { HomeStackParamList } from '../navigation';

type NavProp = NativeStackNavigationProp<HomeStackParamList>;
type RoutePropType = RouteProp<HomeStackParamList, 'Quiz'>;

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

type FeedbackState = {
  chosen: string;
  correct: boolean;
  almost: boolean;
  correctAnswer: string;
  xp: number;
  streak: number;
} | null;

function normalizeAnswer(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/^(de |het |een )/, '')
    .replace(/[.,!?]/g, '');
}

export default function QuizScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RoutePropType>();
  const { list, mode } = route.params;

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [question, setQuestion] = useState<GameQuestion | null>(null);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [xp, setXp] = useState(0);
  const [streak, setStreak] = useState(0);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [loading, setLoading] = useState(true);
  const [answering, setAnswering] = useState(false);
  const [typeInput, setTypeInput] = useState('');
  const [finished, setFinished] = useState(false);
  const [score, setScore] = useState(0);
  const startTimeRef = useRef<number>(Date.now());

  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation for listening mode speaker
  useEffect(() => {
    if (question?.mode === 'listening' && !feedback) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 700,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 700,
            useNativeDriver: true,
          }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
  }, [question, feedback, pulseAnim]);

  const loadNextQuestion = useCallback(
    async (sid: string) => {
      try {
        startTimeRef.current = Date.now();
        const q = await nextQuestion(sid);
        setQuestion(q);
        setFeedback(null);
        setTypeInput('');
      } catch (e: any) {
        // session ended or error
        if (e?.message?.includes('404') || e?.message?.includes('No more')) {
          setFinished(true);
        } else {
          console.error('nextQuestion error:', e);
          setFinished(true);
        }
      }
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const { session_id, total: t } = await startGame(list.id, mode, 20);
        if (cancelled) return;
        setSessionId(session_id);
        setTotal(t);
        const q = await nextQuestion(session_id);
        if (cancelled) return;
        setQuestion(q);
        startTimeRef.current = Date.now();
      } catch (e) {
        console.error('startGame error:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [list.id, mode]);

  const handleAnswer = useCallback(
    async (chosen: string) => {
      if (!sessionId || !question || answering || feedback) return;
      setAnswering(true);
      const timeMs = Date.now() - startTimeRef.current;
      try {
        const res: GameAnswerResponse = await submitAnswer(
          sessionId,
          question.word_id,
          chosen,
          timeMs,
        );
        setFeedback({
          chosen,
          correct: res.correct,
          almost: res.almost,
          correctAnswer: res.correct_answer,
          xp: res.xp_gained,
          streak: res.streak,
        });
        if (res.correct) setScore((s) => s + 1);
        setXp((x) => x + res.xp_gained);
        setStreak(res.streak);
        setProgress(res.progress_index);
        if (res.progress_index >= (total || res.total)) {
          // will navigate on Next press
        }
      } catch (e) {
        console.error('submitAnswer error:', e);
      } finally {
        setAnswering(false);
      }
    },
    [sessionId, question, answering, feedback, total],
  );

  const handleNext = useCallback(async () => {
    if (!sessionId) return;
    if (feedback && progress >= total && total > 0) {
      navigation.replace('Results', { score, total, list, mode });
      return;
    }
    await loadNextQuestion(sessionId);
  }, [sessionId, feedback, progress, total, score, list, mode, navigation, loadNextQuestion]);

  const handleSkip = useCallback(async () => {
    if (!sessionId || !question || feedback) return;
    try {
      await skipWord(sessionId, question.word_id);
      await loadNextQuestion(sessionId);
    } catch (e) {
      console.error('skip error:', e);
    }
  }, [sessionId, question, feedback, loadNextQuestion]);

  const handleTypeSubmit = () => {
    if (typeInput.trim().length === 0) return;
    const norm = normalizeAnswer(typeInput);
    const correct = normalizeAnswer(question?.prompt ?? '');
    // For reverse_type_it: prompt is the English word, answer is Dutch
    // We compare user input against correct_answer from server, but we
    // submit as-is and let server decide
    handleAnswer(typeInput.trim());
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.loadingCenter}>
          <ActivityIndicator color={Colors.accent} size="large" />
          <Text style={styles.loadingText}>Starting session…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!question) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.loadingCenter}>
          <Text style={styles.loadingText}>No questions available.</Text>
          <TouchableOpacity style={styles.backBtnLarge} onPress={() => navigation.goBack()}>
            <Text style={styles.backBtnLargeText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const isTypingMode = question.mode === 'reverse_type_it';
  const isListeningMode = question.mode === 'listening';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.closeBtn}
            activeOpacity={0.8}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="close" size={20} color={Colors.text} />
          </TouchableOpacity>
          <View style={styles.progressWrap}>
            <ProgressBarComp
              value={progress}
              total={total || 1}
              color={Colors.accent}
              height={6}
            />
          </View>
          <Text style={styles.counterText}>
            {progress}/{total}
          </Text>
        </View>

        {/* XP / streak row */}
        <View style={styles.xpRow}>
          <View style={styles.xpBadge}>
            <Text style={styles.xpText}>⚡ {xp} XP</Text>
          </View>
          {streak >= 2 && (
            <View style={styles.streakBadge}>
              <Text style={styles.streakText}>🔥 {streak}</Text>
            </View>
          )}
          <View style={{ flex: 1 }} />
          <Text style={styles.modeLabel}>
            {question.mode.replace(/_/g, ' ').toUpperCase()}
          </Text>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Question card */}
          <View style={styles.questionCard}>
            {isListeningMode ? (
              <View style={styles.listeningContainer}>
                <Animated.View
                  style={[
                    styles.speakerOuter,
                    { transform: [{ scale: pulseAnim }] },
                  ]}
                >
                  <TouchableOpacity style={styles.speakerInner} activeOpacity={0.8}>
                    <Ionicons
                      name="volume-high"
                      size={40}
                      color={Colors.text}
                    />
                  </TouchableOpacity>
                </Animated.View>
                <Text style={styles.listeningHint}>
                  {feedback ? `"${question.prompt}"` : 'Tap to listen'}
                </Text>
              </View>
            ) : (
              <>
                <Text style={styles.promptLang}>
                  {question.prompt_lang === 'nl' ? '🇳🇱 Dutch' : '🇬🇧 English'}
                </Text>
                <Text style={styles.promptWord}>{question.prompt}</Text>
              </>
            )}
          </View>

          {/* Feedback banner */}
          {feedback && (
            <View
              style={[
                styles.feedbackBanner,
                {
                  backgroundColor: feedback.correct
                    ? Colors.correct
                    : feedback.almost
                    ? Colors.almost
                    : Colors.wrong,
                },
              ]}
            >
              <Text style={styles.feedbackIcon}>
                {feedback.correct ? '✓' : feedback.almost ? '~' : '✗'}
              </Text>
              <View>
                <Text style={styles.feedbackTitle}>
                  {feedback.correct
                    ? 'Correct!'
                    : feedback.almost
                    ? 'Almost!'
                    : 'Incorrect'}
                </Text>
                {!feedback.correct && (
                  <Text style={styles.feedbackAnswer}>
                    Answer: {feedback.correctAnswer}
                  </Text>
                )}
              </View>
              {feedback.xp > 0 && (
                <Text style={styles.feedbackXp}>+{feedback.xp} XP</Text>
              )}
            </View>
          )}

          {/* Typing input */}
          {isTypingMode && (
            <View style={styles.typingContainer}>
              <TextInput
                style={[
                  styles.typeInput,
                  feedback &&
                    (feedback.correct
                      ? styles.typeInputCorrect
                      : styles.typeInputWrong),
                ]}
                placeholder="Type Dutch answer…"
                placeholderTextColor={Colors.textMuted}
                value={typeInput}
                onChangeText={setTypeInput}
                editable={!feedback}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleTypeSubmit}
              />
              {!feedback && (
                <TouchableOpacity
                  style={[
                    styles.checkBtn,
                    typeInput.trim().length === 0 && styles.checkBtnDisabled,
                  ]}
                  activeOpacity={0.85}
                  onPress={handleTypeSubmit}
                  disabled={typeInput.trim().length === 0 || answering}
                >
                  {answering ? (
                    <ActivityIndicator color={Colors.text} size="small" />
                  ) : (
                    <Text style={styles.checkBtnText}>Check ✓</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Multiple choice options */}
          {!isTypingMode && (
            <View style={styles.optionsGrid}>
              {question.options.map((option, idx) => {
                let optionStyle: object = styles.optionBtn;
                let optionTextStyle: object = styles.optionText;

                if (feedback) {
                  if (option === feedback.correctAnswer) {
                    optionStyle = { ...styles.optionBtn, ...styles.optionCorrect };
                    optionTextStyle = { ...styles.optionText, color: Colors.text };
                  } else if (option === feedback.chosen && !feedback.correct) {
                    optionStyle = { ...styles.optionBtn, ...styles.optionWrong };
                    optionTextStyle = { ...styles.optionText, color: Colors.text };
                  }
                }

                return (
                  <TouchableOpacity
                    key={`${idx}-${option}`}
                    style={[optionStyle, { width: '48%', marginBottom: 10 }]}
                    activeOpacity={0.85}
                    onPress={() => handleAnswer(option)}
                    disabled={!!feedback || answering}
                  >
                    <Text style={styles.optionLabel}>{OPTION_LABELS[idx]}</Text>
                    <Text style={optionTextStyle} numberOfLines={3}>
                      {option}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Skip button (only when no feedback) */}
          {!feedback && !isTypingMode && (
            <TouchableOpacity
              style={styles.skipBtn}
              activeOpacity={0.7}
              onPress={handleSkip}
            >
              <Text style={styles.skipText}>Skip →</Text>
            </TouchableOpacity>
          )}

          {/* Next button (after feedback) */}
          {feedback && (
            <TouchableOpacity
              style={styles.nextBtn}
              activeOpacity={0.85}
              onPress={handleNext}
            >
              <Text style={styles.nextBtnText}>
                {progress >= total ? 'See Results →' : 'Next Word →'}
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  loadingCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    fontFamily: Fonts.medium,
    fontSize: 15,
    color: Colors.textMuted,
    marginTop: 12,
  },
  backBtnLarge: {
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: 8,
  },
  backBtnLargeText: {
    fontFamily: Fonts.semiBold,
    fontSize: 15,
    color: Colors.text,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: Colors.surface1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  progressWrap: {
    flex: 1,
  },
  counterText: {
    fontFamily: Fonts.bold,
    fontSize: 13,
    color: Colors.textMuted,
    minWidth: 32,
    textAlign: 'right',
  },
  xpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 8,
  },
  xpBadge: {
    backgroundColor: Colors.surface2,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  xpText: {
    fontFamily: Fonts.bold,
    fontSize: 12,
    color: Colors.accentMauve,
  },
  streakBadge: {
    backgroundColor: Colors.surface2,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  streakText: {
    fontFamily: Fonts.bold,
    fontSize: 12,
    color: Colors.text,
  },
  modeLabel: {
    fontFamily: Fonts.medium,
    fontSize: 10,
    color: Colors.textMuted,
    letterSpacing: 0.8,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  questionCard: {
    ...cardStyle,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    marginBottom: 16,
    minHeight: 160,
  },
  promptLang: {
    fontFamily: Fonts.medium,
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  promptWord: {
    fontFamily: Fonts.serifItalic,
    fontSize: 36,
    color: Colors.text,
    textAlign: 'center',
    lineHeight: 44,
  },
  listeningContainer: {
    alignItems: 'center',
    gap: 16,
  },
  speakerOuter: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(156,68,80,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  speakerInner: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listeningHint: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: 4,
  },
  feedbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    gap: 12,
  },
  feedbackIcon: {
    fontFamily: Fonts.extraBold,
    fontSize: 22,
    color: Colors.text,
  },
  feedbackTitle: {
    fontFamily: Fonts.bold,
    fontSize: 15,
    color: Colors.text,
  },
  feedbackAnswer: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
  feedbackXp: {
    marginLeft: 'auto' as any,
    fontFamily: Fonts.bold,
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  optionBtn: {
    backgroundColor: Colors.surface1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderMid,
    padding: 14,
    minHeight: 70,
    justifyContent: 'flex-start',
  },
  optionCorrect: {
    backgroundColor: Colors.correct,
    borderColor: Colors.correct,
  },
  optionWrong: {
    backgroundColor: Colors.wrong,
    borderColor: Colors.wrong,
  },
  optionLabel: {
    fontFamily: Fonts.extraBold,
    fontSize: 11,
    color: Colors.textMuted,
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  optionText: {
    fontFamily: Fonts.semiBold,
    fontSize: 14,
    color: Colors.text,
    lineHeight: 20,
  },
  typingContainer: {
    gap: 12,
    marginBottom: 12,
  },
  typeInput: {
    backgroundColor: Colors.surface1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderMid,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: Fonts.semiBold,
    fontSize: 18,
    color: Colors.text,
  },
  typeInputCorrect: {
    borderColor: Colors.correct,
    backgroundColor: 'rgba(76,175,110,0.12)',
  },
  typeInputWrong: {
    borderColor: Colors.wrong,
    backgroundColor: 'rgba(224,85,85,0.12)',
  },
  checkBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  checkBtnDisabled: {
    opacity: 0.5,
  },
  checkBtnText: {
    fontFamily: Fonts.bold,
    fontSize: 16,
    color: Colors.text,
  },
  skipBtn: {
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  skipText: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: Colors.textMuted,
  },
  nextBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 5,
  },
  nextBtnText: {
    fontFamily: Fonts.bold,
    fontSize: 17,
    color: Colors.text,
  },
});
