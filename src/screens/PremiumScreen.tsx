import React from "react";
import { Alert, Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import { RootStackParamList } from "../navigation/navigation";
import { useAppTheme } from "../theme/ThemeContext";
import { PREMIUM_USER_KEY } from "../constants/premium";
import API from "../services/api";

const PREMIUM_AMOUNT_INR = "10.00";
const MERCHANT_UPI_ID = "yogavanib2002-3@okaxis";
const MERCHANT_NAME = "Chattr Premium";

const PremiumScreen = () => {
  const { colors } = useAppTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [paymentTxnId, setPaymentTxnId] = React.useState("");

  const logPayment = async (status: "pending" | "success", transactionId: string) => {
    const userId = await AsyncStorage.getItem("userId");
    if (!userId) {
      throw new Error("User not logged in");
    }

    await API.post("/payments", {
      user_id: Number(userId),
      amount: Number(PREMIUM_AMOUNT_INR),
      status,
      transaction_id: transactionId
    });
  };

  const activatePremium = async () => {
    try {
      const txnId = paymentTxnId || `UPI-${Date.now()}`;
      await logPayment("success", txnId);
      await AsyncStorage.setItem(PREMIUM_USER_KEY, "true");
      Alert.alert("Premium Activated", "You can now use Voice Agent.");
      navigation.goBack();
    } catch (error) {
      Alert.alert("Payment Failed", "Unable to activate premium right now.");
    }
  };

  const createUpiQuery = (txnId: string) => {
    const params = {
      pa: MERCHANT_UPI_ID,
      pn: MERCHANT_NAME,
      tn: "Voice Agent Premium",
      tr: txnId,
      am: PREMIUM_AMOUNT_INR,
      cu: "INR"
    };
    return Object.entries(params)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join("&");
  };

  const openUpi = async (app: "gpay" | "phonepe" | "any") => {
    try {
      const txnId = `UPI-${Date.now()}`;
      setPaymentTxnId(txnId);
      const query = createUpiQuery(txnId);
      const genericUrl = `upi://pay?${query}`;
      const gpayIntentUrl = `intent://upi/pay?${query}#Intent;scheme=upi;package=com.google.android.apps.nbu.paisa.user;end`;
      const phonepeIntentUrl = `intent://upi/pay?${query}#Intent;scheme=upi;package=com.phonepe.app;end`;
      const urlsToTry =
        app === "gpay"
          ? Platform.OS === "android"
            ? [gpayIntentUrl, `tez://upi/pay?${query}`, genericUrl]
            : [genericUrl]
          : app === "phonepe"
          ? Platform.OS === "android"
            ? [phonepeIntentUrl, `phonepe://pay?${query}`, genericUrl]
            : [genericUrl]
          : [genericUrl];

      let opened = false;
      for (const nextUrl of urlsToTry) {
        try {
          await Linking.openURL(nextUrl);
          opened = true;
          break;
        } catch {
          // try next fallback
        }
      }

      if (!opened) {
        Alert.alert(
          "UPI App Not Found",
          "Please install Google Pay, PhonePe, or another UPI app."
        );
        return;
      }

      Alert.alert(
        "Complete Payment",
        "After successful payment, tap 'I have paid' to unlock premium."
      );
      try {
        await logPayment("pending", txnId);
      } catch {
        // Ignore non-blocking logging failures during app handoff
      }
    } catch (error) {
      Alert.alert("Payment Error", "Unable to open UPI app right now.");
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.heroCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.crownBadge}>
          <Text style={styles.crown}>👑</Text>
        </View>

        <Text style={[styles.title, { color: colors.text }]}>Premium Voice Agent</Text>
        <Text style={[styles.subtitle, { color: colors.secondaryText }]}>
          Unlock unlimited voice chat with AI for just
        </Text>
        <Text style={[styles.price, { color: colors.text }]}>₹{PREMIUM_AMOUNT_INR}</Text>

        <View style={[styles.optionsWrap, { borderColor: colors.border }]}>
          <TouchableOpacity
            activeOpacity={0.88}
            style={[styles.optionRow, { borderBottomColor: colors.border }]}
            onPress={() => openUpi("gpay")}
          >
            <View style={[styles.brandIcon, { backgroundColor: "#1a73e8" }]}>
              <Text style={styles.brandIconText}>G</Text>
            </View>
            <View style={styles.optionTextWrap}>
              <Text style={[styles.optionTitle, { color: colors.text }]}>Google Pay</Text>
              <Text style={[styles.optionSub, { color: colors.secondaryText }]}>Pay instantly with GPay</Text>
            </View>
            <Text style={[styles.chevron, { color: colors.secondaryText }]}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.88}
            style={[styles.optionRow, { borderBottomColor: colors.border }]}
            onPress={() => openUpi("phonepe")}
          >
            <View style={[styles.brandIcon, { backgroundColor: "#5f259f" }]}>
              <Text style={styles.brandIconText}>पे</Text>
            </View>
            <View style={styles.optionTextWrap}>
              <Text style={[styles.optionTitle, { color: colors.text }]}>PhonePe</Text>
              <Text style={[styles.optionSub, { color: colors.secondaryText }]}>Pay with PhonePe app</Text>
            </View>
            <Text style={[styles.chevron, { color: colors.secondaryText }]}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.88}
            style={styles.optionRow}
            onPress={() => openUpi("any")}
          >
            <View style={[styles.brandIcon, { backgroundColor: "#0f766e" }]}>
              <Text style={styles.brandIconText}>₹</Text>
            </View>
            <View style={styles.optionTextWrap}>
              <Text style={[styles.optionTitle, { color: colors.text }]}>Any UPI App</Text>
              <Text style={[styles.optionSub, { color: colors.secondaryText }]}>BHIM, Paytm, UPI scanners</Text>
            </View>
            <Text style={[styles.chevron, { color: colors.secondaryText }]}>›</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          activeOpacity={0.88}
          style={[styles.payButton, { backgroundColor: colors.primary }]}
          onPress={activatePremium}
        >
          <Text style={styles.payButtonText}>I Have Paid, Unlock Premium</Text>
        </TouchableOpacity>

        <Text style={[styles.note, { color: colors.secondaryText }]}>
          Complete payment first, then tap unlock.
        </Text>
      </View>
    </View>
  );
};

export default PremiumScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
    backgroundColor: "#f7f8fb"
  },
  heroCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4
  },
  crownBadge: {
    alignSelf: "center",
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#fff3c4",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10
  },
  crown: {
    fontSize: 26
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center"
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 6
  },
  price: {
    fontSize: 28,
    fontWeight: "900",
    textAlign: "center",
    marginTop: 8,
    marginBottom: 14
  },
  optionsWrap: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: "hidden"
  },
  optionRow: {
    minHeight: 66,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1
  },
  optionTextWrap: {
    flex: 1,
    marginLeft: 10
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: "700"
  },
  optionSub: {
    fontSize: 12,
    marginTop: 2
  },
  brandIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center"
  },
  brandIconText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800"
  },
  chevron: {
    fontSize: 24,
    lineHeight: 24
  },
  payButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14
  },
  payButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700"
  },
  note: {
    marginTop: 10,
    fontSize: 12,
    textAlign: "center"
  }
});
