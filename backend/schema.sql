CREATE TABLE IF NOT EXISTS Tutors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  department VARCHAR(255) NOT NULL,
  bio TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO Tutors (id, name, department, bio)
VALUES
  (1, 'Dr Maya Chen', 'Computer Science', 'Specialises in web development, interface design, and human-computer interaction.'),
  (2, 'Prof Liam Patel', 'Information Systems', 'Teaches database design, enterprise systems, and data-driven application development.'),
  (3, 'Dr Amelia Wright', 'Software Engineering', 'Focuses on agile delivery, software architecture, and project-based learning.')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  department = VALUES(department),
  bio = VALUES(bio);

CREATE TABLE IF NOT EXISTS Courses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  department VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Course_Tutors (
  course_id INT NOT NULL,
  tutor_id INT NOT NULL,
  PRIMARY KEY (course_id, tutor_id),
  CONSTRAINT fk_course_tutors_course
    FOREIGN KEY (course_id) REFERENCES Courses(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_course_tutors_tutor
    FOREIGN KEY (tutor_id) REFERENCES Tutors(id)
    ON DELETE CASCADE
);

INSERT INTO Courses (id, title, department, description)
VALUES
  (1, 'COS30043 Interface Design and Development', 'Computer Science', 'Design and build responsive web interfaces using modern frontend practices.'),
  (2, 'COS20031 Database Design', 'Information Systems', 'Model, normalize, and query relational data for software applications.'),
  (3, 'SWE30003 Software Architectures and Design', 'Software Engineering', 'Explore architectural patterns, design trade-offs, and maintainable software structures.')
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  department = VALUES(department),
  description = VALUES(description);

INSERT INTO Course_Tutors (course_id, tutor_id)
VALUES
  (1, 1),
  (2, 2),
  (3, 3),
  (1, 3)
ON DUPLICATE KEY UPDATE
  course_id = VALUES(course_id),
  tutor_id = VALUES(tutor_id);
