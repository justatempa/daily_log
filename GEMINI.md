# GEMINI.md

This file provides a comprehensive overview of the Daily Log project, its architecture, and development conventions to be used as instructional context for future interactions.

## Project Overview

This is a "daily log" web application built with Next.js, React, and Supabase. It allows users to create, view, edit, and delete daily log entries. It also supports tagging, holidays, and integration with a service called "Memos".

### Technologies

*   **Frontend:** [Next.js](https://nextjs.org/), [React](https://reactjs.org/), [Tailwind CSS](https://tailwindcss.com/)
*   **Backend:** [Supabase](https://supabase.io/) (PostgreSQL database, auth)
*   **Language:** [TypeScript](https://www.typescriptlang.org/)

### Architecture

The application follows a standard Next.js project structure.

*   `app/app/page.tsx`: The main application page, containing the primary UI and logic for displaying and managing entries.
*   `components/`: Contains reusable React components used throughout the application, such as `CalendarPanel`, `TimelineList`, and `AuthForm`.
*   `lib/`: Contains service modules for interacting with the Supabase backend and other external services.
    *   `supabase.ts`: Initializes the Supabase client.
    *   `entries.service.ts`: Handles CRUD operations for log entries.
    *   `tags.service.ts`: Manages tags and their associations with entries.
    *   `holidays.service.ts`: Fetches holiday information.
    *   `memos.service.ts`: Handles integration with the "Memos" service.
*   `database.sql`: Defines the database schema and row-level security policies for the Supabase PostgreSQL database.

## Building and Running

### Prerequisites

*   Node.js and npm
*   A Supabase project with the schema defined in `database.sql`

### Local Development

1.  **Install dependencies:**
    ```bash
    npm install
    ```

2.  **Set up environment variables:**
    Create a `.env.local` file in the `app` directory with your Supabase project URL and anon key:
    ```
    NEXT_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_URL
    NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
    ```

3.  **Run the development server:**
    ```bash
    npm run dev
    ```
    The application will be available at [http://localhost:3000](http://localhost:3000).

### Scripts

*   `npm run dev`: Starts the development server.
*   `npm run build`: Builds the application for production.
*   `npm run start`: Starts the production server.
*   `npm run lint`: Lints the code using ESLint.

## Development Conventions

*   **Coding Style:** The project uses the standard Next.js ESLint configuration for code style.
*   **Testing:** There are currently no tests in the project. TODO: Add tests for critical components and services.
*   **Data Fetching:** Data is fetched from the Supabase backend using the service modules in the `lib/` directory.
*   **State Management:** The application uses React's built-in state management (`useState`, `useEffect`) for managing component-level state.
*   **Authentication:** User authentication is handled by Supabase Auth. The `AuthProvider` component in `components/AuthProvider.tsx` provides authentication context to the application.
*   **Styling:** The project uses Tailwind CSS for styling. Utility classes should be used whenever possible.
