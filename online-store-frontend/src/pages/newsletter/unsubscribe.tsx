import Head from 'next/head';
import Link from 'next/link';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { ArrowLeft, Check, CircleAlert, LoaderCircle, Mail } from 'lucide-react';
import { apiCall } from '../../lib/api';

const messages = {
  vi: {
    unsubscribe: 'Hủy đăng ký',
    confirmTitle: 'Xác nhận hủy đăng ký',
    confirm: 'Bạn có chắc muốn hủy đăng ký nhận bản tin của LaptopStore?',
    confirmButton: 'Xác nhận hủy đăng ký',
    successTitle: 'Đã hủy đăng ký thành công',
    success: 'Bạn đã hủy đăng ký nhận bản tin thành công.',
    invalidTitle: 'Liên kết không hợp lệ',
    invalid: 'Liên kết hủy đăng ký không hợp lệ hoặc đã hết hạn.',
    failedTitle: 'Chưa thể xử lý yêu cầu',
    failed: 'Chưa thể xử lý yêu cầu lúc này. Vui lòng thử lại.',
    retry: 'Thử lại',
    processing: 'Đang xử lý…',
    home: 'Trang chủ',
  },
  en: {
    unsubscribe: 'Unsubscribe',
    confirmTitle: 'Confirm your unsubscribe request',
    confirm: 'Are you sure you want to unsubscribe from the LaptopStore newsletter?',
    confirmButton: 'Confirm unsubscribe',
    successTitle: 'You have been unsubscribed',
    success: 'You have successfully unsubscribed from the newsletter.',
    invalidTitle: 'Invalid link',
    invalid: 'This unsubscribe link is invalid or has expired.',
    failedTitle: 'Request could not be completed',
    failed: "We couldn't process your request right now. Please try again.",
    retry: 'Try again',
    processing: 'Processing…',
    home: 'Home',
  },
  pt: {
    unsubscribe: 'Cancelar inscrição',
    confirmTitle: 'Confirme o cancelamento da inscrição',
    confirm: 'Tem certeza de que deseja cancelar a inscrição na newsletter da LaptopStore?',
    confirmButton: 'Confirmar cancelamento',
    successTitle: 'Inscrição cancelada',
    success: 'Sua inscrição na newsletter foi cancelada.',
    invalidTitle: 'Link inválido',
    invalid: 'Este link de cancelamento é inválido ou expirou.',
    failedTitle: 'Não foi possível concluir',
    failed: 'Não foi possível processar sua solicitação agora. Tente novamente.',
    retry: 'Tentar novamente',
    processing: 'Processando…',
    home: 'Início',
  },
  fr: {
    unsubscribe: 'Se désabonner',
    confirmTitle: 'Confirmer votre désabonnement',
    confirm: 'Voulez-vous vraiment vous désabonner de la newsletter LaptopStore ?',
    confirmButton: 'Confirmer le désabonnement',
    successTitle: 'Désabonnement confirmé',
    success: 'Votre désabonnement à la newsletter est confirmé.',
    invalidTitle: 'Lien invalide',
    invalid: 'Ce lien de désabonnement est invalide ou expiré.',
    failedTitle: 'La demande n’a pas abouti',
    failed: 'Votre demande ne peut pas être traitée pour le moment. Veuillez réessayer.',
    retry: 'Réessayer',
    processing: 'Traitement…',
    home: 'Accueil',
  },
  de: {
    unsubscribe: 'Abbestellen',
    confirmTitle: 'Abmeldung bestätigen',
    confirm: 'Möchten Sie den LaptopStore-Newsletter wirklich abbestellen?',
    confirmButton: 'Abbestellung bestätigen',
    successTitle: 'Abmeldung bestätigt',
    success: 'Sie haben den Newsletter erfolgreich abbestellt.',
    invalidTitle: 'Ungültiger Link',
    invalid: 'Dieser Abmeldelink ist ungültig oder abgelaufen.',
    failedTitle: 'Anfrage nicht abgeschlossen',
    failed: 'Ihre Anfrage konnte gerade nicht verarbeitet werden. Bitte versuchen Sie es erneut.',
    retry: 'Erneut versuchen',
    processing: 'Wird verarbeitet…',
    home: 'Startseite',
  },
  es: {
    unsubscribe: 'Cancelar suscripción',
    confirmTitle: 'Confirma la cancelación de tu suscripción',
    confirm: '¿Seguro que quieres cancelar tu suscripción al boletín de LaptopStore?',
    confirmButton: 'Confirmar cancelación',
    successTitle: 'Suscripción cancelada',
    success: 'Has cancelado correctamente tu suscripción al boletín.',
    invalidTitle: 'Enlace no válido',
    invalid: 'Este enlace para cancelar la suscripción no es válido o ha caducado.',
    failedTitle: 'No se pudo completar la solicitud',
    failed: 'No pudimos procesar tu solicitud ahora. Inténtalo de nuevo.',
    retry: 'Intentar de nuevo',
    processing: 'Procesando…',
    home: 'Inicio',
  },
  it: {
    unsubscribe: 'Annulla iscrizione',
    confirmTitle: 'Conferma la cancellazione dell’iscrizione',
    confirm: 'Vuoi davvero annullare l’iscrizione alla newsletter di LaptopStore?',
    confirmButton: 'Conferma annullamento',
    successTitle: 'Iscrizione annullata',
    success: 'L’iscrizione alla newsletter è stata annullata.',
    invalidTitle: 'Link non valido',
    invalid: 'Questo link per annullare l’iscrizione non è valido o è scaduto.',
    failedTitle: 'Richiesta non completata',
    failed: 'Non è stato possibile elaborare la richiesta. Riprova.',
    retry: 'Riprova',
    processing: 'Elaborazione…',
    home: 'Inizio',
  },
  nl: {
    unsubscribe: 'Uitschrijven',
    confirmTitle: 'Uitschrijven bevestigen',
    confirm: 'Weet u zeker dat u zich wilt uitschrijven voor de nieuwsbrief van LaptopStore?',
    confirmButton: 'Uitschrijven bevestigen',
    successTitle: 'U bent uitgeschreven',
    success: 'U bent uitgeschreven voor de nieuwsbrief.',
    invalidTitle: 'Ongeldige link',
    invalid: 'Deze uitschrijflink is ongeldig of verlopen.',
    failedTitle: 'Aanvraag niet voltooid',
    failed: 'Uw verzoek kan momenteel niet worden verwerkt. Probeer het opnieuw.',
    retry: 'Opnieuw proberen',
    processing: 'Verwerken…',
    home: 'Start',
  },
  sv: {
    unsubscribe: 'Avsluta prenumeration',
    confirmTitle: 'Bekräfta avregistrering',
    confirm: 'Vill du avsluta prenumerationen på LaptopStores nyhetsbrev?',
    confirmButton: 'Bekräfta avslut',
    successTitle: 'Prenumerationen har avslutats',
    success: 'Du har avslutat prenumerationen på nyhetsbrevet.',
    invalidTitle: 'Ogiltig länk',
    invalid: 'Den här länken är ogiltig eller har gått ut.',
    failedTitle: 'Begäran kunde inte slutföras',
    failed: 'Det gick inte att behandla din begäran just nu. Försök igen.',
    retry: 'Försök igen',
    processing: 'Bearbetar…',
    home: 'Hem',
  },
} as const;

type Locale = keyof typeof messages;
type PageStatus = 'confirm' | 'success' | 'invalid' | 'error';

interface UnsubscribePageProps {
  token: string;
  locale: Locale;
  invalid: boolean;
}

export const getServerSideProps: GetServerSideProps<UnsubscribePageProps> = async ({ query }) => {
  const locale = typeof query.lang === 'string' && query.lang in messages
    ? query.lang as Locale
    : 'vi';
  const token = typeof query.token === 'string' ? query.token : '';

  return {
    props: {
      token,
      locale,
      invalid: query.invalid === '1' || !token,
    },
  };
};

export default function NewsletterUnsubscribe(pageProps: Partial<UnsubscribePageProps>) {
  const router = useRouter();
  const routeToken = typeof router.query.token === 'string' ? router.query.token : '';
  const routeLocale = typeof router.query.lang === 'string' && router.query.lang in messages
    ? router.query.lang as Locale
    : undefined;
  const token = pageProps.token || routeToken;
  const locale = pageProps.locale || routeLocale || 'vi';
  const invalid = pageProps.invalid ?? (router.query.invalid === '1' || !token);
  const [status, setStatus] = useState<PageStatus>(invalid ? 'invalid' : 'confirm');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const copy = messages[locale] || messages.vi;

  useEffect(() => {
    if (router.isReady) setStatus(invalid ? 'invalid' : 'confirm');
  }, [invalid, router.isReady]);

  const handleUnsubscribe = async () => {
    if (!token || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await apiCall('/newsletter/unsubscribe', {
        method: 'POST',
        body: JSON.stringify({ token }),
        skipErrorToast: true,
        skipRetry: true,
      });
      setStatus('success');
    } catch (error) {
      const apiError = error as Error & { status?: number };
      setStatus(apiError.status === 400 ? 'invalid' : 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isSuccess = status === 'success';
  const isError = status === 'invalid' || status === 'error';
  const title = isSuccess
    ? copy.successTitle
    : status === 'invalid'
      ? copy.invalidTitle
      : status === 'error'
        ? copy.failedTitle
        : copy.confirmTitle;
  const description = isSuccess
    ? copy.success
    : status === 'invalid'
      ? copy.invalid
      : status === 'error'
        ? copy.failed
        : copy.confirm;

  return (
    <>
      <Head>
        <title>{`LaptopStore | ${copy.unsubscribe}`}</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <section lang={locale} className="relative isolate flex min-h-[560px] items-center justify-center overflow-hidden bg-slate-50 px-4 py-16 sm:py-24">
        <div className="absolute inset-x-0 top-0 h-56 bg-linear-to-br from-red-600 via-red-700 to-red-950" />
        <div className="absolute -top-24 right-[-5rem] h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute bottom-0 left-[-5rem] h-64 w-64 rounded-full bg-red-100/70 blur-3xl" />

        <div className="relative w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-7 text-center shadow-[0_24px_80px_-32px_rgba(15,23,42,0.35)] sm:p-12" style={{ textAlign: 'center' }}>
          <div className={`mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl ${isSuccess ? 'bg-emerald-50 text-emerald-600' : isError ? 'bg-red-50 text-red-600' : 'bg-red-50 text-red-600'}`}>
            {isSuccess ? <Check aria-hidden="true" className="h-8 w-8" /> : isError ? <CircleAlert aria-hidden="true" className="h-8 w-8" /> : <Mail aria-hidden="true" className="h-8 w-8" />}
          </div>

          <p className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-red-600">LaptopStore</p>
          <h1 className="text-center text-2xl font-bold leading-tight tracking-normal text-slate-950 sm:text-3xl">{title}</h1>
          <p className="mx-auto mt-4 max-w-md text-center text-sm leading-6 tracking-normal text-slate-600 sm:text-base">{description}</p>

          {status === 'confirm' && (
            <button
              type="button"
              onClick={handleUnsubscribe}
              disabled={isSubmitting}
              className="mt-8 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-red-600/20 transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-200 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
            >
              {isSubmitting ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
              {isSubmitting ? copy.processing : copy.confirmButton}
            </button>
          )}

          {status === 'error' && (
            <button
              type="button"
              onClick={handleUnsubscribe}
              disabled={isSubmitting}
              className="mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-red-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-200 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
              {isSubmitting ? copy.processing : copy.retry}
            </button>
          )}

          {status !== 'confirm' && (
            <Link
              href="/"
              className="mx-auto mt-8 inline-flex items-center gap-2 rounded-lg border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-red-200 hover:text-red-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-100"
            >
              <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              {copy.home}
            </Link>
          )}
        </div>
      </section>
    </>
  );
}
