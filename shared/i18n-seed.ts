// THE SEED — the words a machine must not be allowed to choose.
//
// The catalogue beside this file is GENERATED: a script extracts every English
// string out of the two front doors and asks a model for the rest of the
// world's languages (`scripts/i18n-extract.mjs` → `scripts/i18n-translate.mjs`).
// This file is the exception, and it is hand-written on purpose.
//
// WHERE THE GERMAN CAME FROM. The vocabulary block below is not translated: it
// is LIFTED from the agency's own legacy data (`glide/data/agency.choices.json`
// and `agency.program.json`), where every ticket type, sprint type and delivery
// programme already carried the German the agency has been using with German
// clients for years. "Issue" is `Problem`, not `Ausgabe`. "Request" is
// `Anfrage`, not `Bitte`. No machine would have chosen those, and a translator
// starting from the English would have got them wrong — which is the argument
// for reading a client's own words back to them rather than inventing new ones.
//
// Spanish and Catalan are Aurora's languages and hers to correct. They are
// written here in the register the German set: plain, short, no formality
// escalation, sentence case, the same word for the same thing every time.
//
// THE SEED ALWAYS WINS, AND NOW IT WINS ON SCREEN. Two seams put it over the
// machine's output, per LANGUAGE rather than per string, so a regeneration can
// never quietly replace `Problem` with `Ausgabe`: the generator at build time,
// and `SPOKEN` in shared/i18n.ts at RUN time. The runtime half did not exist
// until 2026-08-19 — the app imported the generated catalogue and nothing else,
// so this file's own promise was true of a build and false of a screen, and the
// only way to spend a word into the app was to spend money on the model.
// It also never SPENDS on these: a string with a seed entry for a language is
// already done, so it is not sent to the model.
//
// HOW TO CORRECT A TRANSLATION. Here — never in the generated file. Put the
// English exactly as it appears on screen, including its full stop, then the
// languages you are sure of. That is the whole job: it is on screen at the next
// reload, with no generator run and nothing spent. Anything you leave out stays
// English until somebody writes it or the generator next fills it in.

import type { Catalogue } from "./i18n"

export const SEED: Catalogue = {
  /* ── The vocabulary ──────────────────────────────────────────────────────
   * The glossary's own words. These appear as headings, as nav labels, as the
   * subject of half the sentences below, so they are translated once here and
   * everything else stays consistent with them by using the same English. */
  Accounts: { de: "Kunden", es: "Cuentas", ca: "Comptes" },
  Account: { de: "Kunde", es: "Cuenta", ca: "Compte" },
  Contacts: { de: "Kontakte", es: "Contactos", ca: "Contactes" },
  Contact: { de: "Kontakt", es: "Contacto", ca: "Contacte" },
  Tickets: { de: "Tickets", es: "Tickets", ca: "Tickets" },
  Ticket: { de: "Ticket", es: "Ticket", ca: "Ticket" },
  Stories: { de: "Aufgaben", es: "Historias", ca: "Històries" },
  Story: { de: "Aufgabe", es: "Historia", ca: "Història" },
  Sprints: { de: "Sprints", es: "Sprints", ca: "Sprints" },
  Sprint: { de: "Sprint", es: "Sprint", ca: "Sprint" },
  Tasks: { de: "To-dos", es: "Tareas", ca: "Tasques" },
  Task: { de: "To-do", es: "Tarea", ca: "Tasca" },
  Apps: { de: "Apps", es: "Apps", ca: "Apps" },
  App: { de: "App", es: "App", ca: "App" },
  Processes: { de: "Prozesse", es: "Procesos", ca: "Processos" },
  Process: { de: "Prozess", es: "Proceso", ca: "Procés" },
  Meetings: { de: "Termine", es: "Reuniones", ca: "Reunions" },
  Meeting: { de: "Termin", es: "Reunión", ca: "Reunió" },
  "Work logs": { de: "Zeiterfassung", es: "Registros de tiempo", ca: "Registres de temps" },
  "Work log": { de: "Zeiteintrag", es: "Registro de tiempo", ca: "Registre de temps" },
  "Knowledge base": {
    de: "Wissensdatenbank",
    es: "Base de conocimiento",
    ca: "Base de coneixement",
  },
  Settings: { de: "Einstellungen", es: "Ajustes", ca: "Configuració" },
  Home: { de: "Start", es: "Inicio", ca: "Inici" },
  Members: { de: "Mitglieder", es: "Miembros", ca: "Membres" },
  Deadline: { de: "Frist", es: "Fecha límite", ca: "Data límit" },
  Department: { de: "Abteilung", es: "Departamento", ca: "Departament" },
  Overview: { de: "Übersicht", es: "Resumen", ca: "Resum" },
  Activity: { de: "Verlauf", es: "Actividad", ca: "Activitat" },

  /* ── Ticket types ─── the German here is the agency's own, from Glide. ──── */
  Question: { de: "Frage", es: "Pregunta", ca: "Pregunta" },
  Issue: { de: "Problem", es: "Problema", ca: "Problema" },
  Request: { de: "Anfrage", es: "Solicitud", ca: "Sol·licitud" },
  Extra: { de: "Extra", es: "Extra", ca: "Extra" },
  Requirements: { de: "Anforderungen", es: "Requisitos", ca: "Requisits" },

  /* ── Sprint types and delivery programmes ─── also lifted, not translated. ─ */
  Validation: { de: "Validierung", es: "Validación", ca: "Validació" },
  Refinement: { de: "Anpassung", es: "Ajuste", ca: "Ajust" },
  Diagnostic: { de: "Prozessanalyse", es: "Diagnóstico", ca: "Diagnòstic" },
  Training: { de: "Schulung", es: "Formación", ca: "Formació" },
  Enhancement: { de: "Erweiterung", es: "Ampliación", ca: "Ampliació" },
  Implementation: { de: "Umsetzung", es: "Implementación", ca: "Implementació" },
  "Process optimization": {
    de: "Prozessoptimierung",
    es: "Optimización de procesos",
    ca: "Optimització de processos",
  },
  "Data migration": { de: "Datenpflege", es: "Migración de datos", ca: "Migració de dades" },
  Foundation: { de: "Fundament", es: "Base", ca: "Base" },
  Assessment: { de: "Bewertung", es: "Evaluación", ca: "Avaluació" },

  /* ── Story types ─────────────────────────────────────────────────────────── */
  Fix: { de: "Fehlerbehebung", es: "Corrección", ca: "Correcció" },
  Feature: { de: "Funktion", es: "Función", ca: "Funció" },
  Change: { de: "Änderung", es: "Cambio", ca: "Canvi" },

  /* ── Departments ─────────────────────────────────────────────────────────── */
  Sales: { de: "Vertrieb", es: "Ventas", ca: "Vendes" },
  Admin: { de: "Verwaltung", es: "Administración", ca: "Administració" },
  Production: { de: "Produktion", es: "Producción", ca: "Producció" },
  Marketing: { de: "Marketing", es: "Marketing", ca: "Màrqueting" },
  Business: { de: "Geschäft", es: "Negocio", ca: "Negoci" },

  /* ── Statuses ────────────────────────────────────────────────────────────── */
  Open: { de: "Offen", es: "Abierto", ca: "Obert" },
  Triage: { de: "Sichtung", es: "Clasificación", ca: "Classificació" },
  Scheduled: { de: "Geplant", es: "Programado", ca: "Programat" },
  "In progress": { de: "In Arbeit", es: "En curso", ca: "En curs" },
  Ready: { de: "Fertig", es: "Listo", ca: "Llest" },
  Resolved: { de: "Erledigt", es: "Resuelto", ca: "Resolt" },
  "In review": { de: "In Prüfung", es: "En revisión", ca: "En revisió" },
  Done: { de: "Erledigt", es: "Hecho", ca: "Fet" },
  Active: { de: "Aktiv", es: "Activo", ca: "Actiu" },
  Archived: { de: "Archiviert", es: "Archivado", ca: "Arxivat" },

  /* ── The verbs on buttons ────────────────────────────────────────────────── */
  Submit: { de: "Absenden", es: "Enviar", ca: "Enviar" },
  Save: { de: "Speichern", es: "Guardar", ca: "Desar" },
  Cancel: { de: "Abbrechen", es: "Cancelar", ca: "Cancel·lar" },
  Edit: { de: "Bearbeiten", es: "Editar", ca: "Editar" },
  Delete: { de: "Löschen", es: "Eliminar", ca: "Eliminar" },
  Search: { de: "Suchen", es: "Buscar", ca: "Cercar" },
  Filter: { de: "Filtern", es: "Filtrar", ca: "Filtrar" },
  Close: { de: "Schließen", es: "Cerrar", ca: "Tancar" },
  Back: { de: "Zurück", es: "Atrás", ca: "Enrere" },
  "Start timer": {
    de: "Zeit starten",
    es: "Iniciar temporizador",
    ca: "Iniciar temporitzador",
  },
  "Stop timer": { de: "Zeit stoppen", es: "Detener temporizador", ca: "Aturar temporitzador" },
  "Send for review": { de: "Zur Prüfung senden", es: "Enviar a revisión", ca: "Enviar a revisió" },
  Resolve: { de: "Abschließen", es: "Resolver", ca: "Resoldre" },

  /* ── The language switcher itself ────────────────────────────────────────── */
  Language: { de: "Sprache", es: "Idioma", ca: "Idioma" },
  "Choose the language you want kwapso in.": {
    de: "Wählen Sie die Sprache, in der Sie kwapso sehen möchten.",
    es: "Elige el idioma en el que quieres ver kwapso.",
    ca: "Tria l'idioma en què vols veure kwapso.",
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
  },
  "What people type stays in the language they typed it.": {
    de: "Was Menschen schreiben, bleibt in der Sprache, in der sie es geschrieben haben.",
    es: "Lo que las personas escriben permanece en el idioma en que lo escribieron.",
    ca: "El que la gent escriu es manté en l'idioma en què ho va escriure.",
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
  },
  "Language changed.": { de: "Sprache geändert.", es: "Idioma cambiado.", ca: "Idioma canviat." },
  "The knowledge base has nothing on this.": {
    de: "Die Wissensdatenbank hat dazu nichts.",
    es: "La base de conocimiento no tiene nada sobre esto.",
    ca: "La base de coneixement no té res sobre això.",
  },
  "That didn't save. Try again.": {
    de: "Das wurde nicht gespeichert. Bitte erneut versuchen.",
    es: "No se ha guardado. Inténtalo de nuevo.",
    ca: "No s'ha desat. Torna-ho a provar.",
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
  },
  "{percent}% translated": {
    de: "{percent}% übersetzt",
    es: "{percent}% traducido",
    ca: "{percent}% traduït",
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
  },
  "The rest is shown in English.": {
    de: "Der Rest wird auf Englisch angezeigt.",
    es: "El resto se muestra en inglés.",
    ca: "La resta es mostra en anglès.",
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
  },

  /* ── Carried across by hand ───────────────────────────────────────────────
   * Everything ABOVE is the agency's own vocabulary, READ OUT of their legacy
   * data — words somebody is already sure of. Everything BELOW was translated
   * here, by hand, string by string, because the generator that would otherwise
   * have done it spends the owner's own model key. Same care, different
   * provenance, and somebody correcting the Spanish should know which of the two
   * they are looking at: above, correcting a word means the agency changed its
   * mind; below, it means a translation was wrong.
   *
   * These are all twenty-eight languages rather than the vocabulary's three,
   * because there is no machine pass behind them to fill the rest in. */

  /* The strings the people→contact/member split renamed (R6, glossary). The
   * distinction has to survive translation: a `contact` is a person at a client,
   * a `member` is one of ours, and a language given one word for both would put
   * a client's name in a staff picker. Each is translated to the word its own
   * screen means, anchored on Contacts and Members above. */
  "Members on it": {
    de: "Beteiligte Mitglieder",
    es: "Miembros implicados",
    ca: "Membres implicats",
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
  },
  "No contacts found.": {
    de: "Keine Kontakte gefunden.",
    es: "No se encontraron contactos.",
    ca: "No s'ha trobat cap contacte.",
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
  },
  "Only the members on one app": {
    de: "Nur die Mitglieder in einer App",
    es: "Solo los miembros en una aplicación",
    ca: "Només els membres d'una aplicació",
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
  },
  "Search contacts…": {
    de: "Kontakte durchsuchen…",
    es: "Buscar contactos…",
    ca: "Cercar contactes…",
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
  },
  "Search members…": {
    de: "Mitglieder durchsuchen…",
    es: "Buscar miembros…",
    ca: "Cercar membres…",
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
  },
  "The companies and contacts we work with": {
    de: "Die Unternehmen und Kontakte, mit denen wir zusammenarbeiten",
    es: "Las empresas y contactos con los que trabajamos",
    ca: "Les empreses i contactes amb els quals treballem",
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
  },
  "Their contacts": {
    de: "Ihre Kontakte",
    es: "Sus contactos",
    ca: "Els seus contactes",
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
  },
  "Which app's members": {
    de: "Welche Mitglieder der App",
    es: "Los miembros de qué app",
    ca: "De quina aplicació són els membres",
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
  },
  "Who we are: our material, our team, and the details that go on a contract.": {
    de: "Wer wir sind: unser Material, unser Team und die Details, die in einen Vertrag gehören.",
    es: "Quiénes somos: nuestro material, nuestro equipo y los detalles que van en un contrato.",
    ca: "Qui som: el nostre material, el nostre equip i els detalls que van en un contracte.",
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
  },
  "You can add members, but no one is ever removed.": {
    de: "Du kannst Mitglieder hinzufügen, aber niemand wird je entfernt.",
    es: "Puedes añadir miembros, pero nadie se elimina nunca.",
    ca: "Pots afegir membres, però ningú no es retira mai.",
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
  },

  /* The audit line under every record detail. MOVED here unchanged from the
   * generated catalogue, where commit 5125f94 hand-wrote it: correct work, in
   * the one file whose header says it is overwritten. `{name}` and `{when}` are
   * holes, and several of these languages need them in the other order — which
   * is why the sentence is one entry rather than three fragments. */
  "Created by {name}": {
    de: "Erstellt von {name}",
    es: "Creado por {name}",
    ca: "Creat per {name}",
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
  },
  "Created by {name} · {when}": {
    de: "Erstellt von {name} · {when}",
    es: "Creado por {name} · {when}",
    ca: "Creat per {name} · {when}",
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
  },
  "Created {when}": {
    de: "Erstellt {when}",
    es: "Creado {when}",
    ca: "Creat {when}",
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
  },
  "Last edited by {name}": {
    de: "Zuletzt bearbeitet von {name}",
    es: "Última edición por {name}",
    ca: "Última edició per {name}",
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
  },
  "Last edited by {name} · {when}": {
    de: "Zuletzt bearbeitet von {name} · {when}",
    es: "Última edición por {name} · {when}",
    ca: "Última edició per {name} · {when}",
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
  },
  "Last edited {when}": {
    de: "Zuletzt bearbeitet {when}",
    es: "Última edición {when}",
    ca: "Última edició {when}",
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
  },

  /* The accounts strip, grouped by company. */
  "A company you work with. Everyone there goes on its Contacts tab.": {
    de: "Ein Unternehmen, mit dem Sie zusammenarbeiten. Alle dort stehen im Tab Kontakte.",
    es: "Una empresa con la que trabajas. Todos los de allí van en su pestaña Contactos.",
    ca: "Una empresa amb qui treballes. Tothom d'allà va a la seva pestanya Contactes.",
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
  },
  "Grouped by company, over the contacts loaded so far. Load more to fill a company in.": {
    de: "Nach Unternehmen gruppiert, über die bisher geladenen Kontakte. Laden Sie mehr, um ein Unternehmen zu vervollständigen.",
    es: "Agrupado por empresa, sobre los contactos cargados hasta ahora. Carga más para completar una empresa.",
    ca: "Agrupat per empresa, sobre els contactes carregats fins ara. Carrega'n més per completar una empresa.",
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
  },
  "No company yet": {
    de: "Noch kein Unternehmen",
    es: "Sin empresa aún",
    ca: "Encara sense empresa",
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
  },
  "Other companies": {
    de: "Andere Unternehmen",
    es: "Otras empresas",
    ca: "Altres empreses",
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
  },
  /* ── The relative time, and the counts beside it ───────────────────────────
   * `formatRelative` lives in shared/web/format.ts and returned four ENGLISH
   * strings to nine call sites across both front doors, because the extractor
   * was six hand-written folders and that was not one of them (R28, and the
   * walk is the front doors' own import closure now). So a German reader was
   * told *Erstellt von Aurora · 5d ago* on every record in the app.
   *
   * TERSE ON PURPOSE. Seven of the nine sites are tight — table cells with
   * `tabular-nums`, attachment meta lines, message-bubble timestamps — so each
   * language abbreviates as far as it naturally does and no further.
   *
   * ONE HOLE, NOT THREE FRAGMENTS. German puts the preposition in front (*vor 5
   * Min.*) and Japanese puts everything behind the number (*5分前*); neither is
   * reachable by gluing a number to a unit to a word, which is also why the two
   * count phrases below are whole sentences rather than a `t("of")` in the
   * middle of two numbers.
   *
   * ONE IMPERFECTION, STATED. `fill` has no plurals by design ("a translator
   * gets a sentence with holes in it"), so "vor {count} Tagen" is wrong for
   * exactly n=1 in the languages that inflect. The English key sidesteps it by
   * abbreviating; German reads far better in full six days out of seven, and a
   * plural engine is a change to shared/i18n.ts, not to a word. */
  "just now": {
    de: "gerade eben",
    es: "ahora mismo",
    ca: "ara mateix",
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
  },
  "{count}m ago": {
    de: "vor {count} Min.",
    es: "hace {count} min",
    ca: "fa {count} min",
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
  },
  "{count}h ago": {
    de: "vor {count} Std.",
    es: "hace {count} h",
    ca: "fa {count} h",
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
  },
  "{count}d ago": {
    de: "vor {count} Tagen",
    es: "hace {count} d",
    ca: "fa {count} d",
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
  },
  "{shown} of {total}": {
    de: "{shown} von {total}",
    es: "{shown} de {total}",
    ca: "{shown} de {total}",
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
  },
  "{done} of {total} done": {
    de: "{done} von {total} erledigt",
    es: "{done} de {total} hechos",
    ca: "{done} de {total} fets",
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
  },
  "{done} / {due} done": {
    de: "{done} / {due} erledigt",
    es: "{done} / {due} hechos",
    ca: "{done} / {due} fets",
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
  },
  "{days} days · {when}": {
    de: "{days} Tage · {when}",
    es: "{days} días · {when}",
    ca: "{days} dies · {when}",
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
  },
  /* ── The two seams both front doors render, out of shared/web/ ─────────────
   * The size section and the size steps themselves (shared/scale.ts). Already
   * wrapped in `t(...)` at the call site, in no catalogue for a year, and only
   * the language screen ever looked translated — because the three lines above
   * it in this file happened to have been written by hand. */
  "Size changed.": {
    de: "Größe geändert.",
    es: "Tamaño cambiado.",
    ca: "Mida canviada.",
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
  },
  "Text and spacing together. It follows you to every device you sign in on.": {
    de: "Text und Abstände zusammen. Es folgt Ihnen auf jedes Gerät, auf dem Sie sich anmelden.",
    es: "El texto y los espacios juntos. Te sigue a todos los dispositivos en los que inicias sesión.",
    ca: "El text i els espais alhora. Et segueix a tots els dispositius on inicies sessió.",
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
  },
  Compact: {
    de: "Kompakt",
    es: "Compacto",
    ca: "Compacte",
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
  },
  Comfortable: {
    de: "Normal",
    es: "Normal",
    ca: "Normal",
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
  },
  Large: {
    de: "Groß",
    es: "Grande",
    ca: "Gran",
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
  },
  /* ── Carried across by hand, the overnight round ─────────────────────────
   * Sentences the app said with no translation at all, so every reader saw
   * English. Written here rather than in the generated catalogue because the
   * seed is the layer that survives a regeneration and wins at runtime. */
  "+{n} more": { de: "+{n} weitere", es: "+{n} más", ca: "+{n} més"},
  "1 step takes longer than it used to and has no explanation yet.": { de: "1 Schritt dauert länger als früher und hat noch keine Erklärung.", es: "1 paso tarda más que antes y aún no tiene explicación.", ca: "1 pas triga més que abans i encara no té explicació."},
  "A block of delivery work for one client, with a start, an end and a price.": { de: "Ein Block an Lieferarbeit für einen Kunden, mit Beginn, Ende und Preis.", es: "Un bloque de trabajo de entrega para un cliente, con un inicio, un final y un precio.", ca: "Un bloc de treball d'entrega per a un client, amb un inici, un final i un preu."},
  "A new version of the app is ready.": { de: "Eine neue Version der App ist bereit.", es: "Hay una nueva versión de la app lista.", ca: "Hi ha una nova versió de l'app a punt."},
  "A system we built for somebody. Processes live inside one.": { de: "Ein System, das wir für jemanden gebaut haben. Prozesse leben darin.", es: "Un sistema que construimos para alguien. Los procesos viven dentro de uno.", ca: "Un sistema que hem construït per a algú. Els processos viuen a dins."},
  "A way of working inside one of your apps. You'll add its steps next.": { de: "Eine Arbeitsweise innerhalb einer Ihrer Apps. Die Schritte fügen Sie als Nächstes hinzu.", es: "Una forma de trabajar dentro de una de tus apps. A continuación añadirás sus pasos.", ca: "Una manera de treballar dins d'una de les teves apps. Tot seguit hi afegiràs els passos."},
  "Accept": { de: "Annehmen", es: "Aceptar", ca: "Acceptar"},
  "Access rights": { de: "Zugriffsrechte", es: "Permisos de acceso", ca: "Drets d'accés"},
  "Access rights saved.": { de: "Zugriffsrechte gespeichert.", es: "Permisos de acceso guardados.", ca: "Drets d'accés desats."},
  "Access taken away": { de: "Zugriff entzogen", es: "Acceso retirado", ca: "Accés retirat"},
  "Activating…": { de: "Wird aktiviert…", es: "Activando…", ca: "Activant…"},
  "Add a contact first": { de: "Fügen Sie zuerst einen Kontakt hinzu", es: "Añade primero un contacto", ca: "Afegeix primer un contacte"},
  "Add a deliverable": { de: "Ergebnis hinzufügen", es: "Añadir un entregable", ca: "Afegir un lliurable"},
  "Add a step": { de: "Schritt hinzufügen", es: "Añadir un paso", ca: "Afegir un pas"},
  "Add an account": { de: "Kunde hinzufügen", es: "Añadir una cuenta", ca: "Afegir un compte"},
  "Add to the knowledge base": { de: "Zur Wissensdatenbank hinzufügen", es: "Añadir a la base de conocimiento", ca: "Afegir a la base de coneixement"},
  "Already answered.": { de: "Bereits beantwortet.", es: "Ya respondido.", ca: "Ja respost."},
  "An admin can invite you back, or you can start a team of your own below.": { de: "Ein Administrator kann Sie wieder einladen, oder Sie gründen unten Ihr eigenes Team.", es: "Un administrador puede volver a invitarte, o puedes crear tu propio equipo abajo.", ca: "Un administrador et pot tornar a convidar, o pots crear el teu propi equip a sota."},
  "Answered, and they've been told.": { de: "Beantwortet, und sie wurden informiert.", es: "Respondido, y se les ha avisado.", ca: "Respost, i se'ls ha avisat."},
  "Anything you put here is something the assistant may use to answer questions, and it will name this source when it does.": { de: "Alles, was Sie hier ablegen, darf der Assistent zum Beantworten von Fragen verwenden, und er nennt dabei diese Quelle.", es: "Todo lo que pongas aquí lo puede usar el asistente para responder preguntas, y nombrará esta fuente cuando lo haga.", ca: "Tot el que hi posis ho pot fer servir l'assistent per respondre preguntes, i anomenarà aquesta font quan ho faci."},
  "App archived.": { de: "App archiviert.", es: "App archivada.", ca: "App arxivada."},
  "App restored.": { de: "App wiederhergestellt.", es: "App restaurada.", ca: "App restaurada."},
  "Archived.": { de: "Archiviert.", es: "Archivado.", ca: "Arxivat."},
  "Arrange a meeting": { de: "Termin vereinbaren", es: "Concertar una reunión", ca: "Concertar una reunió"},
  "Ask": { de: "Fragen", es: "Preguntar", ca: "Preguntar"},
  "Asset": { de: "Markenasset", es: "Activo de marca", ca: "Recurs de marca"},
  "Auto-matched": { de: "Automatisch zugeordnet", es: "Emparejado automáticamente", ca: "Emparellat automàticament"},
  "Back in Meetings.": { de: "Wieder in den Terminen.", es: "De vuelta en Reuniones.", ca: "Un altre cop a Reunions."},
  "Binned, nothing was counted.": { de: "Verworfen, es wurde nichts gezählt.", es: "Descartado, no se contó nada.", ca: "Descartat, no s'ha comptat res."},
  "Cancelled, the record and its notes are kept.": { de: "Abgesagt, der Datensatz und seine Notizen bleiben erhalten.", es: "Cancelado, se conservan el registro y sus notas.", ca: "Cancel·lat, es conserven el registre i les seves notes."},
  "Certificate recorded.": { de: "Zertifikat erfasst.", es: "Certificado registrado.", ca: "Certificat registrat."},
  "Certificate saved.": { de: "Zertifikat gespeichert.", es: "Certificado guardado.", ca: "Certificat desat."},
  "Change what it says, who has it, or what it touches.": { de: "Ändern Sie, was darin steht, wer sie hat und worauf sie zugreift.", es: "Cambia lo que dice, quién lo tiene y a qué llega.", ca: "Canvia el que diu, qui el té i a què arriba."},
  "Change what it's called, or where it has got to.": { de: "Ändern Sie, wie es heißt oder wie weit es ist.", es: "Cambia cómo se llama o en qué punto está.", ca: "Canvia com es diu o en quin punt està."},
  "Choose a company": { de: "Unternehmen wählen", es: "Elige una empresa", ca: "Tria una empresa"},
  "Choose a person": { de: "Person wählen", es: "Elige una persona", ca: "Tria una persona"},
  "Clear": { de: "Zurücksetzen", es: "Borrar", ca: "Esborrar"},
  "Collapse": { de: "Einklappen", es: "Contraer", ca: "Redueix"},
  "Collapse sidebar": { de: "Seitenleiste einklappen", es: "Contraer la barra lateral", ca: "Redueix la barra lateral"},
  "Contact moved.": { de: "Kontakt verschoben.", es: "Contacto movido.", ca: "Contacte mogut."},
  "Continue": { de: "Weiter", es: "Continuar", ca: "Continuar"},
  "Correct this source": { de: "Diese Quelle korrigieren", es: "Corregir esta fuente", ca: "Corregeix aquesta font"},
  "Correct this time": { de: "Diese Zeit korrigieren", es: "Corregir este tiempo", ca: "Corregeix aquest temps"},
  "Correct what it is, when it was, or where it lives.": { de: "Korrigieren Sie, was es ist, wann es war oder wo es liegt.", es: "Corrige qué es, cuándo fue o dónde está.", ca: "Corregeix què és, quan va ser o on és."},
  "Couldn't add it to the knowledge base.": { de: "Es konnte nicht zur Wissensdatenbank hinzugefügt werden.", es: "No se pudo añadir a la base de conocimiento.", ca: "No s'ha pogut afegir a la base de coneixement."},
  "Couldn't add that contact.": { de: "Der Kontakt konnte nicht hinzugefügt werden.", es: "No se pudo añadir ese contacto.", ca: "No s'ha pogut afegir aquest contacte."},
  "Couldn't add that file.": { de: "Die Datei konnte nicht hinzugefügt werden.", es: "No se pudo añadir ese archivo.", ca: "No s'ha pogut afegir aquest fitxer."},
  "Couldn't add that task.": { de: "Das To-do konnte nicht hinzugefügt werden.", es: "No se pudo añadir esa tarea.", ca: "No s'ha pogut afegir aquesta tasca."},
  "Couldn't add that value.": { de: "Der Wert konnte nicht hinzugefügt werden.", es: "No se pudo añadir ese valor.", ca: "No s'ha pogut afegir aquest valor."},
  "Couldn't add them to the ticket.": { de: "Sie konnten dem Ticket nicht hinzugefügt werden.", es: "No se pudo añadirles al ticket.", ca: "No s'ha pogut afegir-los al ticket."},
  "Couldn't arrange that.": { de: "Das konnte nicht vereinbart werden.", es: "No se pudo concertar eso.", ca: "No s'ha pogut concertar."},
  "Couldn't ask for that.": { de: "Danach konnte nicht gefragt werden.", es: "No se pudo pedir eso.", ca: "No s'ha pogut demanar."},
  "Couldn't ask the knowledge base.": { de: "Die Wissensdatenbank konnte nicht abgefragt werden.", es: "No se pudo preguntar a la base de conocimiento.", ca: "No s'ha pogut preguntar a la base de coneixement."},
  "Couldn't change that app.": { de: "Die App konnte nicht geändert werden.", es: "No se pudo cambiar esa app.", ca: "No s'ha pogut canviar aquesta app."},
  "Couldn't change that sprint.": { de: "Der Sprint konnte nicht geändert werden.", es: "No se pudo cambiar ese sprint.", ca: "No s'ha pogut canviar aquest sprint."},
  "Couldn't change that task.": { de: "Das To-do konnte nicht geändert werden.", es: "No se pudo cambiar esa tarea.", ca: "No s'ha pogut canviar aquesta tasca."},
  "Couldn't change that.": { de: "Das konnte nicht geändert werden.", es: "No se pudo cambiar eso.", ca: "No s'ha pogut canviar."},
  "Couldn't change the role.": { de: "Die Rolle konnte nicht geändert werden.", es: "No se pudo cambiar el rol.", ca: "No s'ha pogut canviar el rol."},
  "Couldn't create the team.": { de: "Das Team konnte nicht erstellt werden.", es: "No se pudo crear el equipo.", ca: "No s'ha pogut crear l'equip."},
  "Couldn't create the token.": { de: "Das Token konnte nicht erstellt werden.", es: "No se pudo crear el token.", ca: "No s'ha pogut crear el token."},
  "Couldn't disconnect that.": { de: "Die Verbindung konnte nicht getrennt werden.", es: "No se pudo desconectar eso.", ca: "No s'ha pogut desconnectar."},
  "Couldn't do that.": { de: "Das konnte nicht ausgeführt werden.", es: "No se pudo hacer eso.", ca: "No s'ha pogut fer."},
  "Couldn't finish that connection.": { de: "Die Verbindung konnte nicht abgeschlossen werden.", es: "No se pudo completar esa conexión.", ca: "No s'ha pogut completar aquesta connexió."},
  "Couldn't load the deliverables.": { de: "Die Ergebnisse konnten nicht geladen werden.", es: "No se pudieron cargar los entregables.", ca: "No s'han pogut carregar els lliurables."},
  "Couldn't load the time.": { de: "Die Zeiterfassung konnte nicht geladen werden.", es: "No se pudieron cargar los registros de tiempo.", ca: "No s'han pogut carregar els registres de temps."},
  "Couldn't log that time.": { de: "Die Zeit konnte nicht erfasst werden.", es: "No se pudo registrar ese tiempo.", ca: "No s'ha pogut registrar aquest temps."},
  "Couldn't mark that done.": { de: "Das konnte nicht als erledigt markiert werden.", es: "No se pudo marcar eso como hecho.", ca: "No s'ha pogut marcar com a fet."},
  "Couldn't move the contact.": { de: "Der Kontakt konnte nicht verschoben werden.", es: "No se pudo mover el contacto.", ca: "No s'ha pogut moure el contacte."},
  "Couldn't plan the import.": { de: "Der Import konnte nicht geplant werden.", es: "No se pudo planificar la importación.", ca: "No s'ha pogut planificar la importació."},
  "Couldn't post your reply.": { de: "Ihre Antwort konnte nicht gesendet werden.", es: "No se pudo publicar tu respuesta.", ca: "No s'ha pogut publicar la teva resposta."},
  "Couldn't raise the ticket.": { de: "Das Ticket konnte nicht erstellt werden.", es: "No se pudo crear el ticket.", ca: "No s'ha pogut crear el ticket."},
  "Couldn't read the transcript.": { de: "Das Transkript konnte nicht gelesen werden.", es: "No se pudo leer la transcripción.", ca: "No s'ha pogut llegir la transcripció."},
  "Couldn't read your Google material just now.": { de: "Ihre Google-Materialien konnten gerade nicht gelesen werden.", es: "No se pudo leer tu material de Google en este momento.", ca: "Ara mateix no s'ha pogut llegir el teu material de Google."},
  "Couldn't read your calendar.": { de: "Ihr Kalender konnte nicht gelesen werden.", es: "No se pudo leer tu calendario.", ca: "No s'ha pogut llegir el teu calendari."},
  "Couldn't record that.": { de: "Das konnte nicht erfasst werden.", es: "No se pudo registrar eso.", ca: "No s'ha pogut registrar."},
  "Couldn't rename that value.": { de: "Der Wert konnte nicht umbenannt werden.", es: "No se pudo renombrar ese valor.", ca: "No s'ha pogut canviar el nom d'aquest valor."},
  "Couldn't revoke the token.": { de: "Das Token konnte nicht widerrufen werden.", es: "No se pudo revocar el token.", ca: "No s'ha pogut revocar el token."},
  "Couldn't save access rights.": { de: "Die Zugriffsrechte konnten nicht gespeichert werden.", es: "No se pudieron guardar los permisos de acceso.", ca: "No s'han pogut desar els drets d'accés."},
  "Couldn't save that correction.": { de: "Die Korrektur konnte nicht gespeichert werden.", es: "No se pudo guardar esa corrección.", ca: "No s'ha pogut desar aquesta correcció."},
  "Couldn't save that rate.": { de: "Der Satz konnte nicht gespeichert werden.", es: "No se pudo guardar esa tarifa.", ca: "No s'ha pogut desar aquesta tarifa."},
  "Couldn't save that.": { de: "Das konnte nicht gespeichert werden.", es: "No se pudo guardar eso.", ca: "No s'ha pogut desar."},
  "Couldn't save the account.": { de: "Der Kunde konnte nicht gespeichert werden.", es: "No se pudo guardar la cuenta.", ca: "No s'ha pogut desar el compte."},
  "Couldn't save the app.": { de: "Die App konnte nicht gespeichert werden.", es: "No se pudo guardar la app.", ca: "No s'ha pogut desar l'app."},
  "Couldn't save the certificate.": { de: "Das Zertifikat konnte nicht gespeichert werden.", es: "No se pudo guardar el certificado.", ca: "No s'ha pogut desar el certificat."},
  "Couldn't save the meeting.": { de: "Der Termin konnte nicht gespeichert werden.", es: "No se pudo guardar la reunión.", ca: "No s'ha pogut desar la reunió."},
  "Couldn't save the notes.": { de: "Die Notizen konnten nicht gespeichert werden.", es: "No se pudieron guardar las notas.", ca: "No s'han pogut desar les notes."},
  "Couldn't save the profile.": { de: "Das Profil konnte nicht gespeichert werden.", es: "No se pudo guardar el perfil.", ca: "No s'ha pogut desar el perfil."},
  "Couldn't save the role.": { de: "Die Rolle konnte nicht gespeichert werden.", es: "No se pudo guardar el rol.", ca: "No s'ha pogut desar el rol."},
  "Couldn't save the source.": { de: "Die Quelle konnte nicht gespeichert werden.", es: "No se pudo guardar la fuente.", ca: "No s'ha pogut desar la font."},
  "Couldn't save the sprint.": { de: "Der Sprint konnte nicht gespeichert werden.", es: "No se pudo guardar el sprint.", ca: "No s'ha pogut desar el sprint."},
  "Couldn't save the step.": { de: "Der Schritt konnte nicht gespeichert werden.", es: "No se pudo guardar el paso.", ca: "No s'ha pogut desar el pas."},
  "Couldn't save the story.": { de: "Die Aufgabe konnte nicht gespeichert werden.", es: "No se pudo guardar la historia.", ca: "No s'ha pogut desar la història."},
  "Couldn't save the team.": { de: "Das Team konnte nicht gespeichert werden.", es: "No se pudo guardar el equipo.", ca: "No s'ha pogut desar l'equip."},
  "Couldn't save the ticket.": { de: "Das Ticket konnte nicht gespeichert werden.", es: "No se pudo guardar el ticket.", ca: "No s'ha pogut desar el ticket."},
  "Couldn't save those details.": { de: "Die Details konnten nicht gespeichert werden.", es: "No se pudieron guardar esos detalles.", ca: "No s'han pogut desar aquests detalls."},
  "Couldn't save your profile.": { de: "Ihr Profil konnte nicht gespeichert werden.", es: "No se pudo guardar tu perfil.", ca: "No s'ha pogut desar el teu perfil."},
  "Couldn't search just now. Try again.": { de: "Die Suche hat gerade nicht funktioniert. Bitte versuchen Sie es erneut.", es: "No se pudo buscar en este momento. Inténtalo de nuevo.", ca: "Ara mateix no s'ha pogut cercar. Torna-ho a provar."},
  "Couldn't send that for review.": { de: "Das konnte nicht zur Prüfung gesendet werden.", es: "No se pudo enviar eso a revisión.", ca: "No s'ha pogut enviar a revisió."},
  "Couldn't send that.": { de: "Das konnte nicht gesendet werden.", es: "No se pudo enviar eso.", ca: "No s'ha pogut enviar."},
  "Couldn't send the invite, please try again.": { de: "Die Einladung konnte nicht gesendet werden. Bitte versuchen Sie es erneut.", es: "No se pudo enviar la invitación, inténtalo de nuevo.", ca: "No s'ha pogut enviar la invitació, torna-ho a provar."},
  "Couldn't set that.": { de: "Das konnte nicht gesetzt werden.", es: "No se pudo establecer eso.", ca: "No s'ha pogut establir."},
  "Couldn't start that timer.": { de: "Die Zeit konnte nicht gestartet werden.", es: "No se pudo iniciar ese temporizador.", ca: "No s'ha pogut iniciar aquest temporitzador."},
  "Couldn't start the sprint.": { de: "Der Sprint konnte nicht gestartet werden.", es: "No se pudo iniciar el sprint.", ca: "No s'ha pogut iniciar el sprint."},
  "Couldn't start the timer.": { de: "Die Zeit konnte nicht gestartet werden.", es: "No se pudo iniciar el temporizador.", ca: "No s'ha pogut iniciar el temporitzador."},
  "Couldn't stop sharing that.": { de: "Die Freigabe konnte nicht beendet werden.", es: "No se pudo dejar de compartir eso.", ca: "No s'ha pogut deixar de compartir."},
  "Couldn't stop that timer.": { de: "Die Zeit konnte nicht gestoppt werden.", es: "No se pudo detener ese temporizador.", ca: "No s'ha pogut aturar aquest temporitzador."},
  "Couldn't switch on access.": { de: "Der Zugriff konnte nicht eingeschaltet werden.", es: "No se pudo activar el acceso.", ca: "No s'ha pogut activar l'accés."},
  "Couldn't switch. Try again.": { de: "Der Wechsel hat nicht geklappt. Bitte versuchen Sie es erneut.", es: "No se pudo cambiar. Inténtalo de nuevo.", ca: "No s'ha pogut canviar. Torna-ho a provar."},
  "Couldn't translate that.": { de: "Das konnte nicht übersetzt werden.", es: "No se pudo traducir eso.", ca: "No s'ha pogut traduir."},
  "Couldn't update that value.": { de: "Der Wert konnte nicht aktualisiert werden.", es: "No se pudo actualizar ese valor.", ca: "No s'ha pogut actualitzar aquest valor."},
  "Couldn't update the certificate.": { de: "Das Zertifikat konnte nicht aktualisiert werden.", es: "No se pudo actualizar el certificado.", ca: "No s'ha pogut actualitzar el certificat."},
  "Couldn't update the profile.": { de: "Das Profil konnte nicht aktualisiert werden.", es: "No se pudo actualizar el perfil.", ca: "No s'ha pogut actualitzar el perfil."},
  "Couldn't update the role.": { de: "Die Rolle konnte nicht aktualisiert werden.", es: "No se pudo actualizar el rol.", ca: "No s'ha pogut actualitzar el rol."},
  "Couldn't update the source.": { de: "Die Quelle konnte nicht aktualisiert werden.", es: "No se pudo actualizar el origen.", ca: "No s'ha pogut actualitzar l'origen."},
  "Couldn't upload that file.": { de: "Die Datei konnte nicht hochgeladen werden.", es: "No se pudo subir ese archivo.", ca: "No s'ha pogut pujar aquest fitxer."},
  "Couldn't withdraw that.": { de: "Das konnte nicht zurückgezogen werden.", es: "No se pudo retirar eso.", ca: "No s'ha pogut retirar això."},
  "Couldn't write that draft.": { de: "Der Entwurf konnte nicht geschrieben werden.", es: "No se pudo escribir ese borrador.", ca: "No s'ha pogut escriure aquest esborrany."},
  "Create a role": { de: "Eine Rolle erstellen", es: "Crear un rol", ca: "Crear un rol"},
  "Creating your team…": { de: "Ihr Team wird erstellt…", es: "Creando tu equipo…", ca: "Creant el teu equip…"},
  "Creating…": { de: "Wird erstellt…", es: "Creando…", ca: "Creant…"},
  "Date": { de: "Datum", es: "Fecha", ca: "Data"},
  "Date of the material": { de: "Datum des Materials", es: "Fecha del material", ca: "Data del material"},
  "Deactivating…": { de: "Wird deaktiviert…", es: "Desactivando…", ca: "Desactivant…"},
  "Deliverable updated.": { de: "Ergebnis aktualisiert.", es: "Entregable actualizado.", ca: "Lliurable actualitzat."},
  "Demo walkthrough": { de: "Demo-Rundgang", es: "Recorrido de demostración", ca: "Recorregut de demostració"},
  "Describe the problem you're facing. Chat with others, or use this ticket as a forum to discuss solutions.": { de: "Beschreiben Sie das Problem, das Sie haben. Tauschen Sie sich mit anderen aus, oder nutzen Sie dieses Ticket als Forum, um Lösungen zu besprechen.", es: "Describe el problema que tienes. Habla con otras personas, o usa este ticket como foro para discutir soluciones.", ca: "Descriu el problema que tens. Parla amb altres persones, o fes servir aquest ticket com a fòrum per debatre solucions."},
  "Disconnected here. Remove kwapso in your Google account too.": { de: "Hier getrennt. Entfernen Sie kwapso auch in Ihrem Google-Konto.", es: "Desconectado aquí. Quita kwapso también en tu cuenta de Google.", ca: "Desconnectat aquí. Treu kwapso també del teu compte de Google."},
  "Disconnected.": { de: "Getrennt.", es: "Desconectado.", ca: "Desconnectat."},
  "Earlier meetings haven't been loaded yet, so this month may not be the whole of it.": { de: "Frühere Termine wurden noch nicht geladen, dieser Monat ist also möglicherweise nicht vollständig.", es: "Las reuniones anteriores aún no se han cargado, así que puede que este mes no esté completo.", ca: "Les reunions anteriors encara no s'han carregat, així que potser aquest mes no hi és tot."},
  "Edit app": { de: "App bearbeiten", es: "Editar app", ca: "Editar app"},
  "Edit certificate": { de: "Zertifikat bearbeiten", es: "Editar certificado", ca: "Editar certificat"},
  "Edit process": { de: "Prozess bearbeiten", es: "Editar proceso", ca: "Editar procés"},
  "Edit step": { de: "Schritt bearbeiten", es: "Editar paso", ca: "Editar pas"},
  "Edit story": { de: "Aufgabe bearbeiten", es: "Editar historia", ca: "Editar història"},
  "Edit this account": { de: "Diesen Kunden bearbeiten", es: "Editar esta cuenta", ca: "Editar aquest compte"},
  "Edit this deliverable": { de: "Dieses Ergebnis bearbeiten", es: "Editar este entregable", ca: "Editar aquest lliurable"},
  "Edit this meeting": { de: "Diesen Termin bearbeiten", es: "Editar esta reunión", ca: "Editar aquesta reunió"},
  "Edit this role": { de: "Diese Rolle bearbeiten", es: "Editar este rol", ca: "Editar aquest rol"},
  "Edit this sprint": { de: "Diesen Sprint bearbeiten", es: "Editar este sprint", ca: "Editar aquest sprint"},
  "Edit this ticket": { de: "Dieses Ticket bearbeiten", es: "Editar este ticket", ca: "Editar aquest ticket"},
  "Emoji": { de: "Emoji", es: "Emoji", ca: "Emoji"},
  "Entries": { de: "Einträge", es: "Entradas", ca: "Entrades"},
  "Every entry here is the same kind of work.": { de: "Jeder Eintrag hier ist dieselbe Art von Arbeit.", es: "Cada entrada aquí es el mismo tipo de trabajo.", ca: "Cada entrada d'aquí és el mateix tipus de feina."},
  "Every ticket a client raises shows here while it is being worked on.": { de: "Jedes Ticket, das ein Kunde stellt, wird hier angezeigt, während es bearbeitet wird.", es: "Cada ticket que un cliente plantea aparece aquí mientras se está trabajando en él.", ca: "Tot ticket que presenta un client es mostra aquí mentre s'hi està treballant."},
  "Expand": { de: "Ausklappen", es: "Expandir", ca: "Expandir"},
  "Expand sidebar": { de: "Seitenleiste ausklappen", es: "Expandir la barra lateral", ca: "Expandir la barra lateral"},
  "Filed.": { de: "Abgelegt.", es: "Registrado.", ca: "Registrat."},
  "Fix what was written down. The change is kept in the record's history, with your name on it.": { de: "Korrigieren Sie, was festgehalten wurde. Die Änderung bleibt im Verlauf des Datensatzes stehen, mit Ihrem Namen daran.", es: "Corrige lo que se anotó. El cambio queda en el historial del registro, con tu nombre.", ca: "Corregeix el que es va anotar. El canvi queda a l'historial del registre, amb el teu nom."},
  "For work already finished. Say when it started and when it stopped, we work out the rest.": { de: "Für Arbeit, die bereits erledigt ist. Sagen Sie, wann sie begann und wann sie endete, den Rest rechnen wir aus.", es: "Para trabajo ya terminado. Di cuándo empezó y cuándo terminó, del resto nos encargamos.", ca: "Per a feina ja acabada. Digues quan va començar i quan va acabar, la resta la calculem nosaltres."},
  "Hours by kind of work": { de: "Stunden nach Art der Arbeit", es: "Horas por tipo de trabajo", ca: "Hores per tipus de feina"},
  "Hours by person": { de: "Stunden nach Person", es: "Horas por persona", ca: "Hores per persona"},
  "Hours logged": { de: "Erfasste Stunden", es: "Horas registradas", ca: "Hores registrades"},
  "How to read this month": { de: "So lesen Sie diesen Monat", es: "Cómo leer este mes", ca: "Com llegir aquest mes"},
  "I couldn't write this one out just now, so here's what I found.": { de: "Ich konnte das gerade nicht ausformulieren, hier ist also, was ich gefunden habe.", es: "No he podido redactarlo ahora mismo, así que esto es lo que he encontrado.", ca: "Ara mateix no ho he pogut redactar, així que això és el que he trobat."},
  "Important": { de: "Wichtig", es: "Importante", ca: "Important"},
  "In use": { de: "In Verwendung", es: "En uso", ca: "En ús"},
  "It no longer happens": { de: "Es passiert nicht mehr", es: "Ya no ocurre", ca: "Ja no passa"},
  "It starts with no access, you'll choose what it can do in the next step.": { de: "Sie beginnt ohne Zugriff, im nächsten Schritt wählen Sie, was sie darf.", es: "Empieza sin ningún acceso, en el siguiente paso elegirás lo que puede hacer.", ca: "Comença sense cap accés, al pas següent triaràs què pot fer."},
  "It stops being offered on new work. What has already been charged at it stays exactly as it is, and you can bring it back any time.": { de: "Sie wird bei neuer Arbeit nicht mehr angeboten. Was bereits damit abgerechnet wurde, bleibt genau so, und Sie können sie jederzeit zurückholen.", es: "Deja de ofrecerse en trabajos nuevos. Lo que ya se ha cobrado con ella queda exactamente igual, y puedes recuperarla cuando quieras.", ca: "Deixa d'oferir-se en feina nova. El que ja s'ha cobrat amb ella queda exactament igual, i la pots recuperar quan vulguis."},
  "Its app": { de: "Seine App", es: "Su app", ca: "La seva app"},
  "Joining…": { de: "Wird beigetreten…", es: "Uniéndote…", ca: "Unint-te…"},
  "Just you": { de: "Nur Sie", es: "Solo tú", ca: "Només tu"},
  "Leave blank to list your spaces": { de: "Leer lassen, um Ihre Spaces aufzulisten", es: "Déjalo en blanco para ver tus espacios", ca: "Deixa-ho en blanc per veure els teus espais"},
  "Leave this blank to use the file's own name": { de: "Leer lassen, um den Dateinamen zu übernehmen", es: "Déjalo en blanco para usar el nombre del propio archivo", ca: "Deixa-ho en blanc per fer servir el nom del propi fitxer"},
  "Link or file": { de: "Link oder Datei", es: "Enlace o archivo", ca: "Enllaç o fitxer"},
  "Look": { de: "Suchen", es: "Buscar", ca: "Cercar"},
  "Looking…": { de: "Wird gesucht…", es: "Buscando…", ca: "Cercant…"},
  "Marta Bergman": { de: "Marta Bergman", es: "Marta Bergman", ca: "Marta Bergman"},
  "Member": { de: "Mitglied", es: "Miembro", ca: "Membre"},
  "Month": { de: "Monat", es: "Mes", ca: "Mes"},
  "Most recent first": { de: "Neueste zuerst", es: "Más recientes primero", ca: "Els més recents primer"},
  "Most steps": { de: "Meiste Schritte", es: "Más pasos", ca: "Més passos"},
  "Never used yet": { de: "Noch nie verwendet", es: "Nunca usada aún", ca: "Encara mai utilitzada"},
  "New contact": { de: "Neuer Kontakt", es: "Nuevo contacto", ca: "Nou contacte"},
  "Newest first": { de: "Neueste zuerst", es: "Los más nuevos primero", ca: "Els més nous primer"},
  "Next month": { de: "Nächster Monat", es: "Mes siguiente", ca: "Mes següent"},
  "No account matched.": { de: "Kein Kunde gefunden.", es: "Ninguna cuenta coincide.", ca: "Cap compte coincideix."},
  "No app matched.": { de: "Keine App gefunden.", es: "Ninguna app coincide.", ca: "Cap app coincideix."},
  "No company matched.": { de: "Kein Unternehmen gefunden.", es: "Ninguna empresa coincide.", ca: "Cap empresa coincideix."},
  "No date": { de: "Kein Datum", es: "Sin fecha", ca: "Sense data"},
  "No date on it": { de: "Kein Datum daran", es: "No tiene fecha", ca: "No té data"},
  "No details recorded": { de: "Keine Details festgehalten", es: "Sin detalles anotados", ca: "Sense detalls anotats"},
  "No role matched.": { de: "Keine Rolle gefunden.", es: "Ningún rol coincide.", ca: "Cap rol coincideix."},
  "No sprints start this month.": { de: "In diesem Monat beginnt kein Sprint.", es: "Ningún sprint empieza este mes.", ca: "Aquest mes no comença cap sprint."},
  "No steps yet. Add the first one and say how long it takes and how often it happens, that is what a saving is measured from.": { de: "Noch keine Schritte. Fügen Sie den ersten hinzu und sagen Sie, wie lange er dauert und wie oft er vorkommt, daran wird die Ersparnis gemessen.", es: "Aún no hay pasos. Añade el primero y di cuánto tarda y cada cuánto ocurre, de ahí se mide el ahorro.", ca: "Encara no hi ha passos. Afegeix el primer i digues quant dura i cada quant passa, d'aquí es mesura l'estalvi."},
  "No ticket": { de: "Kein Ticket", es: "Sin ticket", ca: "Sense ticket"},
  "No ticket matched.": { de: "Kein Ticket gefunden.", es: "Ningún ticket coincide.", ca: "Cap ticket coincideix."},
  "No type matched.": { de: "Kein Typ gefunden.", es: "Ningún tipo coincide.", ca: "Cap tipus coincideix."},
  "No values match your search or filter.": { de: "Keine Werte passen zu Ihrer Suche oder Ihrem Filter.", es: "Ningún valor coincide con tu búsqueda o filtro.", ca: "Cap valor coincideix amb la teva cerca o filtre."},
  "No values yet. Add your first above.": { de: "Noch keine Werte. Fügen Sie oben Ihren ersten hinzu.", es: "Aún no hay valores. Añade el primero arriba.", ca: "Encara no hi ha valors. Afegeix el primer a dalt."},
  "No work written down against this ticket yet.": { de: "Es wurde noch keine Arbeit für dieses Ticket festgehalten.", es: "Aún no hay trabajo anotado en este ticket.", ca: "Encara no hi ha feina anotada en aquest ticket."},
  "Nobody here matched.": { de: "Niemand hier passt dazu.", es: "Nadie coincide aquí.", ca: "Aquí no coincideix ningú."},
  "None of this time was logged in the last eight weeks.": { de: "Von dieser Zeit wurde in den letzten acht Wochen nichts erfasst.", es: "Nada de este tiempo se registró en las últimas ocho semanas.", ca: "Res d'aquest temps s'ha registrat en les últimes vuit setmanes."},
  "Nothing due this month.": { de: "Diesen Monat ist nichts fällig.", es: "Nada vence este mes.", ca: "Aquest mes no venç res."},
  "Nothing has been handed over on this app yet.": { de: "Zu dieser App wurde noch nichts übergeben.", es: "Todavía no se ha entregado nada en esta app.", ca: "Encara no s'ha lliurat res en aquesta app."},
  "Nothing here matches that.": { de: "Hier passt nichts dazu.", es: "Nada de aquí coincide con eso.", ca: "Aquí no hi ha res que hi coincideixi."},
  "Nothing in Meetings this month.": { de: "Diesen Monat keine Termine.", es: "Nada en Reuniones este mes.", ca: "Res a Reunions aquest mes."},
  "Nothing logged yet": { de: "Noch nichts erfasst", es: "Aún no se ha registrado nada", ca: "Encara no s'ha registrat res"},
  "Nothing matched.": { de: "Nichts gefunden.", es: "Nada coincide.", ca: "Res no coincideix."},
  "Nothing new to bring in.": { de: "Es gibt nichts Neues zu importieren.", es: "No hay nada nuevo que importar.", ca: "No hi ha res nou per importar."},
  "Nothing to read yet.": { de: "Noch nichts zu lesen.", es: "Nada que leer todavía.", ca: "Encara no hi ha res per llegir."},
  "Nothing was deleted, this puts it back in front of the assistant.": { de: "Es wurde nichts gelöscht, damit steht es dem Assistenten wieder zur Verfügung.", es: "No se borró nada, esto vuelve a ponerlo delante del asistente.", ca: "No s'ha esborrat res, això el torna a posar davant de l'assistent."},
  "Older versions can be read but never edited, every saving is a subtraction from them, so they stay exactly as they were agreed.": { de: "Ältere Versionen können gelesen, aber nie bearbeitet werden. Jede Ersparnis ist eine Subtraktion von ihnen, deshalb bleiben sie genau so, wie sie vereinbart wurden.", es: "Las versiones anteriores se pueden leer pero nunca editar, cada ahorro es una resta a partir de ellas, así que quedan exactamente como se acordaron.", ca: "Les versions anteriors es poden llegir però mai editar, cada estalvi és una resta a partir d'elles, així que queden exactament com es van acordar."},
  "One person has worked on this.": { de: "Eine Person hat daran gearbeitet.", es: "Una persona ha trabajado en esto.", ca: "Una persona hi ha treballat."},
  "One piece of work, on one app. Start with the app and the rest narrows to it.": { de: "Ein Stück Arbeit, in einer App. Beginnen Sie mit der App, alles Weitere richtet sich danach.", es: "Una pieza de trabajo, en una sola app. Empieza por la app y el resto se acota a ella.", ca: "Una peça de feina, en una sola app. Comença per l'app i la resta s'hi ajusta."},
  "Open the file": { de: "Datei öffnen", es: "Abrir el archivo", ca: "Obrir el fitxer"},
  "Open the original": { de: "Original öffnen", es: "Abrir el original", ca: "Obrir l'original"},
  "Open the record": { de: "Datensatz öffnen", es: "Abrir el registro", ca: "Obrir el registre"},
  "Open what this is timing": { de: "Öffnen, wofür die Zeit läuft", es: "Abrir aquello que se está cronometrando", ca: "Obrir allò que s'està cronometrant"},
  "Open {name}": { de: "{name} öffnen", es: "Abrir {name}", ca: "Obrir {name}"},
  "Pick a role.": { de: "Wählen Sie eine Rolle.", es: "Elige un rol.", ca: "Tria un rol."},
  "Pick an existing group or start a new one, then add the value.": { de: "Wählen Sie eine bestehende Gruppe oder legen Sie eine neue an, und fügen Sie dann den Wert hinzu.", es: "Elige un grupo existente o crea uno nuevo, y después añade el valor.", ca: "Tria un grup existent o crea'n un de nou, i després afegeix el valor."},
  "Picture": { de: "Bild", es: "Imagen", ca: "Imatge"},
  "Planned by the assistant": { de: "Vom Assistenten geplant", es: "Planificado por el asistente", ca: "Planificat per l'assistent"},
  "Portal access": { de: "Portalzugang", es: "Acceso al portal", ca: "Accés al portal"},
  "Previous month": { de: "Vorheriger Monat", es: "Mes anterior", ca: "Mes anterior"},
  "Priority order": { de: "Nach Priorität", es: "Por orden de prioridad", ca: "Per ordre de prioritat"},
  "Purpose": { de: "Zweck", es: "Propósito", ca: "Propòsit"},
  "Put away.": { de: "Weggelegt.", es: "Apartado.", ca: "Apartat."},
  "Put back.": { de: "Zurückgelegt.", es: "Devuelto a la lista.", ca: "Tornat a la llista."},
  "Put somebody on duty": { de: "Jemanden in den Dienst einteilen", es: "Poner a alguien de servicio", ca: "Posar algú de guàrdia"},
  "Raise a ticket": { de: "Ein Ticket erstellen", es: "Crear un ticket", ca: "Obrir un ticket"},
  "Recently added": { de: "Zuletzt hinzugefügt", es: "Añadido recientemente", ca: "Afegit recentment"},
  "Recently changed": { de: "Zuletzt geändert", es: "Modificado recientemente", ca: "Modificat recentment"},
  "Recording that it stopped is how its whole time becomes a saving. The step keeps its place in this version and in every older one, nothing is deleted.": { de: "Wenn Sie festhalten, dass er nicht mehr stattfindet, wird seine ganze Zeit zur Ersparnis. Der Schritt behält seinen Platz in dieser und in jeder älteren Version, nichts wird gelöscht.", es: "Registrar que dejó de ocurrir es lo que convierte todo su tiempo en ahorro. El paso mantiene su sitio en esta versión y en todas las anteriores, no se borra nada.", ca: "Registrar que ha deixat de passar és el que converteix tot el seu temps en estalvi. El pas manté el seu lloc en aquesta versió i en totes les anteriors, no s'esborra res."},
  "Rename": { de: "Umbenennen", es: "Renombrar", ca: "Reanomenar"},
  "Rename it or say more about what it covers.": { de: "Benennen Sie ihn um oder beschreiben Sie genauer, was er umfasst.", es: "Cámbiale el nombre o explica mejor qué abarca.", ca: "Canvia-li el nom o explica millor què abasta."},
  "Rename it or update what it's for. You set what it can do over in the grid.": { de: "Benennen Sie sie um oder aktualisieren Sie, wofür sie da ist. Was sie darf, legen Sie drüben im Raster fest.", es: "Cámbiale el nombre o actualiza para qué sirve. Lo que puede hacer se define en la cuadrícula.", ca: "Canvia-li el nom o actualitza per a què serveix. El que pot fer es defineix a la graella."},
  "Restored.": { de: "Wiederhergestellt.", es: "Restaurado.", ca: "Restaurat."},
  "Revoking…": { de: "Wird widerrufen…", es: "Revocando…", ca: "Revocant…"},
  "Role activated.": { de: "Rolle aktiviert.", es: "Rol activado.", ca: "Rol activat."},
  "Role deactivated.": { de: "Rolle deaktiviert.", es: "Rol desactivado.", ca: "Rol desactivat."},
  "Save role": { de: "Rolle speichern", es: "Guardar rol", ca: "Desar rol"},
  "Save to Gmail drafts": { de: "In Gmail-Entwürfe speichern", es: "Guardar en borradores de Gmail", ca: "Desar als esborranys de Gmail"},
  "Saved.": { de: "Gespeichert.", es: "Guardado.", ca: "Desat."},
  "Saving…": { de: "Wird gespeichert…", es: "Guardando…", ca: "Desant…"},
  "Say what kind an entry is when you log it, and the split shows here.": { de: "Sagen Sie beim Erfassen, welche Art ein Eintrag ist, dann erscheint die Aufteilung hier.", es: "Di de qué tipo es cada registro al anotarlo y el reparto aparecerá aquí.", ca: "Digues de quin tipus és cada registre en anotar-lo i el repartiment apareixerà aquí."},
  "Search apps…": { de: "Apps durchsuchen…", es: "Buscar apps…", ca: "Cercar apps…"},
  "Search companies…": { de: "Unternehmen durchsuchen…", es: "Buscar empresas…", ca: "Cercar empreses…"},
  "Search departments…": { de: "Abteilungen durchsuchen…", es: "Buscar departamentos…", ca: "Cercar departaments…"},
  "Search reasons…": { de: "Gründe durchsuchen…", es: "Buscar motivos…", ca: "Cercar motius…"},
  "Search roles…": { de: "Rollen durchsuchen…", es: "Buscar roles…", ca: "Cercar rols…"},
  "Search sprints…": { de: "Sprints durchsuchen…", es: "Buscar sprints…", ca: "Cercar sprints…"},
  "Search stages…": { de: "Phasen durchsuchen…", es: "Buscar etapas…", ca: "Cercar etapes…"},
  "Search types…": { de: "Typen durchsuchen…", es: "Buscar tipos…", ca: "Cercar tipus…"},
  "Search versions…": { de: "Versionen durchsuchen…", es: "Buscar versiones…", ca: "Cercar versions…"},
  "Search what we handed over…": { de: "Übergebenes durchsuchen…", es: "Buscar lo que entregamos…", ca: "Cercar el que hem lliurat…"},
  "Searching…": { de: "Wird gesucht…", es: "Buscando…", ca: "Cercant…"},
  "Sending…": { de: "Wird gesendet…", es: "Enviando…", ca: "Enviant…"},
  "Set up your profile": { de: "Ihr Profil einrichten", es: "Configura tu perfil", ca: "Configura el teu perfil"},
  "Share a folder": { de: "Einen Ordner freigeben", es: "Compartir una carpeta", ca: "Compartir una carpeta"},
  "Share a space": { de: "Einen Space freigeben", es: "Compartir un espacio", ca: "Compartir un espai"},
  "Sold, minus our own time at our internal rates, minus what the tools cost each month. Our time is priced at agreed rates, not measured cost.": { de: "Verkauft, abzüglich unserer eigenen Zeit zu unseren internen Sätzen, abzüglich der monatlichen Kosten der Tools. Unsere Zeit wird zu vereinbarten Sätzen bewertet, nicht zu gemessenen Kosten.", es: "Lo vendido, menos nuestro propio tiempo a nuestras tarifas internas, menos lo que cuestan las herramientas cada mes. Nuestro tiempo se valora a tarifas acordadas, no a coste medido.", ca: "El que hem venut, menys el nostre propi temps a les nostres tarifes internes, menys el que costen les eines cada mes. El nostre temps es valora a tarifes acordades, no a cost mesurat."},
  "Some of this couldn't be translated, so it's showing as it was written.": { de: "Ein Teil davon ließ sich nicht übersetzen und wird so angezeigt, wie er geschrieben wurde.", es: "Una parte no se ha podido traducir, así que se muestra tal como se escribió.", ca: "Una part no s'ha pogut traduir, així que es mostra tal com es va escriure."},
  "Someone brand new goes in under New contact instead.": { de: "Eine ganz neue Person legen Sie stattdessen unter Neuer Kontakt an.", es: "Una persona totalmente nueva se añade en Nuevo contacto.", ca: "Una persona totalment nova s'afegeix a Nou contacte."},
  "Someone who has left": { de: "Jemand, der nicht mehr da ist", es: "Alguien que ya no está", ca: "Algú que ja no hi és"},
  "Someone with a login": { de: "Jemand mit einem Zugang", es: "Alguien con acceso", ca: "Algú amb accés"},
  "Something we handed over on this app: a doc, a recording, an SOP.": { de: "Etwas, das wir bei dieser App übergeben haben: ein Dokument, eine Aufzeichnung, eine Arbeitsanweisung.", es: "Algo que entregamos en esta app: un documento, una grabación, un procedimiento.", ca: "Alguna cosa que hem lliurat en aquesta app: un document, un enregistrament, un procediment."},
  "Something went wrong. Try again.": { de: "Etwas ist schiefgelaufen. Bitte erneut versuchen.", es: "Algo ha salido mal. Inténtalo de nuevo.", ca: "Alguna cosa ha anat malament. Torna-ho a provar."},
  "Sprint completed.": { de: "Sprint abgeschlossen.", es: "Sprint completado.", ca: "Sprint completat."},
  "Sprint reopened.": { de: "Sprint wieder geöffnet.", es: "Sprint reabierto.", ca: "Sprint reobert."},
  "Start my own team": { de: "Eigenes Team gründen", es: "Crear mi propio equipo", ca: "Crear el meu propi equip"},
  "Step added.": { de: "Schritt hinzugefügt.", es: "Paso añadido.", ca: "Pas afegit."},
  "Step recorded as no longer done.": { de: "Schritt als nicht mehr erledigt vermerkt.", es: "Paso registrado como ya no hecho.", ca: "Pas registrat com que ja no es fa."},
  "Step updated.": { de: "Schritt aktualisiert.", es: "Paso actualizado.", ca: "Pas actualitzat."},
  "Still reading your older meetings, press again to go further back.": { de: "Ihre älteren Termine werden noch gelesen, drücken Sie erneut, um weiter zurückzugehen.", es: "Todavía estamos leyendo tus reuniones más antiguas; pulsa otra vez para ir más atrás.", ca: "Encara estem llegint les teves reunions més antigues; prem un altre cop per anar més enrere."},
  "Stopped, kept in full.": { de: "Gestoppt, vollständig behalten.", es: "Detenido, se ha guardado completo.", ca: "Aturat, s'ha desat sencer."},
  "Switch on what this role can do. Turning on Create, Edit or Remove turns on Read too.": { de: "Schalten Sie ein, was diese Rolle darf. Wer Erstellen, Bearbeiten oder Entfernen einschaltet, schaltet auch Lesen ein.", es: "Activa lo que este rol puede hacer. Si activas Crear, Editar o Eliminar, se activa también Leer.", ca: "Activa el que pot fer aquest rol. Si actives Crear, Editar o Eliminar, també s'activa Llegir."},
  "Taken back out.": { de: "Wieder herausgenommen.", es: "Se ha vuelto a sacar.", ca: "S'ha tornat a treure."},
  "Team switched": { de: "Team gewechselt", es: "Equipo cambiado", ca: "Equip canviat"},
  "Tell us who you are, your team gets created right after.": { de: "Sagen Sie uns, wer Sie sind, gleich danach wird Ihr Team angelegt.", es: "Dinos quién eres; tu equipo se crea justo después.", ca: "Digues-nos qui ets; el teu equip es crea just després."},
  "The Admin role has full access and can't be changed.": { de: "Die Rolle Admin hat vollen Zugriff und lässt sich nicht ändern.", es: "El rol Admin tiene acceso completo y no se puede cambiar.", ca: "El rol Admin té accés complet i no es pot canviar."},
  "The agency": { de: "Die Agentur", es: "La agencia", ca: "L'agència"},
  "The assistant can use this again.": { de: "Der Assistent kann dies wieder verwenden.", es: "El asistente puede volver a usar esto.", ca: "L'assistent pot tornar a fer servir això."},
  "The assistant stops reading it. Nothing is deleted, and the sweep won't put it back.": { de: "Der Assistent liest es nicht mehr. Nichts wird gelöscht, und der Abgleich holt es nicht zurück.", es: "El asistente deja de leerlo. No se borra nada, y el barrido no lo volverá a traer.", ca: "L'assistent deixa de llegir-ho. No s'esborra res, i el repàs no ho tornarà a portar."},
  "The assistant will no longer use this.": { de: "Der Assistent verwendet dies nicht mehr.", es: "El asistente ya no usará esto.", ca: "L'assistent ja no farà servir això."},
  "The companies they're a contact of. Who they work for is on the Overview.": { de: "Die Unternehmen, deren Kontakt sie sind. Wo sie arbeiten, steht in der Übersicht.", es: "Las empresas de las que es contacto. Para quién trabaja está en el Resumen.", ca: "Les empreses de les quals és contacte. Per a qui treballa és al Resum."},
  "The company they work for. Being a contact of a company is a separate thing, and the same person can be a contact of several.": { de: "Das Unternehmen, für das sie arbeiten. Kontakt eines Unternehmens zu sein ist etwas anderes, und dieselbe Person kann Kontakt mehrerer sein.", es: "La empresa para la que trabaja. Ser contacto de una empresa es otra cosa, y la misma persona puede ser contacto de varias.", ca: "L'empresa per a la qual treballa. Ser contacte d'una empresa és una altra cosa, i la mateixa persona pot ser contacte de diverses."},
  "The import didn't finish.": { de: "Der Import wurde nicht abgeschlossen.", es: "La importación no ha terminado.", ca: "La importació no ha acabat."},
  "The options behind your team's dropdowns. Ticket types, Sprint types and more. Pick a group, or start a new one.": { de: "Die Optionen hinter den Dropdown-Menüs Ihres Teams. Ticket-Typen, Sprint-Typen und mehr. Wählen Sie eine Gruppe oder erstellen Sie eine neue.", es: "Las opciones tras los menús desplegables de tu equipo. Tipos de ticket, tipos de sprint y más. Elige un grupo o crea uno nuevo.", ca: "Les opcions dels desplegables del teu equip. Tipus de ticket, tipus de sprint i més. Tria un grup o crea'n un de nou."},
  "The team can read it": { de: "Das Team kann es lesen", es: "El equipo puede leerlo", ca: "L'equip ho pot llegir"},
  "The total above covers all of it. This picture fills in as new time lands.": { de: "Die Summe oben umfasst alles. Dieses Bild füllt sich, sobald neue Zeit hinzukommt.", es: "El total de arriba lo incluye todo. Este reparto se va completando a medida que llega tiempo nuevo.", ca: "El total de dalt ho inclou tot. Aquesta imatge es va completant a mesura que arriba temps nou."},
  "There's nothing here you can import into yet. You can import once you're allowed to create Accounts, Roles or Dropdown values.": { de: "Es gibt hier noch nichts, in das Sie importieren können. Sie können importieren, sobald Sie Kunden, Rollen oder Dropdown-Werte erstellen dürfen.", es: "Aún no hay nada aquí para importar. Podrás importar una vez que tengas permiso para crear Cuentas, Roles o Valores de menú desplegable.", ca: "Encara no hi ha res aquí per importar. Podràs importar quan se't permeti crear Comptes, Rols o Valors de desplegable."},
  "This is your work with us.": { de: "Das ist Ihre Arbeit mit uns.", es: "Este es tu trabajo con nosotros.", ca: "Aquesta és la teva feina amb nosaltres."},
  "This one is kept in step with the record it came from, so its words are edited there. You can still change where it is filed and who can use it.": { de: "Diese wird mit dem Datensatz, aus dem sie stammt, in Einklang gehalten, ihre Worte werden also dort bearbeitet. Wo sie abgelegt ist und wer sie nutzen darf, können Sie weiterhin ändern.", es: "Esta se mantiene al día con el registro del que procede, así que su texto se edita allí. Aún puedes cambiar dónde está archivada y quién puede usarla.", ca: "Aquesta es manté al dia amb el registre del qual prové, així que el seu text s'edita allà. Encara pots canviar on està arxivada i qui la pot fer servir."},
  "This picture appears once a second person logs time against it.": { de: "Dieses Bild erscheint, sobald eine zweite Person Zeit darauf erfasst.", es: "Este reparto aparece en cuanto una segunda persona registra tiempo aquí.", ca: "Aquesta imatge apareix quan una segona persona hi registra temps."},
  "This version has no steps recorded.": { de: "Für diese Version sind keine Schritte erfasst.", es: "Esta versión no tiene pasos registrados.", ca: "Aquesta versió no té passos registrats."},
  "Ticked off. It's under All tasks.": { de: "Abgehakt. Es steht unter Alle Aufgaben.", es: "Marcado. Está en Todas las tareas.", ca: "Marcat. És a Totes les tasques."},
  "Today": { de: "Heute", es: "Hoy", ca: "Avui"},
  "Transcript read.": { de: "Mitschrift gelesen.", es: "Transcripción leída.", ca: "Transcripció llegida."},
  "Try “invite a member as a Viewer”": { de: "Versuchen Sie „ein Mitglied als Betrachter einladen“", es: "Prueba «invita a un miembro como Lector»", ca: "Prova «convida un membre com a Lector»"},
  "Update the details you hold for them.": { de: "Aktualisieren Sie die Angaben, die Sie zu dieser Person haben.", es: "Actualiza los datos que tienes de esta persona.", ca: "Actualitza les dades que en tens."},
  "Update what you're asking for. Everyone on the ticket will see the change.": { de: "Aktualisieren Sie, worum Sie bitten. Alle beim Ticket sehen die Änderung.", es: "Actualiza lo que estás pidiendo. Todos los que están en el ticket verán el cambio.", ca: "Actualitza el que demanes. Tothom qui és al ticket veurà el canvi."},
  "Uploaded file": { de: "Hochgeladene Datei", es: "Archivo subido", ca: "Fitxer pujat"},
  "Uploading…": { de: "Wird hochgeladen…", es: "Subiendo…", ca: "Pujant…"},
  "Urgent": { de: "Dringend", es: "Urgente", ca: "Urgent"},
  "Video, handover doc, SOP…": { de: "Video, Übergabedokument, Arbeitsanweisung…", es: "Vídeo, documento de entrega, procedimiento…", ca: "Vídeo, document de lliurament, procediment…"},
  "We can't find that ticket.": { de: "Wir finden dieses Ticket nicht.", es: "No encontramos ese ticket.", ca: "No trobem aquest ticket."},
  "We'll email you a six-digit code, or you can use Google. No password to remember.": { de: "Wir senden Ihnen einen sechsstelligen Code per E-Mail, oder Sie nutzen Google. Kein Passwort zum Merken.", es: "Te enviaremos por correo un código de seis dígitos, o puedes usar Google. Sin contraseña que recordar.", ca: "T'enviarem per correu un codi de sis xifres, o pots fer servir Google. Cap contrasenya per recordar."},
  "What I read": { de: "Was ich gelesen habe", es: "Lo que he leído", ca: "El que he llegit"},
  "What it's called, when it runs, and what it was sold for. The client and the app it covers stay as they are.": { de: "Wie er heißt, wann er läuft und wofür er verkauft wurde. Der Mandant und die App, die er abdeckt, bleiben unverändert.", es: "Cómo se llama, cuándo se ejecuta y por cuánto se vendió. El cliente y la app que cubre se quedan como están.", ca: "Com es diu, quan s'executa i per quant es va vendre. El client i l'app que cobreix es queden com estan."},
  "What was asked": { de: "Was gefragt wurde", es: "Lo que se pidió", ca: "El que es va demanar"},
  "Where the tickets are sitting": { de: "Wo die Tickets gerade stehen", es: "Dónde están los tickets", ca: "On són els tickets"},
  "Which client is it for?": { de: "Für welchen Mandanten ist es?", es: "¿Para qué cliente es?", ca: "Per a quin client és?"},
  "Working…": { de: "Wird bearbeitet…", es: "Trabajando…", ca: "Treballant…"},
  "Write a profile": { de: "Ein Profil schreiben", es: "Escribir un perfil", ca: "Escriure un perfil"},
  "Write it again": { de: "Neu schreiben", es: "Escribirlo otra vez", ca: "Tornar-ho a escriure"},
  "Write up what was decided while it is still fresh, the notes are the part worth keeping.": { de: "Halten Sie fest, was entschieden wurde, solange es frisch ist, die Notizen sind der Teil, der bleibt.", es: "Anota lo que se decidió mientras lo tienes fresco; las notas son la parte que merece la pena guardar.", ca: "Anota el que s'ha decidit mentre encara ho tens fresc; les notes són la part que val la pena guardar."},
  "Writing…": { de: "Wird geschrieben…", es: "Escribiendo…", ca: "Escrivint…"},
  "You can view what this role can do, but not change it.": { de: "Sie können sehen, was diese Rolle darf, sie aber nicht ändern.", es: "Puedes ver lo que este rol puede hacer, pero no cambiarlo.", ca: "Pots veure el que pot fer aquest rol, però no canviar-ho."},
  "You're not in a team": { de: "Sie sind in keinem Team", es: "No estás en ningún equipo", ca: "No ets a cap equip"},
  "a ticket": { de: "ein Ticket", es: "un ticket", ca: "un ticket"},
  "cut when a sprint completed": { de: "erstellt beim Abschluss eines Sprints", es: "creada al completarse un sprint", ca: "creada en completar-se un sprint"},
  "e.g. Question": { de: "z. B. Frage", es: "p. ej. Pregunta", ca: "p. ex. Pregunta"},
  "each time": { de: "pro Durchlauf", es: "cada vez", ca: "cada vegada"},
  "explained": { de: "erklärt", es: "explicado", ca: "explicat"},
  "folder": { de: "Ordner", es: "carpeta", ca: "carpeta"},
  "granted": { de: "ausgestellt", es: "expedido", ca: "expedit"},
  "lapses": { de: "läuft ab", es: "caduca", ca: "caduca"},
  "logged": { de: "erfasst", es: "registrado", ca: "registrat"},
  "no explanation yet": { de: "noch keine Erklärung", es: "sin explicación aún", ca: "encara sense explicació"},
  "not billable": { de: "nicht abrechenbar", es: "no facturable", ca: "no facturable"},
  "not done now": { de: "wird nicht mehr gemacht", es: "ya no se hace", ca: "ja no es fa"},
  "not needed now": { de: "wird nicht mehr gebraucht", es: "ya no hace falta", ca: "ja no cal"},
  "running": { de: "läuft", es: "en curso", ca: "en curs"},
  "something": { de: "etwas", es: "algo", ca: "alguna cosa"},
  "space": { de: "Space", es: "espacio", ca: "espai"},
  "the baseline": { de: "der Ausgangswert", es: "la línea base", ca: "la línia base"},
  "this client": { de: "diesem Mandanten", es: "este cliente", ca: "aquest client"},
  "this team": { de: "dieses Team", es: "este equipo", ca: "aquest equip"},
  "this version": { de: "diese Version", es: "esta versión", ca: "aquesta versió"},
  "today": { de: "heute", es: "hoy", ca: "avui"},
  "your current team": { de: "Ihr aktuelles Team", es: "tu equipo actual", ca: "el teu equip actual"},
  "your team has explained this below": { de: "Ihr Team hat dies unten erklärt", es: "tu equipo lo ha explicado abajo", ca: "el teu equip ho ha explicat a sota"},
  "your team is writing an explanation": { de: "Ihr Team schreibt gerade eine Erklärung", es: "tu equipo está escribiendo una explicación", ca: "el teu equip està escrivint una explicació"},
  "{label} won't be part of this ticket any more. You can always send it again.": { de: "{label} gehört nicht mehr zu diesem Ticket. Sie können es jederzeit erneut senden.", es: "{label} ya no formará parte de este ticket. Siempre puedes volver a enviarlo.", ca: "{label} ja no formarà part d'aquest ticket. Sempre el pots tornar a enviar."},
  "{name} is now in your accounts, but not a contact here: {reason} Use Add contact to finish.": { de: "{name} ist jetzt in Ihren Kunden, aber hier kein Kontakt: {reason} Verwenden Sie Kontakt hinzufügen, um abzuschließen.", es: "{name} ya está en tus cuentas, pero aquí no es un contacto: {reason} Usa Añadir contacto para terminar.", ca: "{name} ja és als teus comptes, però aquí no és un contacte: {reason} Fes servir Afegir contacte per acabar."},
  "{name} is now in your accounts, but we couldn't make them a contact here. Use Add contact to finish.": { de: "{name} ist jetzt in Ihren Kunden, aber wir konnten die Person hier nicht zum Kontakt machen. Verwenden Sie Kontakt hinzufügen, um abzuschließen.", es: "{name} ya está en tus cuentas, pero no hemos podido hacerlo contacto aquí. Usa Añadir contacto para terminar.", ca: "{name} ja és als teus comptes, però no hem pogut fer-lo contacte aquí. Fes servir Afegir contacte per acabar."},

  /* ── WRITTEN BY HAND ON 2026-08-20, AND THE REASON IS THE OWNER'S RULE ─────
   *
   * 137 sentences the app says had NO entry anywhere — not in the generated
   * catalogue, not here — so every one of them shipped in English to somebody
   * who had chosen German. R28 keeps the catalogue matching the code; it cannot
   * make a MODEL RUN, and the generator beside it (`scripts/i18n-translate.mjs`)
   * spends the owner's own Anthropic key.
   *
   * HIS RULING, 20 Aug 2026: "Why does this require my Anthropic key? Why can't
   * you just do it? … only for human input, like things that are inputted by
   * humans and input text fields, can you use the Anthropic API key, and only
   * during runtime." The key pays for what a PERSON asks the assistant at the
   * moment they ask it. Translating the app's own furniture is build work, and
   * build work is written, not bought.
   *
   * So these are written here rather than generated there, in the seed, because
   * the catalogue says DO NOT HAND-EDIT and means it — anything put there is
   * lost the next time the generator runs, while the seed is resolved OVER the
   * catalogue at run time and survives.
   *
   * TWO ENTRIES ARE DELIBERATELY IDENTICAL IN ALL 28. `#RRGGBB` is a colour
   * FORMAT, not prose. `Einstellungen` is the placeholder in the "German name"
   * field on the module form — it is an EXAMPLE OF GERMAN, and translating it
   * would destroy the only thing it does. */
  "#RRGGBB": { de: "#RRGGBB", es: "#RRGGBB", ca: "#RRGGBB"},
  "1 account matches": { de: "1 Kunde passt", es: "1 cuenta coincide", ca: "1 compte coincideix"},
  "1 meeting matches": { de: "1 Besprechung passt", es: "1 reunión coincide", ca: "1 reunió coincideix"},
  "1 process matches": { de: "1 Prozess passt", es: "1 proceso coincide", ca: "1 procés coincideix"},
  "1 source matches": { de: "1 Quelle passt", es: "1 fuente coincide", ca: "1 font coincideix"},
  "1 story matches": { de: "1 Story passt", es: "1 historia coincide", ca: "1 història coincideix"},
  "1 ticket matches": { de: "1 Ticket passt", es: "1 ticket coincide", ca: "1 tiquet coincideix"},
  "A conversation, with what you mean to cover. It is kept here — kwapso reads your calendar and never writes to it.": { de: "Ein Gespräch mit dem, was Sie besprechen wollen. Es wird hier festgehalten – kwapso liest Ihren Kalender und schreibt nie hinein.", es: "Una conversación, con lo que quieres tratar. Se guarda aquí: kwapso lee tu calendario y nunca escribe en él.", ca: "Una conversa, amb allò que vols tractar. Es desa aquí: kwapso llegeix el teu calendari i mai no hi escriu."},
  "A message on the ticket. It does not resolve it.": { de: "Eine Nachricht am Ticket. Sie löst es nicht.", es: "Un mensaje en el ticket. No lo resuelve.", ca: "Un missatge al tiquet. No el resol."},
  "A section of this app, like Settings or Documents. Tickets say which one they are about.": { de: "Ein Bereich dieser App, etwa Einstellungen oder Dokumente. Tickets nennen den Bereich, um den es geht.", es: "Una sección de esta aplicación, como Ajustes o Documentos. Los tickets indican a cuál se refieren.", ca: "Una secció d'aquesta aplicació, com Configuració o Documents. Els tiquets indiquen a quina es refereixen."},
  "Activate profile": { de: "Profil aktivieren", es: "Activar perfil", ca: "Activa el perfil"},
  "Add": { de: "Hinzufügen", es: "Añadir", ca: "Afegir"},
  "Add a module": { de: "Modul hinzufügen", es: "Añadir un módulo", ca: "Afegir un mòdul"},
  "Add module": { de: "Modul hinzufügen", es: "Añadir módulo", ca: "Afegir mòdul"},
  "Add someone new to your accounts and make them a contact of {name}.": { de: "Fügen Sie eine neue Person zu Ihren Kunden hinzu und machen Sie sie zu einem Kontakt von {name}.", es: "Añade a alguien nuevo a tus cuentas y hazle contacto de {name}.", ca: "Afegeix algú nou als teus comptes i fes-lo contacte de {name}."},
  "Added {name}.": { de: "{name} hinzugefügt.", es: "{name} añadido.", ca: "{name} afegit."},
  "Anyone at this company with portal access will be able to open “{title}”. You can hide it again at any time.": { de: "Jede Person dieses Unternehmens mit Portalzugang kann „{title}“ öffnen. Sie können es jederzeit wieder verbergen.", es: "Cualquier persona de esta empresa con acceso al portal podrá abrir «{title}». Puedes ocultarlo de nuevo cuando quieras.", ca: "Qualsevol persona d'aquesta empresa amb accés al portal podrà obrir «{title}». El pots tornar a amagar quan vulguis."},
  "Anyone here whose role can read it. Their questions can be answered from it too.": { de: "Alle hier, deren Rolle es lesen darf. Auch ihre Fragen können daraus beantwortet werden.", es: "Cualquiera aquí cuyo rol pueda leerlo. Sus preguntas también pueden responderse a partir de ello.", ca: "Qualsevol d'aquí el rol del qual el pugui llegir. Les seves preguntes també es poden respondre a partir d'això."},
  "Choose a part of your system": { de: "Wählen Sie einen Teil Ihres Systems", es: "Elige una parte de tu sistema", ca: "Tria una part del teu sistema"},
  "Choose an app first": { de: "Wählen Sie zuerst eine App", es: "Elige primero una aplicación", ca: "Tria primer una aplicació"},
  "Choose an app first.": { de: "Wählen Sie zuerst eine App.", es: "Elige primero una aplicación.", ca: "Tria primer una aplicació."},
  "Colour": { de: "Farbe", es: "Color", ca: "Color"},
  "Compare with": { de: "Vergleichen mit", es: "Comparar con", ca: "Compara amb"},
  "Connect everything": { de: "Alles verbinden", es: "Conectar todo", ca: "Connecta-ho tot"},
  "Connect your own Google account. kwapso never uses anyone else's, the assistant working for you sees exactly what you can see, and nothing more.": { de: "Verbinden Sie Ihr eigenes Google-Konto. kwapso nutzt nie das von jemand anderem – der Assistent, der für Sie arbeitet, sieht genau das, was Sie sehen können, und nicht mehr.", es: "Conecta tu propia cuenta de Google. kwapso nunca usa la de otra persona: el asistente que trabaja para ti ve exactamente lo que tú puedes ver, y nada más.", ca: "Connecta el teu propi compte de Google. kwapso mai no fa servir el d'una altra persona: l'assistent que treballa per a tu veu exactament el que tu pots veure, i res més."},
  "Couldn't accept the invite.": { de: "Einladung konnte nicht angenommen werden.", es: "No se pudo aceptar la invitación.", ca: "No s'ha pogut acceptar la invitació."},
  "Couldn't activate that rate.": { de: "Dieser Satz konnte nicht aktiviert werden.", es: "No se pudo activar esa tarifa.", ca: "No s'ha pogut activar aquesta tarifa."},
  "Couldn't attach that.": { de: "Das konnte nicht angehängt werden.", es: "No se pudo adjuntar eso.", ca: "No s'ha pogut adjuntar això."},
  "Couldn't deactivate that rate.": { de: "Dieser Satz konnte nicht deaktiviert werden.", es: "No se pudo desactivar esa tarifa.", ca: "No s'ha pogut desactivar aquesta tarifa."},
  "Couldn't load your invites.": { de: "Ihre Einladungen konnten nicht geladen werden.", es: "No se pudieron cargar tus invitaciones.", ca: "No s'han pogut carregar les teves invitacions."},
  "Couldn't load {what}.": { de: "{what} konnte nicht geladen werden.", es: "No se pudo cargar {what}.", ca: "No s'ha pogut carregar {what}."},
  "Couldn't send that reply.": { de: "Diese Antwort konnte nicht gesendet werden.", es: "No se pudo enviar esa respuesta.", ca: "No s'ha pogut enviar aquesta resposta."},
  "Couldn't switch that module off.": { de: "Dieses Modul konnte nicht ausgeschaltet werden.", es: "No se pudo desactivar ese módulo.", ca: "No s'ha pogut desactivar aquest mòdul."},
  "Couldn't take that off.": { de: "Das konnte nicht entfernt werden.", es: "No se pudo quitar eso.", ca: "No s'ha pogut treure això."},
  "Deactivate profile": { de: "Profil deaktivieren", es: "Desactivar perfil", ca: "Desactiva el perfil"},
  "Deactivate the": { de: "Deaktivieren:", es: "Desactivar el", ca: "Desactiva el"},
  "Default": { de: "Standard", es: "Predeterminado", ca: "Predeterminat"},
  "Disconnect your Google account?": { de: "Google-Konto trennen?", es: "¿Desconectar tu cuenta de Google?", ca: "Vols desconnectar el teu compte de Google?"},
  "Does \"{step}\" still happen?": { de: "Findet „{step}“ noch statt?", es: "¿«{step}» sigue ocurriendo?", ca: "«{step}» encara passa?"},
  "Drive, Gmail, Calendar and Chat in one approval. Google keeps one approval per app, so connecting them one at a time switches the others off.": { de: "Drive, Gmail, Kalender und Chat in einer Freigabe. Google speichert pro App nur eine Freigabe – wer sie einzeln verbindet, schaltet die anderen ab.", es: "Drive, Gmail, Calendar y Chat en una sola autorización. Google guarda una autorización por aplicación, así que conectarlos de uno en uno desactiva los demás.", ca: "Drive, Gmail, Calendar i Chat en una sola autorització. Google desa una autorització per aplicació, així que connectar-los d'un en un desactiva els altres."},
  "Edit this module": { de: "Dieses Modul bearbeiten", es: "Editar este módulo", ca: "Edita aquest mòdul"},
  "Einstellungen": { de: "Einstellungen", es: "Einstellungen", ca: "Einstellungen"},
  "Everything in it, including whatever you put there later.": { de: "Alles darin, auch alles, was Sie später hinzufügen.", es: "Todo lo que contiene, incluido lo que añadas más adelante.", ca: "Tot el que conté, inclòs el que hi afegeixis més endavant."},
  "German name": { de: "Deutscher Name", es: "Nombre en alemán", ca: "Nom en alemany"},
  "Impact": { de: "Wirkung", es: "Impacto", ca: "Impacte"},
  "In the knowledge base": { de: "In der Wissensdatenbank", es: "En la base de conocimiento", ca: "A la base de coneixement"},
  "Invites waiting for you": { de: "Einladungen, die auf Sie warten", es: "Invitaciones que te esperan", ca: "Invitacions que t'esperen"},
  "It stops being offered when somebody files a ticket. Every ticket already filed against it keeps it, and nothing is deleted.": { de: "Es wird beim Erstellen eines Tickets nicht mehr angeboten. Jedes bereits dazu erstellte Ticket behält es, und nichts wird gelöscht.", es: "Dejará de ofrecerse al crear un ticket. Todos los tickets ya creados lo conservan y no se borra nada.", ca: "Deixarà d'oferir-se en crear un tiquet. Tots els tiquets ja creats el conserven i no s'esborra res."},
  "Last used {when}": { de: "Zuletzt verwendet {when}", es: "Usado por última vez {when}", ca: "Usat per última vegada {when}"},
  "Main": { de: "Haupt", es: "Principal", ca: "Principal"},
  "Make it a default": { de: "Als Standard festlegen", es: "Hacerlo predeterminado", ca: "Fes-lo predeterminat"},
  "Map": { de: "Karte", es: "Mapa", ca: "Mapa"},
  "Marked as a default.": { de: "Als Standard markiert.", es: "Marcado como predeterminado.", ca: "Marcat com a predeterminat."},
  "Module": { de: "Modul", es: "Módulo", ca: "Mòdul"},
  "Modules": { de: "Module", es: "Módulos", ca: "Mòduls"},
  "Needs {gaps} before it can be triaged": { de: "Benötigt {gaps}, bevor es triagiert werden kann", es: "Necesita {gaps} antes de poder triarse", ca: "Necessita {gaps} abans de poder-se triar"},
  "No accounts match": { de: "Keine Kunden passen", es: "No hay cuentas que coincidan", ca: "Cap compte coincideix"},
  "No invites waiting for you.": { de: "Keine Einladungen, die auf Sie warten.", es: "No tienes invitaciones pendientes.", ca: "No tens invitacions pendents."},
  "No longer a default.": { de: "Nicht mehr Standard.", es: "Ya no es predeterminado.", ca: "Ja no és predeterminat."},
  "No meetings match": { de: "Keine Besprechungen passen", es: "No hay reuniones que coincidan", ca: "Cap reunió coincideix"},
  "No module": { de: "Kein Modul", es: "Sin módulo", ca: "Cap mòdul"},
  "No modules yet. Add the sections this app is divided into, so tickets can say which one they are about.": { de: "Noch keine Module. Fügen Sie die Bereiche hinzu, in die diese App gegliedert ist, damit Tickets den Bereich nennen können.", es: "Aún no hay módulos. Añade las secciones en que se divide esta aplicación para que los tickets puedan indicarlas.", ca: "Encara no hi ha mòduls. Afegeix les seccions en què es divideix aquesta aplicació perquè els tiquets les puguin indicar."},
  "No processes match": { de: "Keine Prozesse passen", es: "No hay procesos que coincidan", ca: "Cap procés coincideix"},
  "No sources match": { de: "Keine Quellen passen", es: "No hay fuentes que coincidan", ca: "Cap font coincideix"},
  "No stories match": { de: "Keine Storys passen", es: "No hay historias que coincidan", ca: "Cap història coincideix"},
  "No tickets match": { de: "Keine Tickets passen", es: "No hay tickets que coincidan", ca: "Cap tiquet coincideix"},
  "No type said": { de: "Kein Typ angegeben", es: "Sin tipo indicado", ca: "Sense tipus indicat"},
  "Nobody from our side is on this yet.": { de: "Von unserer Seite ist noch niemand dabei.", es: "Todavía no hay nadie de nuestro lado.", ca: "Encara no hi ha ningú del nostre costat."},
  "Nobody from the client's side is on this yet.": { de: "Von Kundenseite ist noch niemand dabei.", es: "Todavía no hay nadie del lado del cliente.", ca: "Encara no hi ha ningú del costat del client."},
  "Not in the knowledge base yet": { de: "Noch nicht in der Wissensdatenbank", es: "Aún no está en la base de conocimiento", ca: "Encara no és a la base de coneixement"},
  "Not in this version": { de: "Nicht in dieser Version", es: "No está en esta versión", ca: "No és en aquesta versió"},
  "Nothing attached yet.": { de: "Noch nichts angehängt.", es: "Aún no hay nada adjunto.", ca: "Encara no hi ha res adjunt."},
  "Nothing shared yet — {scope}": { de: "Noch nichts freigegeben – {scope}", es: "Aún no se ha compartido nada — {scope}", ca: "Encara no s'ha compartit res — {scope}"},
  "Nothing — just show this one": { de: "Nichts – nur diese anzeigen", es: "Nada, solo mostrar esta", ca: "Res, mostra només aquesta"},
  "Only the ones you pick. Nothing else in the folder they sit in.": { de: "Nur die von Ihnen ausgewählten. Nichts anderes aus dem Ordner, in dem sie liegen.", es: "Solo los que elijas. Nada más de la carpeta en la que están.", ca: "Només els que triïs. Res més de la carpeta on són."},
  "Only you, and the assistant when it is answering you.": { de: "Nur Sie – und der Assistent, wenn er Ihnen antwortet.", es: "Solo tú, y el asistente cuando te responde.", ca: "Només tu, i l'assistent quan et respon."},
  "Optional. Leave it off for our own housekeeping.": { de: "Optional. Für unsere eigene Verwaltung leer lassen.", es: "Opcional. Déjalo en blanco para nuestras tareas internas.", ca: "Opcional. Deixa-ho en blanc per a les nostres tasques internes."},
  "Or paste a link": { de: "Oder Link einfügen", es: "O pega un enlace", ca: "O enganxa un enllaç"},
  "Profile activated.": { de: "Profil aktiviert.", es: "Perfil activado.", ca: "Perfil activat."},
  "Profile deactivated.": { de: "Profil deaktiviert.", es: "Perfil desactivado.", ca: "Perfil desactivat."},
  "Rate activated.": { de: "Satz aktiviert.", es: "Tarifa activada.", ca: "Tarifa activada."},
  "Rate deactivated.": { de: "Satz deaktiviert.", es: "Tarifa desactivada.", ca: "Tarifa desactivada."},
  "Reading this month…": { de: "Diesen Monat wird gelesen…", es: "Leyendo este mes…", ca: "Llegint aquest mes…"},
  "Reading what's attached…": { de: "Anhänge werden gelesen…", es: "Leyendo lo adjunto…", ca: "Llegint el que hi ha adjunt…"},
  "Renaming it updates every ticket filed against it.": { de: "Eine Umbenennung wirkt sich auf jedes dazu erstellte Ticket aus.", es: "Al renombrarlo se actualizan todos los tickets creados sobre él.", ca: "En canviar-li el nom s'actualitzen tots els tiquets creats sobre ell."},
  "Reply sent.": { de: "Antwort gesendet.", es: "Respuesta enviada.", ca: "Resposta enviada."},
  "Search modules…": { de: "Module suchen…", es: "Buscar módulos…", ca: "Cerca mòduls…"},
  "Search people…": { de: "Personen suchen…", es: "Buscar personas…", ca: "Cerca persones…"},
  "Somebody": { de: "Jemand", es: "Alguien", ca: "Algú"},
  "Something broke in {label}.": { de: "In {label} ist etwas schiefgegangen.", es: "Algo ha fallado en {label}.", ca: "Alguna cosa ha fallat a {label}."},
  "Something broke.": { de: "Etwas ist schiefgegangen.", es: "Algo ha fallado.", ca: "Alguna cosa ha fallat."},
  "Stop treating as a default": { de: "Nicht mehr als Standard behandeln", es: "Dejar de tratarlo como predeterminado", ca: "Deixa de tractar-lo com a predeterminat"},
  "Switch it off": { de: "Ausschalten", es: "Desactivarlo", ca: "Desactiva'l"},
  "Switch off": { de: "Ausschalten", es: "Desactivar", ca: "Desactivar"},
  "Switch off this module?": { de: "Dieses Modul ausschalten?", es: "¿Desactivar este módulo?", ca: "Vols desactivar aquest mòdul?"},
  "Tailored digital operating systems for mature businesses.": { de: "Maßgeschneiderte digitale Betriebssysteme für etablierte Unternehmen.", es: "Sistemas operativos digitales a medida para empresas consolidadas.", ca: "Sistemes operatius digitals a mida per a empreses consolidades."},
  "Task updated.": { de: "Aufgabe aktualisiert.", es: "Tarea actualizada.", ca: "Tasca actualitzada."},
  "The assistant can now use \"{title}\".": { de: "Der Assistent kann „{title}“ jetzt verwenden.", es: "El asistente ya puede usar «{title}».", ca: "L'assistent ja pot fer servir «{title}»."},
  "Theirs": { de: "Ihre", es: "Suyo", ca: "Seu"},
  "This app has no modules yet.": { de: "Diese App hat noch keine Module.", es: "Esta aplicación aún no tiene módulos.", ca: "Aquesta aplicació encara no té mòduls."},
  "This can take a few minutes.": { de: "Das kann ein paar Minuten dauern.", es: "Esto puede tardar unos minutos.", ca: "Això pot trigar uns minuts."},
  "This looks through what the assistant can read and shows you the passages and their sources. It doesn't use any of the team's assistant credits.": { de: "Dies durchsucht, was der Assistent lesen kann, und zeigt Ihnen die Passagen und ihre Quellen. Es verbraucht keine Assistenz-Credits des Teams.", es: "Esto busca en lo que el asistente puede leer y te muestra los pasajes y sus fuentes. No consume créditos de asistente del equipo.", ca: "Això cerca dins del que l'assistent pot llegir i et mostra els passatges i les seves fonts. No consumeix crèdits d'assistent de l'equip."},
  "This reads what the assistant can read and writes you the answer, with the passages and their sources underneath. Looking is free; writing the answer uses one of the team's assistant credits.": { de: "Dies liest, was der Assistent lesen kann, und schreibt Ihnen die Antwort, mit den Passagen und ihren Quellen darunter. Das Suchen ist kostenlos; das Schreiben der Antwort verbraucht ein Assistenz-Credit des Teams.", es: "Esto lee lo que el asistente puede leer y te redacta la respuesta, con los pasajes y sus fuentes debajo. Buscar es gratis; redactar la respuesta consume un crédito de asistente del equipo.", ca: "Això llegeix el que l'assistent pot llegir i t'escriu la resposta, amb els passatges i les seves fonts a sota. Cercar és gratuït; escriure la resposta consumeix un crèdit d'assistent de l'equip."},
  "Time saved, and one place to look.": { de: "Gesparte Zeit und ein einziger Ort zum Nachsehen.", es: "Tiempo ahorrado y un único sitio donde mirar.", ca: "Temps estalviat i un únic lloc on mirar."},
  "What is it about?": { de: "Worum geht es?", es: "¿De qué se trata?", ca: "De què tracta?"},
  "What it does": { de: "Was es tut", es: "Qué hace", ca: "Què fa"},
  "What it gives them": { de: "Was es ihnen bringt", es: "Qué les aporta", ca: "Què els aporta"},
  "Where the team manages their own preferences.": { de: "Wo das Team seine eigenen Einstellungen verwaltet.", es: "Donde el equipo gestiona sus propias preferencias.", ca: "On l'equip gestiona les seves preferències."},
  "You're not on this app": { de: "Sie sind nicht auf dieser App", es: "No estás en esta aplicación", ca: "No ets en aquesta aplicació"},
  "Your invite has been accepted, so nothing is waiting on you. Open the portal at the address your invite came from, and sign in with this same email address.": { de: "Ihre Einladung wurde angenommen, es wartet also nichts auf Sie. Öffnen Sie das Portal unter der Adresse, von der Ihre Einladung kam, und melden Sie sich mit derselben E-Mail-Adresse an.", es: "Tu invitación ya está aceptada, así que no hay nada pendiente. Abre el portal en la dirección desde la que llegó tu invitación e inicia sesión con este mismo correo.", ca: "La teva invitació ja està acceptada, així que no hi ha res pendent. Obre el portal a l'adreça des d'on va arribar la invitació i inicia sessió amb aquest mateix correu."},
  "Your reply": { de: "Ihre Antwort", es: "Tu respuesta", ca: "La teva resposta"},
  "Yours unless you say otherwise, an unassigned task is a task nobody picks up.": { de: "Ihre, sofern Sie nichts anderes sagen – eine nicht zugewiesene Aufgabe nimmt niemand auf.", es: "Tuya salvo que digas lo contrario: una tarea sin asignar es una tarea que nadie recoge.", ca: "Teva llevat que diguis el contrari: una tasca sense assignar és una tasca que ningú no agafa."},
  "a client": { de: "ein Kunde", es: "un cliente", ca: "un client"},
  "a ticket type": { de: "ein Tickettyp", es: "un tipo de ticket", ca: "un tipus de tiquet"},
  "an app": { de: "eine App", es: "una aplicación", ca: "una aplicació"},
  "e.g. We shipped this on Tuesday — try it and tell us if it is still wrong.": { de: "z. B. Wir haben das am Dienstag ausgeliefert – probieren Sie es aus und sagen Sie uns, ob es noch falsch ist.", es: "p. ej. Lo publicamos el martes; pruébalo y dinos si sigue estando mal.", ca: "p. ex. Ho vam publicar dimarts; prova-ho i digues-nos si continua malament."},
  "expired {date}": { de: "abgelaufen am {date}", es: "caducado el {date}", ca: "caducat el {date}"},
  "last used {when}": { de: "zuletzt verwendet {when}", es: "usado por última vez {when}", ca: "usat per última vegada {when}"},
  "never used": { de: "nie verwendet", es: "nunca usado", ca: "mai usat"},
  "open ticket": { de: "offenes Ticket", es: "ticket abierto", ca: "tiquet obert"},
  "open tickets": { de: "offene Tickets", es: "tickets abiertos", ca: "tiquets oberts"},
  "who raised it": { de: "wer es gemeldet hat", es: "quién lo planteó", ca: "qui ho va plantejar"},
  "works until {date}": { de: "gültig bis {date}", es: "válido hasta el {date}", ca: "vàlid fins al {date}"},
  "{count} accounts match": { de: "{count} Kunden passen", es: "{count} cuentas coinciden", ca: "{count} comptes coincideixen"},
  "{count} meetings match": { de: "{count} Besprechungen passen", es: "{count} reuniones coinciden", ca: "{count} reunions coincideixen"},
  "{count} processes match": { de: "{count} Prozesse passen", es: "{count} procesos coinciden", ca: "{count} processos coincideixen"},
  "{count} sources match": { de: "{count} Quellen passen", es: "{count} fuentes coinciden", ca: "{count} fonts coincideixen"},
  "{count} stories match": { de: "{count} Storys passen", es: "{count} historias coinciden", ca: "{count} històries coincideixen"},
  "{count} tickets match": { de: "{count} Tickets passen", es: "{count} tickets coinciden", ca: "{count} tiquets coincideixen"},
  "{count} waiting to be read": { de: "{count} warten auf Bearbeitung", es: "{count} esperando ser leídos", ca: "{count} esperant ser llegits"},
  "{count} waiting to be read, the oldest {days} days": { de: "{count} warten auf Bearbeitung, das älteste seit {days} Tagen", es: "{count} esperando ser leídos, el más antiguo desde hace {days} días", ca: "{count} esperant ser llegits, el més antic fa {days} dies"},
  "{created} added · {skipped} skipped · {failed} failed": { de: "{created} hinzugefügt · {skipped} übersprungen · {failed} fehlgeschlagen", es: "{created} añadidos · {skipped} omitidos · {failed} fallidos", ca: "{created} afegits · {skipped} omesos · {failed} fallits"},
  "{name} is on triage this week": { de: "{name} macht diese Woche die Triage", es: "{name} está de triaje esta semana", ca: "{name} fa el triatge aquesta setmana"},
  "{title} · current": { de: "{title} · aktuell", es: "{title} · actual", ca: "{title} · actual"},
  /* ── The screen engine + notes editor, moved app-side by the design-kit swap
     (2026-08-24). These sentences lived in the old library, exempt from the
     walk; moving the code moved the words into R28's territory, and these are
     their translations — hand-written here so no generator run (and no API
     spend) stands between the swap and a German reader. Register per the note
     above: plain, short, sentence case. */
  "Bold": { de: "Fett", es: "Negrita", ca: "Negreta" },
  "Italic": { de: "Kursiv", es: "Cursiva", ca: "Cursiva" },
  "Highlight": { de: "Hervorheben", es: "Resaltar", ca: "Ressaltar" },
  "Bullet list": { de: "Aufzählung", es: "Lista con viñetas", ca: "Llista amb pics" },
  "Numbered list": { de: "Nummerierte Liste", es: "Lista numerada", ca: "Llista numerada" },
  "Separator": { de: "Trennlinie", es: "Separador", ca: "Separador" },
  "Showing {shown} of {total}": { de: "{shown} von {total} angezeigt", es: "Mostrando {shown} de {total}", ca: "Es mostren {shown} de {total}" },
  "Page {page} of {pages}": { de: "Seite {page} von {pages}", es: "Página {page} de {pages}", ca: "Pàgina {page} de {pages}" },
  "Prev": { de: "Zurück", es: "Anterior", ca: "Anterior" },
  "Next": { de: "Weiter", es: "Siguiente", ca: "Següent" },
  "Filters and sort": { de: "Filter und Sortierung", es: "Filtros y orden", ca: "Filtres i ordre" },
  "Sort": { de: "Sortieren", es: "Ordenar", ca: "Ordenar" },
  "Filters": { de: "Filter", es: "Filtros", ca: "Filtres" },
  "Clear all": { de: "Alle zurücksetzen", es: "Borrar todo", ca: "Esborrar-ho tot" },
  "Min": { de: "Min.", es: "Mín.", ca: "Mín." },
  "Max": { de: "Max.", es: "Máx.", ca: "Màx." },
  "No matches.": { de: "Keine Treffer.", es: "Sin coincidencias.", ca: "Sense coincidències." },
  "Search {what}…": { de: "{what} durchsuchen…", es: "Buscar {what}…", ca: "Cercar {what}…" },
  "Actions": { de: "Aktionen", es: "Acciones", ca: "Accions" },
  "Are you sure?": { de: "Sind Sie sicher?", es: "¿Está seguro?", ca: "N'esteu segur?" },
  "AI drafted": { de: "KI-Entwurf", es: "Borrador de IA", ca: "Esborrany d'IA" },
  "General": { de: "Allgemein", es: "General", ca: "General" },
  "Attach a file to import": { de: "Datei zum Import anhängen", es: "Adjuntar un archivo para importar", ca: "Adjuntar un fitxer per importar" },
  "Remove attachment": { de: "Anhang entfernen", es: "Quitar el adjunto", ca: "Treure l'adjunt" },
}
