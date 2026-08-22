import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';

import { Colors, Fonts, cardStyle } from '../theme';
import { WordList } from '../types';
import { getLists } from '../api/client';
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

export default function LibraryScreen() {
  const [userLists, setUserLists] = useState<WordList[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchLists = useCallback(async () => {
    try {
      const data = await getLists(false);
      setUserLists(data);
    } catch (e) {
      console.error('Failed to load user lists:', e);
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

  const handleBrowseFiles = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/plain', 'text/csv', '*/*'],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets.length > 0) {
        const file = result.assets[0];
        Alert.alert(
          'File Selected',
          `"${file.name}" selected.\n\nUpload functionality coming soon — connect this to your backend's list import endpoint.`,
          [{ text: 'OK' }],
        );
      }
    } catch (e) {
      Alert.alert('Error', 'Could not open file picker.');
    }
  };

  const handleDelete = (list: WordList) => {
    Alert.alert(
      'Delete List',
      `Delete "${list.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            // Optimistically remove from UI; wire to DELETE endpoint when available
            setUserLists((prev) => prev.filter((l) => l.id !== list.id));
          },
        },
      ],
    );
  };

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
          <Text style={styles.headerTitle}>Library</Text>
        </View>

        {/* Upload zone */}
        <View style={styles.uploadZone}>
          <Ionicons
            name="cloud-upload-outline"
            size={36}
            color={Colors.textMuted}
            style={{ marginBottom: 10 }}
          />
          <Text style={styles.uploadTitle}>Drop your word list</Text>
          <Text style={styles.uploadHint}>
            A plain text or CSV file with one word pair per line
          </Text>
          <TouchableOpacity
            style={styles.browseBtn}
            activeOpacity={0.85}
            onPress={handleBrowseFiles}
          >
            <Text style={styles.browseBtnText}>Browse files</Text>
          </TouchableOpacity>
        </View>

        {/* Format hint */}
        <View style={styles.formatHint}>
          <Ionicons
            name="information-circle-outline"
            size={14}
            color={Colors.textMuted}
            style={{ marginRight: 6, marginTop: 1 }}
          />
          <Text style={styles.formatHintText}>
            Format: <Text style={styles.formatCode}>word, translation</Text> — one pair per line
          </Text>
        </View>

        {/* Collections section */}
        <View style={styles.collectionsHeader}>
          <Text style={styles.sectionTitle}>Collections</Text>
          <Text style={styles.collectionCount}>{userLists.length} lists</Text>
        </View>

        {loading ? (
          <ActivityIndicator
            color={Colors.accent}
            size="large"
            style={{ marginTop: 32 }}
          />
        ) : userLists.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="folder-open-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No custom lists yet</Text>
            <Text style={styles.emptySubText}>
              Upload a word list above to create your first collection.
            </Text>
          </View>
        ) : (
          userLists.map((list) => {
            const pct =
              list.word_count > 0
                ? Math.round((list.mastered_count / list.word_count) * 100)
                : 0;
            return (
              <View key={list.id} style={styles.listCard}>
                <View style={styles.listCardHeader}>
                  <Text style={styles.listFlag}>
                    {getFlagEmoji(list.source_lang)}
                  </Text>
                  <View style={styles.listMeta}>
                    <Text style={styles.listName} numberOfLines={1}>
                      {list.name}
                    </Text>
                    <Text style={styles.listSub}>
                      {pct}% mastered · {list.word_count} words
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    activeOpacity={0.8}
                    onPress={() => handleDelete(list)}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={18}
                      color={Colors.textMuted}
                    />
                  </TouchableOpacity>
                </View>
                <ProgressBarComp
                  value={list.mastered_count}
                  total={list.word_count}
                  color={Colors.accent}
                  height={4}
                />
              </View>
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
  uploadZone: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
    borderStyle: 'dashed',
    borderRadius: 18,
    paddingVertical: 36,
    paddingHorizontal: 24,
    alignItems: 'center',
    backgroundColor: Colors.surface1,
    marginBottom: 12,
  },
  uploadTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: 16,
    color: Colors.text,
    marginBottom: 8,
  },
  uploadHint: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 18,
  },
  browseBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  browseBtnText: {
    fontFamily: Fonts.semiBold,
    fontSize: 14,
    color: Colors.text,
  },
  formatHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 28,
    paddingHorizontal: 4,
  },
  formatHintText: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: Colors.textMuted,
    flex: 1,
    lineHeight: 17,
  },
  formatCode: {
    fontFamily: Fonts.medium,
    color: Colors.accentMauve,
  },
  collectionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sectionTitle: {
    fontFamily: Fonts.bold,
    fontSize: 18,
    color: Colors.text,
  },
  collectionCount: {
    fontFamily: Fonts.medium,
    fontSize: 13,
    color: Colors.textMuted,
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
    fontSize: 26,
    marginRight: 12,
  },
  listMeta: {
    flex: 1,
  },
  listName: {
    fontFamily: Fonts.semiBold,
    fontSize: 15,
    color: Colors.text,
    marginBottom: 2,
  },
  listSub: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: Colors.textMuted,
  },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 40,
    paddingHorizontal: 20,
  },
  emptyText: {
    fontFamily: Fonts.semiBold,
    fontSize: 16,
    color: Colors.textMuted,
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubText: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
});
