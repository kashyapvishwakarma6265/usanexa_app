import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, Pressable, FlatList, useWindowDimensions, ActivityIndicator, Modal, TextInput,
  Share, Alert, KeyboardAvoidingView, Platform, Animated,
} from "react-native";
import { Video, ResizeMode } from "expo-av";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { api, absUrl } from "../api/client";
import { EP } from "../api/endpoints";
import { useAuth } from "../context/AuthContext";
import { Avatar, Empty } from "../components/ui";

const PAGE = 10;
const REPORT_REASONS = ["Spam", "Nudity", "Violence", "Hate or harassment", "False information", "Other"];
const RATE_LABELS = ["Okay", "Good", "Loved it"];
const SESSION_ID = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const total = (r) => (r.one_star_count || 0) + (r.two_star_count || 0) + (r.three_star_count || 0);

// 1200 -> 1.2K, 2500000 -> 2.5M
const fmt = (n) => {
  n = Number(n) || 0;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, "")}K`;
  return String(n);
};

const tags = (s) =>
  (s || "").split(/[\s,]+/).filter(Boolean).slice(0, 3).map((t) => (t.startsWith("#") ? t : `#${t}`));

// ── small presentational pieces (defined outside so they never remount) ──────────
const RailBtn = ({ icon, color = "#fff", label, onPress, active }) => (
  <Pressable onPress={onPress} className="items-center active:opacity-70">
    <View
      className={`w-12 h-12 rounded-full items-center justify-center border ${
        active ? "bg-white/20 border-white/40" : "bg-black/35 border-white/15"
      }`}
    >
      <Ionicons name={icon} size={24} color={color} />
    </View>
    {label !== undefined && <Text className="text-white text-[11px] font-semibold mt-1.5">{fmt(label)}</Text>}
  </Pressable>
);

const GlassBtn = ({ icon, onPress }) => (
  <Pressable onPress={onPress} className="w-10 h-10 rounded-full bg-black/35 border border-white/20 items-center justify-center active:opacity-70">
    <Ionicons name={icon} size={20} color="#fff" />
  </Pressable>
);

const SheetHandle = () => (
  <View className="items-center pt-2.5 pb-1">
    <View className="w-10 h-1 rounded-full bg-white/20" />
  </View>
);

const MenuRow = ({ icon, label, onPress, danger, chevron }) => (
  <Pressable onPress={onPress} className="flex-row items-center h-14 active:opacity-60">
    <View className={`w-9 h-9 rounded-xl items-center justify-center ${danger ? "bg-red-500/15" : "bg-white/8"}`}>
      <Ionicons name={icon} size={18} color={danger ? "#ff6b6b" : "#dbe4f3"} />
    </View>
    <Text className={`flex-1 ml-3 text-[15px] font-medium ${danger ? "text-danger" : "text-ink"}`}>{label}</Text>
    {chevron && <Ionicons name="chevron-forward" size={16} color="#5d6a80" />}
  </Pressable>
);

export default function ReelsScreen({ navigation }) {
  const { user } = useAuth();
  const { height } = useWindowDimensions();
  const tabH = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const h = height - tabH;

  const [reels, setReels] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [more, setMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(0);
  const [focused, setFocused] = useState(true);
  const [muted, setMuted] = useState(false);
  const [saved, setSaved] = useState({});      // reel id -> true
  const [myStars, setMyStars] = useState({});  // reel id -> 1..3 (this session)
  const [sheet, setSheet] = useState(null);    // {type: 'comments'|'menu'|'rate'|'report', reel}
  const [comments, setComments] = useState([]);
  const [cLoading, setCLoading] = useState(false);
  const [draft, setDraft] = useState("");

  const progress = useRef({});   // id -> {pos, dur}
  const fetching = useRef(false);
  const loadedOnce = useRef(false);

  // animated values (no re-renders)
  const progressAnim = useRef(new Animated.Value(0)).current;
  const flash = useRef(new Animated.Value(0)).current;

  const patch = (id, fields) => setReels((l) => l.map((r) => (r.id === id ? { ...r, ...fields } : r)));

  // ── feed ────────────────────────────────────────────────────
  const fetchPage = useCallback(async (reset) => {
    if (fetching.current) return;
    fetching.current = true;
    try {
      const q = `?limit=${PAGE}${!reset && cursor ? `&cursor=${cursor}` : ""}`;
      const d = await api(EP.reelsFeed + q);
      const list = d.reels || [];
      setReels((prev) => (reset ? list : [...prev, ...list.filter((r) => !prev.some((p) => p.id === r.id))]));
      setCursor(d.next_cursor || null);
      setMore(list.length >= PAGE && !!d.next_cursor);
    } catch (e) { if (reset) setReels([]); }
    fetching.current = false;
    setLoading(false);
  }, [cursor]);

  const loadSaved = useCallback(async () => {
    try {
      const d = await api(EP.reelsSaved);
      const m = {}; (d.reels || []).forEach((r) => { m[r.id] = true; });
      setSaved(m);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => {
    setFocused(true);
    if (!loadedOnce.current) { loadedOnce.current = true; fetchPage(true); } // keep scroll position when returning to the tab
    loadSaved();
    return () => { setFocused(false); flushWatch(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []));

  // ── watch analytics: POST /api/reels/{id}/watch ─────────────
  const activeRef = useRef({ id: null, index: 0 });
  const flushWatch = useCallback(() => {
    const { id, index } = activeRef.current;
    const p = id && progress.current[id];
    if (!p || !p.dur) return;
    const watch = Math.min(p.pos, p.dur) / 1000;
    const pct = Math.min(100, Math.round((p.pos / p.dur) * 100));
    api(EP.reelWatch(id), {
      method: "POST",
      body: { watch_time: watch, watch_percentage: pct, completed: pct >= 90, replayed: false, session_id: SESSION_ID, feed_position: index, source: "feed" },
      silent401: true,
    }).catch(() => {});
    progress.current[id] = { pos: 0, dur: p.dur };
  }, []);

  const onViewable = useRef(({ viewableItems }) => {
    const v = viewableItems[0];
    if (!v) return;
    if (activeRef.current.id !== v.item.id) { flushWatch(); progressAnim.setValue(0); }
    activeRef.current = { id: v.item.id, index: v.index ?? 0 };
    setActive(v.index ?? 0);
  }).current;

  useEffect(() => () => flushWatch(), [flushWatch]);

  // ── actions ─────────────────────────────────────────────────
  const toggleMute = () => {
    setMuted((m) => !m);
    flash.stopAnimation();
    flash.setValue(1);
    Animated.timing(flash, { toValue: 0, duration: 450, delay: 350, useNativeDriver: true }).start();
  };

  const rate = async (reel, rating) => {
    setSheet(null);
    try {
      const d = await api(EP.reelRating(reel.id), { method: "POST", body: { rating } });
      setMyStars((m) => ({ ...m, [reel.id]: rating }));
      patch(reel.id, { one_star_count: d.one_star_count, two_star_count: d.two_star_count, three_star_count: d.three_star_count });
    } catch (e) { Alert.alert("Could not rate", e.message); }
  };

  const toggleSave = async (reel) => {
    const was = !!saved[reel.id];
    setSaved((s) => ({ ...s, [reel.id]: !was }));
    try {
      const d = await api(EP.reelSave(reel.id), { method: was ? "DELETE" : "POST" });
      if (typeof d.save_count === "number") patch(reel.id, { save_count: d.save_count });
    } catch (e) { setSaved((s) => ({ ...s, [reel.id]: was })); Alert.alert("Failed", e.message); }
  };

  const share = async (reel) => {
    try {
      const r = await Share.share({ message: `${reel.caption ? reel.caption + "\n" : ""}${reel.video_url}` });
      if (r.action === Share.sharedAction) {
        const d = await api(EP.reelShare(reel.id), { method: "POST", body: { share_type: "native" } });
        if (typeof d.share_count === "number") patch(reel.id, { share_count: d.share_count });
      }
    } catch {}
  };

  const openComments = async (reel) => {
    setSheet({ type: "comments", reel }); setComments([]); setDraft(""); setCLoading(true);
    try { const d = await api(EP.reelComments(reel.id) + "?limit=100"); setComments(d.comments || []); } catch {}
    setCLoading(false);
  };

  const sendComment = async () => {
    const reel = sheet?.reel; const content = draft.trim();
    if (!reel || !content) return;
    setDraft("");
    try {
      const d = await api(EP.reelComments(reel.id), { method: "POST", body: { content } });
      setComments((l) => [d.comment, ...l]);
      patch(reel.id, { comment_count: (reel.comment_count || 0) + 1 });
      setSheet((s) => s && { ...s, reel: { ...s.reel, comment_count: (s.reel.comment_count || 0) + 1 } });
    } catch (e) { Alert.alert("Could not comment", e.message); setDraft(content); }
  };

  const deleteComment = async (c) => {
    const reel = sheet.reel;
    try {
      await api(EP.reelComment(reel.id, c.id), { method: "DELETE" });
      setComments((l) => l.filter((x) => x.id !== c.id));
      patch(reel.id, { comment_count: Math.max(0, (reel.comment_count || 1) - 1) });
    } catch (e) { Alert.alert("Could not delete", e.message); }
  };

  const notInterested = async (reel) => {
    setSheet(null);
    setReels((l) => l.filter((r) => r.id !== reel.id));
    try { await api(EP.reelNotInterested(reel.id), { method: "POST" }); } catch {}
  };

  const report = async (reel, reason) => {
    setSheet(null);
    try { await api(EP.reelReport(reel.id), { method: "POST", body: { reason } }); Alert.alert("Thanks", "Your report was submitted."); }
    catch (e) { Alert.alert("Could not report", e.message); }
  };

  const remove = (reel) => {
    setSheet(null);
    Alert.alert("Delete reel", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try { await api(EP.reelDelete(reel.id), { method: "DELETE" }); setReels((l) => l.filter((r) => r.id !== reel.id)); }
        catch (e) { Alert.alert("Could not delete", e.message); }
      } },
    ]);
  };

  const canSend = draft.trim().length > 0;

  return (
    <View className="flex-1 bg-black">
      {/* top bar */}
      <View
        pointerEvents="box-none"
        style={{ top: insets.top + 8 }}
        className="absolute left-0 right-0 z-10 px-4 flex-row items-center justify-between"
      >
        <Text className="text-white text-[24px] font-extrabold tracking-tight">Reels</Text>
        <View className="flex-row items-center gap-2.5">
          <GlassBtn icon={muted ? "volume-mute" : "volume-high"} onPress={toggleMute} />
          <GlassBtn icon="add" onPress={() => navigation.navigate("ReelUpload")} />
        </View>
      </View>

      {/* top scrim */}
      <View pointerEvents="none" className="absolute top-0 left-0 right-0 z-[5]">
        <View className="h-28 bg-black/25" />
        <View className="absolute top-0 left-0 right-0 h-20 bg-black/25" />
        <View className="absolute top-0 left-0 right-0 h-10 bg-black/25" />
      </View>

      {/* mute flash */}
      <Animated.View
        pointerEvents="none"
        style={{ opacity: flash }}
        className="absolute inset-0 z-10 items-center justify-center"
      >
        <View className="w-20 h-20 rounded-full bg-black/55 border border-white/20 items-center justify-center">
          <Ionicons name={muted ? "volume-mute" : "volume-high"} size={34} color="#fff" />
        </View>
      </Animated.View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#fff" size="large" />
          <Text className="text-white/50 text-[12px] mt-3">Loading your feed…</Text>
        </View>
      ) : (
        <FlatList
          data={reels}
          pagingEnabled
          snapToInterval={h}
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          keyExtractor={(r) => String(r.id)}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={{ itemVisiblePercentThreshold: 80 }}
          getItemLayout={(_, i) => ({ length: h, offset: h * i, index: i })}
          onEndReachedThreshold={0.6}
          onEndReached={() => { if (more && !fetching.current) fetchPage(false); }}
          windowSize={3}
          ListEmptyComponent={
            <View style={{ height: h }} className="justify-center items-center px-10">
              <View className="w-20 h-20 rounded-full bg-white/8 border border-white/10 items-center justify-center mb-5">
                <Ionicons name="film-outline" size={34} color="#9aa7bb" />
              </View>
              <Text className="text-white text-lg font-bold mb-1">No reels yet</Text>
              <Text className="text-[#9aa7bb] text-[13px] text-center mb-6">Be the first to share a moment with everyone.</Text>
              <Pressable onPress={() => navigation.navigate("ReelUpload")} className="h-12 px-7 rounded-full bg-brand flex-row items-center justify-center active:opacity-80">
                <Ionicons name="add" size={20} color="#fff" />
                <Text className="text-white font-bold ml-1.5">Create a reel</Text>
              </Pressable>
            </View>
          }
          renderItem={({ item, index }) => {
            const c = item.creator || {};
            const stars = total(item);
            const rated = !!myStars[item.id];
            const isSaved = !!saved[item.id];
            const chips = tags(item.hashtags);
            return (
              <View style={{ height: h }} className="bg-black">
                <Pressable onPress={toggleMute} className="flex-1">
                  <Video
                    source={{ uri: absUrl(item.video_url) }}
                    posterSource={item.thumbnail_url ? { uri: absUrl(item.thumbnail_url) } : undefined}
                    usePoster
                    style={{ width: "100%", height: "100%" }}
                    resizeMode={ResizeMode.COVER}
                    isLooping
                    isMuted={muted}
                    shouldPlay={focused && index === active}
                    progressUpdateIntervalMillis={500}
                    onPlaybackStatusUpdate={(s) => {
                      if (!s.isLoaded) return;
                      const dur = s.durationMillis || progress.current[item.id]?.dur || 0;
                      progress.current[item.id] = { pos: s.positionMillis || 0, dur };
                      if (activeRef.current.id === item.id && dur) progressAnim.setValue(Math.min(1, (s.positionMillis || 0) / dur));
                    }}
                  />
                </Pressable>

                {/* bottom scrim (stacked layers fake a gradient) */}
                <View pointerEvents="none" className="absolute bottom-0 left-0 right-0">
                  <View className="absolute bottom-0 left-0 right-0 h-80 bg-black/10" />
                  <View className="absolute bottom-0 left-0 right-0 h-64 bg-black/15" />
                  <View className="absolute bottom-0 left-0 right-0 h-48 bg-black/20" />
                  <View className="absolute bottom-0 left-0 right-0 h-32 bg-black/25" />
                  <View className="absolute bottom-0 left-0 right-0 h-16 bg-black/25" />
                </View>

                {/* creator + caption */}
                <View className="absolute left-4 bottom-7 right-24">
                  <Pressable
                    onPress={() => c.user_id && navigation.navigate("UserProfile", { userId: c.user_id })}
                    className="flex-row items-center mb-3 active:opacity-80"
                  >
                    <View className="p-0.5 rounded-full bg-white/25 border border-white/50">
                      <Avatar uri={c.profile_photo} name={c.username || c.name} size={38} />
                    </View>
                    <View className="ml-2.5 flex-1">
                      <Text className="text-white font-bold text-[15px]" numberOfLines={1}>@{c.username || "user"}</Text>
                      {c.name && c.name !== c.username ? (
                        <Text className="text-white/60 text-[11px]" numberOfLines={1}>{c.name}</Text>
                      ) : null}
                    </View>
                  </Pressable>
                  {item.caption ? (
                    <Text className="text-white/95 text-[14px] leading-5" numberOfLines={3}>{item.caption}</Text>
                  ) : null}
                  {chips.length > 0 && (
                    <View className="flex-row flex-wrap gap-1.5 mt-2.5">
                      {chips.map((t) => (
                        <View key={t} className="px-2.5 py-1 rounded-full bg-white/15 border border-white/15">
                          <Text className="text-brandLight text-[11px] font-semibold">{t}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>

                {/* action rail */}
                <View className="absolute right-3.5 bottom-9 items-center gap-4">
                  <RailBtn
                    icon={rated ? "star" : "star-outline"}
                    color={rated ? "#ffc83d" : "#fff"}
                    active={rated}
                    label={stars}
                    onPress={() => setSheet({ type: "rate", reel: item })}
                  />
                  <RailBtn icon="chatbubble-outline" label={item.comment_count || 0} onPress={() => openComments(item)} />
                  <RailBtn
                    icon={isSaved ? "bookmark" : "bookmark-outline"}
                    color={isSaved ? "#72b0ff" : "#fff"}
                    active={isSaved}
                    label={item.save_count || 0}
                    onPress={() => toggleSave(item)}
                  />
                  <RailBtn icon="paper-plane-outline" label={item.share_count || 0} onPress={() => share(item)} />
                  <RailBtn icon="ellipsis-horizontal" onPress={() => setSheet({ type: "menu", reel: item })} />
                </View>

                {/* progress line */}
                <View pointerEvents="none" className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/15">
                  {index === active && (
                    <Animated.View
                      className="h-full bg-white rounded-r-full"
                      style={{ width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }}
                    />
                  )}
                </View>
              </View>
            );
          }}
        />
      )}

      {/* rate */}
      <Modal visible={sheet?.type === "rate"} transparent animationType="fade" onRequestClose={() => setSheet(null)}>
        <Pressable className="flex-1 bg-black/70 justify-center items-center px-8" onPress={() => setSheet(null)}>
          <Pressable onPress={() => {}} className="w-full bg-[#0b1424] border border-white/10 rounded-3xl px-6 pt-7 pb-6 items-center">
            <View className="w-14 h-14 rounded-full bg-[#ffc83d]/15 items-center justify-center mb-4">
              <Ionicons name="star" size={26} color="#ffc83d" />
            </View>
            <Text className="text-white text-lg font-bold">Rate this reel</Text>
            <Text className="text-[#9aa7bb] text-[13px] mt-1 mb-6">Your rating helps tune your feed.</Text>
            <View className="flex-row gap-3 w-full">
              {[1, 2, 3].map((n) => {
                const on = (myStars[sheet?.reel?.id] || 0) >= n;
                return (
                  <Pressable
                    key={n}
                    onPress={() => rate(sheet.reel, n)}
                    className={`flex-1 items-center py-4 rounded-2xl border active:opacity-70 ${
                      on ? "bg-[#ffc83d]/12 border-[#ffc83d]/50" : "bg-white/5 border-white/10"
                    }`}
                  >
                    <Ionicons name={on ? "star" : "star-outline"} size={32} color="#ffc83d" />
                    <Text className={`text-[12px] font-semibold mt-2 ${on ? "text-[#ffc83d]" : "text-[#9aa7bb]"}`}>{RATE_LABELS[n - 1]}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* comments */}
      <Modal visible={sheet?.type === "comments"} transparent animationType="slide" onRequestClose={() => setSheet(null)}>
        <Pressable className="flex-1 bg-black/60 justify-end" onPress={() => setSheet(null)}>
          <Pressable className="h-[72%] bg-[#0b1220] rounded-t-[28px] border-t border-white/10" onPress={() => {}}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
              <SheetHandle />
              <View className="h-11 flex-row items-center justify-center border-b border-white/10">
                <Text className="text-white font-bold text-[15px]">Comments</Text>
                {sheet?.reel?.comment_count ? (
                  <View className="ml-2 px-2 py-0.5 rounded-full bg-white/10">
                    <Text className="text-[#cfd8e6] text-[11px] font-semibold">{fmt(sheet.reel.comment_count)}</Text>
                  </View>
                ) : null}
              </View>
              {cLoading ? <ActivityIndicator color="#247cff" className="mt-8" /> : (
                <FlatList
                  data={comments}
                  keyExtractor={(c) => String(c.id)}
                  keyboardShouldPersistTaps="handled"
                  contentContainerClassName="px-4 py-4 gap-4"
                  ListEmptyComponent={
                    <View className="items-center pt-10">
                      <Ionicons name="chatbubbles-outline" size={34} color="#5d6a80" />
                      <Text className="text-[#9aa7bb] text-[13px] mt-3">No comments yet. Start the conversation.</Text>
                    </View>
                  }
                  renderItem={({ item: c }) => (
                    <View className="flex-row items-start">
                      <Avatar uri={c.user?.profile_photo} name={c.user?.name || c.user?.username} size={36} />
                      <View className="flex-1 ml-3">
                        <View className="self-start max-w-full bg-[#121b2e] rounded-2xl rounded-tl-md px-3.5 py-2.5">
                          <Text className="text-[#8fb4ff] text-[12px] font-semibold mb-0.5">@{c.user?.username}</Text>
                          <Text className="text-white text-[14px] leading-5">{c.content}</Text>
                        </View>
                      </View>
                      {c.user_id === user.id && (
                        <Pressable onPress={() => deleteComment(c)} hitSlop={10} className="ml-2 mt-2 active:opacity-60">
                          <Ionicons name="trash-outline" size={17} color="#7f8b9b" />
                        </Pressable>
                      )}
                    </View>
                  )}
                />
              )}
              <View className="flex-row items-center gap-2.5 px-3.5 pt-2.5 pb-6 border-t border-white/10 bg-[#0b1220]">
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  maxLength={2000}
                  placeholder="Add a comment…"
                  placeholderTextColor="#71809a"
                  className="flex-1 h-11 px-4 rounded-full bg-[#121b2e] border border-white/10 text-white text-[14px]"
                  onSubmitEditing={sendComment}
                  returnKeyType="send"
                />
                <Pressable
                  onPress={sendComment}
                  disabled={!canSend}
                  className={`w-11 h-11 rounded-full items-center justify-center ${canSend ? "bg-brand active:opacity-80" : "bg-white/10"}`}
                >
                  <Ionicons name="arrow-up" size={20} color={canSend ? "#fff" : "#5d6a80"} />
                </Pressable>
              </View>
            </KeyboardAvoidingView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ⋯ menu / report */}
      <Modal visible={sheet?.type === "menu" || sheet?.type === "report"} transparent animationType="slide" onRequestClose={() => setSheet(null)}>
        <Pressable className="flex-1 bg-black/60 justify-end" onPress={() => setSheet(null)}>
          <Pressable className="bg-[#0b1220] rounded-t-[28px] border-t border-white/10 px-5 pb-9" onPress={() => {}}>
            <SheetHandle />
            {sheet?.type === "report" ? (
              <>
                <View className="flex-row items-center pt-3 pb-2">
                  <Pressable onPress={() => setSheet({ type: "menu", reel: sheet.reel })} hitSlop={10} className="mr-3 active:opacity-60">
                    <Ionicons name="chevron-back" size={22} color="#fff" />
                  </Pressable>
                  <Text className="text-white text-[17px] font-bold">Why are you reporting this?</Text>
                </View>
                <Text className="text-[#9aa7bb] text-[12px] mb-2">Your report is anonymous.</Text>
                {REPORT_REASONS.map((r) => (
                  <MenuRow key={r} icon="flag-outline" label={r} chevron onPress={() => report(sheet.reel, r)} />
                ))}
              </>
            ) : (
              <>
                <View className="pt-2">
                  {sheet?.reel?.user_id === user.id ? (
                    <MenuRow icon="trash-outline" label="Delete reel" danger onPress={() => remove(sheet.reel)} />
                  ) : (
                    <>
                      <MenuRow icon="eye-off-outline" label="Not interested" onPress={() => notInterested(sheet.reel)} />
                      <MenuRow icon="flag-outline" label="Report" danger onPress={() => setSheet({ type: "report", reel: sheet.reel })} />
                    </>
                  )}
                </View>
                <Pressable onPress={() => setSheet(null)} className="h-12 mt-3 rounded-2xl bg-white/8 items-center justify-center active:opacity-70">
                  <Text className="text-white text-[15px] font-semibold">Cancel</Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}