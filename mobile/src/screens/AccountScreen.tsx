import { useState } from 'react';
import { Alert, Button, StyleSheet, Text, View } from 'react-native';
import { deleteAccount } from '../api/auth';
import { ApiError } from '../api/client';

type Props = {
  userId: string;
  onDeleted: () => void;
};

export default function AccountScreen({ userId, onDeleted }: Props) {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function confirmDelete() {
    Alert.alert('Delete account', "This can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: handleDelete },
    ]);
  }

  async function handleDelete() {
    setError('');
    setLoading(true);
    try {
      await deleteAccount(userId);
      onDeleted();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Something went wrong, try again.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Account created</Text>

      <Text style={styles.label}>Your user id</Text>
      <Text style={styles.userId} selectable>
        {userId}
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button
        title={loading ? 'Deleting...' : 'Delete account'}
        color="#d32f2f"
        onPress={confirmDelete}
        disabled={loading}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    paddingTop: 96,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 12,
  },
  label: {
    color: '#666',
  },
  userId: {
    marginBottom: 12,
  },
  error: {
    color: '#d32f2f',
  },
});
