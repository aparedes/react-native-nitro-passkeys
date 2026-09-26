import { useState } from 'react';
import {
  Button,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
} from 'react-native';
import {
  createPasskey,
  getPasskey,
  isPasskeySupported,
  PasskeyError,
} from 'react-native-nitro-passkeys';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { SERVER_URL } from './src/config';

async function post(path: string, body: unknown): Promise<any> {
  const response = await fetch(`${SERVER_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return response.json();
}

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const [username, setUsername] = useState('alice');
  const [result, setResult] = useState('');

  async function run(flow: () => Promise<unknown>) {
    setResult('...');
    try {
      setResult(JSON.stringify(await flow(), null, 2));
    } catch (e) {
      const code = e instanceof PasskeyError ? e.code : 'non-PasskeyError';
      setResult(`${code}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const register = () =>
    run(async () => {
      const options = await post('/register/options', { username });
      const response = await createPasskey(options);
      return post('/register/verify', {
        username,
        platform: Platform.OS,
        response,
      });
    });

  const login = () =>
    run(async () => {
      const options = await post('/login/options', {});
      const response = await getPasskey(options);
      return post('/login/verify', { platform: Platform.OS, response });
    });

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Nitro Passkeys</Text>
        <Text>Supported: {String(isPasskeySupported())}</Text>
        <Text>Server: {SERVER_URL}</Text>
        <TextInput
          style={styles.input}
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="username"
        />
        <Button title="Register" onPress={register} />
        <Button title="Log in" onPress={login} />
        <Text selectable style={styles.result}>
          {result}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { padding: 16, gap: 12 },
  title: { fontSize: 24, fontWeight: '600' },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    padding: 10,
  },
  result: {
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
  },
});

export default App;
