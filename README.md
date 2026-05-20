# Virtual Classroom – Frontend

## Introduction

Virtual Classroom is an interactive, real-time learning platform that brings teachers and students together. Teachers can create courses, start live sessions, draw and annotate on a whiteboard, upload PDF slides, and award Brownie Points to students. Students join sessions to follow the teacher's board via letter-code or QR-Code, take personal private notes on their own whiteboard, and chat with everyone in the room. Thanks to WebSocket everything happens in real time. Our motivation behind the project is to make remote learning as close to an in-person classroom experience as possible, with a simple and appealing UI.

---

## Technologies

| Layer | Technology |
|---|---|
| Framework | [Next.js 15](https://nextjs.org/) (App Router) with [React 19](https://react.dev/) |
| Language | [TypeScript 5](https://www.typescriptlang.org/) (strict mode) |
| UI Components | [Ant Design v6](https://ant.design/) |
| Icons | [Lucide React](https://lucide.dev/) |
| Drawing Engine | HTML5 Canvas API |
| PDF Rendering | [pdfjs-dist](https://mozilla.github.io/pdf.js/) |
| PDF Export | [jsPDF](https://github.com/parallax/jsPDF) |
| Real-time Comms | WebSocket (native browser API) |
| Session Storage | React Context + localStorage |
| Linting / Formatting | [Deno lint](https://deno.com/) / [Deno fmt](https://deno.com/) |
| Build | [Turbopack](https://turbo.build/pack) (dev), Next.js standalone (prod) |
| Containerisation | Docker |

---

## High-Level Components

The project offers a lot of functionalities and components, below the five most important components are listed, which all work together.

### 1. Authentication & User Context
[`app/login/page.tsx`](app/login/page.tsx) · [`app/register/page.tsx`](app/register/page.tsx) · [`app/contexts/UserContext.tsx`](app/contexts/UserContext.tsx)

Handles user registration (student or teacher role), login, and global session state. `UserContext` is a React Context provider that stores the authenticated user object (id, name, role, token) and backs it up in `localStorage` so the session survives a page refresh. All other components consume this context to decide what to render and which API token to send.

### 2. Teacher and Student Dashboard
[`app/teacher-dashboard/page.tsx`](app/teacher-dashboard/page.tsx) · [`app/student-dashboard/page.tsx`](app/student-dashboard/page.tsx)

The teacher's home screen after login. It displays all courses owned by the teacher as cards, each showing the course name, participant count, and a generated join code / QR code that students can scan. They can also share the code via mail. Teachers can create new courses, edit or delete existing ones, and navigate into a course to start a session and change their credentials.
The student has an equivalent home screen. It lists all courses the student is enrolled in and provides a join-by-code flow ([`app/joinCourse/page.tsx`](app/joinCourse/page.tsx)) to enroll in new ones. From here students tap into a course page, join a new course or change their credentials.

### 3. Course Page
[`app/users/[id]/courses/[courseId]/page.tsx`](app/users/%5Bid%5D/courses/%5BcourseId%5D/page.tsx)

The page for the content of a specific course, reached from both dashboards. On the left, there is a chronological list of all sessions belonging to the course (live sessions float to the top, ended ones are listed below). Teachers can create a new session here with an optionally pre-loading a PDF. This immediately starts the session and redirects them to the whiteboard. Students see a **Join** button next to a live session and a **View PDF** button for ended ones, which exports the saved teacher-whiteboard snapshot as a downloadable PDF. On the right, a persistent leaderboard displays all enrolled students ranked by their accumulated brownie points, with a podium graphic for the top three.

### 4. Live Session Page
[`app/session/[courseId]/page.tsx`](app/session/%5BcourseId%5D/page.tsx)

The live classroom with the whiteboard. It renders a split-view layout: the teacher's whiteboard (read-only for students, full-control for the teacher) and each student's personal private whiteboard side by side. The session page also hosts the real-time chat panel, the student list with brownie-point distribution for the teacher, uploaded files (by the teacher or student themselves), the multi-mode, where every participant can write onto the teachers whiteboard and session start/end management.

### 5. WhiteboardCanvas
[`app/components/WhiteboardCanvas.tsx`](app/components/WhiteboardCanvas.tsx)

The drawing engine used by both the teacher board and each student's personal whiteboard. It supports freehand pen drawing, an eraser, rich-text elements (bold / italic / underline), clear, and a 40-step undo/redo history. PDF pages can be loaded as a background layer so participants can annotate slides. The session page can trigger snapshot exports and receive remote strokes from WebSocket events without rerendering.

---

## Launch & Deployment

### Prerequisites

- macOS, Linux, or WSL (Windows users: install WSL first, then open a WSL/Ubuntu terminal for all commands below)
- `git` — verify with `git --version`
- The backend server must be running (default: `http://localhost:8080`). See the [server repository](https://github.com/MoritzDav/sopra-fs26-group-04-server) for setup instructions.

### Local setup

```bash
# 1. Clone the repository
git clone https://github.com/MoritzDav/sopra-fs26-group-04-client.git
cd sopra-fs26-group-04-client

# 2. Run the automated setup script (installs Nix, Node, Deno, and npm dependencies)
source setup.sh

# 3. Start the development server — live at http://localhost:3000
npm run dev
```

### Available commands

```bash
npm run dev     # Start dev server with hot-reload (Turbopack)
npm run build   # Create an optimised production build
npm start       # Serve the production build on http://localhost:3000
npm run lint    # Check the codebase for errors (Deno lint)
npm run fmt     # Auto-format the codebase (Deno fmt) — run before every push
```

### Environment variables

| Variable | Description | Default |
|---|---|---|
| `NEXT_PUBLIC_PROD_API_URL` | Backend API base URL in production | unset (falls back to `localhost:8080` in dev) |

### Tests

Test the frontend by locally running the branch (also make sure that the backend is running) and test out the functionality in a browser. Issues are shown in the left bottom corner.
After your branch was merged with the main branch test the functionality on vercel with this link: https://sopra-fs26-group-04-client.vercel.app/

### Docker deployment

The repository ships with a [`Dockerfile`](Dockerfile). Every push to `main` automatically builds and pushes the image to DockerHub via GitHub Actions (requires `dockerhub_username`, `dockerhub_password`, and `dockerhub_repo_name` secrets in the repository settings).

To run the published image locally:

```bash
docker pull <dockerhub_username>/<dockerhub_repo_name>
docker run -p 3000:3000 <dockerhub_username>/<dockerhub_repo_name>
```

### Working agreements

The following agreements are there to make sure that every team member feels welcome in the group and to ensure efficient work.

- Allow yourself to share what went wrong (we can learn from it)
- Explain your code to the others (better awareness for each others work)
- There are no stupid questions!
- Explain things with patience (Don't get annoyed if anyone doesn't understand something instantly, we're trying our best)
- Communicate on what you work on and share your deadline
- Let others know when fixed or changed something in their code
- Deadlines are to be held up
- Focus on the task ahead
- Stay calm and friendly towards your team members
- Comment your code (at least every block/function)
- Attend to regular meetings

Open tasks can be found on Github: https://github.com/MoritzDav/sopra-fs26-group-04-client/issues
Issues must always be linked to pull requests and closed, after they are done.
Work on any other branch but never on main.
We assign someone else for the pull request, this person will review the code.
To have an overview on what we worked on, we write our commits into the file `contributions.md`.


---

## Illustrations

### Main user flows

**Teacher flow**

1. A teacher registers with the *Teacher* role or logs in and gets redirected to the Teacher Dashboard.
2. They create a course and the platform generates a shareable join code and QR code.
3. They start a live session for a course (from the course page). The Session Page opens with the whiteboard.
4. The teacher draws, annotates, or uploads a PDF with slides. All strokes are broadcast in real time to every connected student.
5. The teacher can award brownie points to students from the participant list on the right-hand side.
6. The teacher can enable the multimode where everyone can draw on the teachers whiteboard or switch to the whiteboard of a student (read-only).
7. When the lecture is over, the teacher ends the session and returns to the dashboard.

**Student flow**

1. A student registers with the *Student* role, or logs in and gets redirected to the Student Dashboard.
2. They join a course by entering the course code (or scanning the QR code) on the Join Course page.
3. When the teacher starts a session, the student opens it from their dashboard (inside the course page).
4. On the Session Page the student sees the teacher's board updating live on the left. On the right is their own private whiteboard where they can take notes.
5. The student can chat with the whole class and teacher via the chat panel.
6. Upon leaving the student can decide if they want to save their notes as a PDF.
7. Personal notes and the teacher's board state are saved as snapshots so students can review them after the session ends.

---

## Roadmap

The following features would be valuable additions for new contributors:

1. **Session recording & replay:** Store the chronological sequence of whiteboard strokes and replay them as an animation after the session. Students who missed a live session could watch it back at their own pace, similar to a lecture recording.

2. **Raise-hand / polling system:** A button for students to flag that they have a question, surfacing a visual indicator on the teacher's view. Extending this to live multiple-choice polls (teacher sends a question, students pick an answer, results shown as a bar chart) would make sessions significantly more interactive.

3. **Breakout rooms:** Allow the teacher to split the class into small groups, each with their own shared whiteboard and chat. The teacher can then visit individual rooms. This mirrors a common in-person classroom activity and would require per-group WebSocket channels and routing.

4. **Simple Sessions:** Students can start a session by themselves with friends where the whiteboard works similar to the multimode.

5. **Editable profile pictures:** Every user can choose their own profile picture by drawing it themselves, upload an image or choose a customizable Avatar.

6. **Advanced Brownie Points System:** Students get Brownie Points automatically by being present in a session. They level up with a certain amount of Brownie Points, which is visible in their profile.
---

## Authors and Acknowledgment

| Name                | GitHub                                                 | Matrikelnumber |
|---------------------|--------------------------------------------------------|----------------|
| Antonio Afram       | [@AQuant1](https://github.com/AQuant1)                 | 23-729-775     |
| Michelle Brauch     | [@Meimira](https://github.com/Meimira)                 | 24-748-618     |
| Moritz Davinghausen | [@MoritzDav](https://github.com/MoritzDav)             | 24-722-795     |
| Valya Sorokivska    | [@ValyaSorokivska](https://github.com/ValyaSorokivska) | 24-743-247     |
| Lars Pataky         | [@bablandan](https://github.com/bablandan)             | 19-923-697     |

This project was created as part of the **Software Engineering Lab (SoPra FS26)** course at the University of Zurich. We thank our teaching assistants and the course organisers for their guidance and special thanks to our TA Sergi for the feedback throughout the semester.

---

## License

This project is licensed under the [MIT License](LICENSE).
