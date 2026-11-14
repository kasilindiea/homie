import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.homing.furniture',
  appName: 'Homie',
  webDir: 'dist',
  backgroundColor: '#f6f5ef',
  android: { backgroundColor: '#f6f5ef', allowMixedContent: false },
  plugins: {
    SystemBars: { insetsHandling: 'native', initialViewportFitValueHint: 'cover', style: 'LIGHT' },
  },
};

export default config;
