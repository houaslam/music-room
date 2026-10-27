import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import AccountScreen from './src/screens/AccountScreen';
import RegisterScreen from './src/screens/RegisterScreen';

export default function App() {
  // no login on the backend yet, so the id that register sends back is the only
  // thing that says who we are. it only lives in memory: restart the app and it's gone
  const [userId, setUserId] = useState<string | null>(null);

  return (
    <View style={styles.container}>
      {userId ? (
        <AccountScreen userId={userId} onDeleted={() => setUserId(null)} />
      ) : (
        <RegisterScreen onRegistered={setUserId} />
      )}
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
});
