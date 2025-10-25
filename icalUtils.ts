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

  // Process VTODOs
  for (let i = 0; i < vtodos.length; i++) {
    const vtodo = vtodos[i];
    processComponent(vtodo, "VTODO", tasksForToday, targetDate, dayEnd);
  }

  // Process VEVENTs (some calendar apps store tasks as events)
  for (let i = 0; i < vevents.length; i++) {
    const vevent = vevents[i];
    processComponent(vevent, "VEVENT", tasksForToday, targetDate, dayEnd);
  }

  return tasksForToday;
}

function processComponent(
  component: ICAL.Component,
  type: "VTODO" | "VEVENT",
  tasksForToday: Task[],
  targetDate: Date,
  dayEnd: Date
): void {
  const event = new ICAL.Event(component);

  const summary = event.summary || "Untitled Task";
  const statusValue = component.getFirstPropertyValue("status");
  const status = typeof statusValue === "string" ? statusValue : "NEEDS-ACTION";
  const description = event.description || "";

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

  // Check if task/event is recurring
  const rrule = component.getFirstPropertyValue("rrule");
  const isRecurring = !!rrule;

  // Handle recurring items
  if (isRecurring && rrule) {
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

        if (isSameDay(occurrenceDate, targetDate)) {
          tasksForToday.push({
            summary,
            dueDate: occurrenceDate,
            startDate,
            endDate,
            status,
            description,
            isRecurring: true,
            type,
          });
          foundToday = true;
        }
      }
    }
  } else {
    // Non-recurring item - check if it's the target date
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
      });
    }
  }
}

export default async function getTasks(
  icalUrl: string,
  dateStr: string | null
): Promise<Task[]> {
  const targetDate = dateStr ? parseDate(dateStr) : new Date();
  targetDate.setHours(0, 0, 0, 0);
  const icalData = await fetchICalFromUrl(icalUrl);
  const tasks = parseTasksForToday(icalData, targetDate);
  tasks.sort((a, b) => {
    if (a.dueDate && b.dueDate) {
      return moment(a.dueDate).diff(moment(b.dueDate));
    } else {
      return 1;
    }
  });
  console.log(tasks);
  return tasks;
}
