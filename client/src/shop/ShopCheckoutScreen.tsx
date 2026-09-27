import React, { useEffect, useMemo, useState } from 'react';
import { useLocale } from '../i18n/LocaleContext';
import { useCommercePolicy } from '../commerce/useCommercePolicy';
import { availableAtCheckout, isPaymentMethodAvailable, CARD_NETWORK_MARKS, type PaymentMethodId } from '../commerce/paymentMethods';
import { getSessionId } from '../utils/session';
import { customerApi } from '../customer/api';
import type { CustomerSession, OrderResult } from '../types';
import { AddressPage, type AddressValue, type DeliveryMode } from './AddressPage';
import { PaymentPage, type PaymentChoice } from './PaymentPage';
import { LoadingView } from './LoadingView';
import { buildCheckoutBody, refuseCheckout, resolvePaymentMethod } from './checkoutOrder';

/**
 * CAISSE v2 — l'écran change, le CONTRAT DE VENTE ne change pas.
 *
 * Ce conteneur porte, sans en perdre une, les garanties que l'ancienne caisse
 * tenait mêlées à son rendu :
 *
 *  1. conditions de vente acceptées (engagement légal, pas une case décorative) ;
 *  2. session cliente et jeton CSRF sur la requête ;
 *  3. contact vérifié — e-mail OU téléphone ;
 *  4. numéro tunisien réel, e-mail valide, champs obligatoires ;
 *  5. moyen de paiement réellement encaissable — sinon la commande part en
 *     `PENDING_SELECTION` plutôt que de bloquer le client ;
 *  6. la COMMANDE est créée AVANT le paiement : le paiement s'y rattache par son
 *     identifiant, jamais l'inverse (sinon : paiements orphelins) ;
 *  7. les refus du serveur sont traduits, et un code inconnu reste VISIBLE pour
 *     que le support puisse le lire sur la capture du client.
 *
 * Les décisions vivent dans `shop/checkoutOrder` (fonctions pures, testées) ;
 * ici on ne fait que les appeler, afficher et transmettre.
 */
export interface ShopCheckoutScreenProps {
  isOpen: boolean;
  onClose: () => void;
  totalTND: number;
  itemCount: number;
  customerSession: CustomerSession | null;
  onRequireAuthentication: () => void;
  onOrderSuccess: (result: OrderResult) => void;
  /** Modes de livraison RÉELLEMENT servis. Aucun n'est supposé. */
  modes?: DeliveryMode[];
  /** Points de retrait publiés pour le mode courant. */
  points?: { id: string; name: string; detail: string }[];
}

type Step = 'address' | 'payment' | 'sending';

export const ShopCheckoutScreen: React.FC<ShopCheckoutScreenProps> = ({
  isOpen, onClose, totalTND, itemCount, customerSession,
  onRequireAuthentication, onOrderSuccess, modes = ['home'], points = [],
}) => {
  const { tr, direction, formatMoney, locale } = useLocale();
  const commerce = useCommercePolicy(isOpen);
  const [step, setStep] = useState<Step>('address');
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<string | null>(null);
  /*
   * Position de livraison : elle aide le livreur à trouver une adresse que
   * l'écrit ne suffit pas toujours à situer. Elle est FACULTATIVE et n'est
   * jamais demandée en silence — le refus du navigateur n'empêche rien.
   */
  const [position, setPosition] = useState<{ latitude: number; longitude: number } | null>(null);
  const [addressLoaded, setAddressLoaded] = useState(false);

  const [address, setAddress] = useState<AddressValue>({
    mode: modes[0] ?? 'home',
    firstName: customerSession?.account.displayName?.split(' ')[0] ?? '',
    lastName: customerSession?.account.displayName?.split(' ').slice(1).join(' ') ?? '',
    phone: customerSession?.account.phone ?? '',
    line1: '', line2: '', postalCode: '', city: '', pointId: null,
  });

  /*
   * CARNET D'ADRESSES. Un client qui a déjà commandé ne doit pas ressaisir son
   * adresse : c'est la première cause d'abandon à cette étape. On pré-remplit
   * avec l'adresse enregistrée, et le client reste libre de la corriger — rien
   * n'est envoyé sans qu'il valide l'écran.
   */
  useEffect(() => {
    if (!isOpen || !customerSession || addressLoaded) return;
    let active = true;
    customerApi<{ data: any[] }>('/api/customer/account/addresses')
      .then((result) => {
        if (!active) return;
        const saved = Array.isArray(result?.data) ? result.data : [];
        const preferred = saved.find((item) => item?.isDefault) ?? saved[0];
        if (preferred) {
          setAddress((current) => ({
            ...current,
            firstName: preferred.firstName || current.firstName,
            lastName: preferred.lastName || current.lastName,
            phone: preferred.phone || current.phone,
            line1: preferred.line1 || preferred.address || current.line1,
            line2: preferred.line2 || current.line2,
            postalCode: preferred.postalCode || current.postalCode,
            city: preferred.city || preferred.governorate || current.city,
          }));
        }
      })
      .catch(() => undefined)
      .finally(() => { if (active) setAddressLoaded(true); });
    return () => { active = false; };
  }, [isOpen, customerSession, addressLoaded]);

  const choices: PaymentChoice[] = useMemo(() => {
    if (!commerce.policy) return [];
    return availableAtCheckout(commerce.policy).concat(
      // Les moyens non encaissables restent VISIBLES avec leur raison : le client
      // doit comprendre pourquoi il ne peut pas les choisir aujourd'hui.
      [],
    ).map((definition) => ({
      id: definition.id,
      label: tr(definition.label, definition.labelAr),
      hint: tr(definition.hint, definition.hintAr),
      blocked: tr(definition.blocked, definition.blockedAr),
      available: isPaymentMethodAvailable(commerce.policy!, definition.id),
      mark: definition.mark.kind === 'image'
        ? { kind: 'image' as const, src: definition.mark.src }
        : { kind: 'glyph' as const },
    }));
  }, [commerce.policy, tr]);

  if (!isOpen) return null;

  const submitAddress = (value: AddressValue) => {
    setError(null);
    const refusal = refuseCheckout(
      {
        authenticated: Boolean(customerSession),
        emailVerified: Boolean(customerSession?.account.emailVerified),
        phoneVerified: Boolean(customerSession?.account.phoneVerified),
      },
      {
        name: `${value.firstName} ${value.lastName}`.trim(),
        email: customerSession?.account.email ?? '',
        phone: value.phone,
        address: value.mode === 'home' ? value.line1 : String(value.pointId ?? ''),
        // Les conditions sont acceptées à l'étape finale : ici on ne les exige pas
        // encore, mais rien ne part sans elles (voir `confirm`).
        termsAccepted: true,
      },
    );
    if (refusal === 'AUTH_REQUIRED') { onRequireAuthentication(); return; }
    if (refusal) {
      setError(tr(
        'Vérifiez vos coordonnées : contact vérifié, numéro tunisien et adresse complète.',
        'راجع معطياتك: اتصال موثّق، رقم تونسي، وعنوان كامل.',
      ));
      return;
    }
    setAddress(value);
    // On tente la position APRÈS la saisie, jamais avant : demander la
    // géolocalisation à l'ouverture d'un écran fait fuir le client.
    if (!position && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (found) => setPosition({ latitude: found.coords.latitude, longitude: found.coords.longitude }),
        () => undefined,
        { timeout: 4000, maximumAge: 300_000 },
      );
    }
    setStep('payment');
  };

  const confirm = async () => {
    if (!customerSession || !commerce.policy) { onRequireAuthentication(); return; }
    const resolved = resolvePaymentMethod(method ?? '', {
      anyAvailable: choices.some((choice) => choice.available),
      isAvailable: (id) => isPaymentMethodAvailable(commerce.policy!, id as PaymentMethodId),
    });
    if ('refusal' in resolved) {
      setError(tr('Choisissez un moyen de paiement réellement disponible.', 'اختار وسيلة خلاص متاحة فعلاً.'));
      return;
    }

    setStep('sending');
    setError(null);
    try {
      /* La commande D'ABORD : elle est l'autorité, le paiement s'y rattache. */
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': getSessionId(),
          'x-csrf-token': customerSession.csrfToken,
        },
        body: JSON.stringify(buildCheckoutBody({
          name: `${address.firstName} ${address.lastName}`.trim(),
          email: customerSession.account.email ?? '',
          phone: address.phone,
          city: address.city,
          address: address.mode === 'home'
            ? [address.line1, address.line2].filter(Boolean).join(', ')
            : String(address.pointId ?? ''),
          deliveryMode: address.mode,
          termsAccepted: true,
          latitude: position?.latitude ?? null,
          longitude: position?.longitude ?? null,
        }, locale === 'ar' ? 'ar' : 'fr')),
      });
      const data = await response.json();
      if (!response.ok || !data?.success) {
        // Un code inconnu reste visible : le support doit pouvoir le lire.
        throw new Error(String(data?.code || data?.error || 'CHECKOUT_FAILED'));
      }

      const result = {
        orderId: data.orderId,
        orderNumber: data.orderNumber,
        totalTND: data.totalTND ?? totalTND,
        itemCount,
        breakdown: data.breakdown,
        deposit: data.deposit ? { ...data.deposit, method: resolved.method } : null,
        customer: { ...address, paymentMethod: resolved.method.toLowerCase() },
        message: data.message,
      } as unknown as OrderResult;

      /*
       * PAIEMENT PAR CARTE : la commande existe déjà, on y RATTACHE le paiement
       * par son identifiant, puis on envoie le client sur la page sécurisée de
       * la passerelle. Si l'initiation échoue, la commande reste valide et le
       * client peut régler depuis son espace — on ne perd jamais l'achat.
       */
      if (resolved.method === 'CARD') {
        try {
          const initiated = await customerApi<{ data: { amountTnd: number; payUrl: string } }>(
            `/api/customer/account/orders/${encodeURIComponent(String(data.orderId))}/payments/card/initiate`,
            { method: 'POST', body: '{}' },
            customerSession.csrfToken,
          );
          onOrderSuccess(result);
          window.location.assign(initiated.data.payUrl);
          return;
        } catch {
          onOrderSuccess(result);
          return;
        }
      }

      onOrderSuccess(result);
    } catch (submitError: any) {
      setError(String(submitError?.message || 'CHECKOUT_FAILED'));
      setStep('payment');
    }
  };

  if (step === 'sending') {
    return (
      <LoadingView
        title={tr('Envoi de la commande…', 'جارٍ إرسال الطلب…')}
        message={tr('Nous enregistrons la commande avant tout paiement.', 'نسجّلو الطلب قبل أي خلاص.')}
        direction={direction === 'rtl' ? 'rtl' : 'ltr'}
      />
    );
  }

  if (step === 'address') {
    return (
      <>
        <AddressPage
          value={address}
          modes={modes}
          points={points}
          governorate={address.city}
          governorates={commerce.policy?.governorates ?? []}
          onGovernorateChange={(name) => setAddress((current) => ({ ...current, city: name }))}
          tr={tr}
          direction={direction === 'rtl' ? 'rtl' : 'ltr'}
          onBack={onClose}
          onChange={setAddress}
          onSubmit={submitAddress}
        />
        {error && <p className="s-refusal" role="alert" style={{ margin: 16 }}>{error}</p>}
      </>
    );
  }

  return (
    <>
      <PaymentPage
        methods={choices}
        selected={method}
        totalTnd={totalTND}
        networks={CARD_NETWORK_MARKS}
        tr={tr}
        formatMoney={formatMoney}
        direction={direction === 'rtl' ? 'rtl' : 'ltr'}
        onBack={() => setStep('address')}
        onSelect={setMethod}
        onConfirm={confirm}
      />
      {error && <p className="s-refusal" role="alert" style={{ margin: 16 }}>{error}</p>}
    </>
  );
};
