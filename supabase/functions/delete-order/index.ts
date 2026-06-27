import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Non authentifié.' }), {
        status: 401,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const { orderId } = await req.json() as { orderId?: string };
    if (!orderId) {
      return new Response(JSON.stringify({ error: 'orderId manquant.' }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Vérifier le JWT de l'appelant
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: callerUser }, error: jwtError } = await callerClient.auth.getUser();
    if (jwtError || !callerUser) {
      return new Response(JSON.stringify({ error: 'Token invalide.' }), {
        status: 401,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // Seul l'admin peut supprimer une commande
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: callerProfile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', callerUser.id)
      .single();

    if (callerProfile?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Accès refusé.' }), {
        status: 403,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // Récupérer la commande pour savoir si un livreur est assigné
    const { data: order, error: fetchError } = await adminClient
      .from('orders')
      .select('id, driver_id, status')
      .eq('id', orderId)
      .single();

    if (fetchError || !order) {
      return new Response(JSON.stringify({ error: 'Commande introuvable.' }), {
        status: 404,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // Si un livreur est assigné et que la course n'est pas terminée,
    // le remettre disponible (hors_ligne) pour qu'il puisse reprendre du service.
    if (order.driver_id && !['livree', 'annulee'].includes(order.status)) {
      await adminClient
        .from('drivers')
        .update({ status: 'hors_ligne' })
        .eq('id', order.driver_id);
    }

    // Supprimer les secret_codes liés à cette commande (pas de CASCADE garanti)
    await adminClient
      .from('secret_codes')
      .delete()
      .eq('order_id', orderId);

    // Supprimer la commande — cascade sur incidents, monitoring_events, certificates
    const { error: deleteError } = await adminClient
      .from('orders')
      .delete()
      .eq('id', orderId);

    if (deleteError) {
      return new Response(JSON.stringify({ error: deleteError.message }), {
        status: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
