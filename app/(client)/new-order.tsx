import { AudioModule, RecordingPresets, useAudioPlayer, useAudioRecorder } from 'expo-audio';
import { router } from 'expo-router';
import { AlertTriangle, ArrowLeft, Banknote, Check, CheckCircle2, Lock, MapPin, Mic, MicOff, Play, RotateCcw, ShieldCheck, Trash2, Volume2, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
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

import { Button } from '@/src/components/Button';
import { Card } from '@/src/components/Card';
import NotificationPrompt from '@/src/components/NotificationPrompt';
import { TextField } from '@/src/components/TextField';
import { useAuth } from '@/src/lib/AuthContext';
import { storeSecretCode } from '@/src/lib/secretCodes';
import { supabase } from '@/src/lib/supabase';
import { uploadVoiceGuidance } from '@/src/lib/uploadVoiceGuidance';
import { colors } from '@/src/theme/colors';
import { getPlan, PLANS } from '@/src/theme/plans';
import { radius, spacing } from '@/src/theme/spacing';
import type { ParcelType, ProtectionLevel } from '@/src/types';

// Violet distinctif du mode sensible.
const VIOLET = '#6B4FA8';
const VIOLET_SOFT = '#F0ECFA';

const STEP_TITLES: Record<number, string> = {
  1: 'Adresses',
  2: 'Type de colis',
  3: 'Protection',
  4: 'Paiement & validation',
};

const PARCEL_TYPE_OPTIONS: { value: ParcelType; label: string; description: string }[] = [
  { value: 'standard',     label: 'Standard',           description: 'Colis courant, sans exigence particulière.'            },
  { value: 'fragile',      label: 'Fragile',            description: 'Manipulation avec précaution renforcée.'              },
  { value: 'valeur_elevee',label: 'Valeur élevée',      description: 'Objet de valeur, suivi renforcé du trajet.'           },
  { value: 'confidentiel', label: 'Confidentiel',       description: 'Contenu discret, accès limité au livreur assigné.'    },
  { value: 'sensible',     label: 'Livraison sensible', description: 'Double vérification à la remise (renforcée).'        },
];

const ID_TYPES = [
  { value: 'cni',       label: 'Carte Nationale d\'Identité (CNI)' },
  { value: 'passeport', label: 'Passeport'                          },
  { value: 'permis',    label: 'Permis de conduire'                 },
];

export default function NewOrderScreen() {
  const { user } = useAuth();

  const [step, setStep] = useState(1);
  const [pickupAddress, setPickupAddress]   = useState('');
  const [pickupNotes, setPickupNotes]       = useState('');
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [dropoffName, setDropoffName]       = useState('');
  const [dropoffPhone, setDropoffPhone]     = useState('');
  const [dropoffNotes, setDropoffNotes]     = useState('');
  const [pickupVoiceUri, setPickupVoiceUri] = useState<string | null>(null);
  const [parcelType, setParcelType]         = useState<ParcelType | null>(null);
  const [protectionLevel, setProtectionLevel] = useState<ProtectionLevel | null>(null);

  // Champs obligatoires pour livraison sensible
  const [expectedIdType, setExpectedIdType] = useState<string | null>(null);
  const [expectedIdName, setExpectedIdName] = useState('');

  const [error, setError]       = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [orderConfirmed, setOrderConfirmed] = useState(false);
  const [confirmedCode, setConfirmedCode]   = useState<string | null>(null);
  // Code destinataire (sensible uniquement) — à transmettre par le client
  const [confirmedCodeDest, setConfirmedCodeDest] = useState<string | null>(null);
  const [confirmedPrice, setConfirmedPrice] = useState(0);
  const [confirmedSensible, setConfirmedSensible] = useState(false);

  const plan  = protectionLevel ? getPlan(protectionLevel) : null;
  const price = plan?.price ?? 0;
  const isSensible = parcelType === 'sensible';

  function goBack() {
    if (step === 1) { router.back(); return; }
    setError(null);
    setStep((c) => c - 1);
  }

  function goNext() {
    setError(null);

    if (step === 1) {
      if (!pickupAddress.trim() || !dropoffAddress.trim() || !dropoffName.trim() || !dropoffPhone.trim()) {
        setError("Renseigne l'adresse d'enlèvement, l'adresse de livraison, le nom et le téléphone du destinataire.");
        return;
      }
    }

    if (step === 2) {
      if (!parcelType) {
        setError('Choisis un type de colis pour continuer.');
        return;
      }
      if (isSensible) {
        if (!expectedIdType) {
          setError('Sélectionne le type de pièce d\'identité attendue.');
          return;
        }
        if (!expectedIdName.trim()) {
          setError('Renseigne le nom exact figurant sur la pièce d\'identité.');
          return;
        }
      }
    }

    if (step === 3 && !protectionLevel) {
      setError('Choisis une formule de protection pour continuer.');
      return;
    }

    setStep((c) => Math.min(4, c + 1));
  }

  async function handleSubmit() {
    if (!user || !parcelType || !protectionLevel || !plan) return;

    setSubmitting(true);
    setError(null);

    let voiceGuidancePath: string | undefined;
    if (pickupVoiceUri) {
      const uploadResult = await uploadVoiceGuidance(pickupVoiceUri);
      if ('path' in uploadResult) voiceGuidancePath = uploadResult.path;
      // Silently ignore upload failure — guidance is optional
    }

    const { data: newOrder, error: insertError } = await supabase
      .from('orders')
      .insert({
        client_id:       user.id,
        pickup:          { address: pickupAddress.trim(), notes: pickupNotes.trim() || undefined, voice_guidance_url: voiceGuidancePath },
        dropoff:         { address: dropoffAddress.trim(), name: dropoffName.trim(), phone: dropoffPhone.trim(), notes: dropoffNotes.trim() || undefined },
        parcel_type:     parcelType,
        protection_level: protectionLevel,
        price_fcfa:      plan.price,
        status:          'en_attente',
        payment_method:  'cash',
        payment_status:  'en_attente',
        // Mode sensible
        is_sensitive:      isSensible,
        expected_id_type:  isSensible ? expectedIdType : null,
        expected_id_name:  isSensible ? expectedIdName.trim() : null,
      })
      .select('id')
      .single();

    if (insertError || !newOrder) {
      setSubmitting(false);
      setError('La création de la commande a échoué. Vérifie ta connexion et réessaie.');
      return;
    }

    if (isSensible) {
      // Commande sensible : génère DEUX codes via l'Edge Function.
      // Code expéditeur → connu du client, à donner au livreur.
      // Code destinataire → à transmettre au destinataire.
      const [expRes, destRes] = await Promise.all([
        supabase.functions.invoke('generate-secret-code', {
          body: { order_id: newOrder.id, code_type: 'expediteur' },
        }),
        supabase.functions.invoke('generate-secret-code', {
          body: { order_id: newOrder.id, code_type: 'destinataire' },
        }),
      ]);

      const codeExp  = expRes.data?.code  as string | undefined;
      const codeDest = destRes.data?.code as string | undefined;

      if (codeExp) await storeSecretCode(newOrder.id, codeExp);

      setConfirmedCode(codeExp ?? null);
      setConfirmedCodeDest(codeDest ?? null);
    } else {
      // Commande standard : code unique via l'RPC existante.
      const { data: secretCode } = await supabase.rpc('generate_secret_code', { p_order_id: newOrder.id });
      if (typeof secretCode === 'string') await storeSecretCode(newOrder.id, secretCode);
      setConfirmedCode(typeof secretCode === 'string' ? secretCode : null);
    }

    setConfirmedPrice(plan.price);
    setConfirmedSensible(isSensible);
    setSubmitting(false);
    setOrderConfirmed(true);
  }

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

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
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
              pickupAddress={pickupAddress}   setPickupAddress={setPickupAddress}
              pickupNotes={pickupNotes}       setPickupNotes={setPickupNotes}
              pickupVoiceUri={pickupVoiceUri} setPickupVoiceUri={setPickupVoiceUri}
              dropoffAddress={dropoffAddress} setDropoffAddress={setDropoffAddress}
              dropoffName={dropoffName}       setDropoffName={setDropoffName}
              dropoffPhone={dropoffPhone}     setDropoffPhone={setDropoffPhone}
              dropoffNotes={dropoffNotes}     setDropoffNotes={setDropoffNotes}
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
            />
          )}

          {step === 3 && (
            <StepProtection protectionLevel={protectionLevel} setProtectionLevel={setProtectionLevel} />
          )}

          {step === 4 && <StepPayment parcelType={parcelType} plan={plan} price={price} isSensible={isSensible} />}
        </ScrollView>

        <View style={styles.footer}>
          {error && <Text style={styles.errorText}>{error}</Text>}
          {step < 4 ? (
            <Button title="Continuer" onPress={goNext} />
          ) : (
            <Button
              title={`Valider la commande · ${price.toLocaleString('fr-FR')} F`}
              onPress={handleSubmit}
              loading={submitting}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Step 1 : Adresses ────────────────────────────────────────────────────────

type StepAddressesProps = {
  pickupAddress: string;    setPickupAddress: (v: string) => void;
  pickupNotes: string;      setPickupNotes: (v: string) => void;
  pickupVoiceUri: string | null; setPickupVoiceUri: (v: string | null) => void;
  dropoffAddress: string;   setDropoffAddress: (v: string) => void;
  dropoffName: string;      setDropoffName: (v: string) => void;
  dropoffPhone: string;     setDropoffPhone: (v: string) => void;
  dropoffNotes: string;     setDropoffNotes: (v: string) => void;
};

function StepAddresses(p: StepAddressesProps) {
  return (
    <View style={styles.stepGap}>
      <Card style={styles.addressCard}>
        <View style={styles.addressHeader}>
          <MapPin size={18} color={colors.navy} />
          <Text style={styles.addressTitle}>Enlèvement</Text>
        </View>
        <TextField label="Adresse de récupération" placeholder="Ex. Sacré-Cœur 3, Dakar" value={p.pickupAddress} onChangeText={p.setPickupAddress} />
        <TextField label="Notes (optionnel)" placeholder="Étage, portail, repère..." value={p.pickupNotes} onChangeText={p.setPickupNotes} />
        <VoiceRecorderWidget voiceUri={p.pickupVoiceUri} onRecorded={p.setPickupVoiceUri} />
      </Card>

      <Card style={styles.addressCard}>
        <View style={styles.addressHeader}>
          <MapPin size={18} color={colors.green} />
          <Text style={styles.addressTitle}>Livraison</Text>
        </View>
        <TextField label="Adresse de livraison" placeholder="Ex. Plateau, Dakar" value={p.dropoffAddress} onChangeText={p.setDropoffAddress} />
        <TextField label="Nom du destinataire" placeholder="Ex. Moussa Sow" value={p.dropoffName} onChangeText={p.setDropoffName} autoCapitalize="words" />
        <TextField label="Téléphone du destinataire" placeholder="77 123 45 67" value={p.dropoffPhone} onChangeText={p.setDropoffPhone} keyboardType="phone-pad" />
        <TextField label="Notes (optionnel)" placeholder="Étage, portail, repère..." value={p.dropoffNotes} onChangeText={p.setDropoffNotes} />
      </Card>
    </View>
  );
}

// ─── Widget enregistrement vocal ──────────────────────────────────────────────

type RecorderStatus = 'idle' | 'recording' | 'recorded';

function VoiceRecorderWidget({
  voiceUri,
  onRecorded,
}: {
  voiceUri: string | null;
  onRecorded: (uri: string | null) => void;
}) {
  const [status, setStatus]   = useState<RecorderStatus>(voiceUri ? 'recorded' : 'idle');
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const player   = useAudioPlayer(voiceUri ?? '');

  // Keep status in sync when parent clears the URI from outside
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
      Alert.alert(
        'Microphone requis',
        'SECULIV a besoin du microphone pour enregistrer les instructions. Autorisez-le dans les Réglages.'
      );
      return;
    }
    // iOS exige l'activation explicite du mode enregistrement avant record()
    await AudioModule.setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
    });
    await recorder.prepareToRecordAsync(RecordingPresets.HIGH_QUALITY);
    recorder.record();
    setSeconds(0);
    setStatus('recording');
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  }

  async function stopRecording() {
    clearTimer();
    await recorder.stop();
    // Repasse en mode lecture standard
    await AudioModule.setAudioModeAsync({ allowsRecording: false });
    const uri = recorder.uri;
    if (uri) {
      onRecorded(uri);
      setStatus('recorded');
    } else {
      setStatus('idle');
    }
  }

  function reRecord() {
    onRecorded(null);
    setStatus('idle');
    setSeconds(0);
    player.pause();
  }

  function formatSecs(s: number) {
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

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
          <Text style={recStyles.recTimer}>{formatSecs(seconds)}</Text>
        </View>
        <Text style={recStyles.recHint}>Décrivez l'accès à voix haute (portail, étage, repère…)</Text>
        <Pressable style={recStyles.stopBtn} onPress={stopRecording}>
          <MicOff size={16} color={colors.white} />
          <Text style={recStyles.stopBtnText}>Arrêter</Text>
        </Pressable>
      </View>
    );
  }

  // status === 'recorded'
  return (
    <View style={recStyles.doneBox}>
      <View style={recStyles.doneHeader}>
        <Volume2 size={16} color={colors.green} />
        <Text style={recStyles.doneTitle}>Guidage vocal ajouté</Text>
      </View>
      <View style={recStyles.doneActions}>
        <Pressable
          style={recStyles.playBtn}
          onPress={() => player.playing ? player.pause() : player.play()}
        >
          <Play size={14} color={colors.green} />
          <Text style={recStyles.playBtnText}>{player.playing ? 'Pause' : 'Écouter'}</Text>
        </Pressable>
        <Pressable style={recStyles.rerecBtn} onPress={reRecord}>
          <RotateCcw size={14} color={colors.muted} />
          <Text style={recStyles.rerecBtnText}>Refaire</Text>
        </Pressable>
        <Pressable style={recStyles.deleteBtn} onPress={reRecord}>
          <Trash2 size={14} color='#D14343' />
        </Pressable>
      </View>
    </View>
  );
}

const recStyles = StyleSheet.create({
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.navy, borderRadius: radius.md,
    borderStyle: 'dashed',
  },
  addBtnText:  { fontSize: 13, fontWeight: '600', color: colors.navy },
  recordingBox: {
    backgroundColor: '#FFF5F5', borderRadius: radius.md,
    borderWidth: 1, borderColor: '#F5BEBE',
    padding: spacing.md, gap: spacing.sm,
  },
  recRow:  { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  recDot:  { width: 8, height: 8, borderRadius: 4, backgroundColor: '#D14343' },
  recLabel:{ flex: 1, fontSize: 13, fontWeight: '700', color: '#D14343' },
  recTimer:{ fontSize: 13, fontWeight: '700', color: '#D14343', fontVariant: ['tabular-nums'] },
  recHint: { fontSize: 11, color: colors.muted },
  stopBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.xs, backgroundColor: '#D14343', borderRadius: radius.md,
    paddingVertical: spacing.sm,
  },
  stopBtnText: { fontSize: 13, fontWeight: '700', color: colors.white },
  doneBox: {
    backgroundColor: colors.greenSoft, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.green,
    padding: spacing.md, gap: spacing.sm,
  },
  doneHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  doneTitle: { fontSize: 13, fontWeight: '700', color: colors.green },
  doneActions: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  playBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.xs, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.green, borderRadius: radius.md,
    backgroundColor: colors.white,
  },
  playBtnText: { fontSize: 12, fontWeight: '600', color: colors.green },
  rerecBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    backgroundColor: colors.white,
  },
  rerecBtnText: { fontSize: 12, fontWeight: '600', color: colors.muted },
  deleteBtn: {
    width: 38, height: 38, borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#F5BEBE', backgroundColor: colors.white,
  },
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
};

function StepParcelType({ parcelType, setParcelType, expectedIdType, setExpectedIdType, expectedIdName, setExpectedIdName, dropoffName }: StepParcelTypeProps) {
  const isSensible = parcelType === 'sensible';

  return (
    <View style={styles.stepGap}>
      {PARCEL_TYPE_OPTIONS.map((option) => {
        const selected = parcelType === option.value;
        const isSens   = option.value === 'sensible';
        return (
          <Pressable key={option.value} onPress={() => setParcelType(option.value)}>
            <Card style={[
              styles.optionCard,
              selected && (isSens ? styles.optionCardSensible : styles.optionCardSelected),
            ]}>
              <View style={styles.optionTexts}>
                <Text style={styles.optionLabel}>{option.label}</Text>
                <Text style={styles.optionDescription}>{option.description}</Text>
              </View>
              {selected && <Check size={20} color={isSens ? VIOLET : colors.green} />}
            </Card>
          </Pressable>
        );
      })}

      {/* Avertissement standard (non-sensible) */}
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

      {/* Bandeau violet "Livraison sensible activée" */}
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

      {/* Champs obligatoires pièce d'identité (mode sensible seulement) */}
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
            <Text style={styles.idTypeSelected}>
              {ID_TYPES.find((t) => t.value === expectedIdType)?.label}
            </Text>
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

// ─── Step 4 : Paiement ───────────────────────────────────────────────────────

function StepPayment({ parcelType, plan, price, isSensible }: { parcelType: ParcelType | null; plan: ReturnType<typeof getPlan> | null; price: number; isSensible: boolean }) {
  const parcelLabel = PARCEL_TYPE_OPTIONS.find((o) => o.value === parcelType)?.label ?? '—';

  return (
    <View style={styles.stepGap}>
      {isSensible && (
        <View style={styles.sensibleSummaryBadge}>
          <Lock size={14} color={VIOLET} />
          <Text style={styles.sensibleSummaryText}>Livraison sensible — contrôles renforcés</Text>
        </View>
      )}

      <Card style={styles.summaryCard}>
        <SummaryRow label="Type de colis" value={parcelLabel} />
        <SummaryRow label="Formule" value={plan?.name ?? '—'} />
        <SummaryRow label="Assurance" value={plan?.insurance ?? '—'} valueColor={colors.green} />
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total à régler</Text>
          <Text style={styles.totalValue}>{price.toLocaleString('fr-FR')} F</Text>
        </View>
      </Card>

      <Text style={styles.payMethodLabel}>Mode de paiement</Text>
      <View style={[styles.payOption, styles.payOptionActive]}>
        <View style={[styles.payIcon, styles.payIconCash]}><Banknote size={20} color={colors.green} /></View>
        <View style={styles.payOptionTexts}>
          <Text style={styles.payOptionTitle}>Espèces à la livraison</Text>
          <Text style={styles.payOptionSub}>Réglez le livreur en main propre</Text>
        </View>
        <Check size={18} color={colors.green} />
      </View>

      {/* TODO Étape future : paiement en ligne Wave/OM via agrégateur PayDunya. */}
      <View style={[styles.payOption, styles.payOptionSoon]}>
        <View style={[styles.payIcon, { backgroundColor: '#EAF3FF' }]}><View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#1E6FD9' }} /></View>
        <View style={styles.payOptionTexts}><Text style={styles.payOptionTitle}>Wave</Text><Text style={styles.payOptionSub}>Paiement mobile</Text></View>
        <Text style={styles.payBadge}>Bientôt</Text>
      </View>

      <View style={[styles.payOption, styles.payOptionSoon]}>
        <View style={[styles.payIcon, { backgroundColor: '#FFF1E6' }]}><View style={{ width: 16, height: 16, borderRadius: 3, backgroundColor: '#E8730C' }} /></View>
        <View style={styles.payOptionTexts}><Text style={styles.payOptionTitle}>Orange Money</Text><Text style={styles.payOptionSub}>Paiement mobile</Text></View>
        <Text style={styles.payBadge}>Bientôt</Text>
      </View>
    </View>
  );
}

function SummaryRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, valueColor ? { color: valueColor } : undefined]}>{value}</Text>
    </View>
  );
}

// ─── Écran de confirmation ────────────────────────────────────────────────────

function OrderConfirmedScreen({
  price, code, codeDest, isSensible, onTrack,
}: {
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

        {/* Code expéditeur (ou code unique pour non-sensible) */}
        {code && (
          <View style={styles.confirmedCodeBox}>
            <Text style={styles.confirmedCodeLabel}>
              {isSensible ? 'Votre code expéditeur' : 'Votre code secret'}
            </Text>
            <Text style={styles.confirmedCode}>{code.split('').join(' ')}</Text>
            {isSensible && (
              <Text style={styles.confirmedCodeHint}>
                Communiquez ce code au livreur à son arrivée.
              </Text>
            )}
          </View>
        )}

        {/* Code destinataire (sensible uniquement) */}
        {isSensible && codeDest && (
          <View style={[styles.confirmedCodeBox, styles.confirmedCodeBoxDest]}>
            <Text style={styles.confirmedCodeLabel}>Code destinataire</Text>
            <Text style={styles.confirmedCode}>{codeDest.split('').join(' ')}</Text>
            <Text style={styles.confirmedCodeHint}>
              À communiquer au destinataire avant la livraison.{'\n'}
              {/* TODO : envoi SMS direct au destinataire (Twilio ou Orange SMS API). */}
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
  safeArea:     { flex: 1, backgroundColor: colors.white },
  confirmedSafe:{ flex: 1, backgroundColor: colors.navy },
  flex:         { flex: 1 },
  topBar: {
    backgroundColor: colors.white,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  iconButton: {
    width: 40, height: 40,
    borderRadius: radius.pill,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  headerTitle: { fontSize: 16, fontWeight: '800', color: colors.ink },
  headerStep:  { width: 40, textAlign: 'right', fontSize: 13, color: colors.muted },
  progressTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.line,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    overflow: 'hidden',
  },
  progressFill: { height: 6, borderRadius: radius.pill, backgroundColor: colors.green },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    backgroundColor: colors.bg,
    flexGrow: 1,
  },
  footer: {
    padding: spacing.lg,
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  errorText: { fontSize: 13, color: '#D14343', textAlign: 'center' },
  stepGap:   { gap: spacing.lg },
  // Addresses
  addressCard: { gap: spacing.md },
  addressHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  addressTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  // Parcel type selector
  optionCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 2, borderColor: 'transparent', gap: spacing.md,
  },
  optionCardSelected:  { borderColor: colors.green, backgroundColor: colors.greenSoft },
  optionCardSensible:  { borderColor: VIOLET, backgroundColor: VIOLET_SOFT },
  optionTexts: { flex: 1, gap: 2 },
  optionLabel: { fontSize: 15, fontWeight: '700', color: colors.ink },
  optionDescription: { fontSize: 12, color: colors.muted },
  // Warning box
  warningBox: {
    flexDirection: 'row', alignItems: 'center',
    gap: spacing.sm, backgroundColor: '#FBF0DC',
    borderRadius: radius.md, padding: spacing.md,
  },
  warningText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#8A6200' },
  // Sensible banner
  sensibleBanner: {
    backgroundColor: VIOLET_SOFT,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#D9CEEF',
    padding: spacing.md,
    gap: spacing.sm,
  },
  sensibleBannerHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sensibleBannerTitle: { fontSize: 14, fontWeight: '800', color: VIOLET },
  sensibleBannerSub: { fontSize: 12, color: VIOLET, fontWeight: '600' },
  sensibleFeatures: { gap: spacing.xs },
  sensibleFeatureRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sensibleFeatureDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: VIOLET, flexShrink: 0 },
  sensibleFeatureText: { fontSize: 12, color: colors.ink, flex: 1 },
  // ID card
  idCard: { gap: spacing.md, borderWidth: 1, borderColor: '#D9CEEF' },
  idCardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  idCardTitle: { fontSize: 14, fontWeight: '700', color: VIOLET },
  idTypeLabel: { fontSize: 12, fontWeight: '700', color: colors.muted, textTransform: 'uppercase' },
  idTypeRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  idTypeChip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.line,
    backgroundColor: colors.white,
  },
  idTypeChipActive: { borderColor: VIOLET, backgroundColor: VIOLET_SOFT },
  idTypeChipText: { fontSize: 12, fontWeight: '600', color: colors.muted },
  idTypeChipTextActive: { color: VIOLET },
  idTypeSelected: { fontSize: 12, color: VIOLET, fontWeight: '600', marginTop: -spacing.xs },
  idNameHint: { fontSize: 11, color: colors.muted, marginTop: -spacing.sm },
  // Sensible summary badge
  sensibleSummaryBadge: {
    flexDirection: 'row', alignItems: 'center',
    gap: spacing.sm, backgroundColor: VIOLET_SOFT,
    borderRadius: radius.md, padding: spacing.md,
    borderWidth: 1, borderColor: '#D9CEEF',
  },
  sensibleSummaryText: { fontSize: 13, fontWeight: '700', color: VIOLET },
  // Summary
  summaryCard: { gap: spacing.sm },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryLabel: { fontSize: 14, color: colors.muted },
  summaryValue: { fontSize: 14, fontWeight: '700', color: colors.ink },
  totalRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: spacing.sm, paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.line,
  },
  totalLabel: { fontSize: 16, fontWeight: '800', color: colors.ink },
  totalValue: { fontSize: 22, fontWeight: '800', color: colors.navy },
  // Payment
  payMethodLabel: { fontSize: 13, fontWeight: '700', color: colors.ink },
  payOption: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.md, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.white,
  },
  payOptionActive: { borderColor: colors.green, backgroundColor: colors.greenSoft },
  payOptionSoon:   { opacity: 0.55 },
  payIcon: {
    width: 40, height: 40, borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  payIconCash: { backgroundColor: colors.white, borderWidth: 1, borderColor: '#CDE8D5' },
  payOptionTexts: { flex: 1, gap: 2 },
  payOptionTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  payOptionSub: { fontSize: 11, color: colors.muted },
  payBadge: {
    fontSize: 10, fontWeight: '700',
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 999, backgroundColor: '#EEF1F5', color: colors.muted,
  },
  // Plans
  planOption: { borderWidth: 2, borderColor: 'transparent', gap: spacing.xs },
  planOptionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
  planOptionName:  { fontSize: 15, fontWeight: '700', color: colors.ink },
  planOptionPrice: { fontSize: 15, fontWeight: '800', color: colors.navy },
  planOptionInclude: { fontSize: 12, color: colors.muted, lineHeight: 18 },
  planOptionInsurance: { fontSize: 12, fontWeight: '700', color: colors.green, marginTop: spacing.xs },
  // Confirmation
  confirmedBg: { flex: 1, backgroundColor: colors.navy, justifyContent: 'space-between' },
  confirmedBody: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: spacing.lg, paddingHorizontal: spacing.xl,
  },
  confirmedIconWrap: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: 'rgba(67,176,92,0.16)',
    alignItems: 'center', justifyContent: 'center',
  },
  confirmedTitle: { fontSize: 22, fontWeight: '800', color: colors.white, textAlign: 'center' },
  confirmedSub: {
    fontSize: 14, color: '#9FB0CC', textAlign: 'center',
    lineHeight: 22, maxWidth: 260,
  },
  confirmedSubBold: { color: colors.white, fontWeight: '700' },
  confirmedCodeBox: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    gap: spacing.xs,
    width: '100%',
  },
  confirmedCodeBoxDest: {
    backgroundColor: 'rgba(107,79,168,0.20)',
    borderWidth: 1,
    borderColor: 'rgba(107,79,168,0.40)',
  },
  confirmedCodeLabel: { fontSize: 11, color: '#9FB0CC', fontWeight: '600' },
  confirmedCode: { fontSize: 28, fontWeight: '800', letterSpacing: 8, color: colors.white },
  confirmedCodeHint: {
    fontSize: 11, color: '#9FB0CC',
    textAlign: 'center', lineHeight: 16, marginTop: 2,
  },
  confirmedFooter: { padding: spacing.lg, paddingBottom: spacing.xl },
});
