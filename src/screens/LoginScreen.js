import React, { useState } from "react";
import { View, Text, Pressable, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { Brand, Field, Banner, PrimaryButton } from "../components/ui";
import logo from "../../assets/images/utanexa-logo.jpeg";
import { Image } from "react-native";

export default function LoginScreen({ navigation }) {
  const { signIn } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!identifier.trim() || !password) return setMsg("Enter username/mobile and password.");
    setLoading(true); setMsg("");
    try { await signIn(identifier.trim(), password, remember); }
    catch (e) { setMsg(e.message); }
    setLoading(false);
  };

  return (
    <SafeAreaView className="flex-1 bg-authBg">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <ScrollView contentContainerClassName="flex-grow justify-center p-4" keyboardShouldPersistTaps="handled">
          <View className="rounded-3xl border border-white/15 bg-[#0d1527]/95 px-6 pt-9 pb-7">
            <View className="items-center mb-7">
                                  <Image
                                    source={logo}
                                    style={{
                                      width: 55,
                                      height: 55,
                                      resizeMode: "contain",
                                    }}
                                  />
                                </View>
            <View className="mb-9"><Brand size={35} /></View>
            <View className="mb-7 items-center">
              <Text className="text-white text-[28px] font-bold tracking-tight">
                <Text className="text-brandLight">Login</Text> 
              </Text>
              <Text className="text-[#9ba8c1] text-[13px] leading-6 text-center mt-3 max-w-[300px]">
                Enter your username or mobile number and password to continue.
              </Text>
            </View>

            <View className="gap-5">
              <Field label="Username or Mobile" icon="person-outline" placeholder="Username or mobile"
                value={identifier} onChangeText={setIdentifier} autoCapitalize="none" autoCorrect={false} />
              <Field label="Password" icon="lock-closed-outline" placeholder="Password" secure
                value={password} onChangeText={setPassword} autoCapitalize="none" />

              <View className="flex-row items-center justify-between">
                <Pressable onPress={() => setRemember(!remember)} className="flex-row items-center gap-2">
                  <View className={`w-[17px] h-[17px] rounded items-center justify-center border ${remember ? "bg-[#4388ff] border-[#4388ff]" : "bg-authSurface border-[#50617e]"}`}>
                    {remember ? <Text className="text-white text-[11px] font-bold">✓</Text> : null}
                  </View>
                  <Text className="text-[#b5c1d8] text-xs">Remember me</Text>
                </Pressable>
                <Pressable onPress={() => navigation.navigate("ForgotPassword")}>
                  <Text className="text-brandLight text-xs font-semibold">Forgot password?</Text>
                </Pressable>
              </View>

              <Banner msg={msg} />
              <PrimaryButton title="Login" onPress={submit} loading={loading} />
            </View>

            <View className="flex-row items-center gap-3.5 mt-6 mb-5">
              <View className="flex-1 h-px bg-white/15" />
              <Text className="text-[#71809b] text-[11px]">Or</Text>
              <View className="flex-1 h-px bg-white/15" />
            </View>

            <View className="flex-row justify-center gap-1.5">
              <Text className="text-[#9ba8c1] text-[12.5px]">Don't have an account?</Text>
              <Pressable onPress={() => navigation.navigate("Register")}>
                <Text className="text-brandLight text-[12.5px] font-bold">Create account</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
