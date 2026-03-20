module.exports = {
  config: {
    name: "antiout",
    version: "1.0.0",
    role: 0,                    // pwede mo baguhin kung gusto mong admin-only
    credits: "YourName / Original Author",
    description: "Awtomatikong ibabalik ang miyembrong umalis sa group",
    hasPrefix: false,           // importante: event lang ito, walang prefix
    cooldown: 0                 // walang cooldown kasi event-triggered
  },

  handleEvent: async function ({ api, event }) {
    // Siguraduhing event type ay tungkol sa pag-alis ng miyembro
    if (event.type !== "event") return;
    if (event.logMessageType !== "log:unsubscribe") return;

    // Huwag i-re-add kung ang bot mismo ang umalis
    if (event.logMessageData?.leftParticipantFbId === api.getCurrentUserID()) {
      return;
    }

    const leftUserId = event.logMessageData?.leftParticipantFbId;
    if (!leftUserId) return;

    try {
      // Kunin ang pangalan ng umalis
      const userInfo = await api.getUserInfo(leftUserId);
      const name = userInfo[leftUserId]?.name || "Member";

      // Subukang i-add ulit sa group
      api.addUserToGroup(leftUserId, event.threadID, (addError) => {
        if (addError) {
          api.sendMessage(
            `❌ Hindi ma-re-add si ${name} sa group!\nError: ${addError.errorSummary || addError}`,
            event.threadID
          );
        } else {
          api.sendMessage(
            `🔄 **Anti-out activated** — Si ${name} ay naibalik na sa group!`,
            event.threadID
          );
        }
      });
    } catch (err) {
      console.error("[antiout] Error:", err);
      api.sendMessage(
        "❌ May error sa pagproseso ng anti-out. Subukan ulit mamaya.",
        event.threadID
      );
    }
  }
};