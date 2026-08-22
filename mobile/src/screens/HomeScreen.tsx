import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Colors, Fonts, cardStyle } from '../theme';
import { WordList } from '../types';
import { getLists } from '../api/client';
import ProgressBarComp from '../components/ProgressBarComp';
import { HomeStackParamList } from '../navigation';

type NavProp = NativeStackNavigationProp<HomeStackParamList, 'HomeMain'>;

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

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

export default function HomeScreen() {
  const navigation = useNavigation<NavProp>();
  const [lists, setLists] = useState<WordList[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchLists = useCallback(async () => {
    try {
      const [builtin, user] = await Promise.all([
        getLists(true),
        getLists(false),
      ]);
      setLists([...builtin, ...user]);
    } catch (e) {
      console.error('Failed to load lists:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchLists();
  }, [fetchLists]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchLists();
  }, [fetchLists]);

  const totalMastered = lists.reduce((sum, l) => sum + (l.mastered_count ?? 0), 0);
  const totalWords = lists.reduce((sum, l) => sum + l.word_count, 0);
  const totalUnmastered = totalWords - totalMastered;

  const today = new Date();

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
          <View>
            <Text style={styles.dateText}>{formatDate(today)}</Text>
            <Text style={styles.greeting}>{getGreeting()}, Nora 👋</Text>
          </View>
          <TouchableOpacity style={styles.settingsBtn} activeOpacity={0.8}>
            <Ionicons name="settings-outline" size={22} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { flex: 1, marginRight: 8 }]}>
            <View style={styles.statIconRow}>
              <Text style={styles.statIcon}>⚡</Text>
              <Text style={styles.statLabel}>Day Streak</Text>
            </View>
            <Text style={styles.statValue}>7</Text>
            <Text style={styles.statSub}>days in a row</Text>
          </View>
          <View style={[styles.statCard, { flex: 1, marginLeft: 8 }]}>
            <View style={styles.statIconRow}>
              <Text style={styles.statIcon}>⭐</Text>
              <Text style={styles.statLabel}>Mastered</Text>
            </View>
            {loading ? (
              <ActivityIndicator color={Colors.accent} size="small" style={{ marginTop: 4 }} />
            ) : (
              <>
                <Text style={styles.statValue}>{totalMastered}</Text>
                <Text style={styles.statSub}>of {totalWords} words</Text>
              </>
            )}
          </View>
        </View>

        {/* Due Today banner */}
        {!loading && lists.length > 0 && (
          <TouchableOpacity
            style={styles.dueTodayCard}
            activeOpacity={0.85}
            onPress={() =>
              navigation.navigate('ModeSelect', { list: lists[0] })
            }
          >
            <View style={styles.dueTodayLeft}>
              <Text style={styles.dueTodayLabel}>Due Today</Text>
              <Text style={styles.dueTodayCount}>
                {totalUnmastered} words to practice
              </Text>
            </View>
            <View style={styles.playBtn}>
              <Ionicons name="play" size={20} color={Colors.text} />
            </View>
          </TouchableOpacity>
        )}

        {/* Your Sets section */}
        <Text style={styles.sectionTitle}>Your Sets</Text>

        {loading ? (
          <ActivityIndicator
            color={Colors.accent}
            size="large"
            style={{ marginTop: 32 }}
          />
        ) : lists.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No word lists found.</Text>
            <Text style={styles.emptySubText}>
              Add lists in the Library tab to get started.
            </Text>
          </View>
        ) : (
          lists.map((list) => {
            const pct =
              list.word_count > 0
                ? Math.round((list.mastered_count / list.word_count) * 100)
                : 0;
            return (
              <TouchableOpacity
                key={list.id}
                style={styles.listCard}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('ModeSelect', { list })}
              >
                <View style={styles.listCardHeader}>
                  <Text style={styles.listFlag}>
                    {getFlagEmoji(list.source_lang)}
                  </Text>
                  <View style={styles.listCardMeta}>
                    <Text style={styles.listName} numberOfLines={1}>
                      {list.name}
                    </Text>
                    <Text style={styles.listProgress}>
                      {list.mastered_count}/{list.word_count} mastered
                    </Text>
                  </View>
                  <View style={styles.pctBadge}>
                    <Text style={styles.pctText}>{pct}%</Text>
                  </View>
                </View>
                <View style={styles.progressBarWrap}>
                  <ProgressBarComp
                    value={list.mastered_count}
                    total={list.word_count}
                    color={Colors.accent}
                    height={4}
                  />
                </View>
              </TouchableOpacity>
            );
          })
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
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 24,
  },
  dateText: {
    fontFamily: Fonts.medium,
    fontSize: 13,
    color: Colors.textMuted,
    marginBottom: 4,
  },
  greeting: {
    fontFamily: Fonts.serifItalic,
    fontSize: 26,
    color: Colors.text,
    lineHeight: 32,
  },
  settingsBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface1,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  statsRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  statCard: {
    ...cardStyle,
    paddingVertical: 14,
  },
  statIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  statLabel: {
    fontFamily: Fonts.medium,
    fontSize: 12,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statValue: {
    fontFamily: Fonts.extraBold,
    fontSize: 32,
    color: Colors.text,
    lineHeight: 36,
  },
  statSub: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  dueTodayCard: {
    backgroundColor: Colors.accent,
    borderRadius: 18,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 28,
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  dueTodayLeft: {
    flex: 1,
  },
  dueTodayLabel: {
    fontFamily: Fonts.bold,
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  dueTodayCount: {
    fontFamily: Fonts.bold,
    fontSize: 18,
    color: Colors.text,
  },
  playBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontFamily: Fonts.bold,
    fontSize: 18,
    color: Colors.text,
    marginBottom: 14,
  },
  listCard: {
    ...cardStyle,
    marginBottom: 12,
  },
  listCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  listFlag: {
    fontSize: 28,
    marginRight: 12,
  },
  listCardMeta: {
    flex: 1,
  },
  listName: {
    fontFamily: Fonts.semiBold,
    fontSize: 15,
    color: Colors.text,
    marginBottom: 2,
  },
  listProgress: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: Colors.textMuted,
  },
  pctBadge: {
    backgroundColor: Colors.surface2,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pctText: {
    fontFamily: Fonts.bold,
    fontSize: 13,
    color: Colors.accentMauve,
  },
  progressBarWrap: {
    marginTop: 2,
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 40,
  },
  emptyText: {
    fontFamily: Fonts.semiBold,
    fontSize: 16,
    color: Colors.textMuted,
    marginBottom: 8,
  },
  emptySubText: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
  },
});
