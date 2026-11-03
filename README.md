# BookNook — Backend API

A RESTful backend API for **BookNook**, an online library platform where users can add books, manage their own listings, borrow available copies, and track their borrowing history.

## Live Application

- **Frontend:** https://booknook-mehedilabs.vercel.app/
- **Backend API:** https://booknook-server-eight.vercel.app/
- **Frontend Repository:** https://github.com/mehedilabs/booknook-client
- **Backend Repository:** https://github.com/mehedilabs/booknook-server

## Overview

The BookNook backend provides REST APIs for book management and borrowing operations. It uses MongoDB for data storage, Better Auth JWT verification for authentication, and Cloudinary for book cover image uploads.

## Features

- **Book Management:** Retrieve, add, update, and delete books.
- **Ownership Protection:** Users can update or delete only their own books.
- **Borrowing System:** Borrow available books and prevent duplicate active borrow records.
- **Return System:** Return borrowed books and automatically restore available copies.
- **Borrow History:** Retrieve borrowing records for the authenticated user.
- **JWT Authentication:** Verify authentication tokens before protected operations.
- **Image Uploads:** Upload and manage book cover images using Cloudinary.
- **Input Validation:** Validate book data, categories, IDs, and copy quantities.
- **Database Integration:** Store books and borrowing records in MongoDB.

## Technology Stack

| Technology      | Purpose                   |
| --------------- | ------------------------- |
| Node.js         | JavaScript runtime        |
| Express.js      | REST API framework        |
| TypeScript      | Type safety               |
| MongoDB         | Database                  |
| Better Auth JWT | Authentication            |
| JOSE            | JWT verification          |
| Cloudinary      | Image storage             |
| Multer          | File uploads              |
| CORS            | Cross-origin requests     |
| dotenv          | Environment configuration |

## API Documentation

**Base URL**

```text
https://booknook-server-eight.vercel.app
```

### Books

| Method | Endpoint     | Description             | Authentication |
| ------ | ------------ | ----------------------- | -------------- |
| GET    | `/books`     | Retrieve all books      | No             |
| GET    | `/books/:id` | Retrieve a single book  | No             |
| POST   | `/books`     | Add a new book          | Required       |
| PATCH  | `/books/:id` | Update an existing book | Required       |
| DELETE | `/books/:id` | Delete a book           | Required       |

**Note:** The `GET /books` endpoint also supports `?mine=true` to retrieve the authenticated user's own books. This option requires authentication.

### Borrowing

| Method | Endpoint       | Description                           | Authentication |
| ------ | -------------- | ------------------------------------- | -------------- |
| POST   | `/borrows`     | Borrow a book                         | Required       |
| GET    | `/borrows`     | Retrieve the user's borrowing history | Required       |
| DELETE | `/borrows/:id` | Return a borrowed book                | Required       |

### Authentication

Protected endpoints require a valid JWT access token in the request header.

```http
Authorization: Bearer YOUR_ACCESS_TOKEN
```

The backend verifies tokens using Better Auth's JWKS endpoint and checks user ownership before allowing book modification or deletion.

**Access Control:** Public book-reading endpoints do not require authentication. Protected operations require a valid token, and users can modify or delete only their own books.

## Book Categories

The supported book categories are:

- Fiction
- Science
- History
- Kids
- Others

## Image Upload

Book cover images are uploaded to Cloudinary.

- Supported formats: JPG, PNG, WEBP
- Maximum file size: 5 MB
- Cloudinary folder: `booknook/books`

## Getting Started

### Prerequisites

- Node.js
- npm
- MongoDB database
- Cloudinary account
- Better Auth configured on the frontend

### 1. Clone the Repository

```bash
git clone https://github.com/mehedilabs/booknook-server.git
cd booknook-server
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the project root:

```env
PORT=5000
MONGODB_URI=your_mongodb_connection_string
BETTER_AUTH_URL=http://localhost:3000

CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
```

Replace the placeholder values with your own credentials.

### 4. Run the Development Server

```bash
npm run dev
```

The backend will run at:

```text
http://localhost:5000
```

### 5. Build for Production

```bash
npm run build
```

### 6. Start the Production Server

```bash
npm start
```

## Database

The application uses MongoDB with the database name:

```text
booknook_library
```

Main collections:

- `books` — Stores book information and ownership details.
- `borrows` — Stores borrowing records and return status.

## Project Structure

```text
booknook-server/
├── src/
│   └── index.ts
├── dist/
├── .env
├── .gitignore
├── package.json
├── package-lock.json
└── tsconfig.json
```

## Security

Never commit `.env` files, database credentials, Cloudinary secrets, or authentication tokens to GitHub. Keep all sensitive environment variables private and configure them securely in your deployment environment.

## Related Project

**BookNook Frontend:** https://github.com/mehedilabs/booknook-client

---

Built as part of a full-stack online library project.
