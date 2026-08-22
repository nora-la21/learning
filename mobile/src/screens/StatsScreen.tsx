import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Fonts, cardStyle } from '../theme';
import { WordList, HeatmapEntry } from '../types';
import { getLists, getHeatmap } from '../api/client';
import DonutChart from '../components/DonutChart';
import ProgressBarComp from '../components/ProgressBarComp';

function getFlagEmoji(lang: string): string {
  const flags: Record<string, string> = {
    nl: '🇳🇱',
    en: '🇬🇧',
    de: '🇩🇪',
    fr: '🇫🇷',
    es: '🇪🇸',
  };
  return flags[lang] ?? '🌐';
}

function getLast7Days(): string[] {
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }
  return days;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function StatsScreen() {
  const [lists, setLists] = useState<WordList[]>([]);
  const [heatmap, setHeatmap] = useState<HeatmapEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [builtin, user, hm] = await Promise.all([
        getLists(true),
        getLists(false),
        getHeatmap().catch(() => [] as HeatmapEntry[]),
      ]);
      setLists([...builtin, ...user]);
      setHeatmap(hm);
    } catch (e) {
      console.error('StatsScreen error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  const totalMastered = lists.reduce((s, l) => s + l.mastered_count, 0);
  const totalWords = lists.reduce((s, l) => s + l.word_count, 0);
  const masteryPct = totalWords > 0 ? Math.round((totalMastered / totalWords) * 100) : 0;

  const last7 = getLast7Days();
  const heatmapMap: Record<string, number> = {};
  heatmap.forEach((e) => {
    heatmapMap[e.date] = e.count;
  });

  const barData = last7.map((date) => ({
    date,
    count: heatmapMap[date] ?? 0,
    label: DAY_LABELS[new Date(date + 'T00:00:00').getDay()],
  }));

  const maxCount = Math.max(...barData.map((b) => b.count), 1);
  const today = new Date().toISOString().split('T')[0];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.accent}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Progress</Text>
        </View>

        {loading ? (
          <ActivityIndicator
            color={Colors.accent}
            size="large"
            style={{ marginTop: 48 }}
          />
        ) : (
          <>
            {/* Overall mastery card */}
            <View style={[styles.masteryCard]}>
              <DonutChart
                pct={masteryPct}
                color={Colors.accent}
                size={90}
                stroke={9}
              />
              <View style={styles.masteryText}>
                <Text style={styles.masteryTitle}>Overall Mastery</Text>
                <Text style={styles.masteryValue}>
                  {totalMastered}{' '}
                  <Text style={styles.masteryOf}>of {totalWords}</Text>
                </Text>
                <Text style={styles.masteryLabel}>words mastered</Text>
                <View style={styles.pctPill}>
                  <Text style={styles.pctPillText}>{masteryPct}%</Text>
                </View>
              </View>
            </View>

            {/* 7-day activity chart */}
            <View style={[cardStyle, styles.activityCard]}>
              <Text style={styles.sectionTitle}>7-Day Activity</Text>
              <View style={styles.barChart}>
                {barData.map((bar) => {
                  const isToday = bar.date === today;
                  const barHeight = Math.max(4, (bar.count / maxCount) * 80);
                  return (
                    <View key={bar.date} style={styles.barCol}>
                      <View style={styles.barTrack}>
                        <View
                          style={[
                            styles.bar,
                            {
                              height: barHeight,
                              backgroundColor: isToday
                                ? Colors.accent
                                : bar.count > 0
                                ? Colors.teal
                                : Colors.surface2,
                            },
                          ]}
                        />
                      </View>
                      <Text
                        style={[
                          styles.barLabel,
                          isToday && { color: Colors.accent },
                        ]}
                      >
                        {bar.label}
                      </Text>
                      {bar.count > 0 && (
                        <Text style={styles.barCount}>{bar.count}</Text>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>

            {/* By Collection */}
            <Text style={[styles.sectionTitle, { marginBottom: 14 }]}>
              By Collection
            </Text>

            {lists.length === 0 ? (
              <Text style={styles.emptyText}>No collections yet.</Text>
            ) : (
              lists.map((list) => {
                const pct =
                  list.word_count > 0
                    ? Math.round((list.mastered_count / list.word_count) * 100)
                    : 0;
                return (
                  <View key={list.id} style={styles.collectionCard}>
                    <View style={styles.collectionHeader}>
                      <Text style={styles.collectionFlag}>
                        {getFlagEmoji(list.source_lang)}
                      </Text>
                      <View style={styles.collectionMeta}>
                        <Text style={styles.collectionName} numberOfLines={1}>
                          {list.name}
                        </Text>
                        <Text style={styles.collectionSub}>
                          {list.mastered_count}/{list.word_count} · {pct}%
                        </Text>
                      </View>
                    </View>
                    <ProgressBarComp
                      value={list.mastered_count}
                      total={list.word_count}
                      color={Colors.accent}
                      height={5}
                    />
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  header: {
    marginTop: 16,
    marginBottom: 24,
  },
  headerTitle: {
    fontFamily: Fonts.serif,
    fontSize: 32,
    color: Colors.text,
  },
  masteryCard: {
    ...cardStyle,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingVertical: 20,
  },
  masteryText: {
    marginLeft: 20,
    flex: 1,
  },
  masteryTitle: {
    fontFamily: Fonts.medium,
    fontSize: 12,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  masteryValue: {
    fontFamily: Fonts.extraBold,
    fontSize: 28,
    color: Colors.text,
    lineHeight: 32,
  },
  masteryOf: {
    fontFamily: Fonts.regular,
    fontSize: 16,
    color: Colors.textMuted,
  },
  masteryLabel: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: Colors.textMuted,
    marginBottom: 8,
  },
  pctPill: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.surface2,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  pctPillText: {
    fontFamily: Fonts.bold,
    fontSize: 13,
    color: Colors.accent,
  },
  activityCard: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontFamily: Fonts.bold,
    fontSize: 16,
    color: Colors.text,
    marginBottom: 16,
  },
  barChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 100,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  barTrack: {
    height: 84,
    justifyContent: 'flex-end',
    alignItems: 'center',
    width: '100%',
  },
  bar: {
    width: 18,
    borderRadius: 6,
  },
  barLabel: {
    fontFamily: Fonts.medium,
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 6,
  },
  barCount: {
    fontFamily: Fonts.bold,
    fontSize: 9,
    color: Colors.textMuted,
    marginTop: 1,
  },
  collectionCard: {
    ...cardStyle,
    marginBottom: 10,
  },
  collectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  collectionFlag: {
    fontSize: 24,
    marginRight: 10,
  },
  collectionMeta: {
    flex: 1,
  },
  collectionName: {
    fontFamily: Fonts.semiBold,
    fontSize: 14,
    color: Colors.text,
    marginBottom: 2,
  },
  collectionSub: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: Colors.textMuted,
  },
  emptyText: {
    fontFamily: Fonts.regular,
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 20,
  },
});
