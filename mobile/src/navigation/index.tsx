import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Fonts } from '../theme';
import HomeScreen from '../screens/HomeScreen';
import LibraryScreen from '../screens/LibraryScreen';
import StatsScreen from '../screens/StatsScreen';
import ModeSelectScreen from '../screens/ModeSelectScreen';
import QuizScreen from '../screens/QuizScreen';
import ResultsScreen from '../screens/ResultsScreen';
import { WordList, GameMode } from '../types';

// ── Param list types ──────────────────────────────────────────────────────────

export type HomeStackParamList = {
  HomeMain: undefined;
  ModeSelect: { list: WordList };
  Quiz: { list: WordList; mode: GameMode };
  Results: { score: number; total: number; list: WordList; mode: GameMode };
};

export type LibraryStackParamList = {
  LibraryMain: undefined;
  ModeSelect: { list: WordList };
  Quiz: { list: WordList; mode: GameMode };
  Results: { score: number; total: number; list: WordList; mode: GameMode };
};

export type StatsStackParamList = {
  StatsMain: undefined;
  ModeSelect: { list: WordList };
  Quiz: { list: WordList; mode: GameMode };
  Results: { score: number; total: number; list: WordList; mode: GameMode };
};

// ── Stack navigators ──────────────────────────────────────────────────────────

const HomeStack = createNativeStackNavigator<HomeStackParamList>();
function HomeStackNav() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="HomeMain" component={HomeScreen} />
      <HomeStack.Screen name="ModeSelect" component={ModeSelectScreen} />
      <HomeStack.Screen name="Quiz" component={QuizScreen} />
      <HomeStack.Screen name="Results" component={ResultsScreen} />
    </HomeStack.Navigator>
  );
}

const LibraryStack = createNativeStackNavigator<LibraryStackParamList>();
function LibraryStackNav() {
  return (
    <LibraryStack.Navigator screenOptions={{ headerShown: false }}>
      <LibraryStack.Screen name="LibraryMain" component={LibraryScreen} />
      <LibraryStack.Screen name="ModeSelect" component={ModeSelectScreen} />
      <LibraryStack.Screen name="Quiz" component={QuizScreen} />
      <LibraryStack.Screen name="Results" component={ResultsScreen} />
    </LibraryStack.Navigator>
  );
}

const StatsStack = createNativeStackNavigator<StatsStackParamList>();
function StatsStackNav() {
  return (
    <StatsStack.Navigator screenOptions={{ headerShown: false }}>
      <StatsStack.Screen name="StatsMain" component={StatsScreen} />
      <StatsStack.Screen name="ModeSelect" component={ModeSelectScreen} />
      <StatsStack.Screen name="Quiz" component={QuizScreen} />
      <StatsStack.Screen name="Results" component={ResultsScreen} />
    </StatsStack.Navigator>
  );
}

// ── Bottom tab navigator ──────────────────────────────────────────────────────

const Tab = createBottomTabNavigator();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarStyle: {
            backgroundColor: Colors.bg,
            borderTopColor: 'rgba(255,255,255,0.07)',
            borderTopWidth: 1,
            paddingBottom: 6,
            paddingTop: 6,
            height: 60,
          },
          tabBarActiveTintColor: Colors.accent,
          tabBarInactiveTintColor: Colors.textMuted,
          tabBarLabelStyle: {
            fontFamily: Fonts.semiBold,
            fontSize: 11,
            marginTop: 2,
          },
          tabBarIcon: ({ color, size, focused }) => {
            let iconName: keyof typeof Ionicons.glyphMap = 'home';
            if (route.name === 'Home') {
              iconName = focused ? 'home' : 'home-outline';
            } else if (route.name === 'Library') {
              iconName = focused ? 'library' : 'library-outline';
            } else if (route.name === 'Progress') {
              iconName = focused ? 'bar-chart' : 'bar-chart-outline';
            }
            return <Ionicons name={iconName} size={size} color={color} />;
          },
        })}
      >
        <Tab.Screen name="Home" component={HomeStackNav} />
        <Tab.Screen name="Library" component={LibraryStackNav} />
        <Tab.Screen name="Progress" component={StatsStackNav} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
