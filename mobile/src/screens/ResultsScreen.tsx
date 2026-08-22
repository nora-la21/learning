import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Colors, Fonts, cardStyle } from '../theme';
import { HomeStackParamList } from '../navigation';
import DonutChart from '../components/DonutChart';

type NavProp = NativeStackNavigationProp<HomeStackParamList>;
type RoutePropType = RouteProp<HomeStackParamList, 'Results'>;

function getResultMessage(pct: number): string {
  if (pct >= 95) return 'Perfect!';
  if (pct >= 75) return 'Great job!';
  if (pct >= 50) return 'Good effort!';
  return 'Keep practicing!';
}

export default function ResultsScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RoutePropType>();
  const { score, total, list, mode } = route.params;

  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  const message = getResultMessage(pct);
  const wrong = total - score;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerSub}>Session Complete</Text>
          <Text style={styles.headerTitle}>{message}</Text>
          <Text style={styles.headerDesc}>
            {list.name} · {mode.replace(/_/g, ' ')}
          </Text>
        </View>

        {/* Big donut */}
        <View style={styles.donutContainer}>
          <DonutChart
            pct={pct}
            color={pct >= 75 ? Colors.correct : pct >= 50 ? Colors.almost : Colors.accent}
            size={150}
            stroke={14}
          />
          <View style={styles.donutInner}>
            <Text style={styles.donutPct}>{pct}%</Text>
          </View>
        </View>

        <Text style={styles.scoreText}>
          {score} out of {total} correct
        </Text>

        {/* Stats cards */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { flex: 1, marginRight: 8 }]}>
            <Text style={styles.statIcon}>✓</Text>
            <Text style={[styles.statValue, { color: Colors.correct }]}>
              {score}
            </Text>
            <Text style={styles.statLabel}>Correct</Text>
          </View>
          <View style={[styles.statCard, { flex: 1, marginLeft: 8 }]}>
            <Text style={styles.statIcon}>✗</Text>
            <Text style={[styles.statValue, { color: Colors.wrong }]}>
              {wrong}
            </Text>
            <Text style={styles.statLabel}>Incorrect</Text>
          </View>
        </View>

        {/* Performance message */}
        <View style={styles.performanceCard}>
          <Text style={styles.performanceEmoji}>
            {pct >= 95 ? '🏆' : pct >= 75 ? '🌟' : pct >= 50 ? '💪' : '📚'}
          </Text>
          <Text style={styles.performanceText}>
            {pct >= 95
              ? 'Outstanding! You have mastered this material.'
              : pct >= 75
              ? 'Excellent work! You have a solid grasp of these words.'
              : pct >= 50
              ? 'Good progress! A bit more practice will get you there.'
              : 'Keep at it! Repetition is the key to mastery.'}
          </Text>
        </View>

        {/* Action buttons */}
        <TouchableOpacity
          style={styles.primaryBtn}
          activeOpacity={0.85}
          onPress={() =>
            navigation.replace('Quiz', { list, mode })
          }
        >
          <Text style={styles.primaryBtnText}>Practice Again</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryBtn}
          activeOpacity={0.85}
          onPress={() => navigation.popToTop()}
        >
          <Text style={styles.secondaryBtnText}>Back to Home</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 48,
    paddingTop: 32,
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  headerSub: {
    fontFamily: Fonts.medium,
    fontSize: 12,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  headerTitle: {
    fontFamily: Fonts.serifItalic,
    fontSize: 40,
    color: Colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  headerDesc: {
    fontFamily: Fonts.regular,
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  donutContainer: {
    position: 'relative',
    width: 150,
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  donutInner: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutPct: {
    fontFamily: Fonts.extraBold,
    fontSize: 34,
    color: Colors.text,
  },
  scoreText: {
    fontFamily: Fonts.semiBold,
    fontSize: 16,
    color: Colors.textMuted,
    marginBottom: 28,
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    width: '100%',
    marginBottom: 20,
  },
  statCard: {
    ...cardStyle,
    alignItems: 'center',
    paddingVertical: 18,
  },
  statIcon: {
    fontSize: 20,
    marginBottom: 8,
  },
  statValue: {
    fontFamily: Fonts.extraBold,
    fontSize: 32,
    color: Colors.text,
    marginBottom: 4,
  },
  statLabel: {
    fontFamily: Fonts.medium,
    fontSize: 12,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  performanceCard: {
    ...cardStyle,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 28,
  },
  performanceEmoji: {
    fontSize: 28,
  },
  performanceText: {
    fontFamily: Fonts.regular,
    fontSize: 14,
    color: Colors.textMuted,
    flex: 1,
    lineHeight: 20,
  },
  primaryBtn: {
    width: '100%',
    backgroundColor: Colors.accent,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 5,
  },
  primaryBtnText: {
    fontFamily: Fonts.bold,
    fontSize: 17,
    color: Colors.text,
  },
  secondaryBtn: {
    width: '100%',
    backgroundColor: Colors.surface1,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  secondaryBtnText: {
    fontFamily: Fonts.semiBold,
    fontSize: 17,
    color: Colors.textMuted,
  },
});
