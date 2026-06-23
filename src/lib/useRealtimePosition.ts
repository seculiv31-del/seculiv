import { useEffect, useRef, useState } from 'react';

import { supabase } from './supabase';

type Coords = { lat: number; lng: number; updatedAt: Date };

type SingleProps = { orderId: string; allActive?: false };
type AllProps = { allActive: true; orderId?: never };
type Props = SingleProps | AllProps;

type Result = {
  driverPosition: Coords | null;
  allPositions: Map<string, Coords>;
  secondsSinceUpdate: number | null;
};

export function useRealtimePosition(props: Props): Result {
  const [driverPosition, setDriverPosition] = useState<Coords | null>(null);
  const [allPositions, setAllPositions] = useState<Map<string, Coords>>(new Map());
  const [secondsSinceUpdate, setSecondsSinceUpdate] = useState<number | null>(null);

  const lastUpdateRef = useRef<Date | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Tick secondsSinceUpdate chaque seconde.
  useEffect(() => {
    const id = setInterval(() => {
      if (lastUpdateRef.current) {
        setSecondsSinceUpdate(
          Math.floor((Date.now() - lastUpdateRef.current.getTime()) / 1000)
        );
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const orderId = 'orderId' in props ? props.orderId : undefined;
    const allActive = 'allActive' in props ? props.allActive : false;
    const channelName = allActive ? 'gps-all-active' : `gps-${orderId}`;

    const filter = !allActive && orderId
      ? `order_id=eq.${orderId}`
      : undefined;

    // Remove any stale channels with the same name before subscribing.
    // removeChannel is async, so a previous unmount's cleanup may not have
    // finished by the time this effect runs — causing "cannot add callbacks
    // after subscribe()" if the topic is still active on the Realtime socket.
    supabase
      .getChannels()
      .filter((ch) => ch.topic === `realtime:${channelName}`)
      .forEach((ch) => supabase.removeChannel(ch));

    const channel = supabase
      .channel(channelName)
      .on(
        // @ts-ignore — surcharge postgres_changes non encore typée dans supabase-js
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'gps_tracking',
          ...(filter ? { filter } : {}),
        },
        (payload: { new: { order_id: string; lat: number; lng: number } }) => {
          const { order_id, lat, lng } = payload.new;
          const pos: Coords = { lat, lng, updatedAt: new Date() };

          lastUpdateRef.current = pos.updatedAt;
          setSecondsSinceUpdate(0);

          if (allActive) {
            setAllPositions((prev) => new Map(prev).set(order_id, pos));
          } else {
            setDriverPosition(pos);
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, ['orderId' in props ? props.orderId ?? 'all' : 'all']);

  return { driverPosition, allPositions, secondsSinceUpdate };
}
