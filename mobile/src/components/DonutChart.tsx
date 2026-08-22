import React from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

interface DonutChartProps {
  pct: number;      // 0–100
  color: string;
  size?: number;
  stroke?: number;
  bgColor?: string;
}

export default function DonutChart({
  pct,
  color,
  size = 64,
  stroke = 7,
  bgColor = 'rgba(255,255,255,0.08)',
}: DonutChartProps) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedPct = Math.min(100, Math.max(0, pct));
  const dashOffset = circumference * (1 - clampedPct / 100);
  const center = size / 2;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {/* Background track */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={bgColor}
          strokeWidth={stroke}
          fill="none"
        />
        {/* Progress arc */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${center}, ${center}`}
        />
      </Svg>
    </View>
  );
}
