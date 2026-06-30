import { AudioModule, RecordingPresets, useAudioPlayer, useAudioRecorder } from 'expo-audio';
import { router } from 'expo-router';
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  Check,
  CheckCircle2,
  KeyRound,
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
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapPickerModal from '@/src/components/MapPickerModal';

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
import { radius, spacing } from '@/src/theme/spacing';
import type { ParcelType } from '@/src/types';

// ─── Constantes ───────────────────────────────────────────────────────────────

const VIOLET      = '#6B4FA8';
const VIOLET_SOFT = '#F0ECFA';

const STEP_TITLES: Record<number, string> = {
  1: 'Adresses',
  2: 'Type de colis',
  3: 'Paiement & validation',
};

// Centre de Dakar — position par défaut du sélecteur carte.
const DAKAR: { latitude: number; longitude: number } = { latitude: 14.7167, longitude: -17.4677 };

const PARCEL_TYPE_OPTIONS: { value: ParcelType; label: string; description: string }[] = [
  { value: 'standard',      label: 'Standard',           description: 'Colis courant, sans exigence particulière.'         },
  { value: 'valeur_elevee', label: 'Valeur élevée',      description: 'Objet de valeur, suivi renforcé du trajet.'       },
  { value: 'confidentiel',  label: 'Confidentiel',       description: 'Contenu discret, accès limité au livreur assigné.' },
  { value: 'sensible',      label: 'Livraison sensible', description: 'Double vérification à la remise (renforcée).'     },
];

const ID_TYPES = [
  { value: 'cni',       label: "Carte Nationale d'Identité (CNI)" },
  { value: 'passeport', label: 'Passeport'                        },
  { value: 'permis',    label: 'Permis de conduire'               },
];

// ─── Nominatim (OpenStreetMap) ───────────────────────────────────────────────

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const NOMINATIM_HEADERS = { 'User-Agent': 'SECULIV/1.0 (seculiv31@gmail.com)', Accept: 'application/json' };

type NominatimResult = { display_name: string; lat: string; lon: string };

function shortAddress(displayName: string): string {
  const withoutCountry = displayName.replace(/, (Sénégal|Senegal)$/, '');
  return withoutCountry.split(',').slice(0, 3).map((s) => s.trim()).filter(Boolean).join(', ');
}

async function geocodeAddress(address: string): Promise<Coords | null> {
  try {
    const q = encodeURIComponent(`${address.trim()}, Dakar, Sénégal`);
    const res  = await fetch(`${NOMINATIM_BASE}/search?q=${q}&format=json&limit=1&countrycodes=sn`, { headers: NOMINATIM_HEADERS });
    const data: NominatimResult[] = await res.json();
    if (data.length > 0) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    return null;
  } catch {
    return null;
  }
}

async function searchAddresses(query: string): Promise<NominatimResult[]> {
  try {
    const q = encodeURIComponent(`${query.trim()}, Dakar, Sénégal`);
    const res  = await fetch(`${NOMINATIM_BASE}/search?q=${q}&format=json&limit=6&countrycodes=sn`, { headers: NOMINATIM_HEADERS });
    return await res.json();
  } catch {
    return [];
  }
}

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res  = await fetch(`${NOMINATIM_BASE}/reverse?lat=${lat}&lon=${lng}&format=json`, { headers: NOMINATIM_HEADERS });
    const data = await res.json();
    const r    = data.address ?? {};
    const parts = [r.road, r.quarter, r.suburb, r.neighbourhood, r.city_district, r.city].filter(Boolean);
    return parts.slice(0, 3).join(', ');
  } catch {
    return '';
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  const [dropoffVoiceUri, setDropoffVoiceUri] = useState<string | null>(null);

  // Coordonnées — effacées dès que le texte d'adresse change
  const [pickupCoords,  setPickupCoords]  = useState<Coords | null>(null);
  const [dropoffCoords, setDropoffCoords] = useState<Coords | null>(null);

  // Sélecteur carte (modale)
  const [mapPickerFor, setMapPickerFor] = useState<'pickup' | 'dropoff' | null>(null);

  // Tarification
  const [pricingConfig,   setPricingConfig]   = useState<PricingConfig | null>(null);
  const [priceBreakdown,  setPriceBreakdown]  = useState<PriceBreakdown | null>(null);
  const [geocodingLoading,setGeocodingLoading]= useState(false);

  // Colis
  const [parcelType, setParcelType] = useState<ParcelType | null>(null);

  // Champs sensible
  const [expectedIdType, setExpectedIdType] = useState<string | null>(null);
  const [expectedIdName, setExpectedIdName] = useState('');

  // UI
  const [error,      setError]      = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Code choisi par le client (standard / valeur_elevee / confidentiel)
  const [clientCode, setClientCode] = useState('');

  // Confirmation
  const [orderConfirmed,    setOrderConfirmed]    = useState(false);
  const [confirmedCode,     setConfirmedCode]     = useState<string | null>(null);
  const [confirmedCodeDest, setConfirmedCodeDest] = useState<string | null>(null);
  const [confirmedPrice,    setConfirmedPrice]    = useState(0);
  const [confirmedSensible, setConfirmedSensible] = useState(false);

  const isSensible = parcelType === 'sensible';
  const price = priceBreakdown?.total ?? 0;

  // Charge la config tarifaire une fois au montage
  useEffect(() => {
    loadPricingConfig().then(setPricingConfig).catch(() => {});
  }, []);

  // Calcule km/min dès que les deux coords sont connues (affichage prix dans step 2)
  const [routeInfo, setRouteInfo] = useState<{ km: number; minutes: number } | null>(null);
  useEffect(() => {
    if (!pickupCoords || !dropoffCoords) { setRouteInfo(null); return; }
    const km = calculateDistance(pickupCoords, dropoffCoords);
    setRouteInfo({ km, minutes: estimateDuration(km) });
  }, [pickupCoords, dropoffCoords]);

  // Calcule le prix dès qu'on arrive à l'étape 3 (coords + type + config disponibles)
  useEffect(() => {
    if (step !== 3 || !pickupCoords || !dropoffCoords || !parcelType || !pricingConfig) return;
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
          return;
        }
        if (!dC) {
          setDropoffCoords(null);
          setError('Adresse de livraison introuvable. Précisez-la sur la carte.');
          setMapPickerFor('dropoff');
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

    setStep((c) => Math.min(3, c + 1));
  }

  async function handleSubmit() {
    if (!user || !parcelType || !priceBreakdown) return;

    if (!isSensible && !/^\d{4}$/.test(clientCode)) {
      setError('Choisis un code à 4 chiffres à communiquer au destinataire.');
      return;
    }

    setSubmitting(true);
    setError(null);

    let dropoffVoicePath: string | undefined;
    if (dropoffVoiceUri) {
      const uploadResult = await uploadVoiceGuidance(dropoffVoiceUri);
      if ('path' in uploadResult) dropoffVoicePath = uploadResult.path;
    }

    const { data: newOrder, error: insertError } = await supabase
      .from('orders')
      .insert({
        client_id:        user.id,
        pickup: {
          address:            pickupAddress.trim(),
          notes:              pickupNotes.trim() || undefined,
          ...(pickupCoords  ? { lat: pickupCoords.lat,  lng: pickupCoords.lng  } : {}),
        },
        dropoff: {
          address:            dropoffAddress.trim(),
          name:               dropoffName.trim(),
          phone:              dropoffPhone.trim(),
          notes:              dropoffNotes.trim() || undefined,
          voice_guidance_url: dropoffVoicePath,
          ...(dropoffCoords ? { lat: dropoffCoords.lat, lng: dropoffCoords.lng } : {}),
        },
        parcel_type:      parcelType,
        protection_level: 'standard',
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
      const { error: storeErr } = await supabase.rpc('store_custom_secret_code', { p_order_id: newOrder.id, p_code: clientCode });
      if (storeErr) {
        setSubmitting(false);
        setError('Le code de livraison n\'a pas pu être enregistré. Réessaie.');
        return;
      }
      await storeSecretCode(newOrder.id, clientCode);
      setConfirmedCode(clientCode);
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
        <MapPickerModal
          visible
          type={mapPickerFor}
          initialCoords={mapPickerFor === 'pickup' ? (pickupCoords ?? undefined) : (dropoffCoords ?? undefined)}
          reverseGeocode={reverseGeocode}
          onClose={() => setMapPickerFor(null)}
          onConfirm={async (coords, geocode) => {
            if (mapPickerFor === 'pickup') setPickupCoords(coords);
            else                           setDropoffCoords(coords);
            try {
              const addr = await geocode(coords.lat, coords.lng);
              if (addr) {
                if (mapPickerFor === 'pickup') setPickupAddress(addr);
                else                           setDropoffAddress(addr);
              }
            } catch { /* ignore si pas de réseau */ }
            setMapPickerFor(null);
            setError(null);
          }}
        />
      )}

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.topBar}>
          <View style={styles.header}>
            <Pressable onPress={goBack} style={styles.iconButton}>
              {step === 1 ? <X size={22} color={colors.ink} /> : <ArrowLeft size={22} color={colors.ink} />}
            </Pressable>
            <Text style={styles.headerTitle}>{STEP_TITLES[step]}</Text>
            <Text style={styles.headerStep}>{step}/3</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(step * 100 / 3)}%` }]} />
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {step === 1 && (
            <StepAddresses
              pickupAddress={pickupAddress}
              pickupNotes={pickupNotes}
              dropoffAddress={dropoffAddress}
              dropoffName={dropoffName}
              dropoffPhone={dropoffPhone}
              dropoffNotes={dropoffNotes}
              dropoffVoiceUri={dropoffVoiceUri}
              pickupCoords={pickupCoords}
              dropoffCoords={dropoffCoords}
              onPickupAddressChange={(v) => { setPickupAddress(v);  setPickupCoords(null);  }}
              onPickupSelect={(addr, coords) => { setPickupAddress(addr);  setPickupCoords(coords);  }}
              onPickupNotesChange={setPickupNotes}
              onDropoffAddressChange={(v) => { setDropoffAddress(v); setDropoffCoords(null); }}
              onDropoffSelect={(addr, coords) => { setDropoffAddress(addr); setDropoffCoords(coords); }}
              onDropoffNameChange={setDropoffName}
              onDropoffPhoneChange={setDropoffPhone}
              onDropoffNotesChange={setDropoffNotes}
              onDropoffVoiceChange={setDropoffVoiceUri}
              onMapPickerOpen={(target) => setMapPickerFor(target)}
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
              routeInfo={routeInfo}
            />
          )}

          {step === 3 && (
            <StepPayment
              priceBreakdown={priceBreakdown}
              isSensible={isSensible}
              clientCode={clientCode}
              onClientCodeChange={setClientCode}
            />
          )}
        </ScrollView>

        <View style={styles.footer}>
          {error && <Text style={styles.errorText}>{error}</Text>}
          {step < 3 ? (
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
  dropoffAddress: string;
  dropoffName: string;
  dropoffPhone: string;
  dropoffNotes: string;
  dropoffVoiceUri: string | null;
  pickupCoords: Coords | null;
  dropoffCoords: Coords | null;
  onPickupAddressChange: (v: string) => void;
  onPickupSelect: (address: string, coords: Coords) => void;
  onPickupNotesChange: (v: string) => void;
  onDropoffAddressChange: (v: string) => void;
  onDropoffSelect: (address: string, coords: Coords) => void;
  onDropoffNameChange: (v: string) => void;
  onDropoffPhoneChange: (v: string) => void;
  onDropoffNotesChange: (v: string) => void;
  onDropoffVoiceChange: (v: string | null) => void;
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
        <AddressField
          label="Adresse de récupération"
          placeholder="Ex. Sacré-Cœur 3, Dakar"
          value={p.pickupAddress}
          onChangeText={p.onPickupAddressChange}
          onSelect={p.onPickupSelect}
        />
        <CoordsStatus coords={p.pickupCoords} onMapOpen={() => p.onMapPickerOpen('pickup')} />
        <TextField label="Notes (optionnel)" placeholder="Étage, portail, repère…" value={p.pickupNotes} onChangeText={p.onPickupNotesChange} />
      </Card>

      <Card style={styles.addressCard}>
        <View style={styles.addressHeader}>
          <MapPin size={18} color={colors.green} />
          <Text style={styles.addressTitle}>Livraison</Text>
        </View>
        <AddressField
          label="Adresse de livraison"
          placeholder="Ex. Plateau, Dakar"
          value={p.dropoffAddress}
          onChangeText={p.onDropoffAddressChange}
          onSelect={p.onDropoffSelect}
        />
        <CoordsStatus coords={p.dropoffCoords} onMapOpen={() => p.onMapPickerOpen('dropoff')} />
        <TextField label="Nom du destinataire" placeholder="Ex. Moussa Sow" value={p.dropoffName} onChangeText={p.onDropoffNameChange} autoCapitalize="words" />
        <TextField label="Téléphone du destinataire" placeholder="77 123 45 67" value={p.dropoffPhone} onChangeText={p.onDropoffPhoneChange} keyboardType="phone-pad" />
        <TextField label="Notes (optionnel)" placeholder="Étage, portail, repère…" value={p.dropoffNotes} onChangeText={p.onDropoffNotesChange} />
        <VoiceRecorderWidget
          voiceUri={p.dropoffVoiceUri}
          onRecorded={p.onDropoffVoiceChange}
          label="Ajouter un message vocal au livreur"
          hint="Instructions de livraison, accès, particularités du colis…"
        />
      </Card>
    </View>
  );
}

function AddressField({
  label,
  placeholder,
  value,
  onChangeText,
  onSelect,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (v: string) => void;
  onSelect: (address: string, coords: Coords) => void;
}) {
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [searching,   setSearching]   = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleChange(v: string) {
    onChangeText(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (v.trim().length < 3) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const results = await searchAddresses(v);
      setSuggestions(results);
      setSearching(false);
    }, 450);
  }

  function handleSelect(item: NominatimResult) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSuggestions([]);
    setSearching(false);
    const addr = shortAddress(item.display_name);
    onSelect(addr, { lat: parseFloat(item.lat), lng: parseFloat(item.lon) });
  }

  return (
    <View>
      <TextField
        label={label}
        placeholder={placeholder}
        value={value}
        onChangeText={handleChange}
      />
      {searching && (
        <View style={acStyles.searchingRow}>
          <ActivityIndicator size="small" color={colors.green} />
          <Text style={acStyles.searchingText}>Recherche…</Text>
        </View>
      )}
      {suggestions.length > 0 && (
        <View style={acStyles.dropdown}>
          {suggestions.map((item, idx) => {
            const [name, ...rest] = item.display_name.replace(/, (Sénégal|Senegal)$/, '').split(',');
            return (
              <Pressable
                key={idx}
                style={[acStyles.suggestion, idx < suggestions.length - 1 && acStyles.suggestionBorder]}
                onPress={() => handleSelect(item)}
              >
                <MapPin size={12} color={colors.navy} style={{ flexShrink: 0 }} />
                <View style={{ flex: 1 }}>
                  <Text style={acStyles.suggestionName} numberOfLines={1}>{name?.trim()}</Text>
                  {rest.length > 0 && (
                    <Text style={acStyles.suggestionSub} numberOfLines={1}>{rest.slice(0, 2).map(s => s.trim()).join(', ')}</Text>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

function CoordsStatus({ coords, onMapOpen }: { coords: Coords | null; onMapOpen: () => void }) {
  if (coords) {
    return (
      <View style={styles.coordsLocalized}>
        <View style={styles.coordsDot} />
        <Text style={styles.coordsLocalizedText}>Adresse localisée</Text>
      </View>
    );
  }
  return (
    <Pressable style={styles.coordsMapBtn} onPress={onMapOpen}>
      <MapPin size={12} color={colors.navy} />
      <Text style={styles.coordsMapBtnText}>Préciser sur la carte (optionnel)</Text>
    </Pressable>
  );
}

// ─── Widget enregistrement vocal ──────────────────────────────────────────────

type RecorderStatus = 'idle' | 'recording' | 'recorded';

function VoiceRecorderWidget({ voiceUri, onRecorded, label, hint }: {
  voiceUri: string | null;
  onRecorded: (uri: string | null) => void;
  label?: string;
  hint?: string;
}) {
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
        <Text style={recStyles.addBtnText}>{label ?? 'Ajouter un guidage vocal'}</Text>
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
        <Text style={recStyles.recHint}>{hint ?? "Décrivez l'accès à voix haute (portail, étage, repère…)"}</Text>
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
        <Pressable style={recStyles.playBtn} onPress={() => {
          if (player.playing) {
            player.pause();
          } else {
            player.seekTo(0);
            player.play();
          }
        }}>
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
  routeInfo: { km: number; minutes: number } | null;
};

function StepParcelType({ parcelType, setParcelType, expectedIdType, setExpectedIdType, expectedIdName, setExpectedIdName, dropoffName, pricingConfig, routeInfo }: StepParcelTypeProps) {
  const isSensible = parcelType === 'sensible';

  function suppLabel(value: ParcelType): string {
    if (!pricingConfig) return '';
    if (routeInfo) {
      const total = calculatePrice({ km: routeInfo.km, minutes: routeInfo.minutes, parcelType: value, config: pricingConfig }).total;
      return `${total.toLocaleString('fr-FR')} F`;
    }
    const amount = (pricingConfig as Record<string, number>)[`supp_${value}`] ?? 0;
    return amount === 0 ? 'Inclus' : `+${amount.toLocaleString('fr-FR')} F`;
  }

  function suppColor(): string {
    return colors.navy;
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
                  <Text style={[styles.suppLabel, { color: suppColor() }]}>
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

// ─── Step 3 : Paiement & récapitulatif ───────────────────────────────────────

function StepPayment({
  priceBreakdown,
  isSensible,
  clientCode,
  onClientCodeChange,
}: {
  priceBreakdown: PriceBreakdown | null;
  isSensible: boolean;
  clientCode: string;
  onClientCodeChange: (v: string) => void;
}) {
  if (!priceBreakdown) {
    return (
      <View style={[styles.stepGap, { alignItems: 'center' }]}>
        <ActivityIndicator color={colors.green} />
        <Text style={{ fontSize: 13, color: colors.muted }}>Calcul du prix en cours…</Text>
      </View>
    );
  }

  return (
    <View style={styles.stepGap}>
      {isSensible && (
        <View style={styles.sensibleSummaryBadge}>
          <Lock size={14} color={VIOLET} />
          <Text style={styles.sensibleSummaryText}>Livraison sensible — contrôles renforcés</Text>
        </View>
      )}

      {/* Code de livraison (non-sensible uniquement) */}
      {!isSensible && (
        <Card style={styles.codeChoiceCard}>
          <View style={styles.codeChoiceHeader}>
            <KeyRound size={16} color={colors.navy} />
            <Text style={styles.codeChoiceTitle}>Code de livraison</Text>
          </View>
          <Text style={styles.codeChoiceDesc}>
            Choisissez un code à 4 chiffres. Communiquez-le au destinataire avant la livraison — il le remettra au livreur à son arrivée.
          </Text>
          <TextField
            label="Votre code (4 chiffres) *"
            placeholder="Ex. 2847"
            value={clientCode}
            onChangeText={(v) => onClientCodeChange(v.replace(/\D/g, '').slice(0, 4))}
            keyboardType="number-pad"
            maxLength={4}
          />
        </Card>
      )}

      {/* Détail du prix */}
      <Card style={styles.breakdownCard}>
        <Text style={styles.breakdownTitle}>Total à régler</Text>
        <Text style={styles.breakdownTotal}>{priceBreakdown.total.toLocaleString('fr-FR')} F</Text>
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
              {isSensible ? 'Votre code expéditeur' : 'Votre code de livraison'}
            </Text>
            <Text style={styles.confirmedCode}>{code.split('').join(' ')}</Text>
            <Text style={styles.confirmedCodeHint}>
              {isSensible
                ? 'Communiquez ce code au livreur à son arrivée.'
                : 'Partagez ce code avec le destinataire.\nIl le communiquera au livreur lors de la remise.'}
            </Text>
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

// ─── Styles autocomplete ─────────────────────────────────────────────────────

const acStyles = StyleSheet.create({
  searchingRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  searchingText:   { fontSize: 12, color: colors.muted },
  dropdown:        { borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.white, overflow: 'hidden', marginTop: 2 },
  suggestion:      { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.sm, paddingVertical: 10 },
  suggestionBorder:{ borderBottomWidth: 1, borderBottomColor: colors.line },
  suggestionName:  { fontSize: 13, fontWeight: '600', color: colors.ink },
  suggestionSub:   { fontSize: 11, color: colors.muted, marginTop: 1 },
});

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

  // Step 3 — récapitulatif
  sensibleSummaryBadge: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: VIOLET_SOFT, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: '#D9CEEF' },
  sensibleSummaryText:  { fontSize: 13, fontWeight: '700', color: VIOLET },
  codeChoiceCard:   { gap: spacing.md, borderWidth: 1.5, borderColor: colors.navy },
  codeChoiceHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  codeChoiceTitle:  { fontSize: 14, fontWeight: '700', color: colors.navy },
  codeChoiceDesc:   { fontSize: 12, color: colors.muted, lineHeight: 18 },

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
