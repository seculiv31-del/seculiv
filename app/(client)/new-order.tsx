import * as Location from 'expo-location';
import { AudioModule, RecordingPresets, useAudioPlayer, useAudioRecorder } from 'expo-audio';
import { router } from 'expo-router';
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  Check,
  CheckCircle2,
  Lock,
  MapPin,
  Mic,
  MicOff,
  Play,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Volume2,
  X,
} from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/src/components/Button';
import { Card } from '@/src/components/Card';
import NotificationPrompt from '@/src/components/NotificationPrompt';
import { TextField } from '@/src/components/TextField';
import { useAuth } from '@/src/lib/AuthContext';
import {
  calculateDistance,
  calculatePrice,
  estimateDuration,
  loadPricingConfig,
} from '@/src/lib/pricing';
import type { Coords, PriceBreakdown, PricingConfig } from '@/src/lib/pricing';
import { storeSecretCode } from '@/src/lib/secretCodes';
import { supabase } from '@/src/lib/supabase';
import { uploadVoiceGuidance } from '@/src/lib/uploadVoiceGuidance';
import { colors } from '@/src/theme/colors';
import { getPlan, PLANS } from '@/src/theme/plans';
import { radius, spacing } from '@/src/theme/spacing';
import type { ParcelType, ProtectionLevel } from '@/src/types';

// ─── Constantes ───────────────────────────────────────────────────────────────

const VIOLET      = '#6B4FA8';
const VIOLET_SOFT = '#F0ECFA';

const STEP_TITLES: Record<number, string> = {
  1: 'Adresses',
  2: 'Type de colis',
  3: 'Protection',
  4: 'Paiement & validation',
};

// Centre de Dakar — position par défaut du sélecteur carte.
const DAKAR: { latitude: number; longitude: number } = { latitude: 14.7167, longitude: -17.4677 };

const PARCEL_TYPE_OPTIONS: { value: ParcelType; label: string; description: string }[] = [
  { value: 'standard',      label: 'Standard',           description: 'Colis courant, sans exigence particulière.'         },
  { value: 'fragile',       label: 'Fragile',            description: 'Manipulation avec précaution renforcée.'           },
  { value: 'valeur_elevee', label: 'Valeur élevée',      description: 'Objet de valeur, suivi renforcé du trajet.'       },
  { value: 'confidentiel',  label: 'Confidentiel',       description: 'Contenu discret, accès limité au livreur assigné.' },
  { value: 'sensible',      label: 'Livraison sensible', description: 'Double vérification à la remise (renforcée).'     },
];

const ID_TYPES = [
  { value: 'cni',       label: "Carte Nationale d'Identité (CNI)" },
  { value: 'passeport', label: 'Passeport'                        },
  { value: 'permis',    label: 'Permis de conduire'               },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Coordonnées précises nécessaires au calcul de prix (Haversine + facteur urbain).
async function geocodeAddress(address: string): Promise<Coords | null> {
  try {
    const results = await Location.geocodeAsync(`${address.trim()}, Dakar, Sénégal`);
    if (results.length > 0) return { lat: results[0].latitude, lng: results[0].longitude };
    return null;
  } catch {
    return null;
  }
}

// ─── Écran principal ──────────────────────────────────────────────────────────

export default function NewOrderScreen() {
  const { user } = useAuth();

  const [step, setStep] = useState(1);

  // Adresses (texte)
  const [pickupAddress,  setPickupAddress]  = useState('');
  const [pickupNotes,    setPickupNotes]    = useState('');
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [dropoffName,    setDropoffName]    = useState('');
  const [dropoffPhone,   setDropoffPhone]   = useState('');
  const [dropoffNotes,   setDropoffNotes]   = useState('');
  const [pickupVoiceUri, setPickupVoiceUri] = useState<string | null>(null);

  // Coordonnées — effacées dès que le texte d'adresse change
  const [pickupCoords,  setPickupCoords]  = useState<Coords | null>(null);
  const [dropoffCoords, setDropoffCoords] = useState<Coords | null>(null);

  // Sélecteur carte (modale)
  const [mapPickerFor,   setMapPickerFor]   = useState<'pickup' | 'dropoff' | null>(null);
  const [mapPickerDraft, setMapPickerDraft] = useState<Coords | null>(null);

  // Tarification
  const [pricingConfig,   setPricingConfig]   = useState<PricingConfig | null>(null);
  const [priceBreakdown,  setPriceBreakdown]  = useState<PriceBreakdown | null>(null);
  const [geocodingLoading,setGeocodingLoading]= useState(false);

  // Colis / protection
  const [parcelType,       setParcelType]       = useState<ParcelType | null>(null);
  const [protectionLevel,  setProtectionLevel]  = useState<ProtectionLevel | null>(null);

  // Champs sensible
  const [expectedIdType, setExpectedIdType] = useState<string | null>(null);
  const [expectedIdName, setExpectedIdName] = useState('');

  // UI
  const [error,      setError]      = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Confirmation
  const [orderConfirmed,    setOrderConfirmed]    = useState(false);
  const [confirmedCode,     setConfirmedCode]     = useState<string | null>(null);
  const [confirmedCodeDest, setConfirmedCodeDest] = useState<string | null>(null);
  const [confirmedPrice,    setConfirmedPrice]    = useState(0);
  const [confirmedSensible, setConfirmedSensible] = useState(false);

  const isSensible = parcelType === 'sensible';
  const plan  = protectionLevel ? getPlan(protectionLevel) : null;
  const price = priceBreakdown?.total ?? 0;

  // Charge la config tarifaire une fois au montage
  useEffect(() => {
    loadPricingConfig().then(setPricingConfig).catch(() => {});
  }, []);

  // Calcule le prix dès qu'on arrive à l'étape 4 (coords + type + config disponibles)
  useEffect(() => {
    if (step !== 4 || !pickupCoords || !dropoffCoords || !parcelType || !pricingConfig) return;
    const km      = calculateDistance(pickupCoords, dropoffCoords);
    const minutes = estimateDuration(km);
    setPriceBreakdown(calculatePrice({ km, minutes, parcelType, config: pricingConfig }));
  }, [step, pickupCoords, dropoffCoords, parcelType, pricingConfig]);

  function goBack() {
    if (step === 1) { router.back(); return; }
    setError(null);
    setStep((c) => c - 1);
  }

  async function goNext() {
    setError(null);

    if (step === 1) {
      if (!pickupAddress.trim() || !dropoffAddress.trim() || !dropoffName.trim() || !dropoffPhone.trim()) {
        setError("Renseigne l'adresse d'enlèvement, l'adresse de livraison, le nom et le téléphone du destinataire.");
        return;
      }

      // Géocode les adresses dont les coords ne sont pas encore connues
      if (!pickupCoords || !dropoffCoords) {
        setGeocodingLoading(true);
        const [pC, dC] = await Promise.all([
          pickupCoords  ? Promise.resolve(pickupCoords)  : geocodeAddress(pickupAddress),
          dropoffCoords ? Promise.resolve(dropoffCoords) : geocodeAddress(dropoffAddress),
        ]);
        setGeocodingLoading(false);

        if (!pC) {
          setPickupCoords(null);
          setError("Adresse d'enlèvement introuvable. Précisez-la sur la carte.");
          setMapPickerFor('pickup');
          setMapPickerDraft(null);
          return;
        }
        if (!dC) {
          setDropoffCoords(null);
          setError('Adresse de livraison introuvable. Précisez-la sur la carte.');
          setMapPickerFor('dropoff');
          setMapPickerDraft(null);
          return;
        }
        setPickupCoords(pC);
        setDropoffCoords(dC);
      }
    }

    if (step === 2) {
      if (!parcelType) { setError('Choisis un type de colis pour continuer.'); return; }
      if (isSensible) {
        if (!expectedIdType)        { setError("Sélectionne le type de pièce d'identité attendue."); return; }
        if (!expectedIdName.trim()) { setError("Renseigne le nom exact figurant sur la pièce d'identité."); return; }
      }
    }

    if (step === 3 && !protectionLevel) { setError('Choisis une formule de protection pour continuer.'); return; }

    setStep((c) => Math.min(4, c + 1));
  }

  async function handleSubmit() {
    if (!user || !parcelType || !protectionLevel || !priceBreakdown) return;

    setSubmitting(true);
    setError(null);

    let voiceGuidancePath: string | undefined;
    if (pickupVoiceUri) {
      const uploadResult = await uploadVoiceGuidance(pickupVoiceUri);
      if ('path' in uploadResult) voiceGuidancePath = uploadResult.path;
    }

    const { data: newOrder, error: insertError } = await supabase
      .from('orders')
      .insert({
        client_id:        user.id,
        pickup: {
          address:            pickupAddress.trim(),
          notes:              pickupNotes.trim() || undefined,
          voice_guidance_url: voiceGuidancePath,
          ...(pickupCoords  ? { lat: pickupCoords.lat,  lng: pickupCoords.lng  } : {}),
        },
        dropoff: {
          address: dropoffAddress.trim(),
          name:    dropoffName.trim(),
          phone:   dropoffPhone.trim(),
          notes:   dropoffNotes.trim() || undefined,
          ...(dropoffCoords ? { lat: dropoffCoords.lat, lng: dropoffCoords.lng } : {}),
        },
        parcel_type:      parcelType,
        protection_level: protectionLevel,
        price_fcfa:       priceBreakdown.total,
        status:           'en_attente',
        payment_method:   'cash',
        payment_status:   'en_attente',
        is_sensitive:     isSensible,
        expected_id_type: isSensible ? expectedIdType : null,
        expected_id_name: isSensible ? expectedIdName.trim() : null,
      })
      .select('id')
      .single();

    if (insertError || !newOrder) {
      setSubmitting(false);
      setError('La création de la commande a échoué. Vérifie ta connexion et réessaie.');
      return;
    }

    if (isSensible) {
      const [expRes, destRes] = await Promise.all([
        supabase.functions.invoke('generate-secret-code', { body: { order_id: newOrder.id, code_type: 'expediteur'   } }),
        supabase.functions.invoke('generate-secret-code', { body: { order_id: newOrder.id, code_type: 'destinataire' } }),
      ]);
      const codeExp  = expRes.data?.code  as string | undefined;
      const codeDest = destRes.data?.code as string | undefined;
      if (codeExp) await storeSecretCode(newOrder.id, codeExp);
      setConfirmedCode(codeExp ?? null);
      setConfirmedCodeDest(codeDest ?? null);
    } else {
      const { data: secretCode } = await supabase.rpc('generate_secret_code', { p_order_id: newOrder.id });
      if (typeof secretCode === 'string') await storeSecretCode(newOrder.id, secretCode);
      setConfirmedCode(typeof secretCode === 'string' ? secretCode : null);
    }

    setConfirmedPrice(priceBreakdown.total);
    setConfirmedSensible(isSensible);
    setSubmitting(false);
    setOrderConfirmed(true);
  }

  // ── Confirmation screen ────────────────────────────────────────────────────
  if (orderConfirmed) {
    return (
      <SafeAreaView style={styles.confirmedSafe} edges={['top', 'bottom']}>
        <OrderConfirmedScreen
          price={confirmedPrice}
          code={confirmedCode}
          codeDest={confirmedCodeDest}
          isSensible={confirmedSensible}
          onTrack={() => router.replace('/track')}
        />
        <NotificationPrompt trigger={orderConfirmed} />
      </SafeAreaView>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>

      {/* Sélecteur carte (modale) */}
      {mapPickerFor !== null && (
        <Modal visible animationType="slide" onRequestClose={() => setMapPickerFor(null)}>
          <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
            <View style={styles.mapPickerHeader}>
              <Pressable onPress={() => setMapPickerFor(null)} style={styles.iconButton}>
                <X size={22} color={colors.ink} />
              </Pressable>
              <Text style={styles.mapPickerTitle}>
                {mapPickerFor === 'pickup' ? "Point d'enlèvement" : 'Point de livraison'}
              </Text>
              <View style={{ width: 40 }} />
            </View>
            <Text style={styles.mapPickerHint}>Appuyez sur la carte ou faites glisser le marqueur.</Text>
            <MapView
              style={{ flex: 1 }}
              initialRegion={{
                latitude:       mapPickerDraft?.lat ?? DAKAR.latitude,
                longitude:      mapPickerDraft?.lng ?? DAKAR.longitude,
                latitudeDelta:  0.08,
                longitudeDelta: 0.08,
              }}
              onPress={(e) => setMapPickerDraft({
                lat: e.nativeEvent.coordinate.latitude,
                lng: e.nativeEvent.coordinate.longitude,
              })}
            >
              {mapPickerDraft && (
                <Marker
                  coordinate={{ latitude: mapPickerDraft.lat, longitude: mapPickerDraft.lng }}
                  draggable
                  pinColor={mapPickerFor === 'pickup' ? colors.navy : colors.green}
                  onDragEnd={(e) => setMapPickerDraft({
                    lat: e.nativeEvent.coordinate.latitude,
                    lng: e.nativeEvent.coordinate.longitude,
                  })}
                />
              )}
            </MapView>
            <View style={styles.mapPickerFooter}>
              <Button
                title="Confirmer la position"
                disabled={!mapPickerDraft}
                onPress={() => {
                  if (!mapPickerDraft) return;
                  if (mapPickerFor === 'pickup') setPickupCoords(mapPickerDraft);
                  else                           setDropoffCoords(mapPickerDraft);
                  setMapPickerFor(null);
                  setError(null);
                }}
              />
              <Button title="Annuler" variant="ghost" onPress={() => setMapPickerFor(null)} />
            </View>
          </SafeAreaView>
        </Modal>
      )}

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.topBar}>
          <View style={styles.header}>
            <Pressable onPress={goBack} style={styles.iconButton}>
              {step === 1 ? <X size={22} color={colors.ink} /> : <ArrowLeft size={22} color={colors.ink} />}
            </Pressable>
            <Text style={styles.headerTitle}>{STEP_TITLES[step]}</Text>
            <Text style={styles.headerStep}>{step}/4</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${step * 25}%` }]} />
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {step === 1 && (
            <StepAddresses
              pickupAddress={pickupAddress}
              pickupNotes={pickupNotes}
              pickupVoiceUri={pickupVoiceUri}
              dropoffAddress={dropoffAddress}
              dropoffName={dropoffName}
              dropoffPhone={dropoffPhone}
              dropoffNotes={dropoffNotes}
              pickupCoords={pickupCoords}
              dropoffCoords={dropoffCoords}
              onPickupAddressChange={(v) => { setPickupAddress(v);  setPickupCoords(null);  }}
              onPickupNotesChange={setPickupNotes}
              onPickupVoiceChange={setPickupVoiceUri}
              onDropoffAddressChange={(v) => { setDropoffAddress(v); setDropoffCoords(null); }}
              onDropoffNameChange={setDropoffName}
              onDropoffPhoneChange={setDropoffPhone}
              onDropoffNotesChange={setDropoffNotes}
              onMapPickerOpen={(target) => {
                setMapPickerFor(target);
                setMapPickerDraft(target === 'pickup' ? pickupCoords : dropoffCoords);
              }}
            />
          )}

          {step === 2 && (
            <StepParcelType
              parcelType={parcelType}
              setParcelType={setParcelType}
              expectedIdType={expectedIdType}
              setExpectedIdType={setExpectedIdType}
              expectedIdName={expectedIdName}
              setExpectedIdName={setExpectedIdName}
              dropoffName={dropoffName}
              pricingConfig={pricingConfig}
            />
          )}

          {step === 3 && (
            <StepProtection protectionLevel={protectionLevel} setProtectionLevel={setProtectionLevel} />
          )}

          {step === 4 && (
            <StepPayment
              priceBreakdown={priceBreakdown}
              pickupAddress={pickupAddress}
              dropoffAddress={dropoffAddress}
              isSensible={isSensible}
              pricingConfig={pricingConfig}
            />
          )}
        </ScrollView>

        <View style={styles.footer}>
          {error && <Text style={styles.errorText}>{error}</Text>}
          {step < 4 ? (
            geocodingLoading ? (
              <View style={styles.geocodingRow}>
                <ActivityIndicator size="small" color={colors.green} />
                <Text style={styles.geocodingText}>Localisation des adresses…</Text>
              </View>
            ) : (
              <Button title="Continuer" onPress={goNext} />
            )
          ) : (
            <Button
              title={price > 0 ? `Valider la commande · ${price.toLocaleString('fr-FR')} F` : 'Calcul en cours…'}
              onPress={handleSubmit}
              loading={submitting}
              disabled={!priceBreakdown || submitting}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Step 1 : Adresses ────────────────────────────────────────────────────────

type StepAddressesProps = {
  pickupAddress: string;
  pickupNotes: string;
  pickupVoiceUri: string | null;
  dropoffAddress: string;
  dropoffName: string;
  dropoffPhone: string;
  dropoffNotes: string;
  pickupCoords: Coords | null;
  dropoffCoords: Coords | null;
  onPickupAddressChange: (v: string) => void;
  onPickupNotesChange: (v: string) => void;
  onPickupVoiceChange: (v: string | null) => void;
  onDropoffAddressChange: (v: string) => void;
  onDropoffNameChange: (v: string) => void;
  onDropoffPhoneChange: (v: string) => void;
  onDropoffNotesChange: (v: string) => void;
  onMapPickerOpen: (target: 'pickup' | 'dropoff') => void;
};

function StepAddresses(p: StepAddressesProps) {
  return (
    <View style={styles.stepGap}>
      <Card style={styles.addressCard}>
        <View style={styles.addressHeader}>
          <MapPin size={18} color={colors.navy} />
          <Text style={styles.addressTitle}>Enlèvement</Text>
        </View>
        <TextField
          label="Adresse de récupération"
          placeholder="Ex. Sacré-Cœur 3, Dakar"
          value={p.pickupAddress}
          onChangeText={p.onPickupAddressChange}
        />
        <CoordsStatus address={p.pickupAddress} coords={p.pickupCoords} onMapOpen={() => p.onMapPickerOpen('pickup')} />
        <TextField label="Notes (optionnel)" placeholder="Étage, portail, repère…" value={p.pickupNotes} onChangeText={p.onPickupNotesChange} />
        <VoiceRecorderWidget voiceUri={p.pickupVoiceUri} onRecorded={p.onPickupVoiceChange} />
      </Card>

      <Card style={styles.addressCard}>
        <View style={styles.addressHeader}>
          <MapPin size={18} color={colors.green} />
          <Text style={styles.addressTitle}>Livraison</Text>
        </View>
        <TextField
          label="Adresse de livraison"
          placeholder="Ex. Plateau, Dakar"
          value={p.dropoffAddress}
          onChangeText={p.onDropoffAddressChange}
        />
        <CoordsStatus address={p.dropoffAddress} coords={p.dropoffCoords} onMapOpen={() => p.onMapPickerOpen('dropoff')} />
        <TextField label="Nom du destinataire" placeholder="Ex. Moussa Sow" value={p.dropoffName} onChangeText={p.onDropoffNameChange} autoCapitalize="words" />
        <TextField label="Téléphone du destinataire" placeholder="77 123 45 67" value={p.dropoffPhone} onChangeText={p.onDropoffPhoneChange} keyboardType="phone-pad" />
        <TextField label="Notes (optionnel)" placeholder="Étage, portail, repère…" value={p.dropoffNotes} onChangeText={p.onDropoffNotesChange} />
      </Card>
    </View>
  );
}

function CoordsStatus({ address, coords, onMapOpen }: { address: string; coords: Coords | null; onMapOpen: () => void }) {
  if (coords) {
    return (
      <View style={styles.coordsLocalized}>
        <View style={styles.coordsDot} />
        <Text style={styles.coordsLocalizedText}>Adresse localisée</Text>
      </View>
    );
  }
  if (!address.trim()) return null;
  return (
    <Pressable style={styles.coordsMapBtn} onPress={onMapOpen}>
      <MapPin size={12} color={colors.navy} />
      <Text style={styles.coordsMapBtnText}>Préciser sur la carte (optionnel)</Text>
    </Pressable>
  );
}

// ─── Widget enregistrement vocal ──────────────────────────────────────────────

type RecorderStatus = 'idle' | 'recording' | 'recorded';

function VoiceRecorderWidget({ voiceUri, onRecorded }: { voiceUri: string | null; onRecorded: (uri: string | null) => void }) {
  const [status,  setStatus]  = useState<RecorderStatus>(voiceUri ? 'recorded' : 'idle');
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const player   = useAudioPlayer(voiceUri ?? '');

  useEffect(() => {
    if (!voiceUri && status === 'recorded') setStatus('idle');
  }, [voiceUri]);

  function clearTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }

  async function startRecording() {
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Microphone requis', 'SECULIV a besoin du microphone pour enregistrer les instructions. Autorisez-le dans les Réglages.');
      return;
    }
    await AudioModule.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync(RecordingPresets.HIGH_QUALITY);
    recorder.record();
    setSeconds(0);
    setStatus('recording');
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  }

  async function stopRecording() {
    clearTimer();
    await recorder.stop();
    await AudioModule.setAudioModeAsync({ allowsRecording: false });
    const uri = recorder.uri;
    if (uri) { onRecorded(uri); setStatus('recorded'); }
    else       setStatus('idle');
  }

  function reRecord() { onRecorded(null); setStatus('idle'); setSeconds(0); player.pause(); }
  function fmt(s: number) { return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

  if (status === 'idle') {
    return (
      <Pressable style={recStyles.addBtn} onPress={startRecording}>
        <Mic size={16} color={colors.navy} />
        <Text style={recStyles.addBtnText}>Ajouter un guidage vocal</Text>
      </Pressable>
    );
  }

  if (status === 'recording') {
    return (
      <View style={recStyles.recordingBox}>
        <View style={recStyles.recRow}>
          <View style={recStyles.recDot} />
          <Text style={recStyles.recLabel}>Enregistrement en cours</Text>
          <Text style={recStyles.recTimer}>{fmt(seconds)}</Text>
        </View>
        <Text style={recStyles.recHint}>Décrivez l'accès à voix haute (portail, étage, repère…)</Text>
        <Pressable style={recStyles.stopBtn} onPress={stopRecording}>
          <MicOff size={16} color={colors.white} />
          <Text style={recStyles.stopBtnText}>Arrêter</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={recStyles.doneBox}>
      <View style={recStyles.doneHeader}>
        <Volume2 size={16} color={colors.green} />
        <Text style={recStyles.doneTitle}>Guidage vocal ajouté</Text>
      </View>
      <View style={recStyles.doneActions}>
        <Pressable style={recStyles.playBtn} onPress={() => player.playing ? player.pause() : player.play()}>
          <Play size={14} color={colors.green} />
          <Text style={recStyles.playBtnText}>{player.playing ? 'Pause' : 'Écouter'}</Text>
        </Pressable>
        <Pressable style={recStyles.rerecBtn} onPress={reRecord}>
          <RotateCcw size={14} color={colors.muted} />
          <Text style={recStyles.rerecBtnText}>Refaire</Text>
        </Pressable>
        <Pressable style={recStyles.deleteBtn} onPress={reRecord}>
          <Trash2 size={14} color="#D14343" />
        </Pressable>
      </View>
    </View>
  );
}

const recStyles = StyleSheet.create({
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.navy, borderRadius: radius.md, borderStyle: 'dashed',
  },
  addBtnText:   { fontSize: 13, fontWeight: '600', color: colors.navy },
  recordingBox: { backgroundColor: '#FFF5F5', borderRadius: radius.md, borderWidth: 1, borderColor: '#F5BEBE', padding: spacing.md, gap: spacing.sm },
  recRow:       { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  recDot:       { width: 8, height: 8, borderRadius: 4, backgroundColor: '#D14343' },
  recLabel:     { flex: 1, fontSize: 13, fontWeight: '700', color: '#D14343' },
  recTimer:     { fontSize: 13, fontWeight: '700', color: '#D14343', fontVariant: ['tabular-nums'] },
  recHint:      { fontSize: 11, color: colors.muted },
  stopBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, backgroundColor: '#D14343', borderRadius: radius.md, paddingVertical: spacing.sm },
  stopBtnText:  { fontSize: 13, fontWeight: '700', color: colors.white },
  doneBox:      { backgroundColor: colors.greenSoft, borderRadius: radius.md, borderWidth: 1, borderColor: colors.green, padding: spacing.md, gap: spacing.sm },
  doneHeader:   { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  doneTitle:    { fontSize: 13, fontWeight: '700', color: colors.green },
  doneActions:  { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  playBtn:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingVertical: spacing.sm, borderWidth: 1, borderColor: colors.green, borderRadius: radius.md, backgroundColor: colors.white },
  playBtnText:  { fontSize: 12, fontWeight: '600', color: colors.green },
  rerecBtn:     { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.white },
  rerecBtnText: { fontSize: 12, fontWeight: '600', color: colors.muted },
  deleteBtn:    { width: 38, height: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#F5BEBE', backgroundColor: colors.white },
});

// ─── Step 2 : Type de colis ───────────────────────────────────────────────────

type StepParcelTypeProps = {
  parcelType: ParcelType | null;
  setParcelType: (v: ParcelType) => void;
  expectedIdType: string | null;
  setExpectedIdType: (v: string) => void;
  expectedIdName: string;
  setExpectedIdName: (v: string) => void;
  dropoffName: string;
  pricingConfig: PricingConfig | null;
};

function StepParcelType({ parcelType, setParcelType, expectedIdType, setExpectedIdType, expectedIdName, setExpectedIdName, dropoffName, pricingConfig }: StepParcelTypeProps) {
  const isSensible = parcelType === 'sensible';

  function suppLabel(value: ParcelType): string {
    if (!pricingConfig) return '';
    const amount = (pricingConfig as Record<string, number>)[`supp_${value}`] ?? 0;
    return amount === 0 ? 'Inclus' : `+${amount.toLocaleString('fr-FR')} F`;
  }

  function suppColor(value: ParcelType): string {
    if (!pricingConfig) return colors.muted;
    const amount = (pricingConfig as Record<string, number>)[`supp_${value}`] ?? 0;
    return amount === 0 ? colors.green : VIOLET;
  }

  return (
    <View style={styles.stepGap}>
      {PARCEL_TYPE_OPTIONS.map((option) => {
        const selected = parcelType === option.value;
        const isSens   = option.value === 'sensible';
        return (
          <Pressable key={option.value} onPress={() => setParcelType(option.value)}>
            <Card style={[styles.optionCard, selected && (isSens ? styles.optionCardSensible : styles.optionCardSelected)]}>
              <View style={styles.optionTexts}>
                <Text style={styles.optionLabel}>{option.label}</Text>
                <Text style={styles.optionDescription}>{option.description}</Text>
              </View>
              <View style={styles.optionRight}>
                {pricingConfig && (
                  <Text style={[styles.suppLabel, { color: suppColor(option.value) }]}>
                    {suppLabel(option.value)}
                  </Text>
                )}
                {selected && <Check size={20} color={isSens ? VIOLET : colors.green} />}
              </View>
            </Card>
          </Pressable>
        );
      })}

      {parcelType && parcelType !== 'sensible' && (
        <View style={styles.warningBox}>
          <AlertTriangle size={18} color={colors.gold} />
          <Text style={styles.warningText}>
            {parcelType === 'valeur_elevee' && 'Suivi GPS renforcé tout au long du trajet.'}
            {parcelType === 'confidentiel'  && 'Seul le livreur assigné connaît le contenu.'}
            {parcelType === 'fragile'       && 'Manipulation avec précaution renforcée.'}
            {parcelType === 'standard'      && 'Livraison standard SECULIV.'}
          </Text>
        </View>
      )}

      {isSensible && (
        <View style={styles.sensibleBanner}>
          <View style={styles.sensibleBannerHeader}>
            <Lock size={16} color={VIOLET} />
            <Text style={styles.sensibleBannerTitle}>Livraison sensible activée</Text>
          </View>
          <Text style={styles.sensibleBannerSub}>Ce mode ajoute à votre livraison :</Text>
          <View style={styles.sensibleFeatures}>
            <SensibleFeature text="Double code de validation (expéditeur + destinataire)" />
            <SensibleFeature text="Vérification de la pièce d'identité du destinataire" />
            <SensibleFeature text="Signature manuscrite obligatoire du destinataire" />
            <SensibleFeature text="Certificat renforcé avec mention des contrôles" />
          </View>
        </View>
      )}

      {isSensible && (
        <Card style={styles.idCard}>
          <View style={styles.idCardHeader}>
            <ShieldCheck size={16} color={VIOLET} />
            <Text style={styles.idCardTitle}>Pièce d&apos;identité du destinataire</Text>
          </View>
          <Text style={styles.idTypeLabel}>Type de pièce attendue *</Text>
          <View style={styles.idTypeRow}>
            {ID_TYPES.map((t) => (
              <Pressable
                key={t.value}
                style={[styles.idTypeChip, expectedIdType === t.value && styles.idTypeChipActive]}
                onPress={() => setExpectedIdType(t.value)}
              >
                <Text style={[styles.idTypeChipText, expectedIdType === t.value && styles.idTypeChipTextActive]}>
                  {t.label.split(' ')[0] === 'Carte' ? 'CNI' : t.label.split(' ')[0]}
                </Text>
              </Pressable>
            ))}
          </View>
          {expectedIdType && (
            <Text style={styles.idTypeSelected}>{ID_TYPES.find((t) => t.value === expectedIdType)?.label}</Text>
          )}
          <TextField
            label="Nom exact sur la pièce *"
            placeholder={dropoffName || 'Prénom Nom'}
            value={expectedIdName}
            onChangeText={setExpectedIdName}
            autoCapitalize="words"
          />
          <Text style={styles.idNameHint}>
            Pré-rempli avec le nom du destinataire. Modifiez si le nom sur la pièce diffère.
          </Text>
        </Card>
      )}
    </View>
  );
}

function SensibleFeature({ text }: { text: string }) {
  return (
    <View style={styles.sensibleFeatureRow}>
      <View style={styles.sensibleFeatureDot} />
      <Text style={styles.sensibleFeatureText}>{text}</Text>
    </View>
  );
}

// ─── Step 3 : Protection ──────────────────────────────────────────────────────

function StepProtection({ protectionLevel, setProtectionLevel }: { protectionLevel: ProtectionLevel | null; setProtectionLevel: (v: ProtectionLevel) => void }) {
  return (
    <View style={styles.stepGap}>
      {PLANS.map((plan) => {
        const selected = protectionLevel === plan.id;
        return (
          <Pressable key={plan.id} onPress={() => setProtectionLevel(plan.id)}>
            <Card style={[styles.planOption, selected && { borderColor: plan.color }]}>
              <View style={styles.planOptionHeader}>
                <Text style={styles.planOptionName}>{plan.name}</Text>
                <Text style={styles.planOptionPrice}>{plan.price.toLocaleString('fr-FR')} F</Text>
              </View>
              {plan.includes.map((item) => <Text key={item} style={styles.planOptionInclude}>•  {item}</Text>)}
              <Text style={styles.planOptionInsurance}>{plan.insurance}</Text>
            </Card>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Step 4 : Paiement & récapitulatif ───────────────────────────────────────

function StepPayment({
  priceBreakdown,
  pickupAddress,
  dropoffAddress,
  isSensible,
  pricingConfig,
}: {
  priceBreakdown: PriceBreakdown | null;
  pickupAddress: string;
  dropoffAddress: string;
  isSensible: boolean;
  pricingConfig: PricingConfig | null;
}) {
  if (!priceBreakdown) {
    return (
      <View style={[styles.stepGap, { alignItems: 'center' }]}>
        <ActivityIndicator color={colors.green} />
        <Text style={{ fontSize: 13, color: colors.muted }}>Calcul du prix en cours…</Text>
      </View>
    );
  }

  const shortPickup  = pickupAddress.split(',')[0].trim();
  const shortDropoff = dropoffAddress.split(',')[0].trim();

  return (
    <View style={styles.stepGap}>
      {isSensible && (
        <View style={styles.sensibleSummaryBadge}>
          <Lock size={14} color={VIOLET} />
          <Text style={styles.sensibleSummaryText}>Livraison sensible — contrôles renforcés</Text>
        </View>
      )}

      {/* Bandeau route */}
      <View style={styles.routeInfo}>
        <Text style={styles.routeText} numberOfLines={1}>{shortPickup} → {shortDropoff}</Text>
        <Text style={styles.routeMeta}>{priceBreakdown.km.toFixed(1)} km · ~{priceBreakdown.minutes} min</Text>
      </View>

      {/* Détail du prix */}
      <Card style={styles.breakdownCard}>
        <Text style={styles.breakdownTitle}>Total à régler</Text>
        <Text style={styles.breakdownTotal}>{priceBreakdown.total.toLocaleString('fr-FR')} F</Text>
        <View style={styles.breakdownDivider} />
        <BreakdownRow label="Prise en charge"         value={priceBreakdown.baseFare} />
        <BreakdownRow
          label={`Distance · ${priceBreakdown.km.toFixed(1)} km × ${pricingConfig?.price_per_km ?? 150} F`}
          value={priceBreakdown.distanceCost}
        />
        <BreakdownRow
          label={`Durée · ${priceBreakdown.minutes} min × ${pricingConfig?.price_per_min ?? 25} F`}
          value={priceBreakdown.durationCost}
        />
        {priceBreakdown.supplement > 0 && (
          <BreakdownRow label="Supplément colis" value={priceBreakdown.supplement} valueColor={VIOLET} />
        )}
      </Card>

      {/* Paiement : espèces uniquement */}
      <Text style={styles.payMethodLabel}>Mode de paiement</Text>
      <View style={[styles.payOption, styles.payOptionActive]}>
        <View style={[styles.payIcon, styles.payIconCash]}>
          <Banknote size={20} color={colors.green} />
        </View>
        <View style={styles.payOptionTexts}>
          <Text style={styles.payOptionTitle}>Espèces à la livraison</Text>
          <Text style={styles.payOptionSub}>Réglez le livreur en main propre</Text>
        </View>
        <Check size={18} color={colors.green} />
      </View>
    </View>
  );
}

function BreakdownRow({ label, value, valueColor }: { label: string; value: number; valueColor?: string }) {
  return (
    <View style={styles.breakdownRow}>
      <Text style={styles.breakdownLabel}>{label}</Text>
      <Text style={[styles.breakdownValue, valueColor ? { color: valueColor } : undefined]}>
        {value.toLocaleString('fr-FR')} F
      </Text>
    </View>
  );
}

// ─── Écran de confirmation ────────────────────────────────────────────────────

function OrderConfirmedScreen({ price, code, codeDest, isSensible, onTrack }: {
  price: number;
  code: string | null;
  codeDest: string | null;
  isSensible: boolean;
  onTrack: () => void;
}) {
  return (
    <View style={styles.confirmedBg}>
      <View style={styles.confirmedBody}>
        <View style={styles.confirmedIconWrap}>
          <CheckCircle2 size={48} color={isSensible ? VIOLET : colors.green} />
        </View>
        <Text style={styles.confirmedTitle}>Commande validée</Text>
        <Text style={styles.confirmedSub}>
          Un livreur va être assigné. Vous réglerez{' '}
          <Text style={styles.confirmedSubBold}>{price.toLocaleString('fr-FR')} F en espèces</Text>
          {' '}à la remise du colis.
        </Text>

        {code && (
          <View style={styles.confirmedCodeBox}>
            <Text style={styles.confirmedCodeLabel}>
              {isSensible ? 'Votre code expéditeur' : 'Votre code secret'}
            </Text>
            <Text style={styles.confirmedCode}>{code.split('').join(' ')}</Text>
            {isSensible && (
              <Text style={styles.confirmedCodeHint}>Communiquez ce code au livreur à son arrivée.</Text>
            )}
          </View>
        )}

        {isSensible && codeDest && (
          <View style={[styles.confirmedCodeBox, styles.confirmedCodeBoxDest]}>
            <Text style={styles.confirmedCodeLabel}>Code destinataire</Text>
            <Text style={styles.confirmedCode}>{codeDest.split('').join(' ')}</Text>
            <Text style={styles.confirmedCodeHint}>
              À communiquer au destinataire avant la livraison.{'\n'}
              Il devra le donner au livreur lors de la remise.
            </Text>
          </View>
        )}
      </View>

      <View style={styles.confirmedFooter}>
        <Button title="Suivre ma livraison" onPress={onTrack} />
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea:      { flex: 1, backgroundColor: colors.white },
  confirmedSafe: { flex: 1, backgroundColor: colors.navy },
  flex:          { flex: 1 },
  topBar: {
    backgroundColor: colors.white,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm,
  },
  iconButton: {
    width: 40, height: 40, borderRadius: radius.pill,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg,
  },
  headerTitle:   { fontSize: 16, fontWeight: '800', color: colors.ink },
  headerStep:    { width: 40, textAlign: 'right', fontSize: 13, color: colors.muted },
  progressTrack: { height: 6, borderRadius: radius.pill, backgroundColor: colors.line, marginHorizontal: spacing.lg, marginTop: spacing.md, overflow: 'hidden' },
  progressFill:  { height: 6, borderRadius: radius.pill, backgroundColor: colors.green },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, backgroundColor: colors.bg, flexGrow: 1 },
  footer:  { padding: spacing.lg, gap: spacing.sm, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.line },
  errorText:    { fontSize: 13, color: '#D14343', textAlign: 'center' },
  stepGap:      { gap: spacing.lg },

  // Geocoding loader
  geocodingRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  geocodingText: { fontSize: 13, color: colors.muted },

  // Addresses
  addressCard:   { gap: spacing.md },
  addressHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  addressTitle:  { fontSize: 15, fontWeight: '700', color: colors.ink },

  // Coords status
  coordsLocalized: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 4, marginTop: -spacing.xs,
  },
  coordsDot:          { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.green },
  coordsLocalizedText:{ fontSize: 12, color: colors.green, fontWeight: '600' },
  coordsMapBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 4, marginTop: -spacing.xs,
  },
  coordsMapBtnText: { fontSize: 12, color: colors.navy, textDecorationLine: 'underline' },

  // Map picker modal
  mapPickerHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  mapPickerTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  mapPickerHint:  { fontSize: 12, color: colors.muted, textAlign: 'center', paddingVertical: spacing.sm, backgroundColor: colors.bg },
  mapPickerFooter:{ padding: spacing.lg, gap: spacing.sm, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.line },

  // Parcel type
  optionCard:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 2, borderColor: 'transparent', gap: spacing.md },
  optionCardSelected: { borderColor: colors.green, backgroundColor: colors.greenSoft },
  optionCardSensible: { borderColor: VIOLET, backgroundColor: VIOLET_SOFT },
  optionTexts:        { flex: 1, gap: 2 },
  optionLabel:        { fontSize: 15, fontWeight: '700', color: colors.ink },
  optionDescription:  { fontSize: 12, color: colors.muted },
  optionRight:        { alignItems: 'flex-end', gap: 4 },
  suppLabel:          { fontSize: 12, fontWeight: '700' },

  // Warning
  warningBox:  { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: '#FBF0DC', borderRadius: radius.md, padding: spacing.md },
  warningText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#8A6200' },

  // Sensible banner
  sensibleBanner:       { backgroundColor: VIOLET_SOFT, borderRadius: radius.md, borderWidth: 1, borderColor: '#D9CEEF', padding: spacing.md, gap: spacing.sm },
  sensibleBannerHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sensibleBannerTitle:  { fontSize: 14, fontWeight: '800', color: VIOLET },
  sensibleBannerSub:    { fontSize: 12, color: VIOLET, fontWeight: '600' },
  sensibleFeatures:     { gap: spacing.xs },
  sensibleFeatureRow:   { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sensibleFeatureDot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: VIOLET, flexShrink: 0 },
  sensibleFeatureText:  { fontSize: 12, color: colors.ink, flex: 1 },

  // ID card
  idCard:            { gap: spacing.md, borderWidth: 1, borderColor: '#D9CEEF' },
  idCardHeader:      { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  idCardTitle:       { fontSize: 14, fontWeight: '700', color: VIOLET },
  idTypeLabel:       { fontSize: 12, fontWeight: '700', color: colors.muted, textTransform: 'uppercase' },
  idTypeRow:         { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  idTypeChip:        { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white },
  idTypeChipActive:  { borderColor: VIOLET, backgroundColor: VIOLET_SOFT },
  idTypeChipText:    { fontSize: 12, fontWeight: '600', color: colors.muted },
  idTypeChipTextActive: { color: VIOLET },
  idTypeSelected:    { fontSize: 12, color: VIOLET, fontWeight: '600', marginTop: -spacing.xs },
  idNameHint:        { fontSize: 11, color: colors.muted, marginTop: -spacing.sm },

  // Plans (step 3)
  planOption:        { borderWidth: 2, borderColor: 'transparent', gap: spacing.xs },
  planOptionHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
  planOptionName:    { fontSize: 15, fontWeight: '700', color: colors.ink },
  planOptionPrice:   { fontSize: 15, fontWeight: '800', color: colors.navy },
  planOptionInclude: { fontSize: 12, color: colors.muted, lineHeight: 18 },
  planOptionInsurance: { fontSize: 12, fontWeight: '700', color: colors.green, marginTop: spacing.xs },

  // Step 4 — récapitulatif
  sensibleSummaryBadge: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: VIOLET_SOFT, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: '#D9CEEF' },
  sensibleSummaryText:  { fontSize: 13, fontWeight: '700', color: VIOLET },

  routeInfo: { backgroundColor: colors.bg, borderRadius: radius.md, padding: spacing.md, gap: 4, borderWidth: 1, borderColor: colors.line },
  routeText: { fontSize: 14, fontWeight: '700', color: colors.ink },
  routeMeta: { fontSize: 12, color: colors.muted },

  breakdownCard:    { gap: spacing.sm },
  breakdownTitle:   { fontSize: 12, fontWeight: '700', color: colors.muted, textTransform: 'uppercase' },
  breakdownTotal:   { fontSize: 32, fontWeight: '800', color: colors.navy },
  breakdownDivider: { height: 1, backgroundColor: colors.line, marginVertical: spacing.xs },
  breakdownRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  breakdownLabel:   { flex: 1, fontSize: 13, color: colors.muted },
  breakdownValue:   { fontSize: 13, fontWeight: '700', color: colors.ink },

  payMethodLabel: { fontSize: 13, fontWeight: '700', color: colors.ink },
  payOption: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.md, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.white,
  },
  payOptionActive: { borderColor: colors.green, backgroundColor: colors.greenSoft },
  payIcon:         { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  payIconCash:     { backgroundColor: colors.white, borderWidth: 1, borderColor: '#CDE8D5' },
  payOptionTexts:  { flex: 1, gap: 2 },
  payOptionTitle:  { fontSize: 14, fontWeight: '700', color: colors.ink },
  payOptionSub:    { fontSize: 11, color: colors.muted },

  // Confirmation
  confirmedBg:       { flex: 1, backgroundColor: colors.navy, justifyContent: 'space-between' },
  confirmedBody:     { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, paddingHorizontal: spacing.xl },
  confirmedIconWrap: { width: 88, height: 88, borderRadius: 44, backgroundColor: 'rgba(67,176,92,0.16)', alignItems: 'center', justifyContent: 'center' },
  confirmedTitle:    { fontSize: 22, fontWeight: '800', color: colors.white, textAlign: 'center' },
  confirmedSub:      { fontSize: 14, color: '#9FB0CC', textAlign: 'center', lineHeight: 22, maxWidth: 260 },
  confirmedSubBold:  { color: colors.white, fontWeight: '700' },
  confirmedCodeBox:  { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, alignItems: 'center', gap: spacing.xs, width: '100%' },
  confirmedCodeBoxDest: { backgroundColor: 'rgba(107,79,168,0.20)', borderWidth: 1, borderColor: 'rgba(107,79,168,0.40)' },
  confirmedCodeLabel:   { fontSize: 11, color: '#9FB0CC', fontWeight: '600' },
  confirmedCode:        { fontSize: 28, fontWeight: '800', letterSpacing: 8, color: colors.white },
  confirmedCodeHint:    { fontSize: 11, color: '#9FB0CC', textAlign: 'center', lineHeight: 16, marginTop: 2 },
  confirmedFooter:      { padding: spacing.lg, paddingBottom: spacing.xl },
});
