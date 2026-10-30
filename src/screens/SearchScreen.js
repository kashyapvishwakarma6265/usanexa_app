import React, { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, FlatList, ActivityIndicator, Modal, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api, absUrl } from "../api/client";
import { EP } from "../api/endpoints";
import { Avatar } from "../components/ui";

const HINT = "Search people by name, username, user ID or mobile";

function status(u) {
  if (u.is_self || u.connection_status === "self") return "self";
  if (u.is_connected || u.connection_status === "connected") return "connected";
  if (u.request_sent || u.connection_status === "pending_sent") return "pending_sent";
  if (u.request_received || u.connection_status === "pending_received") return "pending_received";
  return "none"; // includes "rejected" -> backend lets you send a new request
}

// ── 3D action button: a darker base layer shows as "thickness", the face presses down ──
const Action = ({ u, onConnect, onAccept }) => {
  const s = status(u);
  if (s === "self") return null;

  if (s === "connected") {
    return (
      <View className="flex-row items-center h-9 pl-2.5 pr-3.5 rounded-full bg-[#3bb273]/12 border border-[#3bb273]/35">
        <View className="w-5 h-5 rounded-full bg-[#3bb273] items-center justify-center shadow-md shadow-[#3bb273]/60">
          <Ionicons name="checkmark" size={13} color="#fff" />
        </View>
        <Text className="text-[#5fdc9d] text-[12px] font-bold ml-1.5">Connected</Text>
      </View>
    );
  }

  const sent = s === "pending_sent";
  if (sent) {
    return (
      <View className="min-w-[96px] h-9 px-3.5 rounded-2xl bg-[#0a0e15] border border-black border-b-white/8 flex-row items-center justify-center">
        <Ionicons name="time-outline" size={14} color="#7e8795" />
        <Text className="text-[#7e8795] text-[12px] font-bold ml-1.5">Requested</Text>
      </View>
    );
  }

  const accept = s === "pending_received";
  return (
    <View className={`rounded-2xl pb-[3px] shadow-lg ${accept ? "bg-[#1f8a5b] shadow-[#3bb273]/50" : "bg-[#1b4fb8] shadow-[#2f7cff]/50"}`}>
      <Pressable onPress={() => (accept ? onAccept(u) : onConnect(u))}
        className={`min-w-[96px] h-9 px-3.5 rounded-2xl border-t border-white/30 flex-row items-center justify-center active:translate-y-[3px] ${accept ? "bg-[#3bb273]" : "bg-[#2f7cff]"}`}>
        <Ionicons name={accept ? "checkmark" : "person-add"} size={14} color="#fff" />
        <Text className="text-white text-[13px] font-bold ml-1.5">{accept ? "Accept" : "Connect"}</Text>
      </Pressable>
    </View>
  );
};

export default function SearchScreen({ navigation }) {
  const [q, setQ] = useState("");
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState(HINT);
  const [viewer, setViewer] = useState(null);
  const ctrl = useRef(null);

  useEffect(() => {
    const query = q.trim();
    if (!query) { setUsers([]); setInfo(HINT); return; }
    setLoading(true); setInfo("Searching...");
    const t = setTimeout(async () => {
      ctrl.current?.abort();
      ctrl.current = new AbortController();
      try {
        const d = await api(`${EP.searchPeople}?q=${encodeURIComponent(query)}&limit=50&offset=0`, { signal: ctrl.current.signal });
        const list = Array.isArray(d.users) ? d.users : [];
        setUsers(list);
        setInfo(list.length ? `${list.length} result${list.length > 1 ? "s" : ""}` : "No users found");
      } catch (e) { if (e.name !== "AbortError") setInfo(e.message || "Search failed. Try again."); }
      setLoading(false);
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const patch = (id, connection_status) =>
    setUsers((l) => l.map((x) => (x.user_id === id ? { ...x, connection_status, is_connected: connection_status === "connected", request_sent: connection_status === "pending_sent", request_received: connection_status === "pending_received" } : x)));

  const connect = async (u) => {
    patch(u.user_id, "pending_sent");
    try {
      const d = await api(EP.connectionRequest, { method: "POST", body: { user_id: u.user_id } });
      patch(u.user_id, d.status || "pending_sent"); // backend may answer "connected" / "pending_received"
    } catch (e) { patch(u.user_id, "none"); setInfo(e.message); }
  };

  // The search result has no request id, so look it up in my pending requests first.
  const accept = async (u) => {
    try {
      const r = await api(EP.connectionRequests);
      const req = (r.requests || []).find((x) => x.sender_user_id === u.user_id);
      if (!req) return setInfo("Request not found. Pull to refresh in Alerts.");
      await api(EP.connectionAccept(req.request_id), { method: "POST" });
      patch(u.user_id, "connected");
    } catch (e) { setInfo(e.message); }
  };

  const openProfile = (u) => {
    if (status(u) === "connected" || status(u) === "self") navigation.navigate("UserProfile", { userId: u.user_id });
    else setInfo("Profiles are visible only to connected users. Send a request first.");
  };

  const idle = !q.trim() && users.length === 0;
  const noResults = !loading && !!q.trim() && users.length === 0 && info === "No users found";

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top"]}>
      <View className="px-4 pt-3">
        <Text className="text-white text-[28px] font-extrabold tracking-tight px-1">Find people</Text>
        <Text className="text-[#71809a] text-[13px] px-1 mt-0.5 mb-4">Connect to chat, share reels and see profiles.</Text>

        {/* inset search field: dark well with a light lower lip */}
        <View className="rounded-[26px] bg-[#05080d] pb-px shadow-lg shadow-black">
          <View className="h-[54px] flex-row items-center rounded-[26px] border border-black border-b-white/10 bg-[#0a0f17] px-4">
            <View className="w-8 h-8 rounded-full bg-[#2f7cff]/15 items-center justify-center">
              <Ionicons name="search" size={17} color="#6aa8ff" />
            </View>
            <TextInput value={q} onChangeText={setQ} placeholder="Search people" placeholderTextColor="#5d6a80"
              autoCapitalize="none" autoCorrect={false} maxLength={100} className="flex-1 ml-3 text-white text-[16px] h-full" />
            {loading ? <ActivityIndicator color="#2f7cff" size="small" /> : q ? (
              <Pressable onPress={() => setQ("")} className="w-8 h-8 rounded-full bg-white/10 items-center justify-center active:opacity-70">
                <Ionicons name="close" size={17} color="#fff" />
              </Pressable>
            ) : null}
          </View>
        </View>

        {!idle ? (
          <View className="self-start flex-row items-center mt-4 px-3.5 py-1.5 rounded-full bg-white/5 border border-white/8">
            <Ionicons name="information-circle-outline" size={14} color="#8d96a5" />
            <Text className="text-[#9aa7bb] text-[12px] font-medium ml-1.5" numberOfLines={2}>{info}</Text>
          </View>
        ) : <View className="h-3" />}
      </View>

      {/* idle illustration: stacked, tilted tiles for depth */}
      {idle ? (
        <View className="items-center pt-14 px-10">
          <View className="w-36 h-36 items-center justify-center">
            <View className="absolute w-24 h-24 rounded-[28px] bg-[#7a5cff]/20 border border-[#7a5cff]/30 rotate-[14deg] -translate-x-5 translate-y-2" />
            <View className="absolute w-24 h-24 rounded-[28px] bg-[#1b4fb8]/40 border border-[#2f7cff]/40 -rotate-[10deg] translate-x-5 translate-y-1" />
            <View className="rounded-[30px] bg-[#0b2a5c] pb-1.5 shadow-2xl shadow-[#2f7cff]/60">
              <View className="w-24 h-24 rounded-[30px] bg-[#2f7cff] border-t border-white/35 items-center justify-center">
                <Ionicons name="people" size={42} color="#fff" />
              </View>
            </View>
          </View>
          <Text className="text-white text-[19px] font-extrabold mt-8">Discover your people</Text>
          <Text className="text-[#71809a] text-[13px] text-center leading-5 mt-1.5">{HINT}</Text>
        </View>
      ) : null}

      {noResults ? (
        <View className="items-center pt-12 px-10">
          <View className="w-20 h-20 rounded-full bg-[#0a0f17] border border-black border-b-white/10 items-center justify-center shadow-lg shadow-black">
            <Ionicons name="person-outline" size={30} color="#5d6a80" />
          </View>
          <Text className="text-white text-[17px] font-bold mt-5">No one found</Text>
          <Text className="text-[#71809a] text-[13px] text-center mt-1.5">Check the spelling or try their username or ID.</Text>
        </View>
      ) : null}

      <FlatList
        data={users}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        keyExtractor={(u, i) => String(u.user_id || i)}
        contentContainerClassName="px-4 pt-1 pb-10"
        renderItem={({ item: u }) => (
          <View className="mb-3.5 rounded-[26px] bg-[#04070b] pb-1.5 shadow-xl shadow-black/80">
            <View className="flex-row items-center p-3.5 rounded-[26px] bg-[#0f1621] border border-white/6 border-t-white/15">
              <Pressable onPress={() => setViewer(u)} className="active:opacity-80">
                <View className="rounded-full p-[3px] bg-[#2f7cff]/45 shadow-lg shadow-[#2f7cff]/50">
                  <View className="rounded-full p-0.5 bg-[#0f1621]">
                    <Avatar uri={u.profile_photo} name={u.name || u.username} size={50} />
                  </View>
                </View>
              </Pressable>
              <Pressable className="flex-1 mx-3.5" onPress={() => openProfile(u)}>
                <Text className="text-white text-[16px] font-bold" numberOfLines={1}>{u.name || u.username}</Text>
                <Text className="text-[#8d96a5] text-[13px] mt-0.5" numberOfLines={1}>@{u.username}</Text>
              </Pressable>
              <Action u={u} onConnect={connect} onAccept={accept} />
            </View>
          </View>
        )}
      />

      {/* floating avatar viewer */}
      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <Pressable className="flex-1 bg-black/95 items-center justify-center" onPress={() => setViewer(null)}>
          <View className="w-[86%] aspect-square items-center justify-center">
            <View className="absolute w-full h-full rounded-full bg-[#2f7cff]/8" />
            <View className="absolute w-[92%] h-[92%] rounded-full bg-[#2f7cff]/10" />
            <View className="w-[80%] aspect-square rounded-full p-1.5 bg-[#2f7cff]/60 shadow-2xl shadow-[#2f7cff]">
              <View className="flex-1 rounded-full overflow-hidden bg-[#11161e] border-[5px] border-[#070b12] items-center justify-center">
                {viewer?.profile_photo
                  ? <Image source={{ uri: absUrl(viewer.profile_photo) }} className="w-full h-full" />
                  : <Text className="text-white text-7xl font-extrabold">{(viewer?.name || "U").charAt(0).toUpperCase()}</Text>}
              </View>
            </View>
          </View>
          {/* floor shadow under the floating avatar */}
          <View className="w-44 h-4 rounded-full bg-[#2f7cff]/20 -mt-3 mb-6" />
          <Text className="text-white text-[20px] font-extrabold tracking-tight">{viewer?.name || viewer?.username}</Text>
          {viewer?.username ? (
            <View className="mt-2 px-3.5 py-1.5 rounded-full bg-white/8 border border-white/12">
              <Text className="text-[#9aa7bb] text-[13px]">@{viewer.username}</Text>
            </View>
          ) : null}
          <Text className="text-[#5d6a80] text-[12px] mt-8">Tap anywhere to close</Text>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}