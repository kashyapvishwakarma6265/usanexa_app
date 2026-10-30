import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, FlatList, TextInput, KeyboardAvoidingView, Platform, Animated, Easing } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api/client";
import { EP } from "../api/endpoints";

const SUGGESTIONS = [
  { label: "Usanex ke features", prompt: "Usanex ke features samjhao", icon: "apps-outline" },
  { label: "Aaj ke kaam plan karo", prompt: "Mujhe aaj ke kaam plan karne mein help karo", icon: "checkbox-outline" },
  { label: "AI learning roadmap", prompt: "Meri AI learning roadmap banao", icon: "map-outline" },
];

// ── small 3D pieces (outside the screen so they never remount) ──────────────
// A glossy sphere: base shade at the bottom, highlight at the top-left.
const Orb = ({ size = 72, icon = 30 }) => (
  <View className="rounded-full bg-[#4f8cff] items-center justify-center overflow-hidden shadow-2xl shadow-[#4f8cff]" style={{ width: size, height: size }}>
    <View className="absolute bottom-0 left-0 right-0 bg-[#1a3f9e]/55 rounded-full" style={{ height: size * 0.5, transform: [{ translateY: size * 0.18 }] }} />
    <View className="absolute bg-white/35 rounded-full" style={{ top: size * 0.1, left: size * 0.16, width: size * 0.42, height: size * 0.22, transform: [{ rotate: "-28deg" }] }} />
    <Ionicons name="sparkles" size={icon} color="#fff" />
  </View>
);

const Key = ({ icon, label, onPress }) => (
  <View className="rounded-2xl bg-[#05080f] pb-[3px] shadow-lg shadow-black">
    <Pressable onPress={onPress}
      className="flex-row items-center h-11 px-4 rounded-2xl bg-[#152036] border border-white/6 border-t-white/18 active:translate-y-[3px]">
      <Ionicons name={icon} size={16} color="#7fa8ff" />
      <Text className="text-[#f3f6ff] text-[13px] font-semibold ml-2">{label}</Text>
    </Pressable>
  </View>
);

const Bubble = ({ item }) => {
  const user = item.role === "user";
  if (user) {
    return (
      <View className="max-w-[84%] self-end rounded-[22px] rounded-br-md bg-[#2a58c4] pb-[3px] shadow-lg shadow-[#4f8cff]/40">
        <View className="px-4 py-3 rounded-[22px] rounded-br-md bg-[#4f8cff] border-t border-white/30">
          <Text selectable className="text-white text-[15px] leading-6">{item.text}</Text>
        </View>
      </View>
    );
  }
  return (
    <View className="flex-row items-end self-start max-w-[92%]">
      <View className="mr-2 mb-1.5">
        <Orb size={28} icon={13} />
      </View>
      <View className="flex-shrink rounded-[22px] rounded-bl-md bg-[#05080f] pb-[3px] shadow-lg shadow-black">
        <View className={`px-4 py-3 rounded-[22px] rounded-bl-md bg-[#151f32] border border-white/6 border-t-white/15 ${item.error ? "border-danger/40" : ""}`}>
          <Text selectable className={`text-[15px] leading-6 ${item.error ? "text-danger" : "text-[#f3f6ff]"}`}>{item.text}</Text>
        </View>
      </View>
    </View>
  );
};

// Backend: POST /api/ai-assistant/chat  {message}  ->  {reply}
// (the server keeps short conversation memory per logged-in user)
export default function NexaScreen({ navigation }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef(null);

  // one gentle motion: the orb floats and its floor shadow breathes with it
  const float = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [float]);

  const send = async (override) => {
    const body = (override ?? text).trim();
    if (!body || busy) return;
    const next = [...messages, { role: "user", text: body }];
    setMessages(next); setText(""); setBusy(true);
    try {
      const d = await api(EP.nexaChat, { method: "POST", body: { message: body.slice(0, 5000) } });
      setMessages([...next, { role: "assistant", text: d.reply || "..." }]);
    } catch (e) {
      setMessages([...next, { role: "assistant", text: e.message || "Maaf kijiye, abhi jawab nahi mil paya. Dobara try karein.", error: true }]);
    }
    setBusy(false);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const canSend = text.trim().length > 0 && !busy;

  return (
    <SafeAreaView className="flex-1 bg-[#080d18]">
      {/* ambient glow behind the header */}
      <View pointerEvents="none" className="absolute -top-28 self-center w-80 h-80 rounded-full bg-[#4f8cff]/10" />

      {/* header */}
      <View className="h-16 flex-row items-center justify-between px-4">
        <Pressable onPress={() => navigation.goBack()}
          className="w-10 h-10 rounded-full bg-white/6 border border-white/10 items-center justify-center active:opacity-70">
          <Ionicons name="arrow-back" size={20} color="#f3f6ff" />
        </Pressable>
        <View className="flex-row items-center">
          <Orb size={26} icon={12} />
          <Text className="text-[#f3f6ff] text-[18px] font-extrabold tracking-widest ml-2.5">NEXA</Text>
        </View>
        <Pressable onPress={() => setMessages([])}
          className="w-10 h-10 rounded-full bg-white/6 border border-white/10 items-center justify-center active:opacity-70">
          <Ionicons name="refresh" size={19} color="#9aa9c2" />
        </Pressable>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(_, i) => String(i)}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="px-4 pt-3 pb-4 gap-4 flex-grow"
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center pb-6">
              <View className="w-[190px] h-[190px] items-center justify-center">
                <View className="absolute w-[190px] h-[190px] rounded-full bg-[#4f8cff]/6" />
                <View className="absolute w-[150px] h-[150px] rounded-full bg-[#4f8cff]/10 border border-[#4f8cff]/15" />
                <Animated.View style={{ transform: [{ translateY: float.interpolate({ inputRange: [0, 1], outputRange: [4, -8] }) }] }}>
                  <Orb size={96} icon={40} />
                </Animated.View>
              </View>
              {/* floor shadow */}
              <Animated.View
                className="w-24 h-3.5 rounded-full bg-[#4f8cff]/30 -mt-2"
                style={{ opacity: float.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0.5] }), transform: [{ scaleX: float.interpolate({ inputRange: [0, 1], outputRange: [1, 0.72] }) }] }}
              />
              <Text className="text-[#f3f6ff] text-[24px] font-extrabold tracking-tight mt-8">Namaste!</Text>
              <Text className="text-[#9aa9c2] text-[14px] text-center mt-1.5 px-8 leading-5">
                Aapka personal AI assistant. Aap jo chahein, type karein.
              </Text>
              <View className="items-center gap-3 mt-7">
                {SUGGESTIONS.map((s) => (
                  <Key key={s.label} icon={s.icon} label={s.label} onPress={() => send(s.prompt)} />
                ))}
              </View>
            </View>
          }
          renderItem={({ item }) => <Bubble item={item} />}
          ListFooterComponent={
            busy ? (
              <View className="flex-row items-center self-start mt-1">
                <View className="mr-2"><Orb size={28} icon={13} /></View>
                <View className="rounded-full bg-[#05080f] pb-[3px] shadow-lg shadow-black">
                  <View className="flex-row items-center px-4 h-10 rounded-full bg-[#151f32] border border-white/6 border-t-white/15">
                    <View className="flex-row gap-1">
                      <View className="w-1.5 h-1.5 rounded-full bg-[#7fa8ff]" />
                      <View className="w-1.5 h-1.5 rounded-full bg-[#7fa8ff]/70" />
                      <View className="w-1.5 h-1.5 rounded-full bg-[#7fa8ff]/40" />
                    </View>
                    <Text className="text-[#9aa9c2] text-xs ml-2.5">NEXA soch raha hai…</Text>
                  </View>
                </View>
              </View>
            ) : null
          }
        />

        {/* raised composer dock */}
        <View className="px-3 pt-2 pb-2 bg-[#080d18]">
          <View className="rounded-[30px] bg-[#04070d] pb-[3px] shadow-2xl shadow-black">
            <View className="flex-row items-end gap-2 p-1.5 rounded-[30px] border border-white/6 border-t-white/18 bg-[#101827]">
              <TextInput value={text} onChangeText={setText} multiline maxLength={5000} placeholder="NEXA se kuch bhi poochho..." placeholderTextColor="#6f7e98"
                className="flex-1 max-h-[110px] min-h-[44px] px-4 py-3 text-[#f3f6ff] text-[15px]" />
              <View className={`rounded-full pb-[3px] ${canSend ? "bg-[#2a58c4] shadow-lg shadow-[#4f8cff]/50" : "bg-[#0a0f1a]"}`}>
                <Pressable onPress={() => send()} disabled={!canSend}
                  className={`w-11 h-11 rounded-full items-center justify-center active:translate-y-[3px] ${canSend ? "bg-[#4f8cff] border-t border-white/35" : "bg-[#182235]"}`}>
                  <Ionicons name="arrow-up" size={21} color={canSend ? "#fff" : "#5d6a80"} />
                </Pressable>
              </View>
            </View>
          </View>
          <Text className="text-[#9aa9c2]/70 text-[11px] text-center mt-2">NEXA kabhi-kabhi galat jawab de sakta hai.</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}