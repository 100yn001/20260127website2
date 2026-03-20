import { IconSymbol } from '@/components/ui/icon-symbol';
import { auth, db } from '@/config/firebase';
import { FontSizes } from '@/constants/typography';
import { useTheme } from '@/contexts/ThemeContext';
import { publishNarratorToLibrary } from '@/services/public-narrator-service';
import { Narrator } from '@/types/narrator';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    SafeAreaView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import Animated, { useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

interface Story {
  id: string;
  userId: string;
  title?: string;
  location?: string;
  character?: string;
  duration?: string;
  createdAt: Date;
  narratorId?: string;
  audioUrl?: string;
  transcript?: string;
  setting?: string;
}

export default function NarratorStoriesScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const { colors } = useTheme();
  const narratorId = params.narratorId as string;
  const narratorData = params.narratorData ? JSON.parse(params.narratorData as string) : null;

  const [stories, setStories] = useState<Story[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [narrator, setNarrator] = useState<Narrator | null>(narratorData);
  const [isPublishingStatic, setIsPublishingStatic] = useState(false);
  const [isPublishModalVisible, setIsPublishModalVisible] = useState(false);
  const [publishUsername, setPublishUsername] = useState('');
  
  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Editable fields
  const [editedName, setEditedName] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [editedRelationship, setEditedRelationship] = useState('');
  const [editedAdditionalDetails, setEditedAdditionalDetails] = useState('');
  const [editedUserName, setEditedUserName] = useState('');
  const [editedGender, setEditedGender] = useState<'male' | 'female' | 'other'>('male');
  const [editedCustomGender, setEditedCustomGender] = useState('');
  const [editedUserGender, setEditedUserGender] = useState<'male' | 'female' | 'other'>('female');
  const [editedUserCustomGender, setEditedUserCustomGender] = useState('');

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setIsLoading(false);
      return;
    }

    const storiesRef = collection(db, 'stories');
    const q = query(
      storiesRef,
      where('userId', '==', user.uid),
      where('narratorId', '==', narratorId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const storiesList = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
        } as Story;
      });

      setStories(storiesList.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [narratorId]);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user || !narratorId) return;

    const narratorRef = doc(db, 'users', user.uid, 'narrators', narratorId);
    const unsubscribe = onSnapshot(narratorRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as Narrator;
        const normalizedNarrator: Narrator = {
          ...data,
          createdAt: (data.createdAt as any)?.toDate?.() || data.createdAt || new Date(),
          updatedAt: (data.updatedAt as any)?.toDate?.() || data.updatedAt || new Date(),
        };
        setNarrator(normalizedNarrator);
        if (!isEditing) {
          setEditedName(normalizedNarrator.name || '');
          setEditedDescription(normalizedNarrator.description || '');
          setEditedRelationship(normalizedNarrator.relationship || '');
          setEditedAdditionalDetails(normalizedNarrator.additionalDetails || '');
          setEditedUserName(normalizedNarrator.userNameWithNarrator || '');
          setEditedGender(normalizedNarrator.gender || 'male');
          setEditedCustomGender(normalizedNarrator.customGender || '');
          setEditedUserGender(normalizedNarrator.userGenderWithNarrator || 'female');
          setEditedUserCustomGender(normalizedNarrator.userCustomGenderWithNarrator || '');
        }
      }
    });

    return () => unsubscribe();
  }, [narratorId, isEditing]);

  const startEditing = () => {
    if (narrator) {
      setEditedName(narrator.name || '');
      setEditedDescription(narrator.description || '');
      setEditedRelationship(narrator.relationship || '');
      setEditedAdditionalDetails(narrator.additionalDetails || '');
      setEditedUserName(narrator.userNameWithNarrator || '');
      setEditedGender(narrator.gender || 'male');
      setEditedCustomGender(narrator.customGender || '');
      setEditedUserGender(narrator.userGenderWithNarrator || 'female');
      setEditedUserCustomGender(narrator.userCustomGenderWithNarrator || '');
    }
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
  };

  const saveChanges = async () => {
    if (!narratorId || !auth.currentUser) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'users', auth.currentUser.uid, 'narrators', narratorId), {
        name: editedName,
        description: editedDescription,
        relationship: editedRelationship,
        additionalDetails: editedAdditionalDetails,
        userNameWithNarrator: editedUserName,
        gender: editedGender,
        customGender: editedGender === 'other' ? editedCustomGender : '',
        userGenderWithNarrator: editedUserGender,
        userCustomGenderWithNarrator: editedUserGender === 'other' ? editedUserCustomGender : '',
        updatedAt: new Date(),
      });
      setIsEditing(false);
    } catch (error) {
      console.error('Error updating narrator:', error);
      alert('Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  // Scroll-based header fade (runs on UI thread)
  const headerOpacity = useSharedValue(1);
  const lastScrollY = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      const currentY = event.contentOffset.y;
      const delta = currentY - lastScrollY.value;

      if (currentY <= 0) {
        headerOpacity.value = withTiming(1, { duration: 200 });
      } else if (delta > 4) {
        headerOpacity.value = withTiming(0, { duration: 250 });
      } else if (delta < -4) {
        headerOpacity.value = withTiming(1, { duration: 200 });
      }

      lastScrollY.value = currentY;
    },
  });

  const headerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
  }));

  const isAdminUser = ['ellepotterhead2006@gmail.com', 'madxwoods@gmail.com'].includes(auth.currentUser?.email || '');
  const canPublishStatic = useMemo(
    () => Boolean(isAdminUser && narrator && !narrator.isPublished),
    [isAdminUser, narrator]
  );

  const getGenderDisplay = () => {
    if (!narrator) return '';
    if (narrator.gender === 'other' && narrator.customGender) {
      return narrator.customGender;
    }
    return narrator.gender;
  };

  const getUserGenderDisplay = () => {
    if (!narrator) return '';
    if (narrator.userGenderWithNarrator === 'other' && narrator.userCustomGenderWithNarrator) {
      return narrator.userCustomGenderWithNarrator;
    }
    return narrator.userGenderWithNarrator;
  };

  const handleOpenPublishModal = () => {
    if (!narrator || !auth.currentUser) return;
    setPublishUsername('');
    setIsPublishModalVisible(true);
  };

  const handleConfirmPublish = async () => {
    if (!narrator || !auth.currentUser) return;

    const trimmedUsername = publishUsername.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!trimmedUsername || trimmedUsername.length < 3) {
      Alert.alert('invalid username', 'username must be at least 3 characters (letters, numbers, underscores only).');
      return;
    }

    setIsPublishingStatic(true);
    try {
      await publishNarratorToLibrary(
        narrator,
        auth.currentUser!.email || auth.currentUser!.uid,
        trimmedUsername
      );
      setIsPublishModalVisible(false);
      Alert.alert('published', `${narrator.name} (@${trimmedUsername}) is now in the public narrator library.`);
    } catch (error) {
      console.error('Error publishing narrator:', error);
      Alert.alert('failed', 'could not publish this narrator. try again.');
    } finally {
      setIsPublishingStatic(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Animated.View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.background }, headerAnimatedStyle]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <IconSymbol name="chevron.left" size={28} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1} ellipsizeMode="tail">
            {narrator?.name || 'narrator'}
          </Text>
        </View>
        <View style={styles.headerActions}>
          {isEditing ? (
            <>
              <TouchableOpacity onPress={cancelEditing} disabled={isSaving}>
                <Text style={[styles.headerActionText, { color: colors.textSecondary }]}>cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveChanges} disabled={isSaving}>
                <Text style={[styles.headerActionText, isSaving && styles.disabled]}>
                  {isSaving ? 'saving...' : 'save'}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity onPress={startEditing}>
                <Text style={styles.headerActionText}>edit</Text>
              </TouchableOpacity>
              {narrator && (
                <TouchableOpacity
                  onPress={() => {
                    router.push({
                      pathname: '/(tabs)/recipe',
                      params: {
                        narratorId: narratorId,
                        narratorData: JSON.stringify(narrator),
                      },
                    });
                  }}
                >
                  <IconSymbol name="plus" size={20} color="#007AFF" />
                </TouchableOpacity>
              )}
              {canPublishStatic && (
                <TouchableOpacity
                  style={[styles.publishButton, isPublishingStatic && styles.disabled]}
                  onPress={handleOpenPublishModal}
                  disabled={isPublishingStatic}
                >
                  {isPublishingStatic ? (
                    <ActivityIndicator size="small" color="#0A84FF" />
                  ) : (
                    <View style={styles.publishButtonContent}>
                      <IconSymbol name="checkmark.seal.fill" size={16} color="#0A84FF" />
                      <Text style={styles.publishButtonText}>publish</Text>
                    </View>
                  )}
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </Animated.View>

      <Animated.ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
      >
        {narrator && (
          <>
            {/* Narrator Details Section */}
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>narrator details</Text>
              <View style={[styles.card, { backgroundColor: colors.card }]}>
                {/* Name */}
                <View style={styles.fieldColumn}>
                  <View style={styles.fieldRow}>
                    <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>name</Text>
                    {!isEditing && (
                      <Text style={[styles.fieldValue, { color: colors.text }]}>{narrator.name}</Text>
                    )}
                  </View>
                  {isEditing && (
                    <TextInput
                      style={[styles.fieldInputFull, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
                      value={editedName}
                      onChangeText={setEditedName}
                      placeholder="narrator name"
                      placeholderTextColor={colors.textSecondary}
                    />
                  )}
                </View>

                {/* Gender */}
                <View style={styles.fieldColumn}>
                  <View style={styles.fieldRow}>
                    <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>gender</Text>
                    {isEditing ? (
                      <View style={styles.genderPillsRow}>
                        {(['male', 'female', 'other'] as const).map((option) => (
                          <TouchableOpacity
                            key={option}
                            style={[
                              styles.genderPill,
                              { borderColor: colors.border },
                              editedGender === option && [styles.genderPillActive, { backgroundColor: colors.text, borderColor: colors.text }],
                            ]}
                            onPress={() => setEditedGender(option)}
                          >
                            <Text style={[
                              styles.genderPillText,
                              { color: colors.textSecondary },
                              editedGender === option && [styles.genderPillTextActive, { color: colors.background }],
                            ]}>
                              {option}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    ) : (
                      <Text style={[styles.fieldValue, { color: colors.text }]}>{getGenderDisplay()}</Text>
                    )}
                  </View>
                  {isEditing && editedGender === 'other' && (
                    <TextInput
                      style={[styles.customGenderInput, { color: colors.text, backgroundColor: colors.card, borderColor: colors.border }]}
                      value={editedCustomGender}
                      onChangeText={setEditedCustomGender}
                      placeholder="enter gender"
                      placeholderTextColor={colors.textSecondary}
                    />
                  )}
                </View>

                {/* Relationship */}
                <View style={styles.fieldRow}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>relationship</Text>
                  {isEditing ? (
                    <TextInput
                      style={[styles.fieldInput, { color: colors.text, backgroundColor: colors.background }]}
                      value={editedRelationship}
                      onChangeText={setEditedRelationship}
                      placeholder="e.g., boyfriend, husband"
                      placeholderTextColor={colors.textSecondary}
                    />
                  ) : (
                    <Text style={[styles.fieldValue, { color: colors.text }]}>{narrator.relationship}</Text>
                  )}
                </View>

                {/* Description */}
                <View style={styles.fieldColumn}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>description</Text>
                  {isEditing ? (
                    <TextInput
                      style={[styles.fieldInput, styles.multilineInput, { color: colors.text, backgroundColor: colors.background }]}
                      value={editedDescription}
                      onChangeText={setEditedDescription}
                      placeholder="physical attributes, personality..."
                      placeholderTextColor={colors.textSecondary}
                      multiline
                      numberOfLines={3}
                    />
                  ) : (
                    <Text style={[styles.fieldValueMultiline, { color: colors.text }]}>
                      {narrator.description || 'no description'}
                    </Text>
                  )}
                </View>

                {/* Additional Details */}
                <View style={styles.fieldColumn}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>additional details</Text>
                  {isEditing ? (
                    <TextInput
                      style={[styles.fieldInput, styles.multilineInput, { color: colors.text, backgroundColor: colors.background }]}
                      value={editedAdditionalDetails}
                      onChangeText={setEditedAdditionalDetails}
                      placeholder="nicknames, pet names..."
                      placeholderTextColor={colors.textSecondary}
                      multiline
                      numberOfLines={3}
                    />
                  ) : (
                    <Text style={[styles.fieldValueMultiline, { color: colors.text }]}>
                      {narrator.additionalDetails || 'none'}
                    </Text>
                  )}
                </View>
              </View>
            </View>

            {/* You With This Narrator Section */}
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>you with {narrator.name}</Text>
              <View style={[styles.card, { backgroundColor: colors.card }]}>
                {/* User Name */}
                <View style={styles.fieldRow}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>your name</Text>
                  {isEditing ? (
                    <TextInput
                      style={[styles.fieldInput, { color: colors.text, backgroundColor: colors.background }]}
                      value={editedUserName}
                      onChangeText={setEditedUserName}
                      placeholder="what they call you"
                      placeholderTextColor={colors.textSecondary}
                    />
                  ) : (
                    <Text style={[styles.fieldValue, { color: colors.text }]}>{narrator.userNameWithNarrator}</Text>
                  )}
                </View>

                {/* User Gender */}
                <View style={styles.fieldColumn}>
                  <View style={styles.fieldRow}>
                    <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>your gender</Text>
                    {isEditing ? (
                      <View style={styles.genderPillsRow}>
                        {(['male', 'female', 'other'] as const).map((option) => (
                          <TouchableOpacity
                            key={option}
                            style={[
                              styles.genderPill,
                              { borderColor: colors.border },
                              editedUserGender === option && [styles.genderPillActive, { backgroundColor: colors.text, borderColor: colors.text }],
                            ]}
                            onPress={() => setEditedUserGender(option)}
                          >
                            <Text style={[
                              styles.genderPillText,
                              { color: colors.textSecondary },
                              editedUserGender === option && [styles.genderPillTextActive, { color: colors.background }],
                            ]}>
                              {option}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    ) : (
                      <Text style={[styles.fieldValue, { color: colors.text }]}>{getUserGenderDisplay()}</Text>
                    )}
                  </View>
                  {isEditing && editedUserGender === 'other' && (
                    <TextInput
                      style={[styles.customGenderInput, { color: colors.text, backgroundColor: colors.card, borderColor: colors.border }]}
                      value={editedUserCustomGender}
                      onChangeText={setEditedUserCustomGender}
                      placeholder="enter gender"
                      placeholderTextColor={colors.textSecondary}
                    />
                  )}
                </View>
              </View>
            </View>
          </>
        )}

        {/* Stories Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>stories</Text>

          {isLoading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.text} />
            </View>
          )}

          {!isLoading && stories.length === 0 && (
            <View style={[styles.emptyState, { backgroundColor: colors.card }]}>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>no stories with this narrator yet</Text>
              <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
                create a story from the create tab
              </Text>
            </View>
          )}

          {!isLoading && stories.length > 0 && (
            <View style={styles.storiesList}>
              {stories.map((story) => (
                <TouchableOpacity
                  key={story.id}
                  style={[styles.storyCard, { backgroundColor: colors.card }]}
                  onPress={() => {
                    router.push({
                      pathname: '/player',
                      params: {
                        storyId: story.id,
                        audioUrl: encodeURIComponent(String((story as any).audioUrl || '')),
                        audioChunkURLs: (story as any).audioChunkURLs?.length ? JSON.stringify((story as any).audioChunkURLs) : '',
                        transcript: String((story as any).transcript || ''),
                        character: story.character || narrator?.name || 'character',
                        setting: story.setting || '',
                        location: story.location || '',
                      },
                    });
                  }}
                >
                  <View style={styles.storyInfo}>
                    <Text style={[styles.storyTitle, { color: colors.text }]} numberOfLines={1}>
                      {story.title || story.location || 'Untitled Story'}
                    </Text>
                    <Text style={[styles.storyMeta, { color: colors.textSecondary }]}>
                      {story.duration || '10min'} • {story.createdAt.toLocaleDateString()}
                    </Text>
                  </View>
                  <IconSymbol name="chevron.right" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </Animated.ScrollView>

      {/* Publish Username Modal */}
      <Modal
        visible={isPublishModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setIsPublishModalVisible(false)}
      >
        <View style={styles.publishModalBackdrop}>
          <View style={[styles.publishModalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.publishModalTitle, { color: colors.text }]}>publish narrator</Text>
            <Text style={[styles.publishModalSubtitle, { color: colors.textSecondary }]}>
              enter a unique username for this narrator (will be shown as @username)
            </Text>
            <View style={styles.publishModalInputContainer}>
              <Text style={[styles.publishModalAtSymbol, { color: colors.textSecondary }]}>@</Text>
              <TextInput
                style={[styles.publishModalInput, { color: colors.text, borderColor: colors.border }]}
                placeholder="username"
                placeholderTextColor={colors.textSecondary}
                value={publishUsername}
                onChangeText={setPublishUsername}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <Text style={[styles.publishModalHint, { color: colors.textSecondary }]}>
              lowercase letters, numbers, and underscores only
            </Text>
            <View style={styles.publishModalActions}>
              <TouchableOpacity
                style={[styles.publishModalButton, styles.publishModalCancel]}
                onPress={() => setIsPublishModalVisible(false)}
              >
                <Text style={styles.publishModalCancelText}>cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.publishModalButton, styles.publishModalConfirm]}
                onPress={handleConfirmPublish}
                disabled={isPublishingStatic}
              >
                {isPublishingStatic ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.publishModalConfirmText}>publish</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    zIndex: 10,
  },
  backButton: {
    padding: 8,
  },
  headerContent: {
    flex: 1,
    marginLeft: 12,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  publishButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#0A84FF',
  },
  publishButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  publishButtonText: {
    color: '#0A84FF',
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Medium',
  },
  headerActionText: {
    fontSize: 16,
    color: '#007AFF',
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  cancelText: {
    color: '#717182',
  },
  disabled: {
    opacity: 0.5,
  },
  title: {
    fontSize: FontSizes.title,
    fontWeight: '500',
    color: '#030213',
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 28,
  },
  sectionLabel: {
    fontSize: 12,
    color: '#717182',
    textTransform: 'lowercase',
    fontFamily: 'EBGaramond-Regular',
    marginBottom: 10,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#f7f7f8',
    borderRadius: 16,
    padding: 16,
    gap: 16,
  },
  fieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fieldColumn: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: FontSizes.body,
    color: '#717182',
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
  },
  fieldValue: {
    fontSize: FontSizes.body,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  fieldValueMultiline: {
    fontSize: FontSizes.body,
    fontFamily: 'EBGaramond-Regular',
    lineHeight: 22,
  },
  fieldInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: FontSizes.body,
    fontFamily: 'EBGaramond-Regular',
    color: '#030213',
    marginLeft: 12,
    textAlign: 'right',
  },
  fieldInputFull: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E5E7',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: FontSizes.body,
    fontFamily: 'EBGaramond-Regular',
    color: '#030213',
    marginTop: 8,
  },
  multilineInput: {
    marginLeft: 0,
    textAlign: 'left',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  loadingContainer: {
    padding: 48,
    alignItems: 'center',
  },
  emptyState: {
    padding: 32,
    alignItems: 'center',
    backgroundColor: '#f7f7f8',
    borderRadius: 16,
  },
  emptyText: {
    fontSize: FontSizes.subtitle,
    color: '#717182',
    marginBottom: 8,
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
  },
  emptySubtext: {
    fontSize: FontSizes.body,
    color: '#999',
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
  },
  storiesList: {
    gap: 10,
  },
  storyCard: {
    backgroundColor: '#f7f7f8',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  storyInfo: {
    flex: 1,
  },
  storyTitle: {
    fontSize: FontSizes.subtitle,
    fontWeight: '500',
    color: '#030213',
    marginBottom: 4,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  storyMeta: {
    fontSize: FontSizes.body,
    color: '#717182',
    fontFamily: 'EBGaramond-Regular',
  },
  // Gender picker styles
  genderPillsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  genderPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E5E7',
  },
  genderPillActive: {
    backgroundColor: '#030213',
    borderColor: '#030213',
  },
  genderPillText: {
    fontSize: FontSizes.body,
    fontFamily: 'EBGaramond-Regular',
    color: '#717182',
    textTransform: 'lowercase',
  },
  genderPillTextActive: {
    color: '#fff',
  },
  customGenderInput: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E5E5E7',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: FontSizes.body,
    fontFamily: 'EBGaramond-Regular',
  },
  publishModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  publishModalCard: {
    width: '100%',
    borderRadius: 20,
    padding: 24,
    gap: 16,
  },
  publishModalTitle: {
    fontSize: 20,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  publishModalSubtitle: {
    fontSize: 14,
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
    lineHeight: 20,
  },
  publishModalInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  publishModalAtSymbol: {
    fontSize: 18,
    fontFamily: 'EBGaramond-Medium',
  },
  publishModalInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    fontFamily: 'EBGaramond-Regular',
  },
  publishModalHint: {
    fontSize: 12,
    fontFamily: 'EBGaramond-Regular',
    textTransform: 'lowercase',
  },
  publishModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  publishModalButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  publishModalCancel: {
    backgroundColor: 'rgba(3, 2, 19, 0.06)',
  },
  publishModalConfirm: {
    backgroundColor: '#0A84FF',
  },
  publishModalCancelText: {
    color: '#030213',
    fontSize: 15,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
  publishModalConfirmText: {
    color: '#fff',
    fontSize: 15,
    fontFamily: 'EBGaramond-Medium',
    textTransform: 'lowercase',
  },
});
