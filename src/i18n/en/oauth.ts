/** The consent screen an AI assistant (Claude, ChatGPT) sends people to when they connect Candid. */
export const oauth = {
  title: "Connect an app",
  heading: "{client} wants to access Candid",
  body: "It will act as you: it sees what you see in {workspace}, and its changes are logged under your name.",
  signedInAs: "Signed in as",
  redirectsTo: "Sends you back to",
  loopbackWarning: "This app runs on your own computer (localhost). Only allow it if you started the connection yourself.",
  unverifiedName: "The name is chosen by the app itself. Check the address above before you allow access.",
  allow: "Allow access",
  deny: "Deny",
  revokeLater: "You can disconnect it at any time in Settings → Integrations.",
  errorTitle: "This connection link is not valid",
  unknownClient: "The app that sent you here is not registered with Candid. Start the connection again from the app.",
  badRedirect: "The return address does not match the one the app registered. Start the connection again from the app.",
  notMember: "Your account is not a member of a Candid workspace yet. Ask an admin to invite you.",
  continueTitle: "Returning to the app…",
  continueLink: "Continue",
};
