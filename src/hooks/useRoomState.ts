import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Room, RoomPlayerWithPlayer, type Player } from "@/lib/api";

export type RoomState = {
  room: Room | null;
  players: RoomPlayerWithPlayer[];
  me: RoomPlayerWithPlayer | null;
  loading: boolean;
};

type PublicProfile = {
  id: string;
  username: string;
  telegram_id: string;
};

/**
 * Players table is locked down by RLS; usernames come from the player_public
 * view (safe columns only) and from the denormalized room_players.username.
 */
async function hydrateRoomPlayers(
  rows: Array<Record<string, unknown>>,
): Promise<RoomPlayerWithPlayer[]> {
  const ids = [...new Set(rows.map((row) => String(row.player_id ?? "")).filter(Boolean))];
  const profiles = new Map<string, PublicProfile>();

  if (ids.length > 0) {
    const { data } = await supabase
      .from("player_public")
      .select("id, username, telegram_id")
      .in("id", ids);
    for (const profile of data ?? []) {
      profiles.set(String((profile as PublicProfile).id), profile as PublicProfile);
    }
  }

  return rows.map((row) => {
    const playerId = String(row.player_id ?? "");
    const profile = profiles.get(playerId);
    const username =
      (typeof row.username === "string" && row.username.trim()) ||
      profile?.username ||
      "Player";

    const player = {
      id: playerId,
      telegram_id: profile?.telegram_id ?? "",
      username,
      wallet_balance: 0,
      is_admin: false,
      created_at: "",
    } as Player;

    return {
      ...(row as unknown as RoomPlayerWithPlayer),
      username,
      player,
    };
  });
}

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
        // Do not join players(*) — RLS blocks it and returns null player objects.
        supabase.from("room_players").select("*").eq("room_id", roomId),
      ]);
      if (cancelled) return;
      setRoom(r as Room | null);
      setPlayers(await hydrateRoomPlayers((rps ?? []) as Array<Record<string, unknown>>));
      setLoading(false);
    }
    void fetchAll();

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
          void fetchAll();
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
