import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, Pressable, ScrollView, Image, ActivityIndicator, Modal, Share, TextInput, Alert, KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Video, ResizeMode } from "expo-av";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect } from "@react-navigation/native";
import { api, absUrl } from "../api/client";
import { EP } from "../api/endpoints";
import { useAuth } from "../context/AuthContext";
import { Empty } from "../components/ui";

// 1200 -> 1.2K, 2500000 -> 2.5M
const fmt = (n) => {
  n = Number(n) || 0;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, "")}K`;
  return String(n);
};

const TAB_ICONS = { reels: "film-outline", saved: "bookmark-outline", posts: "grid-outline" };
const FIELDS = [
  ["name", "Name", 100, "person-outline"],
  ["bio", "Bio", 500, "create-outline"],
  ["website", "Website", 500, "globe-outline"],
  ["instagram", "Instagram", 500, "logo-instagram"],
  ["social_link", "Other link", 500, "link-outline"],
];

// ── small presentational pieces (outside the screen so they never remount) ──
const Stat = ({ n, l, last }) => (
  <View className={`flex-1 items-center py-1 ${last ? "" : "border-r border-white/8"}`}>
    <Text className="text-white text-[19px] font-extrabold tracking-tight">{fmt(n)}</Text>
    <Text className="text-[#71809a] text-[11px] mt-0.5">{l}</Text>
  </View>
);

const LinkChip = ({ icon, text }) => (
  <View className="flex-row items-center px-3 py-1.5 rounded-full bg-brand/10 border border-brand/25 max-w-full">
    <Ionicons name={icon} size={13} color="#6aa8ff" />
    <Text className="text-brandLight text-[12px] font-semibold ml-1.5 flex-shrink" numberOfLines={1}>{text}</Text>
  </View>
);

const MenuItem = ({ icon, label, danger, onPress }) => (
  <Pressable onPress={onPress} className="h-11 flex-row items-center px-2.5 rounded-xl active:opacity-60">
    <Ionicons name={icon} size={18} color={danger ? "#ff6b6b" : "#c9d3e3"} />
    <Text className={`ml-3 text-[14px] font-medium ${danger ? "text-danger" : "text-[#e8edf5]"}`}>{label}</Text>
  </Pressable>
);

// Used for both "My Profile" (tab, params.me) and other users (params.userId).
// Backend: GET /api/profile/me  |  GET /api/profile/{user_id} (connected users only)
export default function ProfileScreen({ navigation, route }) {
  const { user: me, signOut, patchUser } = useAuth();
  const insets = useSafeAreaInsets();
  const isMe = !!route.params?.me || route.params?.userId === me?.user_id;
  const uid = isMe ? me?.user_id : route.params?.userId;

  const [p, setP] = useState(null);          // {user, relationship, stats, content}
  const [tab, setTab] = useState("reels");
  const [reels, setReels] = useState([]);
  const [saved, setSaved] = useState([]);
  const [err, setErr] = useState("");
  const [menu, setMenu] = useState(false);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const [player, setPlayer] = useState(null); // reel opened from the grid
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", bio: "", website: "", instagram: "", social_link: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!uid) return;
    try {
      const d = await api(isMe ? EP.myProfile : EP.profile(uid));
      setP(d); setErr("");
      if (!isMe) {
        try { const f = await api(EP.followStatus(uid)); setFollowing(!!f.is_following); } catch {}
      }
    } catch (e) { setErr(e.message); }
    setLoading(false);
  }, [uid, isMe]);

  const loadTab = useCallback(async () => {
    if (!uid) return;
    try {
      if (tab === "reels") {
        const d = await api(isMe ? EP.reelsMine : EP.reelsOfUser(uid));
        setReels(d.reels || []);
      } else if (tab === "saved" && isMe) {
        const d = await api(EP.reelsSaved);
        setSaved(d.reels || []);
      }
    } catch { if (tab === "reels") setReels([]); else setSaved([]); }
  }, [uid, tab, isMe]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useFocusEffect(useCallback(() => { loadTab(); }, [loadTab]));

  // opened from Home -> "Create -> Profile photo"
  useEffect(() => { if (isMe && route.params?.edit) openEdit(); }, [route.params?.edit]); // eslint-disable-line

  const u = p?.user;
  const stats = p?.stats || {};
  const posts = (p?.content || []).filter((x) => x.media_url);

  const openEdit = () => {
    const x = p?.user || me || {};
    setForm({ name: x.name || "", bio: x.bio || "", website: x.website || "", instagram: x.instagram || "", social_link: x.social_link || "" });
    setEditing(true);
  };

  const saveProfile = async () => {
    if (!form.name.trim()) return Alert.alert("Name required", "Please enter your name.");
    setSaving(true);
    try {
      const d = await api(EP.myProfile, { method: "PUT", body: { ...form, name: form.name.trim() } });
      patchUser({ name: d.user.name });
      setEditing(false);
      load();
    } catch (e) { Alert.alert("Could not save", e.message); }
    setSaving(false);
  };

  const changePhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert("Permission needed", "Allow photo library access.");
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.85,
    });
    if (r.canceled) return;
    const a = r.assets[0];
    const ext = (a.uri.split(".").pop() || "jpg").toLowerCase().split("?")[0];
    const fd = new FormData();
    if (Platform.OS === "web") {
  const blob = a.file || await (await fetch(a.uri)).blob();
  fd.append("photo", new File([blob], a.fileName || `photo.${ext}`, { type: a.mimeType || (ext === "png" ? "image/png" : "image/jpeg") }));
} else {
  fd.append("photo", { uri: a.uri, name: a.fileName || `photo.${ext}`, type: a.mimeType || (ext === "png" ? "image/png" : "image/jpeg") });
}
    try {
      const d = await api(EP.myPhoto, { method: "POST", form: fd });
      patchUser({ profile_photo: d.profile_photo });
      load();
    } catch (e) { Alert.alert("Upload failed", e.message); }
  };

  const toggleFollow = async () => {
    const next = !following;
    setFollowing(next);
    try { await api(next ? EP.follow : EP.unfollow, { method: "POST", body: { user_id: uid } }); load(); }
    catch (e) { setFollowing(!next); Alert.alert("Failed", e.message); }
  };

  const tabs = isMe ? ["reels", "saved", "posts"] : ["reels", "posts"];
  const label = { reels: "Reels", saved: "Saved", posts: "Posts" };
  const grid = tab === "reels" ? reels : tab === "saved" ? saved : posts;

  const sharePro = () => Share.share({ message: `Connect with ${u?.username || "me"} on UtaNexa (${u?.user_id})` });

  const renderAvatar = ({ size = 104, editable } = {}) => (
    <Pressable onPress={editable ? changePhoto : undefined} className="items-center justify-center active:opacity-90">
      <View className="rounded-full p-[3px] bg-brand" style={{ width: size, height: size }}>
        {u?.profile_photo
          ? <Image source={{ uri: absUrl(u.profile_photo) }} className="w-full h-full rounded-full bg-[#0d1729] border-[3px] border-[#050b18]" />
          : <View className="w-full h-full rounded-full bg-[#0d1729] border-[3px] border-[#050b18] items-center justify-center">
              <Text className="text-white text-4xl font-extrabold">{(u?.name || "U").charAt(0).toUpperCase()}</Text>
            </View>}
      </View>
      {editable && (
        <View className="absolute right-0 bottom-1 w-8 h-8 rounded-full bg-brand items-center justify-center border-[3px] border-[#050b18]">
          <Ionicons name="camera" size={14} color="#fff" />
        </View>
      )}
    </Pressable>
  );

  return (
    <SafeAreaView className="flex-1 bg-[#050b18]" edges={["top"]}>
      {/* top bar */}
      <View className="h-16 flex-row items-center justify-between px-4">
        {isMe ? (
          <View className="w-10" />
        ) : (
          <Pressable onPress={() => navigation.goBack()}
            className="w-10 h-10 rounded-full bg-white/6 border border-white/10 items-center justify-center active:opacity-70">
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </Pressable>
        )}
        <Text className="flex-1 text-center text-white text-[17px] font-extrabold tracking-tight" numberOfLines={1}>
          {u ? (u.username ? `@${u.username}` : u.name) : "Profile"}
        </Text>
        <Pressable onPress={() => setMenu(true)}
          className="w-10 h-10 rounded-full bg-white/6 border border-white/10 items-center justify-center active:opacity-70">
          <Ionicons name="ellipsis-horizontal" size={18} color="#fff" />
        </Pressable>
      </View>

      {loading ? <ActivityIndicator color="#1685ff" className="mt-10" /> : err ? (
        <View className="m-6 p-8 rounded-[28px] border border-white/10 bg-[#0a1424] items-center">
          <View className="w-16 h-16 rounded-full bg-danger/10 items-center justify-center mb-4">
            <Ionicons name="lock-closed-outline" size={28} color="#ff6b6b" />
          </View>
          <Text className="text-white text-lg font-extrabold mb-2">Unable to open profile</Text>
          <Text className="text-[#71809a] text-[13px] mb-5 text-center leading-5">{err}</Text>
          <Pressable onPress={() => (isMe ? load() : navigation.goBack())} className="h-11 px-6 rounded-full bg-[#1685ff] items-center justify-center active:opacity-80">
            <Text className="text-white font-bold text-[14px]">{isMe ? "Retry" : "Go back"}</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerClassName="pb-24" showsVerticalScrollIndicator={false}>
          {/* hero */}
          <View className="items-center px-5 pt-2 pb-6 overflow-hidden">
            <View pointerEvents="none" className="absolute -top-24 -left-16 w-64 h-64 rounded-full bg-[#1685ff]/15" />
            <View pointerEvents="none" className="absolute -top-16 -right-20 w-56 h-56 rounded-full bg-[#7a5cff]/12" />

            {renderAvatar({ editable: isMe })}

            <Text className="text-white text-[24px] font-extrabold tracking-tight mt-4" numberOfLines={1}>{u?.name}</Text>
            <View className="flex-row items-center mt-1.5 px-3 py-1 rounded-full bg-white/6 border border-white/10">
              <Text className="text-[#9aa7bb] text-[12px]" numberOfLines={1}>@{u?.username}</Text>
              {u?.user_id ? <Text className="text-[#5d6a80] text-[12px] ml-2" numberOfLines={1}>ID {u.user_id}</Text> : null}
            </View>

            <Text className="text-[#b4c0d3] text-[14px] leading-[21px] text-center mt-4 px-2">{u?.bio || "No bio available."}</Text>

            {(u?.website || u?.instagram || u?.social_link) ? (
              <View className="flex-row flex-wrap justify-center gap-2 mt-4">
                {u?.website ? <LinkChip icon="globe-outline" text={u.website} /> : null}
                {u?.instagram ? <LinkChip icon="logo-instagram" text={u.instagram} /> : null}
                {u?.social_link ? <LinkChip icon="link-outline" text={u.social_link} /> : null}
              </View>
            ) : null}

            {/* actions */}
            {isMe ? (
              <View className="flex-row gap-2.5 mt-5 w-full">
                <Pressable onPress={openEdit} className="flex-1 h-11 rounded-full bg-[#1685ff] flex-row items-center justify-center active:opacity-80">
                  <Ionicons name="create-outline" size={17} color="#fff" />
                  <Text className="text-white text-[14px] font-bold ml-2">Edit profile</Text>
                </Pressable>
                <Pressable onPress={sharePro} className="flex-1 h-11 rounded-full bg-white/6 border border-white/12 flex-row items-center justify-center active:opacity-70">
                  <Ionicons name="share-outline" size={17} color="#fff" />
                  <Text className="text-white text-[14px] font-bold ml-2">Share</Text>
                </Pressable>
              </View>
            ) : (
              <View className="flex-row gap-2.5 mt-5 w-full">
                <Pressable onPress={toggleFollow}
                  className={`flex-1 h-11 rounded-full flex-row items-center justify-center active:opacity-80 ${following ? "bg-white/8 border border-white/15" : "bg-[#1685ff]"}`}>
                  <Ionicons name={following ? "checkmark" : "person-add-outline"} size={17} color="#fff" />
                  <Text className="text-white text-[14px] font-bold ml-2">{following ? "Following" : "Follow"}</Text>
                </Pressable>
                <Pressable onPress={() => navigation.navigate("Chat", { user: u })}
                  className="flex-1 h-11 rounded-full bg-white/6 border border-white/12 flex-row items-center justify-center active:opacity-70">
                  <Ionicons name="chatbubble-ellipses-outline" size={17} color="#fff" />
                  <Text className="text-white text-[14px] font-bold ml-2">Message</Text>
                </Pressable>
              </View>
            )}
          </View>

          {/* stats */}
          <View className="flex-row mx-4 py-4 rounded-3xl bg-[#0a1424] border border-white/10">
            <Stat n={stats.followers} l="Followers" />
            <Stat n={stats.connected} l="Connected" />
            <Stat n={stats.following} l="Following" />
            <Stat n={stats.posts} l="Posts" last />
          </View>

          {/* tabs + grid */}
          <View className="mx-4 mt-4">
            <View className="flex-row p-1 rounded-full bg-[#0a1424] border border-white/10">
              {tabs.map((t) => {
                const on = tab === t;
                return (
                  <Pressable key={t} onPress={() => setTab(t)}
                    className={`flex-1 h-10 rounded-full flex-row items-center justify-center ${on ? "bg-[#1685ff]" : ""}`}>
                    <Ionicons name={TAB_ICONS[t]} size={16} color={on ? "#fff" : "#64748a"} />
                    <Text className={`ml-1.5 text-[13px] font-bold ${on ? "text-white" : "text-[#64748a]"}`}>{label[t]}</Text>
                  </Pressable>
                );
              })}
            </View>

            {grid.length === 0 ? (
              <View className="items-center pt-12 pb-6">
                <View className="w-16 h-16 rounded-full bg-white/5 border border-white/10 items-center justify-center mb-3">
                  <Ionicons name={TAB_ICONS[tab]} size={26} color="#64748a" />
                </View>
                <Empty text={`No ${label[tab].toLowerCase()} yet.`} />
              </View>
            ) : (
              <View className="flex-row flex-wrap -mx-1 mt-3">
                {grid.map((it) => {
                  const isReel = tab !== "posts";
                  const img = isReel ? it.thumbnail_url : (it.media_type || "").startsWith("image") && it.media_url;
                  return (
                    <Pressable key={`${tab}-${it.id}`} style={{ width: "33.33%" }} className="aspect-square p-1 active:opacity-80"
                      onPress={() => isReel && setPlayer(it)}>
                      <View className="flex-1 bg-[#0d1729] border border-white/6 rounded-2xl items-center justify-center overflow-hidden">
                        {img
                          ? <Image source={{ uri: absUrl(isReel ? it.thumbnail_url : it.media_url) }} className="w-full h-full" />
                          : <Text className="text-[#dce5f2] text-xs text-center p-2" numberOfLines={5}>{it.caption || it.content || ""}</Text>}
                        {isReel && (
                          <View className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/50 items-center justify-center">
                            <Ionicons name="play" size={11} color="#fff" />
                          </View>
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>
      )}

      {/* "…" menu */}
      <Modal visible={menu} transparent animationType="fade" onRequestClose={() => setMenu(false)}>
        <Pressable className="flex-1" onPress={() => setMenu(false)}>
          <View style={{ top: insets.top + 60 }} className="absolute right-4 w-[190px] p-1.5 rounded-3xl bg-[#0b1424] border border-white/12">
            {isMe && <MenuItem icon="create-outline" label="Edit profile" onPress={() => { setMenu(false); openEdit(); }} />}
            <MenuItem icon="share-outline" label="Share" onPress={() => { setMenu(false); sharePro(); }} />
            {isMe && (
              <>
                <View className="h-px bg-white/8 mx-2 my-1" />
                <MenuItem icon="log-out-outline" label="Logout" danger onPress={() => { setMenu(false); signOut(); }} />
              </>
            )}
          </View>
        </Pressable>
      </Modal>

      {/* edit profile */}
      <Modal visible={editing} animationType="slide" onRequestClose={() => setEditing(false)}>
        <SafeAreaView className="flex-1 bg-[#050b18]">
          <View className="h-16 flex-row items-center justify-between px-4 border-b border-white/8">
            <Pressable onPress={() => setEditing(false)} className="h-10 px-1 justify-center active:opacity-60">
              <Text className="text-[#9aa7bb] text-[15px] font-medium">Cancel</Text>
            </Pressable>
            <Text className="text-white text-[17px] font-extrabold tracking-tight">Edit profile</Text>
            <Pressable onPress={saveProfile} disabled={saving}
              className="h-10 px-5 rounded-full bg-[#1685ff] items-center justify-center min-w-[72px] active:opacity-80">
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text className="text-white text-[14px] font-bold">Save</Text>}
            </Pressable>
          </View>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
            <ScrollView contentContainerClassName="px-4 pt-6 pb-16" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View className="items-center mb-6">
                {renderAvatar({ size: 96, editable: true })}
                <Pressable onPress={changePhoto} className="mt-3 h-9 px-4 rounded-full bg-white/6 border border-white/10 flex-row items-center justify-center active:opacity-70">
                  <Ionicons name="image-outline" size={15} color="#6aa8ff" />
                  <Text className="text-brandLight text-[13px] font-semibold ml-1.5">Change profile photo</Text>
                </Pressable>
              </View>

              {FIELDS.map(([k, l, max, ic]) => (
                <View key={k} className="mb-4">
                  <View className="flex-row items-baseline justify-between mb-2 px-1">
                    <Text className="text-white text-[14px] font-bold">{l}</Text>
                    {k === "bio" ? <Text className="text-[#64748a] text-[11px]">{form.bio.length}/{max}</Text> : null}
                  </View>
                  <View className={`flex-row rounded-2xl border border-white/10 bg-[#0a1424] px-4 ${k === "bio" ? "items-start" : "items-center"}`}>
                    <View className={k === "bio" ? "pt-3.5" : ""}><Ionicons name={ic} size={18} color="#64748a" /></View>
                    <TextInput value={form[k]} onChangeText={(v) => setForm({ ...form, [k]: v })} maxLength={max}
                      multiline={k === "bio"} autoCapitalize={k === "name" || k === "bio" ? "sentences" : "none"}
                      placeholderTextColor="#64748a" placeholder={l}
                      className={`flex-1 ml-3 text-white text-[14px] ${k === "bio" ? "min-h-[104px] pt-3 pb-3" : "h-12"}`}
                      style={k === "bio" ? { textAlignVertical: "top" } : undefined} />
                  </View>
                </View>
              ))}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* reel player */}
      <Modal visible={!!player} animationType="fade" onRequestClose={() => setPlayer(null)}>
        <View className="flex-1 bg-black">
          {player && (
            <Video source={{ uri: absUrl(player.video_url) }} style={{ flex: 1 }} resizeMode={ResizeMode.CONTAIN}
              shouldPlay isLooping useNativeControls />
          )}
          {player?.caption ? (
            <View pointerEvents="none" className="absolute left-4 right-4 bottom-12 px-4 py-3 rounded-2xl bg-black/55 border border-white/10">
              <Text className="text-white text-[14px] leading-5" numberOfLines={4}>{player.caption}</Text>
            </View>
          ) : null}
          <Pressable onPress={() => setPlayer(null)}
            style={{ top: insets.top + 8 }}
            className="absolute right-4 w-10 h-10 rounded-full bg-black/55 border border-white/20 items-center justify-center active:opacity-70">
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>
        </View>
      </Modal>
    </SafeAreaView>
  );
}