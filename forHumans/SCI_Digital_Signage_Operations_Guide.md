# SCI Digital Signage System — Operations Guide
**Science Center of Iowa · Programs & Outreach · Internal Use Only**

---

## 1. System Overview

The SCI Digital Signage System is a custom-built application running on a dedicated Raspberry Pi server on the SCI local network. It drives multiple display screens throughout the building, pulling schedule data from a CSV export and from the public sciowa.org event calendar.

| Component | Description |
|---|---|
| **Raspberry Pi Server** | Hosts the signage app on the local network at `192.168.39.73`. |
| **Admin Portal** | Web interface for managing schedules and display content. Opens at `http://192.168.39.73:3000/admin`. |
| **Yodeck** | Manages the kiosk browsers on each physical screen — handles what URL each screen loads and keeps the browser in full-screen. |
| **Display Screens** | Five display endpoints: Group Schedules, Star Theater (public), Star Theater (groups), SCI Live Theater, and Public Signage. |
| **Schedule CSV** | A flat file exported from the booking system containing today's group itineraries — the primary data source for group-facing screens. |
| **GitHub Repository** | Central source of truth for all application code. Updates are pushed here and pulled to the Pi. |

> **Note:** The server must be running before any displays will show content. If screens appear blank or frozen, always verify server status first.

---

## 2. Starting the System

On any day you need signage running, start the server from the Windows machine using the provided batch file.

**Step 1 — Run `Start_Signage.bat`**
Double-click the file in `C:\Users\dan.kreipke\Downloads\signageTool\forHumans\`. A terminal window opens and stays open while the server runs — **do not close it.**

**Step 2 — Admin portal opens automatically**
Your browser navigates to `http://localhost:3000/admin`. If it doesn't open, go there manually.

**Step 3 — Verify displays are live**
Check that the screens are showing current content. If any appear blank, see Section 6 (Troubleshooting).

> The terminal window launched by `Start_Signage.bat` is the server process. Closing it shuts down all displays. Minimize it — do not close it.

---

## 3. Admin Portal Reference

The Admin Portal is the central control point for all signage. It has two main tabs: **Group Schedules** and **Public Signage**.

![Admin portal — upload screen](screenshots/admin-upload.png)
*The admin portal on first load. The Group Schedules tab is active by default.*

---

### 3.1 Group Schedules Tab

This tab manages everything shown on the group-facing display screens. It has three states: **Upload**, **Manage**, and **Published**.

![Admin portal — manage/group view](screenshots/admin-manage.png)
*The Manage view shows the currently published schedule. Rows can be edited inline.*

#### Uploading the Daily Schedule (CSV)

The schedule on group-facing screens is driven by a CSV exported from the booking system. Upload a fresh CSV each day — or any time the schedule changes.

**Required CSV columns:**

| Column Header | Description |
|---|---|
| `Itineraries\Items\Start time` | Program start time (e.g., `9:00 AM`) |
| `Itineraries\Items\Name` | Program or activity name (e.g., `Iowa Skies Tonight`) |
| `Name` | Group name and contact (e.g., `Jefferson Elementary - Smith`) |
| `Itineraries\Items\Program\Locations\Name` | Location: `Star Theater Planetarium`, `SCI Live Theater`, `Innovation Hallway`, or `Full Facility` |
| `QUERYRECID` | Unique booking ID — used internally |

**Upload steps:**
1. Export the daily itinerary CSV from the booking system.
2. Open the Admin Portal and confirm you're on the **Group Schedules** tab.
3. Drag and drop the CSV onto the upload zone, or click to browse.
4. Review the preview table — you can edit cells or remove rows before publishing.
5. Click **Publish**. All group-facing displays update within seconds.

> If the upload fails, confirm the CSV column headers match the names above exactly, including the backslash separators. Extra columns in the file are ignored.

#### Managing the Schedule Directly

Click **Manage Current Schedule** to open the inline editor without uploading a new CSV. From here you can:
- Edit any cell (start time, program, group name, location) directly in the table
- Add a blank row with **+ Add Row**
- Remove individual rows with the × button
- Save changes with **Save**
- Wipe the entire schedule with **Wipe Schedule** (use with caution — all displays go blank until a new CSV is uploaded)

#### Autocomplete Dropdown Lists

The program name, group name, and location fields all support autocomplete. The lists are maintained automatically from uploaded CSVs, and can be edited manually under **Manage Dropdown Lists** at the bottom of the tab.

---

### 3.2 Public Signage Tab

This tab manages what appears on the building-wide public-facing display. It has three event sources that work together:

- **Website events** — automatically scraped from sciowa.org every 60 seconds
- **Manual events** — one-off events you add by hand (walk-ins, last-minute additions)
- **Special events** — featured event cards with images, used to promote upcoming attractions (BioBlitz, star parties, etc.)

![Admin portal — public signage tab](screenshots/admin-public-signage.png)
*The Public Signage tab. Today's scraped events are listed at the top; manual and special events are managed below.*

#### Today's Events (Scraped from sciowa.org)

The system fetches today's events from the SCI public calendar automatically. These appear in the **Today's Events** table. For each scraped event you can:
- **Show/hide** it on the public display using the checkbox in the leftmost column (deselect to remove from displays; select to keep on displays)
- See when the last successful scrape occurred in the status line

Click **Refresh from website** to force an immediate re-scrape if you've just updated the website.

#### Manual Events

Use **+ Add manual event** to create an event that isn't on the website calendar — walk-in programs, last-minute additions, or announcements. Each manual event has:

| Field | Notes |
|---|---|
| Date | Can be any date, not just today |
| Start / End time | 24-hour or 12-hour format |
| Title | Shown prominently on the display |
| Location | Optional |
| Category | Controls the color badge on the display |
| Description | Optional — appears on the "Now Showing" card |

Click **Save event** to commit a new event or **Save changes** to commit edits. Unsaved edits show an *unsaved changes* note next to the buttons so nothing is lost silently.

#### Special Events

Special events are full-card promos for upcoming attractions — used to call out things like BioBlitz weekends, star parties, or seasonal programs. They appear on the public display alongside the day's regular events.

Use **+ Add special event** to create one. Each card supports:

| Field | Notes |
|---|---|
| Title, date, time, location, description | Same fields as manual events |
| Image | Upload a poster image (JPEG, PNG, or WebP, up to 25 MB). Ideal source is **480 × 640** (3:4 portrait). |
| **Fit** | `Crop` fills the frame edge-to-edge (may crop). `Fit` shows the entire image (may letterbox). |
| **Frame** | `Frame` draws a gold border around the image. `None` removes the border for a transparent look. |

Card management:
- **Drag the ⋮⋮ handle** on a saved card to reorder it. The order shown in the admin is the order shown on the display.
- **Duplicate** copies the event card so you can build a variant without re-entering fields.
- **Hide from Display** keeps the card in the admin but removes it from the public display. Use this for events you're prepping but don't want live yet. Hidden cards show a *Hidden* badge.
- **Delete** is permanent.
- **Replace image** swaps the poster; **Remove image** clears it.

#### Closing Time

The **Closing time** input sets when the Science Center closes today. Once a time is saved, a **SCI Closes At…** card appears on the public display and stays visible for the rest of the day.

Click **Save closing time** to commit. Edits to the time show an *unsaved changes* note until saved. Leave the field blank to suppress the closing card.

#### Display Configuration

At the bottom of the Public Signage tab:
- **Ticker text** — the scrolling message at the bottom of the public display
- **QR URL** — the URL encoded by the QR code shown on the Star Theater display
- **Dropdown lists** — autocomplete values for title, location, and category fields

The ticker and QR URL show an *unsaved changes* note when edited. Click **Save signage text** to commit.

---

## 4. Display Screens

There are five display endpoints. Each runs in a browser managed by Yodeck on its physical screen.

### Group Schedules

**URL:** `/display/group-schedules.html`
**Location:** Staff/group area

![Group Schedules display](screenshots/display-group-schedules.png)

Shows each visiting school group's full day as a scrolling card — group name, arrival time, their assigned programs, and lunch slot. Cards scroll horizontally in a continuous loop. Data comes from the published CSV.

---

### Star Theater — Public

**URL:** `/display/star-theater-public.html`
**Location:** Star Theater planetarium lobby (public-facing)

![Star Theater public display](screenshots/display-star-theater-public.png)

Portrait 1080×1920 kiosk display. Shows:
- **Now Showing / Next Up** hero card with countdown timer and progress bar
- **Coming Up Today** — a paginated strip of remaining shows
- QR code linking to the full schedule
- Scrolling ticker at the bottom

Data comes from the public signage events (scraped + manual) filtered to the Star Theater. The display auto-advances through pages and updates every 60 seconds.

---

### Star Theater — Group

**URL:** `/display/star-theater-group.html`
**Location:** Star Theater lobby (group-facing variant)

![Star Theater group display](screenshots/display-star-theater-group.png)

Same portrait kiosk format as the public display, but shows group-schedule data — the visiting school groups scheduled in the Star Theater Planetarium rather than public show times.

---

### SCI Live Theater

**URL:** `/display/sci-live.html`
**Location:** SCI Live theater lobby

![SCI Live display](screenshots/display-sci-live.png)

Shows the current and upcoming programs in the SCI Live Theater. Pulls from CSV rows where the location is `SCI Live Theater`. Updates automatically as the clock advances past scheduled times.

---

### Public Signage

**URL:** `/display/public-signage.html`
**Location:** Building-wide public-facing screens

![Public signage display](screenshots/display-public-signage.png)

Shows today's public events as cards with countdowns, a live clock, and a scrolling ticker. Driven by the combined website + manual + special event data from the Public Signage tab. A **SCI Closes At…** card joins the rotation once a closing time is set. Refreshes every 60 seconds.

---

## 5. Previewing Displays

You can preview what any display looks like without going to the physical screen. Add `?preview` to any display URL in your browser:

```
http://localhost:3000/display/group-schedules.html?preview
```

Preview mode shows a banner at the top of the page so you know you're not on a live screen.

**Time override** — The admin portal has a **Time** pill in the top bar. Click it to simulate a different time of day, so you can see what the displays will look like at, say, 2:00 PM before that time arrives. The override only affects your browser — live screens are not impacted.

---

## 6. Updating the Application

Code changes are written on the Windows machine, pushed to GitHub, then pulled to the Pi.

### 6.1 Push to GitHub (Windows)

Open a terminal in the project folder and run:

```
cd "C:\Users\dan.kreipke\Downloads\signageTool"
git add -A
git commit -m "describe your change here"
git push
```

Write the commit message in plain language describing what changed (e.g., `"Make coming-up label white with dark shadow"`).

### 6.2 Deploy to the Raspberry Pi (SSH)

Double-click `ServerSSH.bat` to open a remote session on the Pi, then run:

```
cd ~/digitalSignage
git pull
pm2 restart all
pm2 status
exit
```

| Command | What It Does |
|---|---|
| `cd ~/digitalSignage` | Navigate to the app folder on the Pi |
| `git pull` | Download and apply the latest changes from GitHub |
| `pm2 restart all` | Restart the server so it loads the updated code |
| `pm2 status` | Confirm the app shows **online**. If it shows **errored**, run `pm2 logs` to diagnose. |
| `exit` | Close the SSH session |

---

## 7. Troubleshooting

| Symptom | Resolution |
|---|---|
| Screen is blank or shows an error | Verify `Start_Signage.bat` is running and the terminal is open. Go to `http://localhost:3000/admin` — if it doesn't load, re-run the bat file. |
| Schedule data is stale or missing | Upload a fresh CSV. Confirm column headers match the required format exactly. |
| Display shows yesterday's content | Upload a new CSV. If it persists, wipe the schedule and re-upload. |
| Admin portal won't load | Server may not be running. Re-run `Start_Signage.bat`. |
| Public events not updating | Click **Refresh Now** in the Public Signage tab. If the scrape keeps failing, check the status line for the error message. |
| Pi is unreachable via SSH | Confirm the Pi is on and connected to the SCI network (`192.168.39.73`). Try `ping 192.168.39.73` from a terminal. |
| `pm2` shows **errored** on the Pi | Run `pm2 logs` to see the error. Common causes: missing dependencies (`npm install`) or a syntax error in a recent edit. |
| Display shows wrong content for a location | CSV location values must match exactly: `Star Theater Planetarium`, `SCI Live Theater`, `Innovation Hallway`, or `Full Facility`. |
| Yodeck screen shows wrong page | Log into the Yodeck dashboard and confirm the correct URL is assigned to that screen. |

---

## 8. Quick Reference

| Task | How |
|---|---|
| Start the server | Double-click `Start_Signage.bat` |
| Open Admin Portal | `http://localhost:3000/admin` (opens automatically on server start) |
| Upload daily schedule | Admin → Group Schedules tab → drag CSV onto upload zone → Publish |
| Edit schedule without re-uploading | Admin → Group Schedules tab → Manage Current Schedule |
| Add a walk-in public event | Admin → Public Signage tab → + Add manual event |
| Add a featured event promo (with image) | Admin → Public Signage tab → + Add special event |
| Reorder special event cards | Admin → Public Signage tab → drag the ⋮⋮ handle on a saved card |
| Temporarily hide a special event | Admin → Public Signage tab → Hide from Display on the card |
| Hide a scraped event from display | Admin → Public Signage tab → uncheck the event's Show checkbox |
| Set closing-time card on public display | Admin → Public Signage tab → Closing time → Save closing time |
| Preview a display | Add `?preview` to the display URL in your browser |
| Simulate a different time | Admin portal → Time pill (top bar) → enable and set time |
| SSH into the Pi | Double-click `ServerSSH.bat` |
| Deploy a code update | Push to GitHub → SSH to Pi → `git pull` → `pm2 restart all` |
| Check server health on Pi | `pm2 status` (look for **online**) |
| View server logs on Pi | `pm2 logs` |
