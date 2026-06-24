import { useFocusEffect } from '@react-navigation/native';
import { Package, Users } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/src/components/Button';
import { Card } from '@/src/components/Card';
import { SectionTitle } from '@/src/components/SectionTitle';
import { deleteAccount, listClients, type ClientRow } from '@/src/lib/admin';
import { colors } from '@/src/theme/colors';
import { radius, spacing } from '@/src/theme/spacing';

function getInitials(name: string | null) {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function AdminClientsScreen() {
  const [clients, setClients]   = useState<ClientRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const data = await listClients();
    setClients(data);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function handleDelete(client: ClientRow) {
    Alert.alert(
      'Supprimer ce client',
      `Supprimer définitivement le compte de ${client.full_name ?? 'ce client'} ? Cette action est irréversible.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(client.id);
            const err = await deleteAccount(client.id);
            setDeletingId(null);
            if (err) {
              Alert.alert('Erreur', err);
            } else {
              load();
            }
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <SectionTitle title="Clients" />

        {loading ? (
          <View style={styles.centered}><ActivityIndicator color={colors.green} /></View>
        ) : error ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>{error}</Text>
            <Button title="Réessayer" variant="ghost" onPress={load} />
          </View>
        ) : clients.length === 0 ? (
          <View style={styles.centered}>
            <Users size={36} color={colors.muted} />
            <Text style={styles.emptyText}>Aucun client inscrit.</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {clients.map((client) => (
              <Card key={client.id} style={styles.clientCard}>
                <View style={styles.clientTop}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{getInitials(client.full_name)}</Text>
                  </View>
                  <View style={styles.clientInfo}>
                    <Text style={styles.clientName}>{client.full_name ?? 'Client'}</Text>
                    <Text style={styles.clientSub}>{client.phone ?? '—'}</Text>
                  </View>
                  <View style={styles.orderBadge}>
                    <Package size={13} color={colors.muted} />
                    <Text style={styles.orderCount}>{client.order_count}</Text>
                  </View>
                </View>

                <Text style={styles.clientDate}>Inscrit le {formatDate(client.created_at)}</Text>

                <Pressable
                  style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.7 }]}
                  onPress={() => handleDelete(client)}
                  disabled={deletingId === client.id}
                >
                  {deletingId === client.id
                    ? <ActivityIndicator size="small" color="#D14343" />
                    : <Text style={styles.deleteBtnText}>Supprimer le compte</Text>
                  }
                </Pressable>
              </Card>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea:     { flex: 1, backgroundColor: colors.bg },
  content:      { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  centered:     { alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  errorText:    { fontSize: 14, color: colors.muted, textAlign: 'center' },
  emptyText:    { fontSize: 14, color: colors.muted, textAlign: 'center' },
  list:         { gap: spacing.sm },
  clientCard:   { gap: spacing.md },
  clientTop:    { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: '#E8ECF4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText:   { fontSize: 15, fontWeight: '800', color: colors.navy },
  clientInfo:   { flex: 1, gap: 2 },
  clientName:   { fontSize: 14, fontWeight: '700', color: colors.ink },
  clientSub:    { fontSize: 12, color: colors.muted },
  orderBadge:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  orderCount:   { fontSize: 13, fontWeight: '700', color: colors.muted },
  clientDate:   { fontSize: 12, color: colors.muted },
  deleteBtn: {
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D14343',
  },
  deleteBtnText: { fontSize: 14, fontWeight: '700', color: '#D14343' },
});
