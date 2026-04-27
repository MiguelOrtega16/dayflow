# DayFlow

A shared daily planner — track tasks, habits, events, and goals, and share your progress with others in real time.

Built with **Next.js 15**, **Supabase**, and **Tailwind CSS**.

---

## Features

- 📅 **Calendar view** — month and week modes, Colombian holidays, day-by-day planning
- ✅ **Activities** — tasks, habits, events, notes with status tracking (Por hacer → En progreso → Completado)
- 🎯 **Goals** — long-term outcomes with task-based progress bars
- 👥 **Shared calendars** — invite others to view your calendar (pending acceptance flow with notifications)
- 🤝 **Activity invitations** — invite specific people to join an activity; each tracks their own status independently
- 💬 **Comments** — comment on shared public activities
- 🔔 **Notifications** — real-time updates for status changes, invitations, and calendar shares
- 📸 **Evidence** — attach an image when marking a task in-progress or done
- 📊 **Stats** — completion heatmap, streaks, category and status breakdowns
- 🌙 **Dark / light mode**
- 📱 **Responsive** — optimised for both mobile and desktop

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Database & Auth | Supabase (PostgreSQL + RLS + Realtime) |
| Styling | Tailwind CSS |
| Language | TypeScript |
| Deployment | Vercel |

---

## Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/dayflow.git
cd dayflow
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up Supabase

1. Create a free project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the full contents of [`schema.sql`](./schema.sql)
3. Go to **Storage → New bucket**, create a bucket called **`activity-evidence`** with **Public = ON**
4. *(Optional)* Go to **Authentication → Settings** and turn off **"Enable email confirmations"** for easier local testing

### 4. Configure environment variables

```bash
cp .env.example .env.local
```

Edit `.env.local` with your Supabase credentials (found at **Supabase → Project Settings → API**):

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### 5. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Project Structure

```
dayflow/
├── app/
│   ├── auth/              # Login and signup pages
│   ├── dashboard/
│   │   ├── page.tsx       # Calendar (main view)
│   │   ├── overview/      # Today's summary
│   │   ├── goals/         # Goals tracker
│   │   ├── stats/         # Productivity stats & heatmap
│   │   ├── people/        # Calendar sharing & invitations
│   │   └── settings/      # Profile settings
│   ├── globals.css
│   └── layout.tsx
├── components/
│   ├── activities/        # Activity create/edit modal
│   ├── calendar/          # Calendar grid, day cell, detail panel
│   └── layout/            # Sidebar, shell, notification bell
├── lib/
│   ├── api.ts             # All Supabase queries and mutations
│   ├── holidays.ts        # Colombian public holidays
│   └── utils.ts           # Helpers, status config, colour maps
├── types/
│   └── index.ts           # Shared TypeScript interfaces
├── schema.sql             # Complete Supabase database schema (run this first)
└── .env.example           # Environment variable template
```

---

## Database Schema

Run [`schema.sql`](./schema.sql) in the Supabase SQL editor to create all tables, RLS policies, triggers, and grants.

| Table | Purpose |
|---|---|
| `profiles` | Extended user info (name, colour, avatar) |
| `activities` | Tasks, habits, events, notes |
| `goals` | Long-term objectives |
| `shared_calendars` | Calendar sharing (pending → accepted / declined) |
| `activity_invitations` | Per-activity invitations |
| `activity_comments` | Comments on public activities |
| `notifications` | Real-time in-app notifications |

Row Level Security is enabled on every table.

---

## Deployment (Vercel — recommended)

1. **Push this repo to GitHub** (see steps below)
2. Go to [vercel.com](https://vercel.com) → **New Project** → import the repo
3. Add environment variables in Vercel's dashboard:

   | Variable | Where to find it |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API |

4. Click **Deploy** — done in ~2 minutes

5. After deploy, go to **Supabase → Authentication → URL Configuration**:
   - **Site URL** → your Vercel URL (e.g. `https://dayflow.vercel.app`)
   - **Redirect URLs** → add `https://dayflow.vercel.app/auth/callback`

Every `git push` to `main` will automatically trigger a new deployment.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon (public) key |

---

## License

MIT
