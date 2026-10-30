import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, Pressable, FlatList, TextInput, KeyboardAvoidingView, Platform,
  Image, Alert, Linking, Modal, Share, Switch, Keyboard,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Video, ResizeMode, Audio } from "expo-av";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { api, absUrl, openSocket } from "../api/client";
import { EP } from "../api/endpoints";
import { useAuth } from "../context/AuthContext";
import { Avatar } from "../components/ui";

/* ───────────────────────── helpers ───────────────────────── */

// Backend stores naive UTC timestamps (no "Z"), so add it before parsing.
export const parseTime = (iso) => {
  if (!iso) return null;
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + "Z");
  return isNaN(d) ? null : d;
};
const time12 = (d) => {
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ap = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return `${String(h).padStart(2, "0")}:${m} ${ap}`;
};
const hhmm = (iso) => {
  const d = parseTime(iso);
  return d ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : "";
};
const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const chatDateLabel = (iso) => {
  const d = parseTime(iso);
  if (!d) return "Earlier";
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
};
const seen = (iso) => {
  const d = parseTime(iso);
  return d ? `Last seen ${d.toLocaleDateString([], { day: "numeric", month: "short" })}, ${time12(d)}` : "";
};
const mmss = (ms) => {
  const s = Math.floor((ms || 0) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const URL_RE = /(https?:\/\/[^\s]+)/gi;

const EMOJIS = ("😀 😃 😄 😁 😆 😅 😂 🤣 🙂 😉 😊 😇 🥰 😍 🤩 😘 😋 😛 😜 🤪 🤗 🤔 🤐 😐 😴 😎 🥳 😢 😭 😡 🥺 😱 " +
  "👍 👎 👏 🙌 🙏 💪 👋 🤝 ✌️ 🤞 👌 🔥 ✨ 🎉 💯 ❤️ 🧡 💛 💚 💙 💜 🖤 💔 💕 💖 🌹 ☕ 🍕 🎂 🎁 ✅ ❌").split(" ");

// REST:  GET /api/chat/{user_id}  ·  POST /api/chat/send (multipart)  ·  POST /api/chat/message/{id}/delete
// WS:    /api/chat/ws/{user_id}   (typing + online presence only; messages arrive by polling)

/* ───────────────────────── small UI pieces ───────────────────────── */

const HeaderBtn = ({ icon, onPress, active }) => (
  <Pressable
    onPress={onPress}
    hitSlop={6}
    className={`w-10 h-10 rounded-xl items-center justify-center active:opacity-70 ${active ? "bg-white/10" : ""}`}
  >
    <Ionicons name={icon} size={22} color="#e8eefc" />
  </Pressable>
);

const MenuRow = ({ icon, title, sub, onPress, right }) => (
  <Pressable onPress={onPress} className="flex-row items-center px-5 py-3.5 active:bg-white/5">
    <Ionicons name={icon} size={19} color="#c4d2ea" />
    <View className="ml-4 flex-1">
      <Text className="text-[#f4f6fb] text-[15px] font-semibold">{title}</Text>
      {sub ? <Text className="text-[#8493ab] text-[11px] mt-0.5">{sub}</Text> : null}
    </View>
    {right}
  </Pressable>
);

const SheetRow = ({ title, sub, onPress }) => (
  <Pressable onPress={onPress} className="flex-row items-center px-4 py-4 mb-2.5 rounded-2xl bg-[#18233a] active:opacity-80">
    <View className="flex-1">
      <Text className="text-white text-[15px] font-medium">{title}</Text>
      <Text className="text-[#8493ab] text-[12px] mt-0.5">{sub}</Text>
    </View>
    <Ionicons name="chevron-forward" size={16} color="#c4d2ea" />
  </Pressable>
);

const Sheet = ({ visible, onClose, title, children }) => (
  <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <Pressable className="flex-1 bg-black/60" onPress={onClose} />
    <View className="bg-[#0f1829] rounded-t-[28px] px-4 pt-2.5 pb-8 border-t border-white/5" style={{ maxHeight: "80%" }}>
      <View className="self-center w-9 h-1 rounded-full bg-white/20 mb-4" />
      <View className="flex-row items-center justify-between px-1 mb-4">
        <Text className="text-white text-[17px] font-bold">{title}</Text>
        <Pressable onPress={onClose} hitSlop={10}>
          <Ionicons name="close" size={22} color="#e8eefc" />
        </Pressable>
      </View>
      {children}
    </View>
  </Modal>
);

/* ───────────────────────── screen ───────────────────────── */

export default function ChatScreen({ navigation, route }) {
  const [peer, setPeer] = useState(route.params?.user || {});
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [online, setOnline] = useState(false);
  const [lastSeen, setLastSeen] = useState(null);
  const [typing, setTyping] = useState(false);
  const [sending, setSending] = useState(false);

  // ui state
  const [attachOpen, setAttachOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [mediaTab, setMediaTab] = useState("media");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [muted, setMuted] = useState(false);
  const [shareTyping, setShareTyping] = useState(true);

  // voice note
  const [recording, setRecording] = useState(false);
  const [recMs, setRecMs] = useState(0);
  const recRef = useRef(null);

  const listRef = useRef(null);
  const wsRef = useRef(null);
  const typingTimer = useRef(null);
  const lastTypingSent = useRef(0);
  const shareTypingRef = useRef(true);
  shareTypingRef.current = shareTyping;

  const closeAll = () => { setAttachOpen(false); setMenuOpen(false); setMoreOpen(false); };

  /* ── load / poll ── */
  const load = useCallback(async () => {
    try {
      const d = await api(EP.chatHistory(peer.user_id));
      if (d.user) setPeer((p) => ({ ...p, ...d.user }));
      setMessages((prev) => [...(d.messages || []), ...prev.filter((m) => m.pending)]);
      setError("");
    } catch (e) { setError(e.message || "Unable to load messages."); }
  }, [peer.user_id]);

  useEffect(() => { load(); const t = setInterval(load, 3500); return () => clearInterval(t); }, [load]);
  useEffect(() => {
    if (searchOpen && query) return;
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  }, [messages.length, searchOpen, query]);

  /* ── typing / presence socket ── */
  useEffect(() => {
    let closed = false, retry, hide;
    const connect = () => {
      let ws;
      try { ws = openSocket(EP.chatWs(peer.user_id)); } catch { return; }
      wsRef.current = ws;
      ws.onmessage = (e) => {
        try {
          const m = JSON.parse(e.data);
          if (m.type === "presence") { setOnline(!!m.online); setLastSeen(m.last_seen || null); if (!m.online) setTyping(false); }
          else if (m.type === "typing") {
            setTyping(!!m.typing);
            clearTimeout(hide);
            if (m.typing) hide = setTimeout(() => setTyping(false), 6000);
          }
        } catch {}
      };
      ws.onerror = () => {};
      ws.onclose = (e) => { if (!closed && ![4401, 4403, 4404].includes(e.code)) retry = setTimeout(connect, 4000); };
    };
    connect();
    return () => { closed = true; clearTimeout(retry); clearTimeout(hide); try { wsRef.current?.close(); } catch {} };
  }, [peer.user_id]);

  // stop any recording if the screen unmounts
  useEffect(() => () => { recRef.current?.stopAndUnloadAsync?.().catch(() => {}); }, []);

  const sendTyping = (on) => {
    if (!shareTypingRef.current) return;
    const ws = wsRef.current;
    if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: "typing", typing: on }));
  };
  const onChange = (v) => {
    setText(v);
    const now = Date.now();
    if (v && now - lastTypingSent.current > 2500) { lastTypingSent.current = now; sendTyping(true); }
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => { lastTypingSent.current = 0; sendTyping(false); }, 2000);
  };

  /* ── send / delete ── */
  const send = async (file) => {
    const body = file ? text.trim() : text.trim();
    if ((!body && !file) || sending) return;
    const tmp = { id: `tmp${Date.now()}`, sender_id: user.id, content: body, pending: true, created_at: new Date().toISOString() };
    setMessages((m) => [...m, tmp]); setText(""); sendTyping(false); setSending(true); setEmojiOpen(false);
    try {
      const fd = new FormData();
      fd.append("receiver_id", peer.user_id);
      fd.append("content", body);
      if (file) fd.append("file", file);
      const d = await api(EP.chatSend, { method: "POST", form: fd });
      setMessages((m) => m.map((x) => (x.id === tmp.id ? d.message : x)));
    } catch (e) {
      Alert.alert("Not sent", e.message);
      setMessages((m) => m.filter((x) => x.id !== tmp.id));
      if (body) setText(body);
    }
    setSending(false);
  };

  const del = (m) => {
    if (m.sender_id !== user.id || m.pending) return;
    Alert.alert("Delete message", "Delete this message for everyone?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
          try { await api(EP.chatDelete(m.id), { method: "POST" }); setMessages((l) => l.filter((x) => x.id !== m.id)); }
          catch (e) { Alert.alert("Could not delete", e.message); }
        } },
    ]);
  };

  /* ── attachments ── */
  const pickMedia = async () => {
    setAttachOpen(false);
    const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!p.granted) return Alert.alert("Permission needed", "Allow photo library access.");
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.All, quality: 0.85 });
    if (r.canceled) return;
    const a = r.assets[0];
    const vid = a.type === "video";
    send({ uri: a.uri, name: a.fileName || (vid ? "video.mp4" : "photo.jpg"), type: a.mimeType || (vid ? "video/mp4" : "image/jpeg") });
  };
  const pickDocument = async () => {
    setAttachOpen(false);
    const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (r.canceled) return;
    const a = r.assets[0];
    send({ uri: a.uri, name: a.name || "file", type: a.mimeType || "application/octet-stream" });
  };
  const pickAudio = async () => {
    setAttachOpen(false);
    const r = await DocumentPicker.getDocumentAsync({ type: "audio/*", copyToCacheDirectory: true });
    if (r.canceled) return;
    const a = r.assets[0];
    send({ uri: a.uri, name: a.name || "audio.m4a", type: a.mimeType || "audio/mpeg" });
  };
  const openCamera = async () => {
    closeAll();
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted) return Alert.alert("Permission needed", "Allow camera access.");
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.All, quality: 0.85 });
    if (r.canceled) return;
    const a = r.assets[0];
    const vid = a.type === "video";
    send({ uri: a.uri, name: a.fileName || (vid ? "video.mp4" : "photo.jpg"), type: a.mimeType || (vid ? "video/mp4" : "image/jpeg") });
  };

  /* ── voice note ── */
  const startRec = async () => {
    closeAll(); setEmojiOpen(false);
    try {
      const p = await Audio.requestPermissionsAsync();
      if (!p.granted) return Alert.alert("Permission needed", "Allow microphone access.");
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
        (s) => setRecMs(s.durationMillis || 0),
        250
      );
      recRef.current = rec; setRecMs(0); setRecording(true);
    } catch (e) { Alert.alert("Could not record", e.message); }
  };
  const stopRec = async (shouldSend) => {
    const rec = recRef.current;
    recRef.current = null; setRecording(false);
    if (!rec) return;
    try {
      await rec.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = rec.getURI();
      if (shouldSend && uri && recMs > 600) send({ uri, name: `voice-${Date.now()}.m4a`, type: "audio/m4a" });
    } catch {}
  };

  /* ── calls (Jitsi room shared by both users) ── */
  const callUrl = (voiceOnly) => {
    const room = `UtaNexa-${[user.id, peer.user_id].map(String).sort().join("-")}`;
    const cfg = voiceOnly ? "#config.startWithVideoMuted=true" : "";
    return `https://meet.jit.si/${room}${cfg}`;
  };
  const startCall = (voiceOnly) => {
    setCallOpen(false);
    Linking.openURL(callUrl(voiceOnly)).catch(() => Alert.alert("Could not open call", "No app available to open the call link."));
  };
  const shareCall = async () => {
    setCallOpen(false);
    try { await Share.share({ message: `Join my call on UtaNexa: ${callUrl(false)}` }); } catch {}
  };

  /* ── derived data ── */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? messages.filter((m) => (m.content || "").toLowerCase().includes(q)) : messages;
  }, [messages, query]);

  const displayMessages = useMemo(() => {
    const out = [];
    let prev = "";
    filtered.forEach((m) => {
      const d = parseTime(m.created_at);
      const key = d ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` : "unknown";
      if (key !== prev) { out.push({ _dateSeparator: true, id: `date-${key}`, label: chatDateLabel(m.created_at) }); prev = key; }
      out.push(m);
    });
    return out;
  }, [filtered]);

  const mediaItems = useMemo(() => messages.filter((m) => m.media_url && (m.media_type === "image" || m.media_type === "video")), [messages]);
  const docItems = useMemo(() => messages.filter((m) => m.media_url && m.media_type !== "image" && m.media_type !== "video"), [messages]);
  const linkItems = useMemo(
    () => messages.flatMap((m) => ((m.content || "").match(URL_RE) || []).map((u, i) => ({ id: `${m.id}-${i}`, url: u, at: m.created_at }))),
    [messages]
  );

  const status = error ? "Offline" : typing ? "typing…" : online ? "Online" : seen(lastSeen) || "Private chat";
  const live = !error && (typing || online);
  const canSend = text.trim().length > 0 && !sending;
  const name = peer.name || peer.username || "Chat";

  /* ───────────────────────── render ───────────────────────── */
  return (
    <SafeAreaView className="flex-1 bg-[#080c16]">
      {/* header */}
      {searchOpen ? (
        <View className="h-16 flex-row items-center px-3 border-b border-white/5 bg-[#0c1322]">
          <HeaderBtn icon="chevron-back" onPress={() => { setSearchOpen(false); setQuery(""); }} />
          <TextInput
            autoFocus value={query} onChangeText={setQuery} placeholder={`Search in chat with ${name}`}
            placeholderTextColor="#71809a" className="flex-1 mx-2 h-10 px-4 rounded-full bg-[#151e2f] text-white text-[14px]"
          />
          {query ? <HeaderBtn icon="close-circle" onPress={() => setQuery("")} /> : null}
        </View>
      ) : (
        <View className="h-16 flex-row items-center px-2 border-b border-white/5 bg-[#0c1322]">
          <HeaderBtn icon="chevron-back" onPress={() => navigation.goBack()} />
          <Pressable
            onPress={() => navigation.navigate("UserProfile", { userId: peer.user_id })}
            className="flex-row items-center flex-1 ml-1 active:opacity-80"
          >
            <View>
              <Avatar uri={peer.profile_photo} name={name} size={42} />
              <View
                className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#0c1322] ${
                  online && !error ? "bg-[#43d9a3]" : "bg-[#5d6a80]"
                }`}
              />
            </View>
            <View className="ml-3 flex-1">
              <Text className="text-white text-[16px] font-bold" numberOfLines={1}>{name}</Text>
              <Text className={`text-[12px] mt-0.5 ${live ? "text-[#43d9a3] font-medium" : "text-[#8493ab]"}`} numberOfLines={1}>
                {status}
              </Text>
            </View>
          </Pressable>
          <HeaderBtn icon="heart-circle-outline" onPress={() => navigation.navigate("CoupleChat", { user: peer })} />
          <HeaderBtn icon="call-outline" onPress={() => { closeAll(); setCallOpen(true); }} />
          <HeaderBtn
            icon="ellipsis-horizontal" active={menuOpen}
            onPress={() => { setAttachOpen(false); setMoreOpen(false); setMenuOpen((v) => !v); }}
          />
        </View>
      )}

      {error ? (
        <View className="flex-row items-center px-4 py-2.5 bg-danger/10 border-b border-danger/20">
          <Ionicons name="cloud-offline-outline" size={16} color="#ff6b6b" />
          <Text className="text-danger text-xs flex-1 mx-2.5" numberOfLines={2}>{error}</Text>
          <Pressable onPress={load} className="px-3 py-1 rounded-full bg-white/10 active:opacity-70">
            <Text className="text-white text-xs font-bold">Retry</Text>
          </Pressable>
        </View>
      ) : null}

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <FlatList
          ref={listRef}
          data={displayMessages}
          keyExtractor={(m, i) => String(m.id ?? i)}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={() => { closeAll(); Keyboard.dismiss(); }}
          contentContainerClassName="px-3.5 pb-3 gap-1.5"
          ListHeaderComponent={
            <View className="items-center pt-8 pb-5">
              <View className="p-1 rounded-full border border-white/10 bg-white/4">
                <Avatar uri={peer.profile_photo} name={name} size={72} />
              </View>
              <Text className="text-white text-[18px] font-extrabold mt-3">{name}</Text>
              {peer.username ? <Text className="text-[#8493ab] text-[12px] mt-0.5">@{peer.username}</Text> : null}
              <View className="flex-row items-center mt-4 px-3.5 py-1.5 rounded-full bg-[#151e2f] border border-white/5">
                <Ionicons name="lock-closed" size={11} color="#8bb8ff" />
                <Text className="text-[#9fb0c9] text-[11px] ml-1.5">Your private conversation starts here</Text>
              </View>
            </View>
          }
          ListEmptyComponent={
            query ? <Text className="text-[#8493ab] text-center mt-10 text-[13px]">No messages match “{query}”</Text> : null
          }
          renderItem={({ item: m }) => {
            if (m._dateSeparator) {
              return (
                <View className="items-center py-3">
                  <Text className="text-[#9fb0c9] text-[11px] font-medium bg-[#121b2d] border border-white/5 px-4 py-1 rounded-full overflow-hidden">
                    {m.label}
                  </Text>
                </View>
              );
            }
            const mine = m.sender_id === user.id;
            const url = absUrl(m.media_url);
            const hasMedia = m.media_url && (m.media_type === "image" || m.media_type === "video");
            return (
              <Pressable
                onLongPress={() => del(m)}
                className={`max-w-[80%] rounded-[18px] overflow-hidden ${hasMedia && !m.content ? "p-1" : "px-3.5 pt-2.5 pb-2"} ${
                  mine ? "self-end bg-[#16355f] border border-[#2a5a9a]/40 rounded-br-md" : "self-start bg-[#121b2d] border border-white/6 rounded-bl-md"
                } ${m.pending ? "opacity-60" : ""}`}
              >
                {m.media_url && m.media_type === "image" ? (
                  <Pressable onPress={() => Linking.openURL(url)}>
                    <Image source={{ uri: url }} className="w-[230px] h-[230px] rounded-2xl mb-1" resizeMode="cover" />
                  </Pressable>
                ) : null}
                {m.media_url && m.media_type === "video" ? (
                  <Video source={{ uri: url }} useNativeControls resizeMode={ResizeMode.CONTAIN}
                    style={{ width: 230, height: 230, borderRadius: 16, marginBottom: 4, backgroundColor: "#000" }} />
                ) : null}
                {m.media_url && m.media_type !== "image" && m.media_type !== "video" ? (
                  <Pressable onPress={() => Linking.openURL(url)}
                    className="flex-row items-center mb-1.5 pr-3 py-2 pl-2 rounded-xl bg-black/20 active:opacity-70">
                    <View className="w-9 h-9 rounded-lg bg-white/10 items-center justify-center">
                      <Ionicons name={m.media_type === "audio" ? "musical-notes" : "document-text"} size={18} color="#bcd4ff" />
                    </View>
                    <Text className="text-[#dbe8ff] text-[13px] font-semibold ml-2.5">{m.media_type === "audio" ? "Play audio" : "Open file"}</Text>
                  </Pressable>
                ) : null}
                {m.content ? <Text className="text-[#f4f6fb] text-[15px] leading-[21px]">{m.content}</Text> : null}
                <View className={`flex-row justify-end items-center mt-0.5 gap-1 ${hasMedia && !m.content ? "pr-2 pb-1" : ""}`}>
                  <Text className={`text-[10px] ${mine ? "text-white/60" : "text-[#8493ab]"}`}>{hhmm(m.created_at)}</Text>
                  {mine && m.pending ? <Ionicons name="time-outline" size={12} color="#ffffff99" /> : null}
                  {mine && !m.pending && (
                    <Ionicons name={m.is_read ? "checkmark-done" : "checkmark"} size={14} color={m.is_read ? "#7ff0c8" : "#ffffff99"} />
                  )}
                </View>
              </Pressable>
            );
          }}
        />

        {/* typing indicator */}
        {typing && !error ? (
          <View className="px-4 pb-1.5">
            <View className="self-start flex-row items-center px-3 py-1.5 rounded-full bg-[#121b2d] border border-white/5">
              <View className="flex-row gap-1">
                <View className="w-1.5 h-1.5 rounded-full bg-[#8bb8ff]" />
                <View className="w-1.5 h-1.5 rounded-full bg-[#8bb8ff]/70" />
                <View className="w-1.5 h-1.5 rounded-full bg-[#8bb8ff]/40" />
              </View>
              <Text className="text-[#8493ab] text-[11px] ml-2">typing</Text>
            </View>
          </View>
        ) : null}

        {/* emoji panel */}
        {emojiOpen ? (
          <View className="bg-[#0c1322] border-t border-white/5 px-2 py-2 flex-row flex-wrap" style={{ maxHeight: 200 }}>
            {EMOJIS.map((e) => (
              <Pressable key={e} onPress={() => setText((t) => t + e)} className="w-[12.5%] items-center py-1.5 active:opacity-60">
                <Text style={{ fontSize: 24 }}>{e}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {/* composer */}
        <View className="px-3 pt-2 pb-1 bg-[#080c16]">
          {recording ? (
            <View className="flex-row items-center gap-2">
              <Pressable onPress={() => stopRec(false)} className="w-11 h-11 rounded-full bg-white/8 items-center justify-center active:opacity-70">
                <Ionicons name="trash-outline" size={20} color="#ff8a8a" />
              </Pressable>
              <View className="flex-1 h-12 rounded-[24px] bg-[#121b2d] border border-white/8 flex-row items-center px-4">
                <View className="w-2.5 h-2.5 rounded-full bg-[#ff5f6d] mr-3" />
                <Text className="text-white text-[15px] font-medium">{mmss(recMs)}</Text>
                <Text className="text-[#8493ab] text-[12px] ml-3">Recording…</Text>
              </View>
              <Pressable onPress={() => stopRec(true)} className="w-12 h-12 rounded-2xl bg-[#8bb8ff] items-center justify-center active:opacity-80">
                <Ionicons name="arrow-up" size={22} color="#090d18" />
              </Pressable>
            </View>
          ) : (
            <View className="flex-row items-center gap-2">
              <View className="flex-1 flex-row items-center rounded-[24px] bg-[#121b2d] border border-white/8 pl-2 pr-1 min-h-[48px]">
                <Pressable
                  onPress={() => { closeAll(); Keyboard.dismiss(); setEmojiOpen((v) => !v); }}
                  hitSlop={6} className="w-9 h-9 items-center justify-center active:opacity-70"
                >
                  <Ionicons name={emojiOpen ? "keypad-outline" : "happy-outline"} size={23} color="#c4d2ea" />
                </Pressable>
                <TextInput
                  value={text} onChangeText={onChange} multiline maxLength={10000}
                  onFocus={() => { setEmojiOpen(false); closeAll(); }}
                  placeholder="Message…" placeholderTextColor="#71809a"
                  className="flex-1 max-h-[120px] px-2 py-3 text-white text-[15px]"
                />
                <Pressable onPress={openCamera} hitSlop={6} className="w-9 h-9 items-center justify-center active:opacity-70">
                  <Ionicons name="camera-outline" size={22} color="#c4d2ea" />
                </Pressable>
                <Pressable
                  onPress={() => { setMenuOpen(false); Keyboard.dismiss(); setEmojiOpen(false); setAttachOpen((v) => !v); }}
                  hitSlop={6} className="w-9 h-9 items-center justify-center active:opacity-70"
                >
                  <Ionicons name="attach" size={24} color="#c4d2ea" style={{ transform: [{ rotate: "45deg" }] }} />
                </Pressable>
                <Pressable onPress={startRec} hitSlop={6} className="w-9 h-9 items-center justify-center active:opacity-70">
                  <Ionicons name="mic-outline" size={22} color="#c4d2ea" />
                </Pressable>
              </View>
              <Pressable
                onPress={() => send()} disabled={!canSend}
                className={`w-12 h-12 rounded-2xl items-center justify-center ${canSend ? "bg-[#8bb8ff] active:opacity-80" : "bg-[#1b2a45]"}`}
              >
                <Ionicons name="paper-plane" size={20} color={canSend ? "#090d18" : "#7f93b5"} />
              </Pressable>
            </View>
          )}
          <Text className="text-center text-[10px] text-[#5d6a80] mt-1.5">
            Private chat  ·  <Text className="text-[#8bb8ff]">UtaNexa</Text>
          </Text>
        </View>

        {/* attach popup (anchored above composer) */}
        {attachOpen ? (
          <>
            <Pressable className="absolute inset-0" onPress={() => setAttachOpen(false)} />
            <View
              className="absolute left-3 rounded-2xl bg-[#101a2e] border border-white/8 overflow-hidden"
              style={{ bottom: 78, width: 210, elevation: 12 }}
            >
              <MenuRow icon="images-outline" title="Photos & videos" onPress={pickMedia} />
              <MenuRow icon="document-text-outline" title="Document" onPress={pickDocument} />
              <MenuRow icon="musical-notes-outline" title="Audio file" onPress={pickAudio} />
            </View>
          </>
        ) : null}
      </KeyboardAvoidingView>

      {/* overflow menu */}
      {menuOpen || moreOpen ? (
        <>
          <Pressable className="absolute inset-0" onPress={closeAll} />
          <View
            className="absolute right-3 rounded-2xl bg-[#101a2e] border border-white/8 overflow-hidden"
            style={{ top: 70, width: 270, elevation: 14 }}
          >
            {!moreOpen ? (
              <>
                <MenuRow
                  icon="people-outline" title="Chat" sub="Connected, Friend, Family"
                  onPress={() => { closeAll(); navigation.navigate("UserProfile", { userId: peer.user_id }); }}
                />
                <MenuRow icon="shield-outline" title="Privacy" sub="Online, last seen, typing"
                  onPress={() => { closeAll(); setPrivacyOpen(true); }} />
                <MenuRow
                  icon={muted ? "notifications-off-outline" : "notifications-outline"}
                  title={muted ? "Unmute notifications" : "Mute notifications"}
                  onPress={() => { setMuted((v) => !v); closeAll(); }}
                />
                <MenuRow icon="search-outline" title="Search" onPress={() => { closeAll(); setSearchOpen(true); }} />
                <MenuRow icon="images-outline" title="Media, links & documents"
                  onPress={() => { closeAll(); setMediaTab("media"); setMediaOpen(true); }} />
                <MenuRow icon="ellipsis-horizontal" title="More" onPress={() => setMoreOpen(true)} />
              </>
            ) : (
              <>
                <MenuRow icon="chevron-back" title="Back" onPress={() => setMoreOpen(false)} />
                <MenuRow icon="person-outline" title="View profile"
                  onPress={() => { closeAll(); navigation.navigate("UserProfile", { userId: peer.user_id }); }} />
                <MenuRow icon="share-social-outline" title="Share contact"
                  onPress={async () => { closeAll(); try { await Share.share({ message: `${name}${peer.username ? " (@" + peer.username + ")" : ""} on UtaNexa` }); } catch {} }} />
                <MenuRow icon="refresh-outline" title="Refresh chat" onPress={() => { closeAll(); load(); }} />
                <MenuRow icon="arrow-down-outline" title="Jump to latest"
                  onPress={() => { closeAll(); listRef.current?.scrollToEnd({ animated: true }); }} />
              </>
            )}
          </View>
        </>
      ) : null}

      {/* muted pill */}
      {muted ? (
        <View className="absolute top-[72px] self-center px-3 py-1 rounded-full bg-[#121b2d] border border-white/8 flex-row items-center">
          <Ionicons name="notifications-off" size={11} color="#9fb0c9" />
          <Text className="text-[#9fb0c9] text-[11px] ml-1.5">Muted</Text>
        </View>
      ) : null}

      {/* call sheet */}
      <Sheet visible={callOpen} onClose={() => setCallOpen(false)} title="Connect with this person">
        <SheetRow title="Voice call" sub="Opens a private audio room" onPress={() => startCall(true)} />
        <SheetRow title="Video call" sub="Opens a private video room" onPress={() => startCall(false)} />
        <SheetRow title="Share call link" sub="Send a call URL to anyone" onPress={shareCall} />
      </Sheet>

      {/* privacy sheet */}
      <Sheet visible={privacyOpen} onClose={() => setPrivacyOpen(false)} title="Privacy">
        <View className="flex-row items-center px-4 py-3.5 mb-2.5 rounded-2xl bg-[#18233a]">
          <View className="flex-1 pr-3">
            <Text className="text-white text-[15px] font-medium">Share typing status</Text>
            <Text className="text-[#8493ab] text-[12px] mt-0.5">Let {name} see when you are typing</Text>
          </View>
          <Switch value={shareTyping} onValueChange={setShareTyping} trackColor={{ true: "#43d9a3", false: "#33415c" }} />
        </View>
        <View className="px-4 py-3.5 rounded-2xl bg-[#18233a]">
          <Text className="text-white text-[15px] font-medium">Online & last seen</Text>
          <Text className="text-[#8493ab] text-[12px] mt-0.5">
            {online ? "Online now" : seen(lastSeen) || "Not available"}
          </Text>
        </View>
      </Sheet>

      {/* media / links / docs */}
      <Sheet visible={mediaOpen} onClose={() => setMediaOpen(false)} title="Media, links & documents">
        <View className="flex-row mb-3 p-1 rounded-xl bg-[#18233a]">
          {[["media", `Media ${mediaItems.length}`], ["links", `Links ${linkItems.length}`], ["docs", `Docs ${docItems.length}`]].map(([k, label]) => (
            <Pressable key={k} onPress={() => setMediaTab(k)}
              className={`flex-1 py-2 rounded-lg items-center ${mediaTab === k ? "bg-[#2a4a80]" : ""}`}>
              <Text className={`text-[13px] font-semibold ${mediaTab === k ? "text-white" : "text-[#8493ab]"}`}>{label}</Text>
            </Pressable>
          ))}
        </View>
        {mediaTab === "media" ? (
          <FlatList
            key="grid" data={mediaItems} numColumns={3} keyExtractor={(m) => String(m.id)}
            ListEmptyComponent={<Text className="text-[#8493ab] text-center py-8">No photos or videos yet</Text>}
            renderItem={({ item }) => (
              <Pressable onPress={() => Linking.openURL(absUrl(item.media_url))} className="w-1/3 aspect-square p-0.5">
                {item.media_type === "image" ? (
                  <Image source={{ uri: absUrl(item.media_url) }} className="flex-1 rounded-lg" resizeMode="cover" />
                ) : (
                  <View className="flex-1 rounded-lg bg-black items-center justify-center">
                    <Ionicons name="play-circle" size={32} color="#fff" />
                  </View>
                )}
              </Pressable>
            )}
          />
        ) : mediaTab === "links" ? (
          <FlatList
            key="links" data={linkItems} keyExtractor={(l) => l.id}
            ListEmptyComponent={<Text className="text-[#8493ab] text-center py-8">No links shared yet</Text>}
            renderItem={({ item }) => (
              <Pressable onPress={() => Linking.openURL(item.url)} className="flex-row items-center px-3 py-3 mb-2 rounded-xl bg-[#18233a]">
                <Ionicons name="link-outline" size={18} color="#8bb8ff" />
                <Text className="text-[#8bb8ff] text-[13px] ml-3 flex-1" numberOfLines={1}>{item.url}</Text>
              </Pressable>
            )}
          />
        ) : (
          <FlatList
            key="docs" data={docItems} keyExtractor={(m) => String(m.id)}
            ListEmptyComponent={<Text className="text-[#8493ab] text-center py-8">No documents or audio yet</Text>}
            renderItem={({ item }) => (
              <Pressable onPress={() => Linking.openURL(absUrl(item.media_url))} className="flex-row items-center px-3 py-3 mb-2 rounded-xl bg-[#18233a]">
                <Ionicons name={item.media_type === "audio" ? "musical-notes" : "document-text"} size={18} color="#bcd4ff" />
                <View className="ml-3 flex-1">
                  <Text className="text-white text-[13px] font-medium" numberOfLines={1}>
                    {item.media_type === "audio" ? "Audio" : "Document"} · {chatDateLabel(item.created_at)}
                  </Text>
                  <Text className="text-[#8493ab] text-[11px] mt-0.5">{hhmm(item.created_at)}</Text>
                </View>
              </Pressable>
            )}
          />
        )}
      </Sheet>
    </SafeAreaView>
  );
}