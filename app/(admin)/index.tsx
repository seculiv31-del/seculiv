import { Redirect } from 'expo-router';

export default function AdminRoot() {
  return <Redirect href="/(admin)/(tabs)" />;
}
