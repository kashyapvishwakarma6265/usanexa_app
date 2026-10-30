import React, { useCallback, useEffect, useRef, useState } from "react";
import { 
  View, Text, Pressable, FlatList, TextInput, Modal, ScrollView, 
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Keyboard, Linking 
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { Video, ResizeMode, Audio } from "expo-av";
import { api, openSocket, absUrl } from "../api/client";
import { EP } from "../api/endpoints";
import { useAuth } from "../context/AuthContext";
import { Avatar, Empty } from "../components/ui";
import { parseTime } from "./ChatScreen";

const EMOJIS = ("😀 😃 😄 😁 😆 😅 😂 🤣 🙂 😉 😊 😇 🥰 😍 🤩 😘 😋 😛 😜 🤪 🤗 🤔 🤐 😐 😴 😎 🥳 😢 😭 😡 🥺 😱 " +
  "👍 👎 👏 🙌 🙏 💪 👋 🤝 ✌️ 🤞 👌 🔥 ✨ 🎉 💯 ❤️ 🧡 💛 💚 💙 💜 🖤 💔 💕 💖 🌹 ☕ 🍕 🎂 🎁 ✅ ❌").split(" ");

const MOODS = [
  ["romantic", "Romantic", "#e56b9a", "#fff0f6"], ["deep_love", "Deep Love", "#d6336c", "#ffe8ef"],
  ["happy", "Happy", "#f5a623", "#fff8e6"], ["funny", "Funny", "#f08c00", "#fff4e0"],
  ["sad", "Sad", "#5c7cfa", "#eef2ff"], ["emotional", "Emotional", "#9775fa", "#f3eeff"],
  ["angry", "Angry", "#e03131", "#ffecec"], ["frustrated", "Frustrated", "#d9480f", "#fff0e8"],
  ["caring", "Caring", "#3bb273", "#e9f9f0"], ["comfort", "Comfort", "#70b8ad", "#f0faf7"],
  ["flirty", "Flirty", "#f06595", "#fff0f6"], ["passionate", "Passionate", "#c2255c", "#ffe3ec"],
  ["good_night", "Good Night", "#4c6ef5", "#e8ecff"], ["good_morning", "Good Morning", "#fab005", "#fff9db"],
  ["memory", "Memory", "#845ef7", "#f3eeff"], ["celebration", "Celebration", "#e8590c", "#fff3e6"],
  ["birthday", "Birthday", "#f06595", "#fff0f6"], ["future_marriage", "Future", "#ae3ec9", "#f8eaff"],
  ["missing_you", "Missing You", "#4dabf7", "#e7f5ff"], ["apology", "Apology", "#868e96", "#f1f3f5"],
  ["appreciation", "Appreciation", "#20c997", "#e6fcf5"], ["game", "Game", "#7950f2", "#f1ebff"],
  ["photo_memory", "Photo Memory", "#845ef7", "#f3eeff"], ["serious_talk", "Serious Talk", "#495057", "#f1f3f5"],
  ["deep_conversation", "Deep Talk", "#5f3dc4", "#efeaff"], ["calm", "Calm", "#70b8ad", "#f0faf7"],
];

const QUICK = {
  love: { icon: "heart-outline", label: "Love", text: "I love you more than words can say ❤️" },
  memory: { icon: "images-outline", label: "Memory", text: "Remember our first time together? I still smile thinking about it 🥰" },
  question: { icon: "help-circle-outline", label: "Question", text: "If we could go anywhere tomorrow, where would you take me?" },
  game: { icon: "game-controller-outline", label: "Game", text: "Let's play: tell me 3 things you love about us 💞" },
};

const AI_ACTIONS = [
  ["suggest", "Suggest a message", "Reply ideas that fit your mood", "chatbubble-ellipses-outline"],
  ["question", "Give us a question", "Something sweet to talk about", "help-circle-outline"],
  ["game", "Couple game", "A playful way to connect", "game-controller-outline"],
];

const BY_MOOD = {
  romantic: ["You're my favourite person in the whole world 💕", "Every moment with you feels like a love story ❤️"],
  missing_you: ["Missing you so much right now 🥺", "Wish you were here with me 💭"],
  good_night: ["Good night, sleep tight. Sweet dreams of us 🌙", "Sending you a big goodnight hug 🤍"],
  good_morning: ["Good morning, sunshine ☀️ Hope your day is beautiful", "Waking up and thinking of you 🌸"],
  apology: ["I'm really sorry. I care about you and want to make it right 🙏", "You matter to me more than being right"],
  appreciation: ["Thank you for always being there for me 🌷", "I appreciate everything you do, more than you know"],
  sad: ["I'm here for you, always. Want to talk about it? 🤍", "You're not alone. I'm right here"],
  happy: ["You make me so happy 😊", "Best part of my day is talking to you"],
};
const GENERIC = ["Thinking of you right now 💭", "Can't wait to see you ❤️", "You make my day better 🌸"];
const QUESTIONS = [
  "What's your favourite memory of us?", "Where would you want to travel together next?", "What's one thing I do that makes you smile?",
  "What are you most excited about for our future?", "What song reminds you of us?",
];
const GAMES = [
  "Two truths and a lie — you go first 😄", "Tell me 3 things you love about us 💞", "Describe our relationship in 3 emojis",
  "Rate our last date out of 10 and tell me why", "Guess what I'm thinking about right now 😉",
];
const pick3 = (arr) => [...arr].sort(() => Math.random() - 0.5).slice(0, 3);
const rank = { sending: 0, sent: 1, delivered: 2, seen: 3 };

const mmss = (ms) => {
  const s = Math.floor((ms || 0) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export default function CoupleChatScreen({ navigation, route }) {
  const { user } = useAuth();
  const [partner, setPartner] = useState(route.params?.user || null);
  const [connections, setConnections] = useState([]);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [mood, setMood] = useState("calm");
  const [moodModal, setMoodModal] = useState(false);
  const [aiModal, setAiModal] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [conn, setConn] = useState("connecting"); 
  const [online, setOnline] = useState(false);
  const [lastSeen, setLastSeen] = useState(null);
  const [typing, setTyping] = useState(false);
  const [notice, setNotice] = useState("");
  
  // Media & Attachment states
  const [attachOpen, setAttachOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recMs, setRecMs] = useState(0);

  const listRef = useRef(null);
  const wsRef = useRef(null);
  const typingTimer = useRef(null);
  const typingOn = useRef(false);
  const recRef = useRef(null);

  const m = MOODS.find((x) => x[0] === mood) || MOODS[MOODS.length - 1];
  const accent = m[2], bg = m[3];

  useEffect(() => {
    if (partner) return;
    api(EP.connections).then((d) => setConnections(d.connections || d.users || [])).catch(() => {});
  }, [partner]);

  // ── websocket lifecycle ─────────────────────────────────────
  useEffect(() => {
    if (!partner?.user_id) return;
    let closed = false, retry, ping, attempts = 0, hide;
    setMessages([]); setConn("connecting");

    const wsSend = (obj) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === 1) { ws.send(JSON.stringify(obj)); return true; }
      return false;
    };
    const ackRead = (list) => list.filter((x) => x.sender_id !== user.id && x.id).slice(-20)
      .forEach((x) => wsSend({ type: "message_read", message_id: x.id }));

    const connect = () => {
      let ws;
      try { ws = openSocket(EP.coupleWs(partner.user_id)); } catch { setConn("closed"); return; }
      wsRef.current = ws;
      ws.onopen = () => {
        attempts = 0; setConn("open");
        clearInterval(ping);
        ping = setInterval(() => wsSend({ type: "ping" }), 25000); 
      };
      ws.onmessage = (e) => {
        let ev; try { ev = JSON.parse(e.data); } catch { return; }
        switch (ev.type) {
          case "connected":
            setOnline(!!ev.partner_online);
            setLastSeen(ev.partner_last_seen || null);
            if (ev.mood && MOODS.some((x) => x[0] === ev.mood)) setMood(ev.mood);
            break;
          case "message_history": {
            const list = ev.messages || [];
            setMessages(list.map((x) => ({ ...x, content: x.content, status: "seen" })));
            ackRead(list);
            break;
          }
          case "message": {
            const mine = ev.sender_id === user.id;
            const msg = { 
              id: ev.id ?? ev.message_id, client_message_id: ev.client_message_id, sender_id: ev.sender_id,
              content: ev.content, media_url: ev.media_url, media_type: ev.media_type, created_at: ev.timestamp, 
              status: mine ? "sent" : undefined 
            };
            setMessages((l) => {
              if (l.some((x) => x.id === msg.id)) return l;
              const i = mine && msg.client_message_id ? l.findIndex((x) => x.client_message_id === msg.client_message_id) : -1;
              if (i >= 0) { const c = [...l]; c[i] = { ...c[i], ...msg, pending: false, status: c[i].status && rank[c[i].status] > 1 ? c[i].status : "sent" }; return c; }
              return [...l, msg];
            });
            if (!mine) wsSend({ type: "message_read", message_id: msg.id });
            break;
          }
          case "message_receipt": {
            const next = ev.status;
            if (!next) break;
            setMessages((l) => l.map((x) => {
              const hit = (ev.message_id && x.id === ev.message_id) || (ev.client_message_id && x.client_message_id === ev.client_message_id);
              if (!hit || x.sender_id !== user.id) return x;
              return rank[next] > (rank[x.status] ?? 0) ? { ...x, id: ev.message_id ?? x.id, status: next } : { ...x, id: ev.message_id ?? x.id };
            }));
            break;
          }
          case "typing":
            setTyping(!!ev.is_typing); clearTimeout(hide);
            if (ev.is_typing) hide = setTimeout(() => setTyping(false), 6000);
            break;
          case "presence":
            setOnline(!!ev.is_online); setLastSeen(ev.last_seen || null); if (!ev.is_online) setTyping(false); break;
          case "mood":
            if (ev.mood && MOODS.some((x) => x[0] === ev.mood)) setMood(ev.mood);
            break;
          case "error":
            setNotice(ev.message || "Something went wrong");
            if (ev.client_message_id) setMessages((l) => l.filter((x) => x.client_message_id !== ev.client_message_id));
            setTimeout(() => setNotice(""), 3000);
            break;
          default: break; 
        }
      };
      ws.onerror = () => {};
      ws.onclose = (e) => {
        clearInterval(ping);
        if (closed) return;
        if (e.code === 1008) { setConn("denied"); setNotice(e.reason || "Not allowed to open this chat"); return; }
        setConn("closed");
        attempts += 1;
        retry = setTimeout(() => { setConn("connecting"); connect(); }, Math.min(1000 * 2 ** attempts, 15000));
      };
    };
    connect();
    return () => { closed = true; clearTimeout(retry); clearTimeout(hide); clearInterval(ping); try { wsRef.current?.close(); } catch {} };
  }, [partner?.user_id, user.id]);

  useEffect(() => { setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80); }, [messages.length]);

  const wsSendNow = (obj) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === 1) { ws.send(JSON.stringify(obj)); return true; }
    return false;
  };

  const onChange = (v) => {
    setText(v);
    if (v && !typingOn.current) { typingOn.current = true; wsSendNow({ type: "typing_start" }); }
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => { if (typingOn.current) { typingOn.current = false; wsSendNow({ type: "typing_stop" }); } }, 1800);
  };

  const send = (override) => {
    const body = (override ?? text).trim();
    if (!body) return;
    const cid = `c${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
    const ok = wsSendNow({ type: "message", content: body, client_message_id: cid, message_type: "text" });
    if (!ok) { setNotice("Connecting… try again in a moment"); setTimeout(() => setNotice(""), 2500); return; }
    typingOn.current = false; wsSendNow({ type: "typing_stop" });
    setMessages((l) => [...l, { id: cid, client_message_id: cid, sender_id: user.id, content: body, pending: true, status: "sending", created_at: new Date().toISOString() }]);
    setText(""); setSuggestions([]);
  };

  const askAi = (action) => {
    setAiModal(false);
    if (action === "question") setSuggestions(pick3(QUESTIONS));
    else if (action === "game") setSuggestions(pick3(GAMES));
    else setSuggestions(pick3([...(BY_MOOD[mood] || []), ...GENERIC]));
  };

  /* ── Attachments & Media ── */
  const uploadAndSend = async (file) => {
    if (uploading) return;
    setUploading(true);
    try {
      // Note: Hum EP.chatSend use kar rahe hain file upload ke liye, agar aapke paas 
      // EP.coupleUpload ho toh use change kar sakte hain.
      const fd = new FormData();
      fd.append("receiver_id", partner.user_id);
      fd.append("content", ""); // text optional hai
      fd.append("file", file);
      
      const d = await api(EP.chatSend, { method: "POST", form: fd });
      
      if (d.success && d.message?.media_url) {
        const cid = `c${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
        // Send media via WS
        wsSendNow({
          type: "message",
          client_message_id: cid,
          content: "",
          media_url: d.message.media_url,
          media_type: d.message.media_type,
          message_type: "text"
        });
      } else {
        Alert.alert("Upload Failed", "Could not upload file.");
      }
    } catch (e) {
      Alert.alert("Error", e.message || "Failed to send media");
    }
    setUploading(false);
  };

  const pickMedia = async () => {
    setAttachOpen(false);
    const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!p.granted) return Alert.alert("Permission needed", "Allow photo library access.");
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.All, quality: 0.85 });
    if (r.canceled) return;
    const a = r.assets[0];
    const vid = a.type === "video";
    uploadAndSend({ uri: a.uri, name: a.fileName || (vid ? "video.mp4" : "photo.jpg"), type: a.mimeType || (vid ? "video/mp4" : "image/jpeg") });
  };

  const openCamera = async () => {
    setAttachOpen(false);
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted) return Alert.alert("Permission needed", "Allow camera access.");
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.All, quality: 0.85 });
    if (r.canceled) return;
    const a = r.assets[0];
    const vid = a.type === "video";
    uploadAndSend({ uri: a.uri, name: a.fileName || (vid ? "video.mp4" : "photo.jpg"), type: a.mimeType || (vid ? "video/mp4" : "image/jpeg") });
  };

  const pickDocument = async () => {
    setAttachOpen(false);
    const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (r.canceled) return;
    const a = r.assets[0];
    uploadAndSend({ uri: a.uri, name: a.name || "file", type: a.mimeType || "application/octet-stream" });
  };

  const pickAudio = async () => {
    setAttachOpen(false);
    const r = await DocumentPicker.getDocumentAsync({ type: "audio/*", copyToCacheDirectory: true });
    if (r.canceled) return;
    const a = r.assets[0];
    uploadAndSend({ uri: a.uri, name: a.name || "audio.m4a", type: a.mimeType || "audio/mpeg" });
  };

  /* ── Voice Note ── */
  const startRec = async () => {
    setAttachOpen(false); setEmojiOpen(false); Keyboard.dismiss();
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
      if (shouldSend && uri && recMs > 600) {
        uploadAndSend({ uri, name: `voice-${Date.now()}.m4a`, type: "audio/m4a" });
      }
    } catch {}
  };

  const headerStatus = conn === "denied" ? "Unavailable" : conn !== "open" ? (conn === "connecting" ? "Connecting…" : "Reconnecting…")
    : typing ? "typing…" : online ? "online" : (() => { const d = parseTime(lastSeen); return d ? `last seen ${d.toLocaleDateString([], { day: "numeric", month: "short" })} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Couple chat"; })();

  if (!partner) {
    return (
      <SafeAreaView className="flex-1 bg-[#fff0f6]">
        <View className="h-16 flex-row items-center px-4">
          <Pressable onPress={() => navigation.goBack()}
            className="w-10 h-10 rounded-full bg-white border border-[#f3d9e4] items-center justify-center active:opacity-70">
            <Ionicons name="chevron-back" size={22} color="#382b3b" />
          </Pressable>
          <View className="ml-3">
            <Text className="text-[#382b3b] text-[20px] font-extrabold tracking-tight">Choose your partner</Text>
            <Text className="text-[#968b98] text-[12px]">Start a private couple chat</Text>
          </View>
        </View>
        <FlatList data={connections} keyExtractor={(c) => c.user_id} contentContainerClassName="p-4 gap-3"
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View className="items-center pt-16 px-8">
              <View className="w-20 h-20 rounded-full bg-white border border-[#f3d9e4] items-center justify-center mb-4">
                <Ionicons name="heart-outline" size={34} color="#e56b9a" />
              </View>
              <Empty text="No connections yet. Connect with your partner first (Search tab)." />
            </View>
          }
          renderItem={({ item }) => (
            <Pressable onPress={() => setPartner(item)}
              className="flex-row items-center p-3.5 rounded-3xl bg-white border border-[#f3d9e4] active:opacity-80">
              <View className="p-0.5 rounded-full border border-[#e56b9a]/40">
                <Avatar uri={item.profile_photo} name={item.name || item.username} size={48} />
              </View>
              <View className="flex-1 ml-3.5">
                <Text className="text-[#382b3b] text-[16px] font-bold" numberOfLines={1}>{item.name || item.username}</Text>
                <Text className="text-[#968b98] text-[12px] mt-0.5">@{item.username}</Text>
              </View>
              <View className="w-10 h-10 rounded-full bg-[#fff0f6] items-center justify-center">
                <Ionicons name="heart" size={18} color="#e56b9a" />
              </View>
            </Pressable>
          )} />
      </SafeAreaView>
    );
  }

  const tick = (x) => x.status === "seen" ? ["checkmark-done", "#e8f9ff"] : x.status === "delivered" ? ["checkmark-done", "rgba(255,255,255,0.75)"]
    : x.status === "sent" ? ["checkmark", "rgba(255,255,255,0.75)"] : ["time-outline", "rgba(255,255,255,0.75)"];

  const live = conn === "open" && (online || typing);
  const canSend = (text.trim().length > 0 || uploading) && conn === "open";

  return (
    <SafeAreaView style={{ backgroundColor: bg }} className="flex-1">
      {/* header */}
      <View className="h-[64px] flex-row items-center px-3 border-b border-black/5 bg-white/95">
        <Pressable onPress={() => navigation.goBack()}
          className="w-10 h-10 rounded-full bg-black/5 items-center justify-center active:opacity-70">
          <Ionicons name="chevron-back" size={22} color="#382b3b" />
        </Pressable>
        <View className="ml-2.5">
          <View className="p-0.5 rounded-full border-2" style={{ borderColor: live ? "#2f9e6a" : `${accent}66` }}>
            <Avatar uri={partner.profile_photo} name={partner.name || "P"} size={36} />
          </View>
        </View>
        <View className="flex-1 ml-3">
          <Text className="text-[#382b3b] text-[16px] font-bold" numberOfLines={1}>{partner.name || partner.username || "Partner"}</Text>
          <Text className="text-[12px] mt-0.5" numberOfLines={1} style={{ color: live ? "#2f9e6a" : "#968b98" }}>{headerStatus}</Text>
        </View>
        <Pressable onPress={() => setMoodModal(true)}
          className="flex-row items-center pl-3 pr-2.5 h-9 rounded-full active:opacity-80" style={{ backgroundColor: accent }}>
          <Text className="text-white text-[12px] font-bold mr-1">{m[1]}</Text>
          <Ionicons name="chevron-down" size={14} color="#fff" />
        </Pressable>
      </View>

      {notice ? (
        <View className="flex-row items-center px-4 py-2.5 bg-[#ffe3e3]">
          <Ionicons name="alert-circle-outline" size={16} color="#c92a2a" />
          <Text className="text-[#c92a2a] text-xs ml-2 flex-1">{notice}</Text>
        </View>
      ) : null}

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        {conn === "connecting" && messages.length === 0 ? <ActivityIndicator color={accent} className="mt-6" /> : null}
        
        <FlatList ref={listRef} data={messages} keyExtractor={(x, i) => String(x.client_message_id || x.id || i)}
          contentContainerClassName="px-3.5 pt-4 pb-3 gap-2" showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            messages.length > 0 ? (
              <View className="items-center pb-3">
                <View className="flex-row items-center px-3.5 py-1.5 rounded-full bg-white/80 border border-black/5">
                  <Ionicons name="heart" size={12} color={accent} />
                  <Text className="text-[#968b98] text-[11px] ml-1.5">Your private space, just for two</Text>
                </View>
              </View>
            ) : null
          }
          ListEmptyComponent={
            conn === "connecting" ? null : (
              <View className="items-center pt-10 px-8">
                <View className="w-16 h-16 rounded-full bg-white items-center justify-center mb-3" style={{ borderWidth: 1, borderColor: `${accent}33` }}>
                  <Ionicons name="heart" size={28} color={accent} />
                </View>
                <Text className="text-[#382b3b] text-[16px] font-bold">Say something sweet</Text>
                <Text className="text-[#968b98] text-[12px] text-center mt-1">Send the first message, or tap a quick action above.</Text>
              </View>
            )
          }
          renderItem={({ item }) => {
            const mine = item.sender_id === user.id;
            const [ti, tc] = mine ? tick(item) : [];
            const t = parseTime(item.created_at)?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            const url = absUrl(item.media_url);
            const isImg = item.media_type === "image";
            const isVid = item.media_type === "video";
            const hasMedia = item.media_url && (isImg || isVid);

            return (
              <View className={`max-w-[80%] rounded-[22px] overflow-hidden ${hasMedia && !item.content ? "p-1" : "px-4 pt-2.5 pb-2"} ${mine ? "self-end rounded-br-md" : "self-start bg-white border border-black/5 rounded-bl-md"} ${item.pending ? "opacity-70" : ""}`}
                style={mine ? { backgroundColor: accent } : undefined}>
                
                {isImg ? (
                  <Pressable onPress={() => Linking.openURL(url)}>
                    <Image source={{ uri: url }} className="w-[200px] h-[200px] rounded-xl mb-1" resizeMode="cover" />
                  </Pressable>
                ) : null}

                {isVid ? (
                  <Video source={{ uri: url }} useNativeControls resizeMode={ResizeMode.CONTAIN}
                    style={{ width: 200, height: 200, borderRadius: 12, marginBottom: 4, backgroundColor: "#000" }} />
                ) : null}

                {item.media_url && !isImg && !isVid ? (
                  <Pressable onPress={() => Linking.openURL(url)}
                    className="flex-row items-center mb-1.5 pr-3 py-2 pl-2 rounded-xl bg-black/10 active:opacity-70">
                    <View className="w-8 h-8 rounded-lg bg-white/20 items-center justify-center">
                      <Ionicons name={item.media_type === "audio" ? "musical-notes" : "document-text"} size={16} color={mine ? "#fff" : accent} />
                    </View>
                    <Text className={`text-[13px] font-semibold ml-2.5 ${mine ? "text-white" : "text-[#382b3b]"}`}>
                      {item.media_type === "audio" ? "Play audio" : "Open file"}
                    </Text>
                  </Pressable>
                ) : null}

                {item.content ? <Text className={`text-[15px] leading-[21px] ${mine ? "text-white" : "text-[#382b3b]"}`}>{item.content}</Text> : null}
                
                <View className={`flex-row justify-end items-center gap-1 ${hasMedia && !item.content ? "pr-2 pb-1" : "mt-0.5"}`}>
                  <Text className={`text-[10px] ${mine ? "text-white/75" : "text-[#968b98]"}`}>{t}</Text>
                  {mine && <Ionicons name={ti} size={14} color={tc} />}
                </View>
              </View>
            );
          }} />

        {typing && conn === "open" ? (
          <View className="px-4 pb-2">
            <View className="self-start flex-row items-center px-3 py-1.5 rounded-full bg-white border border-black/5">
              <View className="flex-row gap-1">
                <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accent }} />
                <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: `${accent}AA` }} />
                <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: `${accent}55` }} />
              </View>
              <Text className="text-[#968b98] text-[11px] ml-2">typing</Text>
            </View>
          </View>
        ) : null}

        {suggestions.length > 0 && (
          <View className="px-3.5 pb-2.5">
            <View className="flex-row items-center justify-between mb-2 px-0.5">
              <View className="flex-row items-center">
                <Ionicons name="sparkles" size={13} color={accent} />
                <Text className="text-[#968b98] text-[12px] font-semibold ml-1.5">Suggestions</Text>
              </View>
              <Pressable onPress={() => setSuggestions([])} hitSlop={10} className="w-6 h-6 rounded-full bg-black/5 items-center justify-center">
                <Ionicons name="close" size={14} color="#968b98" />
              </Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
              {suggestions.map((s, i) => (
                <Pressable key={i} onPress={() => send(s)} className="px-4 py-2.5 rounded-2xl bg-white border active:opacity-70" style={{ borderColor: accent }}>
                  <Text className="text-[#382b3b] text-[13px]">{s}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Emoji Picker Panel */}
        {emojiOpen ? (
          <View className="bg-white/95 border-t border-black/5 px-2 py-2 flex-row flex-wrap" style={{ maxHeight: 200 }}>
            {EMOJIS.map((e) => (
              <Pressable key={e} onPress={() => setText((t) => t + e)} className="w-[12.5%] items-center py-1.5 active:opacity-60">
                <Text style={{ fontSize: 24 }}>{e}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {/* Composer */}
        <View className="px-3 pt-2.5 pb-3 bg-white/95 border-t border-black/5">
          {recording ? (
            <View className="flex-row items-center gap-2">
              <Pressable onPress={() => stopRec(false)} className="w-11 h-11 rounded-full bg-black/5 items-center justify-center active:opacity-70">
                <Ionicons name="trash-outline" size={20} color="#e03131" />
              </Pressable>
              <View className="flex-1 h-12 rounded-[24px] bg-[#f6f2f6] border border-black/5 flex-row items-center px-4">
                <View className="w-2.5 h-2.5 rounded-full bg-red-500 mr-3" />
                <Text className="text-[#382b3b] text-[15px] font-medium">{mmss(recMs)}</Text>
                <Text className="text-[#968b98] text-[12px] ml-3">Recording…</Text>
              </View>
              <Pressable onPress={() => stopRec(true)} className="w-12 h-12 rounded-2xl items-center justify-center active:opacity-80" style={{ backgroundColor: accent }}>
                <Ionicons name="arrow-up" size={22} color="#fff" />
              </Pressable>
            </View>
          ) : (
            <View className="flex-row items-center gap-2">
              <View className="flex-1 flex-row items-center rounded-[24px] bg-[#f6f2f6] border border-black/5 pl-2 pr-1 min-h-[48px]">
                <Pressable
                  onPress={() => { setAttachOpen(false); Keyboard.dismiss(); setEmojiOpen((v) => !v); }}
                  hitSlop={6} className="w-9 h-9 items-center justify-center active:opacity-70"
                >
                  <Ionicons name={emojiOpen ? "keypad-outline" : "happy-outline"} size={23} color="#968b98" />
                </Pressable>
                <TextInput
                  value={text} onChangeText={onChange} multiline maxLength={4000}
                  onFocus={() => { setEmojiOpen(false); setAttachOpen(false); }}
                  placeholder="Message…" placeholderTextColor="#968b98"
                  className="flex-1 max-h-[120px] px-2 py-3 text-[#382b3b] text-[15px]"
                />
                <Pressable onPress={openCamera} hitSlop={6} className="w-9 h-9 items-center justify-center active:opacity-70">
                  <Ionicons name="camera-outline" size={22} color="#968b98" />
                </Pressable>
                <Pressable
                  onPress={() => { Keyboard.dismiss(); setEmojiOpen(false); setAttachOpen((v) => !v); }}
                  hitSlop={6} className="w-9 h-9 items-center justify-center active:opacity-70"
                >
                  <Ionicons name="attach" size={24} color="#968b98" style={{ transform: [{ rotate: "45deg" }] }} />
                </Pressable>
                <Pressable onPress={startRec} hitSlop={6} className="w-9 h-9 items-center justify-center active:opacity-70">
                  <Ionicons name="mic-outline" size={22} color="#968b98" />
                </Pressable>
              </View>
              
              <Pressable
                onPress={() => send()} disabled={!canSend}
                className="w-12 h-12 rounded-2xl items-center justify-center"
                style={{ backgroundColor: canSend ? accent : `${accent}55` }}
              >
                {uploading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="paper-plane" size={20} color="#fff" />
                )}
              </Pressable>
            </View>
          )}
        </View>

        {/* Attach Popup (Absolute) */}
        {attachOpen ? (
          <>
            <Pressable className="absolute inset-0 z-40" onPress={() => setAttachOpen(false)} />
            <View
              className="absolute left-3 z-50 rounded-2xl bg-white border border-black/10 overflow-hidden shadow-lg"
              style={{ bottom: 78, width: 210, elevation: 12 }}
            >
              <Pressable onPress={pickMedia} className="flex-row items-center px-4 py-3 active:bg-black/5 border-b border-black/5">
                <Ionicons name="images-outline" size={20} color={accent} />
                <Text className="ml-3 text-[#382b3b] text-[14px] font-medium">Photos & videos</Text>
              </Pressable>
              <Pressable onPress={pickDocument} className="flex-row items-center px-4 py-3 active:bg-black/5 border-b border-black/5">
                <Ionicons name="document-text-outline" size={20} color={accent} />
                <Text className="ml-3 text-[#382b3b] text-[14px] font-medium">Document</Text>
              </Pressable>
              <Pressable onPress={pickAudio} className="flex-row items-center px-4 py-3 active:bg-black/5">
                <Ionicons name="musical-notes-outline" size={20} color={accent} />
                <Text className="ml-3 text-[#382b3b] text-[14px] font-medium">Audio file</Text>
              </Pressable>
            </View>
          </>
        ) : null}
      </KeyboardAvoidingView>

      {/* mood sheet */}
      <Modal visible={moodModal} transparent animationType="slide" onRequestClose={() => setMoodModal(false)}>
        <Pressable className="flex-1 bg-black/45 justify-end" onPress={() => setMoodModal(false)}>
          <Pressable className="max-h-[72%] bg-white rounded-t-[28px] px-5 pt-2.5" onPress={() => {}}>
            <View className="items-center pb-3"><View className="w-10 h-1 rounded-full bg-black/10" /></View>
            <Text className="text-[#968b98] text-[12px] font-medium">UtaNexa Couple Chat</Text>
            <Text className="text-[#382b3b] text-[22px] font-extrabold tracking-tight mb-1">Set the mood</Text>
            <Text className="text-[#968b98] text-[12px] mb-4">It changes the colours and the message ideas you get.</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View className="flex-row flex-wrap gap-2.5 pb-10">
                {MOODS.map(([k, label, c, tint]) => {
                  const on = mood === k;
                  return (
                    <Pressable key={k} onPress={() => { setMood(k); setMoodModal(false); wsSendNow({ type: "mood_change", mood: k }); }}
                      className="flex-row items-center pl-3 pr-4 h-11 rounded-full border-[1.5px] active:opacity-80"
                      style={{ borderColor: on ? c : `${c}55`, backgroundColor: on ? c : tint }}>
                      <View className="w-2.5 h-2.5 rounded-full mr-2" style={{ backgroundColor: on ? "#fff" : c }} />
                      <Text style={{ color: on ? "#fff" : c }} className="text-[13px] font-bold">{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* assistant dialog */}
      <Modal visible={aiModal} transparent animationType="fade" onRequestClose={() => setAiModal(false)}>
        <Pressable className="flex-1 bg-black/50 justify-center px-6" onPress={() => setAiModal(false)}>
          <Pressable className="bg-white rounded-[28px] p-5" onPress={() => {}}>
            <View className="items-center mb-4">
              <View className="w-14 h-14 rounded-full items-center justify-center mb-3" style={{ backgroundColor: `${accent}1F` }}>
                <Ionicons name="sparkles" size={26} color={accent} />
              </View>
              <Text className="text-[#382b3b] text-[20px] font-extrabold tracking-tight">Couple assistant</Text>
              <Text className="text-[#968b98] text-[12px] mt-1">What would you like help with?</Text>
            </View>
            <View className="gap-2.5">
              {AI_ACTIONS.map(([k, l, d, ic]) => (
                <Pressable key={k} onPress={() => askAi(k)}
                  className="flex-row items-center p-3.5 rounded-2xl border active:opacity-70"
                  style={{ borderColor: `${accent}40`, backgroundColor: `${accent}0F` }}>
                  <View className="w-10 h-10 rounded-xl items-center justify-center" style={{ backgroundColor: accent }}>
                    <Ionicons name={ic} size={20} color="#fff" />
                  </View>
                  <View className="flex-1 ml-3">
                    <Text className="text-[#382b3b] text-[14px] font-bold">{l}</Text>
                    <Text className="text-[#968b98] text-[11px] mt-0.5">{d}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={accent} />
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}