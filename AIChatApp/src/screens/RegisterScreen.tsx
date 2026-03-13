import React, { useState } from "react";
import { View, TextInput, Button, StyleSheet, Text } from "react-native";
import API from "../services/api";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/navigation";

type HomeScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  "Home"
>;
type Props = {
    navigation: HomeScreenNavigationProp;
  };
  
const RegisterScreen = ({ navigation } : Props) => {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [message, setMessage] = useState("");
    const handleRegister = async () => {
        try {
            const response = await API.post("/register", {
                name,
                email,
                password,
            });

            console.log("Register response:", response.data);

            setMessage("User registered successfully!");

        } catch (error :any) {

            console.log(error.response?.data || error.message);
            setMessage("Registration failed");
        };
    }
    return (
        <View style={styles.container}>

            <TextInput
                placeholder="Name"
                style={styles.input}
                value={name}
                onChangeText={setName}
            />

            <TextInput
                placeholder="Email"
                style={styles.input}
                value={email}
                onChangeText={setEmail}
            />

            <TextInput
                placeholder="Password"
                style={styles.input}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
            />
            <Button title="Register" onPress={handleRegister} />
            {message ? <Text style={styles.message}>{message}</Text> : null}
          <View style={styles.input}>
          <Button
                title="Go to Login"
                onPress={() => navigation.navigate("Login")}
            />
          </View>
        </View>
    );
};

export default RegisterScreen;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: "center",
        padding: 20
    },
    input: {
        borderWidth: 1,
        marginBottom: 10,
        padding: 10
    },
    message: {
        marginTop: 20,
        textAlign: "center",
        color: "green",
    }
});