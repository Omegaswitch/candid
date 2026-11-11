// The in-app manual (Help page). Czech is the main version (cs/help.ts); this is its English counterpart.
export const help = {
  title: "Help",
  intro: "How to use Candid, from creating a project to exporting a spreadsheet.",
  contents: "Contents",
  sections: [
    { id: "zacatek", title: "Signing in", steps: ["Open www.candid.quest and sign in with your work email, Google or Microsoft.", "Only invited people have access. If you see “No access yet”, ask an admin, or sign out and use another account.", "Switch language in the account menu or in Settings → General; switch the theme with the slider at the top right."] },
    { id: "prehled", title: "The project overview", steps: ["Every active project is a card. The ring fills and changes colour as steps are ticked.", "The card border turns orange as the due date nears and red when it is overdue.", "Filters and sorting are remembered; switch between cards and a table at the right."] },
    { id: "projekt", title: "Creating a project", steps: ["Click “Add project”, fill in the name and optional details.", "The checklist starts with the default steps from Settings; edit them for this project before creating it."] },
    { id: "kroky", title: "Steps and the checklist", steps: ["Click a card to open its side panel.", "Tick a step with the circle; Undo appears at the bottom.", "Click a title to rename it; use ⋯ to move or remove a step, or drag it.", "Set an assignee, due date, note and “Waiting” per step; select several for bulk actions.", "Turn on “Group by person” to split the steps into sections per assignee, each with its done/total count; drag a step into another section to reassign it."] },
    { id: "poznamky", title: "Notes", steps: ["Notes save automatically. If saving fails the text stays and “Retry” sends it.", "If a colleague edited the same note, both versions are shown so nothing is lost."] },
    { id: "pohledy", title: "My tasks, Due soon, Overdue, Waiting", steps: ["Cross-project task lists in the left menu, sorted by due date; tick tasks right there."] },
    { id: "dokumenty", title: "Documents", steps: ["Upload with + or drag and drop (PDF, DOCX, XLSX, CSV, PNG, JPEG, up to 25 MB), or add a link.", "Preview, download, rename, replace, pin or attach a document to a project."] },
    { id: "archiv", title: "Archive and deleting", steps: ["Archive a project from its ⋯ menu; restore it from the Archive at any time.", "Only archived projects can be deleted, from the Archive. Deleting cannot be undone."] },
    { id: "tabulky", title: "Spreadsheet import and export", steps: ["“Import / export” in the top bar: CSV, XLSX, pasted rows or Google Sheets, with a preview before anything is saved.", "Exported files can be re-imported in update mode without duplicates."] },
    { id: "nastaveni", title: "Settings (admins)", steps: ["Members: invite, change roles, remove.", "Templates: edit the default checklist and choose which one new projects use.", "Integrations: connect Google for Sheets."] },
  ],
  shortcutsTitle: "Keyboard shortcuts",
  shortcuts: [
    { keys: "Ctrl / ⌘ + K", what: "Search and jump anywhere" },
    { keys: "/", what: "Open search (outside text fields)" },
    { keys: "N", what: "New project (outside text fields)" },
    { keys: "T", what: "Add a step to the open project (outside text fields)" },
    { keys: "Enter", what: "Save a title edit or add a step" },
    { keys: "Esc", what: "Cancel editing or close the panel" },
  ],
};
