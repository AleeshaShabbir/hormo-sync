import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import { AssessmentHeroCard } from "@/components/AssessmentHeroCard";
import { AssessmentRouteHeader } from "@/components/AssessmentRouteHeader";
import { CustomButton } from "@/components/CustomButton";
import { FormSection } from "@/components/FormSection";
import { ResultCard } from "@/components/ResultCard";
import { Screen } from "@/components/Screen";
import { pcosSchema } from "@/app/(protected)/assessments/pcosForm.schema";
import { predictionService, normalizePredictionResponse, toAssessmentResult, isApiError } from "@/services/predictions";
import { useAppStore } from "@/store/appStore";
import { theme } from "@/theme";
import { NormalizedPredictionResult } from "@/types/api";
import { buildPcosPredictionPayload } from "@/utils/predictionPayload";

type AsyncState<T> =
  | { status: "idle" | "loading" }
  | { status: "success"; data: T }
  | { status: "error"; message: string; statusCode?: number };

const isReadyForPrediction = (featureCount: number) => featureCount > 0;

const getPredictionErrorMeta = (statusCode?: number) => {
  if (statusCode === 422) {
    return {
      title: "Check your values",
      description: "Some entries were rejected. Review the form and try again.",
      alertTitle: "Check your values",
      alertMessage: "Some entries were rejected.",
      icon: "create-outline" as const,
    };
  }

  if (statusCode === 503) {
    return {
      title: "Service unavailable",
      description: "The PCOS model is unavailable right now. Please retry shortly.",
      alertTitle: "Service unavailable",
      alertMessage: "The PCOS model is unavailable right now.",
      icon: "cloud-offline-outline" as const,
    };
  }

  if (statusCode === 0) {
    return {
      title: "No connection",
      description: "We could not reach the backend. Check the server and API URL.",
      alertTitle: "No connection",
      alertMessage: "We could not reach the backend.",
      icon: "wifi-outline" as const,
    };
  }

  return {
    title: "Prediction failed",
    description: "Something went wrong. Please try again.",
    alertTitle: "Prediction failed",
    alertMessage: "Something went wrong.",
    icon: "alert-circle-outline" as const,
  };
};

const PredictionSummary = ({ result }: { result: NormalizedPredictionResult }) => {
  const assessment = toAssessmentResult(result);

  return (
    <View style={styles.predictionStack}>
      <LinearGradient
        colors={["#FDF2F7", "#F9E7F0", "#FFFFFF"]}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={styles.heroGradient}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroCopy}>
              <Text style={styles.eyebrow}>PCOS Prediction</Text>
              <Text style={styles.heroTitle}>{result.rawLabel}</Text>
              <Text style={styles.heroDescription}>{assessment.summary}</Text>
            </View>
            <View style={styles.heroIconWrap}>
              <Ionicons color={theme.colors.primary} name="sparkles-outline" size={22} />
            </View>
          </View>
        </View>
      </LinearGradient>

      <ResultCard result={assessment} />

    </View>
  );
};

const FancyLoader = () => (
  <LinearGradient
    colors={["#FFF4F8", "#F8E8F0", "#FFFFFF"]}
    end={{ x: 1, y: 1 }}
    start={{ x: 0, y: 0 }}
    style={styles.loaderGradient}
  >
    <View style={styles.loaderCard}>
      <View style={styles.loaderOrbRow}>
        <View style={styles.loaderOrb}>
          <Ionicons color={theme.colors.primary} name="analytics-outline" size={18} />
        </View>
        <View style={styles.loaderOrbCenter}>
          <ActivityIndicator color={theme.colors.primary} size="large" />
        </View>
        <View style={styles.loaderOrb}>
          <Ionicons color={theme.colors.primary} name="sparkles-outline" size={18} />
        </View>
      </View>
      <Text style={styles.loaderTitle}>Preparing your final recommendation</Text>
      <Text style={styles.loaderDescription}>
        Sending your assessment to the PCOS model and preparing a cleaner summary.
      </Text>
      <View style={styles.loaderSteps}>
        <View style={styles.loaderStepChip}>
          <Text style={styles.loaderStep}>Checking values</Text>
        </View>
        <View style={styles.loaderStepChip}>
          <Text style={styles.loaderStep}>Running model</Text>
        </View>
        <View style={styles.loaderStepChip}>
          <Text style={styles.loaderStep}>Formatting result</Text>
        </View>
      </View>
    </View>
  </LinearGradient>
);

const InlineAlertSheet = ({
  visible,
  title,
  message,
  onRetry,
  onReview,
  onClose,
}: {
  visible: boolean;
  title: string;
  message: string;
  onRetry: () => void;
  onReview: () => void;
  onClose: () => void;
}) => (
  <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
    <View style={styles.alertOverlay}>
      <View style={styles.alertCard}>
        <View style={styles.alertIconWrap}>
          <Ionicons color={theme.colors.danger} name="alert-circle-outline" size={22} />
        </View>
        <Text style={styles.alertTitle}>{title}</Text>
        <Text style={styles.alertMessage}>{message}</Text>
        <View style={styles.alertActions}>
          <CustomButton label="Retry" onPress={onRetry} />
          <CustomButton label="Review" onPress={onReview} variant="secondary" />
          <Pressable onPress={onClose} style={styles.alertDismiss}>
            <Text style={styles.alertDismissText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </View>
  </Modal>
);

export default function FinalRecommendationsScreen() {
  const params = useLocalSearchParams<{ aiResult?: string; aiConfidence?: string }>();
  
  const pcosForm = useAppStore((state) => state.pcosForm);
  const parsedValues = useMemo(() => pcosSchema.safeParse(pcosForm), [pcosForm]);
  const pcosPayload = useMemo(
    () => (parsedValues.success ? buildPcosPredictionPayload(parsedValues.data) : null),
    [parsedValues],
  );

  const [pcosState, setPcosState] = useState<AsyncState<NormalizedPredictionResult>>({ status: "idle" });
  const [alertVisible, setAlertVisible] = useState(false);

  const featureCount = pcosPayload ? Object.keys(pcosPayload.features).length : 0;

  const runPrediction = async () => {
    // 📷 Check karein ke agar direct Ultrasound Scan ka AI data pichli screen se aaya hai
    if (params.aiResult) {
      const isPositive = params.aiResult === "PCOS Positive";
      setPcosState({
        status: "success",
        data: {
          rawLabel: isPositive ? "PCOS Positive" : "Normal",
          probability: parseFloat(params.aiConfidence || "1.0"),
          interpretation: isPositive 
            ? "Ultrasound scan shows patterns consistent with PCOS. Clinical review recommended."
            : "Ultrasound scan shows a normal ovarian profile structure.",
          // Yeh required structures hain taake aap ka ResultCard `.map` par crash na kare
          summary: isPositive 
            ? "Pattern suggests presence of polycystic ovarian structures." 
            : "No significant polycystic markers detected on ultrasound image.",
          recommendations: isPositive 
            ? ["Consult your gynecologist for ultrasound verification.", "Discuss follicular metrics and cycle patterns with a professional."]
            : ["Continue periodic healthy wellness tracking.", "Maintain baseline dynamic pelvic health profile."],
          guidelines: isPositive 
            ? ["Focus on low-glycemic nutrition options.", "Incorporate structured aerobic/resistance core sessions."]
            : ["Keep standard balanced diet guidelines.", "Engage in routine general physical activity."],
          priorityActions: isPositive 
            ? ["Schedule clinical consultation.", "Track cycles closely over next 2-4 weeks."]
            : ["Log your daily metrics normally.", "Retake screening only if new symptoms arise."]
        } as any,
      });
      return;
    }

    // 📝 Purana Manual Workflow Logic
    if (!pcosPayload || !isReadyForPrediction(featureCount)) {
      return;
    }

    setPcosState({ status: "loading" });

    try {
      const pcosResult = await predictionService.predictPcos(pcosPayload);
      setPcosState({
        status: "success",
        data: normalizePredictionResponse(pcosResult, "PCOS prediction"),
      });
    } catch (error) {
      setPcosState({
        status: "error",
        message: isApiError(error) ? error.message : "Unable to fetch the PCOS prediction.",
        statusCode: isApiError(error) ? error.status : undefined,
      });
    }
  };

  useEffect(() => {
    void runPrediction();
  }, [featureCount, pcosPayload, params.aiResult]);

  useEffect(() => {
    if (pcosState.status !== "error") {
      return;
    }

    setAlertVisible(true);
  }, [pcosState]);

  return (
    <Screen contentStyle={styles.content}>
      <InlineAlertSheet
        visible={alertVisible && pcosState.status === "error"}
        title={pcosState.status === "error" ? getPredictionErrorMeta(pcosState.statusCode).alertTitle : ""}
        message={pcosState.status === "error" ? pcosState.message : ""}
        onRetry={() => {
          setAlertVisible(false);
          void runPrediction();
        }}
        onReview={() => {
          setAlertVisible(false);
          router.push("/assessments/basic-health");
        }}
        onClose={() => setAlertVisible(false)}
      />

      <AssessmentRouteHeader title="Final Recommendations" />

      <AssessmentHeroCard
        description="Your assessment is complete. Review a clearer PCOS prediction result and the next-step guidance."
        eyebrow="PCOS Review"
        icon="medical-outline"
        title="Final PCOS Recommendation"
      />

      {pcosState.status !== "success" ? (
        <FormSection>
          <View style={styles.noteRow}>
            <View style={styles.noteIconWrap}>
              <Ionicons color={theme.colors.primary} name="information-circle-outline" size={18} />
            </View>
            <View style={styles.noteCopy}>
              <Text style={styles.noteTitle}>Live prediction needs the API</Text>
              <Text style={styles.noteText}>
                If the backend is unavailable, the final PCOS result will stay unavailable until the API responds.
              </Text>
            </View>
          </View>
        </FormSection>
      ) : null}

      {(!parsedValues.success || !isReadyForPrediction(featureCount)) && !params.aiResult ? (
        <FormSection>
          <Text style={styles.cardTitle}>Assessment data incomplete</Text>
          <Text style={styles.incompleteCopy}>
            Complete the required PCOS assessment inputs before requesting a prediction.
          </Text>
        </FormSection>
      ) : null}

      {pcosState.status === "loading" && (parsedValues.success || params.aiResult) ? <FancyLoader /> : null}

      {pcosState.status === "success" ? <PredictionSummary result={pcosState.data} /> : null}

      <View style={styles.ctaStack}>
        <Pressable
          disabled={pcosState.status === "loading"}
          onPress={() => void runPrediction()}
          style={[
            styles.retryButton,
            pcosState.status === "loading" && styles.retryButtonDisabled,
          ]}
        >
          {pcosState.status === "loading" ? (
            <ActivityIndicator color={theme.colors.primary} size="small" />
          ) : (
            <Text style={styles.retryButtonText}>Retry Prediction</Text>
          )}
        </Pressable>
        <CustomButton
          label="Go to Insights"
          onPress={() => router.replace("/assessments")}
        />
        <Pressable
          onPress={() => router.replace("/assessments/basic-health")}
          style={styles.retakeButton}
        >
          <Ionicons color={theme.colors.primary} name="refresh-outline" size={16} />
          <Text style={styles.retakeButtonText}>Retake 4-Step Assessment</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: theme.spacing.xxxl,
  },
  predictionStack: {
    gap: theme.spacing.xl,
  },
  heroGradient: {
    borderRadius: 24,
    padding: 2,
  },
  heroCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 22,
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  heroTopRow: {
    flexDirection: "row",
    gap: theme.spacing.md,
    alignItems: "flex-start",
  },
  heroCopy: {
    flex: 1,
  },
  eyebrow: {
    ...theme.typography.small,
    color: theme.colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  heroTitle: {
    ...theme.typography.title1,
    color: theme.colors.text,
    marginTop: theme.spacing.xs,
  },
  heroDescription: {
    ...theme.typography.body,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.sm,
  },
  heroIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F7E7EF",
  },
  cardTitle: {
    ...theme.typography.title3,
    color: theme.colors.text,
  },
  loaderGradient: {
    borderRadius: 24,
    padding: 2,
  },
  loaderCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 22,
    padding: theme.spacing.xl,
    gap: theme.spacing.lg,
    alignItems: "center",
    overflow: "hidden",
  },
  loaderOrbRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
  },
  loaderOrb: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FCE7F0",
  },
  loaderOrbCenter: {
    width: 78,
    height: 78,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F9DCE8",
    borderWidth: 1,
    borderColor: "#F2C7D8",
  },
  loaderTitle: {
    ...theme.typography.title2,
    color: theme.colors.text,
    textAlign: "center",
  },
  loaderDescription: {
    ...theme.typography.body,
    color: theme.colors.textMuted,
    textAlign: "center",
  },
  loaderSteps: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: theme.spacing.sm,
  },
  loaderStepChip: {
    backgroundColor: "#FCEAF2",
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: "#F4D0DF",
  },
  loaderStep: {
    ...theme.typography.small,
    color: theme.colors.primary,
    textAlign: "center",
  },
  incompleteCopy: {
    ...theme.typography.body,
    color: theme.colors.textMuted,
  },
  noteRow: {
    flexDirection: "row",
    gap: theme.spacing.md,
    alignItems: "flex-start",
  },
  noteIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F7E7EF",
  },
  noteCopy: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  noteTitle: {
    ...theme.typography.bodyStrong,
    color: theme.colors.text,
  },
  noteText: {
    ...theme.typography.body,
    color: theme.colors.textMuted,
  },
  ctaStack: {
    marginTop: theme.spacing.sm,
    gap: theme.spacing.md,
  },
  retryButton: {
    minHeight: 54,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: "#DDAFC2",
    backgroundColor: "#FFF9FC",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing.xl,
    ...theme.shadows.card,
  },
  retryButtonDisabled: {
    opacity: 0.7,
  },
  retryButtonText: {
    ...theme.typography.bodyStrong,
    color: theme.colors.primary,
  },
  retakeButton: {
    minHeight: 54,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: "#E8C8D6",
    backgroundColor: "#FFF7FA",
    paddingHorizontal: theme.spacing.xl,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
  },
  retakeButtonText: {
    ...theme.typography.bodyStrong,
    color: theme.colors.primary,
  },
  alertOverlay: {
    flex: 1,
    backgroundColor: "rgba(38, 24, 33, 0.28)",
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing.xl,
  },
  alertCard: {
    width: "100%",
    borderRadius: 24,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
    alignItems: "center",
    ...theme.shadows.card,
  },
  alertIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FDEAEC",
  },
  alertTitle: {
    ...theme.typography.title3,
    color: theme.colors.text,
    textAlign: "center",
  },
  alertMessage: {
    ...theme.typography.body,
    color: theme.colors.textMuted,
    textAlign: "center",
  },
  alertActions: {
    width: "100%",
    gap: theme.spacing.sm,
  },
  alertDismiss: {
    alignSelf: "center",
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
  },
  alertDismissText: {
    ...theme.typography.bodyStrong,
    color: theme.colors.textMuted,
  },
});