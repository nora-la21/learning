import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Colors, Fonts, cardStyle } from '../theme';
import { WordList, GameMode, ProgressSummary } from '../types';
import { getProgressSummary } from '../api/client';
import DonutChart from '../components/DonutChart';
import { HomeStackParamList } from '../navigation';

// Works for all 3 stacks since they share the same param shape
type NavProp = NativeStackNavigationProp<HomeStackParamList>;
type RoutePropType = RouteProp<HomeStackParamList, 'ModeSelect'>;

interface ModeCardData {
  mode: GameMode;
  label: string;
  emoji: string;
  description: string;
  highlight: boolean;
}

const MODES: ModeCardData[] = [
  {
    mode: 'all_in_one',
    label: 'All in One',
    emoji: '⚡',
    description: 'All 4 modes in sequence',
    highlight: true,
  },
  {
    mode: 'multiple_choice',
    label: 'Word → Translation',
    emoji: '🃏',
    description: 'Pick the correct translation',
    highlight: false,
  },
  {
    mode: 'reverse_mc',
    label: 'Translation → Word',
    emoji: '🔄',
    description: 'Pick the correct Dutch word',
    highlight: false,
  },
  {
    mode: 'listening',
    label: 'Listening',
    emoji: '👂',
    description: 'Identify the spoken word',
    highlight: false,
  },
  {
    mode: 'reverse_type_it',
    label: 'Type It',
    emoji: '✍️',
    description: 'Type the Dutch translation',
    highlight: false,
  },
];

export default function ModeSelectScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RoutePropType>();
  const { list } = route.params;

  const [summary, setSummary] = useState<ProgressSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getProgressSummary(list.id)
      .then(setSummary)
      .catch(() => setSummary(null))
      .finally(() => setLoading(false));
  }, [list.id]);

  const toLearn = summary
    ? summary.total - summary.mastered
    : list.word_count - list.mastered_count;
  const masteryPct =
    summary && summary.total > 0
      ? Math.round((summary.mastered / summary.total) * 100)
      : list.word_count > 0
      ? Math.round((list.mastered_count / list.word_count) * 100)
      : 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Back button header */}
      <View style={styles.navBar}>
        <TouchableOpacity
          style={styles.backBtn}
          activeOpacity={0.8}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={20} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.navTitle} numberOfLines={1}>
          {list.name}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.subtitle}>Choose a practice mode</Text>

        {/* Stats card */}
        <View style={[cardStyle, styles.statsCard]}>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {summary?.total ?? list.word_count}
              </Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: Colors.correct }]}>
                {summary?.mastered ?? list.mastered_count}
              </Text>
              <Text style={styles.statLabel}>Mastered</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: Colors.accent }]}>
                {toLearn}
              </Text>
              <Text style={styles.statLabel}>To Learn</Text>
            </View>
          </View>
          {loading ? (
            <ActivityIndicator color={Colors.accent} size="small" style={{ marginTop: 16 }} />
          ) : (
            <View style={styles.donutRow}>
              <DonutChart
                pct={masteryPct}
                color={Colors.accent}
                size={80}
                stroke={8}
              />
              <View style={styles.donutMeta}>
                <Text style={styles.donutPct}>{masteryPct}%</Text>
                <Text style={styles.donutLabel}>mastered</Text>
              </View>
            </View>
          )}
        </View>

        {/* Mode cards */}
        {MODES.map((item) => (
          <TouchableOpacity
            key={item.mode}
            style={[
              styles.modeCard,
              item.highlight && styles.modeCardHighlight,
            ]}
            activeOpacity={0.85}
            onPress={() =>
              navigation.navigate('Quiz', { list, mode: item.mode })
            }
          >
            <Text style={styles.modeEmoji}>{item.emoji}</Text>
            <View style={styles.modeText}>
              <Text
                style={[
                  styles.modeLabel,
                  item.highlight && styles.modeLabelHighlight,
                ]}
              >
                {item.label}
              </Text>
              <Text
                style={[
                  styles.modeDesc,
                  item.highlight && styles.modeDescHighlight,
                ]}
              >
                {item.description}
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={item.highlight ? 'rgba(255,255,255,0.7)' : Colors.textMuted}
            />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.surface1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navTitle: {
    flex: 1,
    fontFamily: Fonts.semiBold,
    fontSize: 16,
    color: Colors.text,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 20,
  },
  subtitle: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: Colors.textMuted,
    marginBottom: 20,
  },
  statsCard: {
    marginBottom: 24,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontFamily: Fonts.extraBold,
    fontSize: 26,
    color: Colors.text,
    marginBottom: 2,
  },
  statLabel: {
    fontFamily: Fonts.medium,
    fontSize: 11,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  donutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  donutMeta: {
    alignItems: 'flex-start',
  },
  donutPct: {
    fontFamily: Fonts.extraBold,
    fontSize: 24,
    color: Colors.text,
  },
  donutLabel: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: Colors.textMuted,
  },
  modeCard: {
    ...cardStyle,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 14,
  },
  modeCardHighlight: {
    backgroundColor: Colors.accent,
    borderColor: Colors.mauve,
    shadowColor: Colors.accent,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  modeEmoji: {
    fontSize: 26,
  },
  modeText: {
    flex: 1,
  },
  modeLabel: {
    fontFamily: Fonts.bold,
    fontSize: 15,
    color: Colors.text,
    marginBottom: 2,
  },
  modeLabelHighlight: {
    color: Colors.text,
  },
  modeDesc: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: Colors.textMuted,
  },
  modeDescHighlight: {
    color: 'rgba(255,255,255,0.7)',
  },
});
