import {
  androidEmulator,
  androidPlatform,
} from '@react-native-harness/platform-android';
import {
  applePlatform,
  appleSimulator,
} from '@react-native-harness/platform-apple';

export default {
  entryPoint: './index.js',
  appRegistryComponentName: 'NitroPasskeysExample',
  // Allow local runs alongside an existing Metro server and newer simulators.
  metroPort: Number(process.env.HARNESS_METRO_PORT ?? 8081),

  runners: [
    androidPlatform({
      name: 'medium_phone_api_36.1',
      device: androidEmulator('Medium_Phone_API_36.1'),
      bundleId: 'com.nitropasskeysexample',
    }),
    applePlatform({
      name: 'iphone-17',
      device: appleSimulator(
        'iPhone 17',
        process.env.HARNESS_IOS_VERSION ?? '26.4',
      ),
      bundleId: 'com.nitropasskeysexample',
    }),
  ],
  defaultRunner: 'iphone-17',
};
