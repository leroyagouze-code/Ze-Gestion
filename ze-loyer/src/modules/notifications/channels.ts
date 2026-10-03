/*
 * Canaux de notification.
 * MVP : seul le canal WEB (notifications dans l'application) est réellement actif.
 * EMAIL / SMS / WHATSAPP sont prévus dans l'architecture mais NON configurés :
 * aucun message n'est envoyé et la notification est marquée « SKIPPED » avec la raison.
 * Pour brancher un fournisseur, implémenter `ChannelSender` et l'enregistrer dans `senders`.
 */
export type Channel = "WEB" | "EMAIL" | "SMS" | "WHATSAPP";

export type OutgoingMessage = { to: { userId: string; phone: string; email: string | null }; title: string; body: string; link: string | null };
export type SendResult = { status: "SENT" | "SKIPPED" | "FAILED"; detail?: string };

export interface ChannelSender {
  channel: Channel;
  send(msg: OutgoingMessage): Promise<SendResult>;
}

/** Le canal WEB est simplement la ligne en base, lue par l'application. */
const web: ChannelSender = { channel: "WEB", send: async () => ({ status: "SENT" }) };

const notConfigured = (channel: Channel): ChannelSender => ({
  channel,
  send: async () => ({ status: "SKIPPED", detail: `Canal ${channel} non configuré : aucun message envoyé` }),
});

const senders: Record<Channel, ChannelSender> = {
  WEB: web,
  EMAIL: notConfigured("EMAIL"),
  SMS: notConfigured("SMS"),
  WHATSAPP: notConfigured("WHATSAPP"),
};

export function getSender(channel: Channel) {
  return senders[channel];
}

/** Canaux actifs : WEB seulement tant qu'aucun fournisseur n'est branché. */
export function activeChannels(): Channel[] {
  return ["WEB"];
}
