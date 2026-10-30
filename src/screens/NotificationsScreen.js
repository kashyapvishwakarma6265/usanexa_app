import React, { useCallback, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../api/client";
import { EP } from "../api/endpoints";
import { Avatar } from "../components/ui";

const parse = (iso) => {
  if (!iso) return null;
  const d = new Date(iso.endsWith("Z") || /[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + "Z");
  return isNaN(d) ? null : d;
};

// "just now", "5m ago", "3h ago", "2d ago", then a short date
const when = (iso) => {
  const d = parse(iso);
  if (!d) return "";
  const s = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.round(s / 86400)}d ago`;
  return d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
};

// small badge icon on the avatar, chosen from the notification type
const typeIcon = (type = "") => {
  const t = String(type).toLowerCase();
  if (t.includes("accept")) return ["checkmark", "#3bb273"];
  if (t.includes("request")) return ["person-add", "#247cff"];
  if (t.includes("like") || t.includes("rating")) return ["star", "#ffc83d"];
  if (t.includes("comment") || t.includes("message")) return ["chatbubble", "#9775fa"];
  if (t.includes("follow")) return ["person", "#247cff"];
  return ["notifications", "#247cff"];
};

const SectionTitle = ({ title, count }) => (
  <View className="flex-row items-center mb-3 px-1">
    <Text className="text-white text-[17px] font-extrabold tracking-tight">{title}</Text>
    <View className="ml-2.5 min-w-[22px] h-[22px] px-1.5 rounded-full bg-brand/15 border border-brand/30 items-center justify-center">
      <Text className="text-brand text-[11px] font-bold">{count}</Text>
    </View>
  </View>
);

export default function NotificationsScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [requests, setRequests] = useState([]);       // pending requests I can accept / reject
  const [others, setOthers] = useState([]);           // everything else
  const [toast, setToast] = useState("");

  const flash = (t) => { setToast(t); setTimeout(() => setToast(""), 2200); };

  const load = useCallback(async () => {
    try {
      const [r, n] = await Promise.all([api(EP.connectionRequests), api(EP.connectionNotifications)]);
      const pending = r.requests || [];
      const pendingIds = new Set(pending.map((x) => x.request_id));
      setRequests(pending);
      // a "connection_request" notification that is still pending is shown above with buttons
      setOthers((n.notifications || []).filter((x) => !(x.type === "connection_request" && pendingIds.has(x.request_id))));
    } catch (e) { flash(e.message); }
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const respond = async (r, accept) => {
    setRequests((l) => l.filter((x) => x.request_id !== r.request_id));
    try {
      await api(accept ? EP.connectionAccept(r.request_id) : EP.connectionReject(r.request_id), { method: "POST" });
      flash(accept ? "Connected" : "Request removed");
      load();
    } catch (e) { flash(e.message); load(); }
  };

  const markRead = async (n) => {
    if (n.is_read) return;
    setOthers((l) => l.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
    try { await api(EP.connectionNotificationRead, { method: "POST", body: { notification_id: n.id } }); } catch {}
  };

  const markAllRead = async () => {
    const unread = others.filter((n) => !n.is_read);
    if (!unread.length) return flash("Nothing to mark");
    setOthers((l) => l.map((x) => ({ ...x, is_read: true })));
    await Promise.all(unread.map((n) =>
      api(EP.connectionNotificationRead, { method: "POST", body: { notification_id: n.id } }).catch(() => {})));
    flash("All marked as read");
  };

  const empty = !loading && !requests.length && !others.length;
  const unreadCount = others.filter((n) => !n.is_read).length + requests.length;

  return (
    <SafeAreaView className="flex-1 bg-[#070b12]" edges={["top"]}>
      {/* header */}
      <View className="h-[68px] flex-row items-center justify-between px-5">
        <View>
          <Text className="text-white text-[26px] font-extrabold tracking-tight">Notifications</Text>
          <Text className="text-[#71809a] text-[12px] mt-0.5">
            {unreadCount > 0 ? `${unreadCount} new ${unreadCount === 1 ? "update" : "updates"}` : "You're all caught up"}
          </Text>
        </View>
        <Pressable onPress={markAllRead} hitSlop={10}
          className="w-11 h-11 rounded-full bg-white/6 border border-white/10 items-center justify-center active:opacity-70">
          <Ionicons name="checkmark-done" size={20} color="#8fb4ff" />
        </Pressable>
      </View>

      <ScrollView contentContainerClassName="px-4 pt-2 pb-28" showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor="#247cff"
          onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        {loading && <ActivityIndicator color="#247cff" className="mt-10" />}

        {empty && (
          <View className="items-center pt-20 px-10">
            <View className="w-24 h-24 rounded-full bg-brand/8 items-center justify-center">
              <View className="w-16 h-16 rounded-full bg-brand/15 border border-brand/30 items-center justify-center">
                <Ionicons name="notifications-outline" size={30} color="#6aa8ff" />
              </View>
            </View>
            <Text className="text-white text-[19px] font-extrabold mt-5">No notifications yet</Text>
            <Text className="text-[#71809a] text-[13px] text-center leading-5 mt-1.5">
              New connection requests and updates will appear here.
            </Text>
          </View>
        )}

        {requests.length > 0 && (
          <View className="mb-6">
            <SectionTitle title="Connection requests" count={requests.length} />
            {requests.map((r) => (
              <View key={r.request_id} className="p-4 mb-3 rounded-3xl border border-white/10 bg-surface">
                <View className="flex-row items-center">
                  <View className="p-0.5 rounded-full border border-brand/40">
                    <Avatar uri={r.sender_profile_photo} name={r.sender_name || r.sender_username} size={50} />
                  </View>
                  <View className="flex-1 ml-3.5">
                    <Text className="text-white text-[16px] font-bold" numberOfLines={1}>{r.sender_name || r.sender_username}</Text>
                    <Text className="text-muted text-[12px] mt-0.5" numberOfLines={1}>@{r.sender_username} wants to connect</Text>
                  </View>
                  <View className="w-9 h-9 rounded-full bg-brand/15 items-center justify-center">
                    <Ionicons name="person-add" size={16} color="#4d94ff" />
                  </View>
                </View>
                <View className="flex-row gap-2.5 mt-4">
                  <Pressable onPress={() => respond(r, true)}
                    className="flex-1 h-11 rounded-full bg-brand flex-row items-center justify-center active:opacity-80">
                    <Ionicons name="checkmark" size={18} color="#fff" />
                    <Text className="text-white text-[14px] font-bold ml-1.5">Accept</Text>
                  </Pressable>
                  <Pressable onPress={() => respond(r, false)}
                    className="flex-1 h-11 rounded-full bg-white/6 border border-white/12 flex-row items-center justify-center active:opacity-70">
                    <Ionicons name="close" size={18} color="#aeb7c5" />
                    <Text className="text-[#aeb7c5] text-[14px] font-bold ml-1.5">Decline</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        {others.length > 0 && (
          <View>
            <SectionTitle title="Activity" count={others.length} />
            {others.map((n) => {
              const [ic, col] = typeIcon(n.type);
              return (
                <Pressable key={n.id} onPress={() => markRead(n)}
                  className={`flex-row items-center p-3.5 mb-2.5 rounded-3xl border active:opacity-80 ${
                    n.is_read ? "bg-surface border-white/8" : "bg-brand/8 border-brand/35"
                  }`}>
                  <View>
                    <Avatar uri={n.sender_profile_picture} name={n.sender_name || n.sender_username} size={46} />
                    <View className="absolute -right-1 -bottom-1 w-[22px] h-[22px] rounded-full bg-[#070b12] items-center justify-center">
                      <View className="w-[18px] h-[18px] rounded-full items-center justify-center" style={{ backgroundColor: col }}>
                        <Ionicons name={ic} size={10} color="#fff" />
                      </View>
                    </View>
                  </View>
                  <View className="flex-1 ml-3.5">
                    <Text className={`text-[14px] leading-5 ${n.is_read ? "text-[#b4c0d3]" : "text-white font-medium"}`}>{n.message}</Text>
                    <Text className="text-faint text-[11px] mt-1">{when(n.created_at)}</Text>
                  </View>
                  {!n.is_read && <View className="w-2.5 h-2.5 rounded-full bg-brand ml-2.5" />}
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      {toast ? (
        <View pointerEvents="none" className="absolute bottom-8 self-center flex-row items-center px-4 py-3 rounded-full bg-[#111923] border border-white/12">
          <Ionicons name="information-circle" size={16} color="#6aa8ff" />
          <Text className="text-ink text-[13px] font-medium ml-2">{toast}</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}