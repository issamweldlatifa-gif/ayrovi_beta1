import { useEffect, useRef, useState } from 'react';
import { AppState, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { VideoView, useVideoPlayer } from 'expo-video';
import { mediaUrl } from '@/api/client';
import { AppImage } from '@/design/appImage';
import { RADIUS } from '@/design/tokens.mobile';
import { useT } from '@/i18n';
import { PublicationIcon, PublicationText } from './publicationDesign';
import { PUBLICATION_PALETTE as P, PUBLICATION_PLAYER as C } from './publicationTokens';

export type PublicationPlayback = { time: number; muted: boolean };
const SPEEDS = [0.5, 1, 1.25, 1.5, 2];
const clamp = (value: number, max: number) => Math.min(Math.max(0, value), max);

export function PublicationFullscreenVideo({ url, poster, start, onClose }: {
  url: string; poster: string; start: PublicationPlayback; onClose: (state: PublicationPlayback) => void;
}) {
  const t = useT();
  const { bottom, left, right } = useSafeAreaInsets();
  const [ready, setReady] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(start.muted);
  const [visible, setVisible] = useState(true);
  const [menu, setMenu] = useState<'settings' | 'quality' | 'diagnostics' | 'speed' | null>(null);
  const [time, setTime] = useState(start.time);
  const [duration, setDuration] = useState(0);
  const [resolution, setResolution] = useState(0);
  const [trackWidth, setTrackWidth] = useState(0);
  const [dragProgress, setDragProgress] = useState<number | null>(null);
  const seekPageStart = useRef(0);
  const [speed, setSpeed] = useState(1);
  const [status, setStatus] = useState('idle');
  const player = useVideoPlayer({ uri: mediaUrl(url) }, instance => {
    instance.muted = start.muted;
    instance.currentTime = start.time;
    instance.loop = true;
    instance.timeUpdateEventInterval = 0.25;
  });
  useEffect(() => {
    const refresh = () => {
      const receivedDuration = player.duration;
      setDuration(Number.isFinite(receivedDuration) && receivedDuration > 0 ? receivedDuration : 0);
      const size = player.videoTrack?.size;
      setResolution(size ? Math.min(size.width, size.height) : 0);
    };
    setStatus(player.status);
    refresh();
    const subs = [
      AppState.addEventListener('change', value => setForeground(value === 'active')),
      player.addListener('statusChange', ({ status: next }) => { setStatus(next); refresh(); }),
      player.addListener('sourceLoad', refresh),
      player.addListener('videoTrackChange', refresh),
      player.addListener('timeUpdate', ({ currentTime }) => setTime(currentTime)),
    ];
    return () => subs.forEach(item => item.remove());
  }, [player]);
  useEffect(() => { if (foreground && !paused) player.play(); else player.pause(); }, [foreground, paused, player]);
  useEffect(() => { player.muted = muted; }, [muted, player]);
  useEffect(() => { player.playbackRate = speed; }, [speed, player]);
  const seek = (position: number) => {
    if (!duration || !Number.isFinite(position)) return;
    player.currentTime = clamp(position, duration);
    setTime(player.currentTime);
  };
  const close = () => onClose({ time: Number.isFinite(player.currentTime) ? player.currentTime : 0, muted });
  const back = () => menu ? setMenu(menu === 'quality' || menu === 'diagnostics' ? 'settings' : null) : close();
  const toggleControls = () => { setMenu(null); setVisible(value => menu ? true : !value); };
  const quality = resolution ? `${resolution}p` : t('publication.playerAuto');
  const progress = dragProgress ?? (duration ? clamp(time, duration) / duration : 0);
  const fraction = (x: number) => trackWidth ? clamp(x / trackWidth, 1) : 0;
  const button = (name: Parameters<typeof PublicationIcon>[0]['name'], label: string, press: () => void, id: string) =>
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={press} testID={id} style={[styles.button, id === 'publication-player-play' && styles.play]}>
      <PublicationIcon name={name} color={P.paper} size={22} />
    </Pressable>;

  return <Modal animationType="none" statusBarTranslucent navigationBarTranslucent supportedOrientations={['portrait', 'landscape']}
    onRequestClose={back}>
    <View style={styles.screen} testID="publication-fullscreen-player">
      <StatusBar hidden />
      {poster && !ready ? <AppImage uri={mediaUrl(poster)} decorative contentFit="contain" style={StyleSheet.absoluteFill} /> : null}
      <VideoView player={player} style={[StyleSheet.absoluteFill, !ready && styles.buffering]} surfaceType="textureView"
        nativeControls={false} contentFit="contain" onFirstFrameRender={() => setReady(true)} />
      <Pressable onPress={toggleControls} accessibilityRole="button" accessibilityLabel={t(visible ? 'publication.playerHide' : 'publication.playerShow')}
        style={StyleSheet.absoluteFill} testID="publication-player-surface" />
      {status === 'error' ? <PublicationText accessibilityRole="alert" color={P.paper} style={styles.error}>{t('publication.videoError')}</PublicationText> : null}
      {visible ? <View pointerEvents="box-none" style={[styles.footer, { paddingBottom: bottom + 6, paddingLeft: left + 8, paddingRight: right + 8 }]}>
        {menu ? <View style={styles.menu} testID={`publication-player-menu-${menu}`}>
          {menu === 'settings' ? <>
            <Pressable style={[styles.menuRow, styles.divider]} accessibilityRole="button" onPress={() => setMenu('quality')}>
              <PublicationText color={P.paper} style={styles.grow}>{t('publication.playerQuality')}</PublicationText>
              <PublicationText color={P.paper}>{quality}</PublicationText>
              <PublicationIcon name="chevron-forward" size={16} color={P.paper} />
            </Pressable>
            <Pressable style={styles.menuRow} accessibilityRole="button" onPress={() => setMenu('diagnostics')}>
              <PublicationIcon name="information-circle-outline" size={16} color={P.paper} />
              <PublicationText color={P.paper}>{t('publication.playerDiagnostics')}</PublicationText>
            </Pressable>
          </> : menu === 'speed' ? SPEEDS.map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: speed === value }}
            style={styles.speedRow} onPress={() => { setSpeed(value); setMenu(null); }}>
            <PublicationText color={P.paper}>{`${value}×`}</PublicationText>
            {speed === value ? <PublicationIcon name="checkmark-outline" size={18} color={P.paper} /> : null}
          </Pressable>) : <>
            <Pressable style={[styles.menuRow, styles.divider]} accessibilityRole="button" onPress={() => setMenu('settings')}>
              <PublicationIcon name="chevron-back" size={16} color={P.paper} />
              <PublicationText color={P.paper}>{t(menu === 'quality' ? 'publication.playerQuality' : 'publication.playerDiagnostics')}</PublicationText>
            </Pressable>
            <View style={styles.menuRow}><PublicationText color={P.paper}>{menu === 'quality'
              ? `${t('publication.playerAuto')}${resolution ? ` · ${quality}` : ''}` : `${status} · ${quality} · ${speed}×`}</PublicationText></View>
          </>}
        </View> : null}
        <View style={styles.bar}>
          {button(paused ? 'play-outline' : 'pause-outline', t(paused ? 'social.play' : 'social.pause'), () => setPaused(value => !value), 'publication-player-play')}
          <View style={styles.seek} onLayout={event => setTrackWidth(event.nativeEvent.layout.width)}
            onStartShouldSetResponder={() => Boolean(duration && trackWidth)}
            onResponderGrant={({ nativeEvent: event }) => {
              seekPageStart.current = event.pageX - event.locationX;
              setDragProgress(fraction(event.locationX));
            }}
            onResponderMove={event => setDragProgress(fraction(event.nativeEvent.pageX - seekPageStart.current))}
            onResponderRelease={event => { seek(fraction(event.nativeEvent.pageX - seekPageStart.current) * duration); setDragProgress(null); }}
            onResponderTerminate={() => setDragProgress(null)} accessible accessibilityRole="adjustable"
            accessibilityLabel={t('publication.playerProgress')} accessibilityState={{ disabled: !duration }} accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={event => seek(time + (event.nativeEvent.actionName === 'increment' ? 5 : -5))} testID="publication-player-seek">
            <View pointerEvents="none" style={styles.track}><View style={[styles.progress, { width: `${progress * 100}%` }]} /></View>
          </View>
          {button(muted ? 'volume-mute-outline' : 'volume-high-outline', t(muted ? 'publication.unmute' : 'publication.mute'), () => setMuted(value => !value), 'publication-player-mute')}
          {button('settings-outline', t('publication.playerSettings'), () => setMenu(value => value ? null : 'settings'), 'publication-player-settings')}
          {button('speedometer-outline', t('publication.playerSpeed'), () => setMenu(value => value === 'speed' ? null : 'speed'), 'publication-player-speed')}
          {button('contract-outline', t('publication.playerExit'), close, 'publication-player-exit')}
          {button('chevron-forward', t('publication.playerHide'), toggleControls, 'publication-player-hide')}
        </View>
      </View> : null}
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: P.backdrop },
  buffering: { opacity: 0 },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  bar: { flexDirection: 'row', direction: 'ltr', alignItems: 'center' },
  button: { width: 30, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  play: { width: 56 },
  seek: { flex: 1, height: 44, marginLeft: 20, marginRight: 4, justifyContent: 'center' },
  track: { height: 4, backgroundColor: C.track, borderRadius: 2, overflow: 'hidden' },
  progress: { height: '100%', backgroundColor: C.progress },
  menu: { borderRadius: RADIUS.sm, backgroundColor: C.menu, overflow: 'hidden' },
  menuRow: { minHeight: 56, paddingHorizontal: 20, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.track },
  speedRow: { minHeight: 44, paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  grow: { flex: 1 },
  error: { alignSelf: 'center', marginTop: 48, padding: 8, backgroundColor: C.menu },
});
