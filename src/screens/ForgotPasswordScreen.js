import React, { useState } from "react";
import { View, Text, Pressable, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api/client";
import { EP } from "../api/endpoints";
import useOtpTimer from "../components/useOtpTimer";
import { Brand, Field, Banner, PrimaryButton, SecondaryButton } from "../components/ui";
import logo from "../../assets/images/utanexa-logo.jpeg";
import { Image } from "react-native";

export default function ForgotPasswordScreen({ navigation }) {
  const [step, setStep] = useState(1);
  const [identifier, setIdentifier] = useState("");
  const [otp, setOtp] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [devOtp, setDevOtp] = useState("");
  const [msg, setMsg] = useState({ text: "", type: "error" });
  const [loading, setLoading] = useState(false);
  const timer = useOtpTimer(120);
  const err = (text, type = "error") => setMsg({ text, type });

  const send = async () => {
    if (!identifier.trim()) return err("Enter your username or mobile number.");
    setLoading(true); err("");
    try {
      const d = await api(EP.forgotSendOtp, { method: "POST", body: { identifier: identifier.trim() } });
      setDevOtp(d.development_otp || ""); setOtp(""); setStep(2); timer.start();
    } catch (e) { err(e.message); }
    setLoading(false);
  };

  const reset = async () => {
    if (otp.length !== 6) return err("Enter the 6-digit OTP.");
    if (pw.length < 6) return err("Password must be at least 6 characters.");
    if (pw !== pw2) return err("Passwords do not match.");
    setLoading(true); err("");
    try {
      await api(EP.forgotReset, { method: "POST", body: { identifier: identifier.trim(), otp, new_password: pw, confirm_password: pw2 } });
      timer.stop(); setStep(3);
    } catch (e) { err(e.message); }
    setLoading(false);
  };

  const Back = ({ onPress }) => (
    <Pressable onPress={onPress} className="w-10 h-10 rounded-xl border border-[#29323d] bg-[#11171e] items-center justify-center mb-4">
      <Ionicons name="arrow-back" size={20} color="#dce2e8" />
    </Pressable>
  );

  return (
    <SafeAreaView className="flex-1 bg-[#090c10]">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <ScrollView contentContainerClassName="flex-grow justify-center px-7 py-8" keyboardShouldPersistTaps="handled">
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
          <View className="mb-10"><Brand size={42} /></View>

          {step === 1 && (
            <>
              <Back onPress={() => navigation.goBack()} />
              <Text className="text-[#f4f5f7] text-[32px] font-bold">Forgot <Text className="text-[#159cff]">Password?</Text></Text>
              <Text className="text-[#8d96a3] text-[15px] leading-6 mt-3 mb-8">Enter your username or mobile number to reset your password.</Text>
              <View className="gap-5">
                <Field label="Username or Mobile" icon="person-outline" placeholder="Username or mobile" value={identifier} onChangeText={setIdentifier} autoCapitalize="none" />
                <Banner msg={msg.text} type={msg.type} />
                <PrimaryButton title="Get OTP" onPress={send} loading={loading} />
              </View>
            </>
          )}

          {step === 2 && (
            <>
              <Back onPress={() => { timer.stop(); err(""); setStep(1); }} />
              <Text className="text-[#f4f5f7] text-[32px] font-bold">Verify <Text className="text-[#159cff]">OTP</Text></Text>
              <Text className="text-[#8d96a3] text-[15px] leading-6 mt-3 mb-8">Enter the 6-digit OTP and create your new password.</Text>
              <View className="gap-5">
                <Field label="OTP" icon="keypad-outline" placeholder="Enter 6-digit OTP" keyboardType="number-pad" maxLength={6} value={otp} onChangeText={(v) => setOtp(v.replace(/\D/g, ""))} />
                {devOtp ? (
                  <View className="items-center p-4 rounded-2xl border border-[#159cff]/20 bg-[#159cff]/5">
                    <Text className="text-[#8da0b3] text-xs font-semibold uppercase">Development OTP</Text>
                    <Text className="text-[#159cff] text-[26px] font-extrabold mt-1.5" style={{ letterSpacing: 7 }}>{devOtp}</Text>
                  </View>
                ) : null}
                <View className="flex-row justify-between">
                  <Text className="text-[#747e89] text-[13px]">OTP expires in</Text>
                  <Text className={`text-sm font-bold ${timer.expired ? "text-[#ff7c88]" : "text-[#159cff]"}`}>{timer.text}</Text>
                </View>
                <Field label="New Password" icon="lock-closed-outline" placeholder="New password" secure value={pw} onChangeText={setPw} autoCapitalize="none" />
                <Field label="Confirm Password" icon="lock-closed-outline" placeholder="Confirm new password" secure value={pw2} onChangeText={setPw2} autoCapitalize="none" />
                <Banner msg={msg.text} type={msg.type} />
                <PrimaryButton title="Reset Password" onPress={reset} loading={loading} />
                <SecondaryButton title="Resend OTP" disabled={!timer.expired} onPress={send} />
              </View>
            </>
          )}

          {step === 3 && (
            <View className="items-center">
              <View className="w-[68px] h-[68px] rounded-full items-center justify-center mb-5 border border-success/35 bg-success/10">
                <Text className="text-success text-4xl">✓</Text>
              </View>
              <Text className="text-[#f4f5f7] text-[30px] font-bold">Password <Text className="text-[#159cff]">Reset!</Text></Text>
              <Text className="text-[#8d96a3] text-[15px] text-center mt-3 mb-8">Your password has been changed successfully. You can now login with your new password.</Text>
              <View className="self-stretch"><PrimaryButton title="Continue to Login" onPress={() => navigation.navigate("Login")} /></View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
