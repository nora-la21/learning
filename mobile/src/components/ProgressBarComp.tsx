import React from 'react';
import { View, StyleSheet } from 'react-native';

interface ProgressBarProps {
  value: number;
  total: number;
  color?: string;
  height?: number;
  bgColor?: string;
}

export default function ProgressBarComp({
  value,
  total,
  color = '#9c4450',
  height = 4,
  bgColor = 'rgba(255,255,255,0.08)',
}: ProgressBarProps) {
  const pct = total > 0 ? Math.min(1, value / total) : 0;

  return (
    <View style={[styles.track, { height, backgroundColor: bgColor, borderRadius: height / 2 }]}>
      <View
        style={[
          styles.fill,
          {
            width: `${pct * 100}%`,
            height,
            backgroundColor: color,
            borderRadius: height / 2,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    overflow: 'hidden',
  },
  fill: {},
});
