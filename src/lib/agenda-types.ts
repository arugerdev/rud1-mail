/** Tipos de la agenda de admin.rud1.es (los comparten servidor y página). */

export const EVENT_TYPES = ["CALL", "MEETING", "VISIT", "DEMO", "TASK", "FOLLOW_UP", "REMINDER", "DEADLINE", "TRAVEL", "OTHER"] as const;
export type EventType = (typeof EVENT_TYPES)[number];
export type EventStatus = "TENTATIVE" | "CONFIRMED" | "DONE" | "CANCELED";
export type Recurrence = "NONE" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export interface AgendaPerson {
  id: string;
  name: string;
  color: string | null;
}

export interface AgendaOccurrence {
  key: string;
  eventId: string;
  occurrenceDay: string;
  type: EventType;
  status: EventStatus;
  title: string;
  location: string | null;
  meetingUrl: string | null;
  allDay: boolean;
  start: string;
  end: string;
  dayKey: string;
  endDayKey: string;
  recurring: boolean;
  organizer: AgendaPerson | null;
  people: AgendaPerson[];
  externalCount: number;
  canEdit: boolean;
  canComplete: boolean;
  color: string | null;
  outcome: string | null;
}

export interface AgendaEventDetail {
  id: string;
  type: EventType;
  status: EventStatus;
  title: string;
  description: string | null;
  location: string | null;
  meetingUrl: string | null;
  allDay: boolean;
  startsAt: string;
  endsAt: string;
  timezone: string;
  recurrence: Recurrence;
  recurInterval: number;
  recurUntil: string | null;
  organizer: AgendaPerson | null;
  attendees: { id: string; adminUserId: string | null; email: string | null; name: string | null; color: string | null; response: string }[];
  reminders: { id: string; minutesBefore: number; channel: "IN_APP" | "EMAIL"; adminUserId: string | null }[];
  completedAt: string | null;
  completedByName: string | null;
  outcome: string | null;
  sequence: number;
  canEdit: boolean;
  canComplete: boolean;
  occurrence: { day: string; start: string; end: string } | null;
}

export interface AgendaMe {
  id: string;
  name: string | null;
  email: string;
  color: string | null;
  timezone: string;
  canSeeTeam: boolean;
  canManageTeam: boolean;
}

export interface AgendaPersonOption {
  id: string;
  name: string;
  email: string;
  color: string | null;
  jobTitle: string | null;
}
