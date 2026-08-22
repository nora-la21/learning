export const Colors = {
  bg: '#141820',
  surface1: '#1c212b',
  surface2: '#2a303c',
  accent: '#9c4450',
  accentMauve: '#b8b5b0',
  teal: '#3a4150',
  mauve: '#6a2e3a',
  text: '#ffffff',
  textMuted: 'rgba(255,255,255,0.45)',
  borderSubtle: 'rgba(255,255,255,0.06)',
  borderMid: 'rgba(255,255,255,0.10)',
  correct: '#4caf6e',
  wrong: '#e05555',
  almost: '#e09555',
} as const;

export const Fonts = {
  // Plus Jakarta Sans
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semiBold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extraBold: 'PlusJakartaSans_800ExtraBold',
  // Instrument Serif
  serif: 'InstrumentSerif_400Regular',
  serifItalic: 'InstrumentSerif_400Regular_Italic',
} as const;

export const Radii = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
} as const;

export const cardStyle = {
  backgroundColor: Colors.surface1,
  borderRadius: Radii.lg,
  borderWidth: 1,
  borderColor: Colors.borderSubtle,
  padding: 16,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.25,
  shadowRadius: 8,
  elevation: 4,
} as const;
