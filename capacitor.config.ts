import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nurulizah.petbacker',
  appName: 'PetBacker Test',
  webDir: 'dist',
  server: {
    androidScheme: "https"
  }
};

export default config;
