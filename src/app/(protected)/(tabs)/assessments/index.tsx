import { useState } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Pressable, Text, View, Modal, Alert, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";

import { AssessmentHeroCard } from "@/components/AssessmentHeroCard";
import { AppHeader } from "@/components/AppHeader";
import { Screen } from "@/components/Screen";
import { services } from "@/data/mockData";

export default function AssessmentsTabScreen() {
  const [modalVisible, setModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pcosServiceRoute, setPcosServiceRoute] = useState("");

  const assessmentServices = services.filter((service) =>
    ["pcos", "bmi", "symptoms", "hormonal"].includes(service.id),
  );

  // Card click handle karne ka function
  const handleServicePress = (serviceId: string, route: string) => {
    if (serviceId === "pcos") {
      setPcosServiceRoute(route);
      setModalVisible(true); // PCOS card click par selection popup khulega
    } else {
      router.push(route as never); // Baqi tools pehle ki tarah direct khulenge
    }
  };

  // Gallery se ultrasound select karne aur backend par bhejne ka function
  const handleUltrasoundScan = async () => {
    setModalVisible(false);

    // Gallery permission check
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert("Permission Required", "Please allow gallery access to upload an ultrasound image.");
      return;
    }

    // Gallery open karna
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 1,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) return;

    setLoading(true);
    const selectedImage = result.assets[0];

    // Multi-part form data banana backend API ke liye
    const formData = new FormData();
    formData.append("image", {
      uri: selectedImage.uri,
      name: "ultrasound.jpg",
      type: "image/jpeg",
    } as any);

    try {
      // Aap ka live localtunnel server link
    const response = await fetch("https://olive-ducks-shine.loca.lt/predict", {
        method: "POST",
        body: formData,
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      const data = await response.json();
      setLoading(false);

      if (data.status === "success") {
        // Direct jump to final recommendations screen with AI results
        router.push({
          pathname: "/(protected)/assessments/final-recommendations",
          params: { aiResult: data.result, aiConfidence: data.confidence },
        } as never);
      } else {
        Alert.alert("Analysis Error", data.message || "Failed to process the image.");
      }
    } catch (error) {
      setLoading(false);
      Alert.alert("Connection Error", "Could not connect to the AI server. Make sure your backend is running.");
    }
  };

  return (
    <Screen contentStyle={{ paddingHorizontal: 16, gap: 18 }}>
      <AppHeader
        subtitle="Structured health screening tools with clear, practical outputs."
        title="Insights"
      />

      <AssessmentHeroCard
        description="Select a screening workflow to review risk indicators and generate guided next steps."
        eyebrow="Assessment Center"
        icon="analytics-outline"
        title="Clinical Insights"
      />

      {/* Loading Overlay jab AI processing ho rahi ho */}
      {loading && (
        <View className="absolute bottom-0 left-0 right-0 top-0 z-50 items-center justify-center bg-black/40">
          <View className="rounded-2xl bg-white p-6 items-center shadow-lg">
            <ActivityIndicator color="#CC5C89" size="large" />
            <Text className="mt-3 text-[14px] font-medium text-healthcare-text">AI is analyzing ultrasound image...</Text>
          </View>
        </View>
      )}

      <View className="rounded-[24px] border border-[#ECD6E1] bg-white/80 p-4">
        <View className="mb-4 flex-row items-center justify-between">
          <View>
            <Text className="text-[17px] font-semibold text-healthcare-text">Choose a workflow</Text>
            <Text className="mt-1 text-[13px] leading-5 text-healthcare-muted">
              Start with the tool that matches the question you want answered today.
            </Text>
          </View>
          <View className="rounded-full border border-[#EFD7E3] bg-[#FFF6FA] px-3 py-1">
            <Text className="text-[11px] font-semibold text-healthcare-primary">
              {assessmentServices.length} tools
            </Text>
          </View>
        </View>

        <View className="flex-row flex-wrap justify-between gap-y-4">
          {assessmentServices.map((service) => (
            <Pressable
              key={service.id}
              accessibilityRole="button"
              className="w-[48.5%] rounded-[22px] border border-[#EFD7E3] bg-white p-4"
              onPress={() => handleServicePress(service.id, service.route)}
            >
              <LinearGradient
                colors={service.gradientColors || ["#CC5C89", "#E7A1BE"]}
                end={{ x: 1, y: 1 }}
                start={{ x: 0, y: 0 }}
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons
                  color="#FFFFFF"
                  name={service.icon as keyof typeof Ionicons.glyphMap}
                  size={18}
                />
              </LinearGradient>

              <Text className="mt-3 text-[15px] font-semibold leading-5 text-healthcare-text" numberOfLines={2}>
                {service.title}
              </Text>
              <Text className="mt-1.5 text-[12px] leading-[18px] text-healthcare-muted" numberOfLines={2}>
                {service.description}
              </Text>

              <View className="mt-3 flex-row items-center justify-between border-t border-[#F0DCE6] pt-3">
                <Text className="text-[12px] font-semibold text-healthcare-primary">Open tool</Text>
                <View className="h-8 w-8 items-center justify-center rounded-full bg-[#FAEDF3]">
                  <Ionicons color="#CC5C89" name="chevron-forward" size={15} />
                </View>
              </View>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Independent Selection Popup (Bottom Modal) */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-white rounded-t-[32px] p-6 border-t border-[#ECD6E1] shadow-2xl">
            <View className="items-center mb-4">
              <View className="w-12 h-1.5 bg-gray-300 rounded-full mb-4" />
              <Text className="text-[19px] font-bold text-healthcare-text text-center">PCOS Screening Method</Text>
              <Text className="text-[13px] text-healthcare-muted text-center mt-1 px-4">
                Choose how you would like to screen for PCOS risk and get insights.
              </Text>
            </View>

            {/* Option A: Gallery Upload (Our Extra AI Feature) */}
            <Pressable
              className="flex-row items-center bg-[#FAEDF3] border border-[#EFD7E3] p-4 rounded-[20px] mb-3.5"
              onPress={handleUltrasoundScan}
            >
              <View className="h-11 w-11 bg-[#CC5C89] rounded-xl items-center justify-center mr-4">
                <Ionicons color="#FFFFFF" name="image-outline" size={22} />
              </View>
              <View className="flex-1">
                <Text className="text-[15px] font-bold text-healthcare-text">Instant Ultrasound Scan (AI)</Text>
                <Text className="text-[12px] text-healthcare-muted mt-0.5">Please upload your ovarian ultrasound image to screen for PCOS.</Text>
              </View>
              <Ionicons color="#CC5C89" name="chevron-forward" size={18} />
            </Pressable>

            {/* Option B: Manual Flow (Aap ka purana 4-step wizard bilkul same chalega) */}
            <Pressable
              className="flex-row items-center bg-white border border-gray-200 p-4 rounded-[20px] mb-5"
              onPress={() => {
                setModalVisible(false);
                router.push(pcosServiceRoute as never);
              }}
            >
              <View className="h-11 w-11 bg-gray-100 rounded-xl items-center justify-center mr-4">
                <Ionicons color="#666" name="clipboard-outline" size={22} />
              </View>
              <View className="flex-1">
                <Text className="text-[15px] font-bold text-healthcare-text">Manual 4-Step Questionnaire</Text>
                <Text className="text-[12px] text-healthcare-muted mt-0.5">Enter symptoms, metabolic metrics, and lab results manually.</Text>
              </View>
              <Ionicons color="#666" name="chevron-forward" size={18} />
            </Pressable>

            {/* Cancel Button */}
            <Pressable
              className="items-center justify-center py-3.5 rounded-[18px] bg-gray-100"
              onPress={() => setModalVisible(false)}
            >
              <Text className="text-[14px] font-semibold text-gray-600">Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}