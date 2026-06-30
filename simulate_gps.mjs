/**
 * Simulation GPS livreur — SECULIV
 * Authentifie un compte livreur, puis insère des positions GPS toutes les 2s
 * pour simuler le trajet Dalal Jamm → École Stella Maris.
 *
 * Usage : node simulate_gps.mjs <email> <password>
 * Ex    : node simulate_gps.mjs driver@test.com motdepasse123
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL      = 'https://mbvxcqrleexvsagditbg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1idnhjcXJsZWV4dnNhZ2RpdGJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMjc0NzMsImV4cCI6MjA5NDYwMzQ3M30.Zt-QoQAzYZSD8pYJ3ZbCWNGDXAoYfQ4WR9q5uz6FVdA';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const ROUTE = [
  { lat: 14.7520, lng: -17.4380, label: 'Dalal Jamm (départ)' },
  { lat: 14.7528, lng: -17.4410, label: 'Route Golf Sud' },
  { lat: 14.7535, lng: -17.4440, label: 'Croisement Bethio' },
  { lat: 14.7545, lng: -17.4490, label: 'VDN direction Almadies' },
  { lat: 14.7558, lng: -17.4540, label: 'Almadies Nord' },
  { lat: 14.7570, lng: -17.4590, label: 'Av. Cheikh Anta Diop' },
  { lat: 14.7578, lng: -17.4620, label: 'Approche École Stella Maris' },
  { lat: 14.7582, lng: -17.4645, label: 'École Stella Maris (arrivée)' },
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const [,, email, password] = process.argv;

  console.log('╔══════════════════════════════════════════╗');
  console.log('║   SECULIV — Simulation GPS Livreur       ║');
  console.log('╚══════════════════════════════════════════╝\n');

  if (!email || !password) {
    console.log('Usage: node simulate_gps.mjs <email> <password>');
    console.log('\nPasse les identifiants du compte livreur de l\'app.');
    process.exit(0);
  }

  // 1. Auth
  console.log(`🔐 Connexion avec ${email}...`);
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
  if (authErr) { console.error(`❌ Auth échouée : ${authErr.message}`); process.exit(1); }
  console.log(`✅ Connecté\n`);

  // 2. Trouver une commande active
  console.log('🔍 Recherche d\'une commande active...');
  const { data: orders, error: ordErr } = await supabase
    .from('orders')
    .select('id, status, pickup, dropoff, driver_id')
    .in('status', ['enlevement', 'en_transport', 'arrivee', 'assignee'])
    .order('updated_at', { ascending: false })
    .limit(5);

  if (ordErr) { console.error('❌', ordErr.message); process.exit(1); }

  console.log(`   ${orders?.length ?? 0} commande(s) :`);
  orders?.forEach(o => console.log(`   #${o.id.slice(0,8)} ${o.status}`));

  const order = orders?.[0];
  if (!order) {
    console.log('\n⚠️  Aucune commande active. Crée une commande via l\'app client.');
    process.exit(1);
  }

  if (order.status === 'assignee') {
    await supabase.from('orders').update({ status: 'en_transport' }).eq('id', order.id);
    console.log(`✅ #${order.id.slice(0,8)} → en_transport`);
  }

  // 3. Realtime en parallèle
  let realtimeCount = 0;
  const channel = supabase.channel(`sim-${order.id}`)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'gps_tracking',
      filter: `order_id=eq.${order.id}`,
    }, (p) => {
      realtimeCount++;
      console.log(`  📡 Realtime #${realtimeCount}: (${p.new.lat.toFixed(4)}, ${p.new.lng.toFixed(4)})`);
    })
    .subscribe(s => console.log(`  📶 Canal: ${s}`));

  await sleep(1500);

  // 4. Simulation GPS
  console.log(`\n🏍️  Simulation — commande #${order.id.slice(0,8).toUpperCase()}\n`);
  let ok = 0, err = 0;
  for (let i = 0; i < ROUTE.length; i++) {
    const pt = ROUTE[i];
    const { error: insErr } = await supabase.from('gps_tracking').insert({
      order_id: order.id, lat: pt.lat, lng: pt.lng,
      accuracy: 4.5, speed: i === 0 ? 0 : 8.3, altitude: 12,
      heading: i < ROUTE.length - 1
        ? Math.atan2(ROUTE[i+1].lng - pt.lng, ROUTE[i+1].lat - pt.lat) * 180 / Math.PI : 270,
    });
    if (insErr) { err++; console.log(`  ❌ [${i+1}/${ROUTE.length}] ${insErr.message}`); }
    else        { ok++;  console.log(`  📍 [${i+1}/${ROUTE.length}] ${pt.label}`); }
    if (i < ROUTE.length - 1) await sleep(2000);
  }

  await sleep(2000);
  supabase.removeChannel(channel);

  // 5. Vérif finale
  const { data: pts } = await supabase
    .from('gps_tracking').select('lat, lng, created_at')
    .eq('order_id', order.id).order('created_at', { ascending: false }).limit(5);
  console.log(`\n📊 ${pts?.length ?? 0} dernières positions en base :`);
  pts?.forEach((p, i) => console.log(`   [${i+1}] (${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}) @ ${new Date(p.created_at).toLocaleTimeString('fr-FR')}`));

  // 6. Résultat
  console.log('\n══════════════════════════════════');
  console.log(`  GPS insérés : ${ok}/${ROUTE.length}  ${ok === ROUTE.length ? '✅' : '❌'}`);
  console.log(`  Realtime    : ${realtimeCount} événements  ${realtimeCount > 0 ? '✅' : '⚠️'}`);
  if (ok === ROUTE.length) console.log('\n🎉 Pipeline GPS validé !');
}

main().catch(console.error);
