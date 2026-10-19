import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  ImageBackground,
  NativeModules,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import Icon, { IconName } from './src/components/Icon';

type SlotKey = 'morning' | 'afternoon' | 'evening' | 'night';
type Slot = { key: SlotKey; uri: string; custom: boolean };
type Config = {
  automatic: boolean;
  active: boolean;
  currentSlot: SlotKey;
  slots: Slot[];
};
type WallpaperAPI = {
  getConfig(): Promise<Config>;
  pickImage(key: SlotKey): Promise<Config | null>;
  resetImage(key: SlotKey): Promise<Config>;
  setAutomatic(enabled: boolean): Promise<Config>;
  disableWallpaper(): Promise<Config>;
  openWallpaperPicker(): Promise<void>;
};
const api = NativeModules.DaylightWallpaper as WallpaperAPI | undefined;
const colors = {
  bg: '#0D1117',
  surface: '#171D25',
  text: '#F4F5F7',
  muted: '#84909E',
  mint: '#C6F3BD',
};
const order: SlotKey[] = ['morning', 'afternoon', 'evening', 'night'];
const periods: Record<
  SlotKey,
  {
    title: string;
    time: string;
    start: string;
    icon: IconName;
    caption: string;
  }
> = {
  morning: {
    title: 'Morning',
    time: '6 AM – 12 PM',
    start: '6 AM',
    icon: 'sunrise',
    caption: 'A softer start.',
  },
  afternoon: {
    title: 'Afternoon',
    time: '12 PM – 6 PM',
    start: '12 PM',
    icon: 'sun',
    caption: 'Stay in the moment.',
  },
  evening: {
    title: 'Evening',
    time: '6 PM – 9 PM',
    start: '6 PM',
    icon: 'sunset',
    caption: 'Chase the last light.',
  },
  night: {
    title: 'Night',
    time: '9 PM – 6 AM',
    start: '9 PM',
    icon: 'moon',
    caption: 'Find your quiet.',
  },
};

export function nextRefreshDelay(now = new Date()): number {
  const next = new Date(now);
  const hour = [6, 12, 18, 21].find(value => value > now.getHours());
  if (hour === undefined) {
    next.setDate(next.getDate() + 1);
  }
  next.setHours(hour ?? 6, 0, 0, 0);
  return Math.max(1000, next.getTime() - now.getTime());
}

function Daylight() {
  const insets = useSafeAreaInsets();
  const [config, setConfig] = useState<Config | null>(null);
  const [selected, setSelected] = useState<SlotKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<'collection' | 'schedule'>(
    'collection',
  );
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try {
      if (!api) {
        throw new Error(
          'Wallpaper features are unavailable. Please reinstall the Android app.',
        );
      }
      setConfig(await api.getConfig());
      setError('');
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not load your wallpapers.',
      );
    }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancel = () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
    const schedule = () => {
      cancel();
      timer = setTimeout(() => {
        refresh();
        schedule();
      }, nextRefreshDelay());
    };
    refresh();
    schedule();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        refresh();
        schedule();
      } else {
        cancel();
      }
    });
    return () => {
      cancel();
      subscription.remove();
    };
  }, [refresh]);

  const perform = async (operation: () => Promise<Config | null | void>) => {
    setBusy(true);
    try {
      const updated = await operation();
      if (updated) {
        setConfig(updated);
      }
    } catch (e) {
      Alert.alert(
        'Could not finish',
        e instanceof Error ? e.message : 'Please try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  const key = selected ?? config?.currentSlot ?? 'morning';
  const current = config?.slots.find(slot => slot.key === key);
  const period = periods[key];

  const customCount = config?.slots.filter(slot => slot.custom).length ?? 0;
  const nextSlot = config
    ? order[(order.indexOf(config.currentSlot) + 1) % 4]
    : 'morning';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor="#0D1117" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.brandGroup}>
            <View style={styles.brandIcon}>
              <Icon name="sun" size={21} color={colors.mint} />
            </View>
            <Text style={styles.brand}>
              daylight<Text style={styles.brandDot}>.</Text>
            </Text>
          </View>
          <View style={styles.statusPill}>
            <View
              style={[
                styles.statusDot,
                !config?.active && styles.statusDotInactive,
              ]}
            />
            <Text style={styles.statusText}>
              {config?.active ? 'WALLPAPER LIVE' : '24-HOUR WALLPAPER'}
            </Text>
          </View>
        </View>

        <View style={styles.heading}>
          <Text style={styles.kicker}>A LITTLE CHANGE FEELS GOOD</Text>
          <Text style={styles.title}>
            One day.{'\n'}
            <Text style={styles.titleAccent}>Four different moods.</Text>
          </Text>
          <Text style={styles.subtitle}>
            A home screen that moves with your day.
          </Text>
        </View>

        <View style={styles.tabs}>
          {(['collection', 'schedule'] as const).map(tab => (
            <Pressable
              key={tab}
              accessibilityRole="tab"
              accessibilityLabel={
                tab === 'collection' ? 'Your collection' : 'Daily schedule'
              }
              accessibilityState={{ selected: activeTab === tab }}
              onPress={() => setActiveTab(tab)}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
            >
              <Icon
                name={tab === 'collection' ? 'grid' : 'clock'}
                size={15}
                color={activeTab === tab ? colors.text : colors.muted}
              />
              <Text
                style={[
                  styles.tabText,
                  activeTab === tab && styles.tabTextActive,
                ]}
              >
                {tab === 'collection' ? 'Your collection' : 'Daily schedule'}
              </Text>
            </Pressable>
          ))}
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={refresh}
              style={styles.retry}
            >
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : null}
        {!config && !error ? (
          <ActivityIndicator
            style={styles.loading}
            color={colors.mint}
            accessibilityLabel="Loading wallpapers"
          />
        ) : null}

        {config && current ? (
          <>
            {activeTab === 'collection' ? (
              <>
                <ImageBackground
                  source={{ uri: current.uri }}
                  style={styles.hero}
                  imageStyle={styles.heroImage}
                >
                  <Svg
                    width="100%"
                    height="100%"
                    style={StyleSheet.absoluteFill}
                  >
                    <Defs>
                      <LinearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
                        <Stop
                          offset="0"
                          stopColor="#000000"
                          stopOpacity={0.08}
                        />
                        <Stop
                          offset={0.42}
                          stopColor="#000000"
                          stopOpacity="0"
                        />
                        <Stop
                          offset="1"
                          stopColor="#050A12"
                          stopOpacity={0.85}
                        />
                      </LinearGradient>
                    </Defs>
                    <Rect width="100%" height="100%" fill="url(#shade)" />
                  </Svg>
                  <View style={styles.heroTop}>
                    <View style={styles.heroPill}>
                      <View style={styles.heroDot} />
                      <Text style={styles.heroPillText}>
                        {key === config.currentSlot
                          ? 'YOUR CURRENT MOMENT'
                          : 'WALLPAPER PREVIEW'}
                      </Text>
                    </View>
                    <Pressable
                      disabled={busy}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Choose ${period.title.toLowerCase()} photo`}
                      onPress={() => perform(() => api!.pickImage(key))}
                      style={({ pressed }) => [
                        styles.heroIcon,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Icon name="image" size={18} />
                    </Pressable>
                  </View>
                  <View style={styles.heroBottom}>
                    <Text style={styles.heroEyebrow}>
                      {current.custom
                        ? 'YOUR PERSONAL COLLECTION'
                        : 'THE DUNE COLLECTION'}{' '}
                      / 0{order.indexOf(key) + 1}
                    </Text>
                    <Text style={styles.heroTitle}>{period.caption}</Text>
                    <View style={styles.heroMeta}>
                      <Icon name={period.icon} size={15} color="#E8E5E1" />
                      <Text style={styles.heroMetaText}>{period.title}</Text>
                      <View style={styles.metaDot} />
                      <Text style={styles.heroMetaTime}>{period.time}</Text>
                    </View>
                  </View>
                </ImageBackground>

                <View style={styles.sectionHeading}>
                  <Text style={styles.sectionTitle}>Your four moments</Text>
                  <Text style={styles.sectionHint}>TAP TO PREVIEW</Text>
                </View>
                <View style={styles.moments}>
                  {config.slots.map(slot => {
                    const info = periods[slot.key];
                    const isSelected = slot.key === key;
                    return (
                      <Pressable
                        key={slot.key}
                        onPress={() => setSelected(slot.key)}
                        accessibilityRole="button"
                        accessibilityLabel={`Preview ${info.title}`}
                        accessibilityState={{ selected: isSelected }}
                        style={styles.moment}
                      >
                        <View
                          style={[
                            styles.thumbnailFrame,
                            isSelected && styles.thumbnailSelected,
                          ]}
                        >
                          <ImageBackground
                            source={{ uri: slot.uri }}
                            style={styles.thumbnail}
                            imageStyle={styles.thumbnailImage}
                          >
                            <View style={styles.thumbShade} />
                            <View style={styles.thumbnailIcon}>
                              <Icon
                                name={info.icon}
                                size={18}
                                color="#FFFFFF"
                              />
                            </View>
                            {isSelected ? (
                              <View style={styles.selectedTick}>
                                <Icon name="check" size={11} color="#18251D" />
                              </View>
                            ) : null}
                          </ImageBackground>
                        </View>
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.momentName,
                            isSelected && styles.momentNameSelected,
                          ]}
                        >
                          {info.title}
                        </Text>
                        <Text style={styles.momentTime}>{info.start}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={styles.editCard}>
                  <View style={styles.editIcon}>
                    <Icon name="image" size={20} color={colors.mint} />
                  </View>
                  <View style={styles.editCopy}>
                    <Text style={styles.editTitle}>
                      Make {period.title.toLowerCase()} yours
                    </Text>
                    <Text style={styles.editHint}>
                      {current.custom
                        ? 'Your photo, your kind of mood.'
                        : 'Choose a photo from your gallery.'}
                    </Text>
                  </View>
                  <Pressable
                    disabled={busy}
                    onPress={() => perform(() => api!.pickImage(key))}
                    accessibilityRole="button"
                    accessibilityLabel={`Choose ${period.title.toLowerCase()} photo`}
                    style={({ pressed }) => [
                      styles.addPhoto,
                      pressed && styles.pressed,
                      busy && styles.disabled,
                    ]}
                  >
                    <Text style={styles.addPhotoText}>
                      {current.custom ? 'Replace' : 'Add photo'}
                    </Text>
                  </Pressable>
                </View>
                {current.custom ? (
                  <Pressable
                    disabled={busy}
                    onPress={() => perform(() => api!.resetImage(key))}
                    accessibilityRole="button"
                    accessibilityLabel={`Restore ${period.title.toLowerCase()} sample`}
                    style={styles.resetButton}
                  >
                    <Text style={styles.resetText}>
                      Restore original wallpaper
                    </Text>
                  </Pressable>
                ) : null}
              </>
            ) : (
              <View style={styles.scheduleCard}>
                <View style={styles.scheduleHeading}>
                  <View>
                    <Text style={styles.scheduleKicker}>
                      SET IT. FORGET IT.
                    </Text>
                    <Text style={styles.scheduleTitle}>
                      From sunrise to stillness.
                    </Text>
                  </View>
                  <Icon name="clock" color={colors.mint} size={26} />
                </View>
                <Text style={styles.scheduleIntro}>
                  Four automatic changes, timed to your local day.
                </Text>
                {config.slots.map((slot, index) => {
                  const info = periods[slot.key];
                  const now = slot.key === config.currentSlot;
                  return (
                    <Pressable
                      key={slot.key}
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${info.title} wallpaper`}
                      onPress={() => {
                        setSelected(slot.key);
                        setActiveTab('collection');
                      }}
                      style={styles.scheduleRow}
                    >
                      <View style={styles.timeline}>
                        <View
                          style={[
                            styles.timelineCircle,
                            now && styles.timelineCircleActive,
                          ]}
                        >
                          <Icon
                            name={info.icon}
                            size={18}
                            color={now ? colors.mint : '#8E98A6'}
                          />
                        </View>
                        {index < 3 ? (
                          <View style={styles.timelineLine} />
                        ) : null}
                      </View>
                      <View style={styles.scheduleCopy}>
                        <View style={styles.scheduleLabel}>
                          <Text style={styles.scheduleName}>{info.title}</Text>
                          {now ? (
                            <View style={styles.scheduleNow}>
                              <Text style={styles.scheduleNowText}>
                                {config.automatic ? 'NOW' : 'PAUSED'}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={styles.scheduleTime}>{info.time}</Text>
                      </View>
                      <Image
                        source={{ uri: slot.uri }}
                        style={styles.scheduleThumbnail}
                      />
                      <Icon name="arrow" size={15} color={colors.muted} />
                    </Pressable>
                  );
                })}
                <View style={styles.localTimeNote}>
                  <Icon name="clock" size={13} color={colors.muted} />
                  <Text style={styles.localTimeText}>
                    Follows your phone’s local time, wherever you are.
                  </Text>
                </View>
              </View>
            )}

            <View style={styles.autoPanel}>
              <View style={styles.autoIcon}>
                <Icon name="clock" color={colors.mint} size={20} />
              </View>
              <View style={styles.autoCopy}>
                <Text style={styles.autoTitle}>Flow with the day</Text>
                <Text style={styles.autoSubtitle}>
                  {config.automatic
                    ? `Up next: ${periods[nextSlot].title} at ${periods[nextSlot].start}`
                    : `Paused on ${periods[
                        config.currentSlot
                      ].title.toLowerCase()}`}
                </Text>
              </View>
              <Switch
                value={config.automatic}
                disabled={busy}
                onValueChange={value => perform(() => api!.setAutomatic(value))}
                trackColor={{ false: '#343C46', true: colors.mint }}
                thumbColor={config.automatic ? '#14231B' : '#C0C5CD'}
                accessibilityLabel="Automatic wallpaper changes"
              />
            </View>
            <View style={styles.collectionFooter}>
              <View style={styles.footerInfo}>
                <Icon name="leaf" size={13} color="#8C9A8F" />
                <Text style={styles.footerInfoText}>
                  Quiet by design. Easy on your battery.
                </Text>
              </View>
              <Text style={styles.personalCount}>{customCount}/4 yours</Text>
            </View>
          </>
        ) : null}
      </ScrollView>
      {config ? (
        <View
          style={[
            styles.dock,
            { paddingBottom: Math.max(insets.bottom, 12) + 12 },
          ]}
        >
          <View style={styles.dockStatus}>
            <View style={styles.dockStatusCopy}>
              <Text style={styles.dockTitle}>
                {config.active
                  ? 'Your day is on display'
                  : 'A fresh look, all day long'}
              </Text>
              <Text style={styles.dockSubtitle}>
                {config.active
                  ? 'Your wallpaper follows your rhythm.'
                  : 'Activate your four-moment collection.'}
              </Text>
            </View>
            <Pressable
              disabled={busy || (!config.active && !config.automatic)}
              accessibilityRole="button"
              accessibilityLabel="Disable wallpaper"
              onPress={() =>
                perform(async () => {
                  try {
                    return await api!.disableWallpaper();
                  } finally {
                    await refresh();
                  }
                })
              }
              style={({ pressed }) => [
                styles.disableButton,
                pressed && styles.pressed,
                busy && styles.disabled,
              ]}
            >
              <Text style={styles.disableButtonText}>
                {!config.active && !config.automatic
                  ? 'Disabled'
                  : 'Disable wallpaper'}
              </Text>
            </Pressable>
          </View>
          <Pressable
            disabled={busy}
            onPress={() =>
              perform(async () => {
                if (!config.active && !config.automatic) {
                  setConfig(await api!.setAutomatic(true));
                }
                await api!.openWallpaperPicker();
              })
            }
            accessibilityRole="button"
            accessibilityLabel={
              config.active ? 'Open wallpaper settings' : 'Set as wallpaper'
            }
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.primaryPressed,
              busy && styles.disabled,
            ]}
          >
            {busy ? (
              <ActivityIndicator color="#172A1C" />
            ) : (
              <>
                <Text style={styles.primaryButtonText}>
                  {config.active
                    ? 'Open wallpaper preview'
                    : 'Set as wallpaper'}
                </Text>
                <Icon name="arrow" size={20} color="#172A1C" />
              </>
            )}
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Daylight />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  disableButton: {
    minHeight: 44,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#5B3B40',
    backgroundColor: '#302127',
  },
  disableButtonText: { fontSize: 10, fontWeight: '600', color: '#F0B5B5' },
  safe: { flex: 1, backgroundColor: colors.bg },
  content: {
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 18,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  brandGroup: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#202E27',
    justifyContent: 'center',
    alignItems: 'center',
  },
  brand: {
    fontSize: 23,
    fontWeight: '700',
    letterSpacing: -0.9,
    color: colors.text,
  },
  brandDot: { color: colors.mint },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#29322E',
    backgroundColor: '#151D19',
  },
  statusDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.mint,
  },
  statusDotInactive: { backgroundColor: '#91A0AE' },
  statusText: {
    fontSize: 7,
    letterSpacing: 0.65,
    fontWeight: '700',
    color: '#C0CFBF',
  },
  heading: { marginTop: 22, marginBottom: 18 },
  kicker: {
    fontSize: 8,
    letterSpacing: 1.8,
    fontWeight: '600',
    color: '#8A99A4',
    marginBottom: 11,
  },
  title: {
    fontSize: 33,
    lineHeight: 39,
    letterSpacing: -1.4,
    fontWeight: '600',
    color: colors.text,
  },
  titleAccent: { color: '#BCC9BA' },
  subtitle: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.muted,
    marginTop: 10,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#151B23',
    padding: 4,
    borderRadius: 13,
    marginBottom: 18,
    gap: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 11,
    borderRadius: 10,
  },
  tabActive: { backgroundColor: '#2A323E' },
  tabText: { fontSize: 11, color: colors.muted, fontWeight: '500' },
  tabTextActive: { color: colors.text, fontWeight: '600' },
  hero: {
    height: 270,
    backgroundColor: '#28303A',
    borderRadius: 22,
    overflow: 'hidden',
    justifyContent: 'space-between',
  },
  heroImage: { borderRadius: 22 },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  heroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1118207A',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FFFFFF30',
  },
  heroDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#D9FFCC' },
  heroPillText: {
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: '#FFFFFF',
  },
  heroIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#1118205C',
    borderWidth: 1,
    borderColor: '#FFFFFF30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBottom: { paddingHorizontal: 21, paddingBottom: 23 },
  heroEyebrow: {
    fontSize: 7,
    letterSpacing: 1.65,
    fontWeight: '600',
    color: '#E8DBCE',
    marginBottom: 9,
  },
  heroTitle: {
    fontSize: 29,
    letterSpacing: -0.9,
    fontWeight: '500',
    color: '#FFFFFF',
    marginBottom: 13,
  },
  heroMeta: { flexDirection: 'row', gap: 7, alignItems: 'center' },
  heroMetaText: { fontSize: 11, fontWeight: '500', color: '#F0EDE8' },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#FFFFFF80',
    marginHorizontal: 3,
  },
  heroMetaTime: { fontSize: 10, color: '#D0CDCA' },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 23,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.25,
    color: colors.text,
  },
  sectionHint: {
    fontSize: 7,
    fontWeight: '600',
    letterSpacing: 1.1,
    color: '#7F8A98',
  },
  moments: { flexDirection: 'row', gap: 9 },
  moment: { flex: 1 },
  thumbnailFrame: {
    padding: 3,
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderRadius: 14,
  },
  thumbnailSelected: { borderColor: colors.mint },
  thumbnail: {
    height: 87,
    overflow: 'hidden',
    borderRadius: 9,
    backgroundColor: '#293445',
  },
  thumbnailImage: { borderRadius: 9 },
  thumbShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#00000015',
  },
  thumbnailIcon: { position: 'absolute', top: 8, left: 7 },
  selectedTick: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  momentName: {
    textAlign: 'center',
    color: '#A1AAB6',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 7,
  },
  momentNameSelected: { color: colors.mint },
  momentTime: {
    textAlign: 'center',
    color: '#677585',
    fontSize: 9,
    marginTop: 4,
  },
  editCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#2B333D',
    padding: 12,
    borderRadius: 14,
  },
  editIcon: {
    width: 35,
    height: 35,
    borderRadius: 10,
    backgroundColor: '#212D27',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editCopy: { flex: 1 },
  editTitle: { fontSize: 12, fontWeight: '500', color: '#E6E9ED' },
  editHint: { fontSize: 10, color: colors.muted, lineHeight: 14, marginTop: 4 },
  addPhoto: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 9,
    backgroundColor: '#2A333D',
  },
  addPhotoText: { fontSize: 11, color: '#DEE4EC', fontWeight: '600' },
  resetButton: {
    alignSelf: 'center',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  resetText: {
    fontSize: 10,
    color: '#929EAA',
    textDecorationLine: 'underline',
  },
  autoPanel: {
    marginTop: 17,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#191F27',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 13,
  },
  autoIcon: { width: 32, alignItems: 'center' },
  autoCopy: { flex: 1 },
  autoTitle: { fontSize: 12, color: colors.text, fontWeight: '500' },
  autoSubtitle: {
    fontSize: 10,
    lineHeight: 14,
    color: '#8D99A5',
    marginTop: 4,
  },
  collectionFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    paddingTop: 14,
    paddingBottom: 5,
  },
  footerInfo: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 },
  footerInfoText: { fontSize: 9, color: '#768480' },
  personalCount: { fontSize: 8, color: '#7F8A97' },
  dock: {
    borderTopWidth: 1,
    borderColor: '#252D35',
    backgroundColor: '#11171E',
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 26,
  },
  dockStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
    maxWidth: 516,
    width: '100%',
    alignSelf: 'center',
  },
  dockStatusCopy: { flex: 1 },
  dockTitle: { fontSize: 12, color: '#ECF1F3', fontWeight: '500' },
  dockSubtitle: { fontSize: 10, color: colors.muted, marginTop: 4 },
  activeCheck: {
    width: 29,
    height: 29,
    borderRadius: 15,
    backgroundColor: '#25362B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    borderRadius: 13,
    minHeight: 51,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 13,
    backgroundColor: colors.mint,
    maxWidth: 516,
    width: '100%',
    alignSelf: 'center',
  },
  primaryButtonText: { fontSize: 13, fontWeight: '700', color: '#172A1C' },
  primaryPressed: { backgroundColor: '#A8D99F' },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.5 },
  scheduleCard: {
    backgroundColor: '#161C24',
    padding: 18,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#28313B',
  },
  scheduleHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  scheduleKicker: {
    fontSize: 7,
    color: colors.mint,
    letterSpacing: 1.3,
    marginBottom: 8,
  },
  scheduleTitle: {
    fontSize: 17,
    fontWeight: '500',
    letterSpacing: -0.5,
    color: colors.text,
  },
  scheduleIntro: {
    fontSize: 10,
    color: colors.muted,
    lineHeight: 17,
    marginTop: 10,
    marginBottom: 21,
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 84,
  },
  timeline: { width: 34, alignSelf: 'stretch', alignItems: 'center' },
  timelineCircle: {
    height: 34,
    width: 34,
    borderRadius: 17,
    backgroundColor: '#232C37',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  timelineCircleActive: {
    backgroundColor: '#2A3D30',
    borderWidth: 1,
    borderColor: '#5C8060',
  },
  timelineLine: {
    width: 1,
    flex: 1,
    backgroundColor: '#303B46',
    marginTop: 5,
    marginBottom: -7,
  },
  scheduleCopy: { flex: 1 },
  scheduleLabel: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  scheduleName: { fontSize: 12, color: '#EDF0F3', fontWeight: '500' },
  scheduleTime: { fontSize: 11, color: colors.muted, marginTop: 6 },
  scheduleNow: {
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: '#2A3D30',
  },
  scheduleNowText: {
    fontSize: 6,
    color: colors.mint,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  scheduleThumbnail: { width: 34, height: 44, borderRadius: 6 },
  localTimeNote: {
    marginTop: 14,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#2A323B',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  localTimeText: { fontSize: 9, color: colors.muted, flex: 1, lineHeight: 13 },
  errorBox: {
    backgroundColor: '#342C2A',
    borderWidth: 1,
    borderColor: '#5A443D',
    padding: 18,
    borderRadius: 14,
  },
  errorText: { fontSize: 12, lineHeight: 18, color: '#F2D3C3' },
  retry: { paddingVertical: 10, alignSelf: 'flex-start' },
  retryText: { fontSize: 12, fontWeight: '600', color: colors.mint },
  loading: { padding: 60 },
});
