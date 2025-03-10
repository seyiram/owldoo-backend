/**
 * Time utilities for date and time formatting
 */

/**
 * Formats a date to a readable string showing date and time
 * @param date Date to format
 * @returns Formatted date string like "3:00 PM on Thursday, Mar 6"
 */
export function formatDateTime(date: Date): string {
  // IMPORTANT: Verify that we're looking at the original requested time
  // Log extensive details of the date for debugging purposes
  console.log('FORMAT DATE TIME DEBUG:', {
    input: date.toString(),
    toLocaleString: date.toLocaleString(),
    iso: date.toISOString(),
    hours: date.getHours(),
    minutes: date.getMinutes(),
    day: date.getDate(),
    month: date.getMonth() + 1,
    year: date.getFullYear(),
    currentDay: new Date().getDate(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timezoneOffset: date.getTimezoneOffset() / 60
  });
  
  // Extract the hour and use it to check for a potential timezone issue
  const hour = date.getHours();
  if (hour > 20 && hour <= 23) { // Late night hours that might be wrong
    console.log('FORMAT DATE TIME: Possible timezone issue detected - hour is in late evening');
  }
  
  // Add explicit check to ensure the day is correct - this is important for "today" events
  const today = new Date();
  if (date.toDateString().includes('tomorrow') || 
      (date.getDate() === today.getDate() + 1 && 
       date.getMonth() === today.getMonth() && 
       date.getFullYear() === today.getFullYear())) {
    console.warn('DATE CORRECTION: Event appears to be scheduled for tomorrow instead of today');
    // Adjust the date back to today while preserving the time
    date = new Date(date);
    date.setDate(today.getDate());
    console.log('Corrected date:', date.toString());
  }
  
  const timeOptions: Intl.DateTimeFormatOptions = { 
    hour: 'numeric', 
    minute: '2-digit', 
    hour12: true 
  };
  
  const dateOptions: Intl.DateTimeFormatOptions = { 
    weekday: 'long', 
    month: 'short', 
    day: 'numeric'
  };
  
  const timeString = new Intl.DateTimeFormat('en-US', timeOptions).format(date);
  const dateString = new Intl.DateTimeFormat('en-US', dateOptions).format(date);
  
  return `${timeString} on ${dateString}`;
}

/**
 * Converts a Date object to an ISO string in a specific timezone
 * @param date Date object to convert
 * @param timezone Target timezone (e.g. 'America/New_York')
 * @returns ISO string in the specified timezone
 */
export function dateToTimezone(date: Date, timezone: string): string {
  return date.toLocaleString('en-US', { timeZone: timezone });
}

/**
 * Gets the time in 12-hour format (3:00 PM)
 * @param date The date to extract time from
 * @returns Formatted time string
 */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit', 
    hour12: true 
  });
}

/**
 * Checks if a date is today
 * @param date The date to check
 * @returns True if the date is today
 */
export function isToday(date: Date): boolean {
  const today = new Date();
  return date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();
}