import ICAL from "ical.js";
import moment from "moment";
import { argv } from "node:process";
import { requestUrl } from "obsidian";

export interface Task {
  summary: string;
  dueDate: Date | null;
  startDate: Date | null;
  endDate: Date | null;
  status: string;
  description?: string;
  isRecurring: boolean;
  type: "VTODO" | "VEVENT";
  uid?: string;
  recurrenceId?: string;
  isException?: boolean;
}

async function fetchICalFromUrl(url: string): Promise<string> {
  return (await requestUrl({ url: url })).text;
}

function isSameDay(date: Date, targetDate: Date): boolean {
  return (
    date.getDate() === targetDate.getDate() &&
    date.getMonth() === targetDate.getMonth() &&
    date.getFullYear() === targetDate.getFullYear()
  );
}

function parseDate(dateStr: string): Date {
  // Support formats: DD.MM.YYYY, YYYY-MM-DD, MM/DD/YYYY
  const parts = dateStr.split(/[.\-\/]/);

  if (parts.length !== 3) {
    throw new Error(
      "Invalid date format. Use DD.MM.YYYY, YYYY-MM-DD, or MM/DD/YYYY"
    );
  }

  let day: number, month: number, year: number;

  // Detect format by checking which part is likely the year
  if (parts[0].length === 4) {
    // YYYY-MM-DD format
    year = parseInt(parts[0]);
    month = parseInt(parts[1]) - 1; // Month is 0-indexed
    day = parseInt(parts[2]);
  } else if (parts[2].length === 4) {
    // DD.MM.YYYY or MM/DD/YYYY format
    // Assume DD.MM.YYYY if using dots, MM/DD/YYYY if using slashes
    if (dateStr.includes(".")) {
      day = parseInt(parts[0]);
      month = parseInt(parts[1]) - 1;
    } else {
      month = parseInt(parts[0]) - 1;
      day = parseInt(parts[1]);
    }
    year = parseInt(parts[2]);
  } else {
    throw new Error("Invalid date format. Year must be 4 digits");
  }

  const date = new Date(year, month, day);

  if (isNaN(date.getTime())) {
    throw new Error("Invalid date values");
  }

  return date;
}

function parseTasksForToday(icalData: string, targetDate: Date): Task[] {
  const jcalData = ICAL.parse(icalData);
  const comp = new ICAL.Component(jcalData);

  // Check for both VTODO and VEVENT components
  const vtodos = comp.getAllSubcomponents("vtodo");
  const vevents = comp.getAllSubcomponents("vevent");

  const tasksForToday: Task[] = [];
  const dayStart = new Date(targetDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  // Track recurring events and their exceptions
  const recurringEvents = new Map<string, ICAL.Component>();
  const exceptionEvents = new Map<string, ICAL.Component>();

  // First pass: separate recurring events and exceptions
  for (let i = 0; i < vevents.length; i++) {
    const vevent = vevents[i];
    const event = new ICAL.Event(vevent);
    const uid = event.uid;
    
    if (!uid) continue;

    const recurrenceId = vevent.getFirstPropertyValue("recurrence-id");
    
    if (recurrenceId) {
      // This is an exception (rearranged occurrence)
      exceptionEvents.set(uid + "_" + recurrenceId.toString(), vevent);
    } else if (vevent.getFirstPropertyValue("rrule")) {
      // This is a recurring event
      recurringEvents.set(uid, vevent);
    }
  }

  // Process VTODOs
  for (let i = 0; i < vtodos.length; i++) {
    const vtodo = vtodos[i];
    processComponent(vtodo, "VTODO", tasksForToday, targetDate, dayEnd, recurringEvents, exceptionEvents);
  }

  // Process VEVENTs
  for (let i = 0; i < vevents.length; i++) {
    const vevent = vevents[i];
    processComponent(vevent, "VEVENT", tasksForToday, targetDate, dayEnd, recurringEvents, exceptionEvents);
  }

  return tasksForToday;
}

function processComponent(
  component: ICAL.Component,
  type: "VTODO" | "VEVENT",
  tasksForToday: Task[],
  targetDate: Date,
  dayEnd: Date,
  recurringEvents: Map<string, ICAL.Component>,
  exceptionEvents: Map<string, ICAL.Component>
): void {
  const event = new ICAL.Event(component);

  const summary = event.summary || "Untitled Task";
  const statusValue = component.getFirstPropertyValue("status");
  const status = typeof statusValue === "string" ? statusValue : "NEEDS-ACTION";
  const description = event.description || "";
  const uid = event.uid;

  // Check for due date (DUE property - for VTODO)
  const due = component.getFirstPropertyValue("due");
  let dueDate: Date | null = null;

  if (due && due instanceof ICAL.Time) {
    dueDate = due.toJSDate();
  }

  // Check DTSTART (start date - common for both)
  const dtstart = component.getFirstPropertyValue("dtstart");
  let startDate: Date | null = null;

  if (dtstart && dtstart instanceof ICAL.Time) {
    startDate = dtstart.toJSDate();
  }

  // Check DTEND (end date - for VEVENT)
  const dtend = component.getFirstPropertyValue("dtend");
  let endDate: Date | null = null;

  if (dtend && dtend instanceof ICAL.Time) {
    endDate = dtend.toJSDate();
  }

  // Check if this is an exception (rearranged occurrence)
  const recurrenceIdProp = component.getFirstPropertyValue("recurrence-id");
  let recurrenceId: string | null = null;
  let isException = false;

  if (recurrenceIdProp && recurrenceIdProp instanceof ICAL.Time) {
    recurrenceId = recurrenceIdProp.toString();
    isException = true;
  }

  // Check if task/event is recurring
  const rrule = component.getFirstPropertyValue("rrule");
  const isRecurring = !!rrule;

  // For exceptions, check if they occur on the target date
  if (isException && recurrenceId && uid) {
    const exceptionKey = uid + "_" + recurrenceId;
    const exceptionDate = recurrenceIdProp.toJSDate();
    
    if (isSameDay(exceptionDate, targetDate)) {
      // This rearranged occurrence is for today - add it
      tasksForToday.push({
        summary,
        dueDate,
        startDate,
        endDate,
        status,
        description,
        isRecurring: true, // It's still technically recurring, just modified
        type,
        uid,
        recurrenceId,
        isException: true
      });
    }
    return; // Don't process exceptions as regular events
  }

  // Handle recurring items (only if not an exception)
  if (isRecurring && rrule && !isException) {
    const baseTime =
      dtstart instanceof ICAL.Time
        ? dtstart
        : due instanceof ICAL.Time
        ? due
        : null;

    if (baseTime) {
      const expand = new ICAL.RecurExpansion({
        component: component,
        dtstart: baseTime,
      });

      let count = 0;
      let next;
      let foundToday = false;

      while ((next = expand.next()) && count < 100 && !foundToday) {
        count++;
        const occurrenceDate = next.toJSDate();

        if (occurrenceDate >= dayEnd) {
          break;
        }

        // Check if there's an exception for this occurrence
        const occurrenceKey = uid + "_" + next.toString();
        const hasException = exceptionEvents.has(occurrenceKey);

        if (isSameDay(occurrenceDate, targetDate) && !hasException) {
          // Only add if no exception exists for this date
          tasksForToday.push({
            summary,
            dueDate: occurrenceDate,
            startDate,
            endDate,
            status,
            description,
            isRecurring: true,
            type,
            uid
          });
          foundToday = true;
        }
      }
    }
  } else if (!isException) {
    // Non-recurring item (and not an exception) - check if it's the target date
    const relevantDate = dueDate || startDate || endDate;

    if (relevantDate && isSameDay(relevantDate, targetDate)) {
      tasksForToday.push({
        summary,
        dueDate: relevantDate,
        startDate,
        endDate,
        status,
        description,
        isRecurring: false,
        type,
        uid
      });
    } else if (!relevantDate && type === "VTODO") {
      // VTODOs without dates might still be active tasks
      tasksForToday.push({
        summary,
        dueDate: null,
        startDate,
        endDate,
        status,
        description,
        isRecurring: false,
        type,
        uid
      });
    }
  }
}

function sortTasksByStartTime(tasks: Task[]): Task[] {
  return tasks.sort((a, b) => {
    // Handle tasks with no start date - put them at the end
    if (!a.startDate && !b.startDate) {
      return 0; // Both have no start date, keep original order
    }
    if (!a.startDate) {
      return 1; // a has no start date, put it after b
    }
    if (!b.startDate) {
      return -1; // b has no start date, put a before b
    }
    
    // Both have start dates, compare them
    return a.startDate.getTime() - b.startDate.getTime();
  });
}

export default async function getTasks(
  icalUrl: string,
  dateStr: string | null
): Promise<Task[]> {
  const targetDate = dateStr ? parseDate(dateStr) : new Date();
  targetDate.setHours(0, 0, 0, 0);
  const icalData = await fetchICalFromUrl(icalUrl);
  const tasks = parseTasksForToday(icalData, targetDate);
  const sortedTasks = sortTasksByStartTime(tasks);
  console.log(sortedTasks);
  return sortedTasks;
}
