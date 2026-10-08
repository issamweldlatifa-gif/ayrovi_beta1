/**
 * الشراء — P5، الشريحة 2: من السلّة إلى **طلب حقيقي**.
 *
 * الخطوات: العنوان → وسيلة الخلاص → إرسال → تأكيد من الخادم.
 *
 * قواعد ما تتزحلقش:
 *  • **الطلب يتخلق قبل الخلاص** (`PENDING_SELECTION` في الجسم): الطلب هو المرجع،
 *    والخلاص يتعلّق بيه بمعرّفه. الكارطة تُفتح بعد ما الطلب يوجد.
 *  • **الوسيلة المعلنة = الوسيلة الممكنة**: `paymentChoices` تربط إعلان الخادم
 *    (`paymentMethods`) بالتوفّر التقني (بوابة، RIB، حساب بريدي). المقفولة تتعرض
 *    بعلاش — بلا زرّ يخلّيك تكمل وتُرفض في الأخير.
 *  • **الرقم التونسي والوضعية** يتحقّقوا قبل الإرسال (نفس قواعد الويب)، والرفض
 *    يجي بالسبب.
 *  • **العربون من الخادم**: النسبة تتعرض من السياسة، والمبلغ الفعلي يجي في ردّ
 *    إنشاء الطلب — ما نحسبوش عربوناً في الجهاز.
 *  • **بلا «نجاح» مصنوع**: بلا `orderNumber` من الخادم ما فماش شاشة نجاح.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Pressable, StyleSheet, View,
  type LayoutChangeEvent, type ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';

import { AppText, Button, Card, Field, KeyValue } from '@/design/ui';
import { SubScreen } from '@/design/subScreen';
import { JourneyProgress, type JourneyStep } from '@/features/checkout/JourneyProgress';
import { resolveJourneyStep, journeyCompletion } from '@/features/checkout/journey';
import { ErrorBlock, LoadingBlock } from '@/design/states';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';
import { isApiError, userMessage } from '@/api/errors';
import { fetchAddresses, type Address } from '@/api/account';
import { ayroviCartReadiness, fetchAyroviCart } from '@/api/cart';
import {
  availablePaymentChoices, checkoutRefusalText, fetchCommercePolicy, initiateCardPayment, paymentChoices,
  refuseCheckout, resolvePaymentMethod, submitCheckout, type CheckoutResult,
} from '@/api/checkout';
import { useAyWebsSessionId } from '@/features/aywebs/session';
import { useSession } from '@/state/session';

export default function CheckoutScreen() {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const sessionId = useAyWebsSessionId();
  const session = useSession();
  const queryClient = useQueryClient();

  const account = session.account;
  const authenticated = session.status === 'signedIn' && Boolean(account);

  const cartQuery = useQuery({
    queryKey: ['cart', 'ayrovi'],
    enabled: Boolean(sessionId),
    queryFn: ({ signal }) => fetchAyroviCart({ sessionId, signal }),
    staleTime: 0,
  });
  const policyQuery = useQuery({
    queryKey: ['commerce', 'policy'],
    queryFn: ({ signal }) => fetchCommercePolicy({ signal }),
    staleTime: 5 * 60_000,
  });
  const addressesQuery = useQuery({
    queryKey: ['account', 'addresses'],
    enabled: authenticated,
    queryFn: ({ signal }) => fetchAddresses({ signal }),
    staleTime: 60_000,
  });

  const [addressId, setAddressId] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [governorate, setGovernorate] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState(false);
  const [method, setMethod] = useState('');
  const [note, setNote] = useState('');
  const [result, setResult] = useState<CheckoutResult | null>(null);

  /* ── مسلك الطلب: المرحلة تُقرا من **التمرير**، موش من عدّاد ────────────── */
  const scrollRef = useRef<ScrollView | null>(null);
  const offsets = useRef<Record<string, number>>({});
  const [activeStep, setActiveStep] = useState(0);

  const steps = useMemo<JourneyStep[]>(() => [
    { id: 'address', label: t('checkout.step.address'), icon: 'location-outline' },
    { id: 'payment', label: t('checkout.step.payment'), icon: 'card-outline' },
    { id: 'confirm', label: t('checkout.step.confirm'), icon: 'checkmark-circle-outline' },
  ], [t]);

  const remember = useCallback((key: string) => (event: LayoutChangeEvent) => {
    offsets.current[key] = event.nativeEvent.layout.y;
  }, []);

  const handleScroll = useCallback((event: { nativeEvent: { contentOffset: { y: number } } }) => {
    setActiveStep(resolveJourneyStep(event.nativeEvent.contentOffset.y, offsets.current));
  }, []);

  const goToStep = useCallback((index: number) => {
    const key = ['address', 'payment', 'confirm'][index];
    const y = offsets.current[key ?? ''] ?? 0;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 72), animated: true });
  }, []);

  const policy = policyQuery.data ?? null;
  const cart = cartQuery.data ?? null;
  const cartGate = useMemo(() => ayroviCartReadiness(cart), [cart]);
  const choices = useMemo(() => (policy ? paymentChoices(policy) : []), [policy]);
  const available = useMemo(() => (policy ? availablePaymentChoices(policy) : []), [policy]);
  const addresses = addressesQuery.data ?? [];

  const contactEmail = account?.email ?? '';
  /* نفس حكم الخادم: كان الإيميل موثّق والتلفون لا، الإيميل يتقفل على المؤكّد. */
  const emailLocked = Boolean(account?.emailVerified) && !account?.phoneVerified;

  const pickAddress = useCallback((address: Address) => {
    setAddressId(address.id);
    setName(address.recipientName);
    setPhone(address.phone);
    setGovernorate(address.governorate || '');
    setAddressLine([address.addressLine, address.city, address.postalCode].filter(Boolean).join(', '));
    setNotes(address.deliveryNotes);
  }, []);

  const submit = useMutation({
    mutationFn: async () => {
      const identity = {
        authenticated,
        emailVerified: Boolean(account?.emailVerified),
        phoneVerified: Boolean(account?.phoneVerified),
      };
      const refusal = refuseCheckout(identity, {
        name, email: contactEmail, phone, address: addressLine, termsAccepted: terms,
      });
      if (refusal) throw Object.assign(new Error(refusal), { code: refusal });

      const resolved = resolvePaymentMethod(method, {
        anyAvailable: available.length > 0,
        isAvailable: (id) => available.some((choice) => choice.id === id),
      });
      if ('refusal' in resolved) throw Object.assign(new Error('PAYMENT_UNAVAILABLE'), { code: 'PAYMENT_UNAVAILABLE' });

      const order = await submitCheckout({
        name, email: contactEmail, phone, city: governorate, address: addressLine,
        deliveryMode: 'home', latitude: null, longitude: null, locale, termsAccepted: true,
      }, { sessionId });

      // الكارطة بعد الطلب: الخلاص يتعلّق بمرجع موجود. الفشل ما يضيّعش الطلب.
      if (resolved.method === 'CARD') {
        try {
          const payment = await initiateCardPayment(order.orderId);
          await WebBrowser.openBrowserAsync(payment.payUrl);
        } catch {
          // الطلب موجود: نقولوها بصراحة ونخلّيو الباب مفتوح للخلاص من صفحة الطلب.
        }
      }
      return order;
    },
    onSuccess: (order) => {
      setResult(order);
      setNote('');
      queryClient.invalidateQueries({ queryKey: ['cart', 'ayrovi'] });
      queryClient.invalidateQueries({ queryKey: ['account', 'orders'] });
    },
    onError: (error) => {
      const refusal = checkoutRefusalText(error);
      if (refusal.key) {
        setNote(t(refusal.key as never));
        return;
      }
      // كود مجهول (الخادم سبق التطبيق): رسالة بلغة المستعمل + الكود للترصّد.
      // نص الخادم فرنسي دائماً — ما نعرضوهش لمستعمل عربي.
      const base = isApiError(error) ? userMessage(error)[locale] : t('checkout.failed');
      setNote(refusal.code ? `${base} (${refusal.code})` : base);
    },
  });

  /**
   * شرط واحد لكل حاجة ⇒ ما يتباعدوش.
   *
   * مؤشّر يقول «الدفع تمّ» والزرّ معطّل هو كذبة بصريّة؛ وزرّ مفعّل يولّي
   * لخطأ `PAYMENT_UNAVAILABLE` بعد الضغطة هو كذبة أسوء. الحلّ: الشروط تتكتب
   * مرّة وحدة، وتُستعمل في **المؤشّر والزرّ** معاً.
   */
  const addressValid = name.trim().length > 1 && phone.trim().length > 5
    && addressLine.trim().length > 3 && Boolean(governorate.trim());
  /** هل الدفع **جاهز**؟ موش «مكتمل»: ما فمّاش بوّابة ⇒ الخادم يأجّل الدفع (`PENDING_SELECTION`) موش يرفضو. */
  const paymentChosen = Boolean(method) && available.some((choice) => choice.id === method);
  const paymentReady = available.length > 0 ? paymentChosen : true;
  const completedSteps = journeyCompletion({ addressValid, paymentValid: paymentReady });

  const identityReady = authenticated && Boolean(account?.emailVerified || account?.phoneVerified);
  const canSubmit = Boolean(sessionId)
    && cartGate.canCheckout
    && identityReady
    && addressValid
    && paymentReady
    && terms;

  /* ── شاشة التأكيد: كل رقم من الخادم ───────────────────────────────────── */
  if (result) {
    return (
      <SubScreen title={t('checkout.doneTitle')} subtitle={t('checkout.doneHint')} fallback="/cart">
        <Card>
          <KeyValue label={t('checkout.orderNumber')} value={result.orderNumber} />
          <KeyValue label={t('checkout.total')} value={`${result.totalTND.toFixed(2)} TND`} />
          <KeyValue label={t('checkout.items')} value={String(result.itemCount)} />
          {result.deposit.amountTND != null ? (
            <KeyValue
              label={t('checkout.deposit', { percent: String(result.deposit.percent ?? '') })}
              value={`${result.deposit.amountTND.toFixed(2)} TND`}
            />
          ) : null}
          {result.deposit.balanceTND != null ? (
            <KeyValue label={t('checkout.balance')} value={`${result.deposit.balanceTND.toFixed(2)} TND`} />
          ) : null}
          {result.message ? (
            <AppText variant="caption" color={theme.colors.muted}>{result.message}</AppText>
          ) : null}
          <Button label={t('checkout.openOrder')} onPress={() => router.replace(`/orders/${result.orderId}`)} />
          <Button label={t('checkout.backToCart')} tone="quiet" onPress={() => router.replace('/cart')} />
        </Card>
      </SubScreen>
    );
  }

  /* ── بوّابات حقيقية قبل الفورم ─────────────────────────────────────────── */
  if (!authenticated) {
    return (
      <SubScreen title={t('checkout.title')} subtitle={t('checkout.hint')} fallback="/cart">
        <Card>
          <AppText variant="body">{t('checkout.authRequired')}</AppText>
          <Button label={t('checkout.signIn')} onPress={() => router.push('/sign-in')} />
        </Card>
      </SubScreen>
    );
  }

  if (session.status !== 'loading' && !identityReady) {
    return (
      <SubScreen title={t('checkout.title')} subtitle={t('checkout.hint')} fallback="/cart">
        <Card>
          <AppText variant="body">{t('checkout.contactRequired')}</AppText>
          <Button label={t('checkout.verifyNow')} onPress={() => router.push('/account/security')} />
        </Card>
      </SubScreen>
    );
  }

  return (
    <SubScreen
      title={t('checkout.title')}
      subtitle={t('checkout.hint')}
      fallback="/cart"
      scrollRef={scrollRef}
      onScroll={handleScroll}
      sticky={(
        <JourneyProgress
          steps={steps}
          activeIndex={activeStep}
          completed={completedSteps}
          onStepPress={goToStep}
        />
      )}
    >
      {cartQuery.isError ? <ErrorBlock error={cartQuery.error} onRetry={() => cartQuery.refetch()} /> : null}
      {policyQuery.isError ? <ErrorBlock error={policyQuery.error} onRetry={() => policyQuery.refetch()} /> : null}
      {!policy && policyQuery.isPending ? <LoadingBlock /> : null}

      {cart ? (
        <Card title={t('checkout.summary')}>
          <KeyValue label={t('checkout.items')} value={String(cart.units)} />
          <KeyValue label={t('checkout.subtotalProducts')} value={`${cart.productSubtotalTND.toFixed(2)} TND`} />
          <KeyValue label={t('checkout.delivery')} value={`${cart.deliveryTND.toFixed(2)} TND`} />
          <KeyValue label={t('checkout.total')} value={`${cart.totalTND.toFixed(2)} TND`} />
          {!cartGate.canCheckout ? (
            <AppText variant="caption" color={theme.colors.danger}>
              {cartGate.blockReason === 'EMPTY' ? t('checkout.cartEmpty') : t('cart.blockedBody', { count: cartGate.staleLines.length })}
            </AppText>
          ) : null}
        </Card>
      ) : null}

      {addresses.length ? (
        <Card title={t('checkout.savedAddresses')}>
          {addresses.map((address) => {
            const active = addressId === address.id;
            return (
              <Pressable
                key={address.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => pickAddress(address)}
                style={[styles.address, {
                  borderColor: active ? theme.colors.action : theme.colors.line,
                  borderRadius: theme.radius.control,
                  minHeight: theme.geometry.minTarget,
                }]}
              >
                <AppText variant="label" weight="bold">{address.label || address.recipientName}</AppText>
                <AppText variant="caption" color={theme.colors.muted}>
                  {[address.addressLine, address.city, address.governorate].filter(Boolean).join(' · ')}
                </AppText>
              </Pressable>
            );
          })}
        </Card>
      ) : null}

      <Card title={t('checkout.addressTitle')} hint={t('checkout.addressHint')} onLayout={remember('address')}>
        <Field label={t('checkout.name')} value={name} onChangeText={setName} autoCapitalize="words" />
        <Field
          label={t('checkout.phone')}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          inputMode="tel"
          placeholder="98 123 456"
        />
        {account?.phoneVerified && account?.phone ? null : (
          <AppText variant="caption" color={theme.colors.muted}>{t('checkout.phoneHint')}</AppText>
        )}
        <Field
          label={t('checkout.email')}
          value={contactEmail}
          editable={!emailLocked}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        {emailLocked ? (
          <AppText variant="caption" color={theme.colors.muted}>{t('checkout.emailLocked')}</AppText>
        ) : null}

        {policy && policy.governorates.length ? (
          <>
            <AppText variant="caption" color={theme.colors.muted}>{t('checkout.governorate')}</AppText>
            <View style={styles.chips}>
              {policy.governorates.map((city) => {
                const active = governorate === city;
                return (
                  <Pressable
                    key={city}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setGovernorate(city)}
                    style={[styles.chip, {
                      borderColor: active ? theme.colors.action : theme.colors.line,
                      backgroundColor: active ? theme.colors.action : theme.colors.canvas,
                      borderRadius: theme.radius.control,
                      minHeight: theme.geometry.minTarget,
                    }]}
                  >
                    <AppText variant="label" color={active ? theme.colors.onAction : theme.colors.ink}>{city}</AppText>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : (
          <Field
            label={t('checkout.governorate')}
            value={governorate}
            onChangeText={setGovernorate}
            autoCapitalize="words"
          />
        )}

        <Field label={t('checkout.addressLine')} value={addressLine} onChangeText={setAddressLine} />
        <Field label={t('checkout.notes')} value={notes} onChangeText={setNotes} />
        {policy?.deliveryDelay ? (
          <AppText variant="caption" color={theme.colors.muted}>
            {t('checkout.deliveryDelay', { delay: policy.deliveryDelay })}
          </AppText>
        ) : null}
      </Card>

      {policy ? (
        <Card title={t('checkout.paymentTitle')} hint={t('checkout.paymentHint')} onLayout={remember('payment')}>
          {choices.map((choice) => {
            const active = method === choice.id;
            return (
              <Pressable
                key={choice.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active, disabled: !choice.available }}
                disabled={!choice.available}
                onPress={() => setMethod(choice.id)}
                style={[styles.choice, {
                  borderColor: active ? theme.colors.action : theme.colors.line,
                  borderRadius: theme.radius.control,
                  minHeight: theme.geometry.minTarget,
                  opacity: choice.available ? 1 : 0.6,
                }]}
              >
                <AppText variant="label" weight="bold">{t(choice.labelKey as never)}</AppText>
                <AppText variant="caption" color={choice.available ? theme.colors.muted : theme.colors.danger}>
                  {choice.available ? t(choice.hintKey as never) : t(choice.blockedKey as never)}
                </AppText>
              </Pressable>
            );
          })}

          {available.length === 0 ? (
            <AppText variant="caption" color={theme.colors.muted}>{t('checkout.noPaymentYet')}</AppText>
          ) : null}

          <KeyValue
            label={t('checkout.depositTerms', { percent: String(policy.deposit.percent) })}
            value={policy.deposit.companyName}
          />
          {policy.deposit.cardDiscountPercent > 0 ? (
            <AppText variant="caption" color={theme.colors.muted}>
              {t('checkout.cardDiscount', { percent: String(policy.deposit.cardDiscountPercent) })}
            </AppText>
          ) : null}
          {method === 'BANK_TRANSFER' && policy.deposit.bankRib ? (
            <KeyValue label={t('checkout.bankRib')} value={policy.deposit.bankRib} />
          ) : null}
          {method === 'POSTE' && policy.deposit.posteAccount ? (
            <KeyValue label={t('checkout.posteAccount')} value={policy.deposit.posteAccount} />
          ) : null}
          {policy.deposit.reviewDelay ? (
            <AppText variant="caption" color={theme.colors.muted}>{policy.deposit.reviewDelay}</AppText>
          ) : null}
        </Card>
      ) : null}

      {policy && (policy.deposit.unavailableRefundPolicy || policy.deposit.reviewDelay) ? (
        /* شروط معلنة قبل الخلاص: سياسة الاسترجاع ومدّة المراجعة — من الخادم،
           باش ما يبقاش فيها كلام مخبّى يوصل بعد الفلوس. */
        <Card title={t('checkout.policyTitle')} hint={t('checkout.policyHint')}>
          {policy.deposit.unavailableRefundPolicy ? (
            <AppText variant="caption" color={theme.colors.muted}>{policy.deposit.unavailableRefundPolicy}</AppText>
          ) : null}
          {policy.deposit.reviewDelay ? (
            <AppText variant="caption" color={theme.colors.muted}>{policy.deposit.reviewDelay}</AppText>
          ) : null}
        </Card>
      ) : null}

      <Card title={t('checkout.confirmTitle')} onLayout={remember('confirm')}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: terms }}
          onPress={() => setTerms((current) => !current)}
          style={[styles.terms, { minHeight: theme.geometry.minTarget }]}
        >
          <View style={[styles.box, {
            borderColor: terms ? theme.colors.action : theme.colors.line,
            backgroundColor: terms ? theme.colors.action : 'transparent',
            borderRadius: theme.radius.control,
          }]}>
            {terms ? <AppText variant="caption" color={theme.colors.onAction}>✓</AppText> : null}
          </View>
          <AppText variant="caption" style={styles.termsText}>{t('checkout.terms')}</AppText>
        </Pressable>

        {note ? (
          <AppText variant="caption" color={theme.colors.danger} accessibilityRole="alert">{note}</AppText>
        ) : null}

        <Button
          label={t('checkout.submit')}
          onPress={() => submit.mutate()}
          busy={submit.isPending}
          disabled={!canSubmit || submit.isPending}
        />
        <AppText variant="caption" color={theme.colors.muted}>{t('checkout.submitHint')}</AppText>
      </Card>
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  address: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, gap: 2, marginTop: 6, justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  chip: { borderWidth: 1, paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center', minWidth: 72 },
  choice: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, gap: 2, marginTop: 6, justifyContent: 'center' },
  terms: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  termsText: { flex: 1 },
  box: { width: 22, height: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
