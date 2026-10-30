import React, { useState } from "react";
import { View, Text, Pressable, ScrollView, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import { api } from "../api/client";
import { EP } from "../api/endpoints";
import useOtpTimer from "../components/useOtpTimer";
import { Brand, Field, Banner, PrimaryButton, SecondaryButton } from "../components/ui";
import logo from "../../assets/images/utanexa-logo.jpeg";
import { Image } from "react-native";

export default function RegisterScreen({ navigation }) {
  const [step, setStep] = useState(1);
  const [f, setF] = useState({ name: "", mobile: "", password: "", confirm: "" });
  const [otp, setOtp] = useState("");
  const [devOtp, setDevOtp] = useState("");
  const [msg, setMsg] = useState({ text: "", type: "error" });
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState(null);
  const timer = useOtpTimer(120);

  const set = (k) => (v) => setF({ ...f, [k]: k === "mobile" ? v.replace(/\D/g, "").slice(0, 10) : v });
  const err = (text, type = "error") => setMsg({ text, type });

  const sendOtp = async () => {
    if (!f.name.trim()) return err("Enter your full name.");
    if (f.mobile.length < 10) return err("Enter a valid 10-digit mobile number.");
    if (f.password.length < 6) return err("Password must be at least 6 characters.");
    if (f.password !== f.confirm) return err("Passwords do not match.");
    setLoading(true); err("");
    try {
      const d = await api(EP.registerSendOtp, { method: "POST", body: { name: f.name.trim(), mobile: f.mobile, password: f.password } });
      setDevOtp(d.development_otp || "");
      setOtp(""); setStep(2); timer.start();
    } catch (e) { err(e.message); }
    setLoading(false);
  };

  const verify = async () => {
    if (otp.length !== 6) return err("Enter the 6-digit OTP.");
    setLoading(true); err("");
    try {
      const d = await api(EP.registerVerify, { method: "POST", body: { name: f.name.trim(), mobile: f.mobile, password: f.password, otp } });
      if (d.success !== true || !d.user) throw new Error("Could not create account.");
      timer.stop(); setCreated(d.user); setStep(3);
    } catch (e) { err(e.message); }
    setLoading(false);
  };

  const copy = async () => {
    await Clipboard.setStringAsync(`Username: ${created?.username}\nUser ID: ${created?.user_id}`);
    err("Account details copied.", "success");
  };

  return (
    <SafeAreaView className="flex-1 bg-authBg">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <ScrollView contentContainerClassName="flex-grow justify-center p-4" keyboardShouldPersistTaps="handled">
          <View className="rounded-3xl border border-white/15 bg-[#0d1527]/95 px-6 pt-7 pb-7">
           {/* Small Logo Only - No Brand Name */}
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
            <View className="mb-7"><Brand size={32} /></View>

            {step === 1 && (
              <>
                <View className="items-center mb-6">
                  
                  <Text className="text-[#9ba8c1] text-[13px] text-center mt-2.5">Create your account and connect with real people.</Text>
                </View>
                <View className="gap-4">
                  <Field label="Full Name" icon="person-outline" placeholder="Enter your name" value={f.name} onChangeText={set("name")} maxLength={100} />
                  <Field label="Mobile Number" icon="phone-portrait-outline" placeholder="Enter mobile number" keyboardType="phone-pad" value={f.mobile} onChangeText={set("mobile")} />
                  <Field label="Password" icon="lock-closed-outline" placeholder="Create password" secure value={f.password} onChangeText={set("password")} autoCapitalize="none" />
                  <Field label="Confirm Password" icon="checkmark" placeholder="Confirm password" secure value={f.confirm} onChangeText={set("confirm")} autoCapitalize="none" />
                  <Banner msg={msg.text} type={msg.type} />
                  <PrimaryButton title="Get OTP" onPress={sendOtp} loading={loading} />
                </View>
                <View className="flex-row justify-center gap-1.5 mt-6">
                  <Text className="text-[#9ba8c1] text-[12.5px]">Already have an account?</Text>
                  <Pressable onPress={() => navigation.navigate("Login")}><Text className="text-brandLight text-[12.5px] font-bold">Login</Text></Pressable>
                </View>
              </>
            )}

            {step === 2 && (
              <>
                <View className="items-center mb-6">
                  <Text className="text-white text-[26px] font-bold">Verify your <Text className="text-brandLight">mobile</Text></Text>
                  <Text className="text-[#9ba8c1] text-[13px] text-center mt-2.5">Enter the 6-digit OTP sent to your mobile number.</Text>
                </View>
                <Text className="text-[#9ba8c1] text-[13px] text-center mb-5">OTP is valid for <Text className="text-brandLight font-bold">{timer.text}</Text></Text>
                <TextInput value={otp} onChangeText={(v) => setOtp(v.replace(/\D/g, "").slice(0, 6))}
                  keyboardType="number-pad" maxLength={6} placeholder="000000" placeholderTextColor="#52627f"
                  className="h-[66px] rounded-[14px] border border-[#598cff]/45 bg-authSurface text-white text-center text-[25px] font-bold mb-5"
                  style={{ letterSpacing: 10 }} />
                {devOtp ? (
                  <View className="flex-row justify-between items-center p-3 mb-4 rounded-xl border border-dashed border-pink/45 bg-pink/10">
                    <Text className="text-[#d5c3df] text-xs">Development OTP</Text>
                    <Text className="text-[#ffb0ed] text-[17px] font-bold">{devOtp}</Text>
                  </View>
                ) : null}
                <View className="gap-3">
                  <Banner msg={msg.text} type={msg.type} />
                  <PrimaryButton title="Verify OTP" onPress={verify} loading={loading} />
                  <SecondaryButton title="Resend OTP" disabled={!timer.expired} onPress={sendOtp} />
                  <Pressable onPress={() => { timer.stop(); err(""); setStep(1); }} className="items-center p-2">
                    <Text className="text-brandLight text-[13px] font-semibold">← Change details</Text>
                  </Pressable>
                </View>
              </>
            )}

            {step === 3 && (
              <View className="items-center">
                <View className="w-[68px] h-[68px] rounded-full items-center justify-center mb-5 border border-success/35 bg-success/10">
                  <Text className="text-success text-4xl font-bold">✓</Text>
                </View>
                <Text className="text-white text-[26px] font-bold">Account <Text className="text-success">Created</Text></Text>
                <Text className="text-[#9ba8c1] text-[13px] text-center mt-2.5 mb-6">Welcome to UtaNexa. Your account has been created successfully.</Text>
                <View className="self-stretch rounded-2xl border border-white/15 bg-authSurface px-4 mb-4">
                  <View className="py-3.5"><Text className="text-[#9ba8c1] text-[11.5px] mb-1.5">Username</Text><Text className="text-[#eef3ff] text-sm font-bold">{created?.username || "-"}</Text></View>
                  <View className="py-3.5 border-t border-white/15"><Text className="text-[#9ba8c1] text-[11.5px] mb-1.5">User ID</Text><Text className="text-[#eef3ff] text-sm font-bold">{created?.user_id || "-"}</Text></View>
                </View>
                <View className="self-stretch gap-3">
                  <Banner msg={msg.text} type={msg.type} />
                  <SecondaryButton title="Copy Account Details" onPress={copy} />
                  <PrimaryButton title="Continue to Login" onPress={() => navigation.navigate("Login")} />
                </View>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
