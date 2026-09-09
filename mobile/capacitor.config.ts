import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.openeir.client',
  appName: 'OpenEir',
  webDir: 'shell/www',
  // The app is a "connect to your own server" shell: the user's validated
  // origin is only known at runtime, so allowNavigation must be broad for the
  // bridge to inject into it. Everything else (which origins are ever loaded,
  // http vs https) is enforced natively in OpenEirBridge/MainActivity.
  server: {
    allowNavigation: ['*'],
  },
  android: {
    backgroundColor: '#f7f2e9',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: '#f7f2e9',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
  },
};

export default config;
