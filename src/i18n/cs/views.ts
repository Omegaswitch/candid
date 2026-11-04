import type { Localized } from "./types";

// {tasks} and {projects} are already pluralised counts ("5 úkolů", "2 projekty").
export const views: Localized<typeof import("../en/views").views> = {
  mine: {
    title: "Moje úkoly",
    subline: "Přiřazeno vám: {tasks}, z\u00a0toho po termínu {overdue}.",
    sublineNone: "Přiřazeno vám: {tasks}.",
    empty: "Nemáte přiřazené žádné úkoly.",
  },
  "due-soon": {
    title: "Brzy splatné",
    subline: "Splatné v\u00a0příštích 7 dnech: {tasks}.",
    sublineNone: "Splatné v\u00a0příštích 7 dnech: {tasks}.",
    empty: "V\u00a0příštích 7 dnech není nic splatné.",
  },
  overdue: {
    title: "Po termínu",
    subline: "Po termínu: {tasks} {projects}.",
    sublineNone: "Po termínu: {tasks}.",
    empty: "Nic není po termínu.",
  },
  waiting: {
    title: "Čeká se",
    subline: "Čeká se na někoho jiného: {tasks}, z\u00a0toho po termínu {overdue}.",
    sublineNone: "Čeká se na někoho jiného: {tasks}.",
    empty: "Nic nečeká na nikoho jiného.",
  },
  loadMore: "Načíst další",
  shown: "Zobrazeno {shown} z\u00a0{total}",
  tasksN: { one: "{n} úkol", few: "{n} úkoly", many: "{n} úkolu", other: "{n} úkolů" },
  // Only used in overdue.subline, so the forms carry the locative and its preposition ("ve 3 projektech").
  projectsN: { one: "v\u00a0{n} projektu", few: "ve {n} projektech", many: "v\u00a0{n} projektu", other: "v\u00a0{n} projektech" },
  groups: { overdue: "Po termínu", today: "Dnes", tomorrow: "Zítra", week: "Příštích 7 dní", later: "Později", none: "Bez termínu" },
  complete: "Dokončit {title}",
  completed: "Dokončeno: {title}",
  reopened: "Znovu otevřeno: {title}",
  couldNotComplete: "Nepodařilo se upravit {title}",
  changedElsewhere: "{title} mezitím upravil někdo jiný. Seznam je obnovený.",
  openProject: "Otevřít {name}",
  unassigned: "Nepřiřazeno",
  waitingFor: "Čeká se: {reason}",
  waitingNoReason: "Čeká se",
  noDue: "Bez termínu",
  loadError: "Úkoly se nepodařilo načíst.",
  columns: { task: "Úkol", project: "Projekt", assignee: "Řešitel", due: "Termín" },
};
