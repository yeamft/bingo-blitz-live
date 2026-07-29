import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Room, RoomPlayerWithPlayer } from "@/lib/api";

export type RoomState = {
  room: Room | null;
  players: RoomPlayerWithPlayer[];
  me: RoomPlayerWithPlayer | null;
  loading: boolean;
};

export function useRoomState(roomId: string | null, myPlayerId: string | null): RoomState {
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<RoomPlayerWithPlayer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!roomId) {
      setRoom(null);
      setPlayers([]);
      setLoading(false);
      return;
    }
    let cancelled = false;

    async function fetchAll() {
      const [{ data: r }, { data: rps }] = await Promise.all([
        supabase.from("rooms").select("*").eq("id", roomId).maybeSingle(),
        supabase.from("room_players").select("*, player:players(*)").eq("room_id", roomId),
      ]);
      if (cancelled) return;
      setRoom(r as Room | null);
      setPlayers((rps ?? []) as RoomPlayerWithPlayer[]);
      setLoading(false);
    }
    fetchAll();

    const channel = supabase
      .channel(`room:${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
        (payload) => {
          if (payload.eventType === "DELETE") setRoom(null);
          else setRoom(payload.new as Room);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_players", filter: `room_id=eq.${roomId}` },
        () => {
          // re-fetch list with joined player info (cheap enough)
          fetchAll();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  const me = players.find((p) => p.player_id === myPlayerId) || null;
  return { room, players, me, loading };
}
