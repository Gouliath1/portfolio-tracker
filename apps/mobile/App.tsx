import React, { useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet, Text, View, ScrollView, ActivityIndicator, Button } from 'react-native';
import { registerRootComponent } from 'expo';
import { usePortfolioData } from './src/hooks/usePortfolioData';
import { PortfolioSummary } from './src/components/PortfolioSummary';

function App() {
  const { snapshot, isLoading, error, refresh } = usePortfolioData();
  const [showValues, setShowValues] = useState(true);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>Loading portfolio...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>Error: {error}</Text>
          <Button title="Retry" onPress={refresh} />
        </View>
      </SafeAreaView>
    );
  }

  if (!snapshot) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>No portfolio data available</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <ScrollView style={styles.scrollView}>
        <View style={styles.header}>
          <Text style={styles.title}>Portfolio Tracker</Text>
          <View style={styles.headerButtons}>
            <Button
              title={showValues ? "Hide" : "Show"}
              onPress={() => setShowValues(!showValues)}
            />
            <View style={styles.buttonSpacer} />
            <Button title="Refresh" onPress={refresh} />
          </View>
        </View>
        <PortfolioSummary snapshot={snapshot} showValues={showValues} />
      </ScrollView>
    </SafeAreaView>
  );
}

registerRootComponent(App);

export default App;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonSpacer: {
    width: 12,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    fontSize: 16,
    color: '#dc2626',
    marginBottom: 16,
    textAlign: 'center',
  },
});
