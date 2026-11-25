import { useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppScreen } from '@/design/layout';
import { AppImage } from '@/design/appImage';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useReduceMotion } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { RADIUS } from '@/design/tokens.mobile';
import { AppText, Button, Field, Segmented } from '@/design/ui';
import { PersonalLayout } from '@/features/personal/PersonalLayout';
import { formatMoney } from '@/format/money';
import { useT } from '@/i18n';
import { useSession } from '@/state/session';
import { giftDeliveryModes, giftDesignsFor, giftFormats, giftPresets, giftPreviewMax, giftPreviewMin, parseGiftPreviewAmount,
  type GiftDeliveryMode, type GiftDesign, type GiftFormat } from '../../../../../shared/giftCardPreview';
import { GiftArt, GiftWalletArt } from './GiftArt';
import { giftDetail, giftShop } from './paths';

const brandHero = require('../../../assets/images/gift-cards-hero.jpg');
const modeIcons = { print: 'print-outline', email: 'mail-outline', link: 'link-outline' } as const;
const range = (format: GiftFormat) => `${formatMoney(giftPreviewMin(format))} – ${formatMoney(giftPreviewMax)}`;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <View style={styles.section}><AppText variant="h3" accessibilityRole="header">{title}</AppText>{children}</View>;
}
function Badge() {
  const theme = useTheme(); const t = useT();
  return <AppText variant="captionStrong" color={theme.colors.onAccentSoft} style={[styles.badge, { backgroundColor: theme.colors.accentSoft }]}>{t('gift.preview')}</AppText>;
}

function GiftInfo() {
  const t = useT(); const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  return <View style={[styles.info, { borderColor: theme.colors.line }]}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} style={[styles.inline, { flexDirection: rowDirectionFor(theme.isRTL) }]}
      onPress={() => setExpanded(value => !value)}>
      <Ionicons name="information-circle-outline" size={theme.iconSize.md} color={theme.colors.ink} />
      <AppText variant="bodyStrong" style={styles.grow}>{t('gift.info')}</AppText>
      <Ionicons name={expanded ? 'chevron-up-outline' : 'chevron-down-outline'} size={theme.iconSize.sm} color={theme.colors.ink} />
    </Pressable>
    {expanded ? <View style={styles.stack}>
      <AppText>{t('gift.purchaseOnly')}</AppText>
      <AppText>{t('gift.secureEmail')}</AppText>
      <AppText variant="bodySmall" color={theme.colors.muted}>{t('gift.noLive')}</AppText>
    </View> : null}
  </View>;
}

export function GiftCatalog() {
  const theme = useTheme(); const t = useT(); const reduced = useReduceMotion();
  const scroll = useRef<ScrollView>(null);
  const position = useRef(0);
  // Onglet local : le hub garde son hero et propose « Boutique | Mes cartes »
  // juste en dessous (remplace l'ancien onglet de la barre du bas).
  const [view, setView] = useState<'catalogue' | 'wallet'>('catalogue');
  const [favorites, setFavorites] = useState<string[]>([]);
  const mark = (key: string) => setFavorites(values => values.includes(key) ? values.filter(value => value !== key) : [...values, key]);
  const direction = rowDirectionFor(theme.isRTL);
  return <AppScreen scroll={false} chrome={false} hasBottomBar padded={false} keyboard={false}>
    <ScrollView ref={scroll} style={styles.fill} contentContainerStyle={styles.catalogFrame}>
      <View style={styles.hero}>
        <AppImage localSource={brandHero} decorative contentFit="cover" style={styles.heroImage} />
        <View style={styles.stack}>
          <Badge />
          <AppText variant="h2" accessibilityRole="header">{t('gift.shopHeadline')}</AppText>
          <AppText color={theme.colors.muted}>{t('gift.shopBody')}</AppText>
          <Button label={t('gift.discover')} size="lg" block onPress={() => scroll.current?.scrollTo({ y: position.current, animated: !reduced })} />
          <Button label={t('gift.walletTitle')} tone="quiet" block onPress={() => setView('wallet')} />
        </View>
      </View>
      <Segmented
        label={t('gift.tabsCatalogueLabel')}
        value={view}
        onChange={setView}
        options={[{ value: 'catalogue', label: t('gift.tabs.catalogue') }, { value: 'wallet', label: t('gift.tabs.wallet') }]}
      />
      {view === 'wallet' ? <View style={styles.stack}>
        <AppText variant="h2" accessibilityRole="header">{t('gift.walletTitle')}</AppText>
        <GiftWalletBody />
      </View> : <>
      <GiftInfo />
      {giftFormats.slice().reverse().map(format => <View key={format} style={styles.section}
        onLayout={format === 'physical' ? (event: LayoutChangeEvent) => { position.current = event.nativeEvent.layout.y; } : undefined}>
        <View style={styles.stack}>
          <AppText variant="h2" accessibilityRole="header">{t(`gift.format.${format}`)}</AppText>
          <AppText>{t(`gift.formatBody.${format}`)}</AppText>
          <AppText variant="caption" color={theme.colors.muted}>{t('gift.previewRange', { range: range(format) })}</AppText>
        </View>
        <View style={[styles.grid, { flexDirection: direction }]}>
          {giftDesignsFor(format).map(design => {
            const key = `${format}:${design}`;
            const saved = favorites.includes(key);
            const name = t(`gift.design.${design}`);
            return <View key={design} style={styles.tile}>
              <Pressable testID={`gift-tile-${format}-${design}`} accessibilityRole="link" accessibilityLabel={`${name} · ${t(`gift.format.${format}`)}`}
                onPress={() => router.push(giftDetail(format, design))} style={styles.tileLink}>
                <View style={styles.cover}><GiftArt design={design} format={format} /></View>
                <AppText variant="captionStrong">{t('gift.brand')}</AppText>
                <AppText variant="bodyStrong">{name}</AppText>
                <AppText variant="caption" color={theme.colors.muted}>{t('gift.from', { amount: formatMoney(giftPreviewMin(format)) })}</AppText>
              </Pressable>
              <Pressable accessibilityRole="togglebutton" accessibilityState={{ checked: saved }}
                accessibilityLabel={`${t(saved ? 'gift.unsave' : 'gift.save')} · ${name}`} onPress={() => mark(key)}
                style={[styles.like, { backgroundColor: theme.colors.canvas, borderColor: theme.colors.line }] }>
                <Ionicons name={saved ? 'heart' : 'heart-outline'} size={theme.iconSize.sm} color={theme.colors.ink} />
              </Pressable>
            </View>;
          })}
        </View>
      </View>)}
      </>}
    </ScrollView>
  </AppScreen>;
}

/**
 * Corps du portefeuille — partagé par l'écran autonome (`/account/gift-cards`)
 * et par l'onglet « Mes cartes » du hub. Une seule vérité : le portefeuille ne
 * prétend jamais contenir une carte qui n'existe pas côté serveur.
 */
function GiftWalletBody() {
  const theme = useTheme(); const t = useT();
  return <>
    <Badge />
    <AppText>{t('gift.purchaseOnly')}</AppText>
    <Field label={t('gift.codeEntry')} placeholder={t('gift.codePlaceholder')} editable={false} />
    <Button label={t('gift.add')} block disabled onPress={() => {}} />
    <AppText variant="bodySmall" color={theme.colors.muted}>{t('gift.walletUnavailable')}</AppText>
    <View style={styles.empty}>
      <GiftWalletArt />
      <AppText variant="subtitle" align="center">{t('gift.walletEmpty')}</AppText>
      <Button label={t('gift.buy')} block size="lg" onPress={() => router.navigate(giftShop)} />
    </View>
    <GiftInfo />
  </>;
}

export function GiftWallet() {
  const t = useT();
  return <PersonalLayout title={t('gift.walletTitle')} fallback="/(tabs)/account">
    <GiftWalletBody />
  </PersonalLayout>;
}

export function GiftDesigner() {
  const params = useLocalSearchParams<{ format?: string; design?: string }>();
  const format = giftFormats.find(value => value === params.format) ?? 'digital';
  const design = giftDesignsFor(format).find(value => value === params.design) ?? giftDesignsFor(format)[0];
  const { status, account } = useSession();
  // A draft opened before sign-in stays mounted when sign-in is a modal. Drafts
  // contain no wallet secrets and nothing is submitted to any backend.
  return <Designer key={`${format}:${design}`} format={format} initial={design} verifiedEmail={status === 'signedIn' && account?.emailVerified ? account.email : ''} signedIn={status === 'signedIn'} />;
}

function Designer({ format, initial, verifiedEmail, signedIn }: { format: GiftFormat; initial: GiftDesign; verifiedEmail: string; signedIn: boolean }) {
  const theme = useTheme(); const t = useT();
  const [design, setDesign] = useState(initial);
  const [mode, setMode] = useState<GiftDeliveryMode>('email');
  const [forSelf, setForSelf] = useState(false);
  const [amount, setAmount] = useState('50');
  const [greeting, setGreeting] = useState(t('gift.greetingDefault'));
  const [message, setMessage] = useState('');
  const [recipient, setRecipient] = useState('');
  const [checked, setChecked] = useState(false);
  const [preview, setPreview] = useState(false);
  const [access, setAccess] = useState(false);
  const millimes = parseGiftPreviewAmount(amount, format);
  const email = (forSelf && verifiedEmail ? verifiedEmail : recipient).trim().toLowerCase();
  const validRecipient = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const resetPreview = () => { setPreview(false); setAccess(false); setChecked(false); };
  const direction = rowDirectionFor(theme.isRTL);
  const allowed = Boolean(verifiedEmail && verifiedEmail.trim().toLowerCase() === email);
  const chooseStyle = (value: GiftDesign) => { setDesign(value); resetPreview(); };
  return <PersonalLayout title={t('gift.designTitle')} fallback="/(tabs)/gift-cards">
    <Badge />
    <View style={styles.featured}><View style={styles.cover}><GiftArt design={design} format={format} /></View></View>
    <View style={styles.stack}>
      <AppText variant="h2" accessibilityRole="header">{t(`gift.design.${design}`)}</AppText>
      <AppText variant="bodyStrong">{t(`gift.format.${format}`)}</AppText>
      <AppText color={theme.colors.muted}>{t('gift.previewRange', { range: range(format) })}</AppText>
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={[styles.swatches, { flexDirection: direction }]}>
      {giftDesignsFor(format).map(value => <Pressable key={value} accessibilityRole="radio"
        accessibilityLabel={t(`gift.design.${value}`)} accessibilityState={{ checked: design === value }} onPress={() => chooseStyle(value)}
        style={[styles.swatch, { borderColor: design === value ? theme.colors.ink : theme.colors.line }]}>
        <View style={styles.cover}><GiftArt design={value} format={format} /></View>
      </Pressable>)}
    </ScrollView>
    <Section title={t('gift.amountTitle')}>
      <View style={[styles.grid, { flexDirection: direction }]}>
        {giftPresets.map(preset => <Choice key={preset} label={formatMoney(preset)} selected={millimes === preset * 1000}
          onPress={() => { setAmount(String(preset)); resetPreview(); }} wide />)}
      </View>
      <Field label={t('gift.customAmount')} value={amount} keyboardType="decimal-pad" maxLength={8} onChangeText={value => { setAmount(value); resetPreview(); }} />
    </Section>
    <Section title={t('gift.shareTitle')}>
      {format === 'digital' ? <>
        <View style={[styles.modes, { flexDirection: direction }]}>
          {giftDeliveryModes.map(value => <Choice key={value} label={t(`gift.mode.${value}`)} icon={modeIcons[value]} selected={mode === value}
            onPress={() => { setMode(value); resetPreview(); }} />)}
        </View>
        <AppText color={theme.colors.muted}>{t(`gift.modeBody.${mode}`)}</AppText>
      </> : <AppText color={theme.colors.muted}>{t('gift.physicalBody')}</AppText>}
      <View style={[styles.modes, { flexDirection: direction }]}>
        <Choice label={t('gift.forSelf')} selected={forSelf} onPress={() => { setForSelf(true); resetPreview(); }} />
        <Choice label={t('gift.forOther')} selected={!forSelf} onPress={() => { setForSelf(false); resetPreview(); }} />
      </View>
      <Field label={t('gift.recipient')} value={forSelf && verifiedEmail ? verifiedEmail : recipient} editable={!forSelf || !verifiedEmail} maxLength={254} keyboardType="email-address" autoCapitalize="none" autoCorrect={false}
        onChangeText={value => { setRecipient(value); resetPreview(); }} />
      <Field label={t('gift.greeting')} value={greeting} maxLength={64} onChangeText={value => { setGreeting(value); resetPreview(); }} />
      <Field label={t('gift.message')} value={message} placeholder={t('gift.messageHint')} maxLength={280} multiline style={styles.message}
        onChangeText={value => { setMessage(value); resetPreview(); }} />
    </Section>
    <GiftInfo />
    <Button label={t('gift.review')} size="lg" block onPress={() => { setChecked(true); setPreview(millimes !== null && validRecipient); setAccess(false); }} />
    {checked && millimes === null ? <AppText accessibilityRole="alert" color={theme.status.danger.fg}>{t('gift.amountError', { range: range(format) })}</AppText> : null}
    {checked && !validRecipient ? <AppText accessibilityRole="alert" color={theme.status.danger.fg}>{t('gift.emailError')}</AppText> : null}
    {preview && millimes !== null ? <View testID="gift-preview-summary" style={[styles.review, { borderColor: theme.colors.lineControl }]}>
      <Badge />
      <AppText variant="h3" accessibilityRole="header">{t('gift.summary')}</AppText>
      <AppText variant="bodyStrong">{formatMoney(millimes / 1000)} · {t(`gift.design.${design}`)}</AppText>
      <AppText>{t(forSelf ? 'gift.forSelf' : 'gift.forOther')} · {email}</AppText>
      <AppText>{t('gift.codeByEmail')}</AppText>
      {greeting.trim() ? <AppText variant="bodyStrong">{greeting.trim()}</AppText> : null}
      {message.trim() ? <AppText>{message.trim()}</AppText> : null}
      <AppText>{t('gift.noLive')}</AppText>
      <Button label={t('gift.viewCode')} tone="quiet" block onPress={() => { if (!signedIn) router.push('/sign-in'); else setAccess(true); }} />
      {access ? <AppText accessibilityRole="alert">{t(allowed ? 'gift.noCode' : 'gift.identityRequired')}</AppText> : null}
    </View> : null}
  </PersonalLayout>;
}

function Choice({ label, selected, onPress, icon, wide }: { label: string; selected: boolean; onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap; wide?: boolean }) {
  const theme = useTheme();
  return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress}
    style={[styles.choice, wide ? styles.amount : styles.mode, { borderColor: selected ? theme.colors.ink : theme.colors.lineControl,
      borderWidth: selected ? 2 : 1, backgroundColor: selected ? theme.colors.accentSoft : theme.colors.canvas }]}>
    {icon ? <Ionicons name={icon} size={theme.iconSize.md} color={selected ? theme.colors.onAccentSoft : theme.colors.ink} /> : null}
    <AppText variant={selected ? 'captionStrong' : 'caption'} color={selected ? theme.colors.onAccentSoft : theme.colors.ink} align="center">{label}</AppText>
  </Pressable>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 }, catalogFrame: { width: '100%', maxWidth: 660, alignSelf: 'center', padding: 16, gap: 24 },
  stack: { gap: 8 }, section: { gap: 12 }, grow: { flex: 1 }, hero: { gap: 16 },
  heroImage: { width: '100%', aspectRatio: 1.22, borderRadius: RADIUS.md, overflow: 'hidden' },
  badge: { alignSelf: 'flex-start', borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 4 },
  info: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 8, gap: 8 },
  inline: { alignItems: 'center', gap: 8, minHeight: 44 }, cover: { borderRadius: RADIUS.sm, overflow: 'hidden' },
  grid: { justifyContent: 'space-between', flexWrap: 'wrap', rowGap: 16 }, tile: { width: '48%' }, tileLink: { gap: 4 },
  like: { width: 44, height: 44, borderRadius: RADIUS.full, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center',
    alignSelf: 'flex-end', marginTop: 4 },
  empty: { alignItems: 'center', gap: 16, paddingVertical: 16 },
  featured: { width: '100%', maxWidth: 358, alignSelf: 'center' }, swatches: { gap: 8 }, swatch: { width: 64, padding: 2, borderWidth: 2, borderRadius: RADIUS.sm },
  choice: { minHeight: 52, borderRadius: RADIUS.sm, padding: 8, gap: 4, alignItems: 'center', justifyContent: 'center' },
  amount: { width: '48%' }, modes: { gap: 8 }, mode: { flex: 1, minHeight: 84 },
  message: { minHeight: 96 }, review: { padding: 16, gap: 12, borderRadius: RADIUS.md, borderWidth: StyleSheet.hairlineWidth },
});
