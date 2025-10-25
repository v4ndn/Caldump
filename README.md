# Caldump - keep your events in obsidian

This plugin is designed to keep your events from any calendar that supports ical format in your vault.


<div align="center"><picture>
  <img alt="Plugin demo" src="https://github.com/v4ndn/Caldump/raw/HEAD/demo.gif">
</picture><div>Plugin demo. See formatting config below</div></div>

### How to use

Firstly you need to specify url of your calendar in plugin settings, if needed specify name of calendar
Then configure your output format. Each task will be dumped by it
For dump execute one of two commands, tasks for today or with date specification. Name of command will contain name of calendar if specified or calendar index if not.

### Key features:

- Dump events from .ics file
- Multiple urls support
- Specify date if needed
- Format output with various info about task

### Formatting

Currently you can access this event info in output

- `summary` - Event name
- `startMinute` - Minute event starts
- `startHour` - Hour event starts
- `startSecond` - Second event starts
- `endMinute` - Minute event ends
- `endHour` - Hour event ends
- `endSecond` - Second event ends
- `duration` - Event duration in minutes
- `status` - ical status of event
- `description` - Description of event
- `isRecurring` - Explains itself

---

#### Formatting from demo
`- [ ] <span style="background-color: #2D2D2D; padding: 4px 8px; font-weight: 700; border-radius: 100px; font-family: monospace;">${duration}m</span> <span style="background-color: #1E1E1E; padding: 4px 8px; font-weight: 500; border-radius: 100px;">${startHour}:${startMinute} - ${endHour}:${endMinute}</span> 
	${summary}
`
