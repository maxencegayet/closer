// Faux « web-push » : rien ne part sur le réseau, chaque envoi est noté dans `sent`.
export const sent: { endpoint: string; msg: { title: string; body: string; tag: string; url: string } }[] = [];
// endpoint -> code d'erreur renvoyé par le service de notifications (ex. 410 = appareil désabonné)
export const fail: Record<string, number> = {};
let n = 0;
export default {
  generateVAPIDKeys() { n++; return { publicKey: "pub-" + n, privateKey: "priv-" + n }; },
  setVapidDetails(_s: string, _pub: string, _priv: string) {},
  sendNotification(sub: { endpoint: string }, payload: string) {
    if (fail[sub.endpoint]) return Promise.reject(Object.assign(new Error("refusé"), { statusCode: fail[sub.endpoint] }));
    sent.push({ endpoint: sub.endpoint, msg: JSON.parse(payload) });
    return Promise.resolve({ statusCode: 201 });
  },
};
