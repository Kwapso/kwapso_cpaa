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
// THE SEED ALWAYS WINS. The generator merges these over the machine's output,
// per language, so a regeneration can never quietly replace `Problem` with
// `Ausgabe`. It also never SPENDS on them: a string with a seed entry for a
// language is already done, so it is not sent to the model.
//
// HOW TO CORRECT A TRANSLATION. Here — never in the generated file. Put the
// English exactly as it appears on screen, including its full stop, then the
// languages you are sure of, then re-run the generator. Anything you leave out
// is filled in by the machine; anything you write is kept.

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
}
