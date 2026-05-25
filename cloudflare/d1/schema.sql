PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS Tutors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  department TEXT NOT NULL,
  bio TEXT NOT NULL,
  normalized_name TEXT GENERATED ALWAYS AS (LOWER(TRIM(name))) STORED,
  normalized_department TEXT GENERATED ALWAYS AS (LOWER(TRIM(department))) STORED,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (normalized_name, normalized_department)
);

CREATE TRIGGER IF NOT EXISTS trg_tutors_updated_at
AFTER UPDATE ON Tutors
FOR EACH ROW
BEGIN
  UPDATE Tutors SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

CREATE TABLE IF NOT EXISTS Users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('admin', 'student'))
);

CREATE TABLE IF NOT EXISTS Courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  department TEXT NOT NULL,
  description TEXT NOT NULL,
  normalized_title TEXT GENERATED ALWAYS AS (LOWER(TRIM(title))) STORED,
  normalized_department TEXT GENERATED ALWAYS AS (LOWER(TRIM(department))) STORED,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (normalized_title, normalized_department)
);

CREATE TRIGGER IF NOT EXISTS trg_courses_updated_at
AFTER UPDATE ON Courses
FOR EACH ROW
BEGIN
  UPDATE Courses SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

CREATE TABLE IF NOT EXISTS Course_Tutors (
  course_id INTEGER NOT NULL,
  tutor_id INTEGER NOT NULL,
  PRIMARY KEY (course_id, tutor_id),
  FOREIGN KEY (course_id) REFERENCES Courses(id) ON DELETE CASCADE,
  FOREIGN KEY (tutor_id) REFERENCES Tutors(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS Reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('tutor', 'course')),
  entity_id INTEGER NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL,
  upvotes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_reviews_entity ON Reviews(entity_type, entity_id, upvotes, created_at);

CREATE TABLE IF NOT EXISTS Review_Upvotes (
  review_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (review_id, user_id),
  FOREIGN KEY (review_id) REFERENCES Reviews(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS Favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('tutor', 'course')),
  entity_id INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
  UNIQUE (user_id, entity_type, entity_id)
);

INSERT INTO Tutors (id, name, department, bio)
VALUES
  (1, 'Dr Maya Chen', 'Computer Science', 'Specialises in web development, interface design, and human-computer interaction.'),
  (2, 'Prof Liam Patel', 'Information Systems', 'Teaches database design, enterprise systems, and data-driven application development.'),
  (3, 'Dr Amelia Wright', 'Software Engineering', 'Focuses on agile delivery, software architecture, and project-based learning.')
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  department = excluded.department,
  bio = excluded.bio;

INSERT INTO Courses (id, title, department, description)
VALUES
  (1, 'COS30043 Interface Design and Development', 'Computer Science', 'Design and build responsive web interfaces using modern frontend practices.'),
  (2, 'COS20031 Database Design', 'Information Systems', 'Model, normalize, and query relational data for software applications.'),
  (3, 'SWE30003 Software Architectures and Design', 'Software Engineering', 'Explore architectural patterns, design trade-offs, and maintainable software structures.')
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  department = excluded.department,
  description = excluded.description;

INSERT INTO Course_Tutors (course_id, tutor_id)
VALUES
  (1, 1),
  (2, 2),
  (3, 3),
  (1, 3)
ON CONFLICT(course_id, tutor_id) DO NOTHING;
