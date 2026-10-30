import React, { useCallback, useState } from "react";
import { View, Text, Pressable, FlatList, Modal, RefreshControl, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../api/client";
import { EP } from "../api/endpoints";
import { useAuth } from "../context/AuthContext";
import CreateSheet from "../components/CreateSheet";
import { Avatar } from "../components/ui";

// backend categories are "friend" | "family" | null
const FILTERS = [
  { key: "all", label: "All Connected", chip: "All", icon: "people-outline" },
  { key: "family", label: "Family", chip: "Family", icon: "heart-outline" },
  { key: "friend", label: "Friends", chip: "Friends", icon: "person-outline" },
];

const CATEGORY_OPTIONS = [
  ["friend", "Mark as Friend", "person-outline"],
  ["family", "Mark as Family", "heart-outline"],
  [null, "Remove category", "close-circle-outline"],
];

const Wordmark = ({ size = "text-[22px]" }) => (
  <Text className={`${size} font-extrabold tracking-tight`}>
    <Text className="text-brand">UTA</Text><Text className="text-white">NEXA</Text>
  </Text>
);

const DrawerRow = ({ icon, label, onPress, active, danger }) => (
  <Pressable onPress={onPress}
    className={`h-12 flex-row items-center px-3 rounded-2xl mb-1 active:opacity-70 ${active ? "bg-brand/15 border border-brand/30" : ""}`}>
    <View className={`w-8 h-8 rounded-xl items-center justify-center ${danger ? "bg-red-500/12" : active ? "bg-brand/20" : "bg-white/6"}`}>
      <Ionicons name={icon} size={17} color={danger ? "#ff6b6b" : active ? "#6aa8ff" : "#bec8d5"} />
    </View>
    <Text className={`ml-3 text-[14px] font-medium ${danger ? "text-danger" : active ? "text-white font-semibold" : "text-[#bec8d5]"}`}>{label}</Text>
  </Pressable>
);

export default function HomeScreen({ navigation }) {
  const { signOut, user } = useAuth();
  const [people, setPeople] = useState([]);
  const [filter, setFilter] = useState("all");
  const [menu, setMenu] = useState(false);
  const [create, setCreate] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [picked, setPicked] = useState(null); // person whose category is being edited
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const c = await api(EP.connections);
      setPeople(c.connections || c.users || []);
      setError("");
    } catch (e) { setError(e.message); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const shown = people.filter((p) => filter === "all" || p.category === filter);
  const title = FILTERS.find((f) => f.key === filter).label;
  const countOf = (k) => (k === "all" ? people.length : people.filter((p) => p.category === k).length);

  const pick = (type) => {
    setCreate(false);
    if (type === "reel") navigation.navigate("ReelUpload");
    else navigation.navigate("Profile", { me: true, edit: Date.now() });
  };

  const setCategory = async (person, category) => {
    setPicked(null);
    try {
      if (category) {
        await api(EP.connectionCategory, { method: "POST", body: { connected_user_id: person.user_id, category } });
      } else {
        await api(EP.connectionCategoryRemove(person.user_id), { method: "DELETE" });
      }
      setPeople((l) => l.map((x) => (x.user_id === person.user_id ? { ...x, category } : x)));
    } catch (e) { setError(e.message); }
  };

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top"]}>
      {/* header */}
      <View className="h-16 flex-row items-center justify-between px-4">
        <Pressable onPress={() => setMenu(true)}
          className="w-10 h-10 rounded-full bg-white/6 border border-white/10 items-center justify-center active:opacity-70">
          <Ionicons name="menu" size={22} color="#d9e1eb" />
        </Pressable>
        <Wordmark />
        <Pressable onPress={() => setCreate(true)}
          className="w-10 h-10 rounded-full bg-brand items-center justify-center active:opacity-80">
          <Ionicons name="add" size={24} color="#fff" />
        </Pressable>
      </View>

      <FlatList
        data={shown}
        keyExtractor={(i) => String(i.user_id)}
        showsVerticalScrollIndicator={false}
        contentContainerClassName="pb-28"
        refreshControl={<RefreshControl refreshing={refreshing} tintColor="#247cff"
          onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        ListHeaderComponent={
          <View className="pt-1">
            {/* filter chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="px-4 gap-2.5 py-1">
              {FILTERS.map((f) => {
                const on = filter === f.key;
                return (
                  <Pressable key={f.key} onPress={() => setFilter(f.key)}
                    className={`flex-row items-center h-10 pl-3.5 pr-3 rounded-full border active:opacity-80 ${on ? "bg-brand border-brand" : "bg-white/5 border-white/10"}`}>
                    <Ionicons name={f.icon} size={16} color={on ? "#fff" : "#8f9bb0"} />
                    <Text className={`ml-2 text-[13px] ${on ? "text-white font-bold" : "text-[#9aa7bb] font-medium"}`}>{f.chip}</Text>
                    <View className={`ml-2 min-w-[20px] h-5 px-1.5 rounded-full items-center justify-center ${on ? "bg-white/25" : "bg-white/10"}`}>
                      <Text className={`text-[11px] font-bold ${on ? "text-white" : "text-[#9aa7bb]"}`}>{countOf(f.key)}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>

            {error ? (
              <View className="flex-row items-center mx-4 mt-3 px-3.5 py-2.5 rounded-2xl bg-danger/10 border border-danger/20">
                <Ionicons name="alert-circle-outline" size={16} color="#ff6b6b" />
                <Text className="text-danger text-xs ml-2 flex-1">{error}</Text>
              </View>
            ) : null}

            <View className="flex-row justify-between items-end px-5 mt-5 mb-3">
              <View>
                <Text className="text-ink text-[20px] font-extrabold tracking-tight">{title}</Text>
                <Text className="text-muted text-[12px] mt-0.5">Press and hold a person to organize</Text>
              </View>
              <View className="px-3 h-7 rounded-full bg-brand/15 border border-brand/30 items-center justify-center">
                <Text className="text-brand text-xs font-bold">{shown.length}</Text>
              </View>
            </View>
          </View>
        }
        renderItem={({ item }) => {
          const fam = item.category === "family";
          return (
            <Pressable
              onPress={() => navigation.navigate("Chat", { user: item })}
              onLongPress={() => setPicked(item)}
              className="flex-row items-center mx-4 mb-3 p-3.5 rounded-3xl border border-white/8 bg-surface active:opacity-80">
              <Pressable onPress={() => navigation.navigate("UserProfile", { userId: item.user_id })} className="active:opacity-80">
                <View className="p-0.5 rounded-full border border-brand/40">
                  <Avatar uri={item.profile_photo} name={item.name || item.username} size={50} />
                </View>
              </Pressable>
              <View className="flex-1 ml-3.5">
                <Text className="text-ink text-[16px] font-bold" numberOfLines={1}>{item.name || item.username}</Text>
                <View className="flex-row items-center mt-1">
                  <Text className="text-muted text-[12px] flex-shrink" numberOfLines={1}>@{item.username}</Text>
                  {item.category ? (
                    <View className={`ml-2 px-2 py-0.5 rounded-full border ${fam ? "bg-[#ed80dc]/12 border-[#ed80dc]/30" : "bg-brand/12 border-brand/30"}`}>
                      <Text className={`text-[10px] font-bold capitalize ${fam ? "text-[#f29be4]" : "text-[#6aa8ff]"}`}>{item.category}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
              <Pressable onPress={() => navigation.navigate("CoupleChat", { user: item })} hitSlop={8}
                className="w-10 h-10 rounded-full bg-[#ed80dc]/12 border border-[#ed80dc]/25 items-center justify-center mr-2 active:opacity-70">
                <Ionicons name="heart" size={18} color="#ed80dc" />
              </Pressable>
              <View className="w-10 h-10 rounded-full bg-brand/15 border border-brand/30 items-center justify-center">
                <Ionicons name="chatbubble-ellipses" size={18} color="#4d94ff" />
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View className="items-center pt-16 px-10">
            <View className="w-20 h-20 rounded-full bg-white/5 border border-white/10 items-center justify-center mb-5">
              <Ionicons name={filter === "all" ? "people-outline" : "heart-outline"} size={34} color="#8f9bb0" />
            </View>
            <Text className="text-ink text-[17px] font-bold mb-1.5">
              {filter === "all" ? "No connections yet" : "Nobody here yet"}
            </Text>
            <Text className="text-muted text-[13px] text-center leading-5">
              {filter === "all"
                ? "Use Search to find people and send connection requests."
                : "Long-press a connection to mark them as Friend or Family."}
            </Text>
          </View>
        }
      />

      {/* NEXA floating button */}
      <View className="absolute right-5 bottom-5">
        <View className="absolute -inset-1.5 rounded-full bg-brand/20" />
        <Pressable onPress={() => navigation.navigate("Nexa")}
          className="h-14 pl-4 pr-5 rounded-full bg-brand flex-row items-center active:opacity-85">
          <Ionicons name="sparkles" size={20} color="#fff" />
          <Text className="text-white font-bold text-[14px] ml-2">NEXA</Text>
        </Pressable>
      </View>

      <CreateSheet visible={create} onClose={() => setCreate(false)} onPick={pick} />

      {/* category picker (long-press a connection) */}
      <Modal visible={!!picked} transparent animationType="fade" onRequestClose={() => setPicked(null)}>
        <Pressable className="flex-1 bg-black/65 justify-center px-7" onPress={() => setPicked(null)}>
          <Pressable className="bg-[#0b1424] border border-white/10 rounded-[28px] p-5" onPress={() => {}}>
            <View className="items-center mb-4">
              <View className="p-0.5 rounded-full border border-brand/40 mb-3">
                <Avatar uri={picked?.profile_photo} name={picked?.name || picked?.username} size={56} />
              </View>
              <Text className="text-white text-[17px] font-bold" numberOfLines={1}>{picked?.name || picked?.username}</Text>
              <Text className="text-muted text-[12px] mt-0.5">Organize this connection</Text>
            </View>
            {CATEGORY_OPTIONS.map(([k, l, ic]) => {
              const on = picked?.category === k;
              const remove = k === null;
              return (
                <Pressable key={String(k)} onPress={() => setCategory(picked, k)}
                  className={`h-13 py-3 flex-row items-center px-3 rounded-2xl mb-1.5 active:opacity-70 ${on ? "bg-[#102f4b] border border-brand/40" : "bg-white/4"}`}>
                  <Ionicons name={ic} size={19} color={remove ? "#ff6b6b" : on ? "#6aa8ff" : "#bec8d5"} />
                  <Text className={`flex-1 ml-3 text-[14px] font-medium ${remove ? "text-danger" : "text-ink"}`}>{l}</Text>
                  {on ? <Ionicons name="checkmark-circle" size={18} color="#4d94ff" /> : null}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>

      {/* side drawer */}
      <Modal visible={menu} transparent animationType="fade" onRequestClose={() => setMenu(false)}>
        <Pressable className="flex-1 bg-black/65 flex-row" onPress={() => setMenu(false)}>
          <Pressable className="w-[290px] max-w-[84%] h-full bg-[#090e15] border-r border-white/8 px-4 pt-14 pb-8" onPress={() => {}}>
            <View className="flex-row justify-between items-center mb-6">
              <Wordmark size="text-[20px]" />
              <Pressable onPress={() => setMenu(false)}
                className="w-9 h-9 rounded-full bg-white/6 border border-white/10 items-center justify-center active:opacity-70">
                <Ionicons name="close" size={18} color="#d9e1eb" />
              </Pressable>
            </View>

            {user ? (
              <View className="flex-row items-center p-3 rounded-3xl bg-white/4 border border-white/8 mb-6">
                <View className="p-0.5 rounded-full border border-brand/40">
                  <Avatar uri={user.profile_photo} name={user.name || user.username} size={44} />
                </View>
                <View className="flex-1 ml-3">
                  <Text className="text-white text-[15px] font-bold" numberOfLines={1}>{user.name || user.username}</Text>
                  {user.username ? <Text className="text-muted text-[12px] mt-0.5" numberOfLines={1}>@{user.username}</Text> : null}
                </View>
              </View>
            ) : null}

            <Text className="text-[#5d6a80] text-[12px] font-semibold px-3 mb-2">Connections</Text>
            {FILTERS.map((f) => (
              <DrawerRow key={f.key} icon={f.icon} label={f.label} active={filter === f.key}
                onPress={() => { setFilter(f.key); setMenu(false); }} />
            ))}

            <Text className="text-[#5d6a80] text-[12px] font-semibold px-3 mt-5 mb-2">Explore</Text>
            <DrawerRow icon="heart" label="Couple Chat" onPress={() => { setMenu(false); navigation.navigate("CoupleChat"); }} />
            <DrawerRow icon="sparkles-outline" label="NEXA AI" onPress={() => { setMenu(false); navigation.navigate("Nexa"); }} />

            <View className="h-px bg-white/8 my-4" />
            <DrawerRow icon="log-out-outline" label="Log out" danger onPress={() => { setMenu(false); signOut(); }} />
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}