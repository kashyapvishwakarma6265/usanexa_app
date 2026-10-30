import React, { useState } from "react";
import { View, Text, Pressable, ScrollView, TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { Video, ResizeMode } from "expo-av";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api/client";
import { EP } from "../api/endpoints";

const CATEGORIES = [
  { id: "reels", icon: "film-outline" },
  { id: "entertainment", icon: "sparkles-outline" },
  { id: "education", icon: "school-outline" },
  { id: "music", icon: "musical-notes-outline" },
  { id: "sports", icon: "basketball-outline" },
  { id: "technology", icon: "hardware-chip-outline" },
  { id: "lifestyle", icon: "leaf-outline" },
  { id: "comedy", icon: "happy-outline" },
];
const LANGUAGES = ["English", "Hindi", "Marathi", "Gujarati"];
const FORMATS = ["MP4", "MOV", "WebM", "MKV"];
const MIME = { mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", mkv: "video/x-matroska" };
const fmt = (ms) => { const s = Math.round((ms || 0) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const parseTags = (s) =>
  (s || "").split(/[\s,]+/).filter(Boolean).slice(0, 12).map((t) => (t.startsWith("#") ? t : `#${t}`));

// ── small presentational pieces (outside the screen so they never remount) ──
const Field = ({ label, hint, children }) => (
  <View className="mt-6">
    <View className="flex-row items-baseline justify-between mb-2.5 px-1">
      <Text className="text-white text-[15px] font-bold">{label}</Text>
      {hint ? <Text className="text-[#6f8295] text-[11px]">{hint}</Text> : null}
    </View>
    {children}
  </View>
);

const inputBase = "rounded-2xl border border-white/10 bg-[#0d1522] text-white text-[14px] px-4";

// Backend: POST /api/reels/upload  (multipart: video, caption, hashtags, language, category)
// The server uploads to Cloudinary, so CLOUDINARY_* env vars must be set on the backend.
export default function ReelUploadScreen({ navigation }) {
  const [video, setVideo] = useState(null);
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [language, setLanguage] = useState("");
  const [category, setCategory] = useState("reels");
  const [busy, setBusy] = useState(false);

  const pick = async () => {
    const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!p.granted) return Alert.alert("Permission needed", "Allow photo library access.");
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Videos, quality: 1 });
    if (!r.canceled) setVideo(r.assets[0]);
  };

  const post = async () => {
    if (!video) return;
    setBusy(true);
    try {
      const ext = ((video.uri.split("?")[0].split(".").pop() || "mp4").toLowerCase());
      const known = MIME[ext] ? ext : "mp4";
      const filename = video.fileName && /\.\w+$/.test(video.fileName)
        ? video.fileName
        : `reel.${known}`;
      const mimeType = video.mimeType && video.mimeType.startsWith("video/")
        ? video.mimeType
        : MIME[known];

      const fd = new FormData();

      if (Platform.OS === "web") {
        let blob;
        if (video.file) {
          blob = video.file;
        } else {
          const resp = await fetch(video.uri);
          blob = await resp.blob();
        }
        const fileObj = new File([blob], filename, { type: mimeType });
        fd.append("video", fileObj, filename);
      } else {
        fd.append("video", {
          uri: video.uri,
          name: filename,
          type: mimeType,
        });
      }

      if (caption.trim()) fd.append("caption", caption.trim());
      if (hashtags.trim()) fd.append("hashtags", hashtags.trim());
      if (language.trim()) fd.append("language", language.trim());
      fd.append("category", category);

      await api(EP.reelUpload, { method: "POST", form: fd });
      Alert.alert("Reel posted", "Your reel is live.", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert("Upload failed", e.message);
    }
    setBusy(false);
  };
  const canPost = !!video && !busy;
  const chips = parseTags(hashtags);

  return (
    <SafeAreaView className="flex-1 bg-bg">
      {/* header */}
      <View className="h-16 flex-row items-center justify-between px-4">
        <Pressable onPress={() => navigation.goBack()} disabled={busy}
          className="w-10 h-10 rounded-full bg-white/8 border border-white/10 items-center justify-center active:opacity-70">
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>
        <Text className="text-white text-[18px] font-extrabold tracking-tight">New reel</Text>
        <Pressable onPress={post} disabled={!canPost}
          className={`h-10 px-5 rounded-full items-center justify-center min-w-[78px] ${canPost ? "bg-[#168cff] active:opacity-80" : "bg-white/10"}`}>
          {busy
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text className={`text-sm font-bold ${canPost ? "text-white" : "text-[#5d6a80]"}`}>Share</Text>}
        </Pressable>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <ScrollView contentContainerClassName="px-4 pt-2 pb-16" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* video picker / preview */}
          {!video ? (
            <Pressable onPress={pick}
              className="min-h-[300px] items-center justify-center px-6 py-8 rounded-[28px] border border-dashed border-[#168cff]/40 bg-[#0d1d2d]/70 active:opacity-80">
              <View className="w-24 h-24 rounded-full bg-[#168cff]/10 items-center justify-center">
                <View className="w-16 h-16 rounded-full bg-[#168cff]/20 border border-[#168cff]/40 items-center justify-center">
                  <Ionicons name="videocam" size={30} color="#4aa8ff" />
                </View>
              </View>
              <Text className="text-white text-[22px] font-extrabold mt-5">Choose a video</Text>
              <Text className="text-[#91a5b8] text-[13px] text-center mt-1.5 mb-5">Pick a clip from your library to share with everyone.</Text>
              <View className="flex-row gap-2">
                {FORMATS.map((f) => (
                  <View key={f} className="px-3 py-1 rounded-full bg-white/8 border border-white/10">
                    <Text className="text-[#9eafc0] text-[11px] font-semibold">{f}</Text>
                  </View>
                ))}
              </View>
              <View className="mt-6 h-12 px-6 rounded-full bg-[#168cff] flex-row items-center">
                <Ionicons name="images-outline" size={18} color="#fff" />
                <Text className="text-white font-bold ml-2">Open library</Text>
              </View>
            </Pressable>
          ) : (
            <View>
              <View className="rounded-[28px] overflow-hidden border border-white/10 bg-black">
                <Video source={{ uri: video.uri }} useNativeControls resizeMode={ResizeMode.CONTAIN}
                  style={{ width: "100%", height: 420, backgroundColor: "#000" }} />
                <View pointerEvents="none" className="absolute top-3 left-3 flex-row items-center px-2.5 py-1 rounded-full bg-black/55 border border-white/15">
                  <Ionicons name="time-outline" size={13} color="#fff" />
                  <Text className="text-white text-[12px] font-semibold ml-1">{fmt(video.duration)}</Text>
                </View>
              </View>
              <Pressable onPress={pick} className="self-center mt-3 h-10 px-5 rounded-full bg-white/8 border border-white/10 flex-row items-center active:opacity-70">
                <Ionicons name="swap-horizontal" size={16} color="#8fb4ff" />
                <Text className="text-brandLight text-[13px] font-semibold ml-2">Replace video</Text>
              </Pressable>
            </View>
          )}

          {/* caption */}
          <Field label="Caption" hint={`${caption.length}/5000`}>
            <TextInput value={caption} onChangeText={setCaption} multiline maxLength={5000}
              placeholder="Say something about your reel…" placeholderTextColor="#6f8295"
              style={{ textAlignVertical: "top" }} className={`${inputBase} min-h-[110px] pt-3.5 pb-3.5`} />
          </Field>

          {/* hashtags */}
          <Field label="Hashtags">
            <View className="flex-row items-center rounded-2xl border border-white/10 bg-[#0d1522] px-4">
              <Ionicons name="pricetag-outline" size={18} color="#6f8295" />
              <TextInput value={hashtags} onChangeText={setHashtags} maxLength={2000} autoCapitalize="none"
                placeholder="#travel #food" placeholderTextColor="#6f8295" className="flex-1 h-12 ml-2.5 text-white text-[14px]" />
            </View>
            {chips.length > 0 && (
              <View className="flex-row flex-wrap gap-1.5 mt-2.5 px-0.5">
                {chips.map((t, i) => (
                  <View key={`${t}${i}`} className="px-2.5 py-1 rounded-full bg-[#168cff]/12 border border-[#168cff]/30">
                    <Text className="text-brandLight text-[12px] font-semibold">{t}</Text>
                  </View>
                ))}
              </View>
            )}
          </Field>

          {/* language */}
          <Field label="Language">
            <View className="flex-row items-center rounded-2xl border border-white/10 bg-[#0d1522] px-4">
              <Ionicons name="language-outline" size={18} color="#6f8295" />
              <TextInput value={language} onChangeText={setLanguage} maxLength={50}
                placeholder="e.g. Hindi, English" placeholderTextColor="#6f8295" className="flex-1 h-12 ml-2.5 text-white text-[14px]" />
            </View>
            <View className="flex-row flex-wrap gap-2 mt-2.5">
              {LANGUAGES.map((l) => {
                const on = language.trim().toLowerCase() === l.toLowerCase();
                return (
                  <Pressable key={l} onPress={() => setLanguage(l)}
                    className={`px-3.5 py-1.5 rounded-full border ${on ? "bg-[#102f4b] border-[#168cff]" : "bg-white/5 border-white/10"}`}>
                    <Text className={`text-[12px] ${on ? "text-white font-bold" : "text-[#9eafc0] font-medium"}`}>{l}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Field>

          {/* category */}
          <Field label="Category">
            <View className="flex-row flex-wrap gap-2.5">
              {CATEGORIES.map((c) => {
                const on = category === c.id;
                return (
                  <Pressable key={c.id} onPress={() => setCategory(c.id)}
                    className={`flex-row items-center pl-3 pr-4 h-11 rounded-full border active:opacity-80 ${on ? "bg-[#102f4b] border-[#168cff]" : "bg-[#0d1522] border-white/10"}`}>
                    <Ionicons name={c.icon} size={16} color={on ? "#4aa8ff" : "#7f8fa3"} />
                    <Text className={`ml-2 text-[13px] capitalize ${on ? "text-white font-bold" : "text-[#9eafc0] font-medium"}`}>{c.id}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Field>

          {/* bottom share */}
          <Pressable onPress={post} disabled={!canPost}
            className={`mt-9 h-14 rounded-2xl flex-row items-center justify-center ${canPost ? "bg-[#168cff] active:opacity-80" : "bg-white/8"}`}>
            {busy ? (
              <>
                <ActivityIndicator color="#fff" />
                <Text className="text-white font-bold text-[15px] ml-3">Uploading…</Text>
              </>
            ) : (
              <>
                <Ionicons name="cloud-upload-outline" size={20} color={canPost ? "#fff" : "#5d6a80"} />
                <Text className={`font-bold text-[15px] ml-2 ${canPost ? "text-white" : "text-[#5d6a80]"}`}>
                  {video ? "Share reel" : "Select a video to share"}
                </Text>
              </>
            )}
          </Pressable>

          {busy && (
            <View className="flex-row items-center justify-center mt-4 px-4">
              <Ionicons name="information-circle-outline" size={15} color="#8d96a5" />
              <Text className="text-[#8d96a5] text-xs ml-1.5 flex-shrink">Large videos can take a while. Keep the app open.</Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}