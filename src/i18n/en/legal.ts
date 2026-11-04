// Privacy notice (/privacy). Every claim here is checked against the code it describes; change the
// code and this text together. The admin fills in the two placeholders below.
export const legal = {
  /** The organisation that runs this workspace: the data controller. Filled in by the admin. */
  controller: "{Organisation name}",
  /** Where to send questions and requests about personal data. Filled in by the admin. */
  contact: "{privacy contact: name, email or address}",
  lastUpdated: "2026-11-04",

  privacy: {
    title: "Privacy notice",
    lastUpdated: "Last updated {date}",
    intro:
      "Candid is an internal tool for managing projects, checklists, notes and documents. This notice explains what personal data it keeps, where that data is processed and what you can ask for. It is written in plain English on purpose.",

    controller: {
      title: "Who is responsible",
      body: "The data controller is {controller}, the organisation that runs this workspace. Questions and requests about your data go to {contact}.",
    },

    data: {
      title: "What personal data is stored",
      intro: "Everything below lives in the workspace's database and is visible only to members of the workspace.",
      items: [
        "Members: your name and email address, your role (admin or member) and whether you are active, invited or removed.",
        "Projects and tasks: names, clients, owners, assignees, due dates, status and the notes written on projects and tasks. These can name people, including candidates and clients.",
        "Documents: the files members upload and the links they add, with the file name, type, size and who added them.",
        "Activity log: who did what and when (for example who completed a task or changed a status). It records small facts only, never the text of notes or any tokens.",
        "Preferences: your view, sort and filter settings, which projects and documents you pinned and whether the sidebar is collapsed.",
        "Imports: who ran a spreadsheet import, when, and a summary of what it created or updated.",
        "Google connection (only if you connect it): the email of the Google account you connected and the access tokens, which are encrypted at rest with AES-256-GCM and never sent to the browser.",
      ],
    },

    processing: {
      title: "Where the data is processed",
      items: [
        "Database: Neon PostgreSQL in Frankfurt (AWS eu-central-1).",
        "Application: Vercel serverless functions in Frankfurt (fra1).",
        "Sign-in: Clerk handles your account and sign-in sessions. Your name and email come from that account.",
        "Documents: the configured S3-compatible bucket, kept private. Its region is set by the admin.",
        "Google: Google Sheets is contacted only when you connect your own Google account and import from or export to a spreadsheet. Nothing syncs in the background.",
      ],
    },

    cookies: {
      title: "Cookies and browser storage",
      body: "Candid uses only what it needs to work, so no cookie banner is shown:",
      items: [
        "Sign-in session cookies set by Clerk, so you stay signed in.",
        "A short-lived cookie while you connect a Google account, which ties the Google consent screen to your browser. It is removed when the connection finishes.",
        "Your theme choice (light, dark or system) is kept in this browser's local storage, not in a cookie.",
      ],
      none: "There are no analytics, advertising or tracking cookies and no third-party trackers.",
    },

    retention: {
      title: "How long data is kept",
      items: [
        "An archived project can be restored at any time. A project is only erased when someone deletes it from the Archive: its tasks, notes and history are then removed permanently. A removed task is hidden rather than erased, so it can be restored.",
        "Documents are kept until someone removes them. A removed document is purged from storage 7 days later.",
        "The activity log is kept for as long as the workspace exists.",
        "Google tokens are deleted when you disconnect Google or when an admin removes you from the workspace.",
        "When an admin removes a member, their membership record is kept with the status Removed so that past activity still shows who did what.",
      ],
    },

    rights: {
      title: "Your rights",
      intro: "Under the GDPR you can ask to see, correct or erase personal data about you, and to object to or restrict its use.",
      items: [
        "Access and correction: Settings → General shows the name, email and role stored for you. Your name and email come from your sign-in account; change them there. Any member can export the workspace's projects and tasks, including owner and assignee email addresses, to a spreadsheet from Import / export in the top bar.",
        "Erasure: ask an admin to remove you from the workspace. Your name stays on past activity, so that the history of each project remains truthful; ask the controller if you need more than that.",
        "Anything else: contact {contact}. You can also complain to your national data protection authority.",
      ],
    },
  },
};
