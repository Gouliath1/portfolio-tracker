import React from 'react';
import { SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { formatBrokerDisplay } from '@portfolio/core';

export default function App() {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.card}>
        <Text style={styles.title}>Portfolio Tracker</Text>
        <Text style={styles.subtitle}>Shared services, now on mobile 🚀</Text>
        <Text style={styles.caption}>
          Example broker display: {formatBrokerDisplay('CreditAgricole')}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 360,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#cbd5f5',
    marginBottom: 16,
  },
  caption: {
    fontSize: 14,
    color: '#94a3b8',
  },
});
