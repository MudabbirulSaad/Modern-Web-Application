<div align="center">

# SwinDirectory

### COS30043 Interface Design and Development
### Building a Modern Web Application

<p>
  <strong>Mudabbirul Saad</strong><br>
  Student ID: <strong>105281389</strong>
</p>

<p>
  Vue 3 / Vite / Bootstrap 5 / Express / MariaDB / Pinia / Jest
</p>

</div>

---

## Overview

SwinDirectory is a Swinburne-inspired course and tutor directory. It is designed around a realistic student workflow: browse courses, compare teaching staff, read reviews, save favourites, and use a guided advisor to find suitable course options.

The application supports three levels of access:

- Guests can browse public course, tutor, department, and advisor content.
- Students can write reviews, upvote useful feedback, and save favourite courses or tutors.
- Admins can manage courses, tutors, course-tutor assignments, and user roles from a dedicated dashboard.

This project was built to satisfy the COS30043 modern web application brief, including Vue 3, Bootstrap, Vite, Vue Router, persistent storage, RESTful backend APIs, authentication, CRUD features, pagination, responsive design, and an advanced feature.

## Key Features

| Feature | Description |
| --- | --- |
| Course directory | Search, sort, filter, paginate, and open detailed course profiles. |
| Tutor directory | Browse teaching staff by name or staff affiliation and view tutor details. |
| Departments | Discover courses through course-led department pages. |
| Reviews | Students can submit ratings and comments for courses and tutors. |
| Upvotes | Students can mark helpful reviews, with protection against self-upvoting. |
| Favourites | Students can save courses and tutors to their dashboard. |
| Admin dashboard | Admins can create, edit, and delete course and tutor records. |
| Role management | Admins can promote students and demote eligible admins, while the Primary Admin is protected. |
| AI Course Advisor | A guided recommendation flow that suggests courses from app-owned data. |

## Advanced Feature

The advanced feature is the AI Course Advisor.

The advisor asks for study preferences, selects relevant course candidates from the local database, and returns course recommendations with visible evidence and limitations. If a Groq API key is configured, the backend can use Groq to rank and explain the candidates. If no key is available, the advisor still works through a deterministic local fallback.

The LLM integration is deliberately backend-only. The frontend never receives API keys, and the backend validates that recommendations stay grounded in supplied course, tutor, review, rating, and favourite data.

## Requirement Coverage

| Project requirement | How it is covered |
| --- | --- |
| At least 10 interconnected pages | Home, Courses, Course Detail, Tutors, Tutor Detail, Departments, Advisor, Register, Login, Student Dashboard, Admin Dashboard. |
| Collection and detail views | Courses and Tutors are displayed as collections with separate detail pages. |
| Search and sorting | Directory pages support search, sorting, filtering, and pagination. |
| Registration and login | Users can register, log in, restore sessions, and see role-specific access. |
| Different visibility by auth state | Guests, Students, and Admins see different navigation and actions. |
| Authorised CRUD | Admins manage Courses and Tutors through protected backend routes. |
| Social interaction | Reviews, review upvotes, and favourites are available to Students. |
| Persistent data | MariaDB stores users, courses, tutors, reviews, upvotes, favourites, and assignments. |
| Vue Router | Application routes and auth guards are defined in `src/router`. |
| Component architecture | Shared components and feature workflows are split across `src/components`, `src/admin`, `src/advisor`, `src/reviews`, and related modules. |
| Forms and validation | Auth, review, admin, assignment, and advisor forms include validation and error states. |
| Responsive design | Public pages, dashboards, advisor screens, and admin management views are responsive across mobile, tablet, and desktop layouts. |

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | Vue 3, Vite, Bootstrap 5, Vue Router, Pinia |
| Backend | Express, Node.js, RESTful route modules |
| Database | MariaDB |
| Authentication | JWT stored in HttpOnly cookies |
| Testing | Jest, Supertest, focused frontend regression tests |
| Optional AI integration | Groq API through backend-only service code |

## Project Structure

```text
backend/
  app.js                 Express app setup
  index.js               Server entry point
  db.js                  MariaDB connection pool
  schema.sql             Database schema
  routes/                Auth, Courses, Tutors, Reviews, Favorites, Advisor, Admin
  middleware/auth.js     Authentication and admin guards

src/
  admin/                 Admin API and workflow state
  advisor/               Course Advisor logic and presentation
  components/            Shared Vue components
  directory/             Directory browsing behaviour
  favorites/             Favourite API and workflow logic
  reviews/               Review API and workflow logic
  router/                Routes and auth guards
  store/                 User session, role, and theme store
  views/                 Page-level Vue views
```

## Local Setup

Install dependencies:

```bash
npm install
```

Create a `.env` file:

```bash
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=password
DB_NAME=modern_web_app
JWT_SECRET=replace-with-a-development-secret

# Optional
GROQ_API_KEY=
GROQ_MODEL=openai/gpt-oss-20b
```

Initialise and seed the database:

```bash
npm run db:init
npm run db:seed
```

Run the application:

```bash
npm run dev:all
```

Default development URLs:

| Surface | URL |
| --- | --- |
| Frontend | `http://localhost:5173` |
| Backend health check | `http://localhost:3000/api/health` |

## Available Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite frontend. |
| `npm run server` | Start the Express backend. |
| `npm run dev:all` | Start frontend and backend together. |
| `npm run build` | Build the frontend for production. |
| `npm run preview` | Preview the production build. |
| `npm run db:init` | Apply the database schema. |
| `npm run db:seed` | Seed demo data. |
| `npm test` | Run the test suite. |

## Testing

The project includes regression coverage for backend routes, authentication, role guards, reviews, favourites, directory browsing, advisor behaviour, admin workflows, and important responsive UI states.

```bash
npm test
npm run build
```

## Domain Notes

- Course Department refers to the discovery category attached to Course records.
- Tutor staff affiliation refers to the academic unit shown on Tutor profiles and admin Tutor records.
- Tutor records still store this value in the existing `department` field.
- The first registered user becomes the first Admin.
- The Primary Admin is the user with the lowest `Users.id` and cannot be demoted.
- Admin user management is role-only; it does not include profile editing, password reset, review moderation, favourite inspection, or user deletion.

## Security and Data Handling

- Passwords are hashed with bcrypt.
- JWT authentication uses HttpOnly cookies.
- Admin permissions are enforced on the backend.
- Review input is sanitised before storage.
- AI Advisor responses are constrained to supplied application data.

---

<div align="center">

Built as a full-stack Vue and Express application for COS30043.

</div>
