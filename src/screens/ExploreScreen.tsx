import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Plus } from "lucide-react-native";
import { launchImageLibrary } from "react-native-image-picker";
import Video from "react-native-video";
import { getUsers } from "../services/userService";
import API from "../services/api";
import { useAppTheme } from "../theme/ThemeContext";
import { toAbsoluteImageUrl } from "../utils/image";

type StatusItem = {
  id: number;
  userId?: number;
  name: string;
  time: string;
  caption?: string;
  mediaUrl?: string;
  profileImage?: string;
  viewed?: boolean;
  statusCount?: number;
  statusIds?: number[];
  items?: Array<{
    id: number;
    time: string;
    caption?: string;
    mediaUrl?: string;
  }>;
};

type PickedMediaAsset = {
  uri: string;
  type?: string;
  fileName?: string;
};

const MAX_RING_SEGMENTS = 12;
const RING_SIZE = 50;
const AVATAR_SIZE = 42;
const RING_RADIUS = 23;
const RING_DOT_SIZE = 3;

const AvatarWithStatusRing = ({
  imageUri,
  initial,
  ringColor,
  segmentCount,
  showAddBadge,
  onAddPress,
  colors
}: {
  imageUri: string;
  initial: string;
  ringColor: string;
  segmentCount: number;
  showAddBadge?: boolean;
  onAddPress?: () => void;
  colors: ReturnType<typeof useAppTheme>["colors"];
}) => {
  const normalizedCount = Math.max(0, Math.min(MAX_RING_SEGMENTS, segmentCount));
  const showSegmentedRing = normalizedCount > 0;
  const showSingleRing = normalizedCount === 1;

  const renderSegmentDots = () => {
    if (normalizedCount <= 1) return null;

    const dots: React.ReactNode[] = [];
    const slice = 360 / normalizedCount;
    const gap = Math.min(16, slice * 0.35);

    for (let seg = 0; seg < normalizedCount; seg += 1) {
      const start = seg * slice + gap / 2;
      const end = (seg + 1) * slice - gap / 2;
      const span = Math.max(8, end - start);
      const dotCount = Math.max(4, Math.round(span / 7));

      for (let idx = 0; idx < dotCount; idx += 1) {
        const t = dotCount === 1 ? 0 : idx / (dotCount - 1);
        const angle = start + span * t;
        const radians = ((angle - 90) * Math.PI) / 180;
        const cx = RING_SIZE / 2 + RING_RADIUS * Math.cos(radians);
        const cy = RING_SIZE / 2 + RING_RADIUS * Math.sin(radians);

        dots.push(
          <View
            key={`seg-${seg}-dot-${idx}`}
            style={[
              styles.segmentDot,
              {
                left: cx - RING_DOT_SIZE / 2,
                top: cy - RING_DOT_SIZE / 2,
                backgroundColor: ringColor
              }
            ]}
          />
        );
      }
    }

    return dots;
  };

  return (
    <View style={styles.avatarRingWrap}>
      {showSegmentedRing ? showSingleRing ? (
        <View style={[styles.avatarRing, { borderColor: ringColor, borderStyle: "solid" }]} />
      ) : (
        renderSegmentDots()
      ) : (
        <View style={[styles.avatarRing, { borderColor: colors.border, borderStyle: "solid" }]} />
      )}

      <View style={styles.avatarCenter}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatarFallback, { backgroundColor: colors.chipBackground }]}>
            <Text style={[styles.avatarInitial, { color: colors.primary }]}>{initial}</Text>
          </View>
        )}
      </View>

      {showAddBadge ? (
        <TouchableOpacity
          style={[styles.addBadge, { backgroundColor: colors.primary }]}
          activeOpacity={0.85}
          onPress={onAddPress}
        >
          <Plus size={11} color="#fff" strokeWidth={3} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const StatusRow = ({
  item,
  colors,
  onPress
}: {
  item: StatusItem;
  colors: ReturnType<typeof useAppTheme>["colors"];
  onPress?: () => void;
}) => {
  const imageUri = toAbsoluteImageUrl(item.profileImage || "");
  const ringColor = item.viewed ? "#9ca3af" : "#22c55e";

  return (
    <TouchableOpacity style={[styles.row, { borderBottomColor: colors.border }]} onPress={onPress}>
      <AvatarWithStatusRing
        imageUri={imageUri}
        initial={item.name.trim().charAt(0).toUpperCase()}
        ringColor={ringColor}
        segmentCount={item.statusCount || 1}
        colors={colors}
      />

      <View style={styles.rowTextWrap}>
        <Text style={[styles.nameText, { color: colors.text }]}>{item.name}</Text>
        <Text style={[styles.timeText, { color: colors.secondaryText }]} numberOfLines={1}>
          {item.caption ? `${item.time} • ${item.caption}` : item.time}
          {item.statusCount && item.statusCount > 1 ? ` • ${item.statusCount} updates` : ""}
        </Text>
      </View>
      {item.statusCount && item.statusCount > 1 ? (
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{item.statusCount}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
};

type BackendStatus = {
  id: number;
  user_id: number;
  media_url?: string;
  text_content?: string;
  created_at?: string;
  expires_at?: string;
};

type StatusView = {
  id: number;
  status_id: number;
  viewer_id: number;
  viewed_at?: string;
  viewer_name?: string;
  viewer_avatar?: string;
};

const STATUS_POSTS_ENDPOINTS = ["/status-posts", "/api/status-posts"];

const ExploreScreen = () => {
  const { colors } = useAppTheme();
  const [recentStatuses, setRecentStatuses] = useState<StatusItem[]>([]);
  const [viewedStatuses, setViewedStatuses] = useState<StatusItem[]>([]);
  const [myStatus, setMyStatus] = useState<StatusItem | null>(null);
  const [myStatusList, setMyStatusList] = useState<StatusItem[]>([]);
  const [myStatusCount, setMyStatusCount] = useState(0);
  const [myStatusIndex, setMyStatusIndex] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [statusModalVisible, setStatusModalVisible] = useState(false);
  const [myStatusViewerVisible, setMyStatusViewerVisible] = useState(false);
  const [otherStatusViewerVisible, setOtherStatusViewerVisible] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<StatusItem | null>(null);
  const [selectedStatusIndex, setSelectedStatusIndex] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [pickedMediaUrl, setPickedMediaUrl] = useState("");
  const [pickedMediaAsset, setPickedMediaAsset] = useState<PickedMediaAsset | null>(null);
  const [pickedMediaKind, setPickedMediaKind] = useState<"image" | "video">("image");
  const [previewError, setPreviewError] = useState("");
  const [creatingStatus, setCreatingStatus] = useState(false);
  const [deletingStatus, setDeletingStatus] = useState(false);

  const formatRelativeTime = (rawTime?: string | number) => {
    if (!rawTime) return "No updates yet";
    const date = new Date(rawTime);
    if (Number.isNaN(date.getTime())) return "No updates yet";

    const diffSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    if (diffSeconds < 15) return "just now";
    if (diffSeconds < 60) return `${diffSeconds}s ago`;

    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return "yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short"
    });
  };

  const isVideoUrl = (url?: string) => {
    if (!url) return false;
    return (
      /\.(mp4|mov|m4v|webm|3gp|mkv)(\?.*)?$/i.test(url) ||
      url.includes("/video/") ||
      url.includes("video")
    );
  };

  const fetchStatuses = useCallback(async () => {
    try {
      setRefreshing(true);
      const storedUserId = await AsyncStorage.getItem("userId");
      const currentUserId = storedUserId ? Number(storedUserId) : null;
      const fetchStatusPosts = async () => {
        const failures: Array<{ endpoint: string; statusCode?: number; message?: string }> = [];

        for (const endpoint of STATUS_POSTS_ENDPOINTS) {
          try {
            const response = await API.get(endpoint);
            console.log("[StatusFetch] success", { endpoint });
            return response;
          } catch (error: any) {
            failures.push({
              endpoint,
              statusCode: error?.response?.status,
              message: error?.response?.data?.message || error?.message
            });
          }
        }

        const lastFailure = failures[failures.length - 1];
        const err: any = new Error(lastFailure?.message || "Status route not found");
        err.response = { status: lastFailure?.statusCode, data: { failures } };
        throw err;
      };

      const [users, statusResponse] = await Promise.all([getUsers(), fetchStatusPosts()]);
      const allStatusRows: BackendStatus[] = Array.isArray(statusResponse?.data?.statuses)
        ? statusResponse.data.statuses
        : [];
      const statusRows = allStatusRows;

      const usersById = new Map<number, any>(
        (Array.isArray(users) ? users : []).map((user: any) => [Number(user.id), user])
      );

      const me = (Array.isArray(users) ? users : []).find((item: any) => item.id === currentUserId);
      const now = Date.now();
      const activeStatuses = statusRows
        .filter((row) => {
          if (!row.expires_at) return true;
          const expiresTs = new Date(row.expires_at).getTime();
          return Number.isNaN(expiresTs) ? true : expiresTs > now;
        })
        .sort((a, b) => {
          const aTs = new Date(a.created_at || 0).getTime();
          const bTs = new Date(b.created_at || 0).getTime();
          return bTs - aTs;
        });

      const myLatestStatus = activeStatuses.find(
        (row) => Number(row.user_id) === Number(currentUserId)
      );
      const myAllStatuses = activeStatuses.filter(
        (row) => Number(row.user_id) === Number(currentUserId)
      );
      setMyStatusCount(myAllStatuses.length);
      setMyStatusList(
        myAllStatuses.map((row) => ({
          id: Number(row.id),
          userId: Number(currentUserId || me?.id || 0),
          name: me?.name ?? "You",
          time: row.created_at ? formatRelativeTime(row.created_at) : "",
          caption: row.text_content || "",
          mediaUrl: toAbsoluteImageUrl(row.media_url || ""),
          profileImage: toAbsoluteImageUrl(
            me?.profileImage ?? me?.avatar ?? me?.profile_pic ?? ""
          )
        }))
      );
      setMyStatus({
        id: Number(myLatestStatus?.id || 0),
        userId: Number(currentUserId || me?.id || 0),
        name: me?.name ?? "You",
        time: myLatestStatus?.created_at
          ? formatRelativeTime(myLatestStatus.created_at)
          : "Tap to add status update",
        caption: myLatestStatus?.text_content || "",
        mediaUrl: toAbsoluteImageUrl(myLatestStatus?.media_url || ""),
        profileImage: toAbsoluteImageUrl(
          me?.profileImage ?? me?.avatar ?? me?.profile_pic ?? ""
        )
      });

      const otherStatuses = activeStatuses.filter(
        (row) => Number(row.user_id) !== Number(currentUserId)
      );

      const groupedByUser = new Map<number, BackendStatus[]>();
      otherStatuses.forEach((row) => {
        const uid = Number(row.user_id);
        if (!groupedByUser.has(uid)) {
          groupedByUser.set(uid, []);
        }
        groupedByUser.get(uid)?.push(row);
      });

      const statusItems: StatusItem[] = await Promise.all(
        Array.from(groupedByUser.entries()).map(async ([uid, rows]) => {
          const user = usersById.get(uid);
          const latest = rows[0];
          const statusIds = rows.map((entry) => Number(entry.id));

          const viewedChecks = await Promise.all(
            statusIds.map(async (statusId) => {
              try {
                const viewRes = await API.get(`/status-views/${statusId}`);
                const views: StatusView[] = Array.isArray(viewRes?.data?.views)
                  ? viewRes.data.views
                  : [];
                return !!views.find((entry) => Number(entry.viewer_id) === Number(currentUserId));
              } catch (error) {
                return false;
              }
            })
          );

          const allViewed = viewedChecks.every(Boolean);

          return {
            id: Number(latest?.id),
            userId: uid,
            name: user?.name || `User ${uid}`,
            time: formatRelativeTime(latest?.created_at),
            caption: latest?.text_content || "",
            mediaUrl: toAbsoluteImageUrl(latest?.media_url || ""),
            profileImage: toAbsoluteImageUrl(
              user?.profileImage ?? user?.avatar ?? user?.profile_pic ?? ""
            ),
            viewed: allViewed,
            statusCount: rows.length,
            statusIds,
            items: rows.map((entry) => ({
              id: Number(entry.id),
              time: formatRelativeTime(entry.created_at),
              caption: entry.text_content || "",
              mediaUrl: toAbsoluteImageUrl(entry.media_url || "")
            }))
          };
        })
      );

      const recent = statusItems.filter((item) => !item.viewed);
      const viewed = statusItems.filter((item) => item.viewed);
      setRecentStatuses(recent);
      setViewedStatuses(viewed);
    } catch (error: any) {
      console.log("Status status fetch error:", {
        statusCode: error?.response?.status,
        message: error?.response?.data?.message || error?.message,
        endpoint: STATUS_POSTS_ENDPOINTS[0],
        tried: error?.response?.data?.failures || STATUS_POSTS_ENDPOINTS
      });
      setRecentStatuses([]);
      setViewedStatuses([]);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStatuses();
  }, [fetchStatuses]);

  const getExpiresAt = () => {
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
      d.getMinutes()
    )}:${pad(d.getSeconds())}`;
  };

  const pickStatusMedia = async () => {
    const result = await launchImageLibrary({
      mediaType: "mixed",
      quality: 0.8,
      selectionLimit: 1,
      videoQuality: "medium"
    });

    if (result.didCancel) return;
    const firstAsset = result.assets?.[0];
    const uri = firstAsset?.uri;
    if (!uri) return;
    const type = firstAsset?.type || "";
    const isVideo = type.startsWith("video/");
    const durationSec = Number(firstAsset?.duration || 0);
    setPickedMediaKind(isVideo ? "video" : "image");
    if (isVideo && durationSec > 30) {
      setPreviewError(`Video is ${Math.floor(durationSec)}s. Please choose up to 30s.`);
    } else {
      setPreviewError("");
    }
    setPickedMediaUrl(uri);
    setPickedMediaAsset({
      uri,
      type: firstAsset?.type,
      fileName: firstAsset?.fileName
    });
    setStatusModalVisible(true);
  };

  const uploadStatusMedia = async (asset: PickedMediaAsset) => {
    const fileName =
      asset.fileName ||
      `status-${Date.now()}${pickedMediaKind === "video" ? ".mp4" : ".jpg"}`;

    const formData = new FormData();
    formData.append("file", {
      uri: asset.uri,
      type: asset.type || (pickedMediaKind === "video" ? "video/mp4" : "image/jpeg"),
      name: fileName
    } as any);

    const response = await API.post("/upload-status-media", formData, {
      headers: {
        "Content-Type": "multipart/form-data"
      }
    });

    const mediaUrl = response?.data?.mediaUrl;
    if (!mediaUrl) {
      throw new Error("Upload succeeded but mediaUrl was missing in response");
    }

    return mediaUrl as string;
  };

  const createStatus = async () => {
    if (!pickedMediaUrl || !pickedMediaAsset || creatingStatus) return;
    try {
      setCreatingStatus(true);
      const storedUserId = await AsyncStorage.getItem("userId");
      const userId = storedUserId ? Number(storedUserId) : null;
      if (!userId) {
        setCreatingStatus(false);
        return;
      }

      const uploadedMediaUrl = await uploadStatusMedia(pickedMediaAsset);

      await API.post("/create-status", {
        user_id: userId,
        media_url: uploadedMediaUrl,
        text_content: statusText.trim() || "New status",
        expires_at: getExpiresAt()
      });

      setStatusModalVisible(false);
      setStatusText("");
      setPickedMediaUrl("");
      setPickedMediaAsset(null);
      setPickedMediaKind("image");
      fetchStatuses();
    } catch (error) {
      console.log("Create status error:", error);
    } finally {
      setCreatingStatus(false);
    }
  };

  const hasMyStatus = Boolean(
    myStatus &&
      (myStatus.mediaUrl ||
        myStatus.caption ||
        (myStatus.time && myStatus.time !== "Tap to add status update"))
  );

  const openMyStatus = () => {
    if (hasMyStatus) {
      setMyStatusIndex(0);
      setMyStatusViewerVisible(true);
      return;
    }
    pickStatusMedia();
  };

  const currentMyStatus = myStatusList[myStatusIndex] || myStatus;

  const goToNextMyStatus = () => {
    setMyStatusIndex((prev) => Math.min(prev + 1, Math.max(0, myStatusList.length - 1)));
  };

  const goToPreviousMyStatus = () => {
    setMyStatusIndex((prev) => Math.max(prev - 1, 0));
  };

  const deleteMyStatus = async () => {
    if (!currentMyStatus?.id || deletingStatus) return;
    try {
      setDeletingStatus(true);
      const storedUserId = await AsyncStorage.getItem("userId");
      const userId = storedUserId ? Number(storedUserId) : currentMyStatus.userId;
      if (!userId) return;

      await API.post("/delete-status", {
        status_id: currentMyStatus.id,
        user_id: userId
      });

      setMyStatusViewerVisible(false);
      fetchStatuses();
    } catch (error) {
      console.log("Delete status error:", error);
    } finally {
      setDeletingStatus(false);
    }
  };

  const openOtherStatus = (item: StatusItem) => {
    AsyncStorage.getItem("userId")
      .then((storedUserId) => {
        const viewerId = storedUserId ? Number(storedUserId) : null;
        if (!viewerId) return;
        const ids = item.statusIds?.length ? item.statusIds : [item.id];
        return Promise.all(
          ids.map((statusId) =>
            API.post("/mark-status-view", {
              status_id: statusId,
              viewer_id: viewerId
            })
          )
        );
      })
      .then(() => {
        fetchStatuses();
      })
      .catch((error) => {
        console.log("Mark status view error:", error);
      });

    setSelectedStatus(item);
    setSelectedStatusIndex(0);
    setOtherStatusViewerVisible(true);
  };

  const selectedStatusItems =
    selectedStatus?.items?.length
      ? selectedStatus.items
      : selectedStatus
      ? [
          {
            id: selectedStatus.id,
            time: selectedStatus.time,
            caption: selectedStatus.caption,
            mediaUrl: selectedStatus.mediaUrl
          }
        ]
      : [];

  const currentSelectedStatus =
    selectedStatusItems[selectedStatusIndex] || selectedStatusItems[0] || null;

  const goToNextSelectedStatus = () => {
    setSelectedStatusIndex((prev) =>
      Math.min(prev + 1, Math.max(0, selectedStatusItems.length - 1))
    );
  };

  const goToPreviousSelectedStatus = () => {
    setSelectedStatusIndex((prev) => Math.max(prev - 1, 0));
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={fetchStatuses} tintColor={colors.primary} />
      }
    >
      {/* <Text style={[styles.mainTitle, { color: colors.text }]}>Status</Text> */}

      <View style={[styles.listBlock, { backgroundColor: colors.card }]}>
        <TouchableOpacity
          style={[styles.row, { borderBottomColor: colors.border }]}
          activeOpacity={0.85}
          onPress={openMyStatus}
          onLongPress={pickStatusMedia}
        >
          <AvatarWithStatusRing
            imageUri={myStatus?.profileImage || ""}
            initial={myStatus?.name?.trim()?.charAt(0)?.toUpperCase() || "Y"}
            ringColor="#22c55e"
            segmentCount={hasMyStatus ? Math.max(1, myStatusCount) : 0}
            showAddBadge
            onAddPress={pickStatusMedia}
            colors={colors}
          />

          <View style={styles.rowTextWrap}>
            <Text style={[styles.nameText, { color: colors.text }]}>My Status</Text>
            <Text style={[styles.timeText, { color: colors.secondaryText }]} numberOfLines={1}>
              {hasMyStatus
                ? myStatus?.caption
                  ? `${myStatus.time} • ${myStatus.caption}`
                  : `${myStatus?.time}`
                : "Tap to add status update"}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      <Text style={[styles.sectionTitle, { color: colors.secondaryText }]}>
        RECENT UPDATES
      </Text>
      <View style={[styles.listBlock, { backgroundColor: colors.card }]}>
        {recentStatuses.length ? (
          recentStatuses.map((item) => (
            <StatusRow
              key={item.id}
              item={item}
              colors={colors}
              onPress={() => openOtherStatus(item)}
            />
          ))
        ) : (
          <Text style={[styles.emptyText, { color: colors.secondaryText }]}>
            No recent status updates
          </Text>
        )}
      </View>

      <Text style={[styles.sectionTitle, styles.sectionSpacing, { color: colors.secondaryText }]}>
        VIEWED UPDATES
      </Text>
      <View style={[styles.listBlock, { backgroundColor: colors.card }]}>
        {viewedStatuses.length ? (
          viewedStatuses.map((item) => (
            <StatusRow
              key={item.id}
              item={item}
              colors={colors}
              onPress={() => openOtherStatus(item)}
            />
          ))
        ) : (
          <Text style={[styles.emptyText, { color: colors.secondaryText }]}>
            No viewed updates yet
          </Text>
        )}
      </View>
    </ScrollView>
      <Modal visible={statusModalVisible} transparent animationType="fade" onRequestClose={() => setStatusModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Create Status</Text>
            {pickedMediaUrl ? (
              <View style={styles.previewWrap}>
                {pickedMediaKind === "video" ? (
                  <Video
                    source={{ uri: pickedMediaUrl }}
                    style={styles.previewVideo}
                    resizeMode="cover"
                    controls
                    paused
                  />
                ) : (
                  <Image source={{ uri: pickedMediaUrl }} style={styles.previewImage} />
                )}
              </View>
            ) : null}
            {previewError ? (
              <Text style={styles.previewErrorText}>{previewError}</Text>
            ) : null}
            <TextInput
              value={statusText}
              onChangeText={setStatusText}
              placeholder="Write a caption..."
              placeholderTextColor={colors.secondaryText}
              style={[
                styles.captionInput,
                {
                  color: colors.text,
                  borderColor: colors.border,
                  backgroundColor: colors.inputBackground
                }
              ]}
            />
            <Text style={[styles.modalHint, { color: colors.secondaryText }]} numberOfLines={1}>
              Media: {pickedMediaUrl ? `Selected ${pickedMediaKind}` : "No media selected"}
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { borderColor: colors.border }]}
                onPress={() => {
                  setStatusModalVisible(false);
                  setStatusText("");
                  setPickedMediaAsset(null);
                  setPickedMediaUrl("");
                  setPickedMediaKind("image");
                  setPreviewError("");
                }}
              >
                <Text style={[styles.modalBtnText, { color: colors.secondaryText }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
                onPress={createStatus}
                disabled={!pickedMediaUrl || creatingStatus || !!previewError}
              >
                {creatingStatus ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={[styles.modalBtnText, { color: "#fff" }]}>Post</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={myStatusViewerVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setMyStatusViewerVisible(false)}
      >
        <View style={styles.viewerBackdrop}>
          <View style={styles.viewerTopBar}>
            <Text style={styles.viewerTitle}>My Status</Text>
            <View style={styles.viewerActions}>
              {hasMyStatus ? (
                <TouchableOpacity onPress={deleteMyStatus} disabled={deletingStatus}>
                  <Text style={styles.viewerDelete}>
                    {deletingStatus ? "Deleting..." : "Delete"}
                  </Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity onPress={() => setMyStatusViewerVisible(false)}>
                <Text style={styles.viewerClose}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.viewerContent}>
            {currentMyStatus?.mediaUrl ? (
              isVideoUrl(currentMyStatus.mediaUrl) ? (
                <Video
                  key={`my-status-video-${currentMyStatus.id}-${myStatusIndex}`}
                  source={{ uri: currentMyStatus.mediaUrl }}
                  style={styles.viewerVideo}
                  controls
                  repeat
                  resizeMode="contain"
                />
              ) : (
                <Image source={{ uri: currentMyStatus.mediaUrl }} style={styles.viewerImage} resizeMode="contain" />
              )
            ) : (
              <View style={styles.viewerEmpty}>
                <Text style={styles.viewerEmptyText}>No media found</Text>
              </View>
            )}
            {myStatusList.length > 1 ? (
              <>
                <TouchableOpacity
                  style={[styles.viewerNavBtn, styles.viewerNavLeft]}
                  onPress={goToPreviousMyStatus}
                  disabled={myStatusIndex === 0}
                >
                  <Text style={[styles.viewerNavText, myStatusIndex === 0 && styles.viewerNavDisabled]}>{"<"}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.viewerNavBtn, styles.viewerNavRight]}
                  onPress={goToNextMyStatus}
                  disabled={myStatusIndex >= myStatusList.length - 1}
                >
                  <Text
                    style={[
                      styles.viewerNavText,
                      myStatusIndex >= myStatusList.length - 1 && styles.viewerNavDisabled
                    ]}
                  >
                    {">"}
                  </Text>
                </TouchableOpacity>
              </>
            ) : null}
            <View style={styles.viewerCaptionWrap}>
              {myStatusList.length > 1 ? (
                <Text style={styles.viewerIndex}>
                  {myStatusIndex + 1}/{myStatusList.length}
                </Text>
              ) : null}
              <Text style={styles.viewerTime}>{currentMyStatus?.time || ""}</Text>
              {!!currentMyStatus?.caption && (
                <Text style={styles.viewerCaption}>{currentMyStatus.caption}</Text>
              )}
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={otherStatusViewerVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setOtherStatusViewerVisible(false)}
      >
        <View style={styles.viewerBackdrop}>
          <View style={styles.viewerTopBar}>
            <Text style={styles.viewerTitle}>{selectedStatus?.name || "Status"}</Text>
            <TouchableOpacity onPress={() => setOtherStatusViewerVisible(false)}>
              <Text style={styles.viewerClose}>Close</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.viewerContent}>
            {currentSelectedStatus?.mediaUrl ? (
              isVideoUrl(currentSelectedStatus.mediaUrl) ? (
                <Video
                  key={`other-status-video-${currentSelectedStatus.id}-${selectedStatusIndex}`}
                  source={{ uri: currentSelectedStatus.mediaUrl }}
                  style={styles.viewerVideo}
                  controls
                  repeat
                  resizeMode="contain"
                />
              ) : (
                <Image source={{ uri: currentSelectedStatus.mediaUrl }} style={styles.viewerImage} resizeMode="contain" />
              )
            ) : (
              <View style={styles.viewerEmpty}>
                <Text style={styles.viewerEmptyText}>No media found</Text>
              </View>
            )}
            {selectedStatusItems.length > 1 ? (
              <>
                <TouchableOpacity
                  style={[styles.viewerNavBtn, styles.viewerNavLeft]}
                  onPress={goToPreviousSelectedStatus}
                  disabled={selectedStatusIndex === 0}
                >
                  <Text style={[styles.viewerNavText, selectedStatusIndex === 0 && styles.viewerNavDisabled]}>{"<"}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.viewerNavBtn, styles.viewerNavRight]}
                  onPress={goToNextSelectedStatus}
                  disabled={selectedStatusIndex >= selectedStatusItems.length - 1}
                >
                  <Text
                    style={[
                      styles.viewerNavText,
                      selectedStatusIndex >= selectedStatusItems.length - 1 && styles.viewerNavDisabled
                    ]}
                  >
                    {">"}
                  </Text>
                </TouchableOpacity>
              </>
            ) : null}
            <View style={styles.viewerCaptionWrap}>
              {selectedStatusItems.length > 1 ? (
                <Text style={styles.viewerIndex}>
                  {selectedStatusIndex + 1}/{selectedStatusItems.length}
                </Text>
              ) : null}
              <Text style={styles.viewerTime}>{currentSelectedStatus?.time || ""}</Text>
              {!!currentSelectedStatus?.caption && (
                <Text style={styles.viewerCaption}>{currentSelectedStatus.caption}</Text>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default ExploreScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  scroll: {
    flex: 1
  },
  scrollContent: {
    paddingTop: 12,
    paddingBottom: 112
  },
  mainTitle: {
    fontSize: 28,
    fontWeight: "700",
    paddingHorizontal: 16,
    marginBottom: 14
  },
  listBlock: {
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: "hidden"
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 8
  },
  sectionSpacing: {
    marginTop: 6
  },
  emptyText: {
    fontSize: 13,
    paddingHorizontal: 14,
    paddingBottom: 10
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    paddingRight: 18,
    borderBottomWidth: 1
  },
  rowTextWrap: {
    flex: 1,
    marginLeft: 12
  },
  nameText: {
    fontSize: 16,
    fontWeight: "600"
  },
  timeText: {
    marginTop: 2,
    fontSize: 13
  },
  avatarRing: {
    position: "absolute",
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center"
  },
  avatarRingWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: "center",
    justifyContent: "center",
    position: "relative"
  },
  avatarCenter: {
    position: "absolute",
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  segmentDot: {
    position: "absolute",
    width: RING_DOT_SIZE,
    height: RING_DOT_SIZE,
    borderRadius: RING_DOT_SIZE / 2
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2
  },
  avatarFallback: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    alignItems: "center",
    justifyContent: "center"
  },
  avatarInitial: {
    fontSize: 18,
    fontWeight: "700"
  },
  addBadge: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center"
  },
  addBadgeText: {
    color: "#fff",
    fontSize: 14,
    lineHeight: 14,
    fontWeight: "700"
  },
  countBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#16a34a",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6
  },
  countBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700"
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18
  },
  modalCard: {
    width: "100%",
    borderRadius: 14,
    borderWidth: 1,
    padding: 14
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 10
  },
  previewWrap: {
    width: "100%",
    height: 220,
    borderRadius: 10,
    overflow: "hidden",
    marginBottom: 10
  },
  previewImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover"
  },
  previewVideo: {
    width: "100%",
    height: "100%"
  },
  previewErrorText: {
    color: "#ef4444",
    fontSize: 12,
    marginBottom: 8
  },
  captionInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14
  },
  modalHint: {
    marginTop: 10,
    fontSize: 12
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 14,
    columnGap: 8
  },
  modalBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 9
  },
  modalBtnText: {
    fontSize: 13,
    fontWeight: "700"
  },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: "#000"
  },
  viewerTopBar: {
    paddingTop: 48,
    paddingHorizontal: 14,
    paddingBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  viewerActions: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 14
  },
  viewerTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700"
  },
  viewerDelete: {
    color: "#f87171",
    fontSize: 14,
    fontWeight: "700"
  },
  viewerClose: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600"
  },
  viewerContent: {
    flex: 1,
    justifyContent: "center"
  },
  viewerImage: {
    width: "100%",
    height: "72%"
  },
  viewerVideo: {
    width: "100%",
    height: "72%"
  },
  viewerEmpty: {
    width: "100%",
    height: "72%",
    alignItems: "center",
    justifyContent: "center"
  },
  viewerEmptyText: {
    color: "#fff",
    fontSize: 14
  },
  viewerCaptionWrap: {
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  viewerIndex: {
    color: "#e5e7eb",
    fontSize: 12,
    marginBottom: 4
  },
  viewerTime: {
    color: "#d1d5db",
    fontSize: 12,
    marginBottom: 6
  },
  viewerCaption: {
    color: "#fff",
    fontSize: 15
  },
  viewerNavBtn: {
    position: "absolute",
    top: "45%",
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10
  },
  viewerNavLeft: {
    left: 12
  },
  viewerNavRight: {
    right: 12
  },
  viewerNavText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700"
  },
  viewerNavDisabled: {
    color: "#6b7280"
  }
});
