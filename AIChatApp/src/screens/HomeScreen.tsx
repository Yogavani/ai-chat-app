import React, { useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet ,TouchableOpacity, Button} from "react-native";
import { getUsers } from "../services/userService";
import { RootStackParamList, User } from "../navigation/navigation";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import AsyncStorage from "@react-native-async-storage/async-storage";

type HomeScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  "Home"
>;
type Props = {
    navigation: HomeScreenNavigationProp;
    onLogoutSuccess: () => void;
  };

const HomeScreen = ({ navigation, onLogoutSuccess } : Props) => {
    const [users, setUsers] = useState<User[]>([]);
    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            const users = await getUsers();
            console.log("Users:", users);
            setUsers(users);
        } catch (error) {
            console.log("Fetch users error:", error);

        }
    };

    const handleLogout = async () => {
        await AsyncStorage.removeItem("token");
        await AsyncStorage.removeItem("userId");
        onLogoutSuccess();
    };

    return (
        <View style={styles.container}>

            <FlatList
                data={users}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => (
                    <TouchableOpacity
                      onPress={() =>
                        navigation.navigate("Chat", {
                          receiverId: item.id,
                          receiverName: item.name
                        })
                      }
                    >
                      <Text style={styles.user}>{item.name}</Text>
                    </TouchableOpacity>
                  )}
            />
            <Button title="Logout" onPress={handleLogout} />
        </View>
    );
};

export default HomeScreen;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 20
    },
    user: {
        fontSize: 18,
        padding: 10,
        borderBottomWidth: 1
    }
});
