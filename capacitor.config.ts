import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.royalkatti.casino',
  appName: 'Royal Katti 3D',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
    backgroundColor: '#070a0f',
  },
  plugins: {
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#070a0f',
      overlaysWebView: false,
    },
  },
};

export default config;
